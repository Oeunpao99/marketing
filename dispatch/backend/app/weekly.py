"""Weekly AI report + plan — the "one tap on Sunday" habit.

For one brand: how the last 7 days went against the 7 before (from saved
MetricSnapshot readings, same source as app/learning.py — no platform calls,
no AI-invented numbers), what the AI has learned, and a day-by-day set of post
ideas for the coming week written with those learnings. The person trims it
on the Weekly plan page and approves it in one tap:

- every idea becomes a Draft on its day (source "ai-weekly");
- when the brand's Automation.auto_media is on, an image is made for each and
  it's scheduled as a real post on that day (content_scheduler's
  schedule_draft_as_post) — in a background thread, progress polled like
  Auto-generate's runs;
- the daily Auto-generate run skips days an approved plan already covers.

Plans are written automatically on Sunday evening (Phnom Penh) for brands
with Auto-generate on and a connected channel (``auto_tick``, called from
content_scheduler's minute loop), or on demand with "Plan next week".
"""

from __future__ import annotations

import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import billing
from app.content_ai import ContentAIError, fact_check, generate_ideas
from app.content_scheduler import (
    PHNOM_PENH,
    _MAX_PARALLEL_MEDIA,
    _brand_snapshot,
    _generate_media_for,
    _product_snapshot,
    _today,
    schedule_draft_as_post,
)
from app.database import SessionLocal, get_db
from app.learning import _engagement, brand_learnings
from app.models import (
    Automation,
    Brand,
    Channel,
    Draft,
    MetricSnapshot,
    Platform,
    Post,
    PostTarget,
    Product,
    TeamMember,
    WeeklyPlan,
)
from app.tenancy import current_workspace_id, get_current_user, owned

log = logging.getLogger("app.weekly")

router = APIRouter(prefix="/weekly", tags=["Weekly plan"])

PLAN_DAYS = 7
MAX_ITEMS = 14
# Sunday evening, Phnom Penh — the automatic plan for the week starting Monday.
AUTO_WEEKDAY = 6
AUTO_AT = time(18, 0)


# ── report ────────────────────────────────────────────────────────────────
def _period(db: Session, brand_id: int, since: datetime, until: datetime) -> dict:
    targets = db.scalars(
        select(PostTarget)
        .join(Post, Post.id == PostTarget.post_id)
        .where(
            Post.brand_id == brand_id,
            PostTarget.status == "posted",
            PostTarget.published_at >= since,
            PostTarget.published_at < until,
        )
    ).all()
    latest: dict[int, MetricSnapshot] = {}
    if targets:
        for s in db.scalars(
            select(MetricSnapshot)
            .where(MetricSnapshot.target_id.in_([t.id for t in targets]))
            .order_by(MetricSnapshot.taken_at)
        ):
            latest[s.target_id] = s
    slugs = dict(
        db.execute(
            select(Channel.id, Platform.slug)
            .join(Platform, Platform.id == Channel.platform_id)
            .where(Channel.brand_id == brand_id)
        ).all()
    )
    engagement = 0.0
    views = None
    measured = 0
    top = None
    for t in targets:
        snap = latest.get(t.id)
        eng = _engagement(snap.metrics) if snap else None
        if eng is None:
            continue
        measured += 1
        engagement += eng
        if snap.metrics.get("views") is not None:
            views = (views or 0) + snap.metrics["views"]
        if top is None or eng > top["engagement"]:
            text = t.title or t.caption or ""
            top = {
                "target_id": t.id,
                "title": " ".join(text.split())[:90],
                "platform": slugs.get(t.channel_id, ""),
                "engagement": int(eng),
                "published_at": t.published_at.isoformat() if t.published_at else None,
            }
    return {
        "posts": len(targets),
        "measured": measured,
        "engagement": int(engagement),
        "views": int(views) if views is not None else None,
        "top": top,
    }


def build_report(db: Session, brand_id: int, learnings: dict | None = None) -> dict:
    now = datetime.now(UTC)
    week = timedelta(days=PLAN_DAYS)
    learnings = learnings if learnings is not None else brand_learnings(db, brand_id)
    return {
        "from": (now - week).astimezone(PHNOM_PENH).date().isoformat(),
        "to": now.astimezone(PHNOM_PENH).date().isoformat(),
        "this_week": _period(db, brand_id, now - week, now),
        "last_week": _period(db, brand_id, now - 2 * week, now - week),
        "rules": learnings.get("rules", []),
        "learned_from": learnings.get("posts", 0),
    }


