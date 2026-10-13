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
import os
import random
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import uuid
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
# Scene overlap while one changes to the next — motion/src/MotionPost.jsx TRANSITION.
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
# Icons the template can draw (Lucide names, checked to exist in the motion
# project's lucide-react) — the AI may only pick from these.
ICONS = (
    "MessageCircle MessagesSquare Clock Moon Zap Bot Sparkles ShoppingCart ShoppingBag Package Truck "
    "Wallet Banknote CreditCard Tag Percent Gift Star Heart ThumbsUp Smile Users UserCheck Phone "
    "Smartphone Bell Calendar TrendingUp ChartColumn Target Rocket ShieldCheck CircleCheck Leaf Droplet "
    "Sun Flame Coffee Utensils Shirt House Store MapPin Search Globe Lightbulb BookOpen GraduationCap "
    "Award Timer AlarmClock Hourglass Frown TriangleAlert CircleX Send Mail Camera Image Video Headphones "
    "Lock Hand HandHeart Scissors Sprout Flower2 Baby Dumbbell Car Bike Building2 Briefcase Laptop "
    "Megaphone Handshake"
).split()
SCENE_TYPES = ("hook", "problem", "chat", "list", "stat", "product", "cta")

# Background music: royalty-free MP3s under motion/public/music/<mood>/ (see
# the README there). The AI picks a mood that has tracks; a track is drawn at random.
MUSIC_MOODS = {
    "upbeat": "energetic — promos, offers, launches",
    "calm": "gentle — tips, how-tos, care and wellness",
    "warm": "heartfelt — stories, community, local moments",
    "corporate": "modern and confident — B2B, tech, services, explainers",
    "festive": "celebration — holidays, Khmer New Year, big sales",
}


def music_tracks() -> dict[str, list[str]]:
    """{mood: ["music/<mood>/<file>.mp3", ...]} for moods that have tracks."""
    root = MOTION_DIR / "public" / "music"
    out: dict[str, list[str]] = {}
    for mood in MUSIC_MOODS:
        files = sorted(p.name for p in (root / mood).glob("*.mp3")) if (root / mood).is_dir() else []
        if files:
            out[mood] = [f"music/{mood}/{f}" for f in files]
    return out

SCRIPT_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, 15-25 s): no actors — animated app-style "
    "graphics: big words, icons, a phone screen with a chat, the product photo, numbers "
    "counting up. It must GRAB in the first second and be understood in one watch, even "
    "with the sound off. Plan it like a storyboard, one idea per scene.\n"
    "\n"
    "THE STORY (5-6 scenes, in this order):\n"
    "1. hook — the scroll-stopper.\n"
    "2. problem — the pain the viewer lives with, made visible.\n"
    "3. the solution shown WORKING — `chat` when the business answers customers (a service, "
    "an app, a shop taking orders by message), else `product` (the product itself).\n"
    "4. the proof / what they get — `list` (3 benefits) and/or `stat` (one big number).\n"
    "5. cta — what to do now.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words — a sharp question about their pain, a surprising true "
    "fact, \"Stop …\", a callout like \"Online sellers:\", or a bold specific promise; never "
    "the brand name, a greeting or \"Did you know\"), icon.\n"
    "- problem: icon, title (2-5 words, the pain), text (max 10 words, what it costs them), "
    "count (an illustrative number for a badge on the icon, e.g. 27 unread messages — or 0).\n"
    "- chat: title (max 7 words), messages: 3-4 short messages alternating "
    "{\"from\": \"customer\"|\"brand\", \"text\": max 12 words} — a real customer question and "
    "the business answering helpfully and fast.\n"
    "- product: product (exact name from the list), title (max 7 words), chips: 3 selling "
    "points, 1-3 words each.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value (a number), prefix (\"\" or e.g. \"$\"), suffix (\"\", \"x\", \"%\", \"+\", "
    "\"/7\"), label (max 6 words), icon. ONLY a number that is true — from the product "
    "information or self-evident (24/7) — never invent one.\n"
    "- cta: text (max 9 words, pays off the hook), button (2-4 words).\n"
    "Wrap the 1-3 most important words of the hook and of titles in [square brackets] — they "
    "are highlighted in the brand colour.\n"
    "icon: exactly one name from this list: " + ", ".join(ICONS) + ".\n"
    "\n"
    "VOICE-OVER: every scene also has `say` — one natural spoken sentence, 6-18 words, that "
    "ADDS to the words on screen (never reads them out), warm and conversational, like a "
    "friendly seller talking to one customer. Same language.\n"
    "\n"
    "LANGUAGE: write in the LANGUAGE given. Khmer: everyday spoken Khmer as Cambodian "
    "sellers write on Facebook — short common words, correct spelling, address the viewer "
    "as បង (never អ្នក), brand / product / app names in Latin exactly as written. English: "
    "plain and punchy.\n"
    "FACTS: only what the product information supports — never invent prices, features or "
    "results. The brief may be a long prompt written for a filmed video — ignore camera, "
    "actors and lighting; keep only its topic and message.\n"
    "\n"
    "Return ONLY a JSON object, no markdown:\n"
    '{"scenes": [{"type": "hook", "text": "...", "icon": "MessageCircle", "say": "..."}, ...]}'
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


