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
        "recent": [_ws_row(w, owners.get(w.id), st) for w in workspaces[:8]],
    }


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


def _workspace(db: Session, ws_id: int) -> Workspace:
    w = db.get(Workspace, ws_id)
    if w is None:
        raise HTTPException(404, "Account not found.")
    return w


@router.get("/workspaces/{ws_id}", dependencies=[Depends(require_admin)])
def admin_workspace(ws_id: int, db: Session = Depends(get_db)):
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
    logins = db.scalars(
        select(LoginEvent).where(LoginEvent.workspace_id == ws_id).order_by(LoginEvent.created_at.desc()).limit(10)
    ).all()
    owner = next((m for m in members if m.role == "owner"), None)
    return {
        **_ws_row(w, owner, st),
        "balance": billing.balance(db, ws_id),
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
            {"at": c.created_at, "kind": c.kind, "amount": round(float(c.amount_usd), 4), "note": c.note}
            for c in credit
        ],
        "logins": [
            {"at": e.created_at, "email": e.email, "status": e.status, "ip": e.ip} for e in logins
        ],
    }


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
            amount_usd=round(payload.amount_usd, 2),
            note=(payload.note.strip() or "Added by ContentFlow")[:300],
        )
    )
    db.commit()
    log.warning("admin portal: +$%.2f credit to workspace %s", payload.amount_usd, ws_id)
    return billing.balance(db, ws_id)


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
