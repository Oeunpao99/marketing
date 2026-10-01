"""Activity plan — the team's week, not just the posts: the 1-3 goals the AI
picks for a brand's week from its real results, and a day-by-day to-do list
to reach them — content prep (photos, videos, approvals), engagement (replies
on real recent posts), growth & sales (follow-ups, sharing) and reviewing
results. A shared checklist: anyone in the workspace ticks a task done.

One AI call per plan (content_ai._chat, charged). Grounded in DATA only:
the week's scheduled posts and planned drafts, last week's numbers
(weekly.build_report), what has worked (learning.py), recent posts with
their comments, drafts waiting for review, connected platforms.

Written on demand (Activity plan page) or automatically on Monday morning
for brands with Auto-generate on (``auto_tick``, from the content
scheduler's minute loop, in a background thread).
"""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import billing
from app.config import get_settings
from app.content_ai import PILLARS, ContentAIError, _chat
from app.content_scheduler import PHNOM_PENH, _today
from app.database import SessionLocal, get_db
from app.learning import _engagement, brand_learnings
from app.models import (
    ActivityPlan,
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
)
from app.tenancy import current_workspace_id, get_current_user, owned

log = logging.getLogger("app.activity")
router = APIRouter(prefix="/activity", tags=["Activity plan"])

CATEGORIES = ("content", "engagement", "growth", "review")
AUTO_AT = time(6, 0)  # Monday, Phnom Penh — before the team starts the week
MAX_TASKS_PER_DAY = 5


def week_start_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


# ── the data the AI plans from ────────────────────────────────────────────
def _week_posts(db: Session, brand_id: int, start: date) -> list[str]:
    """This week's posts — queued deliveries and planned drafts — one line each."""
    end = start + timedelta(days=7)
    lines = []
    lo = datetime.combine(start, time(0), tzinfo=PHNOM_PENH)
    hi = datetime.combine(end, time(0), tzinfo=PHNOM_PENH)
    rows = db.execute(
        select(PostTarget.scheduled_for, PostTarget.status, Post.title, Post.pillar, Platform.slug)
        .join(Post, Post.id == PostTarget.post_id)
        .join(Channel, Channel.id == PostTarget.channel_id)
        .join(Platform, Platform.id == Channel.platform_id)
        .where(Post.brand_id == brand_id, PostTarget.scheduled_for >= lo, PostTarget.scheduled_for < hi)
        .order_by(PostTarget.scheduled_for)
    ).all()
    for at, status, title, pillar, slug in rows[:30]:
        when = at.astimezone(PHNOM_PENH)
        kind = PILLARS.get(pillar, ("",))[0]
        lines.append(f"- {when:%a %d %b %H:%M} {slug} [{status}] {title[:80]}" + (f" ({kind})" if kind else ""))
    drafts = db.scalars(
        select(Draft).where(
            Draft.brand_id == brand_id,
            Draft.planned_for >= start,
            Draft.planned_for < end,
            Draft.status.in_(("waiting", "approved")),
        )
    ).all()
    for d in drafts[:20]:
        kind = PILLARS.get(d.pillar, ("",))[0]
        lines.append(
            f"- {d.planned_for:%a %d %b} draft [{d.status}] {d.title[:80]}"
            + (f" ({kind})" if kind else "")
            + (" — has media" if d.video_id else " — NO image/video yet")
        )
    return lines


