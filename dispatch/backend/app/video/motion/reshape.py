"""The same video in the other shape (16:9 ⇄ 9:16): kept props drawn again, or the picture fitted.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import base64
import json
import subprocess
import tempfile
import threading
from app.core.database import SessionLocal, get_db
from app.storage.media import read_media, save_file, store_blob
from app.models import GenerationJob, TeamMember, Video
from app.core.tenancy import current_workspace_id, get_current_user, owned
from fastapi import Depends, HTTPException
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.video.motion.common import log, not_ready, router
from app.video.motion.styles import TALL_ONLY_TYPES, WIDE_STYLES
from app.video.motion.props import length_of
from app.video.motion.jobs import Stopped, _progress, _report, _stopped
from app.video.motion.rendering import refuse_if_busy, render


# ── the same video in the other shape (16:9 ⇄ 9:16) ─────────────────────────
# A template video is drawn from its props, and every template lays itself out
# for both shapes — so the same scenes, words, voice and music are drawn again
# on the other canvas (no AI, no new voice). Videos without kept props (older
# ones, AI clips, uploads) are fitted instead: the picture in the middle, a
# blurred copy of it filling the rest.
REDRAW_SKIP = {"canvas"}  # AI design: its layers were placed for one shape


def keep_props(db: Session, props: dict) -> str:
    """Store a finished video's props for a later re-draw; returns the JSON's
    '/media/<name>' url. Every embedded picture / sound becomes its own blob,
    named by its content, so a logo kept by many videos is stored once."""
    import hashlib

    from sqlalchemy.exc import IntegrityError

    from app.models import MediaBlob

    def swap(value):
        if isinstance(value, str) and value.startswith("data:") and "," in value:
            head, data = value.split(",", 1)
            raw = base64.b64decode(data)
            ext = (
                ".jpg"
                if "jpeg" in head
                else ".png"
                if "png" in head
                else ".svg"
                if "svg" in head
                else ".mp3"
                if "audio" in head
                else ".bin"
            )
            name = f"rm-{hashlib.sha1(raw).hexdigest()}{ext}"
            if db.scalar(select(MediaBlob.id).where(MediaBlob.name == name)) is None:
                try:
                    with (
                        db.begin_nested()
                    ):  # another video may store the same file at the same moment
                        save_file(
                            db, name, raw, head[5:].split(";")[0] or "application/octet-stream"
                        )
                except IntegrityError:
                    pass
            return f"blob:{head}|/media/{name}"
        if isinstance(value, dict):
            return {k: swap(v) for k, v in value.items()}
        if isinstance(value, list):
            return [swap(v) for v in value]
        return value

    return store_blob(
        db, json.dumps(swap(props), ensure_ascii=False).encode("utf-8"), ".json", "application/json"
    )


def _kept_props(url: str) -> dict:
    """The props keep_props stored, with every file embedded again."""
    raw = read_media(url)
    if raw is None:
        raise RuntimeError("This video's scenes are no longer stored.")
    files: dict[str, str] = {}

    def swap(value):
        if isinstance(value, str) and value.startswith("blob:data:") and "|" in value:
            head, link = value[5:].split("|", 1)
            if link not in files:
                data = read_media(link)
                if data is None:
                    raise RuntimeError("A picture or voice clip of this video is missing.")
                files[link] = base64.b64encode(data).decode()
            return f"{head},{files[link]}"
        if isinstance(value, dict):
            return {k: swap(v) for k, v in value.items()}
        if isinstance(value, list):
            return [swap(v) for v in value]
        return value

    return swap(json.loads(raw.decode("utf-8")))


def can_redraw(making: dict | None, target: str) -> bool:
    """Whether a video's kept props can be drawn in ``target`` — its template
    has that shape, and (for 16:9) no tall-only scene."""
    if not making or not making.get("remake") or making.get("style") in REDRAW_SKIP:
        return False
    if target == "16:9":
        types = {sc.get("type") for sc in making.get("scenes") or []}
        return making.get("style") in WIDE_STYLES and not (types & TALL_ONLY_TYPES)
    return True


def reframe(data: bytes, target: str) -> bytes:
    """The video fitted into ``target``: whole, in the middle, a blurred and
    darkened copy of it filling the rest — how a wide clip goes on TikTok."""
    from app.video.story import _ffmpeg

    w, h = (1920, 1080) if target == "16:9" else (1080, 1920)
    graph = (
        f"[0:v]split=2[a][b];[a]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
        f"boxblur=30:2,eq=brightness=-0.08[bg];[b]scale={w}:{h}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]"
    )
    with tempfile.TemporaryDirectory() as tmp:
        src, out = Path(tmp) / "in.mp4", Path(tmp) / "out.mp4"
        src.write_bytes(data)
        proc = subprocess.run(
            [
                _ffmpeg(),
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(src),
                "-filter_complex",
                graph,
                "-map",
                "[v]",
                "-map",
                "0:a?",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "21",
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                "-movflags",
                "+faststart",
                str(out),
            ],
            timeout=1200,
            check=False,
            capture_output=True,
            text=True,
            errors="replace",
        )
        if proc.returncode != 0 or not out.is_file():
            log.error("reframe failed: %s", (proc.stderr or "")[-1500:])
            raise RuntimeError("The video couldn't be resized — try again.")
        return out.read_bytes()


def _is_wide(video: Video, job: GenerationJob) -> bool:
    w, _, h = (video.resolution or "").partition("x")
    if w.isdigit() and h.isdigit() and int(w) and int(h):
        return int(w) > int(h)
    return job.aspect_ratio == "16:9"


def _other_shape(job_id: int, src_id: int, target: str, redraw: bool) -> None:
    from app.video.video import _ready_push

    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        src = db.get(GenerationJob, src_id)
        old = db.get(Video, src.video_id) if src and src.video_id else None
        job.status = "running"
        db.commit()
        _report(job_id, stage="render", render=0.0)  # also marks the job as alive (video._tick)
        making = json.loads(src.making) if src and src.making else None
        try:
            if old is None:
                raise RuntimeError("The original video was deleted.")
            if redraw:
                props = _kept_props(making["remake"])
                props["ratio"] = target
                db.rollback()  # no transaction held open through the render
                blob = render(props, job_id)
                seconds = length_of(props)
            else:
                data = read_media(old.url)
                if data is None:
                    raise RuntimeError("The original video file is missing.")
                db.rollback()
                _report(job_id, render=0.3)
                blob = reframe(data, target)
                seconds = old.duration_seconds
        except Stopped:
            job = db.get(GenerationJob, job_id)
            job.status, job.error = "failed", "Stopped"
            db.commit()
            return
        except (RuntimeError, subprocess.TimeoutExpired) as exc:
            job = db.get(GenerationJob, job_id)
            job.status = "failed"
            job.error = (
                str(exc)
                if not isinstance(exc, subprocess.TimeoutExpired)
                else "Resizing took too long — try again."
            )
            db.commit()
            _ready_push(job)
            return
        job = db.get(GenerationJob, job_id)
        old = db.get(Video, old.id)
        video = Video(
            workspace_id=job.workspace_id,
            brand_id=job.brand_id,
            filename=f"{Path(old.filename or 'video').stem}-{target.replace(':', 'x')}.mp4",
            duration_seconds=int(round(seconds or 0)),
            resolution="1920x1080" if target == "16:9" else "1080x1920",
            size_bytes=len(blob),
            source="ai",
            tag=old.tag or "ai-motion",
            url=store_blob(db, blob, ".mp4", "video/mp4"),
            caption=old.caption or "",
            caption_angle=old.caption_angle or "",
            caption_status=old.caption_status or ("ready" if old.caption else ""),
            folder_id=old.folder_id,
        )
        db.add(video)
        db.flush()
        if making:
            job.making = json.dumps(
                {**making, "ratio": target}, ensure_ascii=False
            )  # and back again, if wanted
        job.video_id = video.id
        job.seconds = video.duration_seconds
        job.status, job.error = "succeeded", ""
        db.commit()
        _ready_push(job)
    except Exception:  # noqa: BLE001 — the page must stop waiting either way
        log.exception("other shape %s crashed", job_id)
        db.rollback()
        job = db.get(GenerationJob, job_id)
        if job is not None and job.status != "succeeded":
            job.status, job.error = (
                "failed",
                "Something went wrong while resizing the video — try again.",
            )
            db.commit()
    finally:
        _stopped.discard(job_id)
        _progress.pop(job_id, None)
        db.close()


@router.post("/other-shape/{job_id}", status_code=201)
def other_shape(
    job_id: int,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Make a Library video in the other shape (16:9 ⇄ 9:16). A template video
    with kept props is drawn again; anything else is fitted. The page polls
    GET /ai/video/{id}; the new video joins the Library, caption and folder
    copied. No AI and no voice — nothing is charged."""
    src = owned(db, GenerationJob, job_id, ws, "Generation job")
    video = db.get(Video, src.video_id) if src.video_id else None
    if video is None or src.kind == "image" or src.status != "succeeded":
        raise HTTPException(400, "Only a finished video can be made in another shape.")
    target = "9:16" if _is_wide(video, src) else "16:9"
    try:
        making = json.loads(src.making) if src.making else None
    except ValueError:
        making = None
    redraw = can_redraw(making, target) and not not_ready()
    refuse_if_busy(db, "motion")
    job = GenerationJob(
        workspace_id=ws,
        user_id=user.id,
        brand_id=src.brand_id,
        kind="motion",
        prompt=src.prompt,
        aspect_ratio=target,
        seconds=0,
        provider="remotion" if redraw else "reframe",
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    _report(job.id, stage="render", render=0.0)
    threading.Thread(
        target=_other_shape,
        args=(job.id, src.id, target, redraw),
        daemon=True,
        name=f"shape-{job.id}",
    ).start()
    return {"id": job.id, "target": target, "redraw": redraw}
