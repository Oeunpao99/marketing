"""The video editor (Content studio → Video editor): a CapCut-style timeline.

People import videos, pictures and sounds (POST /media/upload, tag
"editor-<kind>"), drag them onto tracks, cut, trim and move them, add words,
and the page saves the timeline here as they go (an EditProject). The same
timeline plays in the page (@remotion/player) and renders on the server
(motion/src/timeline.jsx, the "Timeline" composition), so the export looks
like the preview. Exporting makes a NEW video in the Library.

Rendering costs no AI, so an export isn't charged.
"""

from __future__ import annotations

import json
import logging
import re
import threading

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.media import delete_media, store_blob
from app.models import Brand, EditProject, GenerationJob, TeamMember, Video
from app.tenancy import current_workspace_id, get_current_user, owned

log = logging.getLogger(__name__)

router = APIRouter(prefix="/editor", tags=["Video editor"])

RATIOS = {"9:16": "1080x1920", "16:9": "1920x1080", "1:1": "1080x1080", "4:5": "1080x1350"}
TRACK_KINDS = {"video", "text", "audio"}
CLIP_KINDS = {"video", "image", "audio", "text"}
MEDIA_KINDS = {"video", "image", "audio"}
MAX_TRACKS = 12
MAX_CLIPS = 400
MAX_SECONDS = 600  # a ten-minute video
_MEDIA_URL = re.compile(r"^/media/[A-Za-z0-9._-]{1,120}$")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_ID = re.compile(r"^[A-Za-z0-9_-]{1,24}$")


def _num(value, lo: float, hi: float, default: float) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    if n != n:  # NaN
        return default
    return round(max(lo, min(hi, n)), 3)


def clean_timeline(raw, ratio: str = "9:16") -> dict:
    """The timeline as the page sent it, kept to what timeline.jsx draws —
    known kinds, numbers in range, files only from this app's /media."""
    raw = raw if isinstance(raw, dict) else {}
    tracks, ids = [], set()
    for t in (raw.get("tracks") or [])[:MAX_TRACKS]:
        if not isinstance(t, dict) or not _ID.match(str(t.get("id") or "")) or t.get("kind") not in TRACK_KINDS:
            continue
        if t["id"] in ids:
            continue
        ids.add(t["id"])
        tracks.append({"id": t["id"], "kind": t["kind"], "muted": bool(t.get("muted")), "hidden": bool(t.get("hidden"))})
    kinds = {t["id"]: t["kind"] for t in tracks}
    clips, seen = [], set()
    for c in (raw.get("clips") or [])[:MAX_CLIPS]:
        if not isinstance(c, dict):
            continue
        cid, track, kind = str(c.get("id") or ""), c.get("track"), c.get("kind")
        if not _ID.match(cid) or cid in seen or track not in kinds or kind not in CLIP_KINDS:
            continue
        # a clip sits on a track of its sort: words on a words track, sounds on a sound track
        want = "text" if kind == "text" else "audio" if kind == "audio" else "video"
        if kinds[track] != want:
            continue
        clip = {
            "id": cid,
            "track": track,
            "kind": kind,
            "start": _num(c.get("start"), 0, MAX_SECONDS, 0),
            "dur": _num(c.get("dur"), 0.1, MAX_SECONDS, 3),
            "fadeIn": _num(c.get("fadeIn"), 0, 10, 0),
            "fadeOut": _num(c.get("fadeOut"), 0, 10, 0),
            "name": str(c.get("name") or "")[:120],
        }
        if kind == "text":
            color = str(c.get("color") or "#ffffff")
            clip.update(
                text=str(c.get("text") or "")[:500],
                size=_num(c.get("size"), 12, 300, 64),
                color=color if _HEX.match(color) else "#ffffff",
                look=c.get("look") if c.get("look") in ("plain", "box", "outline") else "box",
            )
        else:
            src = str(c.get("src") or "")
            if not _MEDIA_URL.match(src):
                continue
            clip.update(
                {
                    "src": src,
                    "from": _num(c.get("from"), 0, 36000, 0),
                    "volume": _num(c.get("volume"), 0, 2, 1),
                    # the file's own length — the page keeps a cut inside it
                    "srcDur": _num(c.get("srcDur"), 0, 36000, 0),
                }
            )
        if kind != "audio":
            clip.update(
                x=_num(c.get("x"), -100, 100, 0),
                y=_num(c.get("y"), -100, 100, 0),
                scale=_num(c.get("scale"), 0.05, 5, 1),
            )
            if kind != "text":
                clip["fit"] = c.get("fit") if c.get("fit") in ("contain", "cover") else "contain"
        seen.add(cid)
        clips.append(clip)
    return {"ratio": ratio if ratio in RATIOS else "9:16", "tracks": tracks, "clips": clips}


