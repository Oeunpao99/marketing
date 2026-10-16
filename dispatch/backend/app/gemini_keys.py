"""A workspace's own Gemini API key — the Khmer voice's second chance.

Khmer voice lines are read by the platform's Gemini key first; when it's out
(a used-up daily limit, a rejected key) a workspace that pasted its own key is
read with that one, and only then by Azure (Sreymom / Piseth) — app/speech.py.
Lines read with their key aren't charged to their credit (Google bills them).

The key is kept encrypted (Fernet, from SECRET_KEY) and never sent back to the
page: only its last 4 characters, so Setup can tell keys apart.
"""

from __future__ import annotations

import base64
import hashlib
import logging

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import gemini_url, get_settings
from app.database import get_db
from app.models import TeamMember, Workspace
from app.tenancy import current_workspace_id, require_manager

log = logging.getLogger(__name__)
router = APIRouter(prefix="/ai/voice", tags=["AI"])


def _fernet() -> Fernet:
    secret = hashlib.sha256(("gemini-key|" + get_settings().secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(secret))


def workspace_key(db: Session, ws: int | None) -> str:
    """The workspace's own Gemini key, or "" (none, or it can't be read — a changed SECRET_KEY)."""
    if ws is None:
        return ""
    w = db.get(Workspace, ws)
    if not w or not w.gemini_key_enc:
        return ""
    try:
        return _fernet().decrypt(w.gemini_key_enc.encode()).decode()
    except (InvalidToken, ValueError):
        log.warning("workspace %s: its Gemini key can't be read (SECRET_KEY changed?) — ignored", ws)
        return ""


def _check(key: str) -> None:
    """Google accepts the key (listing its models costs nothing). Raises HTTPException."""
    try:
        resp = httpx.get(gemini_url("/v1beta/models"), headers={"x-goog-api-key": key}, params={"pageSize": 1}, timeout=20.0)
    except httpx.HTTPError as exc:
        log.warning("Gemini key check couldn't reach Google: %s", exc)
        raise HTTPException(502, "Couldn't check the key with Google just now — try again in a moment.") from exc
    if resp.status_code in (400, 401, 403):
        raise HTTPException(400, "Google didn't accept that key — copy it again from Google AI Studio.")
    if resp.status_code != 200:
        log.warning("Gemini key check: Google said %s", resp.status_code)
        raise HTTPException(502, "Couldn't check the key with Google just now — try again in a moment.")


class KeyIn(BaseModel):
    key: str = Field(min_length=20, max_length=200)


@router.get("/gemini-key")
def key_status(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Whether this workspace has its own Gemini key — never the key itself."""
    w = db.get(Workspace, ws)
    return {"configured": bool(w and w.gemini_key_enc), "hint": (w.gemini_key_hint if w else "") or ""}


@router.put("/gemini-key")
def key_save(payload: KeyIn, db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    """Save (or replace) the workspace's own Gemini key — checked with Google first."""
    key = payload.key.strip()
    _check(key)
    w = db.get(Workspace, user.workspace_id)
    w.gemini_key_enc = _fernet().encrypt(key.encode()).decode()
    w.gemini_key_hint = key[-4:]
    db.commit()
    return {"configured": True, "hint": w.gemini_key_hint}


@router.delete("/gemini-key")
def key_delete(db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    w = db.get(Workspace, user.workspace_id)
    w.gemini_key_enc = None
    w.gemini_key_hint = ""
    db.commit()
    return {"configured": False, "hint": ""}
