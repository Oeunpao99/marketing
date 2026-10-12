"""Motion videos — animated text over the brand's photos, rendered with
Remotion (the project in ``dispatch/motion``). Different from the AI-filmed
videos (app/video.py, app/story.py): nothing is "filmed"; the words are typeset
with a real Khmer font and animated, so Khmer is always spelled right and a
video costs one small AI text call, not seconds of video generation.

    POST /ai/motion          brief → job (background): AI script → render → Library
    GET  /ai/motion/status   can this server render? (needs Node + dispatch/motion)
    GET  /ai/video/{id}      the page polls the job like any other generation

Rendering needs Node and the motion project's node_modules next to the backend
— true on a dev machine; the production image doesn't have them yet, so there
the status says so instead of failing half-way.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import billing
from app.config import get_settings
from app.database import SessionLocal, get_db
from app.khmer_words import ZWSP, breaks
from app.media import read_media, store_blob
from app.models import Brand, BrandAsset, GenerationJob, Product, TeamMember, Video
from app.poster import accent_for
from app.tenancy import current_workspace_id, get_current_user, owned

log = logging.getLogger("app.motion")

router = APIRouter(prefix="/ai/motion", tags=["AI"])

MOTION_DIR = Path(__file__).resolve().parents[2] / "motion"
# Scene lengths — the same as motion/src/MotionPost.jsx (SECONDS, TRANSITION).
SECONDS = {"hook": 3.6, "point": 3.4, "cta": 3.8}
TRANSITION_S = 14 / 30
_render_lock = threading.Lock()  # one render at a time — each uses a whole browser


# ── can this server render? ───────────────────────────────────────────────
def _npx() -> str | None:
    return shutil.which("npx")


def not_ready() -> str:
    """Why this server can't render motion videos — "" when it can."""
    if not (MOTION_DIR / "src" / "MotionPost.jsx").exists():
        return "The motion video project (dispatch/motion) isn't on this server."
    if not (MOTION_DIR / "node_modules" / "remotion").exists():
        return "The motion video project isn't installed — run `npm install` in dispatch/motion."
    if not _npx():
        return "Node.js isn't installed on this server."
    return ""


@router.get("/status")
def motion_status():
    reason = not_ready()
    return {"ready": not reason, "reason": reason}


# ── the script ────────────────────────────────────────────────────────────
SCRIPT_PROMPT = (
    "You write the script for a short vertical MOTION VIDEO for a small business in "
    "Cambodia: animated words over the brand's photos, about 15 seconds, no actors. "
    "It has five scenes: a hook, three points, and a closing call to action. Return "
    "ONLY a JSON object:\n"
    '{"hook": "...", "points": [{"title": "...", "text": "...", "icon": "🌿"}, x3], '
    '"cta": {"text": "...", "button": "..."}}\n'
    "- hook: one line that stops the scroll — a question or a bold, specific claim. "
    "At most 12 words.\n"
    "- points: exactly 3. title = the point itself in 2-6 words; text = one short "
    "line that backs it up, at most 12 words; icon = ONE emoji that pictures it.\n"
    "- cta: text = what to do and why now, at most 10 words; button = 2-4 words "
    "(e.g. send us a message, order now).\n"
    "- Write in the LANGUAGE given. Khmer: natural, everyday Khmer as Cambodians "
    "write on Facebook, correct spelling, keep brand and product names as written; "
    "numbers may stay as digits.\n"
    "- The brief may be a long prompt written for a filmed video (camera, actors, "
    "lighting, wardrobe) — ignore all of that and keep only its topic and message.\n"
    "- Only claims the product information supports — never invent prices, "
    "discounts or facts. No hashtags, no markdown, no quotes around lines."
)


def _km_words(text: str) -> str:
    """Khmer with zero-width spaces between words — the template animates word
    by word and wraps lines only there."""
    out, prev = [], 0
    for i in sorted(breaks(text)):
        out.append(text[prev:i])
        prev = i
    out.append(text[prev:])
    return ZWSP.join(p for p in out if p)


def _line(value, n: int) -> str:
    return " ".join(str(value or "").replace("*", "").split())[:n]


