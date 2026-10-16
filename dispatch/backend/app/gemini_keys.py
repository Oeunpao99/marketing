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
import re
import logging

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Response
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


def _check(key: str) -> bool:
    """Google accepts the key — a free token count, sent the way the voice's
    requests are (a POST, through GEMINI_BASE_URL). True = checked; False =
    Google couldn't be asked from this server's region (not the key's fault).
    Raises HTTPException when the key is refused or Google can't be reached."""
    try:
        resp = httpx.post(
            gemini_url(f"/v1beta/models/{get_settings().gemini_tts_model}:countTokens"),  # the voice's own model
            headers={"x-goog-api-key": key},
            json={"contents": [{"parts": [{"text": "hi"}]}]},
            timeout=20.0,
        )
    except httpx.HTTPError as exc:
        log.warning("Gemini key check couldn't reach Google: %s", exc)
        raise HTTPException(502, "Couldn't check the key with Google just now — try again in a moment.") from exc
    if resp.status_code == 200:
        return True
    try:
        err = resp.json().get("error") or {}
    except ValueError:
        err = {}
    why = f"{err.get('status', '')} {err.get('message', '')}".strip()[:200] or resp.text[:200]
    log.warning("Gemini key check: Google said %s — %s", resp.status_code, why)  # the reason, never the key
    if resp.status_code in (400, 401, 403) and ("API key" in why or "API_KEY" in why or "PERMISSION_DENIED" in why or resp.status_code == 401):
        raise HTTPException(400, "Google didn't accept that key — copy it again from Google AI Studio.")
    if "location is not supported" in why.lower():
        return False  # the server's region, not the key — saved; the voice goes through the proxy
    # not about the key (Google busy, …): the key isn't blamed
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
    key = payload.key.strip().strip("\"'")
    # a key is plain letters, digits, - _ . (AI Studio's are "AIza…" or the newer "AQ.…");
    # anything else is text copied along with it — Google itself decides the rest
    if not re.fullmatch(r"[A-Za-z0-9_\-.]{20,200}", key):
        raise HTTPException(400, "That doesn't look like a key — copy just the key from Google AI Studio, with the copy button beside it.")
    checked = _check(key)
    w = db.get(Workspace, user.workspace_id)
    w.gemini_key_enc = _fernet().encrypt(key.encode()).decode()
    w.gemini_key_hint = key[-4:]
    db.commit()
    return {"configured": True, "hint": w.gemini_key_hint, "checked": checked}


@router.delete("/gemini-key")
def key_delete(db: Session = Depends(get_db), user: TeamMember = Depends(require_manager)):
    w = db.get(Workspace, user.workspace_id)
    w.gemini_key_enc = None
    w.gemini_key_hint = ""
    db.commit()
    return {"configured": False, "hint": ""}


SAMPLE = "សួស្តីបង! នេះគឺជាសំឡេងពី key Gemini របស់បងផ្ទាល់។"


@router.post("/gemini-key/test")
def key_test(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """One short Khmer line read with the workspace's OWN key only (never ours,
    never Azure) — so they hear it works now. Uses one of their key's requests;
    not charged to their credit."""
    from app import speech

    key = workspace_key(db, ws)
    if not key:
        raise HTTPException(400, "Save your Gemini key first.")
    try:
        mp3 = speech._gemini(SAMPLE, get_settings().gemini_tts_voice_female, key=key)
    except speech.SpeechError as exc:
        why = str(exc)
        log.warning("workspace %s: own Gemini key test failed: %s", ws, why[:200])  # the reason, never the key
        if "PerDay" in why or "daily limit" in why:
            msg = "Your key works, but its voice limit for today is used up — it reads again tomorrow (or turn on billing in Google AI Studio)."
        elif "API key" in why or "API_KEY" in why or "PERMISSION_DENIED" in why:
            msg = "Google didn't accept the saved key — paste it again, or make a new one in Google AI Studio."
        elif "location" in why.lower():
            msg = "Google can't be reached from this server's region right now — the team has been told."
        else:
            msg = "Your key couldn't read the test line just now — try again in a moment."
        raise HTTPException(400, msg) from exc
    return Response(content=mp3, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