def _icon(value, fallback: str = "Sparkles") -> str:
    name = str(value or "").strip()
    return name if name in ICONS else fallback


def _number(value) -> float:
    try:
        n = float(str(value).replace(",", "").strip())
    except ValueError:
        return 0.0
    return n if 0 <= n < 1_000_000 else 0.0


def _clean_scene(raw: dict, names: dict[str, str]) -> dict | None:
    """One scene from the AI, checked and trimmed — None when it's unusable."""
    kind = raw.get("type")
    say = _line(raw.get("say"), 300)
    if kind == "hook":
        text = _line(raw.get("text"), 160)
        return {"type": kind, "text": text, "icon": _icon(raw.get("icon"), "Zap"), "say": say} if text else None
    if kind == "problem":
        title = _line(raw.get("title"), 80)
        count = int(_number(raw.get("count")))
        return (
            {"type": kind, "icon": _icon(raw.get("icon"), "Frown"), "title": title, "text": _line(raw.get("text"), 140), "count": min(count, 999), "say": say}
            if title
            else None
        )
    if kind == "chat":
        msgs = [
            {"from": "brand" if m.get("from") == "brand" else "customer", "text": _line(m.get("text"), 140)}
            for m in (raw.get("messages") or [])
            if isinstance(m, dict) and _line(m.get("text"), 140)
        ][:4]
        return {"type": kind, "title": _line(raw.get("title"), 100), "messages": msgs, "say": say} if len(msgs) >= 2 else None
    if kind == "list":
        items = [
            {"icon": _icon(i.get("icon"), "CircleCheck"), "text": _line(i.get("text"), 80)}
            for i in (raw.get("items") or [])
            if isinstance(i, dict) and _line(i.get("text"), 80)
        ][:4]
        return {"type": kind, "title": _line(raw.get("title"), 80), "items": items, "say": say} if len(items) >= 2 else None
    if kind == "stat":
        value = _number(raw.get("value"))
        label = _line(raw.get("label"), 80)
        return (
            {
                "type": kind,
                "value": int(value) if value == int(value) else round(value, 1),
                "prefix": _line(raw.get("prefix"), 3),
                "suffix": _line(raw.get("suffix"), 4),
                "label": label,
                "icon": _icon(raw.get("icon"), "TrendingUp"),
                "say": say,
            }
            if value and label
            else None
        )
    if kind == "product":
        chips = [c for c in (_line(c, 30) for c in (raw.get("chips") or [])) if c][:3]
        title = _line(raw.get("title"), 100)
        product = names.get(_line(raw.get("product"), 120).lower(), "")
        return {"type": kind, "product": product, "title": title, "chips": chips, "say": say} if title else None
    if kind == "cta":
        text = _line(raw.get("text"), 140)
        return {"type": kind, "text": text, "button": _line(raw.get("button"), 40), "say": say} if text else None
    return None


