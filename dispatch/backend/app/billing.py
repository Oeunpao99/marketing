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
from app.security import hash_password, verify_password
from app.tenancy import current_workspace_id, get_current_user, require_manager

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
# Starter 1,500 (was 1,000): its package (4 videos, 60 images, a post a day, 2026-10-28) needs ~1,060
PLAN_CREDITS = {"free": 100, "starter": 1500, "pro": 3000, "business": 9000, "enterprise": 30000}
PLAN_CREDIT = {plan: credits / CREDITS_PER_USD for plan, credits in PLAN_CREDITS.items()}
# "pro" is sold as Growth (the packages of 2026-10-28) — the id stays, only the name changed
PLAN_LABEL = {"free": "Free", "starter": "Starter", "pro": "Growth", "business": "Business", "enterprise": "Enterprise"}


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


def _counted(ws: int, since: datetime, claim_at: datetime | None):
    """This month's entries that count against the credits: every claim and
    grant, and spends from the month's first claim on — AI used before it
    (the dollar system, before credits had to be claimed) isn't charged again.
    Credits sent to another account always count."""
    spent_since = claim_at or datetime.max.replace(tzinfo=UTC)
    return (
        (CreditEntry.workspace_id == ws)
        & (CreditEntry.created_at >= since)
        & ((CreditEntry.amount_usd > 0) | (CreditEntry.kind == "transfer_out") | (CreditEntry.created_at >= spent_since))
    )


def _spend_from(db: Session, ws: int, since: datetime) -> datetime | None:
    """When this month's spends start to count: the month's first claim — or first credits
    bought (app/payments.py), else AI used before the claim would never come off them."""
    return db.scalar(
        select(func.min(CreditEntry.created_at)).where(
            CreditEntry.workspace_id == ws, CreditEntry.kind.in_(("monthly", "purchase")), CreditEntry.created_at >= since
        )
    )


