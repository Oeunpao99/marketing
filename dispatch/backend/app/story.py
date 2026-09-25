"""Longer videos (15-60s), made scene by scene — "Video story".

The video model only renders 4 / 8 / 12-second clips, so a 30 or 60-second
promo is a storyboard: the AI writes N scenes (visual, voiceover line,
on-screen text) plus one shared look, the person edits and approves it, each
scene renders as its own clip, they preview and redo any scene, then approve
joining them into one MP4 (ffmpeg, from the imageio-ffmpeg package).

- Script: ``POST /ai/story`` (one chat call, counts against the advisor's
  daily AI quota).
- Clips: ``POST /ai/story/{id}/render``. Each scene becomes a GenerationJob of
  kind "scene" — app/video.py's worker polls and downloads it like any video,
  and calls ``tick_stories`` every tick, which starts the next waiting scenes
  (at most MAX_PARALLEL per story at a time) and notices when all are done.
  Scene clips are kept out of the Library (they're parts, not posts).
- Join: ``POST /ai/story/{id}/combine`` → a Video + a GenerationJob of kind
  "video" so the finished film shows in the Library and can go on a post.

Voiceover: Sora 2 makes its own sound, so each scene's line goes into that
clip's prompt. On-screen text is only asked for in Latin script — video models
can't draw Khmer letters reliably.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
import threading
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.advisor import _take_quota
from app.config import get_settings
from app.content_ai import ContentAIError, _chat, _fix_khmer_punctuation, _product_facts
from app.database import SessionLocal, get_db
from app.media import read_media, store_blob
from app.models import Brand, GenerationJob, Product, TeamMember, Video, VideoStory
from app.tenancy import current_workspace_id, get_current_user, owned
from app.video import _DIMS, VideoGenError, advance_video, start_job

log = logging.getLogger("app.story")

router = APIRouter(prefix="/ai/story", tags=["AI"])

MAX_PARALLEL = 2  # clips rendering at once per story
MAX_SECONDS = 64  # 8 scenes × 8s
_COMBINE_STALE = timedelta(minutes=20)  # ffmpeg itself times out at 10
SCENE_LENGTHS = (4, 8, 12)
# Roughly what a narrator says comfortably in a clip, leaving a breath at the end.
_WORDS_PER_SECOND = 2.2
_KHMER = re.compile(r"[ក-៿]")
_BUSY = re.compile(r"429|rate|limit|concurren|quota|too many|busy", re.I)

SCRIPT_PROMPT = """You are a creative director writing a short promotional video storyboard for social media.
The video is made of separate AI-generated clips (one per scene) that are joined in order, so:
- Every scene is ONE continuous shot that works on its own — no cuts inside a scene.
- A viewer must feel it is one film: the same people (describe them the same way), setting, colour
  palette, lighting and camera style throughout. Put all of that in "style" — it is added to every
  scene's prompt.
- Story arc across the scenes: hook/problem → the product → how it helps (real product facts only)
  → proof/result → clear call to action in the last scene.
- "visual": what the camera sees and does in this shot, concrete and filmable (subject, action,
  setting, camera movement, mood). Mention the brand/product visually where natural. No text,
  logos or UI screenshots in the visual itself.
- "voiceover": what the narrator says during this scene, in the requested language — at most the
  given number of words so it fits the scene's length. "" if no voiceover was asked for.
- "on_screen": REQUIRED in every scene, never empty — a 2-6 word caption shown on screen, in
  English/Latin letters only (even when the voiceover is in another language). Short and punchy, and
  it follows the arc: the hook/problem ("Drowning in tasks?"), the product name, the key benefit, the
  proof, then the call to action in the last scene ("Try it free today"). Don't just repeat the
  voiceover word for word.
- Never invent product features, prices, numbers or claims that aren't in the product info.