# The on-screen and spoken text of each scene type, for the Khmer editor pass.
_TEXT_FIELDS = {
    "hook": (("text", 160), ("say", 300)),
    "problem": (("title", 80), ("text", 140), ("say", 300)),
    "chat": (("title", 100), ("say", 300)),
    "list": (("title", 80), ("say", 300)),
    "stat": (("label", 80), ("say", 300)),
    "product": (("title", 100), ("say", 300)),
    "cta": (("text", 140), ("button", 40), ("say", 300)),
}


def write_script(
    brand: Brand, products: list[Product], idea: str, language: str, learnings: str = "", moods: list[str] | None = None
) -> dict:
    """The video's storyboard: one AI call, then for Khmer the same
    native-editor pass the captions get. {"scenes": [...]} — always starting
    with a hook and ending with a call to action. Raises ContentAIError."""
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
    if moods:
        extra += (
            '\n\nBACKGROUND MUSIC: also return "mood" — the one that fits this story best: '
            + "; ".join(f"{m} ({MUSIC_MOODS[m]})" for m in moods)
            + "."
        )
    raw = _chat(
        [
            {"role": "system", "content": SCRIPT_PROMPT + extra},
            {
                "role": "user",
                "content": f"BRAND: {brand.name}\nLANGUAGE: {language}\nPRODUCTS:\n{facts}\n\nTHE VIDEO IS ABOUT: {idea.strip()[:4000]}",
            },
        ],
        model,
        max_tokens=9000,
    )
    names = {p.name.strip().lower(): p.name for p in products}
    scenes = [s for s in (_clean_scene(r, names) for r in (raw.get("scenes") or []) if isinstance(r, dict)) if s][:7]
    # A hook first and a call to action last, whatever came back.
    hooks = [s for s in scenes if s["type"] == "hook"]
    ctas = [s for s in scenes if s["type"] == "cta"]
    middle = [s for s in scenes if s["type"] not in ("hook", "cta")][:4]
    if not hooks or not ctas or not middle:
        raise ContentAIError("The AI didn't return a usable storyboard — try again.")
    script = {"scenes": [hooks[0], *middle, ctas[0]]}
    if moods:
        script["mood"] = raw.get("mood") if raw.get("mood") in moods else moods[0]

    if khmer:
        # Every line — on screen and spoken — through the native editor
        # (correct words, natural phrasing, names untouched), put back in place.
        slots: list[tuple[dict, str, int]] = []
        for s in script["scenes"]:
            slots += [(s, key, n) for key, n in _TEXT_FIELDS[s["type"]]]
            slots += [(m, "text", 140) for m in s.get("messages", [])]
            slots += [(i, "text", 80) for i in s.get("items", [])]
            if s["type"] == "product":
                slots += [(s["chips"], k, 30) for k in range(len(s["chips"]))]
        slots = [x for x in slots if x[0][x[1]]]
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


def script_lines(script: dict) -> list[tuple[str, str]]:
    """(what's on screen, what's said) per scene — for "How it was made"."""
    out = []
    for s in script["scenes"]:
        if s["type"] == "chat":
            screen = (s.get("title") or "Chat") + " — " + " / ".join(m["text"] for m in s["messages"])
        elif s["type"] == "list":
            screen = (s.get("title") or "") + " — " + ", ".join(i["text"] for i in s["items"])
        elif s["type"] == "stat":
            screen = f"{s.get('prefix', '')}{s['value']}{s.get('suffix', '')} {s['label']}"
        elif s["type"] == "product":
            screen = s["title"] + (" — " + ", ".join(s["chips"]) if s["chips"] else "")
        elif s["type"] == "problem":
            screen = s["title"] + (f" — {s['text']}" if s.get("text") else "")
        else:
            screen = s.get("text", "")
        out.append((f"[{s['type']}] {screen}", s.get("say", "")))
    return out


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
) -> None:
    """Put the brand kit's photos into the scenes that show one: the product
    scene shows the product it names (else the chosen / newest photo); the
    hook and the close show the chosen product (else the newest photo)."""
    ids = {p.name: p.id for p in products}
    main = (by_product.get(product_id) if product_id is not None else None) or (order[0] if order else None)
    for s in script["scenes"]:
        if s["type"] == "product":
            s["image"] = by_product.get(ids.get(s.get("product") or "")) or main
        elif s["type"] in ("hook", "cta"):
            s["image"] = main


