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

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.content_ai import (
    SELLING_PILLARS,
    ContentAIError,
    fact_check,
    generate_ideas,
    image_prompt_for_idea,
    pick_subjects,
    selling_days,
    video_prompt_for_idea,
)
from app.learning import brand_learnings, pick_time
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


_VIDEO_WAIT = 12 * 60  # give up on a daily video after this many seconds
_VIDEO_POLL = 10


def _pick_video_idea(ideas: list[dict]) -> int:
    """The idea that gets the day's video: the highest fit score (first on a
    tie) — never a meme or topic-poster idea while there's another, since
    their text only works on an image."""
    scores = [(i.get("fit_score") or 0) for i in ideas]
    return max(
        range(len(ideas)), key=lambda n: (not (ideas[n].get("meme") or ideas[n].get("poster")), scores[n], -n)
    )


def _generate_video_for(
    brand: Brand | _AutoBrand,
    idea: dict,
    products: list[Product | _AutoProduct],
    first_frame: bytes | None = None,
) -> int | None:
    """Best-effort: render an 8s video for this idea (auto-generate's daily
    video, on the cheaper AUTO_VIDEO_MODEL) and wait for it, returning the
    Video id — or None, so the caller can fall back to an image. The job is a
    normal GenerationJob, so it shows in the Library and is charged to the
    workspace's AI credit when it finishes. ``first_frame``: the product's
    brand-kit photo (``_first_frame_for``), so the clip shows the real product."""
    import time as _time

    from app import billing
    from app import video as video_gen
    from app.models import GenerationJob

    s = get_settings()
    if not s.video_generation_enabled:
        return None
    model = s.auto_video_model if s.video_provider == "gemini_veo" else None
    try:
        billing.require(brand.workspace_id, billing.video_cost(s.video_provider, 8, model))
    except billing.OutOfCredit:
        log.info("auto video skipped for brand %s: out of AI credit", brand.id)
        return None
    prompt = video_prompt_for_idea(brand.name, brand.lang, idea, products, first_frame=first_frame is not None)
    try:
        provider, provider_job_id = video_gen.start_job(prompt, "9:16", 8, first_frame, model=model)
    except video_gen.VideoGenError as exc:
        log.warning("auto video failed to start for brand %s: %s", brand.id, exc)
        return None

    db = SessionLocal()
    try:
        job = GenerationJob(
            workspace_id=brand.workspace_id,
            brand_id=brand.id,
            kind="video",
            prompt=prompt,
            aspect_ratio="9:16",
            seconds=8,
            provider=provider,
            provider_job_id=provider_job_id,
            model=model or billing.video_model(provider),
            status="running",
        )
        db.add(job)
        db.commit()
        job_id = job.id
        deadline = _time.monotonic() + _VIDEO_WAIT
        while _time.monotonic() < deadline:
            _time.sleep(_VIDEO_POLL)
            video_gen.advance_video(db, job_id)  # the worker may beat us to it — fine
            db.expire_all()
            job = db.get(GenerationJob, job_id)
            if job.status == "succeeded":
                v = db.get(Video, job.video_id) if job.video_id else None
                if v is not None and not v.caption and idea.get("caption"):
                    v.caption, v.caption_angle, v.caption_status = idea["caption"], idea.get("angle") or "", "ready"
                    db.commit()
                return job.video_id
            if job.status == "failed":
                log.warning("auto video failed for brand %s: %s", brand.id, job.error)
                return None
        log.warning("auto video for brand %s still rendering after %ss — using an image", brand.id, _VIDEO_WAIT)
        return None
    finally:
        db.close()


def _first_frame_for(db: Session, brand_id: int, idea: dict) -> bytes | None:
    """The brand-kit photo of the product an idea is about (its name is in the
    title or caption), to start its video from — None when it names none."""
    from app.brand_kit import product_for_idea, product_photo

    product_id = product_for_idea(db, brand_id, idea)
    return product_photo(db, brand_id, product_id) if product_id is not None else None


