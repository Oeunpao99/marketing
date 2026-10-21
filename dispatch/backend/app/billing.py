"""AI credit — every workspace's monthly allowance for paid AI calls.

Each plan comes with monthly credits (PLAN_CREDITS; customers see credits, the
ledger keeps dollars). They are NOT added by themselves: each month someone in
the workspace CLAIMS them (POST /billing/claim — the bell, the account menu or
Settings → Billing), which writes a "monthly" ``CreditEntry``; a push reminds
them once a month (remind_claims). Every paid AI call writes a ``CreditEntry``
with its *estimated* cost, worked out from what the provider reports
(text/image tokens) or bills by (video seconds), using the price tables below.
The balance is this month's entries (Phnom Penh time) — claims and grants in,
spends out — so unused credit doesn't roll over.

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
import re
from contextvars import ContextVar
from datetime import UTC, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import Brand, CreditEntry, GenerationJob, TeamMember, Workspace
from app.tenancy import current_workspace_id, get_current_user

log = logging.getLogger("app.billing")

router = APIRouter(prefix="/billing", tags=["Billing"])

PHNOM_PENH = timezone(timedelta(hours=7))

# Customers see CREDITS; the ledger keeps US dollars (what we charge, cost ×
# markup — and cost_usd, what the providers charge us), so it still matches the
# provider bills. 1 credit = $0.005 of that charge: a caption ≈ 1-2 credits, an
# image ≈ 10, a motion video ≈ 40-60, an 8 s film clip ≈ 160 (the pricing
# page's numbers). src/lib/money.js CREDITS_PER_USD says the same.
CREDITS_PER_USD = 200

# Monthly AI credits per plan (the pricing page, 2026-10-21) — and in dollars.
PLAN_CREDITS = {"free": 100, "starter": 1000, "pro": 3000, "business": 9000, "enterprise": 30000}
PLAN_CREDIT = {plan: credits / CREDITS_PER_USD for plan, credits in PLAN_CREDITS.items()}
PLAN_LABEL = {"free": "Free", "starter": "Starter", "pro": "Pro", "business": "Business", "enterprise": "Enterprise"}


def to_credits(usd: float) -> float:
    """Dollars of AI charge → credits, one decimal (a caption can be 1.3)."""
    return round((usd or 0) * CREDITS_PER_USD, 1)

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
# Credit a text call costs a workspace = our cost × the model's markup (set per
# model in the admin portal, app/ai_models.py); models outside the catalog use this.
DEFAULT_MARKUP = 1.3
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


def begin_request(model: str = "") -> None:
    """Middleware: a fresh holder per request. It's a mutable dict so the
    auth dependency (run in a copied context) can fill it in for the handler.
    ``model``: the writing model the person picked (header X-AI-Model)."""
    _payer.set({"model": (model or "")[:40]})


def bind_user(user: TeamMember) -> None:
    holder = _payer.get()
    if holder is not None:
        holder.update(ws=user.workspace_id, user=user.id)


def bind(ws: int | None, user_id: int | None = None, model: str = "") -> None:
    """Background work: charge AI calls in this thread to workspace ``ws``
    (and write with ``model`` when the person picked one — app/ai_models.py)."""
    _payer.set({"ws": ws, "user": user_id, "model": model or ""})


def requested_model() -> str:
    """The writing model picked for this request / background job, or ""."""
    return (_payer.get() or {}).get("model") or ""


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


def video_cost(provider: str, seconds: int, model: str | None = None) -> float:
    model = (model or video_model(provider)).lower()
    rate = next((price for key, price in VIDEO_PRICES if key in model), DEFAULT_VIDEO)
    return rate * billed_seconds(provider, seconds)


def job_cost(job: GenerationJob) -> float:
    """Estimated cost of a finished (or, for holds, pending) generation job."""
    if job.kind == "image":
        if job.status == "succeeded":
            return image_cost(job.input_tokens or 0, job.output_tokens or 0)
        return IMAGE_HOLD
    if job.kind in ("video", "scene"):
        return video_cost(job.provider or get_settings().video_provider, job.seconds or 0, job.model or None)
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
    by_kind = {
        kind: float(total or 0)
        for kind, total in db.execute(
            select(CreditEntry.kind, func.sum(CreditEntry.amount_usd))
            .where(CreditEntry.workspace_id == ws, CreditEntry.created_at >= since)
            .group_by(CreditEntry.kind)
        ).all()
    }
    total = sum(by_kind.values())  # claims and grants in, spends out
    spent = -sum(v for v in by_kind.values() if v < 0)
    claimed = "monthly" in by_kind
    pending = _pending(db, ws)
    return {
        "plan": plan,
        "plan_label": PLAN_LABEL.get(plan, plan.title()),
        "monthly_credit": credit,
        "spent": round(spent, 6),
        "pending": round(pending, 6),
        "balance": round(total, 6),
        "available": round(total - pending, 6),
        "resets_at": next_reset().isoformat(),
        # this month's credits: claimed yet? (they're added only when claimed)
        "claimed": claimed,
        "claim_available": credit > 0 and not claimed,
        # the same in credits — what the customer sees
        "credits_per_usd": CREDITS_PER_USD,
        "monthly_credits": PLAN_CREDITS.get(plan, 0),
        "spent_credits": to_credits(spent),
        "pending_credits": to_credits(pending),
        "available_credits": to_credits(total - pending),
    }


def _out_of_credit_message() -> str:
    when = next_reset()
    reset = f"{when:%b} {when.day}"
    return (
        f"Your workspace is out of AI credits for this month — they refill on {reset}. "
        "See Settings → Billing."
    )


def require(ws: int | None, needed: float = 0.0, db: Session | None = None) -> None:
    """Refuse a paid AI call when the workspace can't cover it."""
    if ws is None:
        return
    own = db is None
    db = db or SessionLocal()
    try:
        if db.scalar(select(Workspace.suspended_at).where(Workspace.id == ws)):
            raise OutOfCredit("This account is suspended — no AI can be used.")
        now = balance(db, ws)
    finally:
        if own:
            db.close()
    if now["available"] - needed <= 0:
        if now["claim_available"]:
            raise OutOfCredit(
                f"This month's {now['monthly_credits']:,} AI credits are ready — claim them from the bell or your "
                "account menu (top right), then try again."
            )
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
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost: float = 0.0,
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
                input_tokens=input_tokens or 0,
                output_tokens=output_tokens or 0,
                cost_usd=round(cost or amount, 6),
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
    """Charge one chat completion to whoever is paying in this context: what
    the provider charges us (the admin's price per model, app/ai_models.py,
    else TEXT_PRICES) times the model's markup."""
    from app import ai_models

    usage = usage or {}
    model = ai_models.canonical(model)  # "gpt-5-mini-2025-08-07" → "gpt-5-mini"
    tin = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
    tout = usage.get("completion_tokens") or usage.get("output_tokens") or 0
    priced = ai_models.pricing(model)
    if priced:
        cost = (tin * priced[0] + tout * priced[1]) / 1_000_000
        markup = priced[2]
    else:
        cost, markup = text_cost(model, tin, tout), DEFAULT_MARKUP
    ws, user = payer()
    if ws is None:
        log.debug("unattributed AI text call (%s tokens)", tin + tout)
        return cost
    charge(ws, "text", cost * markup, user_id=user, model=model, tokens=tin + tout, note=note, input_tokens=tin, output_tokens=tout, cost=cost)
    return cost