def _recent_posts(db: Session, brand_id: int, now: datetime) -> list[str]:
    """Posts from the last 10 days with their latest numbers — what the
    engagement tasks can point at (e.g. replying to comments)."""
    targets = db.execute(
        select(PostTarget.id, PostTarget.published_at, Post.title, Platform.slug)
        .join(Post, Post.id == PostTarget.post_id)
        .join(Channel, Channel.id == PostTarget.channel_id)
        .join(Platform, Platform.id == Channel.platform_id)
        .where(
            Post.brand_id == brand_id,
            PostTarget.status == "posted",
            PostTarget.published_at >= now - timedelta(days=10),
        )
        .order_by(PostTarget.published_at.desc())
        .limit(12)
    ).all()
    latest: dict[int, dict] = {}
    if targets:
        for s in db.scalars(
            select(MetricSnapshot)
            .where(MetricSnapshot.target_id.in_([t.id for t in targets]))
            .order_by(MetricSnapshot.taken_at)
        ):
            latest[s.target_id] = s.metrics or {}
    out = []
    for tid, at, title, slug in targets:
        m = latest.get(tid, {})
        nums = (
            f"{m.get('likes', 0) or 0} likes, {m.get('comments', 0) or 0} comments, {m.get('shares', 0) or 0} shares"
            if _engagement(m) is not None
            else "no numbers yet"
        )
        out.append(f"- {at.astimezone(PHNOM_PENH):%a %d %b} {slug}: {title[:80]} — {nums}")
    return out


def _period_text(p: dict) -> str:
    """weekly._period's numbers as a sentence the AI can quote."""
    text = f"{p.get('posts', 0)} posts published, {p.get('measured', 0)} with numbers, {p.get('engagement', 0)} total engagement"
    if p.get("views") is not None:
        text += f", {p['views']} views"
    return text


def _plan_days(start: date) -> list[date]:
    """The days of the week starting ``start`` still worth planning — all 7
    for a future week, today onwards for the current one."""
    today = _today()
    return [d for d in (start + timedelta(days=i) for i in range(7)) if d >= today] or [start + timedelta(days=6)]


def _product_lines(products: list[Product]) -> list[str]:
    lines = []
    for p in products[:12]:
        entry = f"- {p.name}"
        if p.description:
            entry += f": {' '.join(p.description.split())[:400]}"
        if p.highlights:
            entry += f" | highlights: {' '.join(p.highlights.split())[:300]}"
        lines.append(entry)
    return lines


def _data(db: Session, brand: Brand, start: date) -> str:
    from app.weekly import build_report  # local: weekly imports the scheduler too

    now = datetime.now(UTC)
    learned = brand_learnings(db, brand.id)
    report = build_report(db, brand.id, learned)
    products = db.scalars(select(Product).where(Product.brand_id == brand.id)).all()
    platforms = sorted(
        set(
            db.scalars(
                select(Platform.slug)
                .join(Channel, Channel.platform_id == Platform.id)
                .where(Channel.brand_id == brand.id, Channel.status == "live")
            ).all()
        )
    )
    waiting = len(
        db.scalars(select(Draft.id).where(Draft.brand_id == brand.id, Draft.status == "waiting")).all()
    )
    tw, lw = report["this_week"], report["last_week"]
    days = _plan_days(start)
    recent = [
        i.get("product", "")
        for ideas in db.scalars(
            select(ActivityPlan.ideas)
            .where(ActivityPlan.brand_id == brand.id, ActivityPlan.week_start < start)
            .order_by(ActivityPlan.week_start.desc())
            .limit(2)
        ).all()
        for i in ideas or []
        if i.get("product")
    ]
    slots = [
        f"{slug} {s['day']} {s['hour']:02d}:00"
        for slug, by_day in learned.get("best_slots", {}).items()
        for s in by_day.values()
    ]
    lines = [
        f"Brand: {brand.name}" + (f" — {brand.note}" if brand.note else ""),
        f"Audience language: {brand.lang or 'not set'}",
        "",
        "PRODUCTS:",
        *(_product_lines(products) or ["- none on file"]),
        "Products featured in recent weeks' ideas: " + (", ".join(recent) if recent else "none yet"),
        "",
        "Connected platforms: " + (", ".join(platforms) if platforms else "none connected yet"),
        "Days to plan (earlier days of this week are already over — no tasks for them): "
        + ", ".join(f"{d.isoformat()} ({d:%A})" for d in days),
        f"Today: {_today().isoformat()}",
        "",
        f"Last 7 days: {_period_text(tw)}",
        f"The 7 days before: {_period_text(lw)}",
        f"Posts with numbers learned from (90 days): {learned.get('posts', 0)}",
        "What has measurably worked: " + ("; ".join(r["text"] for r in learned.get("rules", [])) or "nothing measured yet"),
        "What did worse: " + ("; ".join(r["text"] for r in learned.get("weak_rules", [])) or "nothing measured yet"),
        f"Drafts waiting for review: {waiting}",
        "Best posting times measured: " + ("; ".join(slots) if slots else "not measured yet"),
        "",
        "This week's posts:",
        *(_week_posts(db, brand.id, start) or ["- nothing planned or scheduled yet"]),
        "",
        "Recent posts (last 10 days):",
        *(_recent_posts(db, brand.id, now) or ["- none published recently"]),
    ]
    return "\n".join(lines)


