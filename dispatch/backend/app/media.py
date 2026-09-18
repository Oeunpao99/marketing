"""Upload images / videos and serve them back so posts can carry a real asset.

Binary payloads live in the database (``media_blobs`` table) so they survive a
redeploy or a wiped disk — the old on-disk ``media/`` folder is still read as a
fallback for assets generated before this change.
"""

from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import MediaBlob, Video

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
MEDIA_DIR.mkdir(exist_ok=True)

MAX_BYTES = 200 * 1024 * 1024
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

router = APIRouter(prefix="/media", tags=["Media"])
# Serves the stored bytes at "/media/<name>" (mounted at the app root, not /api).
serve_router = APIRouter(tags=["Media"])


def kind_for(path: str, content_type: str | None) -> str:
    if Path(path).suffix.lower() in IMAGE_EXTS:
        return "image"
    if (content_type or "").startswith("image/"):
        return "image"
    return "video"


def _name_from_url(url: str) -> str | None:
    if not url or "/media/" not in url:
        return None
    return url.rsplit("/media/", 1)[-1] or None


def local_path_for(url: str) -> Path | None:
    """Map a stored '/media/<name>' url back to a legacy file on disk (if any)."""
    name = _name_from_url(url)
    if name is None:
        return None
    candidate = (MEDIA_DIR / name).resolve()
    if candidate.parent != MEDIA_DIR.resolve() or not candidate.is_file():
        return None
    return candidate


def store_blob(
    db: Session, data: bytes, ext: str, content_type: str | None = None
) -> str:
    """Persist ``data`` as a media_blobs row; return its '/media/<name>' url.

    Flushes (not commits) so the blob rides the caller's transaction.
    """
    name = f"{uuid.uuid4().hex}{ext}"
    db.add(
        MediaBlob(
            name=name,
            content_type=content_type
            or mimetypes.guess_type(name)[0]
            or "application/octet-stream",
            size_bytes=len(data),
            data=data,
        )
    )
    db.flush()
    return f"/media/{name}"


def read_media(url: str) -> bytes | None:
    """Return the bytes behind a '/media/<name>' url — DB blob first, then disk."""
    name = _name_from_url(url)
    if name is None:
        return None
    with SessionLocal() as db:
        blob = db.scalar(select(MediaBlob).where(MediaBlob.name == name))
        if blob is not None:
            return bytes(blob.data)
    path = local_path_for(url)
    return path.read_bytes() if path is not None else None


def delete_media(db: Session, url: str) -> None:
    """Remove the blob (and any legacy disk file) behind a '/media/<name>' url."""
    name = _name_from_url(url)
    if name is None:
        return
    blob = db.scalar(select(MediaBlob).where(MediaBlob.name == name))
    if blob is not None:
        db.delete(blob)
    path = local_path_for(url)
    if path is not None:
        path.unlink(missing_ok=True)


@serve_router.get("/media/{name}", include_in_schema=False)
def serve_media(name: str, db: Session = Depends(get_db)):
    blob = db.scalar(select(MediaBlob).where(MediaBlob.name == name))
    if blob is not None:
        return Response(
            content=bytes(blob.data),
            media_type=blob.content_type or "application/octet-stream",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )
    path = local_path_for(f"/media/{name}")
    if path is not None:
        return FileResponse(path)
    raise HTTPException(404, "Media not found.")


@router.post("/upload", status_code=201)
def upload(
    file: UploadFile = File(...),
    brand_id: int | None = Form(default=None),
    tag: str = Form(default=""),
    db: Session = Depends(get_db),
):
    original = file.filename or "asset"
    ext = (
        Path(original).suffix.lower()
        or mimetypes.guess_extension(file.content_type or "")
        or ""
    )

    data = bytearray()
    while chunk := file.file.read(1024 * 1024):
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "File too large (max 200 MB).")

    kind = kind_for(original, file.content_type)
    url = store_blob(db, bytes(data), ext, file.content_type)
    row = Video(
        brand_id=brand_id,
        filename=original,
        size_bytes=len(data),
        source="upload",
        tag=tag or kind,
        url=url,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "filename": row.filename,
        "url": row.url,
        "size_bytes": row.size_bytes,
        "kind": kind,
    }
