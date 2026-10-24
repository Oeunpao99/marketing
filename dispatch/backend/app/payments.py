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
import threading
import time
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import bakong, billing, khqr
from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import Payment, PlanPrice, TeamMember, Workspace
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
        # Bakong's daily allowance is used up: the payment is safe and is confirmed when it resets
        "delayed": p.status == "pending" and bakong.limited_for() > 0,
        "merchant_name": get_settings().bakong_merchant_name,
        "expires_at": _aware(p.expires_at).isoformat(),
        "paid_at": _aware(p.paid_at).isoformat() if p.paid_at else None,
        "period_end": _aware(p.period_end).isoformat() if p.period_end else None,
        "created_at": _aware(p.created_at).isoformat() if p.created_at else None,
    }


@public_router.get("/prices")
def public_prices():
    """The plans' monthly prices, for the website — the same ones checkout charges."""
    return {"prices": prices()}


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
        account_info=s.bakong_account_info.strip(),
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
        amount=float(p.amount),
        currency=p.currency,
        paid_at=_aware(p.paid_at),
        period_end=_aware(p.period_end),
        bill_number=p.bill_number,
        bakong_hash=p.bakong_hash,
        from_account=p.from_account,
        customer_name=(w.name if w else "") or (payer.name if payer else ""),
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


def _ask(due: list[Payment]) -> dict[str, dict]:
    """{md5: transaction} of the paid ones among ``due`` — one request for all of them; if
    Bakong's list answer can't be used and there are only a few, one by one."""
    if len(due) > 1:
        try:
            return bakong.check_many([p.md5 for p in due])
        except bakong.BakongLimit:
            raise
        except bakong.BakongError as exc:
            if len(due) > 3:
                raise
            log.warning("payments: Bakong's list check failed (%s) — asking one by one", exc)
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
            "plan": billing.PLAN_LABEL.get(p.plan, p.plan),
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