PLAN_PROMPT = (
    "You are the creative marketing lead of a small Cambodian business. Each week you come up "
    "with content ideas that could make the brand's PRODUCTS spread — the kind people watch "
    "twice, share with a friend or save — and plan the team's week to make them happen. You get "
    "DATA about the brand. Use ONLY it: never invent product features, prices, offers, "
    "customers, numbers or results.\n"
    "\n"
    "1. ideas: 2-3 content ideas for this week, each built around ONE specific product from the "
    "data (use its exact name; prefer products not featured in recent weeks). Each idea:\n"
    "   {\"product\": exact product name, \"title\": the idea in under 70 characters, "
    "\"format\": one of short video | photo carousel | before & after | challenge | giveaway | "
    "behind the scenes | customer story | how-to demo | myth vs fact | trend remix, "
    "\"hook\": the first 2 seconds or first line that stops the scroll — concrete, in the "
    "audience's world, "
    "\"why_viral\": one sentence — why people would share, comment or save it (surprise, a "
    "useful trick, a relatable pain, a deal worth telling a friend about, a funny moment), "
    "\"platform\": the connected platform it fits best, "
    "\"how\": 2-3 sentences — what the post shows, step by step, using the product's REAL "
    "capabilities from the data}.\n"
    "   Make them specific and bold, not generic advice: a real Cambodian moment, a clear "
    "before/after or a surprising demo. Different formats across the ideas.\n"
    "2. goals: 1-3 goals for the week tied to the ideas and the data, e.g. 'Product B's demo "
    "video gets more views than our usual video' or 'Get 20 comments on the giveaway post'. "
    "Base any number on last week's real numbers, never a made-up figure. Each goal: "
    "{\"title\", \"why\": one sentence quoting the data, \"measure\": how the team will know on "
    "Sunday}.\n"
    "3. focus: one sentence — the week in plain words, naming the products.\n"
    "4. tasks: for EACH of the days to plan, 2-4 tasks (Saturday and Sunday lighter) that take "
    "the ideas from plan to published to pushed: write the script or shot list → prepare "
    "props, location, people → film or shoot → edit and write the caption → post at the "
    "best time → reply to every comment, share it where the audience is, follow up people "
    "who ask the price → check its results. Spread each idea's steps over the week in a "
    "sensible order. A few tasks may handle the week's other posts in the data (approve a "
    "waiting draft, reply on a recent post). The last day ends with a short review against "
    "the goals.\n"
    "   Each task: {\"day\": \"YYYY-MM-DD\", \"category\": one of content | engagement | growth | "
    "review, \"title\": starts with a verb, under 70 characters, names the product or post, "
    "\"detail\": 1 sentence — exactly what to do, \"idea\": the index (0, 1, 2) of the idea it "
    "builds or null, \"goal\": the index of the goal it serves or null}.\n"
    "   Every task small enough for under an hour, practical for a small team — no filler "
    "like 'stay consistent' or 'be creative'. Engagement tasks only on posts that are "
    "published or scheduled, the day after they go out.\n"
    "If the data has no products, build the ideas around the brand's service or the brand "
    "itself and say in focus that adding products to the Products page would sharpen them.\n"
    "Plain, friendly English.\n"
    'Respond with ONLY a JSON object: {"ideas": [...], "goals": [...], "focus": "...", '
    '"tasks": [...]}'
)


