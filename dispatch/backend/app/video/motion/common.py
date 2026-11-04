"""What every part of the motion package shares: the routers, the motion folder, the icons the AI may use, the music, and the small text helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import logging
import random
import re
import shutil
import threading
from app.voice.khmer_words import ZWSP, breaks
from fastapi import APIRouter
from pathlib import Path


log = logging.getLogger("app.motion")


router = APIRouter(prefix="/ai/motion", tags=["AI"])


# The making card's scene pictures: an <img> can't send the login, so each
# video's set sits behind an unguessable code, in memory, for a few hours.
sketch_router = APIRouter(prefix="/ai/motion", tags=["AI"])


MOTION_DIR = Path(__file__).resolve().parents[4] / "motion"  # dispatch/motion (this file: dispatch/backend/app/video/video/motion/)


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
    "Megaphone Handshake Cpu BrainCircuit Workflow LayoutDashboard Cloud Database Code "
    "MousePointerClick Newspaper BadgePercent WandSparkles Plug BellRing Inbox ChartLine Gauge Server "
    "KeyRound FileText ListChecks RefreshCw BotMessageSquare Crown Infinity "
    # kinds of business, what an attack costs (Cybersecurity)
    "Landmark Factory Hospital School Plane ServerOff FileX"
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
    "cinematic": "epic and building — launch films, big reveals, event screens, brand stories",
    "tech": "driving synth pulse — technology, apps, SaaS, AI, how-it-works",
    "learning": "curious and light — lessons, teaching, tips, training, explaining a skill",
    "event": "hype dance beat — events, openings, workshops, concerts, countdowns, live shows",
    "promo": "bouncy and catchy — offers, discounts, claim a deal or a voucher, flash sales",
    "launch": "tease, build, drop — product launches, new features, grand reveals",
}


# Moods that sound right after each other when a long video changes track per chapter.
MUSIC_NEIGHBOURS = {
    "corporate": ("calm", "warm"),
    "calm": ("corporate", "warm"),
    "warm": ("calm", "corporate"),
    "upbeat": ("festive", "corporate"),
    "festive": ("upbeat", "warm"),
    "cinematic": ("tech", "corporate"),
    "tech": ("corporate", "cinematic"),
    "learning": ("calm", "corporate"),
    "event": ("festive", "upbeat"),
    "promo": ("upbeat", "festive"),
    "launch": ("cinematic", "tech"),
}


_TRACK_SECONDS: dict[str, float] = {}


def track_for(tracks: list[str], seconds: float) -> str:
    """A track for a video of about ``seconds``: one at least that long when the
    mood has one (a short loop repeating under a long video is noticeable),
    else the longest — any of them at random among those that fit."""
    from app.video.story import _probe

    for t in tracks:
        if t not in _TRACK_SECONDS:
            _TRACK_SECONDS[t] = _probe(str(MOTION_DIR / "public" / t))[1]
    fit = [t for t in tracks if _TRACK_SECONDS[t] >= seconds]
    return random.choice(fit) if fit else max(tracks, key=lambda t: _TRACK_SECONDS[t])


def music_tracks() -> dict[str, list[str]]:
    """{mood: ["music/<mood>/<file>.mp3", ...]} for moods that have tracks."""
    root = MOTION_DIR / "public" / "music"
    out: dict[str, list[str]] = {}
    for mood in MUSIC_MOODS:
        files = (
            sorted(p.name for p in (root / mood).glob("*.mp3")) if (root / mood).is_dir() else []
        )
        if files:
            out[mood] = [f"music/{mood}/{f}" for f in files]
    return out


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


def _numbers_in(text: str) -> set[float]:
    """Every number written in a text — Khmer digits too, "1,400" / "១ ៤០០" as one."""
    t = text.translate(str.maketrans("០១២៣៤៥៦៧៨៩", "0123456789"))
    t = re.sub(r"(?<=\d)[,\u00a0\u2009\u202f ](?=\d{3}(?!\d))", "", t)
    return {float(x) for x in re.findall(r"\d+(?:\.\d+)?", t)}
