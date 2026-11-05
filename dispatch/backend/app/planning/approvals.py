"""Share for approval: a finished video or picture sent to the boss as a link.

The marketing team presses "Share for approval" and pastes the link anywhere
(Telegram…). Whoever opens it watches the video, reads the caption and presses
Approve or Ask for changes (with a note), with no account and no download. The
answer reaches the person who shared it (push) and shows on the video in the app.
A revised video goes on the same link as the next version.

Safe by design: the token is 32 random bytes (unguessable) and opens only that one
video, never anything else in the account; it ends after LINK_DAYS days or when the
team turns it off. The page tells search engines not to index it (ApprovePage).
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.tenancy import current_workspace_id, get_current_user
from app.models import ApprovalLink, Brand, TeamMember, Video
from app.notify.push import notify_user

LINK_DAYS = 14

router = APIRouter(prefix="/approvals", tags=["Approvals"])
public_router = APIRouter(prefix="/public/approve", tags=["Approvals"])


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _live(link: ApprovalLink) -> bool:
    return not link.revoked and _aware(link.expires_at) > datetime.now(UTC)


def _out(link: ApprovalLink) -> dict:
    return {
        "id": link.id,
        "video_id": link.video_id,
        "path": f"/approve/{link.token}",
        "status": link.status,
        "comment": link.comment,
        "version": link.version,
        "decided_at": link.decided_at.isoformat() if link.decided_at else None,
        "expires_at": _aware(link.expires_at).isoformat(),
        "live": _live(link),
    }


def _video(db: Session, video_id: int, ws: int) -> Video:
    v = db.get(Video, video_id)
    if v is None or v.workspace_id != ws:
        raise HTTPException(404, "That video isn't in your Library.")
    if not v.url:
        raise HTTPException(400, "This one isn't ready to share yet.")
    return v


def _own_link(db: Session, link_id: int, ws: int) -> ApprovalLink:
    link = db.get(ApprovalLink, link_id)
    if link is None or link.workspace_id != ws:
        raise HTTPException(404, "That link isn't yours.")
    return link


class ShareIn(BaseModel):
    video_id: int
    caption: str = Field(default="", max_length=5000)


class VersionIn(BaseModel):
    video_id: int
    caption: str | None = Field(default=None, max_length=5000)


@router.get("")
def link_for(video_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The latest link this video is on (its own, or a link it's the newest version of)."""
    link = db.scalars(
        select(ApprovalLink)
        .where(ApprovalLink.workspace_id == ws, ApprovalLink.video_id == video_id)
        .order_by(ApprovalLink.id.desc())
    ).first()
    return _out(link) if link else None


@router.get("/asked")
def asked(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Links the boss sent back with changes (still working): a revised video can go on
    one of them as its next version — the boss keeps the same link."""
    links = db.scalars(
        select(ApprovalLink)
        .where(ApprovalLink.workspace_id == ws, ApprovalLink.status == "changes", ApprovalLink.revoked.is_(False))
        .order_by(ApprovalLink.decided_at.desc())
        .limit(20)
    ).all()
    out = []
    for link in links:
        if not _live(link):
            continue
        v = db.get(Video, link.video_id) if link.video_id else None
        out.append({**_out(link), "media": v.url if v else "", "filename": v.filename if v else ""})
    return out


@router.post("", status_code=201)
def share(
    payload: ShareIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """A link for this video — the one it already has while that still works."""
    v = _video(db, payload.video_id, ws)
    link = db.scalars(
        select(ApprovalLink)
        .where(ApprovalLink.workspace_id == ws, ApprovalLink.video_id == v.id)
        .order_by(ApprovalLink.id.desc())
    ).first()
    if link is not None and _live(link):
        if payload.caption and payload.caption != link.caption:
            link.caption = payload.caption
            db.commit()
        return _out(link)
    link = ApprovalLink(
        workspace_id=ws,
        brand_id=v.brand_id,
        video_id=v.id,
        created_by=user.id,
        token=secrets.token_urlsafe(32),
        caption=payload.caption or v.caption or "",
        expires_at=datetime.now(UTC) + timedelta(days=LINK_DAYS),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _out(link)


@router.post("/{link_id}/version")
def new_version(
    link_id: int,
    payload: VersionIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """The revised video on the same link: the boss sees the newest, marked version N,
    and is asked again. The link's days start over."""
    link = _own_link(db, link_id, ws)
    v = _video(db, payload.video_id, ws)
    link.video_id = v.id
    # the caption sent, else the new video's own, else the one the boss saw before
    link.caption = payload.caption or v.caption or link.caption
    link.version += 1
    link.status, link.comment, link.decided_at = "pending", "", None
    link.revoked = False
    link.expires_at = datetime.now(UTC) + timedelta(days=LINK_DAYS)
    link.created_by = user.id
    db.commit()
    return _out(link)


@router.delete("/{link_id}", status_code=204)
def turn_off(link_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    link = _own_link(db, link_id, ws)
    link.revoked = True
    db.commit()


# ── the boss's side: no sign-in, the token is the key ─────────────────────────
def _by_token(db: Session, token: str) -> ApprovalLink:
    link = db.scalars(select(ApprovalLink).where(ApprovalLink.token == token)).first() if 20 <= len(token) <= 60 else None
    if link is None or link.revoked:
        raise HTTPException(404, "This link isn't working — ask the team for a new one.")
    if not _live(link):
        raise HTTPException(410, "This link has ended — ask the team for a new one.")
    return link


@public_router.get("/{token}")
def public_view(token: str, db: Session = Depends(get_db)):
    link = _by_token(db, token)
    v = db.get(Video, link.video_id) if link.video_id else None
    if v is None or not v.url:
        raise HTTPException(404, "The video on this link was deleted — ask the team for a new one.")
    brand = db.get(Brand, link.brand_id) if link.brand_id else None
    logo = ""
    if brand is not None:
        from app.images.brand_kit import main_logo

        asset = main_logo(db, brand.id)
        logo = asset.url if asset else ""
    image = v.tag == "ai-image" or v.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
    return {
        "brand": brand.name if brand else "",
        "logo": logo,
        "media": v.url,
        "kind": "image" if image else "video",
        "caption": link.caption,
        "version": link.version,
        "status": link.status,
        "comment": link.comment,
        "expires_at": _aware(link.expires_at).isoformat(),
    }


class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(approve|changes)$")
    comment: str = Field(default="", max_length=1000)


@public_router.post("/{token}")
def public_decide(token: str, payload: DecisionIn, db: Session = Depends(get_db)):
    """Approve, or ask for changes (a note is needed then). The boss may change their mind."""
    link = _by_token(db, token)
    note = payload.comment.strip()
    if payload.decision == "changes" and not note:
        raise HTTPException(400, "Write what to change.")
    link.status = "approved" if payload.decision == "approve" else "changes"
    link.comment = note
    link.decided_at = datetime.now(UTC)
    db.commit()
    v = f" (version {link.version})" if link.version > 1 else ""
    if link.status == "approved":
        notify_user(link.created_by, "review", "Approved ✓", f"Your video{v} was approved{' — ' + note if note else ''}", url="/library", tag=f"approval-{link.id}")
    else:
        notify_user(link.created_by, "review", "Changes asked", f"On your video{v}: {note}", url="/library", tag=f"approval-{link.id}")
    return {"status": link.status, "comment": link.comment, "version": link.version}
