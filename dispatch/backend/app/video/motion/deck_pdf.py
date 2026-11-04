"""Slides · Presentation: the deck view, its PDF, and reading a document into slides.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import io
import json
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from PIL import Image
from app.core.database import SessionLocal, get_db
from app.storage.media import read_media, store_blob
from app.models import GenerationJob, Video
from app.core.tenancy import current_workspace_id, owned
from fastapi import Depends, File, HTTPException, UploadFile
from pathlib import Path
from sqlalchemy.orm import Session

from typing import TYPE_CHECKING

from app.video.motion.common import MOTION_DIR, _npx, _render_lock, log, not_ready, router
from app.video.motion.rendering import _entry, _to_files
from app.video.motion.reshape import _kept_props


_pdf_making: set[int] = set()  # decks whose PDF is being drawn right now


def _deck_source(db: Session, job_id: int, ws: int) -> tuple[GenerationJob, dict]:
    src = owned(db, GenerationJob, job_id, ws, "Generation job")
    try:
        making = json.loads(src.making) if src.making else {}
    except ValueError:
        making = {}
    if (
        src.kind != "motion"
        or src.status != "succeeded"
        or making.get("style") != "deck"
        or not making.get("remake")
    ):
        raise HTTPException(400, "This isn't a finished slide deck.")
    return src, making


def _linked_props(url: str) -> dict:
    """The kept props with each stored file as its /media link (the browser loads it) —
    not embedded, so the presenter's page stays light."""
    raw = read_media(url)
    if raw is None:
        raise RuntimeError("This deck's slides are no longer stored.")

    def swap(value):
        if isinstance(value, str) and value.startswith("blob:data:") and "|" in value:
            return value.split("|", 1)[1]
        if isinstance(value, dict):
            return {k: swap(v) for k, v in value.items()}
        if isinstance(value, list):
            return [swap(v) for v in value]
        return value

    return swap(json.loads(raw))


def is_deck(job: GenerationJob) -> bool:
    """For the Library: a finished slide deck (it can be presented and downloaded as a PDF)."""
    return (
        job.kind == "motion"
        and job.status == "succeeded"
        and '"style": "deck"' in (job.making or "")
    )


@router.get("/deck/{job_id}")
def deck_view(job_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The slides, for the presenter (pages/PresentPage.jsx) — and its PDF when made."""
    src, making = _deck_source(db, job_id, ws)
    try:
        props = _linked_props(making["remake"])
    except (RuntimeError, ValueError) as exc:
        log.warning("deck %s: %s", job_id, exc)
        raise HTTPException(
            400, "This deck's slides can't be opened any more — make it again."
        ) from None
    video = db.get(Video, src.video_id) if src.video_id else None
    slides = [
        {k: v for k, v in s.items() if k not in _VOICE_FIELDS} for s in props.get("scenes") or []
    ]
    return {
        "id": src.id,
        "title": (Path(video.filename).stem if video and video.filename else "") or "Slides",
        "brand": props.get("brand") or {},
        "slides": slides,
        "video": video.url if video else "",
        "pdf": making.get("pdf") or "",
        "pdf_making": src.id in _pdf_making,
    }


@router.post("/deck/{job_id}/pdf")
def deck_pdf(job_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The deck as a PDF, one page a slide: made once (in the background — the page
    polls GET /deck/{id}), then kept. No AI, no credits."""
    src, making = _deck_source(db, job_id, ws)
    if making.get("pdf"):
        return {"pdf": making["pdf"]}
    reason = not_ready()
    if reason:
        log.warning("deck pdf: motion not ready: %s", reason)
        raise HTTPException(
            503, "Downloading slides isn't available on this server right now — try again later."
        )
    if src.id not in _pdf_making:
        _pdf_making.add(src.id)
        threading.Thread(
            target=_make_pdf, args=(src.id,), daemon=True, name=f"deck-pdf-{src.id}"
        ).start()
    return {"pdf": "", "making": True}


@router.post("/read-doc")
def read_document(file: UploadFile = File(...), ws: int = Depends(current_workspace_id)):
    """A document (PDF, Word, PowerPoint, text) as text for the Studio's prompt box —
    Slides are then made from it like from a pasted text. No AI, no credits."""
    from app.ai import docread

    data = file.file.read(docread.MAX_BYTES + 1)
    try:
        got = docread.read(file.filename or "", data)
    except docread.DocError as exc:
        raise HTTPException(422, str(exc)) from None
    except Exception:  # noqa: BLE001 — a file the readers choke on
        log.exception("read-doc: %s couldn't be read", file.filename)
        raise HTTPException(422, "This file couldn't be read — paste its text instead.") from None
    return {**got, "name": file.filename or ""}


def deck_pages(props: dict) -> bytes:
    """Every slide at rest (the DeckPages composition) → one PDF, a page a slide."""
    reason = not_ready()
    if reason:
        raise RuntimeError(reason)
    with _render_lock, tempfile.TemporaryDirectory() as tmp:
        entry, public = _entry()
        rel = f"run-{uuid.uuid4().hex[:12]}"
        assets = public / rel
        assets.mkdir(parents=True)
        try:
            pages = {"brand": props.get("brand") or {}, "scenes": props.get("scenes") or []}
            props_path = Path(tmp) / "props.json"
            props_path.write_text(
                json.dumps(_to_files(pages, assets, rel), ensure_ascii=False), encoding="utf-8"
            )
            out = Path(tmp) / "pages"
            run = subprocess.run(
                [
                    _npx(),
                    "remotion",
                    "render",
                    entry,
                    "DeckPages",
                    str(out),
                    f"--props={props_path}",
                    "--sequence",
                    "--image-format=jpeg",
                    "--jpeg-quality=90",
                    "--concurrency=100%",
                ],
                cwd=MOTION_DIR,
                capture_output=True,
                text=True,
                errors="replace",
                timeout=600,
            )
            files = (
                sorted(out.glob("*.jpeg"), key=lambda p: int(re.sub(r"\D", "", p.stem) or 0))
                if out.exists()
                else []
            )
            if run.returncode != 0 or not files:
                log.error("deck pages failed: %s", (run.stdout + run.stderr)[-1500:])
                raise RuntimeError("The slides couldn't be drawn — try again.")
            images = [Image.open(f).convert("RGB") for f in files]
            buf = io.BytesIO()
            images[0].save(buf, "PDF", save_all=True, append_images=images[1:], resolution=144)
            return buf.getvalue()
        finally:
            shutil.rmtree(assets, ignore_errors=True)


def _make_pdf(job_id: int) -> None:
    db = SessionLocal()
    try:
        src = db.get(GenerationJob, job_id)
        making = json.loads(src.making)
        props = _kept_props(making["remake"])
        db.rollback()  # no transaction held open through the drawing
        blob = deck_pages(props)
        src = db.get(GenerationJob, job_id)
        making = json.loads(src.making)
        making["pdf"] = store_blob(db, blob, ".pdf", "application/pdf")
        src.making = json.dumps(making, ensure_ascii=False)
        db.commit()
    except Exception:  # noqa: BLE001 — the page stops waiting and offers it again
        log.exception("deck %s: PDF failed", job_id)
        db.rollback()
    finally:
        _pdf_making.discard(job_id)
        db.close()


if TYPE_CHECKING:  # loaded after this module — app/video/motion/__init__.py binds these (_link)
    from app.video.motion.edit import _VOICE_FIELDS
