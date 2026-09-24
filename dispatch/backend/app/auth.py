"""Email + password auth. The ``team_members`` table doubles as the user table.

Signing up creates a brand-new, empty ``Workspace`` with the new user as its
owner — each sign-up is its own isolated account (app/tenancy.py).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TeamMember, Workspace
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