IDEA_FIELDS = {"product": 200, "title": 120, "format": 40, "hook": 200, "why_viral": 300, "platform": 30, "how": 600}


def _clean(raw: dict, days: list[date]) -> tuple[list[dict], list[dict], str, list[dict]]:
    ideas = [
        {k: " ".join(str(i.get(k) or "").split())[:n] for k, n in IDEA_FIELDS.items()}
        for i in (raw.get("ideas") or [])[:3]
        if isinstance(i, dict) and i.get("title")
    ]
    goals = [
        {k: " ".join(str(g.get(k) or "").split())[:200] for k in ("title", "why", "measure")}
        for g in (raw.get("goals") or [])[:3]
        if isinstance(g, dict) and g.get("title")
    ]
    focus = " ".join(str(raw.get("focus") or "").split())[:400]
    isos = {d.isoformat() for d in days}
    per_day: dict[str, int] = {}
    tasks = []
    for t in raw.get("tasks") or []:
        if not isinstance(t, dict):
            continue
        day = str(t.get("day") or "")[:10]
        title = " ".join(str(t.get("title") or "").split())[:120]
        if day not in isos or not title or per_day.get(day, 0) >= MAX_TASKS_PER_DAY:
            continue
        per_day[day] = per_day.get(day, 0) + 1
        cat = str(t.get("category") or "").lower()
        goal = t.get("goal")
        idea = t.get("idea")
        tasks.append(
            {
                "id": uuid.uuid4().hex[:10],
                "day": day,
                "category": cat if cat in CATEGORIES else "content",
                "title": title,
                "detail": " ".join(str(t.get("detail") or "").split())[:300],
                "goal": goal if isinstance(goal, int) and 0 <= goal < len(goals) else None,
                "idea": idea if isinstance(idea, int) and 0 <= idea < len(ideas) else None,
                "done": False,
                "done_by": "",
                "done_at": None,
                "custom": False,
            }
        )
    tasks.sort(key=lambda t: t["day"])
    return ideas, goals, focus, tasks


def build_plan(db: Session, brand_id: int, start: date, step=lambda _p, _u, _s: None) -> ActivityPlan:
    """Writes (or rewrites) the brand's plan for the week starting ``start``.
    Ticked tasks and the team's own tasks from an earlier version are kept.
    ``step(progress, upto, text)`` reports where it is — the page's progress
    bar creeps from ``progress`` towards ``upto`` until the next step."""
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise ContentAIError("Brand not found.")
    billing.bind_brand(brand_id)  # often runs in a worker thread: charge the brand's workspace
    days = _plan_days(start)
    step(5, 20, "Reading last week's results…")
    data = _data(db, brand, start)
    step(20, 28, "Looking at your products and this week's posts…")
    step(28, 92, "Coming up with ideas for your products and planning the tasks…")
    raw = _chat(
        [{"role": "system", "content": PLAN_PROMPT}, {"role": "user", "content": data}],
        get_settings().azure_openai_deployment,
        max_tokens=12000,
    )
    step(92, 99, "Putting the checklist together…")
    if not isinstance(raw, dict):
        raise ContentAIError("The AI returned no plan.")
    ideas, goals, focus, tasks = _clean(raw, days)
    if not tasks:
        raise ContentAIError("The AI returned no tasks.")
    plan = db.scalar(select(ActivityPlan).where(ActivityPlan.brand_id == brand_id, ActivityPlan.week_start == start))
    if plan is None:
        plan = ActivityPlan(brand_id=brand_id, week_start=start)
        db.add(plan)
    else:
        kept = [t for t in plan.tasks if t.get("done") or t.get("custom")]
        tasks = kept + tasks
    plan.ideas, plan.goals, plan.focus, plan.tasks = ideas, goals, focus, tasks
    db.commit()
    db.refresh(plan)
    return plan