Reply as JSON: {"title": "<short title>", "style": "<one paragraph: characters, setting, palette,
lighting, camera style, overall mood>", "scenes": [{"visual": "...", "voiceover": "...",
"on_screen": "..."}]} with exactly the requested number of scenes."""


def _key() -> str:
    return uuid.uuid4().hex[:8]


def _word_budget(seconds: int) -> int:
    return max(4, int(seconds * _WORDS_PER_SECOND) - 2)


def scene_prompt(story: VideoStory, n: int, scenes: list[dict] | None = None) -> str:
    """The full prompt one scene's clip is rendered from."""
    scenes = scenes if scenes is not None else story.scenes
    scene = scenes[n]
    lines = [
        f"STYLE (same across the whole video): {story.style}".strip(),
        f"\nSCENE {n + 1} of {len(scenes)} — one continuous {scene['seconds']}-second shot, "
        f"{'vertical 9:16' if story.aspect_ratio == '9:16' else 'horizontal 16:9'}: {scene['visual']}",
    ]
    if story.language and scene.get("voiceover", "").strip():
        lines.append(
            f'\nAUDIO: a warm, confident narrator voiceover says, in {story.language}: "{scene["voiceover"].strip()}". '
            "Clear, natural speech at a relaxed pace, soft background music underneath, no other dialogue."
        )
    else:
        lines.append("\nAUDIO: soft, upbeat background music and natural ambient sound; no speech.")
    text = (scene.get("on_screen") or "").strip()
    if text and not _KHMER.search(text):
        lines.append(f'\nON-SCREEN TEXT: clean, bold sans-serif text, large and easy to read, shows: "{text}".')
    else:
        lines.append("\nNo text, captions, subtitles, logos or watermarks in the frame.")
    lines.append(
        "\nKeep the same characters, setting, colour palette, lighting and camera style as the rest of the video. "
        "Photorealistic, cinematic, high quality."
    )
    return "\n".join(lines)