def charge_job(job: GenerationJob) -> None:
    """Charge a generation job that just succeeded (image, video or scene)."""
    kind = "image" if job.kind == "image" else "video"
    model = (
        get_settings().azure_openai_image_deployment
        if job.kind == "image" and job.provider == "azure_openai"
        else get_settings().gemini_image_model
        if job.kind == "image"
        else job.model or video_model(job.provider)
    )
    what = {"image": "Image", "video": "Video", "scene": "Story scene"}.get(job.kind, job.kind)
    # Auto-generated briefs open with boilerplate; their "Post topic:" line
    # is what a person recognises in the activity list.
    topic = re.search(r"Post topic:\s*(.+)", job.prompt or "")
    summary = topic.group(1).strip() if topic else (job.prompt or "")
    charge(
        job.workspace_id,
        kind,
        job_cost(job),
        user_id=job.user_id,
        model=model,
        tokens=job.total_tokens or 0,
        seconds=billed_seconds(job.provider, job.seconds or 0) if kind == "video" else 0,
        note=f"{what}: {summary[:200]}",
        job_id=job.id,
    )


# ── API ───────────────────────────────────────────────────────────────────
_KIND_LABEL = {"text": "AI writing", "image": "Images", "video": "Videos", "grant": "Credit added", "monthly": "Monthly credits"}


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
            "credits": to_credits(-float(total or 0)),
            "count": count,
            "tokens": int(tokens or 0),
            "seconds": int(seconds or 0),
        }
        for kind, total, count, tokens, seconds in sorted(rows, key=lambda r: float(r[1] or 0))
    ]
    out.update(_activity_page(db, ws, 1, ACTIVITY_PAGE))
    return out


