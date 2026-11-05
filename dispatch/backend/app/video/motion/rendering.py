"""The Remotion render: props to files, the bundle, the subprocess, its progress.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from contextlib import contextmanager
from app.core.database import SessionLocal
from app.models import GenerationJob
from pathlib import Path
from sqlalchemy import func, update as sa_update
from sqlalchemy.orm import Session

from app.video.motion.common import MOTION_DIR, _npx, _render_lock, log, not_ready
from app.video.motion.props import length_of
from app.video.motion.jobs import _check, _kill_tree, _procs, _report, progress_of


def _to_files(props: dict, folder: Path, rel: str) -> dict:
    """``props`` with every embedded picture / sound written to ``folder`` and
    swapped for its path under public/ — Remotion re-reads the props for every
    frame, so megabytes of data: URIs there made renders crawl (402 s seen)."""
    count = 0

    def swap(value):
        nonlocal count
        if isinstance(value, str) and value.startswith("data:") and "," in value:
            head, data = value.split(",", 1)
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
            count += 1
            name = f"{count}{ext}"
            (folder / name).write_bytes(base64.b64decode(data))
            return f"{rel}/{name}"
        if isinstance(value, dict):
            return {k: swap(v) for k, v in value.items()}
        if isinstance(value, list):
            return [swap(v) for v in value]
        return value

    return swap(props)


BUNDLE_DIR = MOTION_DIR / "build"  # `npx remotion bundle` output — made once in the Docker image


def _entry() -> tuple[str, Path]:
    """What to render from, and where its public files are served from.

    The pre-built bundle (motion/build) skips packing the whole template before
    every video — minutes on a small server. It's used unless the template,
    fonts or music changed after it was built (editing on a dev machine), then
    the sources are bundled as before."""
    built = BUNDLE_DIR / "index.html"
    if built.exists():
        stamp = built.stat().st_mtime
        sources = [
            *(MOTION_DIR / "src").rglob("*"),
            *(MOTION_DIR / "public" / "fonts").rglob("*"),
            *(MOTION_DIR / "public" / "music").rglob("*"),
        ]
        if all(p.stat().st_mtime <= stamp for p in sources if p.is_file()):
            return "build", BUNDLE_DIR / "public"
    return "src/index.jsx", MOTION_DIR / "public"


_VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".3gp"}


def _even_video(data: bytes, out: Path) -> None:
    """A video as the render reads it best: H.264 at a steady 30 fps, no
    B-frames, no MP4 edit list, at most 1920 px on its long side. Phones send
    HEVC, variable frame rates and edit lists, and the render's frame reader
    then fails ("No frame found at position …") when it draws in parallel."""
    from app.video.story import _ffmpeg

    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as src:
        src.write(data)
    try:
        run = subprocess.run(
            [
                _ffmpeg(),
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                src.name,
                "-vf",
                "fps=30,scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))'",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-g",
                "30",
                "-bf",
                "0",
                "-c:a",
                "aac",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-use_editlist",
                "0",
                "-movflags",
                "+faststart",
                str(out),
            ],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=900,
        )
        if run.returncode != 0 or not out.exists():
            log.error("editor: a video couldn't be prepared: %s", run.stderr[-800:])
            raise RuntimeError("A video in the timeline couldn't be read — try importing it again.")
    except subprocess.TimeoutExpired:
        raise RuntimeError(
            "A video in the timeline is too long to prepare — cut it shorter and try again."
        ) from None
    finally:
        Path(src.name).unlink(missing_ok=True)


def refuse_if_busy(db: Session, kind: str) -> None:
    """Too many videos already in line → "please try again in a moment" (app/video/video.py)."""
    from app.video.video import refuse_if_busy as refuse  # local: app.video imports this module lazily

    refuse(db, kind)


def _render_started(job_id: int) -> None:
    """Its turn has come: the job's updated_at is now — the stale-job check
    (video._tick, 45 min) counts from here, not from the time spent waiting
    behind other videos' renders (one at a time: 30 at once queue for an hour)."""
    db = SessionLocal()
    try:
        db.execute(
            sa_update(GenerationJob).where(GenerationJob.id == job_id).values(updated_at=func.now())
        )
        db.commit()
    except Exception:  # noqa: BLE001 — the render matters more than the clock
        log.warning("motion %s: render start not recorded", job_id, exc_info=True)
        db.rollback()
    finally:
        db.close()


_waiting: list[int] = []  # videos waiting for the drawing tool, oldest first
_waiting_lock = threading.Lock()
_drawing: dict = {"job": None}  # the video being drawn now (None: a design check / slide PDF, or nothing)


@contextmanager
def _turn(job_id: int | None, preview: bool):
    """The drawing tool, one video at a time. While a video waits, its page
    shows a live line (MotionBoard renderLine): its place in line (queue = how
    many go first, the one drawing now included), how far the one drawing now
    has got (ahead, 0..1) and how long it has waited — and Stop works while it
    waits, not only once its turn comes."""
    if job_id is None or preview:
        with _render_lock:
            yield
        return
    with _waiting_lock:
        _waiting.append(job_id)
    since = time.monotonic()
    try:
        while not _render_lock.acquire(timeout=2):
            _check(job_id)
            with _waiting_lock:
                before = _waiting.index(job_id) if job_id in _waiting else 0
            now = _drawing["job"]
            share = (progress_of(now) or {}).get("render") if now is not None else None
            _report(
                job_id,
                render_step="queue",
                queue=before + 1,
                ahead=round(float(share), 3) if share is not None else None,
                waited=round(time.monotonic() - since),
            )
    finally:
        with _waiting_lock:
            if job_id in _waiting:
                _waiting.remove(job_id)
    _drawing["job"] = job_id
    try:
        yield
    finally:
        _drawing["job"] = None
        _render_lock.release()