def balance(db: Session, ws: int) -> dict:
    row = db.execute(select(Workspace.plan, Workspace.plan_paid_until).where(Workspace.id == ws)).first()
    plan = (row.plan if row else None) or "free"
    paid_until = row.plan_paid_until if row else None
    credit = PLAN_CREDIT.get(plan, 0.0)
    since = month_start()
    claim_at, claimed_usd = db.execute(
        select(func.min(CreditEntry.created_at), func.coalesce(func.sum(CreditEntry.amount_usd), 0)).where(
            CreditEntry.workspace_id == ws, CreditEntry.kind == "monthly", CreditEntry.created_at >= since
        )
    ).one()
    by_kind = {
        kind: float(total or 0)
        for kind, total in db.execute(
            select(CreditEntry.kind, func.sum(CreditEntry.amount_usd)).where(_counted(ws, since, _spend_from(db, ws, since))).group_by(CreditEntry.kind)
        ).all()
    }
    total = sum(by_kind.values())  # claims and grants in, spends (since the claim) out
    spent = -sum(v for k, v in by_kind.items() if v < 0 and k != "transfer_out")  # AI used — not credits sent
    claimed = claim_at is not None
    # what's still to claim this month: all of the plan's credits, or — after an
    # upgrade (Pro claimed, now Enterprise) — the difference
    due = max(0, PLAN_CREDITS.get(plan, 0) - round(to_credits(float(claimed_usd))))
    pending = _pending(db, ws)
    return {
        "plan": plan,
        "plan_label": PLAN_LABEL.get(plan, plan.title()),
        # a plan paid for with KHQR runs until then (app/payments.py); None = doesn't expire
        "plan_paid_until": paid_until.isoformat() if paid_until else None,
        "monthly_credit": credit,
        "spent": round(spent, 6),
        "pending": round(pending, 6),
        "balance": round(total, 6),
        "available": round(total - pending, 6),
        "resets_at": next_reset().isoformat(),
        # this month's credits: claimed yet? (they're added only when claimed)
        "claimed": claimed,
        "claim_available": due > 0,
        "claim_credits": due,
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
                f"This month's {now['claim_credits']:,} AI credits are ready — claim them from the bell or your "
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
_KIND_LABEL = {
    "text": "AI writing",
    "image": "Images",
    "video": "Videos",
    "grant": "Credit added",
    "monthly": "Monthly credits",
    "purchase": "Credits bought",
    "transfer_in": "Credits received",
    "transfer_out": "Credits sent",
}


@router.get("")
def billing_overview(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Settings → Billing: plan, this month's credit, where it went, recent spends."""
    out = balance(db, ws)
    out["account_no"] = account_no(db, ws)
    since = month_start()
    rows = db.execute(
        select(CreditEntry.kind, func.sum(CreditEntry.amount_usd), func.count(), func.sum(CreditEntry.tokens), func.sum(CreditEntry.seconds))
        .where(_counted(ws, since, _spend_from(db, ws, since)))  # the same entries the balance counts
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
    if PLAN_CREDITS.get(w.plan, 0) <= 0:
        raise HTTPException(409, "Your plan has no monthly credits — choose a plan to get them.")
    added = grant_month(db, w, user.id)
    db.commit()
    return {**balance(db, ws), "claimed_now": added}


def grant_month(db: Session, w: Workspace, user_id: int | None) -> int:
    """Add this month's credits still due on ``w``'s plan (all of them, or what
    an upgrade adds) to the ledger — the caller commits. Returns how many.
    Used by Claim and by a paid upgrade (app/payments.py)."""
    since = month_start()
    due = balance(db, w.id)["claim_credits"]  # the plan's credits, or what an upgrade adds
    if due <= 0:
        return 0
    topup = due < PLAN_CREDITS.get(w.plan, 0)
    db.add(
        CreditEntry(
            workspace_id=w.id,
            user_id=user_id,
            kind="monthly",
            amount_usd=round(due / CREDITS_PER_USD, 6),
            cost_usd=0,
            note=f"{due:,} monthly credits — {PLAN_LABEL.get(w.plan, w.plan)} plan{' (upgrade)' if topup else ''}, {since:%B %Y}",
        )
    )
    return due


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


KEEP_DAYS = 90  # "Clear older history" keeps the last 3 months
_PP = timezone(timedelta(hours=7))  # the date filter's days are Phnom Penh days


def _day(s: str, end: bool = False) -> datetime | None:
    """"2026-10-21" → the start of that Phnom Penh day (or of the next, for an end)."""
    try:
        d = datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=_PP)
    except (TypeError, ValueError):
        return None
    return d + timedelta(days=1) if end else d


def _activity_page(db: Session, ws: int, page: int, per_page: int, start: str = "", end: str = "", flow: str = "") -> dict:
    """One page of the workspace's credit ledger, newest first — optionally only
    days ``start``..``end`` ("YYYY-MM-DD", inclusive) and only credits "in" or "out"."""
    per_page = max(1, min(per_page, 50))
    hidden = db.scalar(select(Workspace.activity_hidden_before).where(Workspace.id == ws))
    shown = [CreditEntry.workspace_id == ws]
    if hidden:
        shown.append(CreditEntry.created_at >= hidden)
    cond = list(shown)
    if (a := _day(start)) is not None:
        cond.append(CreditEntry.created_at >= a)
    if (b := _day(end, end=True)) is not None:
        cond.append(CreditEntry.created_at < b)
    if flow == "in":
        cond.append(CreditEntry.amount_usd > 0)
    elif flow == "out":
        cond.append(CreditEntry.amount_usd <= 0)
    total = db.scalar(select(func.count()).select_from(CreditEntry).where(*cond)) or 0
    # rows past 3 months, still shown → Billing suggests clearing them
    older = db.scalar(
        select(func.count()).select_from(CreditEntry).where(*shown, CreditEntry.created_at < datetime.now(UTC) - timedelta(days=KEEP_DAYS))
    ) or 0
    pages = max(1, -(-total // per_page))
    page = max(1, min(page, pages))
    names = dict(db.execute(select(TeamMember.id, TeamMember.name).where(TeamMember.workspace_id == ws)).all())
    rows = db.scalars(
        select(CreditEntry)
        .where(*cond)
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
        "recent_older": older,
        "recent_keep_days": KEEP_DAYS,
    }


@router.get("/activity")
def billing_activity(
    page: int = 1,
    per_page: int = ACTIVITY_PAGE,
    start: str = "",
    end: str = "",
    flow: str = "",
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    """Settings → Billing → Recent activity, a page at a time (filtered by days / in-out)."""
    return _activity_page(db, ws, page, per_page, start, end, flow)


USAGE_TYPES = {"writing": ("text",), "images": ("image",), "videos": ("video",)}


@router.get("/usage")
def credit_usage(
    period: str = "month",
    type: str = "all",
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    """The Command center's AI-credits card: credits in and used over ``period`` ("month" =
    this month, "last_month", "7d", "28d", "90d" — Phnom Penh days), the credits left now,
    and the credits used per day (by writing / images / videos). ``type`` narrows "used"
    and the bars to one of USAGE_TYPES. Every AI call counts here, also one made before
    the month's claim (the balance doesn't charge those)."""
    now = datetime.now(PHNOM_PENH)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "last_month":
        end = month_start(now).astimezone(PHNOM_PENH)
        start = month_start(end - timedelta(days=1)).astimezone(PHNOM_PENH)
    elif period in ("7d", "28d", "90d"):
        end = today + timedelta(days=1)
        start = end - timedelta(days=int(period[:-1]))
    else:
        period = "month"
        start = month_start(now).astimezone(PHNOM_PENH)
        end = next_reset(now).astimezone(PHNOM_PENH)
    kinds = USAGE_TYPES.get(type)
    in_range = (CreditEntry.workspace_id == ws) & (CreditEntry.created_at >= start) & (CreditEntry.created_at < end)
    spend = (CreditEntry.amount_usd < 0) & (CreditEntry.kind != "transfer_out")

    credits_in = db.scalar(select(func.coalesce(func.sum(CreditEntry.amount_usd), 0)).where(in_range, CreditEntry.amount_usd > 0)) or 0
    day = func.date(func.timezone("Asia/Phnom_Penh", CreditEntry.created_at))
    rows = db.execute(
        select(day, CreditEntry.kind, func.sum(CreditEntry.amount_usd))
        .where(in_range, spend, *([CreditEntry.kind.in_(kinds)] if kinds else []))
        .group_by(day, CreditEntry.kind)
    ).all()
    group = {k: g for g, ks in USAGE_TYPES.items() for k in ks}
    by_day: dict[str, dict] = {}
    for d, kind, usd in rows:
        slot = by_day.setdefault(str(d), {"writing": 0.0, "images": 0.0, "videos": 0.0})
        slot[group.get(kind, "videos")] += to_credits(-float(usd or 0))
    days = []
    d = start
    last = min(end, today + timedelta(days=1))  # no empty bars for days still to come
    while d < end:
        key = d.date().isoformat()
        slot = by_day.get(key, {"writing": 0.0, "images": 0.0, "videos": 0.0})
        days.append({"date": key, **{k: round(v, 1) for k, v in slot.items()}, "used": round(sum(slot.values()), 1), "future": d >= last})
        d += timedelta(days=1)
    return {
        "period": period,
        "type": type if kinds else "all",
        "start": start.date().isoformat(),
        "end": (end - timedelta(days=1)).date().isoformat(),
        "credits_in": to_credits(float(credits_in)),
        "used": round(sum(x["used"] for x in days), 1),
        "left": balance(db, ws)["available_credits"],
        "days": days,
    }


@router.post("/activity/clear-old")
def clear_old_activity(db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """Hide activity older than 3 months from the workspace's list. Nothing is
    deleted — the balance only counts this month, and the admin portal keeps
    the full ledger."""
    w = db.get(Workspace, user.workspace_id)
    cut = datetime.now(UTC) - timedelta(days=KEEP_DAYS)
    if w.activity_hidden_before is None or w.activity_hidden_before < cut:
        w.activity_hidden_before = cut
    db.commit()
    return _activity_page(db, w.id, 1, ACTIVITY_PAGE)


# ── Transfer credits ──────────────────────────────────────────────────────
# Like a bank transfer: each account has a 10-digit number (account_no); type
# the other account's number, see whose it is, send. The sender gets a
# "transfer_out" line, the receiver a "transfer_in" line, in one transaction.
MIN_TRANSFER = 10  # credits
PIN_TRIES = 5  # wrong PINs in a row before transfers lock…
PIN_LOCK = timedelta(minutes=15)  # …for this long
_PIN = re.compile(r"^\d{6}$")


def _pin_ok_shape(pin: str) -> str:
    """A new PIN: 6 digits, not 111111 / 123456 / 654321 — or the reason it isn't."""
    if not _PIN.match(pin):
        return "The PIN is 6 digits."
    if len(set(pin)) == 1 or pin in "0123456789" or pin in "9876543210":
        return "Pick a PIN that's harder to guess (not 111111 or 123456)."
    return ""


def _check_pin(db: Session, member_id: int, pin: str) -> None:
    """Every transfer: the sender's PIN must match. Wrong ones count; the 5th
    in a row locks transfers for 15 minutes. Raises the friendly reason."""
    m = db.scalar(select(TeamMember).where(TeamMember.id == member_id).with_for_update())
    if m is None or not m.transfer_pin_hash:
        raise HTTPException(428, "Set up your transfer PIN first.")
    now = datetime.now(UTC)
    if m.transfer_pin_locked_until and m.transfer_pin_locked_until > now:
        mins = max(1, int((m.transfer_pin_locked_until - now).total_seconds() // 60) + 1)
        raise HTTPException(423, f"Too many wrong PINs — transfers are locked for {mins} more minute{'s' if mins != 1 else ''}.")
    if not verify_password(pin, m.transfer_pin_hash):
        m.transfer_pin_fails = (m.transfer_pin_fails or 0) + 1
        left = PIN_TRIES - m.transfer_pin_fails
        if left <= 0:
            m.transfer_pin_fails = 0
            m.transfer_pin_locked_until = now + PIN_LOCK
            db.commit()
            log.warning("transfer PIN locked for member %s", member_id)
            raise HTTPException(423, "Too many wrong PINs — transfers are locked for 15 minutes.")
        db.commit()
        raise HTTPException(403, f"Wrong PIN — {left} tr{'ies' if left != 1 else 'y'} left.")
    if m.transfer_pin_fails or m.transfer_pin_locked_until:
        m.transfer_pin_fails, m.transfer_pin_locked_until = 0, None
        db.commit()


@router.get("/pin")
def pin_status(db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    """Is my transfer PIN set? And does changing it need my password (accounts
    that sign in with Google have none — they confirm with the current PIN)."""
    m = db.get(TeamMember, user.id)
    return {"set": bool(m.transfer_pin_hash), "needs_password": bool(m.password_hash)}


@router.post("/pin")
def set_pin(body: dict, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """Set or change the transfer PIN: {"pin": "482913", "password": "…"} —
    confirmed with the account password (or, without one, the current PIN)."""
    m = db.scalar(select(TeamMember).where(TeamMember.id == user.id).with_for_update())
    pin = str(body.get("pin") or "")
    if why := _pin_ok_shape(pin):
        raise HTTPException(422, why)
    if m.password_hash:
        if not verify_password(str(body.get("password") or ""), m.password_hash):
            raise HTTPException(403, "That password isn't right.")
    elif m.transfer_pin_hash:
        _check_pin(db, m.id, str(body.get("current_pin") or ""))
    m.transfer_pin_hash = hash_password(pin)
    m.transfer_pin_fails, m.transfer_pin_locked_until = 0, None
    db.commit()
    log.info("transfer PIN set for member %s", m.id)
    return {"set": True}
_NO = re.compile(r"\D")


def account_no(db: Session, ws: int) -> str:
    """The workspace's account number — made the first time it's needed."""
    import secrets

    w = db.get(Workspace, ws)
    if not w.account_no:
        while True:
            no = str(secrets.randbelow(9 * 10**9) + 10**9)
            if not db.scalar(select(Workspace.id).where(Workspace.account_no == no)):
                break
        w.account_no = no
        db.commit()
    return w.account_no


def _spaced(no: str) -> str:
    """"1400307275" → "140 030 7275", as the app shows it."""
    return f"{no[:3]} {no[3:6]} {no[6:]}"


def _recipient(db: Session, ws: int, raw: str) -> Workspace:
    no = _NO.sub("", raw or "")
    if len(no) != 10:
        raise HTTPException(422, "An account ID has 10 digits.")
    w = db.scalar(select(Workspace).where(Workspace.account_no == no))
    if w is None or w.suspended_at:
        raise HTTPException(404, "No account has that ID — check the number.")
    if w.id == ws:
        raise HTTPException(422, "That's your own account.")
    return w


def _who(db: Session, w: Workspace) -> dict:
    owner = db.scalar(
        select(TeamMember).where(TeamMember.workspace_id == w.id).order_by((TeamMember.role != "owner"), TeamMember.id).limit(1)
    )
    return {
        "account_no": w.account_no,
        "name": w.name,
        "owner": owner.name if owner else "",
        "initials": (owner.initials if owner else "") or (w.name[:2].upper()),
        "plan_label": PLAN_LABEL.get(w.plan, w.plan.title()),
    }


@router.get("/account/{number}")
def lookup_account(number: str, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """Billing → Transfer: whose account is this number? (name, owner, plan)"""
    return _who(db, _recipient(db, user.workspace_id, number))


@router.post("/transfer")
def transfer_credits(
    body: dict,
    db: Session = Depends(get_db),
    user: TeamMember = Depends(require_manager),
):
    """Send credits to another account: {"to": "4821773015", "credits": 500, "note": ""}."""
    ws = user.workspace_id
    try:
        credits = int(body.get("credits") or 0)
    except (TypeError, ValueError):
        credits = 0
    note = str(body.get("note") or "").strip()[:120]
    if credits < MIN_TRANSFER:
        raise HTTPException(422, f"Send at least {MIN_TRANSFER} credits.")
    to = _recipient(db, ws, str(body.get("to") or ""))
    _check_pin(db, user.id, str(body.get("pin") or ""))
    # one transfer at a time per sender, so two clicks can't overspend
    me = db.scalar(select(Workspace).where(Workspace.id == ws).with_for_update())
    if me.suspended_at:
        raise HTTPException(403, "This account is suspended.")
    if PLAN_CREDITS.get(me.plan, 0) <= PLAN_CREDITS["free"]:
        raise HTTPException(403, "Sending credits is for paid plans — choose a plan to send them.")
    have = balance(db, ws)["available_credits"]
    if credits > have:
        raise HTTPException(409, f"You have {int(have):,} credits — that's not enough to send {credits:,}.")
    usd = round(credits / CREDITS_PER_USD, 6)
    mine = account_no(db, ws)
    out = CreditEntry(
        workspace_id=ws,
        user_id=user.id,
        kind="transfer_out",
        amount_usd=-usd,
        cost_usd=0,
        note=f"To {to.name} · {_spaced(to.account_no)}" + (f" — {note}" if note else ""),
    )
    got = CreditEntry(
        workspace_id=to.id,
        user_id=None,
        kind="transfer_in",
        amount_usd=usd,
        cost_usd=0,
        note=f"From {me.name} · {_spaced(mine)}" + (f" — {note}" if note else ""),
    )
    db.add(got)
    db.flush()
    # one reference number on both sides' receipts (kept in `model`, which a
    # transfer has no use for — Recent activity shows it under the line)
    ref = _ref(got.id)
    got.model = out.model = ref
    db.add(out)
    db.commit()
    log.info("credit transfer: ws %s → ws %s, %s credits (by user %s)", ws, to.id, credits, user.id)
    try:
        from app import push

        push.notify_workspace(
            to.id, "credits", f"You received {credits:,} credits", f"From {me.name}" + (f": {note}" if note else ""), url="/", tag="credits"
        )
    except Exception:  # noqa: BLE001 — the transfer is done; a missed push is fine
        log.exception("credit transfer push failed")
    return {
        "sent": credits,
        "to": _who(db, to),
        "at": out.created_at.isoformat() if out.created_at else datetime.now(UTC).isoformat(),
        "ref": ref,
        "note": note,
        **balance(db, ws),
    }


def _ref(entry_id: int) -> str:
    """A transfer's reference number, as on a bank receipt: "TR-000123"."""
    return f"TR-{entry_id:06d}"


# "From PS-AI · 140 030 7275 — thanks" → name, account, note
_FROM = re.compile(r"^From (?P<name>.*) · (?P<no>\d{3} \d{3} \d{4})(?: — (?P<note>.*))?$", re.S)


@router.get("/incoming")
def incoming_credits(after: int | None = None, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Credits received since entry ``after`` — the app checks every few
    seconds and pops up "You received …". Without ``after``: only the newest
    id, to start from (nothing old pops up)."""
    newest = (
        db.scalar(select(func.max(CreditEntry.id)).where(CreditEntry.workspace_id == ws, CreditEntry.kind == "transfer_in")) or 0
    )
    if after is None:
        return {"latest_id": newest, "items": []}
    rows = db.scalars(
        select(CreditEntry)
        .where(CreditEntry.workspace_id == ws, CreditEntry.kind == "transfer_in", CreditEntry.id > after)
        .order_by(CreditEntry.id)
        .limit(5)
    ).all()
    items = []
    for e in rows:
        m = _FROM.match(e.note or "")
        items.append(
            {
                "id": e.id,
                "ref": e.model or _ref(e.id),
                "credits": round(to_credits(float(e.amount_usd))),
                "from_name": m["name"] if m else "",
                "from_account": (m["no"] if m else "").replace(" ", ""),
                "note": (m["note"] or "") if m else (e.note or ""),
                "at": e.created_at.isoformat() if e.created_at else "",
            }
        )
    return {"latest_id": newest, "items": items}


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
