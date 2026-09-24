"""Saved AI Agent conversations — the History panel on the AI Agent page.

Private to the person who had the chat (``user_id``), inside their
workspace. The page stores its whole thread in ``turns`` and saves after
every change; History lists them newest first and reopens one as-is.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AgentChat, TeamMember
from app.tenancy import get_current_user

router = APIRouter(prefix="/ai/chats", tags=["AI"])

MAX_TURNS = 200


class ChatIn(BaseModel):
    title: str = Field(default="", max_length=200)
    turns: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_TURNS)


def _own(db: Session, user: TeamMember, chat_id: int) -> AgentChat:
    chat = db.scalar(
        select(AgentChat).where(
            AgentChat.id == chat_id,
            AgentChat.user_id == user.id,
            AgentChat.workspace_id == user.workspace_id,
        )
    )
    if chat is None:
        raise HTTPException(404, "Chat not found.")
    return chat


def _title(payload: ChatIn) -> str:
    if payload.title.strip():
        return payload.title.strip()[:200]
    first = next((str(t.get("prompt") or "") for t in payload.turns if t.get("prompt")), "")
    first = " ".join(first.split())
    return (first[:77] + "…") if len(first) > 80 else (first or "New chat")


def _summary(chat: AgentChat) -> dict:
    turns = chat.turns or []
    kinds = {t.get("kind") for t in turns}
    return {
        "id": chat.id,
        "title": chat.title,
        "updated_at": chat.updated_at,
        "count": len(turns),
        "has_media": bool(kinds & {"image", "video"}),
        "has_questions": "ask" in kinds,
    }


@router.get("")
def list_chats(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=100, le=300),
    db: Session = Depends(get_db),
    user: TeamMember = Depends(get_current_user),
):
    query = select(AgentChat).where(
        AgentChat.user_id == user.id, AgentChat.workspace_id == user.workspace_id
    )
    if q.strip():
        query = query.where(or_(AgentChat.title.ilike(f"%{q.strip()}%")))
    rows = db.scalars(query.order_by(AgentChat.updated_at.desc()).limit(limit)).all()
    return [_summary(c) for c in rows]


@router.get("/{chat_id}")
def get_chat(chat_id: int, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    chat = _own(db, user, chat_id)
    return {**_summary(chat), "turns": chat.turns or []}


@router.post("", status_code=201)
def create_chat(payload: ChatIn, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    chat = AgentChat(
        workspace_id=user.workspace_id, user_id=user.id, title=_title(payload), turns=payload.turns
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return _summary(chat)


@router.put("/{chat_id}")
def save_chat(
    chat_id: int, payload: ChatIn, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)
):
    chat = _own(db, user, chat_id)
    chat.turns = payload.turns
    if payload.title.strip():
        chat.title = payload.title.strip()[:200]
    chat.updated_at = datetime.now().astimezone()
    db.commit()
    db.refresh(chat)
    return _summary(chat)


@router.delete("/{chat_id}", status_code=204)
def delete_chat(chat_id: int, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    db.delete(_own(db, user, chat_id))
    db.commit()
    return None
