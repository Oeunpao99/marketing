"""Paying for a plan with KHQR (Bakong) — Settings → Billing → Upgrade.

    GET  /api/billing/plans            the paid plans, their prices (USD + KHR), the
                                       current plan and until when; on_sale = we can take payments
    POST /api/billing/pay              {plan, currency} → a payment: its KHQR code, amount, expiry
    GET  /api/billing/pay/{id}         its status — asks Bakong (at most every few seconds)
    POST /api/billing/pay/{id}/cancel  the customer closed it without paying
    GET  /api/billing/payments         this workspace's payments (receipts)

1. A payment is made for one month of a plan, in USD or KHR, with a fresh
   KHQR (app/khqr.py) paying exactly that amount into OUR Bakong account. It
   expires after PAY_MINUTES.
2. Bakong is asked whether that code was paid (app/bakong.py, by its md5) —
   while the customer's page polls, and from the scheduler every SWEEP_S for
   a payment whose page was closed (sweep()).
3. Paid → checked against what we asked for (our account, the currency, the
   amount) — never on the browser's word — then, once, under a lock: the
   plan switches on for 30 days (renewing the same plan adds 30 days to what's
   left), this month's credits for it are added (billing.grant_month), and the
   workspace is told (push).
4. expire_plans() — from the scheduler — moves a workspace whose paid month
   ended back to Free. A plan set in the admin portal has no end and never expires.

Credit top-ups go the same way: POST /billing/pay {pack} (a CreditPack from the admin
portal; only for a workspace on a paid plan) makes a payment with plan = "credits"
and its ``credits``; paid → a "purchase" ledger entry, which lasts the month like
the plan's own credits. The plan isn't touched.

Prices come from PLAN_PRICES in the server .env; with none (or no Bakong
account / token) nothing is on sale and Upgrade says "Coming soon".
"""

from __future__ import annotations

import json
import logging
import secrets
import threading
import time
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import bakong, billing, khqr, usage
from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import CreditEntry, CreditPack, Payment, PlanPrice, TeamMember, Workspace
from app.tenancy import current_workspace_id, get_current_user

log = logging.getLogger("app.payments")
router = APIRouter(prefix="/billing", tags=["Billing"])
# no sign-in: the website's pricing section reads the prices from here (LandingPage)
public_router = APIRouter(prefix="/public", tags=["Public"])

PAY_MINUTES = 10  # a KHQR is good for this long
PERIOD = timedelta(days=30)  # one payment = one month of the plan
SWEEP_S = 10  # the scheduler looks for payments that are due a check at most this often
# Bakong allows few requests a day (bakong.py: 100 on a new token), so a payment is asked about on
# a schedule by its age — quick at first (people pay within a minute), then slower — and every
# payment that is due goes in ONE request. The page polls OUR server every few seconds; that never
# reaches Bakong by itself.
FIRST_CHECK_S = 6


def _delay_s(age: float) -> float:
    return 8 if age < 120 else 20 if age < 300 else 45


# When the customer's page last asked OUR server about a payment (payment id → time). A payment
# whose page is gone (tab closed — possibly right after paying) is only asked about every
# UNWATCHED_S, which still finds a payment made just before closing within minutes.
_seen: dict[int, datetime] = {}
WATCHED_S = 45  # the page counts as open this long after its last poll
UNWATCHED_S = 180
FOR_SALE = ("starter", "pro", "business")  # the plans a customer can buy (enterprise: talk to us)


_cache: dict = {"at": 0.0, "prices": None}
CACHE_S = 30  # the admin portal's prices are read at most this often (a save clears it)


def prices() -> dict[str, dict[str, float]]:
    """{plan: {"USD": 19.0, "KHR": 79000.0}} — the admin portal's prices (plan_prices),
    each plan's row replacing the built-in / PLAN_PRICES one; a currency left empty
    there isn't sold in it."""
    now = time.monotonic()
    if _cache["prices"] is not None and now - _cache["at"] < CACHE_S:
        return _cache["prices"]
    out = {k: dict(v) for k, v in _env_prices().items()}
    db = SessionLocal()
    try:
        for row in db.scalars(select(PlanPrice)):
            if row.plan not in FOR_SALE:
                continue
            got = {c: float(v) for c, v in (("USD", row.usd), ("KHR", row.khr)) if v is not None and float(v) > 0}
            if got:
                out[row.plan] = got
            else:
                out.pop(row.plan, None)  # both empty: not for sale
    except Exception:  # noqa: BLE001 — the built-in prices rather than nothing (e.g. before the migration)
        log.exception("plan prices: couldn't read plan_prices — using the built-in prices")
    finally:
        db.close()
    _cache.update(at=now, prices=out)
    return out


