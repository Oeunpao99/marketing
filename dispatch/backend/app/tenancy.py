"""Workspace isolation — the one place that decides "is this row yours?".

Every authenticated request carries a user, and every user belongs to exactly
one ``Workspace``. Rows are owned either directly (``workspace_id`` on
Brand / Video / GenerationJob / TeamMember) or through their brand (Channel,
Post, Draft, Automation, Product) or post (PostTarget). ``scope(Model, ws)``
turns that into a WHERE clause; ``owned(...)`` fetches one row or 404s — a
404, not a 403, so another tenant's ids don't even confirm they exist.
"""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Automation,
    Brand,
    Channel,
    CreditEntry,
    Draft,
    GenerationJob,
    Platform,
    Post,
    PostTarget,
    Product,
    TeamMember,
    Video,
    VideoStory,
    WeeklyPlan,
)
from app.security import decode_token

MANAGER_ROLES = {"owner", "admin"}


def get_current_user(
    request: Request,
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
    from app import sessions  # local import: sessions imports this module
    from app.billing import bind_user  # local import: billing imports this module

    sessions.touch(db, authorization[7:].strip(), user, request)  # signed out elsewhere → 401
    bind_user(user)  # AI calls in this request are charged to their workspace
    return user


def current_workspace_id(user: TeamMember = Depends(get_current_user)) -> int:
    return user.workspace_id


def require_manager(user: TeamMember = Depends(get_current_user)) -> TeamMember:
    if user.role not in MANAGER_ROLES:
        raise HTTPException(403, "Only a workspace owner or admin can do that.")
    return user


def brand_ids(ws: int):
    """Subquery: every brand id in workspace ``ws``."""
    return select(Brand.id).where(Brand.workspace_id == ws)


def scope(model, ws: int):
    """WHERE clause limiting ``model`` to rows workspace ``ws`` owns.
    Returns None for shared, global tables (Platform)."""
    if model is Platform:
        return None
    if model in (Brand, Video, GenerationJob, TeamMember, VideoStory, CreditEntry):
        return model.workspace_id == ws
    if model in (Channel, Post, Draft, Automation, Product, WeeklyPlan):
        return model.brand_id.in_(brand_ids(ws))
    if model is PostTarget:
        return PostTarget.post_id.in_(select(Post.id).where(Post.brand_id.in_(brand_ids(ws))))
    raise RuntimeError(f"No workspace scope defined for {model.__name__}")


def owned(db: Session, model, item_id: int | None, ws: int, what: str | None = None):
    """The row with this id if workspace ``ws`` owns it, else a 404."""
    clause = scope(model, ws)
    obj = None
    if item_id is not None:
        q = select(model).where(model.id == item_id)
        if clause is not None:
            q = q.where(clause)
        obj = db.scalar(q)
    if obj is None:
        raise HTTPException(404, f"{what or model.__name__} not found.")
    return obj


# Foreign keys a client may send in a create/update payload, and the model
# each must belong to — checked so nobody can attach their row to another
# tenant's brand / video / post / channel.
REF_FIELDS = {
    "brand_id": Brand,
    "video_id": Video,
    "post_id": Post,
    "channel_id": Channel,
}


def check_refs(db: Session, data: dict, ws: int) -> None:
    for field, model in REF_FIELDS.items():
        if data.get(field) is not None:
            owned(db, model, data[field], ws)


def unique_brand_slug(db: Session, slug: str) -> str:
    """Brand slugs are unique across the whole install (the frontend keys on
    them), so a second tenant picking "coffee" gets "coffee-2" instead of an
    error that would reveal someone else's brand."""
    base = (slug or "brand")[:34]
    candidate, n = base, 1
    while db.scalar(select(Brand.id).where(Brand.slug == candidate)) is not None:
        n += 1
        candidate = f"{base}-{n}"
    return candidate