def timeline_seconds(data: dict) -> float:
    return max([c["start"] + c["dur"] for c in data.get("clips") or []] or [0])


def _cover(data: dict) -> str:
    for c in sorted(data.get("clips") or [], key=lambda c: c["start"]):
        if c["kind"] in ("video", "image"):
            return c["src"]
    return ""


def _out(p: EditProject, full: bool = False) -> dict:
    out = {
        "id": p.id,
        "name": p.name,
        "ratio": p.ratio,
        "brand_id": p.brand_id,
        "seconds": float(p.seconds or 0),
        "cover": p.cover or "",
        "video_id": p.video_id,
        "updated_at": p.updated_at,
    }
    if full:
        try:
            out["data"] = json.loads(p.data) if p.data else {"tracks": [], "clips": []}
        except ValueError:
            out["data"] = {"tracks": [], "clips": []}
    return out


def _apply(p: EditProject, name: str | None, ratio: str | None, data: dict | None) -> None:
    if name is not None:
        p.name = name.strip()[:120] or "Untitled video"
    if ratio is not None:
        if ratio not in RATIOS:
            raise HTTPException(400, "Pick a video shape: 9:16, 16:9, 1:1 or 4:5.")
        p.ratio = ratio
    if data is not None:
        clean = clean_timeline(data, p.ratio)
        if timeline_seconds(clean) > MAX_SECONDS:
            raise HTTPException(400, "A video can be up to 10 minutes long — shorten the timeline.")
        p.data = json.dumps({"tracks": clean["tracks"], "clips": clean["clips"]}, ensure_ascii=False)
        p.seconds = round(timeline_seconds(clean), 2)
        p.cover = _cover(clean)


class ProjectIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    ratio: str | None = None
    brand_id: int | None = None
    data: dict | None = None


