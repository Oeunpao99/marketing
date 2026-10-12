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
# Story shapes the AI picks from — whichever tells this idea best. The points
# follow the shape; "mistakes" shows ✗ badges instead of numbers.
SHAPES = ("reasons", "problem_fix", "myth_fact", "steps", "before_after", "mistakes")

SCRIPT_PROMPT = (
    "You are the best short-form video copywriter in Cambodia. You write the words for a "
    "vertical MOTION VIDEO (TikTok / Facebook Reels): big animated text over the brand's "
    "photos, about 15 seconds, no actors, watched on a phone with the sound OFF — so every "
    "word on screen must work alone. Five scenes: a hook, three points, a closing call to "
    "action.\n"
    "\n"
    "STEP 1 — pick ONE story shape that tells this idea best:\n"
    "- reasons: 3 reasons / benefits, strongest last.\n"
    "- problem_fix: point 1 = the pain they live with, point 2 = what fixes it, point 3 = the result.\n"
    "- myth_fact: point 1 = what most people believe, points 2-3 = the truth and what it means.\n"
    "- steps: how to do it in 3 short steps, each starting with an action word.\n"
    "- before_after: point 1 = before, point 2 = the change, point 3 = after (a concrete result).\n"
    "- mistakes: 3 mistakes to avoid — each title IS the mistake, its line says what to do instead.\n"
    "\n"
    "THE HOOK (scene 1) decides if anyone keeps watching — the first second. Use one of:\n"
    "- a sharp question about their pain (\"Customers message at 2 a.m. — who answers?\")\n"
    "- a surprising, true number or fact\n"
    "- a stop sign (\"Stop doing X\") or a callout of who it's for (\"Online sellers:\")\n"
    "- a bold, specific promise of an outcome\n"
    "Never open with the brand name, a greeting, \"Welcome\", or a vague \"Did you know?\". "
    "At most 12 words.\n"
    "\n"
    "THE POINTS (scenes 2-4):\n"
    "- title = the point itself, 2-6 words, readable in one glance — parallel in form across "
    "the three (all start the same way, or all are short noun phrases).\n"
    "- text = one line that makes it concrete: a number, a time, money saved, a real moment, "
    "how it works. At most 12 words. Never repeat the title in other words.\n"
    "- They build: point 3 is the strongest.\n"
    "- icon = ONE emoji that literally pictures the point (🌿 natural, ⏱️ fast, 💬 replies).\n"
    "- product = the exact product name from the list the point is about, or \"\".\n"
    "\n"
    "THE CLOSE (scene 5): text pays off the hook's promise and says what to do now, at most "
    "10 words; button = the action in 2-4 words (send us a message, order now, comment "
    "\"YES\"). Urgency only if it's true — never invent discounts, stock or deadlines.\n"
    "\n"
    "LANGUAGE: write in the LANGUAGE given. Khmer: everyday spoken Khmer as Cambodian sellers "
    "write on Facebook — short common words, correct spelling, address the viewer as បង (never "
    "អ្នក), brand / product / app names in Latin exactly as written, digits are fine. "
    "English: plain, punchy, no jargon.\n"
    "\n"
    "FACTS: only what the product information supports — never invent prices, numbers, "
    "features or results. If there are no product details, keep it about the topic.\n"
    "The brief may be a long prompt written for a filmed video (camera, actors, lighting, "
    "wardrobe) — ignore all that and keep only its topic and message.\n"
    "\n"
    "VOICE-OVER: for every scene also write `say` — what a narrator says while that scene "
    "is on screen. One natural spoken sentence, 6-18 words, that ADDS to the words on "
    "screen (never just reads them out): warm and conversational, like a friendly seller "
    "talking to one customer. Numbers as people say them. The hook's say pulls them in; "
    "the close's say invites the action. Same language as the rest.\n"
    "\n"
    "Return ONLY a JSON object, no markdown, no hashtags, no quotes around lines:\n"
    '{"shape": "reasons", "hook": "...", "hook_say": "...", '
    '"points": [{"title": "...", "text": "...", "icon": "🌿", "product": "", "say": "..."}, x3], '
    '"cta": {"text": "...", "button": "...", "say": "..."}}'
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


def write_script(
    brand: Brand, products: list[Product], idea: str, language: str, learnings: str = ""
) -> dict:
    """The video's words: one AI call (the script), then for Khmer the same
    native-editor pass the captions get. Raises ContentAIError."""
    from app.content_ai import ContentAIError, _chat, _fix_khmer_punctuation, _polish_khmer

    cfg = get_settings()
    khmer = "khmer" in language.lower()
    model = (cfg.azure_openai_khmer_deployment if khmer else "") or cfg.azure_openai_deployment
    facts = "\n".join(
        f"- {p.name}: {p.description or ''}" + (f" | highlights: {p.highlights}" if p.highlights else "")
        for p in products
    ) or "(no product details — keep it about the topic, no specific claims)"
    extra = ""
    if (brand.voice_examples or "").strip():
        extra += (
            "\n\nTHE BRAND'S VOICE — its real posts, for tone and word choice only (never copy "
            "them):\n---\n" + brand.voice_examples.strip()[:2500] + "\n---"
        )
    if learnings.strip():
        extra += "\n\nWHAT HAS WORKED FOR THIS BRAND (from its own results):\n" + learnings.strip()[:1500]
    raw = _chat(
        [
            {"role": "system", "content": SCRIPT_PROMPT + extra},
            {
                "role": "user",
                "content": f"BRAND: {brand.name}\nLANGUAGE: {language}\nPRODUCTS:\n{facts}\n\nTHE VIDEO IS ABOUT: {idea.strip()[:4000]}",
            },
        ],
        model,
        max_tokens=8000,
    )
    names = {p.name.strip().lower(): p.name for p in products}
    points = [p for p in (raw.get("points") or []) if isinstance(p, dict)][:3]
    cta = raw.get("cta") if isinstance(raw.get("cta"), dict) else {}
    script = {
        "shape": raw.get("shape") if raw.get("shape") in SHAPES else "reasons",
        "hook": _line(raw.get("hook"), 160),
        "hook_say": _line(raw.get("hook_say"), 300),
        "points": [
            {
                "title": _line(p.get("title"), 80),
                "text": _line(p.get("text"), 140),
                "icon": _line(p.get("icon"), 4) or "✓",
                "product": names.get(_line(p.get("product"), 120).lower(), ""),
                "say": _line(p.get("say"), 300),
            }
            for p in points
            if _line(p.get("title"), 80)
        ],
        "cta": {
            "text": _line(cta.get("text"), 140),
            "button": _line(cta.get("button"), 40),
            "say": _line(cta.get("say"), 300),
        },
    }
    if not script["hook"] or len(script["points"]) < 2 or not script["cta"]["text"]:
        raise ContentAIError("The AI didn't return a usable script — try again.")
    if khmer:
        # Every line — on screen and spoken — through the native editor
        # (correct words, natural phrasing, names untouched), put back in place.
        slots = [(script, "hook", 160), (script, "hook_say", 300)]
        for p in script["points"]:
            slots += [(p, "title", 80), (p, "text", 140), (p, "say", 300)]
        slots += [(script["cta"], "text", 140), (script["cta"], "button", 40), (script["cta"], "say", 300)]
        slots = [s for s in slots if s[0][s[1]]]
        fixed = _polish_khmer(
            [obj[key] for obj, key, _ in slots],
            model,
            voice_examples=brand.voice_examples or "",
            khmer_only="english" not in (brand.lang or "").lower(),
            keep=[brand.name, *(p.name for p in products)],
        )
        for (obj, key, n), value in zip(slots, fixed):
            obj[key] = _line(_fix_khmer_punctuation(value), n)
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


def _brand_pictures(db: Session, brand_id: int) -> tuple[dict[int, str], list[str], str | None]:
    """The brand kit's product photos — by product id, and all of them newest
    first — and its logo, ready to embed."""
    assets = db.scalars(
        select(BrandAsset).where(BrandAsset.brand_id == brand_id, BrandAsset.kind.in_(("product", "logo")))
    ).all()
    by_product: dict[int, str] = {}
    order: list[str] = []
    for a in sorted((a for a in assets if a.kind == "product"), key=lambda a: -a.id)[:6]:
        uri = _data_uri(read_media(a.url) or b"", 1280)
        if uri:
            order.append(uri)
            if a.product_id is not None:
                by_product.setdefault(a.product_id, uri)
    logo = next((a for a in assets if a.kind == "logo"), None)
    logo_uri = _data_uri(read_media(logo.url) or b"", 512, keep_alpha=True) if logo else None
    return by_product, order, logo_uri


def pick_pictures(
    script: dict, products: list[Product], by_product: dict[int, str], order: list[str], product_id: int | None
) -> tuple[str | None, list[str | None]]:
    """(hook photo, one photo or None per point). The hook shows the chosen
    product (else the newest photo); each point the product it names — a point
    about no product, or the same photo as the scene before, gets its icon."""
    ids = {p.name: p.id for p in products}
    hook = by_product.get(product_id) if product_id is not None else None
    hook = hook or (order[0] if order else None)
    out, prev = [], hook
    for p in script["points"]:
        pic = by_product.get(ids.get(p.get("product") or ""))
        pic = pic if pic and pic != prev else None
        out.append(pic)
        prev = pic or prev
    return hook, out


def build_props(
    brand: Brand, script: dict, hook_pic: str | None, point_pics: list[str | None], logo: str | None, khmer: bool
) -> dict:
    """The template's input (motion/sample.json shape)."""
    t = _km_words if khmer else (lambda s: s)
    r, g, b = accent_for(brand.slug)
    scenes = [{"type": "hook", "text": t(script["hook"]), "image": hook_pic}]
    for n, p in enumerate(script["points"]):
        scenes.append(
            {
                "type": "point",
                "title": t(p["title"]),
                "text": t(p["text"]),
                "icon": p["icon"],
                "image": point_pics[n] if n < len(point_pics) else None,
                **({"badge": "✗"} if script.get("shape") == "mistakes" else {}),
            }
        )
    scenes.append({"type": "cta", "text": t(script["cta"]["text"]), "button": t(script["cta"]["button"]), "image": hook_pic})
    return {"brand": {"name": brand.name, "color": f"#{r:02x}{g:02x}{b:02x}", "logo": logo}, "scenes": scenes}


def length_of(props: dict) -> int:
    scenes = props["scenes"]
    return round(sum(s.get("seconds") or SECONDS[s["type"]] for s in scenes) - TRANSITION_S * (len(scenes) - 1))


# Silence after a scene's line, so it ends before the next scene slides in.
VOICE_TAIL = 0.8


def add_voice(props: dict, script: dict, voice: str, ws: int | None, user_id: int | None, job_id: int) -> int:
    """Each scene's spoken line, read by ``voice``: the MP3 goes into the scene
    and the scene lasts as long as its line (never shorter than its
    animation). Best effort — a line that fails just stays silent. Returns
    the characters spoken (what Azure bills)."""
    from app import speech
    from app.story import _probe

    says = [script.get("hook_say"), *(p.get("say") for p in script["points"]), script["cta"].get("say")]
    spoken = 0
    with tempfile.TemporaryDirectory() as tmp:
        for n, (scene, say) in enumerate(zip(props["scenes"], says)):
            if not say:
                continue
            try:
                mp3 = speech.speak(say, voice)
            except speech.SpeechError as exc:
                log.warning("motion %s: voice for scene %s failed: %s", job_id, n + 1, exc)
                continue
            path = Path(tmp) / f"say-{n}.mp3"
            path.write_bytes(mp3)
            _has_audio, duration = _probe(str(path))
            if duration <= 0:
                continue
            scene["audio"] = "data:audio/mpeg;base64," + base64.b64encode(mp3).decode()
            scene["seconds"] = round(max(SECONDS[scene["type"]], duration + VOICE_TAIL), 2)
            spoken += len(say)
    if spoken:
        billing.charge(
            ws, "video", spoken * speech.PRICE_PER_CHAR, user_id=user_id, model=voice, note="Motion video voice-over", job_id=job_id
        )
    return spoken


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
    # Narrator: "female", "male", or "none" for a silent video.
    voice: str = "female"


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
        target=_make, args=(job.id, payload.product_id, payload.language, payload.voice), daemon=True, name=f"motion-{job.id}"
    ).start()
    return _out(job, None)