def clear_prices_cache() -> None:
    _cache.update(at=0.0, prices=None)


# The standard prices (the pricing proposal, 2026-10-23 — the website's PLANS too).
BUILT_IN_PRICES = {"starter": {"USD": 19.0, "KHR": 79000.0}, "pro": {"USD": 49.0, "KHR": 199000.0}, "business": {"USD": 129.0, "KHR": 529000.0}}


def _env_prices() -> dict[str, dict[str, float]]:
    """{plan: {"USD": 19.0, "KHR": 79000.0}}: the built-in prices, with the plans that
    PLAN_PRICES names replaced by its own — a test price for one plan leaves the
    others on sale. "{}" or nothing = the built-in. Bad entries left out."""
    out = {k: dict(v) for k, v in BUILT_IN_PRICES.items()}
    raw = get_settings().plan_prices.strip()
    if not raw:
        return out
    try:
        data = json.loads(raw)
    except ValueError:
        log.error("PLAN_PRICES isn't valid JSON — using the built-in prices")
        return out
    for plan, cur in (data or {}).items():
        if plan not in FOR_SALE or not isinstance(cur, dict):
            continue
        row = {c: float(v) for c, v in cur.items() if c in ("USD", "KHR") and isinstance(v, (int, float)) and v > 0}
        if row:
            out[plan] = row
    return out


def on_sale() -> bool:
    return bakong.configured() and bool(prices())


TOP_UP = "credits"  # Payment.plan of a credit top-up


def _pack_prices(row: CreditPack) -> dict[str, float]:
    return {c: float(v) for c, v in (("USD", row.usd), ("KHR", row.khr)) if v is not None and float(v) > 0}


def packs(db: Session) -> list[dict]:
    """The packs on sale, smallest first: [{id, videos, images, prices: {USD, KHR}}].
    Customers buy videos / images, so a credits-only pack isn't offered (a pack's
    credits ride along unseen)."""
    rows = db.scalars(select(CreditPack).where(CreditPack.active.is_(True)).order_by(CreditPack.videos, CreditPack.images, CreditPack.credits)).all()
    return [
        {"id": r.id, "videos": r.videos or 0, "images": r.images or 0, "prices": _pack_prices(r)}
        for r in rows
        if _pack_prices(r) and (r.videos or r.images)
    ]


# A top-up of the customer's own amount: the admin portal sets a price per 100 credits (kept as
# a plan_prices row under CUSTOM_KEY — not a plan; prices() leaves it out); none = not on sale.
CUSTOM_KEY = "custom_credits"
CUSTOM_MIN, CUSTOM_MAX, CUSTOM_STEP = 100, 100_000, 100


def custom_rate(db: Session) -> dict[str, float]:
    """{"USD": 1.2, "KHR": 5000} — the price of 100 credits; {} = no custom amounts."""
    row = db.get(PlanPrice, CUSTOM_KEY)
    if row is None:
        return {}
    return {c: float(v) for c, v in (("USD", row.usd), ("KHR", row.khr)) if v is not None and float(v) > 0}


def custom_price(rate: dict[str, float], credits: int, currency: str) -> float | None:
    """What ``credits`` cost at the rate: cents in dollars, whole 100 riel in riel."""
    per100 = rate.get(currency)
    if not per100:
        return None
    total = per100 * credits / 100
    return round(total, 2) if currency == "USD" else float(max(100, round(total / 100) * 100))


def _custom_out(db: Session) -> dict | None:
    rate = custom_rate(db)
    return {"per_100": rate, "min": CUSTOM_MIN, "max": CUSTOM_MAX, "step": CUSTOM_STEP} if rate else None


