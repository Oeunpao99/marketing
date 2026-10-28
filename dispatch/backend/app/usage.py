"""What a plan makes a month — videos, images and the longest video (the sales
packages of 2026-10-28). Customers see these counts, never credits: credits stay
underneath as the hidden fair-use cap (app/billing.py).

A job's ``units`` is how many of the month's videos (or images) it uses, fixed
when it's made — a template video by its length, an AI-filmed clip 3, a picture
1; re-shapes, edits, the editor's exports and a Story's single scenes 0. A job
that fails gives its units back (it isn't counted). The month is the calendar
month in Phnom Penh, like the credits (billing.month_start).

The numbers per plan are set in the admin portal (PlanLimit rows); a plan with
no row uses DEFAULTS. A video / image pack paid this month (a Payment with plan
"credits" and videos / images) adds to the month's limit.
"""

from __future__ import annotations

import math

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import billing
from app.database import get_db
from app.models import GenerationJob, Payment, PlanLimit, Workspace
from app.tenancy import current_workspace_id

VIDEO_KINDS = ("motion", "video", "scene")
IMAGE_KINDS = ("image",)
FILMED_UNITS = 3  # an AI-filmed clip (Sora) costs ~10x a template video

# plan → videos a month, images a month, the longest video (seconds)
DEFAULTS = {
    "free": {"videos": 1, "images": 2, "longest": 40},
    "starter": {"videos": 2, "images": 60, "longest": 60},
    "pro": {"videos": 8, "images": 150, "longest": 180},
    "business": {"videos": 20, "images": 400, "longest": 600},
    "enterprise": {"videos": 50, "images": 1200, "longest": 600},
}


def video_units(seconds: float, plan: str = "") -> int:
    """How many of the month's videos a template video of ``seconds`` uses: up to a
    minute (the 24–40 s video and a bit) = 1; to 3 minutes = 2; longer = 1 per 3 minutes."""
    s = max(0.0, float(seconds or 0))
    if s <= 60:
        return 1
    if s <= 180:
        return 2
    return math.ceil(s / 180)


def limits(db: Session, plan: str) -> dict:
    """{videos, images, longest} for ``plan`` — the admin portal's row, else the default."""
    row = db.get(PlanLimit, plan)
    base = dict(DEFAULTS.get(plan, DEFAULTS["free"]))
    if row is not None:
        base.update(videos=row.videos, images=row.images, longest=row.longest_seconds)
    return base


def extra(db: Session, ws: int) -> tuple[int, int]:
    """(videos, images) the packs paid this month add."""
    v, i = db.execute(
        select(func.coalesce(func.sum(Payment.videos), 0), func.coalesce(func.sum(Payment.images), 0)).where(
            Payment.workspace_id == ws,
            Payment.plan == "credits",  # payments.TOP_UP
            Payment.status == "paid",
            Payment.paid_at >= billing.month_start(),
        )
    ).one()
    return int(v or 0), int(i or 0)


def _month(db: Session, ws: int, plan: str) -> dict:
    """The plan's limits with this month's packs added."""
    lim = limits(db, plan)
    v, i = extra(db, ws)
    return {**lim, "videos": lim["videos"] + v, "images": lim["images"] + i, "extra_videos": v, "extra_images": i}


def _plan(db: Session, ws: int) -> str:
    return db.scalar(select(Workspace.plan).where(Workspace.id == ws)) or "free"


def longest(db: Session, ws: int) -> int:
    """The longest video this workspace's plan makes (seconds) — the storyboard's cap."""
    return limits(db, _plan(db, ws))["longest"]


def check_length(db: Session, ws: int, length: str, need: int) -> None:
    """Refuse a storyboard longer than the plan makes: the length picked (60 / 120 /
    300 / 600 s) over it, or a pasted story that needs far more (a little over is
    planned to fit — the AI shortens it)."""
    plan = _plan(db, ws)
    most = limits(db, plan)["longest"]
    label = billing.PLAN_LABEL.get(plan, plan.title())
    top = f"{most // 60} min" if most >= 60 else f"{most} s"
    if length in ("60", "120", "300", "600") and int(length) > most:
        raise HTTPException(402, f"Your {label} plan makes videos up to {top}. Pick a shorter length, or upgrade for longer videos.")
    if need > most * 1.5:
        need_txt = f"about {round(need / 60)} min" if need >= 90 else f"about {need} s"
        raise HTTPException(
            402,
            f"This story needs {need_txt}, and your {label} plan makes videos up to {top}. "
            "Shorten the story, split it into parts, or upgrade for longer videos.",
        )