def _poster_kit_for(
    db: Session, automation: Automation, brand_id: int, idea: dict, n: int, day: date
) -> tuple[list[bytes], str]:
    """Reference images + instructions from the brand kit for idea ``n``
    (Automation.poster_kit): templates take turns — a different one each
    image and each day — the product photo follows the product the idea is
    about, and the logo goes on every poster when switched on."""
    from app.brand_kit import gather, product_for_idea
    from app.models import BrandAsset

    kit = automation.poster_kit or {}
    wanted = [int(t) for t in kit.get("template_ids") or [] if str(t).isdigit()]
    # Only templates that still exist (one may have been deleted since).
    live = set(
        db.scalars(
            select(BrandAsset.id).where(
                BrandAsset.brand_id == brand_id, BrandAsset.kind == "template", BrandAsset.id.in_(wanted or [0])
            )
        ).all()
    )
    templates = [t for t in wanted if t in live]
    template_id = templates[(day.toordinal() + n) % len(templates)] if templates else None
    product_id = product_for_idea(db, brand_id, idea) if kit.get("product_photos") else None
    return gather(db, brand_id, template_id=template_id, product_id=product_id, logo=bool(kit.get("logo")))


def _generate_media_for(
    brand: Brand | _AutoBrand,
    idea: dict,
    products: list[Product | _AutoProduct],
    kit: tuple[list[bytes], str] = ([], ""),
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

    from app import billing

    # A relatable idea goes out as a meme poster: the model draws only the
    # funny photo (square, no brand template — it should look like a real
    # meme, not an ad) and app/meme.py adds the setup text above it.
    meme = idea.get("meme") or {}
    is_meme = bool(meme.get("top") and meme.get("scene"))
    # Educate / benefit / comparison / trend / quote / community ideas get a
    # topic poster (app/poster.py): the model draws only the picture — no brand
    # template, the poster layout is the design — and the text goes on after.
    poster = None if is_meme else idea.get("poster")
    if is_meme:
        from app.meme import meme_photo_prompt

        prompt, ratio, refs, guide = meme_photo_prompt(meme["scene"]), "1:1", [], ""
    elif poster:
        from app.poster import poster_photo_prompt

        prompt, ratio, refs, guide = poster_photo_prompt(idea.get("pillar") or "", poster["scene"], poster.get("headline", "")), "1:1", [], ""
    else:
        prompt, ratio = image_prompt_for_idea(brand.name, brand.lang, idea, products), "9:16"
        refs, guide = kit
    try:
        billing.require(brand.workspace_id, billing.IMAGE_HOLD)
    except billing.OutOfCredit:
        log.info("auto-media skipped for brand %s: out of AI credit", brand.id)
        return None
    try:
        with video_gen.image_slot():
            provider, blob, usage = video_gen.generate_image(guide + prompt, ratio, refs or None)
    except video_gen.VideoGenError as exc:
        log.warning("auto-media image generation failed for brand %s: %s", brand.id, exc)
        return None

    ext, mime, resolution, tag = ".png", "image/png", "1024x1536", "ai-auto-image"
    if is_meme:
        from app.meme import image_size, render_meme

        try:
            blob = render_meme(blob, meme["top"], brand.name)
            ext, mime, tag = ".jpg", "image/jpeg", "ai-auto-meme"
            resolution = "x".join(map(str, image_size(blob)))
        except Exception:  # noqa: BLE001 — a plain photo beats losing the post
            log.exception("meme render failed for brand %s — posting the photo alone", brand.id)
            resolution = "1024x1024"
    elif poster:
        from app.meme import image_size
        from app.poster import render_poster

        try:
            blob = render_poster(blob, idea.get("pillar") or "", poster, brand.name, brand.slug)
            ext, mime, tag = ".jpg", "image/jpeg", "ai-auto-poster"
            resolution = "x".join(map(str, image_size(blob)))
        except Exception:  # noqa: BLE001 — a plain photo beats losing the post
            log.exception("poster render failed for brand %s — posting the picture alone", brand.id)
            resolution = "1024x1024"

    db = SessionLocal()
    try:
        url = store_blob(db, blob, ext, mime)
        job = GenerationJob(
            workspace_id=brand.workspace_id,
            brand_id=brand.id,
            kind="image",
            prompt=(
                f"MEME TEXT: {meme['top']}\n\n" if is_meme else f"POSTER: {poster['headline']}\n\n" if poster else ""
            )
            + prompt,
            aspect_ratio=ratio,
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
            filename=f"auto-{brand.slug}-{int(datetime.now(PHNOM_PENH).timestamp())}{ext}",
            resolution=resolution,
            size_bytes=len(blob),
            source="ai",
            tag=tag,
            url=url,
            caption=idea.get("caption") or "",
            caption_angle=idea.get("angle") or "",
            caption_status="ready" if idea.get("caption") else "",
        )
        db.add(v)
        db.flush()
        job.video_id = v.id
        db.commit()
        billing.charge_job(job)
        db.refresh(v)
        return v.id
    finally:
        db.close()


def _slot_on(day: date, platform_slug: str, now: datetime, override: time | None = None) -> datetime:
    """That platform's posting time on a given day — or the next slot from
    now if that moment has already passed (a plan approved late)."""
    t = override or _default_time_for(platform_slug)
    candidate = datetime.combine(day, t, tzinfo=PHNOM_PENH)
    return candidate if candidate > now else _next_slot(platform_slug, now, override)


def _learned_slot(learned: dict | None, slug: str, now: datetime, on_day: date | None, seed: int) -> datetime:
    """The posting moment from this brand's results (learning.pick_time —
    that weekday's best slot, the platform's best hour, or now and then a
    test of another time), else the platform default. Without ``on_day``:
    today if that time is still ahead, else tomorrow's."""
    if on_day:
        return _slot_on(on_day, slug, now, pick_time(learned, slug, on_day, seed)[0])
    for day in (now.date(), now.date() + timedelta(days=1)):
        t = pick_time(learned, slug, day, seed)[0] or _default_time_for(slug)
        candidate = datetime.combine(day, t, tzinfo=PHNOM_PENH)
        if candidate > now:
            return candidate
    return candidate + timedelta(days=1)


def schedule_draft_as_post(db: Session, draft: Draft, on_day: date | None = None) -> Post:
    """Turn an auto-media draft into a real, queued Post — every channel the
    brand has actually connected, at that platform's usual posting time
    (today's slot if it hasn't passed yet, else tomorrow's). Raises
    ContentAIError if there's no connected channel to actually post it to.

    ``on_day``: post on that Phnom Penh day instead of the next slot (a
    weekly plan item, app/weekly.py).

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

    post = Post(
        brand_id=draft.brand_id,
        video_id=draft.video_id,
        title=draft.title,
        status="scheduled",
        angle=draft.angle or "",
        pillar=draft.pillar or "",
        subject=draft.subject or "",
    )
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
        if override_time:
            when = _slot_on(on_day, slug, now, override_time) if on_day else _next_slot(slug, now, override_time)
        else:
            when = _learned_slot(learned, slug, now, on_day, post.id)
        db.add(
            PostTarget(
                post_id=post.id,
                channel_id=ch.id,
                caption=draft.body,
                title=draft.title,
                scheduled_for=when,
                status="queued",
            )
        )
    db.flush()
    return post


def last_selling_day(db: Session, brand_id: int, before: date) -> date | None:
    """The day of the brand's last product / proof / promotion idea before
    ``before`` — where the awareness → product rhythm picks up from."""
    return db.scalar(
        select(func.max(Draft.planned_for)).where(
            Draft.brand_id == brand_id,
            Draft.pillar.in_(SELLING_PILLARS),
            Draft.status != "rejected",
            Draft.planned_for < before,
        )
    )


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
        learned = brand_learnings(db, brand.id) if automation.learn_from_results else {}
        learnings = learned.get("prompt", "")
        # Awareness days between product posts (content_ai.SELLING_GAP_DAYS).
        sell_days = selling_days([today], last_selling_day(db, brand.id, today))
        # So a small daily batch still rotates pillars instead of repeating yesterday's.
        recent_pillars = db.scalars(
            select(Draft.pillar)
            .where(Draft.brand_id == brand.id, Draft.pillar != "", Draft.status != "rejected")
            .order_by(Draft.id.desc())
            .limit(6)
        ).all()
        ideas = generate_ideas(
            brand.name,
            brand.lang,
            list(products),
            automation.topic_source,
            count,
            brand.voice_examples or "",
            learnings,
            days=[today],
            recent_pillars=list(recent_pillars),
            # Rotated by date, so each day takes the next subjects in the list —
            # product subjects only on a product day, proven subjects more often.
            subjects=pick_subjects(
                automation.subjects,
                count,
                today.toordinal() * count,
                selling_slots=len(sell_days),
                product_names=[p.name for p in products],
                scores=learned.get("subject_scores"),
            ),
            selling_days=sell_days,
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
            pillar=idea.get("pillar") or "",
            subject=idea.get("subject") or "",
            meme=idea.get("meme"),
            poster=idea.get("poster"),
            angle=idea.get("angle") or "",
            goal=idea.get("goal") or "",
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
        # One video a day — for the idea that scored best — and an image for
        # the rest, all in parallel. A video that fails falls back to an image.
        video_n = _pick_video_idea(ideas) if get_settings().video_generation_enabled else -1
        # Brand kit per image (template / product photo / logo), gathered here
        # on the run's own session so the image threads don't need the DB.
        kits = [_poster_kit_for(db, automation, brand.id, idea, n, today) for n, idea in enumerate(ideas)]
        first_frame = _first_frame_for(db, brand.id, ideas[video_n]) if video_n >= 0 else None
        pool = ThreadPoolExecutor(max_workers=_MAX_PARALLEL_MEDIA, thread_name_prefix="auto-media")
        try:
            futures = {
                (
                    pool.submit(_generate_video_for, brand_args, idea, product_args, first_frame)
                    if n == video_n
                    else pool.submit(_generate_media_for, brand_args, idea, product_args, kits[n])
                ): n
                for n, idea in enumerate(ideas)
            }
            done = 0
            for fut in as_completed(futures):
                n = futures[fut]
                media_ids[n] = fut.result()
                if media_ids[n] is None and n == video_n:
                    media_ids[n] = _generate_media_for(brand_args, ideas[n], product_args, kits[n])
                done += 1
                report(
                    check_end + span * done // len(ideas),
                    f"Making media {done} of {len(ideas)} (1 video, the rest images)…"
                    if video_n >= 0 and len(ideas) > 1
                    else f"Making media {done} of {len(ideas)}…",
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
    from app.billing import bind_brand

    bind_brand(automation.brand_id)  # this batch's AI calls are the brand's workspace's

    today = _today()
    if automation.last_run_on == today:
        db.commit()  # release the row lock
        return None
    # An approved weekly plan (app/weekly.py) already covers today — don't
    # write a second batch on top of it (unless its posts were rejected).
    if db.scalar(
        select(Draft.id).where(
            Draft.brand_id == automation.brand_id,
            Draft.planned_for == today,
            Draft.source == "ai-weekly",
            Draft.status != "rejected",
        ).limit(1)
    ):
        automation.last_run_on = today
        db.commit()
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
    # Every AI post planned for today — the daily batch AND today's slot of an
    # approved weekly plan — so "Regenerate" really replaces what's scheduled
    # instead of adding a second batch on top. Hand-made posts aren't drafts
    # with these sources, so they're never touched.
    old_drafts = db.scalars(
        select(Draft).where(
            Draft.brand_id == automation.brand_id,
            Draft.planned_for == today,
            Draft.source.in_(("ai-auto", "ai-weekly")),
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
            if any(t.status in ("posted", "posting") for t in targets):
                # Already went out somewhere, or is going out right now —
                # don't touch it.
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
        try:
            from app.weekly import auto_tick  # local import: weekly imports this module

            if planned := auto_tick(db, now):
                log.info("content scheduler: %d weekly plan(s) written", planned)
        except Exception:  # noqa: BLE001 - never let the weekly plan sink the daily run
            db.rollback()
            log.exception("weekly plan tick failed")
        try:
            from app.website import auto_tick as website_tick  # weekly website re-checks

            if started := website_tick(db, now):
                log.info("content scheduler: %d website check(s) started", started)
        except Exception:  # noqa: BLE001 - never let a website check sink the daily run
            db.rollback()
            log.exception("website check tick failed")
        try:
            from app.activity import auto_tick as activity_tick  # Monday activity plans

            if started := activity_tick(db, now):
                log.info("content scheduler: %d activity plan(s) started", started)
        except Exception:  # noqa: BLE001 - never let an activity plan sink the daily run
            db.rollback()
            log.exception("activity plan tick failed")
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
