"""AI credit — every workspace's monthly allowance for paid AI calls.

Each plan comes with a monthly credit in USD (Pro: $50). Every paid AI call
writes a ``CreditEntry`` with its *estimated* cost, worked out from what the
provider reports (text/image tokens) or bills by (video seconds), using the
price tables below. The balance is the plan's credit plus this month's
entries (Phnom Penh time), so it refills on the 1st without a cron job and
unused credit doesn't roll over.

When the balance (minus renders still in flight) reaches $0, new AI calls are
refused with ``OutOfCredit``; posting, scheduling and analytics keep working.

Who pays: request handlers learn the workspace from the logged-in user —
``begin_request`` (middleware) opens a per-request holder that
``tenancy.get_current_user`` fills, and the shared chat helpers read it.
Background work (auto-generate, weekly plans) calls ``bind(ws)`` itself;
images and videos are charged from their ``GenerationJob``.

Prices are estimates of the providers' list prices — edit the tables to match
your actual bill.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from datetime import UTC, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import Brand, CreditEntry, GenerationJob, TeamMember, Workspace
from app.tenancy import current_workspace_id, get_current_user

log = logging.getLogger("app.billing")

router = APIRouter(prefix="/billing", tags=["Billing"])

PHNOM_PENH = timezone(timedelta(hours=7))

# Monthly AI credit per plan, USD.
PLAN_CREDIT = {"pro": 50.0, "free": 0.0}
PLAN_LABEL = {"pro": "Pro", "free": "Free"}

# ── price tables (USD, estimates) ─────────────────────────────────────────
# Text: per 1M tokens (input, output). Matched by the longest prefix of the
# model / deployment name; unknown models use DEFAULT_TEXT.
TEXT_PRICES = {
    "gpt-5-nano": (0.05, 0.40),
    "gpt-5-mini": (0.25, 2.00),
    "gpt-5": (1.25, 10.00),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
}
DEFAULT_TEXT = (1.25, 10.00)
# Images from token-billed models (gpt-image-*): per 1M tokens (input, output).
IMAGE_TOKEN_PRICES = (5.00, 40.00)
# Images from models that don't report tokens (Imagen), and the hold for an
# image still rendering.
IMAGE_FLAT = 0.04
IMAGE_HOLD = 0.08
# Video: per second of clip, matched by the first substring found in the model.
VIDEO_PRICES = [
    ("sora-2-pro", 0.30),
    ("sora", 0.10),
    ("veo-3.1-lite", 0.05),
    ("veo-3.1-fast", 0.15),
    ("veo", 0.40),
]
DEFAULT_VIDEO = 0.40


class OutOfCredit(RuntimeError):
    pass


# ── who is paying ─────────────────────────────────────────────────────────
_payer: ContextVar[dict | None] = ContextVar("billing_payer", default=None)


def begin_request() -> None:
    """Middleware: a fresh holder per request. It's a mutable dict so the
    auth dependency (run in a copied context) can fill it in for the handler."""
    _payer.set({})


def bind_user(user: TeamMember) -> None:
    holder = _payer.get()
    if holder is not None:
        holder.update(ws=user.workspace_id, user=user.id)


def bind(ws: int | None, user_id: int | None = None) -> None:
    """Background work: charge AI calls in this thread to workspace ``ws``."""
    _payer.set({"ws": ws, "user": user_id})


def bind_brand(brand_id: int) -> None:
    db = SessionLocal()
    try:
        bind(db.scalar(select(Brand.workspace_id).where(Brand.id == brand_id)))
    finally:
        db.close()


def payer() -> tuple[int | None, int | None]:
    holder = _payer.get() or {}
    return holder.get("ws"), holder.get("user")


# ── pricing ───────────────────────────────────────────────────────────────
def text_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    name = (model or "").lower()
    prices = DEFAULT_TEXT
    for key in sorted(TEXT_PRICES, key=len, reverse=True):
        if name.startswith(key) or key in name:
            prices = TEXT_PRICES[key]
            break
    return (input_tokens * prices[0] + output_tokens * prices[1]) / 1_000_000


def image_cost(input_tokens: int, output_tokens: int) -> float:
    if not input_tokens and not output_tokens:
        return IMAGE_FLAT
    return (input_tokens * IMAGE_TOKEN_PRICES[0] + output_tokens * IMAGE_TOKEN_PRICES[1]) / 1_000_000


def video_model(provider: str) -> str:
    s = get_settings()
    return s.gemini_video_model if provider == "gemini_veo" else s.azure_openai_video_deployment


def billed_seconds(provider: str, seconds: int) -> int:
    """The clip length the provider actually renders (and bills)."""
    if provider == "gemini_veo":
        return 8 if seconds >= 7 else (6 if seconds >= 5 else 4)
    return 12 if seconds >= 10 else (8 if seconds >= 6 else 4)


def video_cost(provider: str, seconds: int) -> float:
    model = video_model(provider).lower()
    rate = next((price for key, price in VIDEO_PRICES if key in model), DEFAULT_VIDEO)
    return rate * billed_seconds(provider, seconds)


def job_cost(job: GenerationJob) -> float:
    """Estimated cost of a finished (or, for holds, pending) generation job."""
    if job.kind == "image":
        if job.status == "succeeded":
            return image_cost(job.input_tokens or 0, job.output_tokens or 0)
        return IMAGE_HOLD
    if job.kind in ("video", "scene"):
        return video_cost(job.provider or get_settings().video_provider, job.seconds or 0)
    return 0.0


# ── balance ───────────────────────────────────────────────────────────────
def month_start(now: datetime | None = None) -> datetime:
    local = (now or datetime.now(UTC)).astimezone(PHNOM_PENH)
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def next_reset(now: datetime | None = None) -> datetime:
    start = month_start(now)
    return (start + timedelta(days=32)).replace(day=1)


def _pending(db: Session, ws: int) -> float:
    """Holds for renders still running (they're charged when they finish)."""
    jobs = db.scalars(
        select(GenerationJob).where(
            GenerationJob.workspace_id == ws,
            GenerationJob.status.in_(("queued", "running")),
            GenerationJob.kind.in_(("image", "video", "scene")),
        )
    ).all()
    return sum(job_cost(j) for j in jobs)


def balance(db: Session, ws: int) -> dict:
    plan = db.scalar(select(Workspace.plan).where(Workspace.id == ws)) or "free"
    credit = PLAN_CREDIT.get(plan, 0.0)
    since = month_start()
    spent = float(
        db.scalar(
            select(func.coalesce(func.sum(CreditEntry.amount_usd), 0)).where(
                CreditEntry.workspace_id == ws, CreditEntry.created_at >= since
            )
        )
        or 0
    )
    pending = _pending(db, ws)
    return {
        "plan": plan,
        "plan_label": PLAN_LABEL.get(plan, plan.title()),
        "monthly_credit": credit,
        # spent is positive; grants (positive entries) count as extra credit.
        "spent": round(-spent, 6),
        "pending": round(pending, 6),
        "balance": round(credit + spent, 6),
        "available": round(credit + spent - pending, 6),
        "resets_at": next_reset().isoformat(),
    }


def _out_of_credit_message() -> str:
    when = next_reset()
    reset = f"{when:%b} {when.day}"
    return (
        f"Your workspace is out of AI credit for this month — it refills on {reset}. "
        "See Settings → Billing."
    )


def require(ws: int | None, needed: float = 0.0, db: Session | None = None) -> None:
    """Refuse a paid AI call when the workspace can't cover it."""
    if ws is None:
        return
    own = db is None
    db = db or SessionLocal()
    try:
        left = balance(db, ws)["available"]
    finally:
        if own:
            db.close()
    if left - needed <= 0:
        raise OutOfCredit(_out_of_credit_message())


def require_current(needed: float = 0.0) -> None:
    require(payer()[0], needed)


def charge(
    ws: int | None,
    kind: str,
    amount: float,
    *,
    user_id: int | None = None,
    model: str = "",
    tokens: int = 0,
    seconds: int = 0,
    note: str = "",
    job_id: int | None = None,
) -> None:
    """Record a spend (``amount`` > 0 is taken off the balance). Uses its own
    session so it never mixes into the caller's transaction."""
    if ws is None or amount <= 0:
        return
    db = SessionLocal()
    try:
        db.add(
            CreditEntry(
                workspace_id=ws,
                user_id=user_id,
                kind=kind,
                amount_usd=-round(amount, 6),
                model=(model or "")[:80],
                tokens=tokens or 0,
                seconds=seconds or 0,
                note=" ".join((note or "").split())[:300],
                job_id=job_id,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 - never lose the user's result over the ledger
        db.rollback()
        log.exception("could not record AI spend for workspace %s", ws)
    finally:
        db.close()


def charge_text(model: str, usage: dict | None, note: str = "") -> float:
    """Charge one chat completion to whoever is paying in this context."""
    usage = usage or {}
    tin = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
    tout = usage.get("completion_tokens") or usage.get("output_tokens") or 0
    cost = text_cost(model, tin, tout)
    ws, user = payer()
    if ws is None:
        log.debug("unattributed AI text call (%s tokens)", tin + tout)
        return cost
    charge(ws, "text", cost, user_id=user, model=model, tokens=tin + tout, note=note)
    return cost


def charge_job(job: GenerationJob) -> None:
    """Charge a generation job that just succeeded (image, video or scene)."""
    kind = "image" if job.kind == "image" else "video"
    model = (
        get_settings().azure_openai_image_deployment
        if job.kind == "image" and job.provider == "azure_openai"
        else get_settings().gemini_image_model
        if job.kind == "image"
        else video_model(job.provider)
    )
    what = {"image": "Image", "video": "Video", "scene": "Story scene"}.get(job.kind, job.kind)
    charge(
        job.workspace_id,
        kind,
        job_cost(job),
        user_id=job.user_id,
        model=model,
        tokens=job.total_tokens or 0,
        seconds=billed_seconds(job.provider, job.seconds or 0) if kind == "video" else 0,
        note=f"{what}: {job.prompt[:200]}",
        job_id=job.id,
    )


# ── API ───────────────────────────────────────────────────────────────────
_KIND_LABEL = {"text": "AI writing", "image": "Images", "video": "Videos", "grant": "Credit added"}


@router.get("")
def billing_overview(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Settings → Billing: plan, this month's credit, where it went, recent spends."""
    out = balance(db, ws)
    since = month_start()
    rows = db.execute(
        select(CreditEntry.kind, func.sum(CreditEntry.amount_usd), func.count(), func.sum(CreditEntry.tokens), func.sum(CreditEntry.seconds))
        .where(CreditEntry.workspace_id == ws, CreditEntry.created_at >= since)
        .group_by(CreditEntry.kind)
    ).all()
    out["breakdown"] = [
        {
            "kind": kind,
            "label": _KIND_LABEL.get(kind, kind),
            "amount": round(-float(total or 0), 6),
            "count": count,
            "tokens": int(tokens or 0),
            "seconds": int(seconds or 0),
        }
        for kind, total, count, tokens, seconds in sorted(rows, key=lambda r: float(r[1] or 0))
    ]
    names = dict(db.execute(select(TeamMember.id, TeamMember.name).where(TeamMember.workspace_id == ws)).all())
    recent = db.scalars(
        select(CreditEntry)
        .where(CreditEntry.workspace_id == ws)
        .order_by(CreditEntry.created_at.desc(), CreditEntry.id.desc())
        .limit(60)
    ).all()
    out["recent"] = [
        {
            "id": e.id,
            "kind": e.kind,
            "label": _KIND_LABEL.get(e.kind, e.kind),
            "amount": round(-float(e.amount_usd), 6),
            "model": e.model,
            "tokens": e.tokens,
            "seconds": e.seconds,
            "note": e.note,
            "user": names.get(e.user_id, ""),
            "created_at": e.created_at,
        }
        for e in recent
    ]
    return out


@router.get("/summary")
def billing_summary(
    since: datetime | None = None,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """The AI Agent's live meter: balance, plus what *you* spent (and how many
    tokens) since ``since`` — the moment the page opened."""
    out = balance(db, ws)
    if since is not None:
        if since.tzinfo is None:
            since = since.replace(tzinfo=UTC)
        spent, tokens = db.execute(
            select(func.coalesce(func.sum(CreditEntry.amount_usd), 0), func.coalesce(func.sum(CreditEntry.tokens), 0)).where(
                CreditEntry.workspace_id == ws,
                CreditEntry.user_id == user.id,
                CreditEntry.created_at >= since,
            )
        ).one()
        out["session_spent"] = round(-float(spent or 0), 6)
        out["session_tokens"] = int(tokens or 0)
    return out
