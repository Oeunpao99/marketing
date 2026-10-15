"""A brand's own voice (Brand kit → Brand voice): upload or record the owner
speaking, the server learns its fingerprint in the background
(app/voice_clone.py), and videos can then pick "Brand voice".

    GET    /brands/{id}/voice          its status (Brand.voice_clone, without file urls)
    POST   /brands/{id}/voice          a recording (multipart "audio") + consent → learns it
    DELETE /brands/{id}/voice          forget it (recording and fingerprint)
"""

from __future__ import annotations

import logging
import threading
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.media import store_blob
from app.models import Brand, TeamMember
from app.tenancy import current_workspace_id, get_current_user, owned

log = logging.getLogger(__name__)

router = APIRouter(prefix="/brands/{brand_id}/voice", tags=["Brand voice"])

MAX_BYTES = 25 * 1024 * 1024  # ~25 min of compressed speech — far more than needed


def public(clone: dict | None) -> dict:
    """What the page sees: the status and the recording to play back."""
    c = clone or {}
    keep = ("status", "sample", "base", "seconds", "pitch", "error", "at")
    return {k: c[k] for k in keep if k in c}


def _learn(brand_id: int, recording: bytes) -> None:
    """In a thread: the fingerprint from the recording, then status ready / failed."""
    from app import voice_clone

    db = SessionLocal()
    try:
        try:
            got = voice_clone.enroll(recording)
            url = store_blob(db, got["fingerprint"], ".pt", "application/octet-stream")
            patch = {"status": "ready", "fingerprint": url, "base": got["base"], "seconds": got["seconds"], "pitch": got["pitch"], "error": ""}
        except voice_clone.VoiceCloneError as exc:
            patch = {"status": "failed", "error": str(exc)}
        except Exception as exc:  # noqa: BLE001 — the page must stop waiting either way
            log.exception("brand %s: voice not learned", brand_id)
            patch = {"status": "failed", "error": f"The voice couldn't be learned — {exc}"}
        brand = db.get(Brand, brand_id)
        if brand is not None and (brand.voice_clone or {}).get("status") == "learning":
            brand.voice_clone = {**(brand.voice_clone or {}), **patch}
            db.commit()
    finally:
        db.close()


@router.get("")
def get_voice(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    return public(owned(db, Brand, brand_id, ws).voice_clone)


@router.post("")
async def set_voice(
    brand_id: int,
    audio: UploadFile = File(...),
    consent: bool = Form(False),
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """A recording of the voice to use — replaces the brand's voice, if any."""
    brand = owned(db, Brand, brand_id, ws)
    if not consent:
        raise HTTPException(400, "Confirm it's your own voice, or that you have the speaker's permission.")
    data = await audio.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "That recording is too large — 1-2 minutes of speech is plenty.")
    if len(data) < 10_000:
        raise HTTPException(400, "That recording is too short — record at least 20 seconds of speech.")
    ext = "." + (audio.filename or "voice.webm").rsplit(".", 1)[-1].lower()[:5]
    sample = store_blob(db, data, ext if len(ext) > 1 else ".webm", audio.content_type or "audio/webm")
    brand.voice_clone = {"status": "learning", "sample": sample, "by": user.id, "at": datetime.now(UTC).isoformat(), "consent": True}
    db.commit()
    threading.Thread(target=_learn, args=(brand.id, data), daemon=True, name=f"voice-{brand.id}").start()
    return public(brand.voice_clone)


@router.delete("", status_code=204)
def delete_voice(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    brand = owned(db, Brand, brand_id, ws)
    brand.voice_clone = {}
    db.commit()
