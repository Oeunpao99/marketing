"""Email + password auth. The ``team_members`` table doubles as the user table.

Signing up creates a brand-new, empty ``Workspace`` with the new user as its
owner — each sign-up is its own isolated account (app/tenancy.py).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Brand, TeamMember, Workspace
from app.schemas import AuthOut, LoginIn, RegisterIn, UserOut, WorkspaceUpdate
from app.security import create_token, hash_password, verify_password
from app.tenancy import get_current_user, require_manager

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
def register(payload: RegisterIn, db: Session = Depends(get_db)):
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
    return AuthOut(token=create_token(user.id), user=_user_out(db, user))


@router.post("/login", response_model=AuthOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.scalar(select(TeamMember).where(func.lower(TeamMember.email) == email))
    if user is None or not user.password_hash or not verify_password(
        payload.password, user.password_hash
    ):
        raise HTTPException(401, "Wrong email or password.")
    if not user.is_active:
        raise HTTPException(403, "This account is disabled.")
    return AuthOut(token=create_token(user.id), user=_user_out(db, user))


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
