"""Daily content generation — the engine behind the Auto-generate page.

A single asyncio task (mirrors ``app/scheduler.py``'s delivery worker) that
wakes every minute and, for each enabled ``Automation`` whose ``run_at`` on the
Phnom Penh clock has passed today and hasn't run yet today, writes that
brand's batch of ideas as ``Draft`` rows dated onto today's calendar slot.

``run_automation`` is the shared core — the worker calls it on schedule, and
``POST /api/views/auto/{id}/run-now`` calls it on demand for a same-day test.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, date, datetime, time, timedelta, timezone
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.content_ai import ContentAIError, fact_check, generate_ideas, image_prompt_for_idea
from app.learning import brand_learnings, learned_time
from app.database import SessionLocal
from app.models import Automation, Brand, Channel, Draft, Post, PostTarget, Product, Video

log = logging.getLogger("app.content_scheduler")

# Same fixed-offset clock every schedule-facing view in this app uses.
PHNOM_PENH = timezone(timedelta(hours=7))

# Auto-media images render up to this many at a time — each is a 20-60s+
# provider call, so serializing the whole batch is the dominant cost of a run;
# a wider cap than this risks hitting the image quota (HTTP 429) harder.
_MAX_PARALLEL_MEDIA = 3


# report(percent, step label, percent expected by the next report) — lets a
# background run show live progress (see start_background_run below).
Report = Callable[[int, str, int], None]


def _no_report(_pct: int, _step: str, _upto: int) -> None:
    pass


def _today() -> date:
    return datetime.now(PHNOM_PENH).date()


def _default_time_for(platform_slug: str) -> time:
    """Mirrors the composer's own defaults (NewPostPage.jsx's defaultTimeFor) —
    same per-platform posting times whether a human or the automation picks them."""
    if platform_slug == "facebook":
        return time(19, 30)
    if platform_slug == "tiktok":
        return time(20, 0)
    return time(20, 30)


def _next_slot(platform_slug: str, now: datetime, override: time | None = None) -> datetime:
    t = override or _default_time_for(platform_slug)
    candidate = now.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate


class _AutoBrand(NamedTuple):
    id: int
    workspace_id: int
    name: str
    lang: str
    slug: str


class _AutoProduct(NamedTuple):
    name: str
    description: str | None


def _brand_snapshot(brand: Brand) -> _AutoBrand:
    return _AutoBrand(brand.id, brand.workspace_id, brand.name, brand.lang, brand.slug)


def _product_snapshot(product: Product) -> _AutoProduct:
    return _AutoProduct(product.name, product.description)


def _generate_media_for(
    brand: Brand | _AutoBrand, idea: dict, products: list[Product | _AutoProduct]
) -> int | None:
    """Best-effort: render an image for this idea and store it as a Video
    row, returning its id — or None if generation fails, so the caller falls
    back to a plain text draft rather than losing the idea entirely.

    Also records a GenerationJob (kind="image") alongside it, same as the AI
    agent's own "Generate image" button (app/video.py's create_image) does —
    the Library page (/views/library) reads GenerationJob rows, not Video
    rows directly, so skipping this would make an auto-generated image real
    and usable everywhere except invisible in the Library."""
    from app import video as video_gen
    from app.database import SessionLocal
    from app.media import store_blob
    from app.models import GenerationJob

    prompt = image_prompt_for_idea(brand.name, brand.lang, idea, products)
    try:
        with video_gen.image_slot():
            provider, blob, usage = video_gen.generate_image(prompt, "9:16")
    except video_gen.VideoGenError as exc:
        log.warning("auto-media image generation failed for brand %s: %s", brand.id, exc)
        return None

    db = SessionLocal()
    try:
        url = store_blob(db, blob, ".png", "image/png")
        job = GenerationJob(
            workspace_id=brand.workspace_id,
            brand_id=brand.id,
            kind="image",
            prompt=prompt,
            aspect_ratio="9:16",
            seconds=0,
            provider=provider,
            status="succeeded",
            input_tokens=usage.get("input", 0),
            output_tokens=usage.get("output", 0),
            total_tokens=usage.get("total", 0),
        )
        db.add(job)
        db.flush()
        v = Video(
            workspace_id=brand.workspace_id,
            brand_id=brand.id,
            filename=f"auto-{brand.slug}-{int(datetime.now(PHNOM_PENH).timestamp())}.png",
            resolution="1024x1536",
            size_bytes=len(blob),
            source="ai",
            tag="ai-auto-image",
            url=url,
        )
        db.add(v)
        db.flush()
        job.video_id = v.id
        db.commit()
        db.refresh(v)
        return v.id
    finally:
        db.close()


def schedule_draft_as_post(db: Session, draft: Draft) -> Post:
    """Turn an auto-media draft into a real, queued Post — every channel the
    brand has actually connected, at that platform's usual posting time
    (today's slot if it hasn't passed yet, else tomorrow's). Raises
    ContentAIError if there's no connected channel to actually post it to.

    Flushes but does not commit — callers own the transaction (a single
    draft approved by hand commits right away; a whole automation batch
    commits once at the end, after ``last_run_on`` advances, to keep that
    write atomic — see run_automation)."""
    from app.media import kind_for

    automation = db.scalar(select(Automation).where(Automation.brand_id == draft.brand_id))

    channels = db.scalars(
        select(Channel).where(Channel.brand_id == draft.brand_id, Channel.status == "live")
    ).all()

    allowed_ids = automation.auto_channel_ids if automation else None
    if allowed_ids:
        channels = [c for c in channels if c.id in set(allowed_ids)]

    video = db.get(Video, draft.video_id) if draft.video_id else None
    kind = kind_for(video.url, None) if video and video.url else None
    if kind == "image":
        # TikTok's publish path rejects an image outright — don't queue a
        # guaranteed failure there.
        channels = [c for c in channels if (c.platform.slug if c.platform else "") != "tiktok"]

    if not channels:
        raise ContentAIError(
            f"“{draft.title}” has no allowed, connected channel to post to "
            "(check the channel picker on Auto-generate, or that TikTok isn't "
            "the only one — it needs a video, not an image)."
        )

    post = Post(brand_id=draft.brand_id, video_id=draft.video_id, title=draft.title, status="scheduled")
    db.add(post)
    db.flush()

    now = datetime.now(PHNOM_PENH)
    override_time = automation.post_at if automation else None
    # No fixed time set: use each platform's best-performing hour for this
    # brand when there's enough evidence (app/learning.py), else the defaults.
    learned = (
        brand_learnings(db, draft.brand_id)
        if automation and automation.learn_from_results and not override_time
        else None
    )
    for ch in channels:
        slug = ch.platform.slug if ch.platform else ""
        db.add(
            PostTarget(
                post_id=post.id,
                channel_id=ch.id,
                caption=draft.body,
                title=draft.title,
                scheduled_for=_next_slot(slug, now, override_time or (learned_time(learned, slug) if learned else None)),
                status="queued",
            )
        )
    db.flush()
    return post


def _write_batch(
    db: Session, automation: Automation, today: date, report: Report = _no_report
) -> list[Draft]:
    """The actual generate-and-persist work, shared by a normal run and a
    forced regenerate — caller has already handled the ``last_run_on`` guard
    (or deliberately bypassed it) and holds the automation row lock."""
    brand = db.get(Brand, automation.brand_id)
    if brand is None:
        db.commit()
        raise ContentAIError(f"Automation {automation.id} has no brand.")

    products = db.scalars(
        select(Product).where(Product.brand_id == brand.id).order_by(Product.name)
    ).all()
    count = max(1, min(automation.videos_per_day, 10))
    # Images dominate the run time when auto-media is on, so they get the
    # biggest share of the bar; otherwise writing the ideas does.
    media = automation.auto_media
    ideas_end, check_end = (45, 55) if media else (70, 95)
    report(5, f"Writing {count} idea{'s' if count != 1 else ''}…", ideas_end)
    try:
        learnings = brand_learnings(db, brand.id)["prompt"] if automation.learn_from_results else ""
        ideas = generate_ideas(
            brand.name, brand.lang, list(products), automation.topic_source, count, brand.voice_examples or "", learnings
        )
    except ContentAIError:
        db.commit()  # release the lock even though this attempt failed
        raise

    report(ideas_end, "Fact-checking against your products…", check_end)
    checks = fact_check([i["caption"] for i in ideas], list(products))

    drafts = [
        Draft(
            brand_id=brand.id,
            title=idea["title"],
            body=idea["caption"],
            insight=idea["insight"],
            planned_for=today,
            source="ai-auto",
            status="waiting",  # set for real below, once media (if any) is attached
            fit_score=idea.get("fit_score"),
            fact_issues=checks[n] if checks is not None else None,
        )
        for n, idea in enumerate(ideas)
    ]
    db.add_all(drafts)
    db.flush()  # assign ids before scheduling can reference them

    media_ids: list[int | None] = [None] * len(ideas)
    if automation.auto_media:
        span = 95 - check_end
        brand_args = _brand_snapshot(brand)
        product_args = [_product_snapshot(p) for p in products]
        pool = ThreadPoolExecutor(max_workers=_MAX_PARALLEL_MEDIA, thread_name_prefix="auto-media")
        try:
            futures = {
                pool.submit(_generate_media_for, brand_args, idea, product_args): n
                for n, idea in enumerate(ideas)
            }
            done = 0
            for fut in as_completed(futures):
                media_ids[futures[fut]] = fut.result()
                done += 1
                report(
                    check_end + span * done // len(ideas),
                    f"Making image {done} of {len(ideas)}…",
                    95,
                )
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

    for n, draft in enumerate(drafts):
        if automation.auto_media:
            draft.video_id = media_ids[n]

        if automation.require_approval or draft.fact_issues:
            draft.status = "waiting"
            continue

        if draft.video_id is not None:
            try:
                schedule_draft_as_post(db, draft)
                draft.status = "scheduled"
                continue
            except ContentAIError as exc:
                log.warning("auto-media scheduling failed for draft %r: %s", draft.title, exc)
        # No media, or scheduling failed (e.g. no connected channel) — same
        # fallback as the plain text-only path: needs a human to build it.
        draft.status = "approved"

    report(97, "Saving…", 100)
    automation.last_run_on = today
    db.commit()
    for d in drafts:
        db.refresh(d)

    waiting = sum(1 for d in drafts if d.status == "waiting")
    if waiting:
        from app.push import notify_workspace

        notify_workspace(
            brand.workspace_id, "review",
            f"{waiting} new idea{'s' if waiting != 1 else ''} for {brand.name}",
            "Waiting for your review — approve, edit or send back.",
            "/review", f"review-{brand.id}",
        )
    return drafts


def run_automation(
    db: Session, automation_id: int, report: Report = _no_report
) -> list[Draft] | None:
    """Generate + persist one automation's batch of ideas for today.

    Row-locks the ``Automation`` and re-checks ``last_run_on`` before writing,
    so the minute-by-minute worker tick and a manual "run now" click racing
    each other can't both write today's batch — the loser just waits for the
    lock, sees today is already done, and returns ``None``. Raises
    ``ContentAIError`` on failure; ``last_run_on`` only advances on success, so
    a failed run is retried on the next tick.
    """
    automation = db.execute(
        select(Automation).where(Automation.id == automation_id).with_for_update()
    ).scalar_one_or_none()
    if automation is None:
        raise ContentAIError(f"Automation {automation_id} not found.")

    today = _today()
    if automation.last_run_on == today:
        db.commit()  # release the row lock
        return None

    return _write_batch(db, automation, today, report)


def force_regenerate(db: Session, automation_id: int, report: Report = _no_report) -> dict:
    """Discard today's already-written batch and write a fresh one, ignoring
    the "already ran today" guard — the explicit "Regenerate" action.

    Any of today's ai-auto drafts that already turned into a real, *already
    published* post are left alone (never silently un-sends something real);
    everything else today's batch produced — waiting/approved/scheduled-but-
    not-yet-sent drafts, and their queued (not yet posted) PostTargets/Posts —
    gets deleted before the new batch is written.
    """
    from app.models import PostTarget

    automation = db.execute(
        select(Automation).where(Automation.id == automation_id).with_for_update()
    ).scalar_one_or_none()
    if automation is None:
        raise ContentAIError(f"Automation {automation_id} not found.")

    report(2, "Clearing today's old batch…", 5)
    today = _today()
    old_drafts = db.scalars(
        select(Draft).where(
            Draft.brand_id == automation.brand_id,
            Draft.planned_for == today,
            Draft.source == "ai-auto",
        )
    ).all()

    removed, kept_live = 0, 0
    for draft in old_drafts:
        post = (
            db.scalar(select(Post).where(Post.video_id == draft.video_id))
            if draft.video_id is not None
            else None
        )
        if post is not None:
            targets = db.scalars(select(PostTarget).where(PostTarget.post_id == post.id)).all()
            if any(t.status == "posted" for t in targets):
                # Already went out for real somewhere — don't touch it.
                kept_live += 1
                continue
            for t in targets:
                db.delete(t)
            db.delete(post)
        old_video = db.get(Video, draft.video_id) if draft.video_id is not None else None
        db.delete(draft)
        if old_video is not None:
            db.delete(old_video)
        removed += 1
    db.flush()

    automation.last_run_on = None
    drafts = _write_batch(db, automation, today, report)
    return {"removed": removed, "kept_live": kept_live, "drafts": drafts}


# ── on-demand runs in the background ─────────────────────────────────────
# "Generate now" / "Regenerate" can take minutes (AI writing + one image per
# idea), so the button just starts a thread and the page polls its progress —
# the person can close the dialog, keep working, or leave the page. State is
# in process memory (single uvicorn process); a finished run is remembered
# for a while so the page can still show "done" when someone comes back.
_RUN_MEMORY = timedelta(minutes=15)
_runs: dict[int, dict] = {}
_runs_lock = threading.Lock()


def run_status(automation_id: int) -> dict | None:
    with _runs_lock:
        state = _runs.get(automation_id)
        if state is None:
            return None
        if state["status"] != "running" and datetime.now(UTC) - state["_finished"] > _RUN_MEMORY:
            _runs.pop(automation_id, None)
            return None
        return {k: v for k, v in state.items() if not k.startswith("_")}


def start_background_run(automation_id: int, force: bool) -> dict:
    """Kick off a run (or regenerate) for one automation in a worker thread
    and return its initial status. If one is already running for it, return
    that instead of starting a second."""
    with _runs_lock:
        current = _runs.get(automation_id)
        if current is not None and current["status"] == "running":
            return {k: v for k, v in current.items() if not k.startswith("_")}
        _runs[automation_id] = {
            "automation_id": automation_id,
            "force": force,
            "status": "running",
            "progress": 0,
            "upto": 2,
            "step": "Starting…",
            "started_at": datetime.now(UTC).isoformat(),
            "finished_at": None,
            "error": "",
            "result": None,
        }
    threading.Thread(
        target=_background_run, args=(automation_id, force), daemon=True,
        name=f"auto-run-{automation_id}",
    ).start()
    return run_status(automation_id)


def _update_run(automation_id: int, **fields) -> None:
    with _runs_lock:
        state = _runs.get(automation_id)
        if state is not None:
            state.update(fields)
            if fields.get("status") in ("done", "failed"):
                state["_finished"] = datetime.now(UTC)
                state["finished_at"] = state["_finished"].isoformat()


def _background_run(automation_id: int, force: bool) -> None:
    def report(pct: int, step: str, upto: int) -> None:
        _update_run(automation_id, progress=pct, step=step, upto=upto)

    db = SessionLocal()
    try:
        if force:
            out = force_regenerate(db, automation_id, report)
            drafts = out["drafts"]
            result = {
                "regenerated": True,
                "removed": out["removed"],
                "kept_live": out["kept_live"],
                "count": len(drafts),
            }
        else:
            drafts = run_automation(db, automation_id, report)
            already = drafts is None
            if already:
                automation = db.get(Automation, automation_id)
                drafts = db.scalars(
                    select(Draft).where(
                        Draft.brand_id == automation.brand_id, Draft.planned_for == _today()
                    )
                ).all()
            result = {"regenerated": False, "already_ran_today": already, "count": len(drafts)}
        _update_run(automation_id, status="done", progress=100, upto=100, step="Done", result=result)
    except ContentAIError as exc:
        db.rollback()
        _update_run(automation_id, status="failed", step="Failed", error=str(exc))
    except Exception:  # noqa: BLE001 - surface any crash to the page, not just the log
        db.rollback()
        log.exception("background run crashed for automation %s", automation_id)
        _update_run(automation_id, status="failed", step="Failed", error="Unexpected error — check the server log.")
    finally:
        db.close()


def _due(automation: Automation, now: datetime) -> bool:
    if not automation.enabled:
        return False
    if automation.last_run_on == now.date():
        return False
    return now.time() >= automation.run_at


def _tick() -> dict:
    """One generation pass across every brand. Runs in a worker thread."""
    db = SessionLocal()
    written = 0
    failed: list[str] = []
    try:
        now = datetime.now(PHNOM_PENH)
        due_ids = [a.id for a in db.scalars(select(Automation)).all() if _due(a, now)]
        for automation_id in due_ids:
            try:
                drafts = run_automation(db, automation_id)
                written += len(drafts) if drafts else 0
            except ContentAIError as exc:
                db.rollback()
                failed.append(f"automation {automation_id}: {exc}")
            except Exception:  # noqa: BLE001 - one brand's bug shouldn't sink the tick
                db.rollback()
                log.exception("content generation crashed for automation %s", automation_id)
                failed.append(f"automation {automation_id}: unexpected error")
        return {"checked": len(due_ids), "written": written, "failed": failed}
    finally:
        db.close()


async def _run(interval: int) -> None:
    log.info("content scheduler started (checks every %ss)", interval)
    while True:
        try:
            result = await asyncio.to_thread(_tick)
            if result["checked"]:
                log.info(
                    "content scheduler: %d automation(s) due, %d idea(s) written",
                    result["checked"], result["written"],
                )
            for msg in result["failed"]:
                log.warning("content scheduler: %s", msg)
        except asyncio.CancelledError:
            log.info("content scheduler stopping")
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive across any error
            log.exception("content scheduler tick failed")
        await asyncio.sleep(interval)


def start(app) -> None:
    """Attach the worker task to the FastAPI app (call from lifespan startup)."""
    settings = get_settings()
    if not settings.content_scheduler_enabled or settings.maintenance_mode:
        log.info("content scheduler disabled (CONTENT_SCHEDULER_ENABLED=false or MAINTENANCE_MODE=true)")
        app.state.content_scheduler = None
        return
    app.state.content_scheduler = asyncio.create_task(_run(60))


async def stop(app) -> None:
    task = getattr(app.state, "content_scheduler", None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
