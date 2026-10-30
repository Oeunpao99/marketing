"""The platform admin portal — /admin-mkt in the browser, /api/admin-mkt here.

For the people who run ContentFlow, not its customers: who signed up, who
uses it, how much AI they spend — and the controls to suspend an account,
switch a user off, change a plan or add AI credit.

One login, from .env only (ADMIN_USERNAME / ADMIN_PASSWORD); either blank =
the whole portal answers 404. It has nothing to do with customer accounts:
its token is signed with the app's secret but carries a fingerprint of the
admin password, so changing the password signs every admin session out. It
travels in an ``X-Admin-Token`` header — never the customer's Authorization
header — so the two can't be mixed up. Too many wrong passwords from one
address are refused for a while.

Suspending an account (Workspace.suspended_at): nobody in it can sign in
(app/auth.py) or make a signed-in request (tenancy.get_current_user), all its
sessions are signed out, and no AI is charged to it (billing.require — which
also stops its automatic plans). Posts it already scheduled still go out.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import threading
import time
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import billing
from app.auth import client_ip
from app.config import get_settings
from app.database import get_db
from app.models import (
    AiModel,
    Brand,
    Channel,
    CreditEntry,
    LoginEvent,
    Platform,
    Post,
    PostTarget,
    TeamMember,
    UserSession,
    Workspace,
)
from app.security import sign_payload, verify_payload

log = logging.getLogger("app.admin")

router = APIRouter(prefix="/admin-mkt", tags=["Admin"])

TOKEN_TTL = 12 * 3600
MAX_FAILURES = 5  # wrong passwords per address …
FAILURE_WINDOW = 15 * 60  # … within this many seconds, then refused until it passes
_failures: dict[str, list[float]] = {}
_failures_lock = threading.Lock()


# ── access ────────────────────────────────────────────────────────────────
def _credentials() -> tuple[str, str]:
    s = get_settings()
    if not s.admin_username or not s.admin_password:
        raise HTTPException(404, "Not found")
    return s.admin_username, s.admin_password


def _fingerprint(username: str, password: str) -> str:
    """Ties a token to the current admin login: change either, old tokens die."""
    return hashlib.sha256(f"{username}\n{password}".encode()).hexdigest()[:16]


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    username, password = _credentials()
    if not x_admin_token:
        raise HTTPException(401, "Sign in to the admin portal.")
    try:
        data = verify_payload(x_admin_token)
    except Exception as exc:  # noqa: BLE001 - any failure means "not signed in"
        raise HTTPException(401, "Your admin session has ended — sign in again.") from exc
    if not hmac.compare_digest(str(data.get("adm", "")), _fingerprint(username, password)):
        raise HTTPException(401, "Your admin session has ended — sign in again.")


def _too_many(ip: str) -> bool:
    now = time.time()
    with _failures_lock:
        recent = [t for t in _failures.get(ip, []) if now - t < FAILURE_WINDOW]
        _failures[ip] = recent
        return len(recent) >= MAX_FAILURES


def _failed(ip: str) -> None:
    with _failures_lock:
        _failures.setdefault(ip, []).append(time.time())


class AdminLoginIn(BaseModel):
    username: str = Field(max_length=200)
    password: str = Field(max_length=500)


@router.post("/login")
def admin_login(payload: AdminLoginIn, request: Request):
    username, password = _credentials()
    ip = client_ip(request)
    if _too_many(ip):
        raise HTTPException(429, "Too many wrong attempts — wait 15 minutes and try again.")
    # compare both, in constant time, before deciding
    ok_user = hmac.compare_digest(payload.username.strip().encode(), username.encode())
    ok_pass = hmac.compare_digest(payload.password.encode(), password.encode())
    if not (ok_user and ok_pass):
        _failed(ip)
        log.warning("admin portal: failed sign-in from %s", ip)
        raise HTTPException(401, "Wrong username or password.")
    log.info("admin portal: signed in from %s", ip)
    return {"token": sign_payload({"adm": _fingerprint(username, password)}, TOKEN_TTL), "expires_in": TOKEN_TTL}


# ── numbers per workspace, in a few grouped queries ──────────────────────
def _by_ws(db: Session, stmt) -> dict[int, float]:
    return {ws: value for ws, value in db.execute(stmt).all() if ws is not None}


def _stats(db: Session) -> dict[str, dict[int, float]]:
    now = datetime.now(UTC)
    month = billing.month_start()
    return {
        "members": _by_ws(db, select(TeamMember.workspace_id, func.count()).group_by(TeamMember.workspace_id)),
        "brands": _by_ws(db, select(Brand.workspace_id, func.count()).group_by(Brand.workspace_id)),
        "channels": _by_ws(
            db,
            select(Brand.workspace_id, func.count(Channel.id))
            .join(Channel, Channel.brand_id == Brand.id)
            .where(Channel.status == "live")
            .group_by(Brand.workspace_id),
        ),
        "posts_30d": _by_ws(
            db,
            select(Brand.workspace_id, func.count(PostTarget.id))
            .join(Post, Post.brand_id == Brand.id)
            .join(PostTarget, PostTarget.post_id == Post.id)
            .where(PostTarget.status == "posted", PostTarget.published_at >= now - timedelta(days=30))
            .group_by(Brand.workspace_id),
        ),
        "last_active": _by_ws(db, select(UserSession.workspace_id, func.max(UserSession.last_seen_at)).group_by(UserSession.workspace_id)),
        "ai_month": _by_ws(
            db,
            select(CreditEntry.workspace_id, -func.sum(CreditEntry.amount_usd))
            .where(CreditEntry.created_at >= month, CreditEntry.amount_usd < 0)
            .group_by(CreditEntry.workspace_id),
        ),
    }


def _owners(db: Session) -> dict[int, TeamMember]:
    """Each workspace's owner (its first owner-role member)."""
    out: dict[int, TeamMember] = {}
    for m in db.scalars(select(TeamMember).where(TeamMember.role == "owner").order_by(TeamMember.id)):
        out.setdefault(m.workspace_id, m)
    return out