def save_custom_rate(db: Session, usd: float | None, khr: float | None) -> dict | None:
    """The admin portal: the price of 100 credits (both empty = custom amounts off)."""
    if usd is not None and not (0.01 <= usd <= 1000):
        raise HTTPException(422, "The dollar price of 100 credits must be between $0.01 and $1,000.")
    if khr is not None and not (10 <= khr <= 4_000_000):
        raise HTTPException(422, "The riel price of 100 credits must be between 10 and 4,000,000.")
    row = db.get(PlanPrice, CUSTOM_KEY)
    if usd is None and khr is None:
        if row:
            db.delete(row)
    else:
        row = row or PlanPrice(plan=CUSTOM_KEY)
        row.usd = round(usd, 2) if usd is not None else None
        row.khr = round(khr) if khr is not None else None
        db.add(row)
    db.commit()
    log.warning("admin portal: custom credit price set — $%s / %s៛ per 100", usd, khr)
    return _custom_out(db)


def can_top_up(w: Workspace | None) -> bool:
    """Extra credits are for paid plans (the website: "Add-ons for any paid plan")."""
    return bool(w) and w.plan != "free" and billing.PLAN_CREDITS.get(w.plan, 0) > 0


def bought(videos: int, images: int) -> str:
    """ "10 videos", "50 images", "10 videos + 50 images" — a pack, as customers see it."""
    parts = [f"{n:,} {w}{'' if n == 1 else 's'}" for n, w in ((videos, "video"), (images, "image")) if n]
    return " + ".join(parts) or "Extra pack"


def _label(p: Payment) -> str:
    """What a payment bought: "Starter" or "10 videos"."""
    if p.plan == TOP_UP:
        return bought(p.videos or 0, p.images or 0)
    return billing.PLAN_LABEL.get(p.plan, p.plan.title())


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(d: datetime | None) -> datetime | None:
    return d.replace(tzinfo=UTC) if d is not None and d.tzinfo is None else d


def _out(p: Payment) -> dict:
    return {
        "id": p.id,
        "plan": p.plan,
        "plan_label": _label(p),
        "videos": p.videos or 0,  # a pack: the extra videos / images it adds this month
        "images": p.images or 0,
        "currency": p.currency,
        "amount": float(p.amount),
        "amount_text": khqr.amount_text(float(p.amount), p.currency),
        "bill_number": p.bill_number,
        "status": p.status,
        "qr": p.qr if p.status == "pending" else "",
        # Bakong's daily allowance is used up: the payment is safe and is confirmed when it resets
        "delayed": p.status == "pending" and bakong.limited_for() > 0,
        "merchant_name": get_settings().bakong_merchant_name,
        "expires_at": _aware(p.expires_at).isoformat(),
        "paid_at": _aware(p.paid_at).isoformat() if p.paid_at else None,
        "period_end": _aware(p.period_end).isoformat() if p.period_end else None,
        "created_at": _aware(p.created_at).isoformat() if p.created_at else None,
    }


@public_router.get("/prices")
def public_prices(db: Session = Depends(get_db)):
    """The plans' monthly prices and the credit packs, for the website — the same ones
    checkout charges."""
    return {"prices": prices(), "packs": packs(db), "custom": _custom_out(db)}


# ── the admin portal (app/admin.py mounts these behind its own login) ──────
class PriceRow(BaseModel):
    usd: float | None = None
    khr: float | None = None


def admin_prices(db: Session) -> list[dict]:
    rows = {r.plan: r for r in db.scalars(select(PlanPrice))}
    now = prices()
    default = _env_prices()
    return [
        {
            "plan": p,
            "label": billing.PLAN_LABEL[p],
            "monthly_credits": billing.PLAN_CREDITS[p],
            "usd": now.get(p, {}).get("USD"),
            "khr": now.get(p, {}).get("KHR"),
            "default_usd": default.get(p, {}).get("USD"),
            "default_khr": default.get(p, {}).get("KHR"),
            "set_here": p in rows,  # False = the built-in price
            "updated_at": rows[p].updated_at.isoformat() if p in rows and rows[p].updated_at else None,
        }
        for p in FOR_SALE
    ]