def write_script(brand: Brand, products: list[Product], idea: str, language: str) -> dict:
    """One AI text call → {hook, points[3], cta}. Raises ContentAIError."""
    from app.content_ai import ContentAIError, _chat, _fix_khmer_punctuation

    cfg = get_settings()
    khmer = "khmer" in language.lower()
    facts = "\n".join(
        f"- {p.name}: {p.description or ''}" + (f" | highlights: {p.highlights}" if p.highlights else "")
        for p in products
    ) or "(no product details — keep it about the brand, no specific claims)"
    raw = _chat(
        [
            {"role": "system", "content": SCRIPT_PROMPT},
            {
                "role": "user",
                "content": f"BRAND: {brand.name}\nLANGUAGE: {language}\nPRODUCTS:\n{facts}\n\nTHE VIDEO IS ABOUT: {idea.strip()[:4000]}",
            },
        ],
        (cfg.azure_openai_khmer_deployment if khmer else "") or cfg.azure_openai_deployment,
        max_tokens=6000,
    )
    points = [p for p in (raw.get("points") or []) if isinstance(p, dict)][:3]
    cta = raw.get("cta") if isinstance(raw.get("cta"), dict) else {}
    script = {
        "hook": _line(raw.get("hook"), 160),
        "points": [
            {"title": _line(p.get("title"), 80), "text": _line(p.get("text"), 140), "icon": _line(p.get("icon"), 4) or "✓"}
            for p in points
            if _line(p.get("title"), 80)
        ],
        "cta": {"text": _line(cta.get("text"), 140), "button": _line(cta.get("button"), 40)},
    }
    if not script["hook"] or len(script["points"]) < 2 or not script["cta"]["text"]:
        raise ContentAIError("The AI didn't return a usable script — try again.")
    if khmer:
        fix = _fix_khmer_punctuation
        script["hook"] = fix(script["hook"])
        for p in script["points"]:
            p["title"], p["text"] = fix(p["title"]), fix(p["text"])
        script["cta"] = {k: fix(v) for k, v in script["cta"].items()}
    return script


# ── pictures (embedded, so the render needs no network) ───────────────────
def _data_uri(blob: bytes, max_side: int, keep_alpha: bool = False) -> str | None:
    try:
        im = Image.open(io.BytesIO(blob))
        im.thumbnail((max_side, max_side))
        out = io.BytesIO()
        if keep_alpha:
            im.convert("RGBA").save(out, "PNG", optimize=True)
            return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()
        im.convert("RGB").save(out, "JPEG", quality=88)
        return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
    except Exception:  # noqa: BLE001 — an unreadable upload is just left out
        return None


def _brand_pictures(db: Session, brand_id: int, product_id: int | None) -> tuple[list[str], str | None]:
    """The brand kit's product photos (the chosen product's first) and logo."""
    assets = db.scalars(
        select(BrandAsset).where(BrandAsset.brand_id == brand_id, BrandAsset.kind.in_(("product", "logo")))
    ).all()
    photos = sorted(
        (a for a in assets if a.kind == "product"), key=lambda a: (a.product_id != product_id, -a.id)
    )[:4]
    pics = [u for u in (_data_uri(read_media(a.url) or b"", 1280) for a in photos) if u]
    logo = next((a for a in assets if a.kind == "logo"), None)
    logo_uri = _data_uri(read_media(logo.url) or b"", 512, keep_alpha=True) if logo else None
    return pics, logo_uri


def build_props(brand: Brand, script: dict, pics: list[str], logo: str | None, khmer: bool) -> dict:
    """The template's input (motion/sample.json shape)."""
    t = _km_words if khmer else (lambda s: s)
    r, g, b = accent_for(brand.slug)
    scenes = [{"type": "hook", "text": t(script["hook"]), "image": pics[0] if pics else None}]
    for n, p in enumerate(script["points"]):
        scenes.append(
            {
                "type": "point",
                "title": t(p["title"]),
                "text": t(p["text"]),
                "icon": p["icon"],
                "image": pics[n + 1] if len(pics) > n + 1 else None,
            }
        )
    scenes.append(
        {"type": "cta", "text": t(script["cta"]["text"]), "button": t(script["cta"]["button"]), "image": pics[0] if pics else None}
    )
    return {"brand": {"name": brand.name, "color": f"#{r:02x}{g:02x}{b:02x}", "logo": logo}, "scenes": scenes}


def length_of(props: dict) -> int:
    scenes = props["scenes"]
    return round(sum(SECONDS[s["type"]] for s in scenes) - TRANSITION_S * (len(scenes) - 1))