def _ws_row(w: Workspace, owner: TeamMember | None, st: dict) -> dict:
    last = st["last_active"].get(w.id)
    return {
        "id": w.id,
        "name": w.name,
        "plan": w.plan,
        "created_at": w.created_at,
        "suspended": w.suspended_at is not None,
        "suspended_at": w.suspended_at,
        "suspended_reason": w.suspended_reason,
        "owner": {"id": owner.id, "name": owner.name, "email": owner.email} if owner else None,
        "members": int(st["members"].get(w.id, 0)),
        "brands": int(st["brands"].get(w.id, 0)),
        "channels": int(st["channels"].get(w.id, 0)),
        "posts_30d": int(st["posts_30d"].get(w.id, 0)),
        "ai_month": round(float(st["ai_month"].get(w.id, 0) or 0), 2),
        "last_active": last,
    }


# ── overview ──────────────────────────────────────────────────────────────
@router.get("/overview", dependencies=[Depends(require_admin)])
def admin_overview(db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    week = now - timedelta(days=7)
    st = _stats(db)
    owners = _owners(db)
    workspaces = db.scalars(select(Workspace).order_by(Workspace.created_at.desc())).all()

    # sign-ups per day, last 14 days (Phnom Penh days)
    days = [(now.astimezone(billing.PHNOM_PENH) - timedelta(days=n)).date() for n in range(13, -1, -1)]
    per_day = {d: 0 for d in days}
    for w in workspaces:
        d = w.created_at.astimezone(billing.PHNOM_PENH).date() if w.created_at else None
        if d in per_day:
            per_day[d] += 1

    active_users = db.scalar(
        select(func.count(func.distinct(UserSession.user_id))).where(UserSession.last_seen_at >= week)
    ) or 0
    return {
        "accounts": len(workspaces),
        "suspended": sum(1 for w in workspaces if w.suspended_at),
        "users": db.scalar(select(func.count()).select_from(TeamMember)) or 0,
        "new_7d": sum(1 for w in workspaces if w.created_at and w.created_at >= week),
        "active_users_7d": active_users,
        "active_accounts_7d": sum(1 for v in st["last_active"].values() if v and v >= week),
        "ai_month": round(sum(float(v or 0) for v in st["ai_month"].values()), 2),
        "posts_30d": int(sum(st["posts_30d"].values())),
        "signups": [{"date": d.isoformat(), "count": per_day[d]} for d in days],
        # the charts: AI per day by kind of work (30 days), this month's split, the top spenders
        "ai_kinds": _ai_by_kind(db, now - timedelta(days=29)),
        "recent": [_ws_row(w, owners.get(w.id), st) for w in workspaces[:8]],
    }


# ── making now: every video / picture being made, in every account ────────
# How far along a template video is, from its live progress (app/motion.py _report):
# the story, the Khmer polish, the pictures, the voice, then the frames drawn.
_STAGE_SPAN = {"story": (0, 10), "polish": (10, 20), "pictures": (20, 45), "voice": (45, 60), "check": (60, 62), "render": (62, 100)}
_STAGE_LABEL = {"story": "Writing the story", "polish": "Polishing the words", "pictures": "Painting the pictures", "voice": "Recording the voice", "check": "Checking", "render": "Rendering the video"}


def _job_percent(p: dict) -> int | None:
    stage = p.get("stage")
    if stage not in _STAGE_SPAN:
        return None
    lo, hi = _STAGE_SPAN[stage]
    part = 0.0
    if stage == "render":
        part = float(p.get("render") or 0)
    elif stage == "pictures" and p.get("drawings"):
        part = min(1.0, float(p.get("drawn") or 0) / max(1, int(p["drawings"])))
    elif stage == "voice" and p.get("scenes"):
        scenes = p["scenes"]
        part = sum(1 for s in scenes if s.get("voice") in ("done", "skip")) / max(1, len(scenes))
    return int(lo + (hi - lo) * max(0.0, min(1.0, part)))


@router.get("/making", dependencies=[Depends(require_admin)])
def admin_making(db: Session = Depends(get_db)):
    """The jobs not finished yet, in every account (the team's view)."""
    return making_now(db)


def making_now(db: Session, workspace_id: int | None = None) -> dict:
    """The jobs not finished yet — queued or running — with who asked, for which
    brand, and how far along a template video is (live, from this process). One
    workspace's (Content studio → Making now: the team sees each other's), or all."""
    from app.models import GenerationJob
    from app.motion import progress_of

    now = datetime.now(UTC)
    q = select(GenerationJob).where(GenerationJob.status.in_(("queued", "running")))
    if workspace_id is not None:
        q = q.where(GenerationJob.workspace_id == workspace_id)
    jobs = db.scalars(q.order_by(GenerationJob.created_at)).all()
    # the queue is shared by every account (one render at a time): a job's place counts them all
    queued_ids = [j.id for j in db.scalars(select(GenerationJob).where(GenerationJob.status == "queued").order_by(GenerationJob.created_at))]
    ws = {w.id: w.name for w in db.scalars(select(Workspace).where(Workspace.id.in_({j.workspace_id for j in jobs})))} if jobs else {}
    brands = {b.id: b.name for b in db.scalars(select(Brand).where(Brand.id.in_({j.brand_id for j in jobs if j.brand_id})))} if jobs else {}
    users = {u.id: u.name or u.email for u in db.scalars(select(TeamMember).where(TeamMember.id.in_({j.user_id for j in jobs if j.user_id})))} if jobs else {}
    rows = []
    queue = 0
    for j in jobs:
        p = (progress_of(j.id) or {}) if j.kind == "motion" else {}
        waiting = j.status == "queued"
        if waiting:
            queue += 1
        made = j.created_at if j.created_at.tzinfo else j.created_at.replace(tzinfo=UTC)
        rows.append(
            {
                "id": j.id,
                "kind": j.kind,  # motion (a template video) | video (AI-filmed) | image
                "status": j.status,
                "queue": (queued_ids.index(j.id) + 1 if j.id in queued_ids else queue) if waiting else 0,
                "account": ws.get(j.workspace_id, "?"),
                "workspace_id": j.workspace_id,
                "brand": brands.get(j.brand_id, ""),
                "user": users.get(j.user_id, ""),
                "template": p.get("style") or "",
                "stage": _STAGE_LABEL.get(p.get("stage"), "Waiting its turn" if waiting else "Working"),
                "percent": _job_percent(p) if p else None,
                "scenes": len(p.get("scenes") or []),
                "ratio": j.aspect_ratio,
                "seconds": j.seconds,
                "prompt": (j.prompt or "")[:140],
                "elapsed": int((now - made).total_seconds()),
            }
        )
    return {"jobs": rows, "running": sum(1 for r in rows if r["status"] == "running"), "queued": queue}


# ── accounts ──────────────────────────────────────────────────────────────
@router.get("/workspaces", dependencies=[Depends(require_admin)])
def admin_workspaces(q: str = "", status: str = "all", db: Session = Depends(get_db)):
    st = _stats(db)
    owners = _owners(db)
    rows = [_ws_row(w, owners.get(w.id), st) for w in db.scalars(select(Workspace).order_by(Workspace.created_at.desc()))]
    needle = q.strip().lower()
    if needle:
        rows = [
            r
            for r in rows
            if needle in r["name"].lower()
            or (r["owner"] and (needle in (r["owner"]["email"] or "").lower() or needle in (r["owner"]["name"] or "").lower()))
        ]
    if status == "active":
        rows = [r for r in rows if not r["suspended"]]
    elif status == "suspended":
        rows = [r for r in rows if r["suspended"]]
    return rows


@router.get("/prices", dependencies=[Depends(require_admin)])
def admin_get_prices(db: Session = Depends(get_db)):
    """Each plan's monthly price (USD, KHR) — what checkout charges and the website shows."""
    from app import payments

    return payments.admin_prices(db)


class PricesIn(BaseModel):
    plans: dict[str, dict[str, float | None]]


@router.put("/prices", dependencies=[Depends(require_admin)])
def admin_set_prices(payload: PricesIn, db: Session = Depends(get_db)):
    from app import payments

    rows = {plan: payments.PriceRow(usd=v.get("usd"), khr=v.get("khr")) for plan, v in payload.plans.items()}
    return payments.save_admin_prices(db, rows)


@router.delete("/prices/{plan}", dependencies=[Depends(require_admin)])
def admin_reset_price(plan: str, db: Session = Depends(get_db)):
    """Back to the built-in price for one plan."""
    from app import payments

    return payments.reset_admin_price(db, plan)


@router.get("/plan-limits", dependencies=[Depends(require_admin)])
def admin_get_limits(db: Session = Depends(get_db)):
    """What each plan makes a month — videos, images, the longest video (app/usage.py)."""
    from app import usage

    return usage.admin_limits(db)


class LimitsIn(BaseModel):
    plans: dict[str, dict[str, int]]


@router.put("/plan-limits", dependencies=[Depends(require_admin)])
def admin_set_limits(payload: LimitsIn, db: Session = Depends(get_db)):
    from app import usage

    return usage.save_admin_limits(db, payload.plans)


@router.get("/credit-packs", dependencies=[Depends(require_admin)])
def admin_get_packs(db: Session = Depends(get_db)):
    """The credit packs customers on a paid plan can buy (credits, USD, KHR, on sale)."""
    from app import payments

    return payments.admin_packs(db)


class PacksIn(BaseModel):
    packs: list[dict]


@router.put("/credit-packs", dependencies=[Depends(require_admin)])
def admin_set_packs(payload: PacksIn, db: Session = Depends(get_db)):
    """The whole list: rows with an id are updated, without one added, missing ones removed."""
    from app import payments

    try:
        rows = [payments.PackRow(**r) for r in payload.packs]
    except ValueError as exc:
        raise HTTPException(422, "Each pack needs its credits (a whole number) and a price.") from exc
    return payments.save_admin_packs(db, rows)


@router.get("/credit-custom", dependencies=[Depends(require_admin)])
def admin_get_custom(db: Session = Depends(get_db)):
    """The price of 100 credits for a customer's own amount (None = not on sale)."""
    from app import payments

    return {"custom": payments._custom_out(db)}


class CustomIn(BaseModel):
    usd: float | None = None
    khr: float | None = None


@router.put("/credit-custom", dependencies=[Depends(require_admin)])
def admin_set_custom(payload: CustomIn, db: Session = Depends(get_db)):
    from app import payments

    return {"custom": payments.save_custom_rate(db, payload.usd, payload.khr)}


@router.get("/payments", dependencies=[Depends(require_admin)])
def admin_payments(status: str = "", db: Session = Depends(get_db)):
    """KHQR plan payments (app/payments.py), newest first — "paid", "mismatch"
    (Bakong's transaction wasn't what we asked: never activated, check it), etc."""
    from app.models import Payment

    stmt = select(Payment, Workspace.name).join(Workspace, Workspace.id == Payment.workspace_id)
    if status:
        stmt = stmt.where(Payment.status == status)
    rows = db.execute(stmt.order_by(Payment.created_at.desc()).limit(300)).all()
    return [
        {
            "id": p.id,
            "workspace_id": p.workspace_id,
            "workspace": name,
            "plan": p.plan,
            "currency": p.currency,
            "amount": float(p.amount),
            "bill_number": p.bill_number,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            "period_end": p.period_end.isoformat() if p.period_end else None,
            "bakong_hash": p.bakong_hash,
            "from_account": p.from_account,
        }
        for p, name in rows
    ]


def _workspace(db: Session, ws_id: int) -> Workspace:
    w = db.get(Workspace, ws_id)
    if w is None:
        raise HTTPException(404, "Account not found.")
    return w


@router.get("/workspaces/{ws_id}", dependencies=[Depends(require_admin)])
def admin_workspace(ws_id: int, db: Session = Depends(get_db)):
    from app import usage

    w = _workspace(db, ws_id)
    st = _stats(db)
    last_seen = dict(
        db.execute(
            select(UserSession.user_id, func.max(UserSession.last_seen_at))
            .where(UserSession.workspace_id == ws_id)
            .group_by(UserSession.user_id)
        ).all()
    )
    members = db.scalars(select(TeamMember).where(TeamMember.workspace_id == ws_id).order_by(TeamMember.id)).all()
    brands = db.scalars(select(Brand).where(Brand.workspace_id == ws_id).order_by(Brand.id)).all()
    channels = db.execute(
        select(Channel.brand_id, Platform.name, Channel.handle, Channel.status)
        .join(Platform, Platform.id == Channel.platform_id)
        .where(Channel.brand_id.in_([b.id for b in brands] or [0]))
    ).all()
    credit = db.scalars(
        select(CreditEntry).where(CreditEntry.workspace_id == ws_id).order_by(CreditEntry.created_at.desc()).limit(12)
    ).all()
    # this month's AI, grouped the way people think of it (videos, images, captions…)
    month = db.scalars(
        select(CreditEntry).where(CreditEntry.workspace_id == ws_id, CreditEntry.created_at >= billing.month_start(), CreditEntry.amount_usd < 0)
    ).all()
    summary: dict[str, dict] = {}
    for c in month:
        group, _label = activity_kind(c.kind, c.note)
        g = summary.setdefault(group, {"group": group, "count": 0, "charged": 0.0, "cost": 0.0})
        g["count"] += 1
        g["charged"] += -float(c.amount_usd)
        g["cost"] += float(c.cost_usd or 0)
    logins = db.scalars(
        select(LoginEvent).where(LoginEvent.workspace_id == ws_id).order_by(LoginEvent.created_at.desc()).limit(10)
    ).all()
    owner = next((m for m in members if m.role == "owner"), None)
    return {
        **_ws_row(w, owner, st),
        "balance": billing.balance(db, ws_id),
        # what the customer sees: this month's videos / images, made and left (app/usage.py)
        "usage": usage.summary(db, ws_id),
        "member_list": [
            {
                "id": m.id,
                "name": m.name,
                "email": m.email,
                "role": m.role,
                "is_active": m.is_active,
                "joined": m.created_at,
                "last_seen": last_seen.get(m.id),
            }
            for m in members
        ],
        "brand_list": [
            {
                "id": b.id,
                "name": b.name,
                "channels": [{"platform": p, "handle": h, "status": s} for bid, p, h, s in channels if bid == b.id],
            }
            for b in brands
        ],
        "credit": [
            {"at": c.created_at, "kind": c.kind, "amount": round(float(c.amount_usd), 4), "note": c.note, "label": activity_kind(c.kind, c.note)[1], "videos": c.videos, "images": c.images}
            for c in credit
        ],
        # this month by kind of work, biggest first: [{group, count, charged, cost}]
        "ai_month": sorted(
            ({**g, "charged": round(g["charged"], 2), "cost": round(g["cost"], 2)} for g in summary.values()),
            key=lambda g: -g["charged"],
        ),
        "logins": [
            {"at": e.created_at, "email": e.email, "status": e.status, "ip": e.ip} for e in logins
        ],
    }


# What an AI charge was for, in words — the ledger keeps the start of the AI's instructions
# ("AI writing: You are the content strategist…"), which read badly in the account drawer
# (the user, 2026-10-30). The first match wins.
_ACTIVITY = [
    ("Marketing advisor", "Marketing advisor chat", ("marketing advisor",)),
    ("Website check", "Website check", ("website check",)),
    ("Weekly plan", "Weekly plan", ("creative marketing lead", "content strategist")),
    ("Captions & posts", "Caption / post writing", ("copy editor", "social media editor", "caption", "label one social media post", "labels already used")),
    ("Images", "Image", ("image", "picture", "poster", "illustrator", "reference images", "cut-out", "prompt engineer")),
    ("Videos", "Video voice-over", ("voice-over", "voice preview")),
    ("Videos", "Video script & design", ("video", "remotion", "storyboard", "film", "storyteller", "director", "scriptwriter", "podcast", "parable",
                                         "dialogue", "meme", "presentation designer", "instructional designer", "motion designer", "teacher", "creator", "ui designer")),
]


def activity_kind(kind: str, note: str) -> tuple[str, str]:
    """(group, label) for one ledger row — "Videos" / "Video voice-over", "Images" / "Image"…"""
    text = (note or "").lower()
    for group, label, words in _ACTIVITY:
        if any(w in text for w in words):
            return group, label
    if kind == "image":
        return "Images", "Image"
    if kind == "video":
        return "Videos", "Video"
    if kind == "grant" or kind == "topup":
        return "Credit added", "Credit added"
    return "Other", "Other AI writing" if text.startswith("ai writing") else (note or kind or "Other")


def _sign_out(db: Session, **where) -> int:
    conds = [getattr(UserSession, k) == v for k, v in where.items()] + [UserSession.revoked_at.is_(None)]
    return db.execute(update(UserSession).where(*conds).values(revoked_at=datetime.now(UTC))).rowcount or 0


class SuspendIn(BaseModel):
    suspended: bool
    reason: str = Field(default="", max_length=300)


@router.post("/workspaces/{ws_id}/suspend", dependencies=[Depends(require_admin)])
def admin_suspend(ws_id: int, payload: SuspendIn, db: Session = Depends(get_db)):
    """Suspend (or bring back) an account. Suspending signs everyone in it out."""
    w = _workspace(db, ws_id)
    if payload.suspended:
        w.suspended_at = w.suspended_at or datetime.now(UTC)
        w.suspended_reason = payload.reason.strip()
        signed_out = _sign_out(db, workspace_id=ws_id)
    else:
        w.suspended_at = None
        w.suspended_reason = ""
        signed_out = 0
    db.commit()
    log.warning("admin portal: workspace %s %s", ws_id, "suspended" if payload.suspended else "restored")
    return {"suspended": w.suspended_at is not None, "signed_out": signed_out}


class CreditIn(BaseModel):
    amount_usd: float = Field(gt=0, le=1000)
    note: str = Field(default="", max_length=200)


@router.post("/workspaces/{ws_id}/credit", dependencies=[Depends(require_admin)])
def admin_add_credit(ws_id: int, payload: CreditIn, db: Session = Depends(get_db)):
    """Add AI credit for this month (a "grant" entry — billing counts positive
    entries as extra credit; like the plan's own credit it lasts the month)."""
    _workspace(db, ws_id)
    db.add(
        CreditEntry(
            workspace_id=ws_id,
            kind="grant",
            amount_usd=round(payload.amount_usd, 4),  # typed in credits (1 credit = $0.005)
            note=(payload.note.strip() or "Added by Marketing ឆ្លាតវៃ")[:300],
        )
    )
    db.commit()
    log.warning("admin portal: +%.0f credits ($%.2f) to workspace %s", payload.amount_usd * billing.CREDITS_PER_USD, payload.amount_usd, ws_id)
    return billing.balance(db, ws_id)


class ExtraIn(BaseModel):
    videos: int = Field(default=0, ge=0, le=1000)
    images: int = Field(default=0, ge=0, le=10000)
    note: str = Field(default="", max_length=200)


@router.post("/workspaces/{ws_id}/extra", dependencies=[Depends(require_admin)])
def admin_add_extra(ws_id: int, payload: ExtraIn, db: Session = Depends(get_db)):
    """Give extra videos / images for this month — what customers see — as a "grant" entry
    carrying them (app/usage.py extra), with the hidden AI allowance behind them as its amount
    (a video ~300 credits, an image ~20 — like a pack's). Lasts the month, like the plan's own."""
    from app import usage

    if not payload.videos and not payload.images:
        raise HTTPException(422, "Give at least one video or image.")
    _workspace(db, ws_id)
    credits = max(10, payload.videos * 300 + payload.images * 20)
    db.add(
        CreditEntry(
            workspace_id=ws_id,
            kind="grant",
            amount_usd=round(credits / billing.CREDITS_PER_USD, 4),
            videos=payload.videos,
            images=payload.images,
            note=(payload.note.strip() or "Added by Marketing ឆ្លាតវៃ")[:300],
        )
    )
    db.commit()
    log.warning("admin portal: +%d videos, +%d images to workspace %s", payload.videos, payload.images, ws_id)
    return usage.summary(db, ws_id)


class PlanIn(BaseModel):
    plan: str


@router.post("/workspaces/{ws_id}/plan", dependencies=[Depends(require_admin)])
def admin_set_plan(ws_id: int, payload: PlanIn, db: Session = Depends(get_db)):
    if payload.plan not in billing.PLAN_CREDIT:
        raise HTTPException(422, f"Unknown plan — one of {', '.join(billing.PLAN_CREDIT)}.")
    w = _workspace(db, ws_id)
    w.plan = payload.plan
    db.commit()
    log.warning("admin portal: workspace %s plan -> %s", ws_id, payload.plan)
    return billing.balance(db, ws_id)


class ActiveIn(BaseModel):
    is_active: bool


@router.post("/users/{user_id}/active", dependencies=[Depends(require_admin)])
def admin_set_user_active(user_id: int, payload: ActiveIn, db: Session = Depends(get_db)):
    """Switch one person off (signed out everywhere) or back on."""
    m = db.get(TeamMember, user_id)
    if m is None:
        raise HTTPException(404, "User not found.")
    m.is_active = payload.is_active
    signed_out = 0 if payload.is_active else _sign_out(db, user_id=user_id)
    db.commit()
    log.warning("admin portal: user %s %s", user_id, "enabled" if payload.is_active else "disabled")
    return {"is_active": m.is_active, "signed_out": signed_out}


# ── AI models: prices, markup, who may use which, and the usage ───────────
@router.get("/ai/models", dependencies=[Depends(require_admin)])
def admin_ai_models(db: Session = Depends(get_db)):
    """Every catalog model: on/off, our price per 1M tokens, the markup, and
    whether the platform has the keys it needs."""
    from app import ai_models

    rows = {r.key: r for r in db.scalars(select(AiModel)).all()}
    out = []
    for key, info in ai_models.CATALOG.items():
        r = rows.get(key)
        out.append(
            {
                "key": key,
                **info,
                "enabled": bool(r and r.enabled),
                "price_in": float(r.price_in) if r else 0.0,
                "price_out": float(r.price_out) if r else 0.0,
                "markup": float(r.markup) if r else 1.3,
                "configured": ai_models.configured(key),
            }
        )
    return {"models": out}


class AiModelIn(BaseModel):
    enabled: bool | None = None
    price_in: float | None = Field(default=None, ge=0, le=1000)
    price_out: float | None = Field(default=None, ge=0, le=1000)
    markup: float | None = Field(default=None, ge=1, le=10)


@router.patch("/ai/models/{key}", dependencies=[Depends(require_admin)])
def admin_update_ai_model(key: str, payload: AiModelIn, db: Session = Depends(get_db)):
    from app import ai_models

    if key not in ai_models.CATALOG:
        raise HTTPException(404, "Unknown model.")
    r = db.get(AiModel, key) or AiModel(key=key, enabled=False, price_in=0, price_out=0, markup=1.3)
    for field in ("enabled", "price_in", "price_out", "markup"):
        value = getattr(payload, field)
        if value is not None:
            setattr(r, field, value)
    if r.enabled and not (float(r.price_in) or float(r.price_out)):
        raise HTTPException(422, "Set its price before turning it on — credit is charged from it.")
    db.add(r)
    db.commit()
    ai_models.forget()
    log.warning("admin portal: AI model %s -> %s", key, payload.model_dump(exclude_none=True))
    return admin_ai_models(db)


@router.get("/ai/usage", dependencies=[Depends(require_admin)])
def admin_ai_usage(days: int = 30, db: Session = Depends(get_db)):
    """AI writing per workspace and model over the last ``days`` days: calls,
    tokens in / out, what it cost us and what their credit was charged."""
    from app.ai_models_api import usage_rows

    since = datetime.now(UTC) - timedelta(days=max(1, min(days, 366)))
    names = dict(db.execute(select(Workspace.id, Workspace.name)).all())
    rows = usage_rows(db, since)
    tenants: dict[int, dict] = {}
    for r in rows:
        t = tenants.setdefault(r["who"], {"id": r["who"], "name": names.get(r["who"], f"#{r['who']}"), "calls": 0, "tokens": 0, "cost": 0.0, "charged": 0.0, "models": []})
        t["models"].append({k: v for k, v in r.items() if k != "who"})
        for k in ("calls", "tokens"):
            t[k] += r[k]
        t["cost"] = round(t["cost"] + r["cost"], 4)
        t["charged"] = round(t["charged"] + r["charged"], 4)
    by_model: dict[str, dict] = {}
    for r in rows:
        m = by_model.setdefault(r["model"], {"model": r["model"], "calls": 0, "input_tokens": 0, "output_tokens": 0, "tokens": 0, "cost": 0.0, "charged": 0.0})
        for k in ("calls", "input_tokens", "output_tokens", "tokens"):
            m[k] += r[k]
        m["cost"] = round(m["cost"] + r["cost"], 4)
        m["charged"] = round(m["charged"] + r["charged"], 4)
    return {
        "days": days,
        "tenants": sorted(tenants.values(), key=lambda t: -t["charged"]),
        "models": sorted(by_model.values(), key=lambda m: -m["charged"]),
        "daily": _ai_daily(db, since),
    }


def _ai_by_kind(db: Session, since: datetime) -> dict:
    """The Overview's charts, by kind of work (activity_kind): every day since ``since`` —
    [{"day", "models": {group: {calls, charged}}}] — this month's split, and the accounts
    that spent most this month."""
    rows = db.execute(
        select(CreditEntry.created_at, CreditEntry.kind, CreditEntry.note, CreditEntry.amount_usd, CreditEntry.workspace_id).where(
            CreditEntry.created_at >= min(since, billing.month_start()), CreditEntry.amount_usd < 0
        )
    ).all()
    month0 = billing.month_start()
    days: dict[str, dict] = {}
    split: dict[str, dict] = {}
    spend: dict[int, float] = {}
    for at, kind, note, amount, ws_id in rows:
        group = activity_kind(kind, note)[0]
        charged = -float(amount)
        at = at if at.tzinfo else at.replace(tzinfo=UTC)
        if at >= since:
            g = days.setdefault(at.date().isoformat(), {}).setdefault(group, {"calls": 0, "charged": 0.0})
            g["calls"] += 1
            g["charged"] = round(g["charged"] + charged, 4)
        if at >= month0:
            s = split.setdefault(group, {"model": group, "calls": 0, "charged": 0.0})
            s["calls"] += 1
            s["charged"] = round(s["charged"] + charged, 4)
            spend[ws_id] = spend.get(ws_id, 0.0) + charged
    first, last = since.date(), datetime.now(UTC).date()
    daily = []
    while first <= last:
        daily.append({"day": first.isoformat(), "models": days.get(first.isoformat(), {})})
        first += timedelta(days=1)
    top = sorted(spend.items(), key=lambda kv: -kv[1])[:6]
    names = {w.id: w.name for w in db.scalars(select(Workspace).where(Workspace.id.in_([k for k, _ in top] or [0])))}
    return {
        "daily": daily,
        "split": sorted(split.values(), key=lambda s: -s["charged"]),
        "top_accounts": [{"id": k, "name": names.get(k, f"#{k}"), "charged": round(v, 2), "cost": 0, "calls": 0, "tokens": 0, "models": []} for k, v in top],
    }


def _ai_daily(db: Session, since: datetime) -> list[dict]:
    """Every day since ``since`` (UTC, quiet days too): each model's calls, our cost and what
    was charged — the AI usage page's line chart. [{"day": "2026-10-29", "models": {key: {...}}}]"""
    from app import ai_models

    day = func.date(CreditEntry.created_at)
    q = (
        select(day, CreditEntry.model, func.count(), func.coalesce(func.sum(CreditEntry.cost_usd), 0), func.coalesce(-func.sum(CreditEntry.amount_usd), 0))
        .where(CreditEntry.kind == "text", CreditEntry.created_at >= since)
        .group_by(day, CreditEntry.model)
    )
    found: dict[str, dict] = {}
    for d, model, n, cost, charged in db.execute(q).all():
        key = ai_models.canonical(model or "")
        m = found.setdefault(str(d)[:10], {}).setdefault(key, {"calls": 0, "cost": 0.0, "charged": 0.0})
        m["calls"] += n
        m["cost"] = round(m["cost"] + float(cost), 4)
        m["charged"] = round(m["charged"] + float(charged), 4)
    first, last = since.date(), datetime.now(UTC).date()
    out = []
    while first <= last:
        out.append({"day": first.isoformat(), "models": found.get(first.isoformat(), {})})
        first += timedelta(days=1)
    return out


@router.get("/workspaces/{ws_id}/ai", dependencies=[Depends(require_admin)])
def admin_workspace_ai(ws_id: int, days: int = 30, db: Session = Depends(get_db)):
    """One workspace: its default model, which models it may use, and each
    person's usage by model."""
    from app import ai_models
    from app.ai_models_api import usage_rows

    w = _workspace(db, ws_id)
    since = datetime.now(UTC) - timedelta(days=max(1, min(days, 366)))
    names = dict(db.execute(select(TeamMember.id, TeamMember.name).where(TeamMember.workspace_id == ws_id)).all())
    users = usage_rows(db, since, ws=ws_id, by_user=True)
    for r in users:
        r["user"] = names.get(r.pop("who"), "Automations")
    return {
        "default": w.ai_model,
        "allowed": w.ai_models_allowed,  # null = every enabled model
        "catalog": [{"key": k, "label": v["label"]} for k, v in ai_models.CATALOG.items()],
        "usage": users,
    }


class AllowedIn(BaseModel):
    allowed: list[str] | None = None  # null = every enabled model


@router.post("/workspaces/{ws_id}/ai-models", dependencies=[Depends(require_admin)])
def admin_set_workspace_models(ws_id: int, payload: AllowedIn, db: Session = Depends(get_db)):
    from app import ai_models

    w = _workspace(db, ws_id)
    if payload.allowed is not None:
        unknown = [k for k in payload.allowed if k not in ai_models.CATALOG]
        if unknown:
            raise HTTPException(422, f"Unknown model: {', '.join(unknown)}")
        if w.ai_model and w.ai_model not in payload.allowed:
            w.ai_model = ""  # their default isn't allowed any more — back to the platform's
    w.ai_models_allowed = payload.allowed
    db.commit()
    ai_models.forget_workspace(ws_id)
    log.warning("admin portal: workspace %s AI models -> %s", ws_id, payload.allowed)
    return {"allowed": w.ai_models_allowed, "default": w.ai_model}
