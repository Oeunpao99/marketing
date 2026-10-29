"""A brand's own voice (Brand kit → Brand voice): upload or record the owner
speaking, the server learns its fingerprint in the background
(app/voice_clone.py), and videos can then pick "Brand voice".

    GET    /brands/{id}/voice          its status (Brand.voice_clone, without file urls)
    POST   /brands/{id}/voice          a recording (multipart "audio") + consent → learns it
    DELETE /brands/{id}/voice          forget it — its recording and fingerprint are deleted
"""

from __future__ import annotations

import logging
import re
import threading
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.media import delete_media, store_blob
from app import plan_features
from app.models import Brand, TeamMember
from app.tenancy import current_workspace_id, get_current_user, owned

log = logging.getLogger(__name__)

router = APIRouter(prefix="/brands/{brand_id}/voice", tags=["Brand voice"])

MAX_BYTES = 25 * 1024 * 1024  # ~25 min of compressed speech — far more than needed
# The Terms of Service version agreed to when a voice is added (Terms → "Voice
# cloning", src/pages/LegalPage.jsx) — kept with the consent.
TERMS_VERSION = "2026-10-15"


def forget_files(db: Session, clone: dict | None) -> None:
    """Delete a voice's recording and fingerprint (the Terms promise this on
    Remove voice, a new recording, and deleting the brand). Not committed."""
    for key in ("sample", "fingerprint"):
        if (clone or {}).get(key):
            delete_media(db, clone[key])


def public(clone: dict | None) -> dict:
    """What the page sees: the status and the recording to play back."""
    c = clone or {}
    keep = ("status", "sample", "base", "seconds", "pitch", "error", "at")
    return {k: c[k] for k in keep if k in c}


def _reader_name(narrator: str | None) -> str:
    """A reader's name for people: "Kore · Gemini", "Sreymom", "Piseth"…"""
    if not narrator:
        return ""
    if narrator.startswith("gemini:"):
        return narrator[len("gemini:") :].split("|")[0] + " · Gemini"
    if narrator.startswith("local:"):
        return "Native Khmer"
    m = re.match(r"[a-z]{2}-[A-Z]{2}-([A-Za-z]+?)(?:Multilingual|:DragonHD\w*?)?Neural", narrator)
    return m.group(1) if m else narrator


def readers(language: str = "Khmer") -> list[dict]:
    """The readers the comparison plays next to the brand voice: Azure's
    Sreymom and Piseth (when Azure Speech is set up) and whoever reads the
    videos' Female and Male lines now (Gemini's, when it's on) — no repeats.
    [{"voice": what /ai/motion/say takes, "name", "note"}]"""
    from app import speech

    if not speech.ready():
        return []
    out, seen = [], set()
    if speech.provider() == "azure":
        for v, g in (("sreymom", "female"), ("piseth", "male")):
            name = speech.VOICES[("km", g)]
            seen.add(name)
            out.append({"voice": v, "name": _reader_name(name), "note": f"Azure · {g}"})
    for g in ("female", "male"):
        name = speech.voice_for(language, g)
        if name and name not in seen:
            seen.add(name)
            out.append({"voice": g, "name": _reader_name(name), "note": f"Video {g} reader"})
    from app import local_voice

    if local_voice.ready() and not any(n.startswith(local_voice.PREFIX) for n in seen):
        out.append({"voice": "native", "name": "Native Khmer", "note": "Open-source · Hugging Face"})
    return out


def _learn(brand_id: int, recording: bytes, sample: str) -> None:
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
        except Exception:  # noqa: BLE001 — the page must stop waiting either way
            log.exception("brand %s: voice not learned", brand_id)
            patch = {"status": "failed", "error": "Something went wrong while learning the voice — try the recording again in a moment."}
        brand = db.get(Brand, brand_id)
        clone = (brand.voice_clone or {}) if brand is not None else {}
        if clone.get("status") == "learning" and clone.get("sample") == sample:
            brand.voice_clone = {**clone, **patch}
            db.commit()
        elif patch.get("fingerprint"):
            # replaced or removed while it was learning — this one isn't wanted
            delete_media(db, patch["fingerprint"])
            db.commit()
    finally:
        db.close()


@router.get("")
def get_voice(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    from app import gemini_keys, speech

    brand = owned(db, Brand, brand_id, ws)
    # the comparison lists Gemini's readers while our key — or theirs — can read
    speech.use_workspace_key(gemini_keys.workspace_key(db, ws))
    return {**public(brand.voice_clone), "readers": readers()}


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
    plan_features.require(db, ws, "own_voice")  # Business and up
    if not consent:
        raise HTTPException(400, "Confirm it's your own voice, or that you have the speaker's permission.")
    data = await audio.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "That recording is too large — 1-2 minutes of speech is plenty.")
    if len(data) < 10_000:
        raise HTTPException(400, "That recording is too short — record at least 20 seconds of speech.")
    ext = "." + (audio.filename or "voice.webm").rsplit(".", 1)[-1].lower()[:5]
    forget_files(db, brand.voice_clone)  # a new recording replaces the old one entirely
    sample = store_blob(db, data, ext if len(ext) > 1 else ".webm", audio.content_type or "audio/webm")
    brand.voice_clone = {
        "status": "learning",
        "sample": sample,
        "by": user.id,
        "at": datetime.now(UTC).isoformat(),
        "consent": True,
        "terms": TERMS_VERSION,
    }
    db.commit()
    threading.Thread(target=_learn, args=(brand.id, data, sample), daemon=True, name=f"voice-{brand.id}").start()
    return public(brand.voice_clone)


@router.delete("", status_code=204)
def delete_voice(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    brand = owned(db, Brand, brand_id, ws)
    forget_files(db, brand.voice_clone)
    brand.voice_clone = {}
    db.commit()