# ── plan ──────────────────────────────────────────────────────────────────
def _free_days(db: Session, brand_id: int, start: date) -> list[date]:
    """Days in the plan window an approved plan hasn't already filled."""
    days = [start + timedelta(days=n) for n in range(PLAN_DAYS)]
    taken = set(
        db.scalars(
            select(Draft.planned_for).where(
                Draft.brand_id == brand_id,
                Draft.source == "ai-weekly",
                Draft.planned_for >= days[0],
                Draft.planned_for <= days[-1],
            )
        ).all()
    )
    return [d for d in days if d not in taken]


def build_plan(db: Session, brand_id: int, starts_on: date | None = None, step=lambda _p, _s: None) -> WeeklyPlan:
    """Write a fresh plan for the 7 days from ``starts_on`` (default tomorrow),
    replacing this brand's un-approved one. Raises ContentAIError."""
    billing.bind_brand(brand_id)  # often runs in a worker thread: charge the brand's workspace
    brand = db.get(Brand, brand_id)
    automation = db.scalar(select(Automation).where(Automation.brand_id == brand_id))
    if brand is None or automation is None:
        raise ContentAIError("Brand not found.")
    start = starts_on or _today() + timedelta(days=1)
    days = _free_days(db, brand_id, start)
    if not days:
        raise ContentAIError("The next 7 days are already covered by an approved plan.")

    step(10, "Reading last week's results…")
    learnings = brand_learnings(db, brand_id)
    report = build_report(db, brand_id, learnings)
    products = db.scalars(select(Product).where(Product.brand_id == brand_id).order_by(Product.name)).all()
    per_day = max(1, min(automation.videos_per_day, 2))
    count = min(len(days) * per_day, MAX_ITEMS)

    step(20, f"Writing {count} ideas for the week…")
    ideas = generate_ideas(
        brand.name,
        brand.lang,
        list(products),
        automation.topic_source,
        count,
        brand.voice_examples or "",
        learnings["prompt"] if automation.learn_from_results else "",
        week=True,
    )
    step(80, "Fact-checking against your products…")
    checks = fact_check([i["caption"] for i in ideas], list(products))

    items = [
        {
            "key": uuid.uuid4().hex[:10],
            # Spread evenly — the fit-score filter may have dropped some ideas.
            "day": days[n * len(days) // len(ideas)].isoformat(),
            "title": idea["title"],
            "caption": idea["caption"],
            "insight": idea["insight"],
            "fit_score": idea.get("fit_score"),
            "fact_issues": checks[n] if checks is not None else None,
        }
        for n, idea in enumerate(ideas)
    ]
    for old in db.scalars(
        select(WeeklyPlan).where(WeeklyPlan.brand_id == brand_id, WeeklyPlan.status == "ready")
    ):
        db.delete(old)
    plan = WeeklyPlan(
        brand_id=brand_id,
        starts_on=days[0],
        ends_on=start + timedelta(days=PLAN_DAYS - 1),
        status="ready",
        report=report,
        items=items,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _notify_ready(brand: Brand, plan: WeeklyPlan) -> None:
    from app.push import notify_workspace

    this = plan.report.get("this_week", {})
    notify_workspace(
        brand.workspace_id,
        "review",
        f"Next week's plan is ready — {brand.name}",
        f"{len(plan.items)} posts planned. Last 7 days: {this.get('posts', 0)} posts, "
        f"{this.get('engagement', 0)} engagement. Review and approve in one tap.",
        "/weekly",
        f"weekly-{brand.id}",
    )


# ── background jobs (write a plan / make images on approve) ───────────────
# Keyed by brand id; process memory like content_scheduler's runs. A finished
# job is remembered briefly so the page can still show how it ended.
_JOB_MEMORY = timedelta(minutes=15)
_jobs: dict[int, dict] = {}
_jobs_lock = threading.Lock()


def job_status(brand_id: int) -> dict | None:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j is None:
            return None
        if j["status"] != "running" and datetime.now(UTC) - j["_finished"] > _JOB_MEMORY:
            _jobs.pop(brand_id, None)
            return None
        return {k: v for k, v in j.items() if not k.startswith("_")}


def _set_job(brand_id: int, **fields) -> None:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j is None:
            return
        j.update(fields)
        if fields.get("status") in ("done", "failed"):
            j["_finished"] = datetime.now(UTC)


def _start_job(brand_id: int, kind: str, target, *args) -> dict:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j is not None and j["status"] == "running":
            raise HTTPException(409, "Already working on this brand's plan — give it a moment.")
        _jobs[brand_id] = {
            "brand_id": brand_id,
            "kind": kind,
            "status": "running",
            "progress": 2,
            "step": "Starting…",
            "error": "",
        }
    threading.Thread(target=target, args=(brand_id, *args), daemon=True, name=f"weekly-{kind}-{brand_id}").start()
    return job_status(brand_id)


def _build_job(brand_id: int) -> None:
    db = SessionLocal()
    try:
        plan = build_plan(db, brand_id, step=lambda p, s: _set_job(brand_id, progress=p, step=s))
        _set_job(brand_id, status="done", progress=100, step="Done")
        _notify_ready(db.get(Brand, brand_id), plan)
    except ContentAIError as exc:
        db.rollback()
        _set_job(brand_id, status="failed", step="Failed", error=str(exc))
    except Exception:  # noqa: BLE001 - surface any crash to the page, not just the log
        db.rollback()
        log.exception("weekly plan crashed for brand %s", brand_id)
        _set_job(brand_id, status="failed", step="Failed", error="Unexpected error — check the server log.")
    finally:
        db.close()


def _media_job(brand_id: int, draft_ids: list[int]) -> None:
    """Make an image for each approved plan draft, then schedule it on its day."""
    billing.bind_brand(brand_id)
    db = SessionLocal()
    pool = ThreadPoolExecutor(max_workers=_MAX_PARALLEL_MEDIA, thread_name_prefix="weekly-media")
    try:
        brand = db.get(Brand, brand_id)
        products = db.scalars(select(Product).where(Product.brand_id == brand_id)).all()
        drafts = db.scalars(select(Draft).where(Draft.id.in_(draft_ids)).order_by(Draft.planned_for)).all()
        brand_args = _brand_snapshot(brand)
        product_args = [_product_snapshot(p) for p in products]
        futures = {
            pool.submit(
                _generate_media_for, brand_args, {"title": d.title, "caption": d.body}, product_args
            ): d
            for d in drafts
        }
        done = scheduled = 0
        for fut in as_completed(futures):
            d = futures[fut]
            d.video_id = fut.result()
            if d.video_id is not None:
                try:
                    schedule_draft_as_post(db, d, on_day=d.planned_for)
                    d.status = "scheduled"
                    scheduled += 1
                except ContentAIError as exc:
                    log.warning("weekly plan: could not schedule %r: %s", d.title, exc)
            db.commit()
            done += 1
            _set_job(
                brand_id,
                progress=5 + 90 * done // len(drafts),
                step=f"Making image {done} of {len(drafts)}…",
            )
        _set_job(
            brand_id,
            status="done",
            progress=100,
            step=f"{scheduled} of {len(drafts)} posts scheduled",
            scheduled=scheduled,
            total=len(drafts),
        )
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("weekly plan media crashed for brand %s", brand_id)
        _set_job(brand_id, status="failed", step="Failed", error="Some images failed — check the Calendar.")
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        db.close()


# ── automatic Sunday plans ────────────────────────────────────────────────
_auto_tried: set[tuple[int, date]] = set()  # one attempt per brand per Sunday


def auto_tick(db: Session, now: datetime) -> int:
    """Called every minute by app/content_scheduler.py. Returns plans written."""
    if now.weekday() != AUTO_WEEKDAY or now.time() < AUTO_AT:
        return 0
    start = now.date() + timedelta(days=1)
    written = 0
    for a in db.scalars(select(Automation).where(Automation.enabled.is_(True))).all():
        key = (a.brand_id, start)
        if key in _auto_tried:
            continue
        _auto_tried.add(key)
        has_channel = db.scalar(
            select(Channel.id).where(Channel.brand_id == a.brand_id, Channel.status == "live").limit(1)
        )
        exists = db.scalar(
            select(WeeklyPlan.id).where(WeeklyPlan.brand_id == a.brand_id, WeeklyPlan.starts_on >= start).limit(1)
        )
        if not has_channel or exists or not _free_days(db, a.brand_id, start):
            continue
        try:
            plan = build_plan(db, a.brand_id, start)
            _notify_ready(db.get(Brand, a.brand_id), plan)
            written += 1
        except ContentAIError as exc:
            db.rollback()
            log.warning("weekly plan for brand %s failed: %s", a.brand_id, exc)
    return written


# ── API ───────────────────────────────────────────────────────────────────
def _plan_out(db: Session, plan: WeeklyPlan | None) -> dict | None:
    if plan is None:
        return None
    drafts = []
    if plan.status == "approved":
        drafts = db.scalars(
            select(Draft)
            .where(
                Draft.brand_id == plan.brand_id,
                Draft.source == "ai-weekly",
                Draft.planned_for >= plan.starts_on,
                Draft.planned_for <= plan.ends_on,
            )
            .order_by(Draft.planned_for)
        ).all()
    return {
        "id": plan.id,
        "brand_id": plan.brand_id,
        "starts_on": plan.starts_on,
        "ends_on": plan.ends_on,
        "status": plan.status,
        "report": plan.report,
        "items": plan.items,
        "created_at": plan.created_at,
        "approved_at": plan.approved_at,
        "drafts": [
            {"id": d.id, "day": d.planned_for, "title": d.title, "status": d.status, "has_media": d.video_id is not None}
            for d in drafts
        ],
    }


@router.get("")
def weekly_view(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The brand's current plan (waiting for approval, else the latest
    approved one), a live report, and any job in progress."""
    owned(db, Brand, brand_id, ws)
    plan = db.scalar(
        select(WeeklyPlan)
        .where(WeeklyPlan.brand_id == brand_id, WeeklyPlan.status.in_(("ready", "approved")))
        .order_by(WeeklyPlan.status.desc(), WeeklyPlan.created_at.desc())  # "ready" first
        .limit(1)
    )
    automation = db.scalar(select(Automation).where(Automation.brand_id == brand_id))
    return {
        "plan": _plan_out(db, plan),
        "report": build_report(db, brand_id) if plan is None or plan.status != "ready" else None,
        "job": job_status(brand_id),
        "auto_media": bool(automation and automation.auto_media),
        "auto_enabled": bool(automation and automation.enabled),
        "free_days": len(_free_days(db, brand_id, _today() + timedelta(days=1))),
    }


@router.post("/plan", status_code=202)
def weekly_plan_now(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Write (or rewrite) the plan for the next 7 days, in the background."""
    owned(db, Brand, brand_id, ws)
    return _start_job(brand_id, "plan", _build_job)


@router.get("/job")
def weekly_job(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, brand_id, ws)
    return job_status(brand_id) or {"brand_id": brand_id, "status": "idle"}


def _ready_plan(db: Session, plan_id: int, ws: int, lock: bool = False) -> WeeklyPlan:
    owned(db, WeeklyPlan, plan_id, ws, "Plan")
    q = select(WeeklyPlan).where(WeeklyPlan.id == plan_id)
    plan = db.scalar(q.with_for_update() if lock else q)
    if plan.status != "ready":
        raise HTTPException(409, "This plan was already approved or dismissed.")
    return plan


class ItemEdit(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    caption: str | None = Field(default=None, max_length=5000)


@router.patch("/{plan_id}/items/{key}")
def weekly_edit_item(
    plan_id: int, key: str, payload: ItemEdit, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    plan = _ready_plan(db, plan_id, ws, lock=True)
    items = [dict(i) for i in plan.items]
    item = next((i for i in items if i["key"] == key), None)
    if item is None:
        raise HTTPException(404, "Idea not found.")
    for field in ("title", "caption"):
        value = getattr(payload, field)
        if value is not None and value.strip():
            item[field] = value.strip()
    plan.items = items
    db.commit()
    return item


@router.delete("/{plan_id}/items/{key}", status_code=204)
def weekly_remove_item(plan_id: int, key: str, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    plan = _ready_plan(db, plan_id, ws, lock=True)
    plan.items = [i for i in plan.items if i["key"] != key]
    db.commit()


@router.post("/{plan_id}/dismiss")
def weekly_dismiss(plan_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    plan = _ready_plan(db, plan_id, ws, lock=True)
    plan.status = "dismissed"
    db.commit()
    return {"id": plan.id, "status": plan.status}


@router.post("/{plan_id}/approve")
def weekly_approve(
    plan_id: int,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """One tap: every idea becomes a Draft on its day. With the brand's
    "Generate media" on, images are made and posts scheduled in the
    background (poll ``GET /weekly/job``)."""
    plan = _ready_plan(db, plan_id, ws, lock=True)
    today = _today()
    keep = [i for i in plan.items if date.fromisoformat(i["day"]) >= today]
    if not keep:
        raise HTTPException(422, "Every idea in this plan is for a day that has passed — plan again.")
    automation = db.scalar(select(Automation).where(Automation.brand_id == plan.brand_id))
    media = bool(automation and automation.auto_media)
    if media:
        running = job_status(plan.brand_id)
        if running and running["status"] == "running":
            raise HTTPException(409, "Still working on this brand — try again in a moment.")

    drafts = [
        Draft(
            brand_id=plan.brand_id,
            title=i["title"][:200],
            body=i["caption"],
            insight=i.get("insight") or "",
            planned_for=date.fromisoformat(i["day"]),
            source="ai-weekly",
            status="approved",
            fit_score=i.get("fit_score"),
            fact_issues=i.get("fact_issues"),
        )
        for i in keep
    ]
    db.add_all(drafts)
    plan.status = "approved"
    plan.approved_at = datetime.now(UTC)
    plan.approved_by = user.id
    db.commit()

    if media:
        _start_job(plan.brand_id, "media", _media_job, [d.id for d in drafts])
    return {
        "id": plan.id,
        "status": plan.status,
        "drafts": len(drafts),
        "skipped_past": len(plan.items) - len(keep),
        "making_media": media,
    }
