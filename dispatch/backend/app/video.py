"""In-portal media generation for the AI agent.

Video (``POST /ai/video`` + poll ``GET /ai/video/{id}``) is async: ``start_job``
kicks off a render, the frontend polls until ``succeeded``, and the MP4 is saved
as a ``Video`` row. Image (``POST /ai/image``) is synchronous. Both land as a
``Video`` row (``source="ai"``) ready to drop onto a post, and record a
``GenerationJob``.

Providers:
  - video: ``VIDEO_PROVIDER`` = ``azure_sora`` | ``gemini_veo``
  - image: ``IMAGE_PROVIDER`` = ``azure_openai`` (gpt-image-1 / dall-e-3) | ``gemini_imagen``

If a provider is not configured its endpoint returns 503 and the UI falls back
to "bring your own file".
"""

from __future__ import annotations

import base64
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.media import read_media, store_blob
from app.models import Brand, GenerationJob, Video
from app.tenancy import current_workspace_id, owned

router = APIRouter(prefix="/ai", tags=["AI"])

# aspect ratio -> (width, height) for the Video row's `resolution` field.
_DIMS = {
    "9:16": (720, 1280),
    "16:9": (1280, 720),
    "1:1": (720, 720),
}


class VideoGenError(RuntimeError):
    pass


