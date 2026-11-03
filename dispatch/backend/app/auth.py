"""Email + password auth. The ``team_members`` table doubles as the user table.

Signing up creates a brand-new, empty ``Workspace`` with the new user as its
owner — each sign-up is its own isolated account (app/tenancy.py).
"""

from __future__ import annotations

import hashlib
import ipaddress
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Brand, LoginEvent, SalesRep, TeamMember, Workspace, WorkspaceInvite
from app.schemas import AuthOut, LoginIn, RegisterIn, UserOut, WorkspaceUpdate
from app import access as feature_access
from app import sessions
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
        update={"workspace_name": ws.name if ws else "", "email_verified": user.email_verified_at is not None}
    )


# ── Email confirmation: a 6-digit code (app/mailer.py) ─────────────────────
_CODE_TTL = timedelta(minutes=15)
_CODE_TRIES = 5
_RESEND_AFTER = timedelta(seconds=60)


def _code_hash(user: TeamMember, code: str, purpose: str = "") -> str:
    from app.config import get_settings

    return hashlib.sha256(f"{get_settings().secret_key}:{purpose}{user.id}:{code}".encode()).hexdigest()


def _send_code(db: Session, user: TeamMember, request: Request | None = None) -> None:
    """A new code for ``user`` (any older one stops working), emailed in the
    background — with where the request came from. Email switched off: the
    account just counts as confirmed."""
    from app import mailer

    now = datetime.now(UTC)
    if not mailer.configured():
        user.email_verified_at = now
        db.commit()
        return
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.email_code_hash = _code_hash(user, code)
    user.email_code_expires = now + _CODE_TTL
    user.email_code_sent_at = now
    user.email_code_tries = 0
    db.commit()
    ip, ua = (client_ip(request), request.headers.get("user-agent", "")) if request is not None else ("", "")
    mailer.send_code(user.email, user.name, code, ip=ip, ua=ua)


def _aware(t: datetime | None) -> datetime | None:
    return t.replace(tzinfo=UTC) if t is not None and t.tzinfo is None else t


@router.post("/register", response_model=AuthOut, status_code=201)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(422, "Enter a valid email address.")
    exists = db.scalar(select(TeamMember).where(func.lower(TeamMember.email) == email))
    if exists is not None:
        raise HTTPException(409, "An account with that email already exists.")

    name = payload.name.strip()
    phone = clean_phone(payload.phone)
    # every new account starts on Free (100 credits); paid plans: Billing → Upgrade (app/payments.py)
    workspace = Workspace(name=payload.workspace_name.strip() or f"{name}'s workspace", plan="free")
    db.add(workspace)
    db.flush()
    user = TeamMember(
        workspace_id=workspace.id,
        name=name,
        email=email,
        phone=phone,
        initials=_initials(name),
        role="owner",
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    record_login(db, request, email, "signup", user)
    from app import team_alerts

    team_alerts.new_signup(user, request, "email")  # the team's Telegram group hears (background)
    _send_code(db, user, request)  # the 6-digit code to confirm the email; the welcome email comes after it
    token = create_token(user.id)
    sessions.start(token, user, request)
    return AuthOut(token=token, user=_user_out(db, user))


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
    if db.scalar(select(Workspace.suspended_at).where(Workspace.id == user.workspace_id)):
        fail("suspended", 403, "This account is suspended — please contact Marketing ឆ្លាតវៃ support.")
    record_login(db, request, email, "success", user)
    token = create_token(user.id)
    sessions.start(token, user, request)
    return AuthOut(token=token, user=_user_out(db, user))


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


class CodeIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)