@router.get("/projects")
def list_projects(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    rows = db.scalars(
        select(EditProject).where(EditProject.workspace_id == ws).order_by(EditProject.updated_at.desc()).limit(200)
    ).all()
    return [_out(p) for p in rows]


@router.post("/projects", status_code=201)
def create_project(payload: ProjectIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    if payload.brand_id is not None:
        owned(db, Brand, payload.brand_id, ws, "Brand")
    p = EditProject(workspace_id=ws, brand_id=payload.brand_id, name="Untitled video", ratio="9:16", data="", seconds=0)
    _apply(p, payload.name, payload.ratio or "9:16", payload.data if payload.data is not None else {})
    db.add(p)
    db.commit()
    db.refresh(p)
    return _out(p, full=True)


@router.get("/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    return _out(owned(db, EditProject, project_id, ws, "Project"), full=True)


@router.put("/projects/{project_id}")
def save_project(project_id: int, payload: ProjectIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The page saves as people edit (a second after the last change)."""
    p = owned(db, EditProject, project_id, ws, "Project")
    _apply(p, payload.name, payload.ratio, payload.data)
    db.commit()
    db.refresh(p)
    return _out(p)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The project only — its exports stay in the Library, its files in Imports."""
    db.delete(owned(db, EditProject, project_id, ws, "Project"))
    db.commit()


# ── imported files (uploaded with tag "editor-video" / "-image" / "-audio") ──
def _media_kind(v: Video) -> str:
    kind = (v.tag or "").removeprefix("editor-")
    return kind if kind in MEDIA_KINDS else "video"


@router.get("/media")
def list_media(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The files people imported into the editor, newest first."""
    rows = db.scalars(
        select(Video)
        .where(Video.workspace_id == ws, Video.source == "upload", Video.tag.like("editor-%"))
        .order_by(Video.id.desc())
        .limit(300)
    ).all()
    return [{"id": v.id, "url": v.url, "filename": v.filename, "kind": _media_kind(v), "size_bytes": v.size_bytes} for v in rows]


@router.delete("/media/{video_id}", status_code=204)
def delete_imported(video_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    v = owned(db, Video, video_id, ws, "File")
    if v.source != "upload" or not (v.tag or "").startswith("editor-"):
        raise HTTPException(400, "Only files imported into the editor can be removed here.")
    url = v.url
    db.delete(v)
    if url and not db.scalar(select(Video.id).where(Video.url == url, Video.id != v.id).limit(1)):
        delete_media(db, url)
    db.commit()


# ── export ──────────────────────────────────────────────────────────────────
@router.post("/projects/{project_id}/export", status_code=201)
def export_project(
    project_id: int,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Render the timeline; the page polls GET /ai/video/{id} and the video
    joins the Library."""
    from app import motion

    reason = motion.not_ready()
    if reason:
        log.warning("editor export: motion not ready: %s", reason)
        raise HTTPException(503, "Exporting isn't available on this server right now — try again later.")
    p = owned(db, EditProject, project_id, ws, "Project")
    data = clean_timeline(json.loads(p.data) if p.data else {}, p.ratio)
    if not data["clips"]:
        raise HTTPException(400, "The timeline is empty — add a video, picture or words first.")
    # every file must be this workspace's own (an upload or a Library video)
    srcs = {c["src"] for c in data["clips"] if c.get("src")}
    if srcs:
        mine = set(db.scalars(select(Video.url).where(Video.workspace_id == ws, Video.url.in_(srcs))).all())
        if srcs - mine:
            raise HTTPException(400, "A file in the timeline was deleted — remove it and export again.")
    seconds = timeline_seconds(data)
    from app.video import refuse_if_busy

    refuse_if_busy(db, "motion")  # the export renders like a template video, one at a time
    job = GenerationJob(
        workspace_id=ws,
        user_id=user.id,
        brand_id=p.brand_id,
        kind="motion",
        prompt=p.name,
        aspect_ratio=p.ratio,
        seconds=int(round(seconds)),
        provider="editor",
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    motion._report(job.id, stage="render", render=0.0)
    threading.Thread(target=_export, args=(job.id, p.id, data, seconds), daemon=True, name=f"editor-{job.id}").start()
    return {"id": job.id}


def _export(job_id: int, project_id: int, data: dict, seconds: float) -> None:
    from app import motion
    from app.video import _ready_push

    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        job.status = "running"
        db.commit()
        try:
            blob = motion.render(data, job_id, composition="Timeline", seconds=seconds)
        except motion.Stopped:
            job = db.get(GenerationJob, job_id)
            job.status, job.error = "failed", "Stopped"
            db.commit()
            return
        except RuntimeError as exc:
            job = db.get(GenerationJob, job_id)
            job.status, job.error = "failed", str(exc)
            db.commit()
            _ready_push(job)
            return
        job = db.get(GenerationJob, job_id)
        p = db.get(EditProject, project_id)
        name = re.sub(r"[^\w\- ]+", "", (p.name if p else job.prompt) or "video").strip()[:60] or "video"
        video = Video(
            workspace_id=job.workspace_id,
            brand_id=job.brand_id,
            filename=f"{name}.mp4",
            duration_seconds=int(round(seconds)),
            resolution=RATIOS.get(data["ratio"], "1080x1920"),
            size_bytes=len(blob),
            source="editor",
            tag="ai-motion",
            url=store_blob(db, blob, ".mp4", "video/mp4"),
        )
        db.add(video)
        db.flush()
        job.video_id = video.id
        job.status, job.error = "succeeded", ""
        if p is not None:
            p.video_id = video.id
        db.commit()
        _ready_push(job)
    except Exception:  # noqa: BLE001 — the page must stop waiting either way
        log.exception("editor export %s crashed", job_id)
        db.rollback()
        job = db.get(GenerationJob, job_id)
        if job is not None and job.status != "succeeded":
            job.status, job.error = "failed", "Something went wrong while exporting — try again."
            db.commit()
    finally:
        motion._stopped.discard(job_id)
        motion._progress.pop(job_id, None)
        db.close()

