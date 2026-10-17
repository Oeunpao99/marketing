"""Upload images / videos and serve them back so posts can carry a real asset.

Binary payloads live in the database (``media_blobs`` table) so they survive a
redeploy or a wiped disk — the old on-disk ``media/`` folder is still read as a
fallback for assets generated before this change.
"""

from __future__ import annotations

import io
import logging
import mimetypes
import re
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import Brand, MediaBlob, Video
from app.tenancy import current_workspace_id, owned

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
MEDIA_DIR.mkdir(exist_ok=True)

log = logging.getLogger(__name__)

MAX_BYTES = 200 * 1024 * 1024
THUMB_W = 480  # the Library grid's small pictures
RANGE_CHUNK = 2 * 1024 * 1024  # an open-ended video range gets this much at a time
CACHE = {"Cache-Control": "public, max-age=31536000, immutable"}
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


def _thumb_bytes(data: bytes, name: str) -> bytes | None:
    """A small JPEG of an image, or of a video's first frame (ffmpeg)."""
    from PIL import Image, ImageOps

    if Path(name).suffix.lower() in IMAGE_EXTS:
        src = io.BytesIO(data)
    else:
        from app.story import _ffmpeg

        with tempfile.TemporaryDirectory() as d:
            clip, frame = Path(d) / f"in{Path(name).suffix or '.mp4'}", Path(d) / "frame.jpg"
            clip.write_bytes(data)
            subprocess.run(
                [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.1", "-i", str(clip),
                 "-frames:v", "1", "-vf", f"scale={THUMB_W}:-2", str(frame)],
                timeout=60, check=False, capture_output=True,
            )
            if not frame.is_file():
                return None
            src = io.BytesIO(frame.read_bytes())
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    img.thumbnail((THUMB_W, THUMB_W * 4))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=80, optimize=True)
    return out.getvalue()


@serve_router.get("/media/thumb/{name}", include_in_schema=False)
def serve_thumb(name: str, db: Session = Depends(get_db)):
    """A small JPEG of '/media/<name>' for grids — made once, then kept as its
    own blob. The Library showed every card from the full-size file (whole
    MP4s just for a still), which made the page crawl. 404 when no picture can
    be made; the page then falls back to the original."""
    tname = f"thumb{THUMB_W}-{Path(name).stem}.jpg"[:120]
    kept = db.scalar(select(MediaBlob.data).where(MediaBlob.name == tname))
    if kept is not None:
        return Response(content=bytes(kept), media_type="image/jpeg", headers=CACHE)
    data = read_media(f"/media/{name}")
    if data is None:
        raise HTTPException(404, "Media not found.")
    try:
        jpg = _thumb_bytes(data, name)
    except Exception:  # an odd file — the page shows the original instead
        log.warning("thumbnail failed for %s", name, exc_info=True)
        jpg = None
    if not jpg:
        raise HTTPException(404, "No thumbnail.")
    db.add(MediaBlob(name=tname, content_type="image/jpeg", size_bytes=len(jpg), data=jpg))
    try:
        db.commit()
    except IntegrityError:  # made at the same moment by another request
        db.rollback()
    return Response(content=jpg, media_type="image/jpeg", headers=CACHE)


_RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


@serve_router.get("/media/{name}", include_in_schema=False)
def serve_media(name: str, request: Request, db: Session = Depends(get_db)):
    head = db.execute(
        select(MediaBlob.content_type, func.length(MediaBlob.data)).where(MediaBlob.name == name)
    ).first()
    if head is not None:
        ctype, size = head[0] or "application/octet-stream", int(head[1] or 0)
        m = _RANGE.match((request.headers.get("range") or "").strip())
        if m and size and (m.group(1) or m.group(2)):
            # a video asking for a piece: send just that piece, read from the
            # database in place, instead of the whole file every time
            if m.group(1):
                start = int(m.group(1))
                end = min(int(m.group(2)) if m.group(2) else start + RANGE_CHUNK - 1, size - 1)
            else:  # "bytes=-N": the last N bytes
                start, end = max(0, size - int(m.group(2))), size - 1
            if start >= size or end < start:
                return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
            part = db.scalar(
                select(func.substr(MediaBlob.data, start + 1, end - start + 1)).where(MediaBlob.name == name)
            )
            return Response(
                content=bytes(part or b""), status_code=206, media_type=ctype,
                headers={**CACHE, "Accept-Ranges": "bytes", "Content-Range": f"bytes {start}-{end}/{size}"},
            )
        data = db.scalar(select(MediaBlob.data).where(MediaBlob.name == name))
        return Response(content=bytes(data or b""), media_type=ctype, headers={**CACHE, "Accept-Ranges": "bytes"})
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
    ws: int = Depends(current_workspace_id),
):
    if brand_id is not None:
        owned(db, Brand, brand_id, ws)
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
        workspace_id=ws,
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