def save_admin_prices(db: Session, plans: dict[str, PriceRow]) -> list[dict]:
    """Set each plan's prices — an empty currency isn't sold in it. Checked first:
    a whole USD amount up to $10,000 (cents allowed), whole riel up to 40,000,000."""
    for plan, row in plans.items():
        if plan not in FOR_SALE:
            raise HTTPException(422, f"Unknown plan — one of {', '.join(FOR_SALE)}.")
        if row.usd is not None and not (0 < row.usd <= 10000):
            raise HTTPException(422, f"{billing.PLAN_LABEL[plan]}: the dollar price must be between $0.01 and $10,000.")
        if row.khr is not None and not (100 <= row.khr <= 40_000_000):
            raise HTTPException(422, f"{billing.PLAN_LABEL[plan]}: the riel price must be between 100 and 40,000,000.")
    for plan, row in plans.items():
        rec = db.get(PlanPrice, plan) or PlanPrice(plan=plan)
        rec.usd = round(row.usd, 2) if row.usd is not None else None
        rec.khr = round(row.khr) if row.khr is not None else None
        db.add(rec)
    db.commit()
    clear_prices_cache()
    log.warning("admin portal: plan prices set — %s", {p: (r.usd, r.khr) for p, r in plans.items()})
    return admin_prices(db)


def reset_admin_price(db: Session, plan: str) -> list[dict]:
    """Back to the built-in price for one plan."""
    rec = db.get(PlanPrice, plan)
    if rec:
        db.delete(rec)
        db.commit()
    clear_prices_cache()
    return admin_prices(db)


class PackRow(BaseModel):
    id: int | None = None  # None = a new pack
    credits: int  # the hidden AI allowance that rides along
    videos: int = 0
    images: int = 0
    usd: float | None = None
    khr: float | None = None
    active: bool = True


def admin_packs(db: Session) -> list[dict]:
    return [
        {"id": r.id, "credits": r.credits, "videos": r.videos or 0, "images": r.images or 0, "usd": float(r.usd) if r.usd is not None else None, "khr": float(r.khr) if r.khr is not None else None, "active": r.active}
        for r in db.scalars(select(CreditPack).order_by(CreditPack.credits))
    ]


def save_admin_packs(db: Session, rows: list[PackRow]) -> list[dict]:
    """Set the credit packs: each row updates its pack (or adds one, with no id); a pack
    left out is removed. Checked first, like the plan prices."""
    for r in rows:
        if not (10 <= r.credits <= 1_000_000):
            raise HTTPException(422, "A pack has between 10 and 1,000,000 credits.")
        if not (0 <= r.videos <= 1000 and 0 <= r.images <= 10000):
            raise HTTPException(422, "A pack adds 0–1,000 videos and 0–10,000 images.")
        if r.usd is not None and not (0 < r.usd <= 10000):
            raise HTTPException(422, f"{r.credits:,} credits: the dollar price must be between $0.01 and $10,000.")
        if r.khr is not None and not (100 <= r.khr <= 40_000_000):
            raise HTTPException(422, f"{r.credits:,} credits: the riel price must be between 100 and 40,000,000.")
        if r.usd is None and r.khr is None:
            raise HTTPException(422, f"{r.credits:,} credits: give it a price in dollars or riel.")
    keep = {r.id for r in rows if r.id}
    for old in db.scalars(select(CreditPack)):
        if old.id not in keep:
            db.delete(old)  # payments keep their own credits and amount — nothing points here
    for r in rows:
        rec = (db.get(CreditPack, r.id) if r.id else None) or CreditPack()
        rec.credits = r.credits
        rec.videos = r.videos
        rec.images = r.images
        rec.usd = round(r.usd, 2) if r.usd is not None else None
        rec.khr = round(r.khr) if r.khr is not None else None
        rec.active = r.active
        db.add(rec)
    db.commit()
    log.warning("admin portal: credit packs set — %s", [(r.videos, r.images, r.credits, r.usd, r.khr, r.active) for r in rows])
    return admin_packs(db)


