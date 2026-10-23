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

Prices come from PLAN_PRICES in the server .env; with none (or no Bakong
account / token) nothing is on sale and Upgrade says "Coming soon".
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import bakong, billing, khqr
from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import Payment, TeamMember, Workspace
from app.tenancy import current_workspace_id, get_current_user

log = logging.getLogger("app.payments")
router = APIRouter(prefix="/billing", tags=["Billing"])

PAY_MINUTES = 10  # a KHQR is good for this long
PERIOD = timedelta(days=30)  # one payment = one month of the plan
CHECK_EVERY_S = 3  # the page polls; Bakong is asked at most this often per payment
SWEEP_S = 30  # the scheduler checks open payments (page closed after paying)
FOR_SALE = ("starter", "pro", "business")  # the plans a customer can buy (enterprise: talk to us)


def prices() -> dict[str, dict[str, float]]:
    """{plan: {"USD": 9.0, "KHR": 36000.0}} from PLAN_PRICES — bad entries left out."""
    raw = get_settings().plan_prices.strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        log.error("PLAN_PRICES isn't valid JSON — nothing is on sale")
        return {}
    out: dict[str, dict[str, float]] = {}
    for plan, cur in (data or {}).items():
        if plan not in FOR_SALE or not isinstance(cur, dict):
            continue
        row = {c: float(v) for c, v in cur.items() if c in ("USD", "KHR") and isinstance(v, (int, float)) and v > 0}
        if row:
            out[plan] = row
    return out


def on_sale() -> bool:
    return bakong.configured() and bool(prices())


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(d: datetime | None) -> datetime | None:
    return d.replace(tzinfo=UTC) if d is not None and d.tzinfo is None else d


def _out(p: Payment) -> dict:
    return {
        "id": p.id,
        "plan": p.plan,
        "plan_label": billing.PLAN_LABEL.get(p.plan, p.plan.title()),
        "currency": p.currency,
        "amount": float(p.amount),
        "amount_text": khqr.amount_text(float(p.amount), p.currency),
        "bill_number": p.bill_number,
        "status": p.status,
        "qr": p.qr if p.status == "pending" else "",
        "merchant_name": get_settings().bakong_merchant_name,
        "expires_at": _aware(p.expires_at).isoformat(),
        "paid_at": _aware(p.paid_at).isoformat() if p.paid_at else None,
        "period_end": _aware(p.period_end).isoformat() if p.period_end else None,
        "created_at": _aware(p.created_at).isoformat() if p.created_at else None,
    }


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
            }
            for p in FOR_SALE
        ],
    }


class PayIn(BaseModel):
    plan: str
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
    amount = prices().get(payload.plan, {}).get(currency)
    if not amount:
        raise HTTPException(422, "That plan can't be paid in that currency.")
    w = db.get(Workspace, ws)
    if w is None or w.suspended_at:
        raise HTTPException(403, "This account is suspended — contact us to pay.")
    # an open code for the same plan and currency is shown again, not a second one
    open_ = db.scalar(
        select(Payment).where(
            Payment.workspace_id == ws,
            Payment.status == "pending",
            Payment.plan == payload.plan,
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
        store_label="Smart Marketing",
    )
    p = Payment(
        workspace_id=ws,
        user_id=user.id,
        plan=payload.plan,
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
    log.info("payment %s: workspace %s, %s %s for %s", p.id, ws, khqr.amount_text(amount, currency), currency, payload.plan)
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
        _check(db, p)
    return _out(p)


@router.post("/pay/{payment_id}/cancel")
def cancel_payment(payment_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    p = _mine(db, payment_id, ws)
    if p.status == "pending":
        _check(db, p, force=True)  # paid just before closing? then it counts
        if p.status == "pending":
            p.status = "cancelled"
            db.commit()
    return _out(p)


@router.get("/payments")
def my_payments(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    rows = db.scalars(
        select(Payment).where(Payment.workspace_id == ws, Payment.status == "paid").order_by(Payment.paid_at.desc()).limit(50)
    ).all()
    return [_out(p) for p in rows]


# ── confirming with Bakong ────────────────────────────────────────────────
def _check(db: Session, p: Payment, force: bool = False) -> None:
    """Ask Bakong about a pending payment (rate-limited); activate it if paid,
    expire it if its time ran out unpaid. Commits."""
    now = _now()
    checked = _aware(p.checked_at)
    if not force and checked and (now - checked).total_seconds() < CHECK_EVERY_S:
        return
    p.checked_at = now
    try:
        tx = bakong.check(p.md5)
    except bakong.BakongError as exc:
        log.warning("payment %s: couldn't ask Bakong — %s", p.id, exc)
        tx = None
        db.commit()
        return
    if tx is None:
        # unpaid — after the code's time (plus a little for a payment in flight) it's over
        if now > _aware(p.expires_at) + timedelta(minutes=2):
            p.status = "expired"
        db.commit()
        return
    _activate(db, p.id, tx)
    db.refresh(p)


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


# ── from the scheduler ────────────────────────────────────────────────────
def sweep() -> int:
    """Check every open payment (its page may be closed) and end paid months
    that ran out. Returns how many payments it looked at."""
    if not bakong.configured():
        return 0
    db = SessionLocal()
    looked = 0
    try:
        open_ = db.scalars(
            select(Payment).where(Payment.status == "pending", Payment.expires_at > _now() - timedelta(minutes=5))
        ).all()
        for p in open_:
            looked += 1
            _check(db, p)
        # long-gone codes nobody checked: expired
        for p in db.scalars(select(Payment).where(Payment.status == "pending", Payment.expires_at <= _now() - timedelta(minutes=5))):
            p.status = "expired"
        db.commit()
    finally:
        db.close()
    return looked


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