# ── background jobs (one per brand, like website checks) ──────────────────
_jobs: dict[int, dict] = {}
_jobs_lock = threading.Lock()


def job_status(brand_id: int) -> dict | None:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j and j["status"] != "running" and datetime.now(UTC) - j["_at"] > timedelta(minutes=10):
            _jobs.pop(brand_id, None)
            return None
        return {k: v for k, v in j.items() if not k.startswith("_")} if j else None


def _step(brand_id: int, progress: int, upto: int, text: str) -> None:
    with _jobs_lock:
        if brand_id in _jobs:
            _jobs[brand_id].update(progress=progress, upto=upto, step=text, _at=datetime.now(UTC))


def _running(start: date) -> dict:
    return {
        "status": "running",
        "week_start": start.isoformat(),
        "progress": 2,
        "upto": 5,
        "step": "Starting…",
        "error": "",
        "_at": datetime.now(UTC),
    }


def _run_job(brand_id: int, start: date) -> None:
    db = SessionLocal()
    try:
        build_plan(db, brand_id, start, step=lambda p, u, s: _step(brand_id, p, u, s))
        status, error = "done", ""
    except ContentAIError as exc:
        db.rollback()
        status, error = "failed", str(exc)
    except Exception:  # noqa: BLE001 — show the failure on the page, not just the log
        db.rollback()
        log.exception("activity plan crashed for brand %s", brand_id)
        status, error = "failed", "Making the plan failed — try again in a minute."
    finally:
        db.close()
    with _jobs_lock:
        _jobs[brand_id] = {
            **_jobs.get(brand_id, {}),
            "status": status,
            "error": error,
            **({"progress": 100, "upto": 100, "step": "Done"} if status == "done" else {}),
            "_at": datetime.now(UTC),
        }


def start_job(brand_id: int, start: date) -> dict:
    with _jobs_lock:
        if (_jobs.get(brand_id) or {}).get("status") == "running":
            raise HTTPException(409, "Already planning this brand's week — give it a minute.")
        _jobs[brand_id] = _running(start)
    threading.Thread(target=_run_job, args=(brand_id, start), daemon=True, name=f"activity-{brand_id}").start()
    return job_status(brand_id)


# ── Monday auto-plans (called every minute by content_scheduler._tick) ────
_auto_tried: set[tuple[int, date]] = set()
_auto_running = threading.Lock()


def _auto_run(pairs: list[tuple[int, date]]) -> None:
    try:
        for brand_id, start in pairs:
            with _jobs_lock:
                if (_jobs.get(brand_id) or {}).get("status") == "running":
                    continue
                _jobs[brand_id] = _running(start)
            _run_job(brand_id, start)
    finally:
        _auto_running.release()


def auto_tick(db: Session, now: datetime) -> int:
    """On Monday from AUTO_AT, plan the week for brands with Auto-generate on
    and no plan yet — in the background, so the minute loop never waits."""
    if now.weekday() != 0 or now.time() < AUTO_AT:
        return 0
    start = now.date()
    pairs = []
    for brand_id in db.scalars(select(Automation.brand_id).where(Automation.enabled.is_(True))).all():
        if (brand_id, start) in _auto_tried:
            continue
        _auto_tried.add((brand_id, start))
        exists = db.scalar(
            select(ActivityPlan.id).where(ActivityPlan.brand_id == brand_id, ActivityPlan.week_start == start)
        )
        if not exists:
            pairs.append((brand_id, start))
    if not pairs or not _auto_running.acquire(blocking=False):
        return 0
    threading.Thread(target=_auto_run, args=(pairs[:20],), daemon=True, name="activity-auto").start()
    return len(pairs[:20])