def _split(total: int, scene_seconds: int) -> list[int]:
    """Whole scenes closest to ``total`` (30s at 8s a scene → 4 × 8 = 32s)."""
    n = max(1, min(round(total / scene_seconds), MAX_SECONDS // scene_seconds))
    return [scene_seconds] * n


# ── the story API ─────────────────────────────────────────────────────────
class StoryIn(BaseModel):
    idea: str = Field(min_length=3, max_length=10000)
    brand_id: int | None = None
    product_ids: list[int] = Field(default_factory=list)
    total_seconds: int = Field(default=32, ge=4, le=MAX_SECONDS)
    scene_seconds: int = 8
    aspect_ratio: str = "9:16"
    language: str = Field(default="English", max_length=40)  # "" = no voiceover


def _story_out(db: Session, story: VideoStory) -> dict:
    jobs = {
        j.id: j
        for j in db.scalars(
            select(GenerationJob).where(
                GenerationJob.id.in_([s["job_id"] for s in story.scenes if s.get("job_id")])
            )
        )
    }
    video_ids = [j.video_id for j in jobs.values() if j.video_id] + (
        [story.final_video_id] if story.final_video_id else []
    )
    urls = (
        dict(db.execute(select(Video.id, Video.url).where(Video.id.in_(video_ids))).all()) if video_ids else {}
    )
    start = 0
    scenes = []
    for s in story.scenes:
        job = jobs.get(s.get("job_id"))
        scenes.append(
            {
                **s,
                "starts_at": start,
                "video_url": urls.get(job.video_id) if job and job.video_id else None,
                "word_budget": _word_budget(s["seconds"]),
            }
        )
        start += s["seconds"]
    return {
        "id": story.id,
        "brand_id": story.brand_id,
        "title": story.title,
        "idea": story.idea,
        "style": story.style,
        "aspect_ratio": story.aspect_ratio,
        "language": story.language,
        "status": story.status,
        "error": story.error,
        "scenes": scenes,
        "total_seconds": start,
        "final_video": (
            {"id": story.final_video_id, "url": urls.get(story.final_video_id)} if story.final_video_id else None
        ),
        "created_at": story.created_at,
        "updated_at": story.updated_at,
    }


@router.get("")
def list_stories(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    stories = db.scalars(
        select(VideoStory).where(VideoStory.workspace_id == ws).order_by(VideoStory.updated_at.desc()).limit(30)
    ).all()
    return [
        {
            "id": s.id,
            "title": s.title or "Untitled video",
            "status": s.status,
            "scenes": len(s.scenes),
            "total_seconds": sum(x["seconds"] for x in s.scenes),
            "updated_at": s.updated_at,
        }
        for s in stories
    ]


@router.post("", status_code=201)
def create_story(
    payload: StoryIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Write the storyboard (no clips are made yet)."""
    brand = owned(db, Brand, payload.brand_id, ws) if payload.brand_id is not None else None
    if payload.scene_seconds not in SCENE_LENGTHS:
        raise HTTPException(422, "Scene length must be 4, 8 or 12 seconds.")
    lengths = _split(payload.total_seconds, payload.scene_seconds)
    q = select(Product).where(Product.brand_id == brand.id) if brand else None
    products = []
    if q is not None:
        if payload.product_ids:
            q = q.where(Product.id.in_(payload.product_ids))
        products = db.scalars(q.order_by(Product.name)).all()

    _take_quota(ws)
    language = payload.language.strip()
    brief = [
        f"Brand: {brand.name if brand else '(none)'}" + (f" — audience language: {brand.lang}" if brand and brand.lang else ""),
        f"Video idea from the user: {payload.idea.strip()}",
        f"Format: {'vertical 9:16 (Reels/TikTok)' if payload.aspect_ratio == '9:16' else 'horizontal 16:9'}",
        f"Number of scenes: {len(lengths)}",
        "Scene lengths and voiceover word limits: "
        + ", ".join(f"scene {i + 1}: {s}s / max {_word_budget(s)} words" for i, s in enumerate(lengths)),
        f"Voiceover language: {language}" if language else "No voiceover — leave every voiceover empty.",
        f"\nProduct info:\n{_product_facts(list(products))}",
    ]
    if brand and brand.voice_examples:
        brief.append(f"\nBrand voice (tone only):\n{brand.voice_examples.strip()[:1500]}")
    s = get_settings()
    khmer = bool(_KHMER.search(language)) or "khmer" in language.lower()
    model = (s.azure_openai_khmer_deployment if khmer else "") or s.azure_openai_deployment
    try:
        out = _chat(
            [{"role": "system", "content": SCRIPT_PROMPT}, {"role": "user", "content": "\n".join(brief)}],
            model,
            max_tokens=6000,
        )
    except ContentAIError as exc:
        raise HTTPException(503, str(exc)) from exc

    raw = [x for x in (out.get("scenes") or []) if isinstance(x, dict) and str(x.get("visual") or "").strip()]
    if not raw:
        raise HTTPException(502, "The AI returned no scenes — try again.")
    scenes = []
    for n, seconds in enumerate(lengths):
        # Fewer scenes than asked: the last one's visual carries on, silently.
        x = raw[n] if n < len(raw) else {"visual": raw[-1]["visual"]}
        voice = str(x.get("voiceover") or "").strip() if language else ""
        scenes.append(
            {
                "key": _key(),
                "seconds": seconds,
                "visual": str(x.get("visual")).strip(),
                "voiceover": _fix_khmer_punctuation(voice) if khmer else voice,
                "on_screen": str(x.get("on_screen") or "").strip()[:80],
                "job_id": None,
                "state": "draft",
                "error": "",
            }
        )
    story = VideoStory(
        workspace_id=ws,
        brand_id=brand.id if brand else None,
        user_id=user.id,
        title=str(out.get("title") or "Promo video").strip()[:200],
        idea=payload.idea.strip(),
        style=str(out.get("style") or "").strip(),
        aspect_ratio=payload.aspect_ratio if payload.aspect_ratio in ("9:16", "16:9") else "9:16",
        language=language,
        status="draft",
        scenes=scenes,
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return _story_out(db, story)


@router.get("/{story_id}")
def get_story(story_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    story = owned(db, VideoStory, story_id, ws, "Video")
    if story.status == "rendering":
        # Move clips along now rather than waiting for the worker's next tick.
        for s in story.scenes:
            if s.get("state") == "rendering" and s.get("job_id"):
                advance_video(db, s["job_id"])
        _advance(db, story.id)
        db.expire_all()
        story = db.get(VideoStory, story_id)
    return _story_out(db, story)


class SceneEdit(BaseModel):
    key: str
    visual: str | None = Field(default=None, max_length=6000)
    voiceover: str | None = Field(default=None, max_length=1000)
    on_screen: str | None = Field(default=None, max_length=80)


class StoryEdit(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    style: str | None = Field(default=None, max_length=6000)
    scenes: list[SceneEdit] = Field(default_factory=list)


def _apply(scene: dict, edit: SceneEdit) -> dict:
    scene = dict(scene)
    for field in ("visual", "voiceover", "on_screen"):
        value = getattr(edit, field)
        if value is not None:
            scene[field] = value.strip()
    return scene


@router.patch("/{story_id}")
def edit_story(
    story_id: int, payload: StoryEdit, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Edit the script before clips are made (title, look, any scene)."""
    owned(db, VideoStory, story_id, ws, "Video")
    story = db.scalar(select(VideoStory).where(VideoStory.id == story_id).with_for_update())
    if story.status != "draft":
        raise HTTPException(409, "The clips are already being made — redo a single scene instead.")
    if payload.title is not None and payload.title.strip():
        story.title = payload.title.strip()
    if payload.style is not None:
        story.style = payload.style.strip()
    edits = {e.key: e for e in payload.scenes}
    story.scenes = [_apply(s, edits[s["key"]]) if s["key"] in edits else s for s in story.scenes]
    db.commit()
    return _story_out(db, story)


@router.post("/{story_id}/render")
def render_story(story_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Approve the script: make every scene's clip (in the background)."""
    if not get_settings().video_generation_enabled:
        raise HTTPException(503, "Video generation is turned off.")
    owned(db, VideoStory, story_id, ws, "Video")
    story = db.scalar(select(VideoStory).where(VideoStory.id == story_id).with_for_update())
    if story.status != "draft":
        raise HTTPException(409, "These clips are already being made.")
    story.scenes = [{**s, "state": "pending", "job_id": None, "error": ""} for s in story.scenes]
    story.status = "rendering"
    db.commit()
    _advance(db, story.id)
    db.expire_all()
    return _story_out(db, db.get(VideoStory, story_id))


@router.post("/{story_id}/scenes/{key}/redo")
def redo_scene(
    story_id: int,
    key: str,
    payload: SceneEdit | None = None,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    """Make one scene again (optionally with an edited visual / voiceover / text)."""
    owned(db, VideoStory, story_id, ws, "Video")
    story = db.scalar(select(VideoStory).where(VideoStory.id == story_id).with_for_update())
    if story.status in ("draft", "combining"):
        raise HTTPException(409, "Not now — approve the script first, or wait for the join to finish.")
    scenes = []
    found = False
    for s in story.scenes:
        if s["key"] == key:
            if s.get("state") in ("pending", "rendering"):
                raise HTTPException(409, "This scene is already being made.")
            s = _apply(s, payload) if payload else dict(s)
            s.update(state="pending", job_id=None, error="")
            found = True
        scenes.append(s)
    if not found:
        raise HTTPException(404, "Scene not found.")
    story.scenes = scenes
    story.status = "rendering"
    story.final_video_id = None  # the joined video no longer matches the scenes
    db.commit()
    _advance(db, story.id)
    db.expire_all()
    return _story_out(db, db.get(VideoStory, story_id))


@router.post("/{story_id}/combine", status_code=202)
def combine_story(story_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Join the finished clips into one video (in the background)."""
    owned(db, VideoStory, story_id, ws, "Video")
    story = db.scalar(select(VideoStory).where(VideoStory.id == story_id).with_for_update())
    if story.status not in ("review", "done"):
        raise HTTPException(409, "Every scene has to be finished first.")
    if any(s.get("state") != "done" for s in story.scenes):
        raise HTTPException(409, "Some scenes failed — redo them first.")
    story.status = "combining"
    story.error = ""
    db.commit()
    threading.Thread(target=_combine, args=(story.id,), daemon=True, name=f"story-{story.id}").start()
    return _story_out(db, story)


@router.delete("/{story_id}", status_code=204)
def delete_story(story_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    story = owned(db, VideoStory, story_id, ws, "Video")
    if story.status in ("rendering", "combining"):
        raise HTTPException(409, "Wait for it to finish first.")
    db.delete(story)
    db.commit()


# ── scene rendering (driven by app/video.py's worker) ─────────────────────
def tick_stories(db: Session) -> None:
    # A join runs in a thread of the web process; if that process restarted
    # mid-join the story would sit in "combining" for good (redo and delete
    # refuse it), so hand it back for another try.
    stale = datetime.now(UTC) - _COMBINE_STALE
    stuck = db.scalars(
        select(VideoStory).where(VideoStory.status == "combining", VideoStory.updated_at < stale)
    ).all()
    for story in stuck:
        story.status = "review"
        story.error = "Joining the clips was interrupted — try again."
    if stuck:
        db.commit()
    for story_id in db.scalars(select(VideoStory.id).where(VideoStory.status == "rendering")).all():
        try:
            _advance(db, story_id)
        except Exception:  # noqa: BLE001 - one story mustn't stop the rest
            db.rollback()
            log.exception("advancing video story %s failed", story_id)


def _advance(db: Session, story_id: int) -> None:
    """Sync scenes with their clip jobs, start waiting scenes while there's
    room, and move the story to "review" once nothing is left to render."""
    story = db.execute(
        select(VideoStory).where(VideoStory.id == story_id).with_for_update(skip_locked=True)
    ).scalar_one_or_none()
    if story is None or story.status != "rendering":
        db.rollback()
        return
    scenes = [dict(s) for s in story.scenes]
    jobs = {
        j.id: j
        for j in db.scalars(
            select(GenerationJob).where(GenerationJob.id.in_([s["job_id"] for s in scenes if s.get("job_id")]))
        )
    }
    for s in scenes:
        job = jobs.get(s.get("job_id"))
        if s["state"] == "rendering" and job is not None:
            if job.status == "succeeded":
                s["state"], s["error"] = "done", ""
            elif job.status == "failed":
                s["state"], s["error"] = "failed", job.error or "The clip failed."

    in_flight = sum(1 for s in scenes if s["state"] == "rendering")
    for n, s in enumerate(scenes):
        if in_flight >= MAX_PARALLEL:
            break
        if s["state"] != "pending":
            continue
        prompt = scene_prompt(story, n, scenes)
        try:
            provider, provider_job_id = start_job(prompt, story.aspect_ratio, s["seconds"])
        except VideoGenError as exc:
            if _BUSY.search(str(exc)):
                break  # the video service is busy — try again next tick
            s["state"], s["error"] = "failed", str(exc)
            continue
        job = GenerationJob(
            workspace_id=story.workspace_id,
            user_id=story.user_id,
            brand_id=story.brand_id,
            kind="scene",
            prompt=prompt,
            aspect_ratio=story.aspect_ratio,
            seconds=s["seconds"],
            provider=provider,
            provider_job_id=provider_job_id,
            status="running",
        )
        db.add(job)
        db.flush()
        s["state"], s["job_id"], s["error"] = "rendering", job.id, ""
        in_flight += 1

    story.scenes = scenes
    flag_modified(story, "scenes")  # the scene dicts were edited in place
    finished = not any(s["state"] in ("pending", "rendering") for s in scenes)
    if finished:
        story.status = "review"
    db.commit()
    if finished:
        from app.push import notify_user

        failed = sum(1 for s in scenes if s["state"] == "failed")
        notify_user(
            story.user_id,
            "generated",
            "Your video scenes are ready ✨" if not failed else f"{failed} scene{'s' if failed != 1 else ''} couldn’t be made",
            f"{story.title} — review the scenes, then join them into one video."
            if not failed
            else f"{story.title} — redo the failed scene{'s' if failed != 1 else ''}, then join them.",
            f"/story?id={story.id}",
            f"story-{story.id}",
        )


# ── joining the clips ─────────────────────────────────────────────────────
def _ffmpeg() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def _probe(path: str) -> tuple[bool, float]:
    """(has an audio track, duration in seconds) for a clip."""
    res = subprocess.run([_ffmpeg(), "-hide_banner", "-i", path], capture_output=True, text=True, errors="replace")
    info = res.stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", info)
    duration = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0.0
    return bool(re.search(r"Stream #\S+.*Audio:", info)), duration


def join_clips(paths: list[str], out_path: str, width: int, height: int) -> None:
    """Concatenate clips into one H.264/AAC MP4 at width x height, 30fps.
    Clips without sound get silence so the joined file has one audio track."""
    args = [_ffmpeg(), "-hide_banner", "-y"]
    for p in paths:
        args += ["-i", p]
    audio_inputs = []
    extra = len(paths)
    for p in paths:
        has_audio, duration = _probe(p)
        if has_audio:
            audio_inputs.append(None)
        else:
            args += ["-f", "lavfi", "-t", f"{duration or 1:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
            audio_inputs.append(extra)
            extra += 1
    parts, pairs = [], []
    for i in range(len(paths)):
        parts.append(
            f"[{i}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v{i}]"
        )
        a = f"{i}:a" if audio_inputs[i] is None else f"{audio_inputs[i]}:a"
        parts.append(f"[{a}]aformat=sample_rates=48000:channel_layouts=stereo[a{i}]")
        pairs.append(f"[v{i}][a{i}]")
    parts.append(f"{''.join(pairs)}concat=n={len(paths)}:v=1:a=1[v][a]")
    args += [
        "-filter_complex", ";".join(parts),
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        out_path,
    ]  # fmt: skip
    res = subprocess.run(args, capture_output=True, text=True, errors="replace", timeout=600)
    if res.returncode != 0 or not os.path.exists(out_path):
        raise RuntimeError(res.stderr[-600:] or "ffmpeg failed")


def _combine(story_id: int) -> None:
    db = SessionLocal()
    try:
        story = db.get(VideoStory, story_id)
        jobs = {
            j.id: j
            for j in db.scalars(select(GenerationJob).where(GenerationJob.id.in_([s["job_id"] for s in story.scenes])))
        }
        with tempfile.TemporaryDirectory() as tmp:
            paths = []
            for n, s in enumerate(story.scenes):
                job = jobs.get(s["job_id"])
                video = db.get(Video, job.video_id) if job and job.video_id else None
                data = read_media(video.url) if video else None
                if not data:
                    raise RuntimeError(f"Scene {n + 1}'s clip is missing — redo that scene.")
                path = os.path.join(tmp, f"scene-{n}.mp4")
                with open(path, "wb") as f:
                    f.write(data)
                paths.append(path)
            width, height = _DIMS.get(story.aspect_ratio, _DIMS["9:16"])
            out = os.path.join(tmp, "final.mp4")
            join_clips(paths, out, width, height)
            with open(out, "rb") as f:
                blob = f.read()

        total = sum(s["seconds"] for s in story.scenes)
        url = store_blob(db, blob, ".mp4", "video/mp4")
        video = Video(
            workspace_id=story.workspace_id,
            brand_id=story.brand_id,
            filename=f"story-{story.id}.mp4",
            duration_seconds=total,
            resolution=f"{width}x{height}",
            size_bytes=len(blob),
            source="ai",
            tag="ai-video",
            url=url,
        )
        db.add(video)
        db.flush()
        script = "\n".join(
            f"Scene {n + 1} ({s['seconds']}s): {s['visual']}"
            + (f' — "{s["voiceover"]}"' if s.get("voiceover") else "")
            for n, s in enumerate(story.scenes)
        )
        db.add(
            GenerationJob(
                workspace_id=story.workspace_id,
                user_id=story.user_id,
                brand_id=story.brand_id,
                kind="video",
                prompt=f"{story.title} — {total}s video in {len(story.scenes)} scenes\n\n{script}",
                aspect_ratio=story.aspect_ratio,
                seconds=total,
                provider="story",
                status="succeeded",
                video_id=video.id,
            )
        )
        story.final_video_id = video.id
        story.status = "done"
        db.commit()
        from app.push import notify_user

        notify_user(story.user_id, "generated", "Your video is ready 🎬", f"{story.title} — {total}s", f"/story?id={story.id}", f"story-{story.id}")
    except Exception as exc:  # noqa: BLE001 - show it on the page
        db.rollback()
        log.exception("joining video story %s failed", story_id)
        story = db.get(VideoStory, story_id)
        if story is not None:
            story.status = "review"
            story.error = f"Couldn’t join the clips: {str(exc)[:300]}"
            db.commit()
    finally:
        db.close()
