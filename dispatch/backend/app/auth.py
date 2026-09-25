"""Email + password auth. The ``team_members`` table doubles as the user table.

Signing up creates a brand-new, empty ``Workspace`` with the new user as its
owner — each sign-up is its own isolated account (app/tenancy.py).
"""

from __future__ import annotations

import ipaddress
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Brand, LoginEvent, TeamMember, Workspace
from app.schemas import AuthOut, LoginIn, RegisterIn, UserOut, WorkspaceUpdate
from app.security import create_token, hash_password, verify_password
from app.tenancy import MANAGER_ROLES, get_current_user, require_manager

router = APIRouter(prefix="/auth", tags=["Auth"])

# Re-exported for older imports (``from app.auth import get_current_user``).
__all__ = ["router", "get_current_user"]


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _user_out(db: Session, user: TeamMember) -> UserOut:
    ws = db.get(Workspace, user.workspace_id)
    return UserOut.model_validate(user).model_copy(
        update={"workspace_name": ws.name if ws else ""}
    )


@router.post("/register", response_model=AuthOut, status_code=201)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(422, "Enter a valid email address.")
    exists = db.scalar(select(TeamMember).where(func.lower(TeamMember.email) == email))
    if exists is not None:
        raise HTTPException(409, "An account with that email already exists.")

    name = payload.name.strip()
    workspace = Workspace(name=payload.workspace_name.strip() or f"{name}'s workspace")
    db.add(workspace)
    db.flush()
    user = TeamMember(
        workspace_id=workspace.id,
        name=name,
        email=email,
        initials=_initials(name),
        role="owner",
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    record_login(db, request, email, "signup", user)
    return AuthOut(token=create_token(user.id), user=_user_out(db, user))


@router.post("/login", response_model=AuthOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    ip = client_ip(request)
    user = db.scalar(select(TeamMember).where(func.lower(TeamMember.email) == email))

    def fail(status: str, code: int, message: str):
        record_login(db, request, email, status, user)
        raise HTTPException(code, message)

    if too_many_failures(db, email, ip):
        fail("blocked", 429, "Too many failed sign-in attempts. Wait 15 minutes and try again.")
    if user is None:
        fail("unknown_email", 401, "Wrong email or password.")
    if not user.password_hash or not verify_password(payload.password, user.password_hash):
        fail("wrong_password", 401, "Wrong email or password.")
    if not user.is_active:
        fail("disabled", 403, "This account is disabled.")
    record_login(db, request, email, "success", user)
    return AuthOut(token=create_token(user.id), user=_user_out(db, user))


# ── Security: sign-in history ─────────────────────────────────────────────
# Every attempt is written to login_events (never the password). Owners and
# admins see their whole workspace's history; everyone else sees their own.
_FAIL_WINDOW = timedelta(minutes=15)
_MAX_FAILS_PER_EMAIL = 10
_MAX_FAILS_PER_IP = 30
_KEEP_FOR = timedelta(days=90)
_FAILED = ("wrong_password", "unknown_email", "disabled", "blocked")


def client_ip(request: Request) -> str:
    """The visitor's real address. The site sits behind two proxies (the VM's
    front proxy, then the frontend container's nginx), each appending to
    X-Forwarded-For — so walk it from the right and take the first public
    address; a client can prepend fake entries on the left, not the right."""
    chain = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    for candidate in reversed(chain):
        try:
            addr = ipaddress.ip_address(candidate)
        except ValueError:
            continue
        if addr.is_global:
            return candidate
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "")


def too_many_failures(db: Session, email: str, ip: str) -> bool:
    since = datetime.now(UTC) - _FAIL_WINDOW
    failed = select(func.count()).select_from(LoginEvent).where(
        LoginEvent.created_at >= since, LoginEvent.status.in_(_FAILED)
    )
    if (db.scalar(failed.where(LoginEvent.email == email)) or 0) >= _MAX_FAILS_PER_EMAIL:
        return True
    return bool(ip) and (db.scalar(failed.where(LoginEvent.ip == ip)) or 0) >= _MAX_FAILS_PER_IP


def record_login(db: Session, request: Request, email: str, status: str, user: TeamMember | None) -> None:
    db.add(
        LoginEvent(
            workspace_id=user.workspace_id if user else None,
            user_id=user.id if user else None,
            email=email[:160],
            status=status,
            ip=client_ip(request)[:64],
            user_agent=request.headers.get("user-agent", "")[:300],
        )
    )
    if status == "success":  # prune old history now and then, not on every attempt
        db.execute(delete(LoginEvent).where(LoginEvent.created_at < datetime.now(UTC) - _KEEP_FOR))
    db.commit()


def describe_device(ua: str) -> str:
    """"Chrome on Windows" from a User-Agent string — enough to recognise a device."""
    browser = next(
        (name for token, name in (
            ("Edg/", "Edge"), ("OPR/", "Opera"), ("SamsungBrowser", "Samsung Internet"),
            ("CriOS", "Chrome"), ("FxiOS", "Firefox"), ("Firefox/", "Firefox"),
            ("Chrome/", "Chrome"), ("Safari/", "Safari"),
        ) if token in ua),
        "",
    )
    system = next(
        (name for token, name in (
            ("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"),
            ("Windows", "Windows"), ("Mac OS X", "macOS"), ("CrOS", "ChromeOS"), ("Linux", "Linux"),
        ) if token in ua),
        "",
    )
    if browser and system:
        return f"{browser} on {system}"
    return browser or system or ("Unknown device" if ua else "—")


@router.get("/security/logins")
def login_history(request: Request, user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    manager = user.role in MANAGER_ROLES
    mine = LoginEvent.workspace_id == user.workspace_id if manager else LoginEvent.user_id == user.id
    rows = db.scalars(select(LoginEvent).where(mine).order_by(LoginEvent.created_at.desc()).limit(200)).all()
    since = datetime.now(UTC) - timedelta(hours=24)
    failed_24h = db.scalar(
        select(func.count()).select_from(LoginEvent).where(
            mine, LoginEvent.created_at >= since, LoginEvent.status.in_(_FAILED)
        )
    )
    names = {
        m.id: m.name
        for m in db.scalars(select(TeamMember).where(TeamMember.workspace_id == user.workspace_id)).all()
    }
    here_ip, here_ua = client_ip(request), request.headers.get("user-agent", "")
    return {
        "scope": "workspace" if manager else "me",
        "failed_24h": failed_24h or 0,
        "events": [
            {
                "id": r.id,
                "at": r.created_at.isoformat(),
                "email": r.email,
                "member": names.get(r.user_id, ""),
                "status": r.status,
                "ip": r.ip,
                "device": describe_device(r.user_agent),
                "user_agent": r.user_agent,
                "this_device": r.ip == here_ip and r.user_agent == here_ua,
            }
            for r in rows
        ],
    }


@router.get("/me", response_model=UserOut)
def me(user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    return _user_out(db, user)


@router.patch("/workspace", response_model=UserOut)
def rename_workspace(
    payload: WorkspaceUpdate,
    user: TeamMember = Depends(require_manager),
    db: Session = Depends(get_db),
):
    ws = db.get(Workspace, user.workspace_id)
    ws.name = payload.name.strip()
    db.commit()
    return _user_out(db, user)


# ── account settings (the Settings window) ───────────────────────────────
class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, min_length=3, max_length=160)
    timezone: str | None = Field(default=None, max_length=40)
    location: str | None = Field(default=None, max_length=120)
    # Merged into the stored preferences (send only the keys that changed).
    preferences: dict | None = None


def _email_taken(db: Session, email: str, except_id: int | None = None) -> bool:
    q = select(TeamMember.id).where(func.lower(TeamMember.email) == email)
    if except_id is not None:
        q = q.where(TeamMember.id != except_id)
    return db.scalar(q) is not None


def _clean_email(raw: str) -> str:
    email = raw.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(422, "Enter a valid email address.")
    return email


@router.patch("/me", response_model=UserOut)
def update_me(payload: ProfileIn, user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.name is not None:
        user.name = payload.name.strip()
        user.initials = _initials(user.name)
    if payload.email is not None:
        email = _clean_email(payload.email)
        if _email_taken(db, email, user.id):
            raise HTTPException(409, "Another account already uses that email.")
        user.email = email
    if payload.timezone is not None:
        user.timezone = payload.timezone.strip()
    if payload.location is not None:
        user.location = payload.location.strip()
    if payload.preferences is not None:
        if len(str(payload.preferences)) > 4000:
            raise HTTPException(422, "Preferences are too large.")
        user.preferences = {**(user.preferences or {}), **payload.preferences}
    db.commit()
    db.refresh(user)
    return _user_out(db, user)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/password", status_code=204)
def change_password(payload: PasswordIn, user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.password_hash or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Your current password is wrong.")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return None


@router.get("/workspace")
def workspace_info(user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.get(Workspace, user.workspace_id)
    return {
        "id": ws.id,
        "name": ws.name,
        "created_at": ws.created_at,
        "brands": db.scalar(select(func.count()).select_from(Brand).where(Brand.workspace_id == ws.id)) or 0,
        "members": db.scalar(
            select(func.count()).select_from(TeamMember).where(TeamMember.workspace_id == ws.id)
        ) or 0,
    }


# Team: owners/admins add people with a temporary password (no email service
# yet — they share it and the person changes it under Settings → Security).
ROLES = ("owner", "admin", "editor")


def _member_out(m: TeamMember) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "email": m.email,
        "initials": m.initials or _initials(m.name),
        "role": m.role,
        "is_active": m.is_active,
        "can_login": bool(m.password_hash),
        "created_at": m.created_at,
    }


def _member(db: Session, manager: TeamMember, member_id: int) -> TeamMember:
    m = db.get(TeamMember, member_id)
    if m is None or m.workspace_id != manager.workspace_id:
        raise HTTPException(404, "Member not found.")
    return m


@router.get("/members")
def list_members(user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(TeamMember).where(TeamMember.workspace_id == user.workspace_id).order_by(TeamMember.id)
    ).all()
    return [_member_out(m) for m in rows]


class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=160)
    role: str = "editor"
    password: str = Field(min_length=8, max_length=128)


@router.post("/members", status_code=201)
def add_member(payload: MemberIn, manager: TeamMember = Depends(require_manager), db: Session = Depends(get_db)):
    if payload.role not in ("admin", "editor"):
        raise HTTPException(422, "Role must be admin or editor.")
    email = _clean_email(payload.email)
    if _email_taken(db, email):
        raise HTTPException(409, "An account with that email already exists.")
    m = TeamMember(
        workspace_id=manager.workspace_id,
        name=payload.name.strip(),
        email=email,
        initials=_initials(payload.name),
        role=payload.role,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _member_out(m)


class MemberUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None


@router.patch("/members/{member_id}")
def update_member(
    member_id: int, payload: MemberUpdate, manager: TeamMember = Depends(require_manager), db: Session = Depends(get_db)
):
    m = _member(db, manager, member_id)
    if m.id == manager.id:
        raise HTTPException(400, "You can't change your own role or access.")
    if m.role == "owner" and manager.role != "owner":
        raise HTTPException(403, "Only the owner can change the owner.")
    if payload.role is not None:
        if payload.role not in ("admin", "editor"):
            raise HTTPException(422, "Role must be admin or editor.")
        m.role = payload.role
    if payload.is_active is not None:
        m.is_active = payload.is_active
    db.commit()
    db.refresh(m)
    return _member_out(m)


@router.delete("/members/{member_id}", status_code=204)
def remove_member(member_id: int, manager: TeamMember = Depends(require_manager), db: Session = Depends(get_db)):
    m = _member(db, manager, member_id)
    if m.id == manager.id:
        raise HTTPException(400, "You can't remove yourself.")
    if m.role == "owner":
        raise HTTPException(403, "The workspace owner can't be removed.")
    db.delete(m)
    db.commit()
    return None