# ── API ───────────────────────────────────────────────────────────────────
def _out(plan: ActivityPlan | None) -> dict | None:
    if plan is None:
        return None
    return {
        "id": plan.id,
        "brand_id": plan.brand_id,
        "week_start": plan.week_start.isoformat(),
        "ideas": plan.ideas,
        "goals": plan.goals,
        "focus": plan.focus,
        "tasks": plan.tasks,
        "updated_at": plan.updated_at,
    }


def _week(raw: str | None) -> date:
    try:
        return week_start_of(date.fromisoformat(raw)) if raw else week_start_of(_today())
    except ValueError as exc:
        raise HTTPException(422, "week must be a date like 2026-10-05") from exc


@router.get("")
def activity_view(
    brand_id: int, week: str | None = None, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    owned(db, Brand, brand_id, ws, "Brand")
    start = _week(week)
    plan = db.scalar(select(ActivityPlan).where(ActivityPlan.brand_id == brand_id, ActivityPlan.week_start == start))
    return {
        "week_start": start.isoformat(),
        "days": [(start + timedelta(days=i)).isoformat() for i in range(7)],
        "today": _today().isoformat(),
        "plan": _out(plan),
        "job": job_status(brand_id),
    }


class GenerateIn(BaseModel):
    brand_id: int
    week: str | None = None


@router.post("/generate", status_code=202)
def activity_generate(payload: GenerateIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, payload.brand_id, ws, "Brand")
    billing.require(ws)  # out of credit → a clear message now, not a failed job later
    return start_job(payload.brand_id, _week(payload.week))


@router.get("/job")
def activity_job(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, brand_id, ws, "Brand")
    return job_status(brand_id) or {"status": "idle"}


class TaskPatch(BaseModel):
    done: bool


def _find(plan: ActivityPlan, task_id: str) -> int:
    for n, t in enumerate(plan.tasks):
        if t.get("id") == task_id:
            return n
    raise HTTPException(404, "Task not found.")


@router.patch("/{plan_id}/tasks/{task_id}")
def activity_tick(
    plan_id: int,
    task_id: str,
    payload: TaskPatch,
    db: Session = Depends(get_db),
    user: TeamMember = Depends(get_current_user),
):
    plan = owned(db, ActivityPlan, plan_id, user.workspace_id, "Plan")
    n = _find(plan, task_id)
    tasks = [dict(t) for t in plan.tasks]  # a new list, so the JSONB change is saved
    tasks[n].update(
        done=payload.done,
        done_by=user.name if payload.done else "",
        done_at=datetime.now(UTC).isoformat() if payload.done else None,
    )
    plan.tasks = tasks
    db.commit()
    db.refresh(plan)
    return _out(plan)


class TaskIn(BaseModel):
    day: date
    title: str = Field(min_length=1, max_length=120)
    category: str = "content"


@router.post("/{plan_id}/tasks", status_code=201)
def activity_add(
    plan_id: int, payload: TaskIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    plan = owned(db, ActivityPlan, plan_id, ws, "Plan")
    if not plan.week_start <= payload.day < plan.week_start + timedelta(days=7):
        raise HTTPException(422, "That day isn't in this plan's week.")
    task = {
        "id": uuid.uuid4().hex[:10],
        "day": payload.day.isoformat(),
        "category": payload.category if payload.category in CATEGORIES else "content",
        "title": " ".join(payload.title.split()),
        "detail": "",
        "goal": None,
        "done": False,
        "done_by": "",
        "done_at": None,
        "custom": True,
    }
    plan.tasks = [*plan.tasks, task]
    db.commit()
    db.refresh(plan)
    return _out(plan)


@router.delete("/{plan_id}/tasks/{task_id}")
def activity_remove(plan_id: int, task_id: str, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    plan = owned(db, ActivityPlan, plan_id, ws, "Plan")
    n = _find(plan, task_id)
    plan.tasks = [t for i, t in enumerate(plan.tasks) if i != n]
    db.commit()
    db.refresh(plan)
    return _out(plan)
