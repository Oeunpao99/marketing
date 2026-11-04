"""Editing a made video (the editor's words, voice, pictures) and "Replace with your voice".

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

import base64
import json
import re
import shutil
import subprocess
import tempfile
import threading
from app import billing
from app.database import SessionLocal, get_db
from app.media import store_blob
from app.models import Brand, GenerationJob, TeamMember, Video
from app.tenancy import current_workspace_id, get_current_user, owned
from fastapi import Depends, File, HTTPException, UploadFile
from pathlib import Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.motion.common import TRANSITION_S, _km_words, _line, log, not_ready, router
from app.motion.templates.picture import PICTURE_SAY_MAX
from app.motion.templates.dialogue import DIALOGUE_STYLES, dialogue_voices
from app.motion.templates.canvas import _plain
from app.motion.scenes import _TEXT_FIELDS
from app.motion.props import _brackets, default_seconds, length_of
from app.motion.voiceover import VOICE_TAIL, _pauses, add_voice
from app.motion.jobs import Stopped, _progress, _report, _stopped
from app.motion.rendering import refuse_if_busy, render
from app.motion.reshape import REDRAW_SKIP, _kept_props, keep_props
from app.motion.deck_pdf import _linked_props


# ── the video editor ("Edit" on a Library video) ───────────────────────────
# A template video is drawn from its kept props (keep_props), so it can be edited
# and drawn again: the words on screen, the spoken lines, the order of the scenes,
# the music and the sound effects. Lines left as they were keep their voice (no
# charge); a changed line is voiced again. The result is a NEW Library video —
# the original stays.
EDIT_MAX_SCENES = 40


# ── Slides · Presentation: the presenter and the PDF ────────────────────────
_VOICE_FIELDS = ("audio", "voiceWords", "pauses", "voiceSeconds", "seconds", "caption")


def _editable_text(value: str) -> str:
    """A word on screen as the editor shows it: no zero-width spaces, [highlights] in brackets."""
    return re.sub(r"[​‌‍]", "", str(value or "")).replace("⟦", "[").replace("⟧", "]").strip()


def _edit_source(db: Session, job_id: int, ws: int) -> tuple[GenerationJob, Video, dict]:
    src = owned(db, GenerationJob, job_id, ws, "Generation job")
    video = db.get(Video, src.video_id) if src.video_id else None
    if video is None or src.kind != "motion" or src.status != "succeeded":
        raise HTTPException(400, "Only a finished template video can be edited.")
    try:
        making = json.loads(src.making) if src.making else None
    except ValueError:
        making = None
    if not making or not making.get("remake") or making.get("style") in REDRAW_SKIP:
        raise HTTPException(400, "This video can't be edited — make a new one from the Studio.")
    return src, video, making


def can_edit(job: GenerationJob) -> bool:
    """For the Library: a finished template video whose scenes were kept."""
    if (
        job.kind != "motion"
        or job.status != "succeeded"
        or not job.making
        or '"remake"' not in job.making
    ):
        return False
    try:
        return json.loads(job.making).get("style") not in REDRAW_SKIP
    except ValueError:
        return False


def _scene_picture(value, key: str = "") -> str:
    """A scene's first stored picture (its /media link) — the editor's thumbnail. Not the logo."""
    if "logo" in key.lower():
        return ""
    if isinstance(value, str):
        return value if re.match(r"^/media/[\w.-]+\.(?:jpe?g|png|webp)$", value) else ""
    items = (
        value.items()
        if isinstance(value, dict)
        else enumerate(value)
        if isinstance(value, list)
        else ()
    )
    for k, v in items:
        if link := _scene_picture(v, str(k)):
            return link
    return ""


@router.get("/edit/{job_id}")
def edit_view(job_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """What the editor shows: each scene's words on screen and its spoken line
    (and its voice clip, to listen to), the music and the sound effects."""
    src, video, making = _edit_source(db, job_id, ws)
    try:
        props = _linked_props(
            making["remake"]
        )  # links, not embedded files: the page only shows them
    except RuntimeError as exc:
        raise HTTPException(400, "This video's scenes are no longer stored.") from exc
    clips = making.get("scenes") or []
    scenes = []
    for n, sc in enumerate(props["scenes"]):
        keys = [
            k
            for k, _ in _TEXT_FIELDS.get(sc.get("type"), ())
            if k != "say" and isinstance(sc.get(k), str)
        ]
        scenes.append(
            {
                "i": n,
                "type": sc.get("type") or "",
                "text": {k: _editable_text(sc[k]) for k in keys},
                "say": _editable_text(sc.get("caption") or "").replace("[", "").replace("]", ""),
                "seconds": round(float(sc.get("seconds") or default_seconds(sc)), 1),
                "voiced": bool(sc.get("audio")),
                "clip": (clips[n].get("audio") or "") if n < len(clips) else "",
                "picture": _scene_picture(sc),
            }
        )
    return {
        "id": src.id,
        "brand_id": src.brand_id,
        "url": video.url,
        "filename": video.filename,
        "caption": video.caption or "",
        "style": making.get("style") or props.get("style") or "",
        "ratio": props.get("ratio") or "9:16",
        "language": making.get("language") or "",
        "voice": making.get("voice") or "none",
        "music": bool(props.get("music") or props.get("musicList")),
        "music_name": making.get("music") or "",
        "music_volume": float(props.get("musicVolume") or 1),
        "voice_volume": float(props.get("voiceVolume") or 1),
        "sfx": props.get("sfx", True) is not False,
        "seconds": length_of(props),
        "scenes": scenes,
    }


class EditScene(BaseModel):
    i: int = Field(ge=0)
    text: dict[str, str] = Field(default_factory=dict)
    say: str = Field(default="", max_length=PICTURE_SAY_MAX)


class EditIn(BaseModel):
    scenes: list[EditScene] = Field(min_length=1, max_length=EDIT_MAX_SCENES)
    music: bool = True
    music_volume: float = Field(default=1.0, ge=0.0, le=1.5)
    voice_volume: float = Field(default=1.0, ge=0.2, le=1.0)
    sfx: bool = True


@router.post("/edit/{job_id}", status_code=201)
def edit_video(
    job_id: int,
    payload: EditIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Draw the edited video; the page polls GET /ai/video/{id} and the new
    video joins the Library (caption and folder copied). Only changed spoken
    lines are voiced again — and only they are charged."""
    reason = not_ready()
    if reason:
        raise HTTPException(503, f"Motion videos aren't set up on this server yet. {reason}")
    src, _video, making = _edit_source(db, job_id, ws)
    count = len(making.get("scenes") or []) or EDIT_MAX_SCENES
    if any(e.i >= max(count, 1) for e in payload.scenes):
        raise HTTPException(400, "A scene in the edit isn't in this video.")
    billing.require(ws, 0.0, db)
    refuse_if_busy(db, "motion")
    job = GenerationJob(
        workspace_id=ws,
        user_id=user.id,
        brand_id=src.brand_id,
        kind="motion",
        prompt=src.prompt,
        aspect_ratio=src.aspect_ratio,
        seconds=0,
        provider="remotion",
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    _report(job.id, stage="render", render=0.0)
    threading.Thread(
        target=_edit,
        args=(job.id, src.id, payload.model_dump()),
        daemon=True,
        name=f"edit-{job.id}",
    ).start()
    return {"id": job.id}


@router.post("/edit/{job_id}/own-voice", status_code=201)
def own_voice_edit(
    job_id: int,
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Their own recording of the script in place of the video's voice — a NEW
    video (the original stays): the recording is cut scene by scene at its
    pauses and every scene fits its piece (app/own_voice.py). No AI credits."""
    from app import own_voice

    reason = not_ready()
    if reason:
        raise HTTPException(503, f"Motion videos aren't set up on this server yet. {reason}")
    src, _video, making = _edit_source(db, job_id, ws)
    try:
        props = _kept_props(making["remake"])
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not any(sc.get("caption") for sc in props["scenes"]):
        raise HTTPException(400, "This video has no spoken lines to read.")
    data = audio.file.read(own_voice.MAX_BYTES + 1)
    if len(data) > own_voice.MAX_BYTES:
        raise HTTPException(
            413, "That recording is too large — upload an MP3 or M4A (under 80 MB)."
        )
    if len(data) < 2_000:
        raise HTTPException(400, "That recording is empty — record the script, then upload it.")
    refuse_if_busy(db, "motion")
    work = Path(tempfile.mkdtemp(prefix="own-voice-"))
    ext = "." + (audio.filename or "voice.m4a").rsplit(".", 1)[-1].lower()[:5]
    recording = work / f"upload{ext if len(ext) > 1 else '.m4a'}"
    recording.write_bytes(data)
    job = GenerationJob(
        workspace_id=ws,
        user_id=user.id,
        brand_id=src.brand_id,
        kind="motion",
        prompt=src.prompt,
        aspect_ratio=src.aspect_ratio,
        seconds=0,
        provider="remotion",
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    edit = {
        "scenes": [
            {"i": n, "say": _editable_text(sc.get("caption") or "")}
            for n, sc in enumerate(props["scenes"])
        ],
        "music": bool(props.get("music") or props.get("musicList")),
        "music_volume": float(props.get("musicVolume") or 1),
        "voice_volume": 1.0,
        "sfx": props.get("sfx", True) is not False,
        "own_voice": str(recording),
    }
    _report(job.id, stage="voice")
    threading.Thread(
        target=_edit, args=(job.id, src.id, edit), daemon=True, name=f"own-voice-{job.id}"
    ).start()
    return {"id": job.id}


def apply_own_voice(props: dict, recording: Path) -> None:
    """Their recording in place of every scene's voice (app/own_voice.py):
    one piece per spoken line, each scene as long as its piece needs — the
    subtitles change phrase at the pauses in their voice."""
    from app import own_voice

    spoken = [n for n, sc in enumerate(props["scenes"]) if sc.get("caption")]
    lines = [_editable_text(props["scenes"][n]["caption"]) for n in spoken]
    pieces = own_voice.split(recording, lines, recording.parent)
    for sc in props["scenes"]:
        for k in ("audio", "voiceWords", "pauses", "voiceSeconds"):
            sc.pop(k, None)
    for k, (n, (mp3, seconds)) in enumerate(zip(spoken, pieces)):
        sc = props["scenes"][n]
        sc["audio"] = "data:audio/mpeg;base64," + base64.b64encode(mp3).decode()
        # The line starts once the scene has slid in + 6 frames breathing room (MotionPost.jsx).
        lead = (TRANSITION_S if n else 0.0) + 0.2 + min(1.5, float(sc.get("pause") or 0))
        sc["seconds"] = round(max(default_seconds(sc), lead + seconds + VOICE_TAIL), 2)
        sc["voiceSeconds"] = round(seconds, 2)
        sc["pauses"] = _pauses(recording.parent / f"line-{k}.mp3")


def edited_props(props: dict, edit: dict, khmer: bool) -> tuple[dict, list[tuple[int, str]]]:
    """The kept props with the edit applied, and the scenes whose spoken line
    changed — [(index in the new video, the new line)], to be voiced again."""

    def t(text: str) -> str:
        text = _brackets(text)
        return _km_words(text) if khmer else text

    old = props["scenes"]
    scenes, revoice = [], []
    for e in edit["scenes"]:
        sc = json.loads(json.dumps(old[e["i"]]))  # a copy — a scene may be used twice
        limits = {k: n for k, n in _TEXT_FIELDS.get(sc.get("type"), ()) if k != "say"}
        for key, value in (e.get("text") or {}).items():
            if key in limits and isinstance(value, str) and isinstance(sc.get(key), str):
                if _plain(value) != _plain(sc[key]):
                    sc[key] = t(_line(value, limits[key]))
        say = _line(e.get("say") or "", PICTURE_SAY_MAX)
        if _plain(say) != _plain(sc.get("caption") or ""):
            for k in ("audio", "voiceWords", "pauses", "voiceSeconds", "seconds"):
                sc.pop(k, None)
            if say:
                sc["caption"] = t(say).replace("⟦", "").replace("⟧", "")
                revoice.append((len(scenes), say))
            else:
                sc.pop("caption", None)
        scenes.append(sc)
    out = {
        **props,
        "scenes": scenes,
        "sfx": bool(edit.get("sfx", True)),
        "voiceVolume": float(edit.get("voice_volume") or 1),
    }
    if edit.get("music", True):
        out["musicVolume"] = float(
            edit.get("music_volume") if edit.get("music_volume") is not None else 1
        )
    else:
        out.pop("music", None)
        out.pop("musicList", None)
    return out, revoice


def _edit(job_id: int, src_id: int, edit: dict) -> None:
    from app import gemini_keys, speech, voice_clone
    from app.video import _ready_push

    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        src = db.get(GenerationJob, src_id)
        old = db.get(Video, src.video_id) if src and src.video_id else None
        job.status = "running"
        db.commit()
        _report(job_id, stage="render", render=0.0)
        making = json.loads(src.making)
        language = making.get("language") or "Khmer"
        khmer = "khmer" in language.lower()
        try:
            if old is None:
                raise RuntimeError("The original video was deleted.")
            props, revoice = edited_props(_kept_props(making["remake"]), edit, khmer)
            setting = making.get("voice") or "none"
            if edit.get("own_voice"):  # their own recording, cut to the scenes
                from app.own_voice import OwnVoiceError

                db.rollback()
                try:
                    apply_own_voice(props, Path(edit["own_voice"]))
                except OwnVoiceError as exc:
                    raise RuntimeError(str(exc)) from exc
            elif revoice and setting == "own":  # their recording can't read a new line
                raise RuntimeError(
                    "This video speaks with your own recording — to change what's said, upload a new recording."
                )
            elif revoice and setting != "none":
                brand = db.get(Brand, job.brand_id) if job.brand_id else None
                speech.use_workspace_key(gemini_keys.workspace_key(db, job.workspace_id))
                narrator, clone = voice_clone.narrator_for(
                    brand, language, setting, making.get("style")
                )
                if not narrator:
                    raise RuntimeError("The voice isn't available right now — try again later.")
                part = {
                    "scenes": [props["scenes"][n] for n, _ in revoice]
                }  # the same scene dicts: the voice lands in props
                said = {
                    "scenes": [{**props["scenes"][n], "say": say} for n, say in revoice],
                    "style": making.get("style"),
                }
                voices = None
                if making.get("style") in DIALOGUE_STYLES and setting in (
                    "female",
                    "male",
                    "brand",
                ):
                    voices = dialogue_voices(
                        {"cast": props.get("cast"), "scenes": said["scenes"]},
                        language,
                        narrator,
                        setting,
                    )
                db.rollback()  # no transaction held open through the voice and the render
                add_voice(
                    part,
                    said,
                    narrator,
                    job.workspace_id,
                    job.user_id,
                    job_id,
                    (brand.pronunciations if brand else None) or [],
                    clone,
                    voices,
                )
            else:
                db.rollback()
            _report(job_id, stage="render", render=0.0)
            blob = render(props, job_id)
            seconds = length_of(props)
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
                else "Rendering took too long — try again."
            )
            db.commit()
            _ready_push(job)
            return
        job = db.get(GenerationJob, job_id)
        old = db.get(Video, old.id)
        video = Video(
            workspace_id=job.workspace_id,
            brand_id=job.brand_id,
            filename=f"{Path(old.filename or 'video').stem.removesuffix('-edited').removesuffix('-your-voice')}{'-your-voice' if edit.get('own_voice') else '-edited'}.mp4",
            duration_seconds=int(round(seconds or 0)),
            resolution=old.resolution,
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
        # its own making-of: the edited scenes, kept again (so it can be edited again)
        start, rows = 0.0, []
        for sc in props["scenes"]:
            secs = float(sc.get("seconds") or default_seconds(sc))
            words = [
                _editable_text(sc[k])
                for k, _ in _TEXT_FIELDS.get(sc.get("type"), ())
                if k != "say" and isinstance(sc.get(k), str) and sc.get(k)
            ]
            rows.append(
                {
                    "type": sc.get("type") or "",
                    "screen": " — ".join(words),
                    "say": _editable_text(sc.get("caption") or ""),
                    "start": round(start, 2),
                    "seconds": round(secs, 2),
                    "audio": "",
                }
            )
            start += secs - TRANSITION_S
        made = {
            **making,
            "scenes": rows,
            "music": making.get("music") if props.get("music") or props.get("musicList") else "",
        }
        if edit.get("own_voice"):
            made["voice"] = (
                "own"  # their recording — a later edit keeps it (changed lines can't be re-read)
            )
        try:
            made["remake"] = keep_props(db, props)
        except Exception:  # noqa: BLE001 — the video matters more than a later edit
            log.exception("motion edit %s: props not kept", job_id)
            made.pop("remake", None)
        job.making = json.dumps(made, ensure_ascii=False)
        job.prompt = src.prompt
        job.video_id = video.id
        job.seconds = video.duration_seconds
        job.status, job.error = "succeeded", ""
        db.commit()
        _ready_push(job)
    except Exception:  # noqa: BLE001 — the page must stop waiting either way
        log.exception("motion edit %s crashed", job_id)
        db.rollback()
        job = db.get(GenerationJob, job_id)
        if job is not None and job.status != "succeeded":
            job.status, job.error = (
                "failed",
                "Something went wrong while saving the edit — try again.",
            )
            db.commit()
    finally:
        if edit.get("own_voice"):  # their recording and its pieces: not kept
            shutil.rmtree(Path(edit["own_voice"]).parent, ignore_errors=True)
        _stopped.discard(job_id)
        _progress.pop(job_id, None)
        db.close()