def _brackets(text: str) -> str:
    """[highlight] → ⟦highlight⟧, the template's marker (square brackets may
    be real text elsewhere)."""
    return re.sub(r"\[([^\[\]]{1,60})\]", "⟦\\1⟧", text or "")


def build_props(brand: Brand, script: dict, logo: str | None, khmer: bool) -> dict:
    """The template's input (motion/sample.json shape)."""

    def t(text: str) -> str:
        text = _brackets(text)
        return _km_words(text) if khmer else text

    r, g, b = accent_for(brand.slug)
    scenes = []
    for s in script["scenes"]:
        scene = {k: v for k, v in s.items() if k not in ("say", "product")}
        for key in ("text", "title", "label", "button"):
            if scene.get(key):
                scene[key] = t(scene[key])
        if "messages" in scene:
            scene["messages"] = [{**m, "text": t(m["text"])} for m in scene["messages"]]
        if "items" in scene:
            scene["items"] = [{**i, "text": t(i["text"])} for i in scene["items"]]
        if "chips" in scene:
            scene["chips"] = [t(c) for c in scene["chips"]]
        if not scene.get("image"):
            scene.pop("image", None)
        scenes.append(scene)
    props = {"brand": {"name": brand.name, "color": f"#{r:02x}{g:02x}{b:02x}", "logo": logo}, "scenes": scenes}
    tracks = music_tracks().get(script.get("mood") or "")
    if tracks:
        props["music"] = random.choice(tracks)  # a file under public/ — the template mixes it in
    return props


def default_seconds(scene: dict) -> float:
    """A scene's length without a voice-over — mirrors MotionPost.jsx defaultSeconds."""
    kind = scene.get("type")
    if kind == "chat":
        return 1.6 + 1.5 * min(4, len(scene.get("messages") or []))
    if kind == "list":
        return 1.8 + 1.0 * min(4, len(scene.get("items") or []))
    return {"cta": 3.8, "product": 3.6}.get(kind, 3.4)


def length_of(props: dict) -> int:
    scenes = props["scenes"]
    return round(sum(s.get("seconds") or default_seconds(s) for s in scenes) - TRANSITION_S * (len(scenes) - 1))


# Silence after a scene's line, so it ends before the next scene slides in.
VOICE_TAIL = 0.8


def add_voice(props: dict, script: dict, voice: str, ws: int | None, user_id: int | None, job_id: int) -> int:
    """Each scene's spoken line, read by ``voice``: the MP3 goes into the scene
    and the scene lasts as long as its line (never shorter than its
    animation). Best effort — a line that fails just stays silent. Returns
    the characters spoken (what Azure bills)."""
    from app import speech
    from app.story import _probe

    says = [s.get("say") for s in script["scenes"]]
    spoken = 0
    with tempfile.TemporaryDirectory() as tmp:
        for n, (scene, say) in enumerate(zip(props["scenes"], says)):
            _check(job_id)  # Stop pressed: no more lines are spoken (or billed)
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
            scene["seconds"] = round(max(default_seconds(scene), duration + VOICE_TAIL), 2)
            spoken += len(say)
    if spoken:
        billing.charge(
            ws, "video", spoken * speech.PRICE_PER_CHAR, user_id=user_id, model=voice, note="Remotion video voice-over", job_id=job_id
        )
    return spoken


class Stopped(Exception):
    """The person pressed Stop — the job ends quietly, not as an error."""


_procs: dict[int, subprocess.Popen] = {}  # job id → its running render
_stopped: set[int] = set()


def _kill_tree(proc: subprocess.Popen) -> None:
    """Stop a render and every process it started (npx → node → Chrome)."""
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=30)
        else:
            os.killpg(proc.pid, signal.SIGKILL)
    except Exception:  # noqa: BLE001 — fall back to the process itself
        proc.kill()