def make_motion(
    brand_id: int, idea: str, language: str, voice: str = "female", product_id: int | None = None, caption: str = ""
) -> int | None:
    """Make one motion video now (blocking, 1-3 min) — the weekly plan's
    video posts. Recorded as a generation like any other, so it's in the
    Library too; ``caption`` (the post's) becomes the Library caption.
    Returns the Video id, or None when it couldn't be made."""
    if not_ready():
        return None
    db = SessionLocal()
    try:
        brand = db.get(Brand, brand_id)
        job = GenerationJob(
            workspace_id=brand.workspace_id,
            brand_id=brand_id,
            kind="motion",
            prompt=idea.strip()[:20000],
            aspect_ratio="9:16",
            seconds=0,
            provider="remotion",
            status="queued",
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()
    _make(job_id, product_id, language, voice, caption)
    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        return job.video_id if job is not None and job.status == "succeeded" else None
    finally:
        db.close()


def _make(job_id: int, product_id: int | None, language: str, voice: str = "none", caption: str = "") -> None:
    from app.content_ai import ContentAIError
    from app.video import _ready_push

    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        billing.bind(job.workspace_id, job.user_id)  # the script is an AI call
        job.status = "running"
        db.commit()
        brand = db.get(Brand, job.brand_id)
        all_products = list(db.scalars(select(Product).where(Product.brand_id == brand.id).order_by(Product.name)).all())
        # A chosen product: the script is about it alone.
        products = [p for p in all_products if p.id == product_id] or all_products if product_id is not None else all_products
        try:
            from app.learning import brand_learnings

            learned = brand_learnings(db, brand.id).get("prompt") or ""
        except Exception:  # noqa: BLE001 — a video without learnings beats no video
            learned = ""
        try:
            script = write_script(brand, products, job.prompt, language, learned)
            by_product, order, logo = _brand_pictures(db, brand.id)
            hook_pic, point_pics = pick_pictures(script, all_products, by_product, order, product_id)
            props = build_props(brand, script, hook_pic, point_pics, logo, "khmer" in language.lower())
            db.rollback()  # no transaction held open through the voice and render
            from app import speech

            narrator = speech.voice_for(language, voice) if speech.ready() else None
            if narrator:
                add_voice(props, script, narrator, job.workspace_id, job.user_id, job_id)
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
        says = [script.get("hook_say"), *(p.get("say") for p in script["points"]), script["cta"].get("say")]
        job.prompt = f"{job.prompt}\n\nMOTION SCRIPT:\n" + "\n".join(
            f"- {ln}" + (f"\n  🎙 {say}" if say and narrator else "") for ln, say in zip(lines, says)
        )
        job.video_id = video.id
        job.seconds = seconds
        job.status = "succeeded"
        job.error = ""
        if caption:
            # A plan post brings its own caption — no second AI call for one.
            video.caption, video.caption_status = caption, "ready"
        db.commit()
        _ready_push(job)
        if not caption:
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