def render(props: dict) -> bytes:
    """The MP4 for ``props`` — Remotion, run as a subprocess. Raises RuntimeError."""
    reason = not_ready()
    if reason:
        raise RuntimeError(reason)
    with _render_lock, tempfile.TemporaryDirectory() as tmp:
        props_path = Path(tmp) / "props.json"
        out = Path(tmp) / "motion.mp4"
        props_path.write_text(json.dumps(props, ensure_ascii=False), encoding="utf-8")
        res = subprocess.run(
            [_npx(), "remotion", "render", "src/index.jsx", "MotionPost", str(out), f"--props={props_path}", "--log=error"],
            cwd=MOTION_DIR,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=900,
        )
        if res.returncode != 0 or not out.exists():
            log.error("motion render failed: %s", (res.stderr or res.stdout)[-1500:])
            raise RuntimeError("The video couldn't be rendered — try again.")
        return out.read_bytes()


# ── API ───────────────────────────────────────────────────────────────────
class MotionIn(BaseModel):
    brand_id: int
    # Long prompts are fine (e.g. one written for a filmed video) — the AI
    # reads the topic out of the first part of it.
    idea: str = Field(min_length=3, max_length=20000)
    product_id: int | None = None
    language: str = "Khmer"


@router.post("", status_code=201)
def create_motion(
    payload: MotionIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Start a motion video; the page polls GET /ai/video/{id}."""
    from app.video import _out

    reason = not_ready()
    if reason:
        raise HTTPException(503, f"Motion videos aren't set up on this server yet. {reason}")
    owned(db, Brand, payload.brand_id, ws)
    if payload.product_id is not None:
        owned(db, Product, payload.product_id, ws)
    billing.require(ws, 0.0, db)
    job = GenerationJob(
        workspace_id=ws,
        user_id=user.id,
        brand_id=payload.brand_id,
        kind="motion",
        prompt=payload.idea.strip(),
        aspect_ratio="9:16",
        seconds=0,
        provider="remotion",
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    threading.Thread(
        target=_make, args=(job.id, payload.product_id, payload.language), daemon=True, name=f"motion-{job.id}"
    ).start()
    return _out(job, None)


def _make(job_id: int, product_id: int | None, language: str) -> None:
    from app.content_ai import ContentAIError
    from app.video import _ready_push

    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        billing.bind(job.workspace_id, job.user_id)  # the script is an AI call
        job.status = "running"
        db.commit()
        brand = db.get(Brand, job.brand_id)
        products = db.scalars(select(Product).where(Product.brand_id == brand.id).order_by(Product.name)).all()
        if product_id is not None:
            products = [p for p in products if p.id == product_id] or products
        try:
            script = write_script(brand, list(products), job.prompt, language)
            pics, logo = _brand_pictures(db, brand.id, product_id)
            props = build_props(brand, script, pics, logo, "khmer" in language.lower())
            db.rollback()  # no transaction held open through the render
            blob = render(props)
        except (ContentAIError, RuntimeError, subprocess.TimeoutExpired) as exc:
            job = db.get(GenerationJob, job_id)
            job.status = "failed"
            job.error = str(exc) if not isinstance(exc, subprocess.TimeoutExpired) else "Rendering took too long — try again."
            db.commit()
            _ready_push(job)
            return

        job = db.get(GenerationJob, job_id)
        seconds = length_of(props)
        url = store_blob(db, blob, ".mp4", "video/mp4")
        video = Video(
            workspace_id=job.workspace_id,
            brand_id=job.brand_id,
            filename=f"motion-{job.id}.mp4",
            duration_seconds=seconds,
            resolution="1080x1920",
            size_bytes=len(blob),
            source="ai",
            tag="ai-motion",
            url=url,
        )
        db.add(video)
        db.flush()
        # The Library's "How it was made" shows the brief and the script.
        lines = [script["hook"], *(f"{p['title']} — {p['text']}" for p in script["points"]), script["cta"]["text"]]
        job.prompt = f"{job.prompt}\n\nMOTION SCRIPT:\n" + "\n".join(f"- {ln}" for ln in lines)
        job.video_id = video.id
        job.seconds = seconds
        job.status = "succeeded"
        job.error = ""
        db.commit()
        _ready_push(job)
        from app.media_caption import write_in_background

        write_in_background(video.id, job.prompt)
    except Exception:  # noqa: BLE001 — the page must stop waiting either way
        log.exception("motion video %s crashed", job_id)
        db.rollback()
        job = db.get(GenerationJob, job_id)
        if job is not None and job.status != "succeeded":
            job.status, job.error = "failed", "Something went wrong while making the video — try again."
            db.commit()
    finally:
        db.close()
