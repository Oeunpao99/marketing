"""Email + password auth. The ``team_members`` table doubles as the user table."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TeamMember
from app.schemas import AuthOut, LoginIn, RegisterIn, UserOut
from app.security import create_token, decode_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Auth"])


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> TeamMember:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        user_id = decode_token(authorization[7:].strip())
    except Exception as exc:  # noqa: BLE001 - any failure means "not authed"
        raise HTTPException(401, "Invalid or expired session") from exc
    user = db.get(TeamMember, user_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Account not found")
    return user


@router.post("/register", response_model=AuthOut, status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(422, "Enter a valid email address.")
    exists = db.scalar(select(TeamMember).where(func.lower(TeamMember.email) == email))
    if exists is not None:
        raise HTTPException(409, "An account with that email already exists.")

    first_user = db.scalar(select(func.count()).select_from(TeamMember)) == 0
    user = TeamMember(
        name=payload.name.strip(),
        email=email,
        initials=_initials(payload.name),
        role="admin" if first_user else "editor",
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthOut(token=create_token(user.id), user=UserOut.model_validate(user))


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
    return AuthOut(token=create_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: TeamMember = Depends(get_current_user)):
    return UserOut.model_validate(user)