def _media_to_files(props: dict, folder: Path, rel: str) -> dict:
    """``props`` with every stored file ("/media/<name>" — the video editor's
    clips) copied to ``folder`` and swapped for its path under public/: the
    render's own little server can't reach the app's /media."""
    from app.storage.media import read_media

    kept: dict[str, str] = {}

    def swap(value):
        if isinstance(value, str) and value.startswith("/media/"):
            if value not in kept:
                data = read_media(value)
                if data is None:
                    raise RuntimeError(
                        "A file in the video was deleted — remove it from the timeline and try again."
                    )
                suffix = Path(value).suffix.lower()[:8]
                name = f"m{len(kept) + 1}"
                if suffix in _VIDEO_SUFFIXES:
                    name += ".mp4"
                    _even_video(data, folder / name)
                else:
                    name += suffix
                    (folder / name).write_bytes(data)
                kept[value] = f"{rel}/{name}"
            return kept[value]
        if isinstance(value, dict):
            return {k: swap(v) for k, v in value.items()}
        if isinstance(value, list):
            return [swap(v) for v in value]
        return value

    return swap(props)


def render(
    props: dict,
    job_id: int | None = None,
    preview: bool = False,
    composition: str = "MotionPost",
    seconds: float | None = None,
) -> bytes:
    """The MP4 for ``props`` — Remotion, run as a subprocess. Raises
    RuntimeError, or Stopped when the person pressed Stop. ``preview``: small
    and silent, for AI design's self-check (review_design) — quick.
    ``composition`` "Timeline" = the video editor's export (its ``seconds``
    long; its clips' stored files are copied in for the render)."""
    reason = not_ready()
    if reason:
        raise RuntimeError(reason)
    # render_step — what the Animate step is doing before / around the frames, for the
    # page's live line (MotionBoard motionStage): queue (another video is being drawn),
    # start (opening the drawing tool), frames (render = the share drawn), finish (joining the MP4)
    if not preview:  # (a re-render of the same job starts over, not at the last one's "finish")
        _report(job_id, render_step="queue" if _render_lock.locked() else "start")
    with _turn(job_id, preview), tempfile.TemporaryDirectory() as tmp:
        _check(job_id)
        if job_id is not None and not preview:
            _render_started(job_id)
            _report(job_id, render_step="start")
        entry, public = _entry()
        rel = f"run-{uuid.uuid4().hex[:12]}"
        assets = public / rel  # served to the render as staticFile(rel/…)
        assets.mkdir(parents=True)
        try:
            props_path = Path(tmp) / "props.json"
            out = Path(tmp) / "motion.mp4"
            files = _to_files(props, assets, rel)
            if composition == "Timeline":
                files = _media_to_files(files, assets, rel)
            props_path.write_text(json.dumps(files, ensure_ascii=False), encoding="utf-8")
            proc = subprocess.Popen(
                [
                    _npx(),
                    "remotion",
                    "render",
                    entry,
                    composition,
                    str(out),
                    f"--props={props_path}",
                    # every core draws frames (the default is half — one at a time on a 2-core server)
                    # all cores Remotion is allowed (containers too); the default log
                    # level prints "Rendered 120/900" lines — the page's progress
                    "--concurrency=100%",
                    # 3D · Spotlight draws with WebGL — the server has no graphics card, so in software
                    # (software 3D starts slowly: up to 2 minutes for a frame, not the 30 s default)
                    *(
                        ["--gl=swangle", "--timeout=120000"]
                        if props.get("style") in ("spotlight", "street3d")
                        else []
                    ),
                    *(["--scale=0.4", "--muted", "--crf=22"] if preview else []),
                ],
                cwd=MOTION_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors="replace",
                start_new_session=os.name != "nt",  # so Stop can end the whole group
            )
            if job_id is not None:
                _procs[job_id] = proc
            tail: list[str] = []  # the last lines, for the log if it fails

            def follow() -> None:
                for line in proc.stdout:
                    tail.append(line)
                    del tail[:-60]
                    m = re.search(r"Rendered (\d+)/(\d+)", line)
                    if preview:
                        continue  # the self-check's preview isn't the video's progress
                    if m and int(m[2]):
                        _report(job_id, render=round(int(m[1]) / int(m[2]), 3), render_step="frames")
                    elif "Encoded" in line or "Stitch" in line:
                        _report(job_id, render=1.0, render_step="finish")

            reader = threading.Thread(target=follow, daemon=True)
            reader.start()
            try:
                # any template may run 10 minutes now, and a heavy one (AI design, 3D) draws
                # slower than a training: ~75 minutes allowed for a 10-minute video
                proc.wait(timeout=900 + 6 * (seconds if seconds is not None else length_of(props)))
            except subprocess.TimeoutExpired:
                _kill_tree(proc)
                proc.wait()
                raise RuntimeError("Rendering took too long — try again.") from None
            finally:
                reader.join(timeout=5)
                if job_id is not None:
                    _procs.pop(job_id, None)
            _check(job_id)
            if proc.returncode != 0 or not out.exists():
                log.error("motion render failed: %s", "".join(tail)[-1500:])
                raise RuntimeError("The video couldn't be rendered — try again.")
            return out.read_bytes()
        finally:
            shutil.rmtree(assets, ignore_errors=True)