# ── the customer's side ───────────────────────────────────────────────────
@router.get("/plans")
def plans(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    w = db.get(Workspace, ws)
    table = prices()
    return {
        "on_sale": on_sale(),
        "current": w.plan if w else "free",
        "paid_until": _aware(w.plan_paid_until).isoformat() if w and w.plan_paid_until else None,
        "plans": [
            {
                "plan": p,
                "label": billing.PLAN_LABEL[p],
                "monthly_credits": billing.PLAN_CREDITS[p],
                "prices": table.get(p, {}),
                **{k: lim[k] for k in ("videos", "images", "longest")},
            }
            for p in FOR_SALE
            for lim in [usage.limits(db, p)]
        ],
        # extra credits: on sale with KHQR, for a paid plan
        "packs": packs(db) if bakong.configured() else [],
        "can_top_up": can_top_up(w),
        # customers buy videos / images, not credits: no "your own amount of credits"
        "custom": None,
    }


class PayIn(BaseModel):
    plan: str = ""
    pack: int | None = None  # a credit pack instead of a plan
    credits: int | None = None  # or the customer's own number of credits (custom_rate)
    currency: str = "USD"


@router.post("/pay")
def start_payment(
    payload: PayIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    if not on_sale():
        raise HTTPException(409, "Paid plans aren't on sale yet — coming soon.")
    currency = payload.currency.upper()
    w = db.get(Workspace, ws)
    if w is None or w.suspended_at:
        raise HTTPException(403, "This account is suspended — contact us to pay.")
    credits = None
    videos = images = 0
    if (payload.pack is not None or payload.credits is not None) and not can_top_up(w):
        raise HTTPException(409, "Packs are for paid plans — choose a plan first.")
    if payload.pack is not None:  # a credit top-up
        pack = db.get(CreditPack, payload.pack)
        if pack is None or not pack.active or not (pack.videos or pack.images):
            raise HTTPException(404, "That pack isn't on sale any more.")
        plan, credits = TOP_UP, pack.credits
        videos, images = pack.videos or 0, pack.images or 0
        amount = _pack_prices(pack).get(currency)
    elif payload.credits is not None:  # a top-up of the customer's own amount
        n = payload.credits
        if not (CUSTOM_MIN <= n <= CUSTOM_MAX) or n % CUSTOM_STEP:
            raise HTTPException(422, f"Choose {CUSTOM_MIN:,} to {CUSTOM_MAX:,} credits, in steps of {CUSTOM_STEP}.")
        rate = custom_rate(db)
        if not rate:
            raise HTTPException(404, "A custom amount isn't on sale — choose a pack.")
        plan, credits = TOP_UP, n
        amount = custom_price(rate, n, currency)
    else:
        plan = payload.plan
        amount = prices().get(plan, {}).get(currency)
    if not amount:
        raise HTTPException(422, "That can't be paid in that currency.")
    # an open code for the same plan (or pack) and currency is shown again, not a second one
    open_ = db.scalar(
        select(Payment).where(
            Payment.workspace_id == ws,
            Payment.status == "pending",
            Payment.plan == plan,
            Payment.credits.is_(None) if credits is None else Payment.credits == credits,
            Payment.videos == videos,
            Payment.images == images,
            Payment.amount == amount,
            Payment.currency == currency,
            Payment.expires_at > _now() + timedelta(minutes=2),
        )
    )
    if open_:
        return _out(open_)
    s = get_settings()
    now = _now()
    expires = now + timedelta(minutes=PAY_MINUTES)
    bill = f"SM{ws}-{secrets.token_hex(4).upper()}"  # ≤ 25 characters, never repeats in practice
    qr = khqr.build(
        account_id=s.bakong_account_id.strip(),
        merchant_name=s.bakong_merchant_name.strip(),
        merchant_city=s.bakong_merchant_city.strip() or "Phnom Penh",
        amount=amount,
        currency=currency,
        bill_number=bill,
        created_ms=int(now.timestamp() * 1000),
        expires_ms=int(expires.timestamp() * 1000),
        merchant_id=s.bakong_merchant_id.strip(),
        acquiring_bank=s.bakong_acquiring_bank.strip(),
        account_info=s.bakong_account_info.strip(),
        store_label="Smart Marketing",
    )
    p = Payment(
        workspace_id=ws,
        user_id=user.id,
        plan=plan,
        credits=credits,
        videos=videos,
        images=images,
        currency=currency,
        amount=amount,
        bill_number=bill,
        qr=qr,
        md5=khqr.md5(qr),
        status="pending",
        expires_at=expires,
    )
    db.add(p)
    db.commit()
    log.info("payment %s: workspace %s, %s %s for %s", p.id, ws, khqr.amount_text(amount, currency), currency, _label(p))
    return _out(p)


def _mine(db: Session, payment_id: int, ws: int) -> Payment:
    p = db.get(Payment, payment_id)
    if p is None or p.workspace_id != ws:
        raise HTTPException(404, "Payment not found.")
    return p


@router.get("/pay/{payment_id}")
def payment_status(payment_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    p = _mine(db, payment_id, ws)
    if p.status == "pending":
        now = _now()
        if len(_seen) > 500:  # forget old ones
            for k in [k for k, t in _seen.items() if (now - t).total_seconds() > 3600]:
                del _seen[k]
        _seen[p.id] = now
        confirm_due(db)  # asks Bakong only when a payment is DUE a check (a schedule, one batch)
        db.refresh(p)
    return _out(p)


@router.post("/pay/{payment_id}/cancel")
def cancel_payment(payment_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    p = _mine(db, payment_id, ws)
    if p.status == "pending":
        # paid just before closing? then it counts — one last ask, but not for a code that was
        # only just made (nobody pays in 20 seconds): requests are scarce
        if (_now() - _aware(p.created_at)).total_seconds() >= 20:
            confirm_due(db, only=p.id, force=True)
            db.refresh(p)
        if p.status == "pending":
            p.status = "cancelled"
            db.commit()
    return _out(p)


@router.post("/payments/{payment_id}/invoice")
def payment_invoice(payment_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The invoice of a paid payment, as a PDF to download (app/invoice.py)."""
    from fastapi.responses import Response

    from app import invoice

    p = _mine(db, payment_id, ws)
    if p.status != "paid":
        raise HTTPException(409, "An invoice is made once the payment is confirmed.")
    w = db.get(Workspace, ws)
    payer = db.get(TeamMember, p.user_id) if p.user_id else None
    pdf = invoice.render(
        payment_id=p.id,
        plan_label=billing.PLAN_LABEL.get(p.plan, p.plan.title()),
        top_up=_label(p) if p.plan == TOP_UP else None,
        amount=float(p.amount),
        currency=p.currency,
        paid_at=_aware(p.paid_at),
        period_end=_aware(p.period_end),
        bill_number=p.bill_number,
        bakong_hash=p.bakong_hash,
        from_account=p.from_account,
        # Bill to: the person who paid, their workspace, their email
        customer_name=(payer.name if payer else "") or (w.name if w else ""),
        customer_workspace=w.name if w else "",
        customer_email=payer.email if payer else "",
    )
    name = invoice.number(p.id, p.paid_at)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'})


@router.get("/payments")
def my_payments(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    rows = db.scalars(
        select(Payment).where(Payment.workspace_id == ws, Payment.status == "paid").order_by(Payment.paid_at.desc()).limit(50)
    ).all()
    return [_out(p) for p in rows]


# ── confirming with Bakong ────────────────────────────────────────────────
_confirm_lock = threading.Lock()


_list_refused = False  # Bakong said no to the list check (some tokens get 403) — one by one from then on


def _ask(due: list[Payment]) -> dict[str, dict]:
    """{md5: transaction} of the paid ones among ``due`` — one request for all of them; if
    Bakong's list answer can't be used, one by one (and the list isn't asked again)."""
    global _list_refused
    if len(due) > 1 and not _list_refused:
        try:
            return bakong.check_many([p.md5 for p in due])
        except bakong.BakongLimit:
            raise
        except bakong.BakongError as exc:
            _list_refused = True
            log.warning("payments: Bakong's list check failed (%s) — asking one by one from now on", exc)
    found: dict[str, dict] = {}
    for p in due:
        tx = bakong.check(p.md5)
        if tx:
            found[p.md5] = tx
    return found


def confirm_due(db: Session, only: int | None = None, force: bool = False) -> None:
    """Ask Bakong about the pending payments that are DUE a check, in ONE request, and
    switch on the paid ones. A payment is due by its age (FIRST_CHECK_S, then _delay_s); one
    whose code ran out (+2 min) gets a last check and then expires. Called by the page's polling
    and by the scheduler — whoever comes first asks, the others find nothing due. While Bakong's
    daily allowance is used up nothing is asked and nothing expires (it is checked once the
    allowance is back). ``only``/``force``: just that payment, now (the page closing)."""
    if not bakong.configured() or bakong.limited_for():
        return
    if not _confirm_lock.acquire(blocking=False):
        return
    try:
        now = _now()
        open_ = db.scalars(select(Payment).where(Payment.status == "pending", Payment.expires_at > now - timedelta(hours=24))).all()
        due: list[Payment] = []
        for p in open_:
            if only is not None and p.id != only:
                continue
            age = (now - _aware(p.created_at)).total_seconds()
            checked = _aware(p.checked_at)
            over = now > _aware(p.expires_at) + timedelta(minutes=2)
            seen = _seen.get(p.id)
            watched = seen is not None and (now - seen).total_seconds() < WATCHED_S
            if watched:
                scheduled = (checked is None and age >= FIRST_CHECK_S) or (checked is not None and (now - checked).total_seconds() >= _delay_s(age))
            else:  # nobody is looking at it: slowly
                scheduled = (checked is None and age >= 30) or (checked is not None and (now - checked).total_seconds() >= UNWATCHED_S)
            if force or over or scheduled:
                due.append(p)
        if not due:
            return
        try:
            found = _ask(due)
        except bakong.BakongLimit:
            return  # logged by bakong.py; nothing more is asked for a while
        except bakong.BakongError as exc:
            log.warning("payments: couldn't ask Bakong about %d payment(s) — %s", len(due), exc)
            for p in due:
                p.checked_at = now
            db.commit()
            return
        for p in due:
            p.checked_at = now
            tx = found.get(p.md5)
            if tx:
                _activate(db, p.id, tx)
                db.refresh(p)
            elif now > _aware(p.expires_at) + timedelta(minutes=2):
                p.status = "expired"  # its last check found nothing
                _seen.pop(p.id, None)
        db.commit()
    finally:
        _confirm_lock.release()


def _matches(p: Payment, tx: dict) -> str:
    """'' when Bakong's transaction is the payment we asked for, else why not."""
    s = get_settings()
    to = str(tx.get("toAccountId") or "").strip().lower()
    if to and to != s.bakong_account_id.strip().lower():
        return f"paid to {to}, not our account"
    if str(tx.get("currency") or "").upper() != p.currency:
        return f"currency {tx.get('currency')} ≠ {p.currency}"
    try:
        paid = float(tx.get("amount"))
    except (TypeError, ValueError):
        return "no amount"
    if abs(paid - float(p.amount)) > (0.005 if p.currency == "USD" else 0.5):
        return f"amount {paid} ≠ {float(p.amount)}"
    return ""


def _activate(db: Session, payment_id: int, tx: dict) -> None:
    """Paid: switch the plan on — once, under a lock on the payment and the workspace."""
    p = db.scalar(select(Payment).where(Payment.id == payment_id).with_for_update())
    if p is None or p.status == "paid":
        db.commit()
        return
    why = _matches(p, tx)
    if why:
        log.error("payment %s: Bakong's transaction doesn't match — %s (hash %s); not activated", p.id, why, tx.get("hash"))
        p.status = "mismatch"  # for the team to look at in the admin portal — never activated
        db.commit()
        return
    w = db.scalar(select(Workspace).where(Workspace.id == p.workspace_id).with_for_update())
    now = _now()
    if p.plan == TOP_UP:
        _add_bought(db, p, w, tx, now)
        return
    # renewing the same plan adds a month to what's left; a different plan starts now
    left = _aware(w.plan_paid_until)
    start = left if (w.plan == p.plan and left and left > now) else now
    w.plan = p.plan
    w.plan_paid_until = start + PERIOD
    p.status = "paid"
    p.paid_at = now
    p.period_end = w.plan_paid_until
    p.bakong_hash = str(tx.get("hash") or "")[:80]
    p.from_account = str(tx.get("fromAccountId") or "")[:80]
    db.flush()  # the sessions don't autoflush — balance() must see the new plan
    added = billing.grant_month(db, w, p.user_id)
    db.commit()
    log.warning("payment %s PAID: workspace %s → %s until %s (+%s credits)", p.id, w.id, p.plan, w.plan_paid_until, added)
    try:
        from app import push

        push.notify_workspace(
            w.id,
            "credits",
            "Payment received — thank you!",
            f"{billing.PLAN_LABEL.get(p.plan, p.plan)} plan is on until {w.plan_paid_until:%d %b %Y}.",
            url="/?settings=billing",
            tag="payment",
        )
    except Exception:  # noqa: BLE001 - a notification never undoes a payment
        log.exception("payment %s: notification failed", p.id)


def _add_bought(db: Session, p: Payment, w: Workspace, tx: dict, now: datetime) -> None:
    """A paid top-up: its credits into the ledger ("purchase" — they last this month)."""
    credits = int(p.credits or 0)
    p.status = "paid"
    p.paid_at = now
    p.period_end = billing.next_reset(now)  # the receipt: good until the month ends
    p.bakong_hash = str(tx.get("hash") or "")[:80]
    p.from_account = str(tx.get("fromAccountId") or "")[:80]
    db.add(
        CreditEntry(
            workspace_id=w.id,
            user_id=p.user_id,
            kind="purchase",
            amount_usd=round(credits / billing.CREDITS_PER_USD, 6),
            cost_usd=0,
            note=f"{credits:,} credits bought — {f'${float(p.amount):,.2f}' if p.currency == 'USD' else f'{float(p.amount):,.0f} KHR'}, payment {p.bill_number}",
        )
    )
    db.commit()
    log.warning("payment %s PAID: workspace %s +%s credits (top-up: %s)", p.id, w.id, credits, _label(p))
    try:
        from app import push

        push.notify_workspace(w.id, "credits", "Payment received — thank you!", f"{_label(p)} added to this month — thank you!", url="/?settings=billing", tag="payment")
    except Exception:  # noqa: BLE001 - a notification never undoes a payment
        log.exception("payment %s: notification failed", p.id)


# ── from the scheduler ────────────────────────────────────────────────────
def sweep() -> int:
    """From the scheduler: the payments that are due a check (the customer's page may be
    closed after paying). Returns how many are still pending."""
    if not bakong.configured():
        return 0
    db = SessionLocal()
    try:
        confirm_due(db)
        return db.scalar(select(func.count()).select_from(Payment).where(Payment.status == "pending")) or 0
    finally:
        db.close()


def expire_plans() -> int:
    """Workspaces whose paid month ended go back to Free. Returns how many."""
    db = SessionLocal()
    n = 0
    try:
        for w in db.scalars(select(Workspace).where(Workspace.plan_paid_until.is_not(None), Workspace.plan_paid_until < _now())):
            log.warning("workspace %s: paid %s plan ended %s — back to Free", w.id, w.plan, w.plan_paid_until)
            w.plan = "free"
            w.plan_paid_until = None
            n += 1
        db.commit()
    finally:
        db.close()
    return n


def confirm_by_admin(db: Session, payment_id: int, who: str = "admin") -> list[dict]:
    """The team saw the money in the bank account but Bakong couldn't be asked (daily limit,
    token): switch the plan on by hand. Not for a payment already paid."""
    p = db.get(Payment, payment_id)
    if p is None:
        raise HTTPException(404, "Payment not found.")
    if p.status == "paid":
        raise HTTPException(409, "This payment is already confirmed.")
    s_ = get_settings()
    tx = {
        "hash": "manual",
        "fromAccountId": f"confirmed by {who}",
        "toAccountId": s_.bakong_account_id.strip(),
        "currency": p.currency,
        "amount": float(p.amount),
    }
    log.warning("admin portal: payment %s confirmed by hand (%s)", payment_id, who)
    _activate(db, p.id, tx)
    return admin_payment_rows(db)


def admin_payment_rows(db: Session, limit: int = 30) -> list[dict]:
    rows = db.execute(select(Payment, Workspace.name).join(Workspace, Workspace.id == Payment.workspace_id).order_by(Payment.created_at.desc()).limit(limit)).all()
    return [
        {
            "id": p.id,
            "workspace": name,
            "plan": _label(p),
            "currency": p.currency,
            "amount": float(p.amount),
            "status": p.status,
            "bill_number": p.bill_number,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            "bakong_hash": p.bakong_hash,
        }
        for p, name in rows
    ]