def stop(job_id: int) -> None:
    """Stop a motion video: its render is killed now, and a job still writing
    its script or voice stops at the next step."""
    _stopped.add(job_id)
    proc = _procs.get(job_id)
    if proc is not None:
        _kill_tree(proc)


def _check(job_id: int | None) -> None:
    if job_id is not None and job_id in _stopped:
        raise Stopped()


def _to_files(props: dict, folder: Path, rel: str) -> dict:
    """``props`` with every embedded picture / sound written to ``folder`` and
    swapped for its path under public/ — Remotion re-reads the props for every
    frame, so megabytes of data: URIs there made renders crawl (402 s seen)."""
    count = 0

    def swap(value):
        nonlocal count
        if isinstance(value, str) and value.startswith("data:") and "," in value:
            head, data = value.split(",", 1)
            ext = ".jpg" if "jpeg" in head else ".png" if "png" in head else ".mp3" if "audio" in head else ".bin"
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


def render(props: dict, job_id: int | None = None) -> bytes:
    """The MP4 for ``props`` — Remotion, run as a subprocess. Raises
    RuntimeError, or Stopped when the person pressed Stop."""
    reason = not_ready()
    if reason:
        raise RuntimeError(reason)
    with _render_lock, tempfile.TemporaryDirectory() as tmp:
        _check(job_id)
        rel = f"run-{uuid.uuid4().hex[:12]}"
        assets = MOTION_DIR / "public" / rel  # served to the render as staticFile(rel/…)
        assets.mkdir(parents=True)
        try:
            props_path = Path(tmp) / "props.json"
            out = Path(tmp) / "motion.mp4"
            props_path.write_text(json.dumps(_to_files(props, assets, rel), ensure_ascii=False), encoding="utf-8")
            proc = subprocess.Popen(
                [_npx(), "remotion", "render", "src/index.jsx", "MotionPost", str(out), f"--props={props_path}", "--log=error"],
                cwd=MOTION_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                errors="replace",
                start_new_session=os.name != "nt",  # so Stop can end the whole group
            )
            if job_id is not None:
                _procs[job_id] = proc
            try:
                stdout, stderr = proc.communicate(timeout=900)
            except subprocess.TimeoutExpired:
                _kill_tree(proc)
                proc.communicate()
                raise RuntimeError("Rendering took too long — try again.") from None
            finally:
                if job_id is not None:
                    _procs.pop(job_id, None)
            _check(job_id)
            if proc.returncode != 0 or not out.exists():
                log.error("motion render failed: %s", (stderr or stdout)[-1500:])
                raise RuntimeError("The video couldn't be rendered — try again.")
            return out.read_bytes()
        finally:
            shutil.rmtree(assets, ignore_errors=True)


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
    # Background music under the video (when tracks are installed).
    music: bool = True


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
        target=_make,
        args=(job.id, payload.product_id, payload.language, payload.voice, "", payload.music),
        daemon=True,
        name=f"motion-{job.id}",
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


def _make(
    job_id: int, product_id: int | None, language: str, voice: str = "none", caption: str = "", music: bool = True
) -> None:
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
            _check(job_id)
            moods = list(music_tracks()) if music else []
            script = write_script(brand, products, job.prompt, language, learned, moods)
            _check(job_id)
            by_product, order, logo = _brand_pictures(db, brand.id)
            pick_pictures(script, all_products, by_product, order, product_id)
            props = build_props(brand, script, logo, "khmer" in language.lower())
            db.rollback()  # no transaction held open through the voice and render
            from app import speech

            narrator = speech.voice_for(language, voice) if speech.ready() else None
            if narrator:
                add_voice(props, script, narrator, job.workspace_id, job.user_id, job_id)
            blob = render(props, job_id)
        except Stopped:
            job = db.get(GenerationJob, job_id)
            job.status, job.error = "failed", "Stopped"
            db.commit()
            return
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
        # The Library's "How it was made" shows the brief and the storyboard.
        job.prompt = f"{job.prompt}\n\nREMOTION STORYBOARD:\n" + "\n".join(
            f"- {screen}" + (f"\n  🎙 {say}" if say and narrator else "") for screen, say in script_lines(script)
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
        _stopped.discard(job_id)
        db.close()