def used(db: Session, ws: int, kinds: tuple[str, ...]) -> int:
    """This month's units of ``kinds`` — jobs that are made or still making (failed ones don't count)."""
    return int(
        db.scalar(
            select(func.coalesce(func.sum(GenerationJob.units), 0)).where(
                GenerationJob.workspace_id == ws,
                GenerationJob.kind.in_(kinds),
                GenerationJob.status != "failed",
                GenerationJob.created_at >= billing.month_start(),
            )
        )
        or 0
    )


def summary(db: Session, ws: int) -> dict:
    """What the plan makes this month and how much is left — the app's top bar and Plans page."""
    plan = _plan(db, ws)
    lim = _month(db, ws, plan)
    v, i = used(db, ws, VIDEO_KINDS), used(db, ws, IMAGE_KINDS)
    when = billing.next_reset()
    return {
        "plan": plan,
        "plan_label": billing.PLAN_LABEL.get(plan, plan.title()),
        "videos": {"used": v, "limit": lim["videos"], "left": max(0, lim["videos"] - v), "extra": lim["extra_videos"]},
        "images": {"used": i, "limit": lim["images"], "left": max(0, lim["images"] - i), "extra": lim["extra_images"]},
        "longest_seconds": lim["longest"],
        "refills_at": when.isoformat(),
    }


def _refill_day() -> str:
    when = billing.next_reset()
    return f"{when:%b} {when.day}"


def require_video(db: Session, ws: int, units: int = 1, seconds: float | None = None) -> None:
    """Refuse a new video when the month's videos are used up, or it's longer than the
    plan allows — a friendly line the page shows as it is (HTTP 402)."""
    plan = _plan(db, ws)
    lim = _month(db, ws, plan)
    if seconds is not None and seconds > lim["longest"] + 5:  # a few seconds of slack for the voice
        longest = f"{lim['longest'] // 60} min" if lim["longest"] >= 60 else f"{lim['longest']} s"
        raise HTTPException(
            402,
            f"Your {billing.PLAN_LABEL.get(plan, plan.title())} plan makes videos up to {longest}. "
            "Shorten the story, split it into parts, or upgrade for longer videos.",
        )
    left = lim["videos"] - used(db, ws, VIDEO_KINDS)
    if units > left:
        if left <= 0:
            raise HTTPException(
                402,
                f"You've made all {lim['videos']} videos this month — they refill on {_refill_day()}. "
                "Add a video pack or upgrade for more.",
            )
        raise HTTPException(
            402,
            f"This video uses {units} of your videos and you have {left} left this month. "
            "Make it shorter, add a video pack, or upgrade.",
        )


def require_image(db: Session, ws: int, count: int = 1) -> None:
    """Refuse a new image when the month's images are used up (HTTP 402)."""
    lim = _month(db, ws, _plan(db, ws))
    left = lim["images"] - used(db, ws, IMAGE_KINDS)
    if count > left:
        raise HTTPException(
            402,
            f"You've made all {lim['images']} images this month — they refill on {_refill_day()}. "
            "Add an image pack or upgrade for more.",
        )


def admin_limits(db: Session) -> list[dict]:
    """The admin portal's table: each plan's videos / images / longest, and whether it's the default."""
    return [{"plan": p, "label": billing.PLAN_LABEL.get(p, p.title()), **limits(db, p), "custom": db.get(PlanLimit, p) is not None} for p in DEFAULTS]


def save_admin_limits(db: Session, plans: dict[str, dict[str, int]]) -> list[dict]:
    """Set plans' limits (checked first, all or nothing) — {plan: {videos, images, longest}}."""
    for plan, v in plans.items():
        if plan not in DEFAULTS:
            raise HTTPException(422, f"There's no plan called {plan}.")
        if not (0 <= v.get("videos", -1) <= 10000 and 0 <= v.get("images", -1) <= 100000 and 20 <= v.get("longest", 0) <= 1800):
            raise HTTPException(422, f"{billing.PLAN_LABEL.get(plan, plan)}: 0–10,000 videos, 0–100,000 images, a longest video of 20–1,800 seconds.")
    for plan, v in plans.items():
        row = db.get(PlanLimit, plan) or PlanLimit(plan=plan)
        row.videos, row.images, row.longest_seconds = v["videos"], v["images"], v["longest"]
        db.add(row)
    db.commit()
    return admin_limits(db)


router = APIRouter(prefix="/usage", tags=["Usage"])


@router.get("")
def usage_endpoint(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)) -> dict:
    """This month's videos and images, used and left, and the longest video — the app's top bar and Plans page."""
    return summary(db, ws)