@router.post("/claim")
def claim_month(
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Claim this month's credits for the workspace (anyone in it may). Once a
    month: a second claim — a double click, two people — adds nothing."""
    w = db.scalar(select(Workspace).where(Workspace.id == ws).with_for_update())  # one claim at a time
    if w is None or w.suspended_at:
        raise HTTPException(403, "This account is suspended — credits can't be claimed.")
    credits = PLAN_CREDITS.get(w.plan, 0)
    if credits <= 0:
        raise HTTPException(409, "Your plan has no monthly credits — choose a plan to get them.")
    since = month_start()
    done = db.scalar(
        select(func.count()).select_from(CreditEntry).where(
            CreditEntry.workspace_id == ws, CreditEntry.kind == "monthly", CreditEntry.created_at >= since
        )
    )
    added = 0
    if not done:
        db.add(
            CreditEntry(
                workspace_id=ws,
                user_id=user.id,
                kind="monthly",
                amount_usd=round(PLAN_CREDIT[w.plan], 6),
                cost_usd=0,
                note=f"{credits:,} monthly credits — {PLAN_LABEL.get(w.plan, w.plan)} plan, {since:%B %Y}",
            )
        )
        added = credits
    db.commit()
    return {**balance(db, ws), "claimed_now": added}


def remind_claims() -> int:
    """Once a month per workspace: push "your monthly credits are ready" to its
    members (those who turned phone / desktop alerts on). Marked on the
    workspace (credit_notice_month) so a restart doesn't send it twice.
    Returns how many workspaces were reminded."""
    from app import push

    month = month_start().strftime("%Y-%m")
    db = SessionLocal()
    sent = 0
    try:
        due = db.scalars(
            select(Workspace).where(
                Workspace.suspended_at.is_(None),
                Workspace.plan.in_([p for p, c in PLAN_CREDITS.items() if c > 0]),
                (Workspace.credit_notice_month.is_(None)) | (Workspace.credit_notice_month != month),
            )
        ).all()
        for w in due:
            w.credit_notice_month = month
            if balance(db, w.id)["claim_available"]:
                credits = PLAN_CREDITS.get(w.plan, 0)
                push.notify_workspace(
                    w.id,
                    "credits",
                    "Your monthly AI credits are ready",
                    f"{credits:,} credits for {month_start():%B} — open Smart Marketing and tap Claim.",
                    url="/?claim=credits",
                    tag="credits",
                )
                sent += 1
        db.commit()
    finally:
        db.close()
    return sent


ACTIVITY_PAGE = 10  # rows per page of Settings → Billing → Recent activity


def _activity_page(db: Session, ws: int, page: int, per_page: int) -> dict:
    """One page of the workspace's credit ledger, newest first."""
    per_page = max(1, min(per_page, 50))
    total = db.scalar(select(func.count()).select_from(CreditEntry).where(CreditEntry.workspace_id == ws)) or 0
    pages = max(1, -(-total // per_page))
    page = max(1, min(page, pages))
    names = dict(db.execute(select(TeamMember.id, TeamMember.name).where(TeamMember.workspace_id == ws)).all())
    rows = db.scalars(
        select(CreditEntry)
        .where(CreditEntry.workspace_id == ws)
        .order_by(CreditEntry.created_at.desc(), CreditEntry.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()
    return {
        "recent": [
            {
                "id": e.id,
                "kind": e.kind,
                "label": _KIND_LABEL.get(e.kind, e.kind),
                "amount": round(-float(e.amount_usd), 6),
                "credits": to_credits(-float(e.amount_usd)),
                "model": e.model,
                "tokens": e.tokens,
                "seconds": e.seconds,
                "note": e.note,
                "user": names.get(e.user_id, ""),
                "created_at": e.created_at,
            }
            for e in rows
        ],
        "recent_page": page,
        "recent_pages": pages,
        "recent_total": total,
        "recent_per_page": per_page,
    }


@router.get("/activity")
def billing_activity(
    page: int = 1,
    per_page: int = ACTIVITY_PAGE,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    """Settings → Billing → Recent activity, a page at a time."""
    return _activity_page(db, ws, page, per_page)


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
        out["session_spent_credits"] = to_credits(-float(spent or 0))
        out["session_tokens"] = int(tokens or 0)
    return out