@router.post("/verify-email", response_model=UserOut)
def verify_email(payload: CodeIn, user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    """Confirm the account's email with the code we emailed — then the welcome email."""
    if user.email_verified_at is not None:
        return _user_out(db, user)
    code = "".join(ch for ch in payload.code if ch.isdigit())
    expires = _aware(user.email_code_expires)
    if not user.email_code_hash or expires is None or expires < datetime.now(UTC):
        raise HTTPException(410, "This code has expired — press “Send a new code”.")
    if user.email_code_tries >= _CODE_TRIES:
        raise HTTPException(429, "Too many wrong codes — press “Send a new code”.")
    if not secrets.compare_digest(_code_hash(user, code), user.email_code_hash):
        user.email_code_tries += 1
        db.commit()
        left = _CODE_TRIES - user.email_code_tries
        raise HTTPException(422, f"That code isn't right — {left} tr{'y' if left == 1 else 'ies'} left." if left else "Too many wrong codes — press “Send a new code”.")
    user.email_verified_at = datetime.now(UTC)
    user.email_code_hash = None
    user.email_code_expires = None
    db.commit()
    from app import mailer

    mailer.send_welcome(user.email, user.name)
    return _user_out(db, user)


@router.post("/verify-email/resend")
def resend_code(request: Request, user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    """A new code — at most once a minute."""
    if user.email_verified_at is not None:
        return {"sent": False, "verified": True}
    sent = _aware(user.email_code_sent_at)
    if sent is not None and datetime.now(UTC) - sent < _RESEND_AFTER:
        wait = int((_RESEND_AFTER - (datetime.now(UTC) - sent)).total_seconds()) + 1
        raise HTTPException(429, f"Wait {wait} seconds, then send a new code.")
    _send_code(db, user, request)
    return {"sent": True, "verified": user.email_verified_at is not None}


# ── Forgot password: a 6-digit code to the account's email, then a new password ──
_SENT_IF = "If an account uses that email, we sent it a 6-digit code. Check your inbox (and spam)."


class ForgotIn(BaseModel):
    email: str = Field(min_length=3, max_length=160)


class ResetIn(BaseModel):
    email: str = Field(min_length=3, max_length=160)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(min_length=8, max_length=128)


@router.post("/password-reset")
def forgot_password(payload: ForgotIn, request: Request, db: Session = Depends(get_db)):
    """Public: email a reset code. The answer is the same whether or not the
    email has an account — nobody can use this to find out who our customers are."""
    from app import mailer

    if not mailer.configured():
        raise HTTPException(503, "Password reset by email isn't available yet — please contact Smart Marketing support.")
    email = payload.email.strip().lower()
    if too_many_failures(db, email, client_ip(request)):
        raise HTTPException(429, "Too many tries. Wait 15 minutes and try again.")
    user = db.scalar(select(TeamMember).where(func.lower(TeamMember.email) == email))
    if user is not None and user.is_active:
        sent = _aware(user.reset_code_sent_at)
        now = datetime.now(UTC)
        if sent is None or now - sent >= _RESEND_AFTER:  # at most one email a minute
            code = f"{secrets.randbelow(1_000_000):06d}"
            user.reset_code_hash = _code_hash(user, code, "reset:")
            user.reset_code_expires = now + _CODE_TTL
            user.reset_code_sent_at = now
            user.reset_code_tries = 0
            db.commit()
            mailer.send_reset_code(user.email, user.name, code, ip=client_ip(request), ua=request.headers.get("user-agent", ""))
        record_login(db, request, email, "reset_asked", user)
    return {"sent": True, "message": _SENT_IF}


class ResetCodeIn(BaseModel):
    email: str = Field(min_length=3, max_length=160)
    code: str = Field(min_length=4, max_length=12)


def _reset_user(db: Session, request: Request, email: str, raw_code: str) -> TeamMember:
    """The account whose reset code this is — or a refusal (wrong codes count
    toward the 15-minute lock and the code's 5 tries)."""
    bad = HTTPException(422, "That code isn't right, or it has expired — ask for a new one.")
    if too_many_failures(db, email, client_ip(request)):
        raise HTTPException(429, "Too many tries. Wait 15 minutes and try again.")
    user = db.scalar(select(TeamMember).where(func.lower(TeamMember.email) == email))
    expires = _aware(user.reset_code_expires) if user else None
    if user is None or not user.is_active or not user.reset_code_hash or expires is None or expires < datetime.now(UTC):
        record_login(db, request, email, "wrong_password", user)  # counts toward the 15-minute lock
        raise bad
    if user.reset_code_tries >= _CODE_TRIES:
        raise HTTPException(429, "Too many wrong codes — ask for a new one.")
    code = "".join(ch for ch in raw_code if ch.isdigit())
    if not secrets.compare_digest(_code_hash(user, code, "reset:"), user.reset_code_hash):
        user.reset_code_tries += 1
        db.commit()
        record_login(db, request, email, "wrong_password", user)
        raise bad
    if db.scalar(select(Workspace.suspended_at).where(Workspace.id == user.workspace_id)):
        raise HTTPException(403, "This account is suspended — please contact Smart Marketing support.")
    return user


@router.post("/password-reset/check")
def check_reset_code(payload: ResetCodeIn, request: Request, db: Session = Depends(get_db)):
    """Public: step 2 of "Forgot password" — is this code right? (It stays valid
    for the next step, which checks it again with the new password.)"""
    _reset_user(db, request, payload.email.strip().lower(), payload.code)
    return {"ok": True}


@router.post("/password-reset/confirm", response_model=AuthOut)
def reset_password(payload: ResetIn, request: Request, db: Session = Depends(get_db)):
    """Public: the code and a new password → the password is changed, every other
    device is signed out, and this one is signed in."""
    email = payload.email.strip().lower()
    user = _reset_user(db, request, email, payload.code)
    now = datetime.now(UTC)
    user.password_hash = hash_password(payload.password)
    user.reset_code_hash = None
    user.reset_code_expires = None
    if user.email_verified_at is None:  # the code reached their inbox: the email is theirs
        user.email_verified_at = now
    db.commit()
    record_login(db, request, email, "reset", user)
    token = create_token(user.id)
    sessions.start(token, user, request)
    sessions.revoke_others(user.id, sessions.session_id(token))  # whoever had the old password is out
    from app import mailer

    mailer.send_password_changed(user.email, user.name)
    return AuthOut(token=token, user=_user_out(db, user))


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
    phone: str | None = Field(default=None, max_length=40)
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


def clean_phone(raw: str) -> str:
    """A phone number as "+<country><number>". Cambodian by default: "012 345 678",
    "12345678" and "855 12 345 678" all become "+85512345678"."""
    s = (raw or "").strip()
    plus = s.startswith("+")
    digits = "".join(ch for ch in s if ch.isdigit())
    if not plus:
        if digits.startswith("00"):
            digits = digits[2:]
        elif digits.startswith("855") and len(digits) >= 11:
            pass
        else:
            digits = "855" + digits.lstrip("0")
    if digits.startswith("8550"):  # "+855 012 …": the trunk 0 doesn't belong after the code
        digits = "855" + digits[4:]
    if not 8 <= len(digits) <= 15 or (digits.startswith("855") and not 11 <= len(digits) <= 12):
        raise HTTPException(422, "Enter a phone number we can call — e.g. 012 345 678.")
    return "+" + digits


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
    first_phone = False
    if payload.phone is not None:
        first_phone = not user.phone
        user.phone = clean_phone(payload.phone)
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
    if first_phone:  # an owner who signed up with Google (or before phones were asked): the team hears
        from app import team_alerts

        team_alerts.phone_added(user)
    return _user_out(db, user)


class PasswordIn(BaseModel):
    current_password: str = ""  # empty only for a Google-made account's first password
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/password", status_code=204)
def change_password(payload: PasswordIn, user: TeamMember = Depends(get_current_user), db: Session = Depends(get_db)):
    # accounts made with "Continue with Google" have no password yet — their
    # first one needs no current password (they're signed in already)
    if user.password_hash and not verify_password(payload.current_password, user.password_hash):
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
        "access": m.access,
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
    access: list[str] | None = None


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
        access=feature_access.clean(payload.access) if payload.role == "editor" else None,
        email_verified_at=datetime.now(UTC),  # the owner added them: no code needed
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    sessions.member_joined(m, f"added by {manager.name}")  # the owner / admins hear (push + bell)
    return _member_out(m)


class MemberUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    # Editor feature access: a list of app/access.py keys; send
    # "all_access": true to go back to everything.
    access: list[str] | None = None
    all_access: bool = False


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
    if payload.all_access or m.role != "editor":
        m.access = None
    elif payload.access is not None:
        m.access = feature_access.clean(payload.access)
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


# ── Invite links ──────────────────────────────────────────────────────────
# An owner/admin makes a link (role, feature access, expiry, how many people);
# whoever opens it picks their own name, email and password and is signed in
# to this workspace. Only the token's hash is stored — the link is shown once.
_INVITE_DAYS = {1, 7, 30}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _invite_usable(inv: WorkspaceInvite | None) -> bool:
    return (
        inv is not None
        and not inv.revoked
        and inv.expires_at > datetime.now(UTC)
        and (inv.max_uses is None or inv.uses < inv.max_uses)
    )


def _invite_out(inv: WorkspaceInvite) -> dict:
    return {
        "id": inv.id,
        "role": inv.role,
        "access": inv.access,
        "label": inv.label,
        "expires_at": inv.expires_at,
        "max_uses": inv.max_uses,
        "uses": inv.uses,
        "active": _invite_usable(inv),
        "created_at": inv.created_at,
    }


class InviteIn(BaseModel):
    role: str = "editor"
    access: list[str] | None = None
    label: str = Field(default="", max_length=120)
    expires_days: int = 7
    # 1 = a single person; null = anyone with the link until it expires.
    max_uses: int | None = 1


@router.get("/features")
def features(user: TeamMember = Depends(get_current_user)):
    """The features an editor's access can include (Team page checkboxes)."""
    return [{"key": k, "label": label, "desc": desc} for k, (label, desc) in feature_access.FEATURES.items()]


@router.get("/invites")
def list_invites(manager: TeamMember = Depends(require_manager), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(WorkspaceInvite)
        .where(WorkspaceInvite.workspace_id == manager.workspace_id, WorkspaceInvite.revoked.is_(False))
        .order_by(WorkspaceInvite.id.desc())
    ).all()
    return [_invite_out(i) for i in rows if _invite_usable(i)]


@router.post("/invites", status_code=201)
def create_invite(payload: InviteIn, manager: TeamMember = Depends(require_manager), db: Session = Depends(get_db)):
    if payload.role not in ("admin", "editor"):
        raise HTTPException(422, "Role must be admin or editor.")
    if payload.expires_days not in _INVITE_DAYS:
        raise HTTPException(422, "Links last 1, 7 or 30 days.")
    if payload.max_uses is not None and not 1 <= payload.max_uses <= 100:
        raise HTTPException(422, "A link can be used by 1 to 100 people.")
    token = secrets.token_urlsafe(24)
    inv = WorkspaceInvite(
        workspace_id=manager.workspace_id,
        created_by=manager.id,
        token_hash=_hash(token),
        role=payload.role,
        access=feature_access.clean(payload.access) if payload.role == "editor" else None,
        label=payload.label.strip(),
        expires_at=datetime.now(UTC) + timedelta(days=payload.expires_days),
        max_uses=payload.max_uses,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {**_invite_out(inv), "token": token}


@router.delete("/invites/{invite_id}", status_code=204)
def revoke_invite(invite_id: int, manager: TeamMember = Depends(require_manager), db: Session = Depends(get_db)):
    inv = db.get(WorkspaceInvite, invite_id)
    if inv is None or inv.workspace_id != manager.workspace_id:
        raise HTTPException(404, "Invite not found.")
    inv.revoked = True
    db.commit()
    return None


def _open_invite(db: Session, token: str) -> WorkspaceInvite:
    inv = db.scalar(select(WorkspaceInvite).where(WorkspaceInvite.token_hash == _hash(token or "")))
    if not _invite_usable(inv):
        raise HTTPException(404, "This invite link has expired or was already used. Ask for a new one.")
    return inv


@router.get("/join/{token}")
def invite_info(token: str, db: Session = Depends(get_db)):
    """Public: what the join page shows before someone signs up."""
    inv = _open_invite(db, token)
    ws = db.get(Workspace, inv.workspace_id)
    inviter = db.get(TeamMember, inv.created_by) if inv.created_by else None
    return {
        "workspace_name": ws.name if ws else "",
        "invited_by": inviter.name if inviter else "",
        "role": inv.role,
        "access": [
            feature_access.FEATURES[k][0] for k in (inv.access or []) if k in feature_access.FEATURES
        ] if inv.access is not None else None,
    }


class JoinIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=160)
    password: str = Field(min_length=8, max_length=128)


@router.post("/join/{token}", response_model=AuthOut, status_code=201)
def join(token: str, payload: JoinIn, request: Request, db: Session = Depends(get_db)):
    """Public: create this person's login in the invite's workspace and sign
    them in. The invite row is locked so a single-use link can't be used twice
    by two people at the same moment."""
    inv = db.scalar(
        select(WorkspaceInvite).where(WorkspaceInvite.token_hash == _hash(token or "")).with_for_update()
    )
    if not _invite_usable(inv):
        raise HTTPException(404, "This invite link has expired or was already used. Ask for a new one.")
    email = _clean_email(payload.email)
    if _email_taken(db, email):
        raise HTTPException(409, "An account with that email already exists — sign in instead, or use another email.")
    name = payload.name.strip()
    user = TeamMember(
        workspace_id=inv.workspace_id,
        name=name,
        email=email,
        initials=_initials(name),
        role=inv.role,
        password_hash=hash_password(payload.password),
        is_active=True,
        access=inv.access if inv.role == "editor" else None,
        email_verified_at=datetime.now(UTC),  # joined by the workspace's invite: no code needed
    )
    db.add(user)
    inv.uses += 1
    db.flush()
    if inv.sales_rep_id:  # "Invite to portal" from Leads → Sales team
        rep = db.get(SalesRep, inv.sales_rep_id)
        if rep is not None and rep.workspace_id == inv.workspace_id and rep.member_id is None:
            rep.member_id = user.id
    db.commit()
    db.refresh(user)
    record_login(db, request, email, "signup", user)
    token_out = create_token(user.id)
    sessions.start(token_out, user, request)
    sessions.member_joined(user, "with an invite link")  # the owner / admins hear (push + bell)
    return AuthOut(token=token_out, user=_user_out(db, user))
