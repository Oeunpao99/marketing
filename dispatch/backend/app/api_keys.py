"""A customer's own API keys — for the MCP connector (app/mcp_server.py): Claude,
ChatGPT or their own code makes videos and pictures in their workspace with one.

A key acts as the person who made it and spends the workspace's credits, like
the app. Only its SHA-256 is stored; the key is shown once, when it's made.
Owners and admins make and revoke them (Settings → API & MCP).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from app import plan_features
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApiKey, TeamMember, Workspace
from app.tenancy import current_workspace_id, require_manager

router = APIRouter(prefix="/api-keys", tags=["API keys"])

PREFIX = "sm_"  # Smart Marketing
MAX_KEYS = 10  # per workspace
EXPIRY_DAYS = (7, 30, 90, 180, 365)  # the pop-up's choices; None = never


def _utc(at: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes — they were stored in UTC."""
    return at.replace(tzinfo=timezone.utc) if at is not None and at.tzinfo is None else at


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def resolve_key(db: Session, key: str) -> tuple[TeamMember, ApiKey] | None:
    """The person a key acts as, and the key — None for an unknown or expired key,
    a removed / inactive person, or a suspended workspace. Notes when it was last used."""
    key = (key or "").strip()
    if not key.startswith(PREFIX) or len(key) > 100:
        return None
    row = db.scalar(select(ApiKey).where(ApiKey.key_hash == _hash(key)))
    if row is None:
        return None
    now = datetime.now(timezone.utc)
    if row.expires_at is not None and _utc(row.expires_at) <= now:
        return None
    user = db.get(TeamMember, row.user_id)
    if user is None or not user.is_active or user.workspace_id != row.workspace_id:
        return None
    if db.scalar(select(Workspace.suspended_at).where(Workspace.id == row.workspace_id)):
        return None
    if row.last_used_at is None or (now - _utc(row.last_used_at)).total_seconds() > 60:
        row.last_used_at = now
        db.commit()
    return user, row


def _out(row: ApiKey, owner: str = "") -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "project": row.project,
        "hint": row.hint,
        "created_by": owner,
        "created_at": row.created_at,
        "expires_at": row.expires_at,
        "last_used_at": row.last_used_at,
    }


@router.get("")
def list_keys(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    rows = db.execute(
        select(ApiKey, TeamMember.name).join(TeamMember, TeamMember.id == ApiKey.user_id).where(ApiKey.workspace_id == ws).order_by(ApiKey.id.desc())
    ).all()
    return [_out(k, name or "") for k, name in rows]


class KeyIn(BaseModel):
    name: str = Field(default="", max_length=60)
    project: str = Field(default="", max_length=60)
    # days until it stops working — one of EXPIRY_DAYS; None = never
    expires_days: int | None = None


@router.post("", status_code=201)
def create_key(payload: KeyIn, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """A new key — returned once, in full; only its hash is kept."""
    plan_features.require(db, user.workspace_id, "api")  # Business and up
    if db.scalar(select(func.count(ApiKey.id)).where(ApiKey.workspace_id == user.workspace_id)) >= MAX_KEYS:
        raise HTTPException(400, f"A workspace can have {MAX_KEYS} keys — revoke one you don't use first.")
    if payload.expires_days is not None and payload.expires_days not in EXPIRY_DAYS:
        raise HTTPException(400, "Pick when the key expires from the list.")
    key = PREFIX + secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=payload.expires_days) if payload.expires_days else None
    row = ApiKey(
        workspace_id=user.workspace_id,
        user_id=user.id,
        name=payload.name.strip() or "API key",
        project=payload.project.strip(),
        key_hash=_hash(key),
        hint=key[-4:],
        expires_at=expires,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {**_out(row, user.name or ""), "key": key}


@router.delete("/{key_id}", status_code=204)
def revoke_key(key_id: int, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    row = db.get(ApiKey, key_id)
    if row is None or row.workspace_id != user.workspace_id:
        raise HTTPException(404, "Key not found")
    db.delete(row)
    db.commit()


@router.post("/{key_id}/rotate")
def rotate_key(key_id: int, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """A new secret for the same key (name, project, logs kept) — the old one stops
    at once. It now acts as the person who rotated it, and a key that expires gets
    its full time again from now. Returned once, in full."""
    row = db.get(ApiKey, key_id)
    if row is None or row.workspace_id != user.workspace_id:
        raise HTTPException(404, "Key not found")
    key = PREFIX + secrets.token_urlsafe(32)
    if row.expires_at is not None:  # the same length as it was made with (the nearest choice)
        now = datetime.now(timezone.utc)
        made_for = (_utc(row.expires_at) - _utc(row.created_at)).days
        row.expires_at = now + timedelta(days=min(EXPIRY_DAYS, key=lambda d: abs(d - made_for)))
        row.created_at = now
    row.key_hash, row.hint, row.user_id, row.last_used_at = _hash(key), key[-4:], user.id, None
    db.commit()
    db.refresh(row)
    return {**_out(row, user.name or ""), "key": key}


@router.get("/usage")
def usage(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The API page's numbers (calls today / yesterday / this month, success over 30
    days) and its Request Logs (the last 100 calls). Times are Phnom Penh's."""
    from datetime import timedelta

    from app.models import ApiRequest

    tz = timezone(timedelta(hours=7))  # the portal runs on Asia/Phnom_Penh
    now = datetime.now(tz)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    q = select(func.count(ApiRequest.id)).where(ApiRequest.workspace_id == ws)
    last30 = db.execute(
        select(func.count(ApiRequest.id), func.count(ApiRequest.id).filter(ApiRequest.ok)).where(
            ApiRequest.workspace_id == ws, ApiRequest.created_at >= now - timedelta(days=30)
        )
    ).one()
    logs = db.scalars(select(ApiRequest).where(ApiRequest.workspace_id == ws).order_by(ApiRequest.id.desc()).limit(100)).all()
    return {
        "today": db.scalar(q.where(ApiRequest.created_at >= today)) or 0,
        "yesterday": db.scalar(q.where(ApiRequest.created_at >= today - timedelta(days=1), ApiRequest.created_at < today)) or 0,
        "month": db.scalar(q.where(ApiRequest.created_at >= today.replace(day=1))) or 0,
        "calls_30d": last30[0] or 0,
        "success_30d": round(100 * (last30[1] or 0) / last30[0]) if last30[0] else None,
        "logs": [
            {"id": r.id, "at": r.created_at, "tool": r.tool, "key": r.key_name or "Playground", "ok": r.ok, "ms": r.ms, "error": r.error, "job_id": r.job_id}
            for r in logs
        ],
    }


class PlaygroundIn(BaseModel):
    tool: str = Field(max_length=40)
    arguments: dict = Field(default_factory=dict)


@router.post("/playground")
def playground(payload: PlaygroundIn, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """Try a tool from the API page, signed in — no key needed. It runs exactly as
    the connector does (and spends credits like it); logged as "Playground"."""
    from app import mcp_server

    return mcp_server.run_tool(db, user, payload.tool, payload.arguments, key=None)