def _explain(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error", {})
        if isinstance(err, dict):
            return err.get("message") or err.get("code") or resp.text[:300]
        return str(err)[:300]
    except ValueError:
        return resp.text[:300] or f"HTTP {resp.status_code}"


# ── Azure OpenAI Sora ────────────────────────────────────────────────────
def _azure_conf():
    s = get_settings()
    if not s.video_api_key or not s.video_endpoint:
        raise VideoGenError("Azure video is not configured (endpoint / key missing).")
    return (
        s.video_endpoint.rstrip("/"),
        s.video_api_key,
        s.azure_openai_video_deployment,
        s.azure_openai_video_api_version,
    )


def _azure_headers(key: str) -> dict:
    return {"api-key": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _azure_start(prompt: str, aspect_ratio: str, seconds: int) -> str:
    base, key, deployment, api_version = _azure_conf()
    width, height = _DIMS.get(aspect_ratio, _DIMS["9:16"])
    body = {
        "model": deployment,
        "prompt": prompt,
        "width": width,
        "height": height,
        "n_seconds": seconds,
        "n_variants": 1,
    }
    url = f"{base}/video/generations/jobs?api-version={api_version}"
    try:
        resp = httpx.post(url, headers=_azure_headers(key), json=body, timeout=60.0)
    except httpx.HTTPError as exc:
        raise VideoGenError(f"Could not reach the video service: {exc}") from exc
    if resp.status_code >= 400:
        raise VideoGenError(f"Video service rejected the request: {_explain(resp)}")
    job_id = resp.json().get("id")
    if not job_id:
        raise VideoGenError("Video service did not return a job id.")
    return job_id


def _azure_poll(provider_job_id: str) -> dict:
    base, key, _dep, api_version = _azure_conf()
    url = f"{base}/video/generations/jobs/{provider_job_id}?api-version={api_version}"
    try:
        resp = httpx.get(url, headers=_azure_headers(key), timeout=30.0)
    except httpx.HTTPError as exc:
        raise VideoGenError(f"Could not reach the video service: {exc}") from exc
    if resp.status_code >= 400:
        raise VideoGenError(f"Video service error: {_explain(resp)}")
    data = resp.json()
    raw = (data.get("status") or "").lower()
    generations = data.get("generations") or []
    gen_id = generations[0].get("id") if generations else None
    if raw == "succeeded":
        if not gen_id:
            return {"status": "failed", "ref": None, "error": "Render returned no video."}
        return {"status": "succeeded", "ref": gen_id, "error": None,
                "usage": _usage(data.get("usage"))}
    if raw in {"failed", "cancelled"}:
        return {"status": "failed", "ref": None,
                "error": data.get("failure_reason") or f"Render {raw}."}
    if raw in {"running", "processing", "preprocessing"}:
        return {"status": "running", "ref": None, "error": None}
    return {"status": "queued", "ref": None, "error": None}


def _azure_fetch(ref: str) -> bytes:
    base, key, _dep, api_version = _azure_conf()
    url = f"{base}/video/generations/{ref}/content/video?api-version={api_version}"
    try:
        resp = httpx.get(url, headers={"api-key": key, "Authorization": f"Bearer {key}"},
                         timeout=180.0)
    except httpx.HTTPError as exc:
        raise VideoGenError(f"Could not download the video: {exc}") from exc
    if resp.status_code >= 400:
        raise VideoGenError(f"Could not download the video: {_explain(resp)}")
    return resp.content


# ── Google Gemini API (Veo) ──────────────────────────────────────────────
_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


def _gemini_key() -> str:
    key = get_settings().gemini_api_key
    if not key:
        raise VideoGenError("Gemini video is not configured (GEMINI_API_KEY missing).")
    return key


def _gemini_start(prompt: str, aspect_ratio: str, seconds: int) -> str:
    key = _gemini_key()
    model = get_settings().gemini_video_model
    ratio = aspect_ratio if aspect_ratio in {"16:9", "9:16"} else "9:16"
    body = {
        "instances": [{"prompt": prompt}],
        "parameters": {"aspectRatio": ratio, "personGeneration": "allow_adult"},
    }
    url = f"{_GEMINI_BASE}/models/{model}:predictLongRunning"
    try:
        resp = httpx.post(url, headers={"x-goog-api-key": key}, json=body, timeout=60.0)
    except httpx.HTTPError as exc:
        raise VideoGenError(f"Could not reach the video service: {exc}") from exc
    if resp.status_code >= 400:
        raise VideoGenError(f"Video service rejected the request: {_explain(resp)}")
    name = resp.json().get("name")
    if not name:
        raise VideoGenError("Video service did not return an operation name.")
    return name


def _gemini_video_uri(response: dict) -> str | None:
    gvr = response.get("generateVideoResponse") or response
    samples = (
        gvr.get("generatedSamples")
        or gvr.get("samples")
        or gvr.get("videos")
        or []
    )
    if not samples:
        return None
    first = samples[0]
    video = first.get("video") or first
    return video.get("uri") or video.get("videoUri")


def _gemini_poll(provider_job_id: str) -> dict:
    key = _gemini_key()
    url = f"{_GEMINI_BASE}/{provider_job_id}"
    try:
        resp = httpx.get(url, headers={"x-goog-api-key": key}, timeout=30.0)
    except httpx.HTTPError as exc:
        raise VideoGenError(f"Could not reach the video service: {exc}") from exc
    if resp.status_code >= 400:
        raise VideoGenError(f"Video service error: {_explain(resp)}")
    data = resp.json()
    if not data.get("done"):
        return {"status": "running", "ref": None, "error": None}
    if data.get("error"):
        err = data["error"]
        msg = err.get("message") if isinstance(err, dict) else str(err)
        return {"status": "failed", "ref": None, "error": msg or "Render failed."}
    uri = _gemini_video_uri(data.get("response") or {})
    if not uri:
        return {"status": "failed", "ref": None, "error": "Render returned no video."}
    resp_obj = data.get("response") or {}
    meta = resp_obj.get("usageMetadata") or (
        resp_obj.get("generateVideoResponse") or {}
    ).get("usageMetadata")
    return {"status": "succeeded", "ref": uri, "error": None, "usage": _usage(meta)}


def _gemini_fetch(ref: str) -> bytes:
    key = _gemini_key()
    try:
        resp = httpx.get(ref, headers={"x-goog-api-key": key}, timeout=180.0,
                         follow_redirects=True)
    except httpx.HTTPError as exc:
        raise VideoGenError(f"Could not download the video: {exc}") from exc
    if resp.status_code >= 400:
        raise VideoGenError(f"Could not download the video: {_explain(resp)}")
    return resp.content


# ── provider dispatch ────────────────────────────────────────────────────
_PROVIDERS = {
    "azure_sora": (_azure_start, _azure_poll, _azure_fetch),
    "gemini_veo": (_gemini_start, _gemini_poll, _gemini_fetch),
}


def _provider():
    s = get_settings()
    if not s.video_generation_enabled:
        raise VideoGenError("Video generation is turned off (VIDEO_GENERATION_ENABLED=false).")
    impl = _PROVIDERS.get(s.video_provider)
    if impl is None:
        raise VideoGenError(f"Unknown VIDEO_PROVIDER '{s.video_provider}'.")
    return s.video_provider, impl


def start_job(prompt: str, aspect_ratio: str, seconds: int) -> tuple[str, str]:
    name, (start, _poll, _fetch) = _provider()
    return name, start(prompt, aspect_ratio, seconds)


def _impl_for(provider: str):
    impl = _PROVIDERS.get(provider)
    if impl is None:
        raise VideoGenError(f"This job used provider '{provider}', which is not available.")
    return impl


def poll_job(provider: str, provider_job_id: str) -> dict:
    return _impl_for(provider)[1](provider_job_id)


def fetch_video(provider: str, ref: str) -> bytes:
    return _impl_for(provider)[2](ref)


# ── image generation (synchronous) ───────────────────────────────────────
# gpt-image only supports 1:1 / 2:3 / 3:2, so "9:16" and "16:9" render as the
# nearest portrait / landscape.
_IMG_SIZES = {"1:1": "1024x1024", "9:16": "1024x1536", "16:9": "1536x1024"}
_IMG_DIMS = {"1:1": (1024, 1024), "9:16": (1024, 1536), "16:9": (1536, 1024)}


def _post_with_retry(url: str, headers: dict, tries: int = 3, **kw) -> httpx.Response:
    """POST that waits out a 429 (low-tier image quotas rate-limit hard).

    Pass ``json=`` for a JSON body or ``data=``/``files=`` for multipart.
    """
    for attempt in range(max(1, tries)):
        try:
            resp = httpx.post(url, headers=headers, timeout=180.0, **kw)
        except httpx.HTTPError as exc:
            raise VideoGenError(f"Could not reach the image service: {exc}") from exc
        if resp.status_code != 429 or attempt == tries - 1:
            return resp
        wait = resp.headers.get("retry-after")
        time.sleep(min(float(wait) if wait else 6.0, 15.0))
    raise VideoGenError("Image service stayed rate-limited.")


def _usage(u: dict | None) -> dict:
    u = u or {}
    return {
        "input": u.get("input_tokens") or u.get("prompt_tokens") or 0,
        "output": u.get("output_tokens") or u.get("completion_tokens") or 0,
        "total": u.get("total_tokens") or 0,
    }


def _image_bytes(data: dict) -> bytes:
    item = (data.get("data") or [{}])[0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"])
    if item.get("url"):
        got = httpx.get(item["url"], timeout=120.0)
        got.raise_for_status()
        return got.content
    raise VideoGenError("Image service returned no image.")


def _azure_image(
    prompt: str, aspect_ratio: str, reference: bytes | None = None
) -> tuple[bytes, dict]:
    s = get_settings()
    # Uses the dedicated image resource if set, else falls back to the chat one.
    if not s.image_api_key or not s.image_endpoint:
        raise VideoGenError("Azure image is not configured (endpoint / key missing).")
    base = s.image_endpoint.rstrip("/")
    key = s.image_api_key
    deployment = s.azure_openai_image_deployment
    size = _IMG_SIZES.get(aspect_ratio, "1024x1024")
    auth = {"api-key": key, "Authorization": f"Bearer {key}"}

    if reference is not None:
        # Edit / build on the uploaded reference image.
        resp = _post_with_retry(
            f"{base}/images/edits",
            auth,
            data={"model": deployment, "prompt": prompt, "size": size, "n": "1"},
            files={"image": ("reference.png", reference, "image/png")},
        )
    else:
        resp = _post_with_retry(
            f"{base}/images/generations",
            _azure_headers(key),
            json={"model": deployment, "prompt": prompt, "size": size, "n": 1},
        )

    if resp.status_code >= 400:
        raise VideoGenError(f"Image service rejected the request: {_explain(resp)}")
    data = resp.json()
    return _image_bytes(data), _usage(data.get("usage"))


def _gemini_image(
    prompt: str, aspect_ratio: str, reference: bytes | None = None
) -> tuple[bytes, dict]:
    if reference is not None:
        raise VideoGenError("Reference images need IMAGE_PROVIDER=azure_openai.")
    key = _gemini_key()
    model = get_settings().gemini_image_model
    ratio = aspect_ratio if aspect_ratio in {"1:1", "9:16", "16:9", "3:4", "4:3"} else "1:1"
    body = {
        "instances": [{"prompt": prompt}],
        "parameters": {"sampleCount": 1, "aspectRatio": ratio},
    }
    url = f"{_GEMINI_BASE}/models/{model}:predict"
    try:
        resp = httpx.post(url, headers={"x-goog-api-key": key}, json=body, timeout=120.0)
    except httpx.HTTPError as exc:
        raise VideoGenError(f"Could not reach the image service: {exc}") from exc
    if resp.status_code >= 400:
        raise VideoGenError(f"Image service rejected the request: {_explain(resp)}")
    preds = resp.json().get("predictions") or []
    if not preds or not preds[0].get("bytesBase64Encoded"):
        raise VideoGenError("Image service returned no image.")
    return base64.b64decode(preds[0]["bytesBase64Encoded"]), _usage(None)


_IMAGE_PROVIDERS = {"azure_openai": _azure_image, "gemini_imagen": _gemini_image}


def generate_image(
    prompt: str, aspect_ratio: str, reference: bytes | None = None
) -> tuple[str, bytes, dict]:
    s = get_settings()
    if not s.image_generation_enabled:
        raise VideoGenError("Image generation is turned off (IMAGE_GENERATION_ENABLED=false).")
    impl = _IMAGE_PROVIDERS.get(s.image_provider)
    if impl is None:
        raise VideoGenError(f"Unknown IMAGE_PROVIDER '{s.image_provider}'.")
    blob, usage = impl(prompt, aspect_ratio, reference)
    return s.image_provider, blob, usage


# ── API ──────────────────────────────────────────────────────────────────
class VideoJobIn(BaseModel):
    prompt: str = Field(min_length=10)
    aspect_ratio: str = "9:16"
    seconds: int = 8
    brand_id: int | None = None


class VideoRef(BaseModel):
    id: int
    url: str
    filename: str


class VideoJobOut(BaseModel):
    id: int
    status: str
    error: str = ""
    aspect_ratio: str
    seconds: int
    prompt: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    video: VideoRef | None = None


def _out(job: GenerationJob, video: Video | None) -> VideoJobOut:
    return VideoJobOut(
        id=job.id,
        status=job.status,
        error=job.error or "",
        aspect_ratio=job.aspect_ratio,
        seconds=job.seconds,
        prompt=job.prompt,
        input_tokens=job.input_tokens or 0,
        output_tokens=job.output_tokens or 0,
        total_tokens=job.total_tokens or 0,
        video=VideoRef(id=video.id, url=video.url, filename=video.filename) if video else None,
    )


@router.post("/video", response_model=VideoJobOut, status_code=201)
def create_video(payload: VideoJobIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    if payload.brand_id is not None:
        owned(db, Brand, payload.brand_id, ws)
    s = get_settings()
    seconds = max(3, min(payload.seconds, s.video_max_seconds))
    ratio = payload.aspect_ratio if payload.aspect_ratio in _DIMS else "9:16"
    try:
        provider, provider_job_id = start_job(payload.prompt, ratio, seconds)
    except VideoGenError as exc:
        raise HTTPException(503, str(exc)) from exc

    job = GenerationJob(
        workspace_id=ws,
        brand_id=payload.brand_id,
        kind="video",
        prompt=payload.prompt,
        aspect_ratio=ratio,
        seconds=seconds,
        provider=provider,
        provider_job_id=provider_job_id,
        status="running",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _out(job, None)


@router.get("/video/{job_id}", response_model=VideoJobOut)
def get_video(job_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    job = owned(db, GenerationJob, job_id, ws, "Generation job")

    if job.status in {"succeeded", "failed"}:
        return _out(job, db.get(Video, job.video_id) if job.video_id else None)

    try:
        state = poll_job(job.provider, job.provider_job_id)
    except VideoGenError as exc:
        # Transient — keep the job open, report the reason.
        job.error = str(exc)
        db.commit()
        return _out(job, None)

    if state["status"] in {"queued", "running"}:
        if job.status != state["status"]:
            job.status = state["status"]
            db.commit()
        return _out(job, None)

    if state["status"] == "failed":
        job.status = "failed"
        job.error = state["error"] or "Render failed."
        db.commit()
        return _out(job, None)

    # succeeded → fetch bytes, store as a Video
    try:
        blob = fetch_video(job.provider, state["ref"])
    except VideoGenError as exc:
        job.error = str(exc)
        db.commit()
        return _out(job, None)

    url = store_blob(db, blob, ".mp4", "video/mp4")
    width, height = _DIMS.get(job.aspect_ratio, _DIMS["9:16"])
    video = Video(
        workspace_id=job.workspace_id,
        brand_id=job.brand_id,
        filename=f"ai-{job.id}.mp4",
        duration_seconds=job.seconds,
        resolution=f"{width}x{height}",
        size_bytes=len(blob),
        source="ai",
        tag="ai-video",
        url=url,
    )
    db.add(video)
    db.flush()
    usage = state.get("usage") or {}
    job.video_id = video.id
    job.status = "succeeded"
    job.error = ""
    job.input_tokens = usage.get("input", 0)
    job.output_tokens = usage.get("output", 0)
    job.total_tokens = usage.get("total", 0)
    db.commit()
    db.refresh(video)
    return _out(job, video)


class ImageIn(BaseModel):
    prompt: str = Field(min_length=10)
    aspect_ratio: str = "1:1"
    brand_id: int | None = None
    # A "/media/..." url the user already uploaded — the model edits / builds on it.
    reference_url: str = ""


@router.post("/image", response_model=VideoJobOut, status_code=201)
def create_image(payload: ImageIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Generate an image synchronously and store it as a Video row (kind=image)."""
    if payload.brand_id is not None:
        owned(db, Brand, payload.brand_id, ws)
    ratio = payload.aspect_ratio if payload.aspect_ratio in _DIMS else "1:1"

    reference: bytes | None = None
    if payload.reference_url:
        reference = read_media(payload.reference_url)
        if reference is None:
            raise HTTPException(400, "Reference image not found.")

    try:
        provider, blob, usage = generate_image(payload.prompt, ratio, reference)
    except VideoGenError as exc:
        raise HTTPException(503, str(exc)) from exc

    url = store_blob(db, blob, ".png", "image/png")
    width, height = _IMG_DIMS.get(ratio, _IMG_DIMS["1:1"])

    job = GenerationJob(
        workspace_id=ws,
        brand_id=payload.brand_id,
        kind="image",
        prompt=payload.prompt,
        aspect_ratio=ratio,
        seconds=0,
        provider=provider,
        status="succeeded",
        input_tokens=usage["input"],
        output_tokens=usage["output"],
        total_tokens=usage["total"],
    )
    db.add(job)
    db.flush()
    video = Video(
        workspace_id=ws,
        brand_id=payload.brand_id,
        filename=f"ai-{job.id}.png",
        resolution=f"{width}x{height}",
        size_bytes=len(blob),
        source="ai",
        tag="ai-image",
        url=url,
    )
    db.add(video)
    db.flush()
    job.video_id = video.id
    db.commit()
    db.refresh(video)
    return _out(job, video)
