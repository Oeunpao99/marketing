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
import contextvars
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
import secrets
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
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
from app.poster import brand_rgb
from app.tenancy import current_workspace_id, get_current_user, owned

log = logging.getLogger("app.motion")

router = APIRouter(prefix="/ai/motion", tags=["AI"])
# The making card's scene pictures: an <img> can't send the login, so each
# video's set sits behind an unguessable code, in memory, for a few hours.
sketch_router = APIRouter(prefix="/ai/motion", tags=["AI"])

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
    "Megaphone Handshake Cpu BrainCircuit Workflow LayoutDashboard Cloud Database Code "
    "MousePointerClick Newspaper BadgePercent WandSparkles Plug BellRing Inbox ChartLine Gauge Server "
    "KeyRound FileText ListChecks RefreshCw BotMessageSquare Crown Infinity"
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
}


_TRACK_SECONDS: dict[str, float] = {}


def track_for(tracks: list[str], seconds: float) -> str:
    """A track for a video of about ``seconds``: one at least that long when the
    mood has one (a short loop repeating under a long video is noticeable),
    else the longest — any of them at random among those that fit."""
    from app.story import _probe

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
        files = sorted(p.name for p in (root / mood).glob("*.mp3")) if (root / mood).is_dir() else []
        if files:
            out[mood] = [f"music/{mood}/{f}" for f in files]
    return out

# How an English video talks: viewers in Cambodia often read English at A2-B1
# (the user, 2026-10-16: "the AI seems too high level, hard to understand").
# Used by every story prompt's LANGUAGE line; a pasted story is still followed
# as written (story mode).
_PLAIN_ENGLISH = (
    "English: PLAIN ENGLISH for learners (CEFR A2-B1) — someone who learned English at school "
    "must understand every word the first time. Short sentences (max 12 words), one idea each. "
    "Common everyday words (\"use\", \"help\", \"fast\", \"easy\", \"save time\"), present "
    "tense, \"you\" and \"we\". No idioms, slang or phrasal-verb tricks (\"game-changer\", "
    "\"level up\", \"take it to the next level\", \"hit the ground running\"), no buzzwords "
    "(leverage, seamless, streamline, empower, unlock, elevate, robust, cutting-edge, "
    "revolutionize, synergy, next-gen, effortless), no long noun stacks. A technical word only "
    "when needed — then say what it means in simple words. Friendly and clear beats clever.\n"
)

SELL_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 60 s): no actors — animated app-style "
    "graphics: big words, icons, a phone screen with a chat, the product photo, numbers "
    "counting up. It must GRAB in the first second and be understood in one watch, even "
    "with the sound off. Plan it like a storyboard, one idea per scene — a real STORY "
    "with a beginning, a turn and an ending, not a list of features.\n"
    "\n"
    "THE STORY (8-10 scenes, in this order):\n"
    "1. hook — the scroll-stopper.\n"
    "2-3. problem — the pain the viewer lives with, made visible; then what it COSTS them "
    "(a second `problem`, or a `stat` that is true).\n"
    "4-5. the solution shown WORKING — `chat` when the business answers customers (a service, "
    "an app, a shop taking orders by message) and/or `product` (the product itself).\n"
    "6-7. the proof / what they get — `list` (3 benefits) and/or `stat` (one big number).\n"
    "8. the doubt answered — a `chat` where a customer asks the usual worry and gets a "
    "clear answer (optional).\n"
    "last. cta — what to do now.\n"
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
    "VOICE-OVER: every scene also has `say` — one or two natural spoken sentences, 12-22 "
    "words, that ADD to the words on screen (never read them out). Together the lines tell "
    "the story from start to end — each one leads into the next. Warm and conversational, "
    "like a friendly seller talking to one customer. Same language.\n"
    "\n"
    "LANGUAGE: write in the LANGUAGE given. Khmer: everyday spoken Khmer as Cambodian "
    "sellers write on Facebook — short common words, correct spelling, address the viewer "
    "as បង (never អ្នក), brand / product / app names in Latin exactly as written. "
    + _PLAIN_ENGLISH
    + "FACTS: only what the product information supports — never invent prices, features or "
    "results. The brief may be a long prompt written for a filmed video — ignore camera, "
    "actors and lighting; keep only its topic and message.\n"
    "\n"
    "Return ONLY a JSON object, no markdown:\n"
    '{"scenes": [{"type": "hook", "text": "...", "icon": "MessageCircle", "say": "..."}, ...]}'
)


# The Explainer style's story — awareness / education (no selling). Scenes
# are drawn by motion/src/explainer.jsx.
EXPLAINER_TYPES = ("hook", "character", "compare", "chart", "list", "stat", "cta")
TECH_TYPES = ("hook", "problem", "chat", "list", "stat", "product", "cta")
MOODS = ("happy", "excited", "sad", "worried", "thinking")

TEACH_PROMPT = (
    "You are the best short-form EDUCATION video storyteller in Cambodia — think of the "
    "Khmer money and life-tips explainers that people save and share. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 60 s) in a light, friendly drawn style: a "
    "cream background, big dark titles, a stick-figure person with a mood, objects with "
    "price tags, charts that grow, two people compared. Subtitles show the narration. "
    "It must make people STOP, UNDERSTAND something new in one watch, and want to SAVE or "
    "SHARE it. This is NOT an ad: never pitch the brand's product — the brand only appears "
    "as the logo.\n"
    "\n"
    "THE STORY (8-10 scenes) — follow ONE person through it, like a short tale:\n"
    "1. hook — a surprising number or question that makes them think (\"Is a $400 salary "
    "richer than $1,000?\").\n"
    "2-3. a relatable SITUATION — a `character` (a person with a Cambodian first name, e.g. "
    "សុខា, ដារ៉ា, ស្រីនិច, វិសាល) in their everyday life, then the moment it goes wrong "
    "(the same character, a worried or sad mood).\n"
    "4. a `compare` of two people making different choices.\n"
    "5-6. the INSIGHT made visible — a `chart` (how it adds up over time) and/or a `stat`.\n"
    "7. the TAKEAWAY — a `list` of 3 simple tips.\n"
    "8. the ending — the same character again, now happy (the change the tips made).\n"
    "last. cta — soft: save it, share it with a friend, follow for more, or comment an answer.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- character: title (2-5 words), mood (happy | excited | sad | worried | thinking), "
    "icon (an object they have or want — optional), tag (a short price / number label for "
    "the object, e.g. \"$1,300\" — optional).\n"
    "- compare: title (max 5 words), left and right: {name, mood, value (short label like "
    "\"$400\"), tone (good | bad)}.\n"
    "- chart: title (max 5 words), prefix (\"$\" or \"\"), suffix (\"\" or e.g. \"%\"), labels "
    "(3-6 x-axis labels, e.g. years \"0\",\"1\",\"3\",\"5\",\"10\"), series: 1-2 lines "
    "{name (who, e.g. \"សុខា $400\"), tone (good | bad), values (numbers, EXACTLY one per "
    "label)}.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value (a number), prefix, suffix, label (max 6 words), icon.\n"
    "- cta: text (max 8 words), button (1-2 words, e.g. \"Save\", \"Share\", \"Follow\").\n"
    "\n"
    "STORYTELLING (what makes Khmer story videos feel human): named people the viewer follows; "
    "a question in the hook that comes back at the end; the moment SHOWN in small details (the "
    "coffee, the lunch, the bank balance) instead of explained; a line of dialogue in «…»; a "
    "short punch line after a long one; \"…\" where the voice should pause; an honest ending "
    "(no magic fixes); the takeaway as a few short actions.\n"
    "NUMBERS: when the brief gives numbers, use exactly those. When you illustrate, every "
    "number must be arithmetically EXACT and consistent across scenes (a chart's values follow "
    "from the story's own amounts). Never invent statistics about real companies, studies or "
    "markets. "
    "Wrap the 1-3 most important words of the hook and titles in [square brackets] — they "
    "are highlighted.\n"
    "icon: exactly one name from this list: " + ", ".join(ICONS) + ".\n"
    "\n"
    "VOICE-OVER: every scene has `say` — one or two natural spoken sentences, 12-24 words, "
    "that tell the story (also shown as subtitles), each line leading into the next, like a "
    "friendly teacher telling one person a story. Same language.\n"
    "\n"
    "LANGUAGE: write in the LANGUAGE given. Khmer: everyday spoken Khmer — short common "
    "words, correct spelling, digits are fine; speak to the viewer as បង, or as a storyteller "
    "to everyone as អ្នក — pick one and keep it. "
    + _PLAIN_ENGLISH
    + "The topic may come from a brand that sells something related — teach the topic, don't "
    "sell. The brief may be a long prompt written for a filmed video — keep only its topic.\n"
    "\n"
    "Return ONLY a JSON object, no markdown:\n"
    '{"scenes": [{"type": "hook", "text": "...", "icon": "Wallet", "say": "..."}, ...]}'
)

# ── one template per content goal (motion/src/goaltemplates.jsx) ─────────
_COMMON_RULES = (
    "Wrap the 1-3 most important words of the hook and titles in [square brackets] — they "
    "are highlighted.\n"
    "icon: exactly one name from this list: " + ", ".join(ICONS) + ".\n"
    "\n"
    "VOICE-OVER: every scene has `say` — one or two natural spoken sentences, 12-22 words, "
    "that add to what is on screen (also shown as subtitles). Together the lines tell one "
    "story, each leading into the next — one person talking to a friend about a moment they "
    "know, never a feature list and never a description of the screen (the picture already "
    "shows it; say what it means for them). Same language.\n"
    "\n"
    "LANGUAGE: write in the LANGUAGE given. Khmer: everyday spoken Khmer — short common "
    "words, correct spelling, address the viewer as បង (never អ្នក), brand / product names in "
    "Latin exactly as written. "
    + _PLAIN_ENGLISH
    + "FACTS: only what the product information supports or common knowledge — never invent "
    "statistics, studies, prices or results. The brief may be a long prompt written for a "
    "filmed video — keep only its topic.\n"
    "\n"
    "Return ONLY a JSON object, no markdown:\n"
)

VERSUS_TYPES = ("hook", "split", "myth", "verdict", "stat", "cta")
VERSUS_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 60 s) that builds AUTHORITY: it compares "
    "two ways of doing something — the old / common way vs the better way — or busts a "
    "myth, so the viewer feels the brand truly knows the field and SHARES it. Clean split "
    "screen: red ✗ for the old way, green ✓ for the better way. Honest and fair, not an ad.\n"
    "\n"
    "THE STORY (7-9 scenes):\n"
    "1. hook — the question that sets up the comparison (\"Paper notebook or an app?\").\n"
    "2. split — the two ways side by side.\n"
    "3-5. myth — 2-3 beliefs people hold, each with the truth (one `myth` scene each).\n"
    "6. a `stat` with a TRUE number, or a second `split` (e.g. cost, or time).\n"
    "7. verdict — the one-line conclusion.\n"
    "last. cta — soft: share it, save it, follow for more.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- split: title (max 6 words), left and right: {label (1-3 words — the way), icon, "
    "points: 3 x short phrases (2-5 words)}. left = the old / worse way, right = the better.\n"
    "- myth: myth (max 12 words — what people believe), fact (max 14 words — the truth).\n"
    "- verdict: text (max 10 words), icon.\n"
    "- stat: value (a number), prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 8 words), button (1-2 words, e.g. \"Share\", \"Save\").\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Scale", "say": "..."}, ...]}'
)

POLL_TYPES = ("hook", "options", "reveal", "cta")
POLL_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 60 s) built for ENGAGEMENT — a quiz or "
    "poll that makes people COMMENT their answer. Game-show look: a big question, A/B/C "
    "answer buttons, a countdown. Fun and easy — everyone should feel they can answer.\n"
    "\n"
    "THE STORY (7-8 scenes) — a quiz of 3 questions, easy → harder:\n"
    "1. hook — the challenge (max 12 words, e.g. \"3 questions — can you get all 3?\"), "
    "about the brand's field or customers' everyday life.\n"
    "2-7. three rounds, each: `options` (the question and 2-4 short answers — the viewer "
    "picks while the countdown runs) then `reveal` (the answer and why, in one line). For "
    "an opinion question (\"Which do you prefer?\") leave its reveal out.\n"
    "last. cta — ask them to comment their score or answers, or tag a friend.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (the question, max 12 words), icon.\n"
    "- options: question (the round's question, max 8 words), options: 2-4 answers "
    "(1-5 words each), answer: the index of the right answer (0 = A) or -1 for an opinion poll.\n"
    "- reveal: text (max 12 words), icon.\n"
    "- cta: text (max 9 words), button (1-3 words, e.g. \"Comment A, B or C\").\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "CircleHelp", "say": "..."}, ...]}'
)

QUOTE_TYPES = ("hook", "quote", "cta")
QUOTE_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, 35-45 s) that wins FOLLOWERS: three strong, "
    "true, quotable lines — wisdom from the brand's field that the viewer wants to keep "
    "seeing every day. Cinematic: the brand's photo full-screen and dark, the quote written "
    "in slowly. Calm and confident, never an ad.\n"
    "\n"
    "THE STORY (5 scenes):\n"
    "1. hook — a short intro line that makes them wait for the lessons (\"3 things 10 years "
    "of selling taught us\").\n"
    "2-4. quote — three lessons, one `quote` scene each, building to the strongest.\n"
    "5. cta — follow for one lesson / tip a day.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    "- quote: text (the quote, 8-22 words, original — never attribute words to a real "
    "person who didn't say them), author (the brand's name, or \"\").\n"
    "- cta: text (max 8 words), button (1-2 words, e.g. \"Follow\").\n"
    "The `say` of the quote scene reads the quote itself, slowly.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Quote", "say": "..."}, ...]}'
)

TESTIMONIAL_TYPES = ("hook", "customer", "beforeafter", "result", "review", "cta")
TESTIMONIAL_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 60 s) that builds TRUST: a customer's "
    "story — who they are, their life before, what changed, the result. Warm and human, "
    "like a friend telling you what happened; the brand is the helper, the customer is the "
    "hero.\n"
    "\n"
    "HONESTY — this matters more than anything: never invent a real customer, a real review "
    "or a real result. If the brief gives a real customer (name, words, numbers), use exactly "
    "that. If it does NOT, tell the story of an EXAMPLE customer and say so in the voice "
    "(\"Meet Sokha — a shop owner like you\", \"Imagine…\"): use a common Cambodian first "
    "name and a general business (\"mini-mart owner\"), never a real shop's name, give "
    "NO `review` scene, and a `result` only if the number comes from the product information.\n"
    "\n"
    "THE STORY (7-9 scenes):\n"
    "1. hook — the change in one line (\"How one mini-mart stopped losing night orders\").\n"
    "2. customer — who they are and their problem.\n"
    "3-4. the struggle and the turning point — another `customer` scene (a new mood), or a "
    "`beforeafter`.\n"
    "5. beforeafter — life before vs after.\n"
    "6. result — one number that shows the change (only a TRUE number, see HONESTY).\n"
    "7. review — ONLY with the customer's real words from the brief.\n"
    "last. cta — invite the viewer to get the same (message us, book a demo).\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- customer: name (first name only), business (2-5 words, e.g. \"Mini-mart owner · Siem "
    "Reap\"), text (max 12 words — their situation now), mood (happy | excited | sad | worried "
    "| thinking).\n"
    "- beforeafter: title (max 5 words, optional), before (max 12 words), after (max 12 words).\n"
    "- result: value (a number), prefix (\"\" or \"$\"), suffix (\"\", \"%\", \"x\", \"+\"), label (max 8 words).\n"
    "- review: text (the customer's real words, max 25 words), name, stars (1-5).\n"
    "- cta: text (max 8 words), button (1-3 words).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Heart", "say": "..."}, ...]}'
)

# How SaaS product videos are made — shared by "Designed for you" and Product demo.
_SAAS_CRAFT = (
    "HOW GREAT SAAS VIDEOS WORK (follow it):\n"
    "1. PRODUCT-LED — the product (or the tool the brief is about) is the hero. At least HALF of "
    "the scenes SHOW it working (screen, step, flow, dashboard) instead of talking about it.\n"
    "2. ONE CLEAR TRANSFORMATION — a specific painful moment before, a specific outcome after. "
    "Name the job to be done (\"approve leave in 2 minutes\"), never a vague promise (\"boost "
    "productivity\").\n"
    "3. RHYTHM — never two scenes of the same type in a row (steps excepted); alternate a busy "
    "scene (screen, flow, dashboard, notify) with a light one (hook, reveal, stat); one idea per "
    "scene.\n"
    "4. COPY THAT READS LIKE SOFTWARE — titles are short labels, like UI (\"Auto-approve rules\", "
    "\"Live leave calendar\"): a verb or a concrete noun, specific numbers and times, max 7 words "
    "on screen. The voice explains; the screen shows. NEVER use: innovative, seamless, "
    "revolutionary, cutting-edge, game-changer, unlock, leverage, empower, synergy, solution(s), "
    "next-level, all-in-one.\n"
    "5. REAL NAMES — the real product, platform and UI names from the brief and the product "
    "information (\"Power Apps form\", \"approval in Teams\", \"SharePoint list\"), never generic "
    "\"the app\" when a name is known.\n"
)


# ── SaaS / AI templates (motion/src/saas.jsx) — one dark "AI" look ────────
TREND_TYPES = ("hook", "news", "reveal", "step", "flow", "list", "stat", "cta")
TREND_PROMPT = (
    "You are the best short-form tech storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 45-60 s) for AWARENESS: \"AI news\" — "
    "what is changing in AI and software for businesses, and what it means for the viewer. "
    "Dark AI look on a flat grid background: news cards, a live ticker, glass panels. Clear and exciting, "
    "never an ad — the brand is the one who keeps you up to date.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    "1. hook — the change in one line (\"Your customers now expect a reply in [5 minutes]\").\n"
    "2-4. news — 2-3 things that are happening, one `news` scene each, building up.\n"
    "5. list — what it means for the viewer: 3 simple things to do.\n"
    "6. stat — one TRUE, well-known number (optional — leave it out if you are not sure).\n"
    "last. cta — soft: follow for AI news every week, save it, share it.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- news: tag (1-3 words, the field, e.g. \"AI · Chatbots\"), headline (max 14 words — "
    "what is happening), text (max 16 words — why it matters for a business).\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value (a number), prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- reveal: text (max 10 words), icon — the one idea to remember, big.\n"
    "- step: title (max 7 words — one step of how it works), text (max 12 words), icon, result (max "
    "6 words, optional).\n"
    "- flow: title (max 6 words), nodes: 3-4 x {\"icon\", \"label\": 2-5 words} — how something "
    "moves from start to result.\n"
    "- cta: text (max 8 words), button (1-2 words, e.g. \"Follow\").\n"
    "NEWS HONESTY: only real, widely known developments and trends — never invent a "
    "product launch, a company announcement, a date, a version number or a statistic. When "
    "unsure, describe the trend in general words (\"more shops now answer customers with AI "
    "chat\") instead of a specific claim.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Newspaper", "say": "..."}, ...]}'
)

POV_TYPES = ("hook", "notify", "reveal", "list", "cta")
POV_PROMPT = (
    "You are the best short-form storyteller in Cambodia. You plan a vertical REMOTION VIDEO "
    "(TikTok / Facebook Reels, about 35-50 s) for REACH: a relatable \"POV:\" moment from the "
    "daily life of the brand's customers — the kind people tag a friend on because it is SO "
    "them. Dark AI look on a flat grid background: a phone blowing up with notifications, then the relief. "
    "Funny or warm, never an ad.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    "1. hook — starts with \"POV:\" and names the moment (\"POV: it's 11pm and your shop is "
    "[closed]\").\n"
    "2. notify — the phone fills up: 3-4 short real-sounding messages / notifications.\n"
    "3. a second `notify` (it gets worse) — optional.\n"
    "4. reveal — the turn: how it feels when it is handled (\"Then I let [AI] answer for me\"); "
    "keep it about the feeling, not features.\n"
    "5. list — 3 tiny relatable truths or tips (optional).\n"
    "last. cta — tag a friend who needs this / comment if this is you / follow.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 12 words, starts with \"POV:\" — in Khmer too), icon.\n"
    "- notify: title (max 8 words, optional — the moment, e.g. \"5 minutes later…\"), time "
    "(a clock time like \"23:47\", optional), notes: 3-4 x {\"app\": \"Messenger\" | "
    "\"Telegram\" | \"Facebook\" | \"TikTok\" | \"Mail\", \"text\": max 8 words — what the "
    "customer or the notification says}.\n"
    "- reveal: text (max 10 words), icon.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- cta: text (max 8 words), button (1-3 words, e.g. \"Tag a friend\").\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "POV: ...", "icon": "Smartphone", "say": "..."}, ...]}'
)

DEMO_TYPES = ("hook", "problem", "step", "screen", "flow", "dashboard", "chat", "stat", "list", "cta")
DEMO_PROMPT = (
    "You are the best short-form product storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 50-60 s) that shows a SOLUTION working: "
    "a quick product demo inside an app window — the pointer clicks, the result appears. "
    "Dark SaaS / AI look on a flat grid background. The viewer must understand in one watch how easy it is.\n"
    "\n"
    "THE STORY (7-9 scenes):\n"
    "1. hook — the result they want, or the pain (\"Answer 100 customers [without typing]\").\n"
    "2. problem — the pain today (optional).\n"
    "3-5. step — 3 steps of using the product, one `step` scene each: what you do and what "
    "happens. Steps a real user would really do with THIS product.\n"
    "6. chat — the product working for a customer (optional, when it talks to customers).\n"
    "7. stat or list — what they get (stat only with a TRUE number).\n"
    "last. cta — try it / book a demo / message us.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- problem: icon, title (2-5 words), text (max 10 words), count (an illustrative number for "
    "a badge, or 0).\n"
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 7 "
    "words), target (in ENGLISH: the ONE element to point at, e.g. \"the Submit button\"), action "
    "(\"click\" | \"highlight\"), result (max 6 words, optional) — the real product screen; prefer it "
    "to a drawn `step` when a screenshot shows that step.\n"
    "- step: title (max 7 words — the action, e.g. \"Connect your [Facebook Page]\"), text "
    "(max 12 words — what happens), icon, result (max 6 words — what the app shows when "
    "done, e.g. \"Page connected\").\n"
    "- flow: title (max 6 words), nodes: 3-4 x {\"icon\", \"label\": 2-5 words, \"sub\": the app, "
    "optional} — how work or data moves between apps.\n"
    "- dashboard: title (optional), metrics: 2-3 x {\"label\", \"value\", \"prefix\", \"suffix\", "
    "\"delta\"}, chart: \"line\" | \"bars\" — the product's live screen with small, believable SAMPLE "
    "data (never presented as a customer's results).\n"
    "- chat: title (max 7 words), messages: 3-4 x {\"from\": \"customer\"|\"brand\", \"text\": "
    "max 12 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "Only features the product information supports — never invent one.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "LayoutDashboard", "say": "..."}, ...]}'
)

OFFER_TYPES = ("hook", "offer", "list", "stat", "cta")
OFFER_PROMPT = (
    "You are the best short-form sales storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 35-45 s) for CONVERSION: a clear offer "
    "and a reason to act now. Dark AI look on a flat grid background, with a pricing card. Confident and "
    "direct — one offer, one action.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    "1. hook — the offer's promise or the pain it ends (\"Stop losing night orders — from "
    "[$29]\").\n"
    "2. list — 3 things they get.\n"
    "3. offer — the pricing card.\n"
    "4. stat — one TRUE number that proves the value (optional).\n"
    "last. cta — exactly how to get it (\"Message us 'PRO'\", \"Start free\", \"Book a demo\").\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- offer: plan (the product / plan name, 1-4 words), price (e.g. \"$29\", \"Free\"), period "
    "(e.g. \"/month\", or \"\"), was (the old price, or \"\"), badge (1-3 words, e.g. \"Launch "
    "offer\", or \"\"), features: 3 x short phrases (2-5 words).\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "OFFER HONESTY: price, old price, discount and deadline ONLY when the brief or the product "
    "information gives them — otherwise leave price/was \"\" and make the offer the plan and "
    "what they get (e.g. badge \"Free demo\"). Never invent a discount or a deadline.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "BadgePercent", "say": "..."}, ...]}'
)

# ── 3D · Spotlight (motion/src/spotlight.jsx) ──────────────────────────────
# The Offer story on a real 3D stage: the brand kit's product photo on a box
# that turns under a spotlight (three.js). Same scene types and fields as Offer.
SPOTLIGHT_TYPES = OFFER_TYPES
SPOTLIGHT_PROMPT = (
    "You are the best short-form sales storyteller in Cambodia. You plan a REMOTION VIDEO "
    "(TikTok / Facebook Reels, about 30-40 s) that SHOWS A PRODUCT like a launch film: a dark "
    "studio, a spotlight from above, and the product as a real 3D box that flies in, turns "
    "and lands beside a glowing price card. Premium, confident, one product, one action.\n"
    "\n"
    "THE STORY (5-6 scenes):\n"
    "1. hook — the product's promise in a few words, while the 3D box flies in (\"New iced "
    "latte — [fresher] than ever\").\n"
    "2. list — 3 things that make it special, as cards beside the turning product.\n"
    "3. offer — the product card: name, price, what comes with it.\n"
    "4. stat — one TRUE number that proves it (optional).\n"
    "last. cta — exactly how to get it (\"Order today\", \"Message us 'LATTE'\").\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- offer: plan (the product name, 1-4 words), price (e.g. \"$2.50\", or \"\"), period (or \"\"), "
    "was (the old price, or \"\"), badge (1-3 words, e.g. \"New\", or \"\"), features: 3 x short phrases (2-5 words).\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "The product's own picture (from the brand kit) is put on the box for you — never describe or "
    "ask for pictures.\n"
    "OFFER HONESTY: price, old price, discount and deadline ONLY when the brief or the product "
    "information gives them — otherwise leave price/was \"\" and let the offer be the product "
    "and what comes with it. Never invent a discount or a deadline.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Sparkles", "say": "..."}, ...]}'
)

# ── The clean goal templates (motion/src/clean.jsx) ────────────────────────
COUNTDOWN_TYPES = ("hook", "rank", "reveal", "stat", "list", "cta")
COUNTDOWN_PROMPT = (
    "You are the best short-form creator in Cambodia. You plan a REMOTION VIDEO (about 40-55 s): a "
    "\"TOP 5\" COUNTDOWN — the kind people watch to the end and share. Clean, bright page, a neat "
    "grid; each item's big number slams in, its card slides in beside it.\n"
    "\n"
    "THE STORY (7-8 scenes):\n"
    "1. hook — the promise of the list (\"5 things your customers notice [first]\").\n"
    "2-6. rank — 5 items, counting DOWN: the 5th first, the best one LAST (the payoff). Each a "
    "useful, specific idea about the topic — never filler.\n"
    "7. reveal — the one thing to remember (optional).\n"
    "last. cta — save it / follow for more / share with a friend.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- rank: title (the item, max 6 words), text (why, max 12 words), icon — numbered 5 → 1 for you, "
    "in the order you give them.\n"
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Trophy", "say": "..."}, ...]}'
)

THISORTHAT_TYPES = ("hook", "choice", "reveal", "stat", "list", "cta")
THISORTHAT_PROMPT = (
    "You are the best short-form creator in Cambodia. You plan a REMOTION VIDEO (about 35-50 s): "
    "\"THIS OR THAT\" — quick A-or-B choices about the topic that make people comment their pick. "
    "Clean, bright page; two cards slide in face to face with a VS between them.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    "1. hook — the game (\"Which one are [you]?\").\n"
    "2-5. choice — 3-4 choices, each two real options people in Cambodia really argue about, about "
    "the brand's topic.\n"
    "6. reveal — the brand's own answer or tip (optional).\n"
    "last. cta — comment your answers / tag a friend.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- choice: question (max 8 words), left: {\"name\": option A, 1-3 words, \"icon\"}, right: "
    "{\"name\": option B, 1-3 words, \"icon\"}, percent (the share who picked A in a REAL poll from "
    "the brief — else 0, and no bars are shown), prompt (max 5 words, e.g. \"Comment A or B\").\n"
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Split", "say": "..."}, ...]}'
)

REVIEWS_TYPES = ("hook", "reviews", "logos", "stat", "list", "reveal", "step", "cta")
REVIEWS_PROMPT = (
    "You are the best short-form storyteller in Cambodia. You plan a REMOTION VIDEO (about 35-50 s) "
    "that builds TRUST with social proof: a review wall — the score counting up, real reviews flying "
    "in round it, the names of real customers sliding past. Clean, warm, bright.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    "1. hook — what people say, or the doubt it answers.\n"
    "2. reviews — the score and 2-4 real reviews.\n"
    "3. logos — who uses it (only real names).\n"
    "4. list or step — what they get / how easy it is to start.\n"
    "5. stat — a TRUE number (optional).\n"
    "last. cta — try it / message us / see more reviews.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- reviews: title (2-3 words, e.g. \"Customers say\"), rating (e.g. 4.9 — only a real rating from "
    "the brief, else 0), count (e.g. \"1,240 reviews\" — only real, else \"\"), cards: 2-4 x "
    "{\"name\": first name, \"text\": their words, max 12 words, \"stars\": 1-5}.\n"
    "- logos: title (max 6 words, e.g. \"Trusted by [200+] shops\"), names: 4-8 real customer or "
    "partner names.\n"
    "- step: title (max 7 words), text (max 12 words), icon, result (max 6 words, optional).\n"
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    "REVIEW HONESTY: `reviews` cards, ratings, counts and `logos` names ONLY when the brief or the "
    "product information gives them — real words, real names, never invented, never reworded into "
    "a claim. Without them, leave those scenes out and build trust with `list`, `step` and `reveal` "
    "(what they get, how it works, a guarantee the brief states).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Star", "say": "..."}, ...]}'
)

HOTTAKE_TYPES = ("hook", "take", "choice", "reveal", "list", "stat", "cta")
HOTTAKE_PROMPT = (
    "You are the sharpest voice in your industry in Cambodia. You plan a REMOTION VIDEO (about "
    "30-45 s): a HOT TAKE — a clear, slightly surprising opinion about the topic that experts would "
    "nod at and others would argue with in the comments. Clean page, big bold words; a common belief "
    "gets struck out and the take slams in.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    "1. hook — the provocation in one line (\"Unpopular opinion: [discounts] kill small shops\").\n"
    "2-3. take — 1-2 takes: what most people believe (before), struck out, and what is actually "
    "true (text).\n"
    "4. list or reveal — the reasoning: 3 short points, or the one idea that proves it.\n"
    "5. choice — agree or disagree? (left \"Agree\", right \"Disagree\").\n"
    "last. cta — comment your side / follow for more takes.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- take: before (the common belief, max 8 words, or \"\"), text (the take, max 12 words).\n"
    "- choice: question (max 8 words), left: {\"name\", \"icon\"}, right: {\"name\", \"icon\"}, "
    "percent: 0, prompt (max 5 words).\n"
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    "A strong opinion, never an insult, never about a named person or company, never a false fact.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Flame", "say": "..."}, ...]}'
)

CASESTUDY_TYPES = ("hook", "client", "metrics", "timeline", "quote", "step", "flow", "reveal", "cta")
CASESTUDY_PROMPT = (
    "You are the best B2B storyteller in Cambodia. You plan a REMOTION VIDEO (about 40-55 s): a "
    "CASE STUDY — one customer, the problem they had, what they did with the product, and the "
    "result in numbers. Clean, calm, credible: cards, before → after bars, a timeline, one quote.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    "1. hook — the result in one line (\"How a grocery shop [doubled] night orders\").\n"
    "2. client — who they are and their challenge.\n"
    "3. timeline or step / flow — what they did, in order.\n"
    "4. metrics — before → after.\n"
    "5. quote — the customer in their own words.\n"
    "6. reveal — the lesson (optional).\n"
    "last. cta — get the same result / book a demo.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- client: name (the customer or business), field (their trade · city, max 5 words), text (their "
    "challenge, max 16 words), example (true unless the brief tells a REAL customer's case).\n"
    "- metrics: title (max 6 words), rows: 2-3 x {\"label\": max 3 words, \"before\": number, "
    "\"after\": number, \"prefix\", \"suffix\"}.\n"
    "- timeline: title (max 6 words), steps: 3-4 x {\"when\": \"Week 1\" / \"Month 2\", \"text\": max 6 words}.\n"
    "- quote: text (max 18 words), author (first name), role (e.g. \"Owner, Sokha Mart\").\n"
    "- step: title (max 7 words), text (max 12 words), icon, result (max 6 words, optional).\n"
    "- flow: title (max 6 words), nodes: 3-4 x {\"icon\", \"label\": 2-5 words, \"sub\": the app, optional}.\n"
    "- reveal: text (max 10 words), icon.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "CASE HONESTY: a REAL customer, real numbers and a real quote ONLY when the brief gives them — "
    "then example is false and you use exactly what it says. Otherwise it is an EXAMPLE customer "
    "(example: true — the video says so): a believable local business, small believable numbers, "
    "and the quote is what such an owner would say — never a real company's name.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Building2", "say": "..."}, ...]}'
)

FAQ_TYPES = ("hook", "qa", "list", "reveal", "step", "cta")
FAQ_PROMPT = (
    "You are the most helpful customer-support voice in Cambodia. You plan a REMOTION VIDEO (about "
    "40-55 s): an FAQ — the 3-4 questions customers really ask about the brand's product or topic, "
    "each popping in as a chat bubble, the answer typing itself in. Clean, friendly, clear.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    "1. hook — the promise (\"Your top [4 questions], answered\").\n"
    "2-5. qa — 3-4 real questions (price, how it works, language, support, delivery…), most asked first.\n"
    "6. reveal or list — anything else worth knowing (optional).\n"
    "last. cta — ask your own question in the comments / message us.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- qa: q (the question, max 10 words, as a customer would type it), a (the answer, max 22 words, "
    "plain and direct) — numbered for you.\n"
    "- step: title (max 7 words), text (max 12 words), icon, result (max 6 words, optional).\n"
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    "ANSWERS only from the product information and the brief — when it doesn't say (a price, a "
    "date), answer how to find out (\"message us for today's price\") instead of guessing.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "MessageCircleQuestion", "say": "..."}, ...]}'
)

REPORT_TYPES = ("hook", "bars", "donut", "stat", "list", "reveal", "cta")
REPORT_PROMPT = (
    "You are a data storyteller in Cambodia. You plan a REMOTION VIDEO (about 35-50 s): a DATA "
    "REPORT — a few numbers that change how people see the topic, each drawn clean: bars growing, "
    "a ring filling, a big number. Calm and credible, every number with its source.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    "1. hook — the most surprising number as a question or statement.\n"
    "2-4. bars / donut / stat — 2-3 data scenes, each one finding.\n"
    "5. reveal — what it means for the viewer.\n"
    "6. list — 3 things to do about it (optional).\n"
    "last. cta — follow for more / save it.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- bars: title (max 7 words), data: 3-6 x {\"label\": max 3 words, \"value\": number}, prefix, "
    "suffix (e.g. \"%\"), source (who measured it, max 6 words).\n"
    "- donut: value (a percent 1-99), label (what that percent is, max 8 words), source.\n"
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    "DATA HONESTY: numbers ONLY from the brief, the product information, or well-known public data "
    "you are sure of — always with `source`. Never invent a statistic; with no real data, use fewer "
    "data scenes and more `reveal` / `list`.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "ChartBar", "say": "..."}, ...]}'
)

TIPS_TYPES = ("hook", "tip", "reveal", "stat", "save", "cta")
TIPS_PROMPT = (
    "You are the best short-form teacher in Cambodia. You plan a REMOTION VIDEO (about 40-55 s): "
    "TIP CARDS — 3-5 practical tips people SAVE to use later. Clean, fresh page; each numbered card "
    "flips onto the stack; at the end a bookmark fills as the hand taps Save.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    "1. hook — the result the tips give (\"5 tips to get [more replies] tonight\").\n"
    "2-6. tip — 3-5 tips, each one specific action they can do today (not a vague idea), best last.\n"
    "7. save — ask them to save it, in one line.\n"
    "last. cta — follow for a new tip every week.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- tip: title (the action, max 6 words), text (how / why, max 14 words), icon — numbered for you.\n"
    "- save: text (max 8 words, e.g. \"Save this for your [next post]\"), button (1 word, e.g. \"Save\").\n"
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Lightbulb", "say": "..."}, ...]}'
)

# ── SaaS explainer (motion/src/clarity.jsx) — calm, white and light blue ────
CLARITY_TYPES = ("hook", "chaos", "platform", "orbit", "phones", "pair", "step", "screen", "flow", "dashboard", "reveal", "list", "stat", "cta")
CLARITY_PROMPT = (
    "You are the director of calm, premium SaaS explainer videos. You plan a REMOTION VIDEO (about "
    "45-60 s) that EXPLAINS what a software product does and why it matters: soft white and light "
    "blue, thin rings, words that sharpen into place one by one, notifications flying in from every "
    "side, the real app rising in a device frame, chips orbiting the one thing that matters, phones "
    "turning round a word. Quiet confidence — few words on screen, each one earning its place.\n"
    "\n"
    "THE STORY (8-10 scenes):\n"
    "1. hook — the everyday reality in one line.\n"
    "2. chaos — the mess today: messages, emails and tasks piling up from the tools they use, round "
    "one calm line (\"The work keeps moving.\").\n"
    "3. platform — the product appears: its logo and one line of what it is.\n"
    "4-7. how it works: `orbit` (the one item everything connects to and its parts), `pair` (two "
    "words round one object — \"Any language · Instantly\"), `phones` (what it handles, a word at a "
    "time), `step`, `screen`, `flow` or `dashboard` — three or four of these, different types.\n"
    "8. reveal or stat — the outcome (stat only with a TRUE number).\n"
    "last. cta — calm and clear: book a demo / try it.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    "- chaos: text (max 6 words — the calm line in the middle), cards: 5-6 x {\"app\": a real tool "
    "(\"Slack\", \"Gmail\", \"Teams\", \"Telegram\", \"Excel\", \"Trello\"…), \"title\": max 5 words, "
    "\"sub\": max 4 words — a believable notification}.\n"
    "- platform: text (what the product is, max 8 words), shot (a screenshot number from THE BRAND'S "
    "SCREENSHOTS, or 0 when there are none).\n"
    "- orbit: center: {\"icon\", \"title\": the one item, 2-4 words, \"sub\": a sample reference "
    "like \"SOW-2025-0008\", optional}, tags: 4-5 x {\"icon\", \"label\": 1-2 words — its parts}, "
    "text (max 8 words).\n"
    "- phones: words: 3-4 single words, each ending with a full stop (\"Books.\", \"Videos.\") — the "
    "things it works on; shots: screenshot numbers for the phones (from THE BRAND'S SCREENSHOTS, or []).\n"
    "- pair: left (2-3 words), right (1-2 words — the payoff), icon, label (1-2 words on the card).\n"
    "- step: title (max 7 words), text (max 12 words), icon, result (max 6 words, optional).\n"
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 7 "
    "words), target (in ENGLISH: the ONE element to point at), action (\"click\" | \"highlight\"), "
    "result (max 6 words, optional).\n"
    "- flow: title (max 6 words), nodes: 3-4 x {\"icon\", \"label\": 2-5 words, \"sub\": the app, optional}.\n"
    "- dashboard: title (optional), metrics: 2-3 x {\"label\", \"value\", \"prefix\", \"suffix\", "
    "\"delta\"}, chart: \"line\" | \"bars\" — small, believable SAMPLE data.\n"
    "- reveal: text (max 10 words), icon.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "Only features the product information supports — never invent one. Names in notifications "
    "and references are samples, never real customers.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Sparkles", "say": "..."}, ...]}'
)

# ── Product launch (motion/src/launch.jsx) — a cinematic launch film ─────────
LAUNCH_TYPES = ("hook", "launch", "button", "form", "stack", "screen", "flow", "dashboard", "reveal", "list", "stat", "cta")
LAUNCH_PROMPT = (
    "You are the director of premium SaaS launch films in Cambodia. You plan a REMOTION VIDEO (about "
    "40-60 s) that LAUNCHES a product or a new feature: deep purple stage light, a big tilted app card "
    "with a glowing mint edge, the camera pushing in on one button while a cartoon hand clicks it, "
    "fields typing themselves in, the product's real screens stacking up like a deck. Cinematic, "
    "confident, few words on screen — the moment of the click is the hero.\n"
    "\n"
    "THE STORY (7-9 scenes):\n"
    "1. hook — the pain or the promise in one line (\"Still chasing approvals by [email]?\").\n"
    "2. launch — introduce the product or feature by name, with its one-line promise.\n"
    "3-6. the product working, the hand doing it: `form` (filling in what the user fills in), "
    "`button` (the ONE click that does the job, and what happens), `stack` (the real screens, when "
    "there are screenshots), `screen`, `flow` or `dashboard` — three or four of these, different "
    "types, in the order a user would really do it.\n"
    "7. reveal or stat — the one thing to remember (stat only with a TRUE number).\n"
    "last. cta — try it / book a demo / it's live today.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    "- launch: name (the product or feature name, as written), text (its promise, max 10 words), "
    "badge (1-2 words, e.g. \"Now live\", \"New\", \"Beta\").\n"
    "- button: title (what the card is, 2-4 words, e.g. \"Leave request\"), text (one detail line, "
    "max 8 words, sample data), button (the action, 1-3 words — e.g. \"Send for approval\"), result "
    "(what happens, max 6 words).\n"
    "- form: title (2-4 words), fields: 2-3 x {\"label\": 1-2 words, \"value\": what a user types, max "
    "4 words, sample data}, toggle (a setting switched on, max 6 words, optional).\n"
    "- stack: words: 2-3 single big words that change as the screens arrive (\"direct\", \"fast\", "
    "\"yours\"), shots: 2-4 screenshot numbers — only from THE BRAND'S SCREENSHOTS, never without them.\n"
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 7 "
    "words), target (in ENGLISH: the ONE element to point at), action (\"click\" | \"highlight\"), "
    "result (max 6 words, optional).\n"
    "- flow: title (max 6 words), nodes: 3-4 x {\"icon\", \"label\": 2-5 words, \"sub\": the app, optional}.\n"
    "- dashboard: title (optional), metrics: 2-3 x {\"label\", \"value\", \"prefix\", \"suffix\", "
    "\"delta\"}, chart: \"line\" | \"bars\" — small, believable SAMPLE data.\n"
    "- reveal: text (max 10 words), icon.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "Only features the product information supports — never invent one. Typed values and card "
    "details are sample data, never a real customer's.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Rocket", "say": "..."}, ...]}'
)

# ── Unveil (motion/src/unveil.jsx) — a light, airy product launch ──────────
UNVEIL_TYPES = ("hook", "word", "field", "done", "screen", "flow", "dashboard", "reveal", "list", "stat", "cta")
UNVEIL_PROMPT = (
    "You are the director of premium product launch films in Cambodia. You plan a REMOTION VIDEO "
    "(about 35-55 s) that UNVEILS a product or a new feature the way the big software companies do: "
    "a bright white stage with soft teal and blue light, one huge thin word filling the top of the "
    "frame while the real app card rises into focus under it, cards flying past the camera out of "
    "focus, a field typing itself in, and a glossy check with confetti when the job is done. Calm, "
    "elegant, very few words on screen — the product's moment is the hero.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    "1. hook — the promise in one line (\"Approvals in one place\").\n"
    "2-5. the feature at work, the way a user really does it, 2-4 of: `word` (the ONE word for what "
    "it lets you do + the card that does it), `field` (what the user types, then the button), "
    "`screen` / `flow` / `dashboard` (the real screens, when there are screenshots).\n"
    "then. done — the result, in 2-4 words (\"User invited\", \"Request approved\").\n"
    "last. cta — try it / it's live today.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    "- word: word (ONE word, the verb or idea, e.g. \"Collaborate\", \"Approve\", \"សហការ\"), title (the "
    "card's title, 2-4 words, e.g. \"Collaborators (2)\"), action (a small link on the card, 1 word, "
    "optional), text (one short line on the card, max 12 words, optional), rows: 1-3 x {\"name\": a "
    "person or item, 2-3 words, sample data, \"sub\": their role or a detail, max 4 words}.\n"
    "- field: label (what the field is, 1-3 words, e.g. \"Invite by email\"), value (what the user "
    "types, max 5 words, sample data — an email, a name, an amount), button (the action, 1-2 words, "
    "e.g. \"Invite\").\n"
    "- done: text (the result, 2-4 words), icon (optional).\n"
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 7 "
    "words), target (in ENGLISH: the ONE element to point at), action (\"click\" | \"highlight\"), "
    "result (max 6 words, optional).\n"
    "- flow: title (max 6 words), nodes: 3-4 x {\"icon\", \"label\": 2-5 words, \"sub\": the app, optional}.\n"
    "- dashboard: title (optional), metrics: 2-3 x {\"label\", \"value\", \"prefix\", \"suffix\", "
    "\"delta\"}, chart: \"line\" | \"bars\" — small, believable SAMPLE data.\n"
    "- reveal: text (max 10 words), icon.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "Only features the product information supports — never invent one. Names, emails and typed "
    "values are sample data, never a real customer's.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Sparkles", "say": "..."}, ...]}'
)

# ── How it works · Grid (motion/src/gridcards.jsx) — solution / awareness ──
GRID_TYPES = ("hook", "tasks", "fanout", "reveal", "list", "stat", "step", "flow", "cta")
GRID_PROMPT = (
    "You are the best explainer-video director in Cambodia. You plan a REMOTION VIDEO (about 30-50 s) "
    "that shows how a product or service SOLVES a daily problem, the way the best Khmer TikTok "
    "explainers do: pale grid paper, navy and lime green, bold Khmer headlines with a lime marker "
    "under the key word, white cards with navy icon tiles, a tilted lime sticker, and subtitles that "
    "light up word by word. Clear, friendly, useful — one idea per scene.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    "1. hook — the everyday pain as a question or a line (\"Still writing every caption [by hand]?\").\n"
    "2. tasks — the repetitive work it takes today, and a sticker that names the pain.\n"
    "3. reveal or hook — the turn: the product does it for you.\n"
    "4. fanout — ONE input (the product, a photo, a message) becomes 2-3 results, numbered — the "
    "heart of the video.\n"
    "5. list, stat, step or flow — what else it gives, the proof (stat only with a TRUE number).\n"
    "last. cta — try it / message us.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    "- tasks: title (optional, max 7 words), items: 3 x {\"icon\", \"text\": the task, 2-5 words}, sticker "
    "(the pain in 2-4 words, e.g. \"ធ្វើដដែលៗរាល់ថ្ងៃ\").\n"
    "- fanout: title (the promise, max 7 words, e.g. \"1 photo, [3] posts\"), product (a product's name "
    "from the product information, when it is about one), icon (when there is no product), outputs: "
    "2-3 x {\"kind\": \"post\" | \"price\" | \"tags\" | \"chat\" | \"list\", \"value\": what it shows — "
    "the price for price (e.g. \"$12\"), the reply for chat (max 8 words), a platform for post "
    "(\"facebook\" | \"tiktok\" | \"instagram\" | \"telegram\"), optional otherwise}, checks: 1-2 short "
    "results (max 5 words each, e.g. \"Ready to post\").\n"
    "- reveal: text (max 10 words), icon.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- step: title (max 7 words), text (one line), result (max 6 words, optional).\n"
    "- flow: title (max 6 words), nodes: 3-4 x {\"icon\", \"label\": 2-5 words, \"sub\": optional}.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "Prices only from the product information. Only what the product really does.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Clock", "say": "..."}, ...]}'
)

# ── Tech explainer (motion/src/techflow.jsx) — how a technology works ───────
TECH_DEVICES = ("phone", "laptop", "router", "cloud", "server", "globe", "database", "lock", "user", "store")
TECHFLOW_TYPES = ("hook", "send", "address", "lookup", "hops", "assemble", "checklist", "cta")
TECHFLOW_PROMPT = (
    "You are the best tech-explainer director in Cambodia. You plan a REMOTION VIDEO (about 40-60 s) "
    "that explains HOW a technology works, step by step, so anyone understands it: a dark navy stage "
    "with a faint moving grid, flat line-drawn devices (phone, router, cloud, server, globe…), glowing "
    "cyan data packets travelling between them, an address changing, a question answered as it "
    "types out, packets hopping across a network, and a checklist to remember. Calm, clear, accurate "
    "— one idea per scene, max 8 words on screen.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    "1. hook — the question everyone has (\"What happens when you open a website?\"), device: the "
    "thing in the viewer's hand.\n"
    "2-6. the journey, in the order it really happens, 4-5 of: `send` (data goes from one device to "
    "the next), `address` (a name or number changes into another), `lookup` (a question asked of a "
    "server, its answer), `hops` (the path across many machines), `assemble` (the answer comes back "
    "and becomes what you see).\n"
    "7. checklist — the 3-4 ideas to remember, one or two words each.\n"
    "last. cta — follow for more / try it.\n"
    "\n"
    "DEVICES (the `device` / `icon` value of a device): phone, laptop, router, cloud, server, globe, "
    "database, lock, user, store.\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 8 words), device.\n"
    "- send: from {\"device\", \"label\": 1-3 words}, to {\"device\", \"label\"}, text (max 8 words — "
    "what is happening, e.g. \"Your data is split into packets\").\n"
    "- address: device, from (the first value, e.g. \"192.168.1.10\", max 20 chars), to (what it "
    "becomes, max 20 chars), text (max 8 words).\n"
    "- lookup: server (its short name, e.g. \"DNS\"), question (max 6 words, e.g. \"Where is "
    "google.com?\"), answer (max 20 chars, e.g. \"142.250.x.x\"), text (max 8 words, optional).\n"
    "- hops: nodes: 4-5 x {\"device\", \"label\": 1-2 words}, from the first stop to the last, text "
    "(max 8 words).\n"
    "- assemble: device (where it ends up), label (what forms, max 3 words, e.g. \"google.com\"), text "
    "(max 8 words).\n"
    "- checklist: title (max 5 words), checks: 3-4 x 1-3 words.\n"
    "- cta: text (max 8 words), button (2-4 words).\n"
    "Technically CORRECT — never invent a fact; simplify, don't distort. Addresses and numbers are "
    "examples (write x for hidden digits).\n"
    "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "device": "phone", "say": "..."}, ...]}'
)

# ── AI design (motion/src/canvas.jsx) — the AI designs every scene ─────────
# It picks a designed layout per scene and fills it (app/canvas_layouts.py);
# older designs (layers placed by the AI) still draw.
# The AI writes a DESIGN (layers, colours, motion) — never code; canvas.jsx
# draws any design _clean_canvas lets through, so every video can look new.
# "AI explainer · Neural" (motion/src/neural.jsx) — navy, a drifting neural
# network, blue / purple / amber: tech & AI explainers, lessons, history.
PAPER_TYPES = ("hook", "list", "beforeafter", "timeline", "compare", "quote", "stat", "cta")
NEURAL_TYPES = (*PAPER_TYPES, "table", "meme")
MEME_FACES = ("laughing", "shocked", "thinking", "cool", "crying", "happy")
_EXPLAINER_BASE = (
    "You are the best short-form TECH & AI explainer in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Reels / Shorts, 45-90 s) that teaches one idea about technology or "
    "AI and leaves the viewer motivated: a big question, a clear answer, a before / after, a "
    "lesson to remember. Look: navy with a glowing neural network, electric blue and purple, "
    "amber highlights — calm, smart, premium.\n"
    "\n"
    "THE STORY (6-10 scenes):\n"
    "1. hook — the big question that makes them stop (\"Will AI take your job — or help you?\").\n"
    "2-3. list — the answer, 2-4 short lines.\n"
    "4. beforeafter — the old way vs the way with AI (or with the brand's product).\n"
    "5. timeline (a short history: when → what) OR compare (two people who chose differently) OR "
    "stat (only a TRUE number from the brief or the product information).\n"
    "6. quote — the one lesson to remember.\n"
    "last. cta — a question people answer in the comments.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- list: title (max 7 words), items: 2-4 x {icon, text (2-7 words)}.\n"
    "- beforeafter: title (max 6 words), before (max 10 words — the old way), after (max 10 "
    "words — the new way).\n"
    "- timeline: title (max 6 words), steps: 3-6 x {when (a year or a moment, max 12 "
    "characters), text (max 9 words)} — real dates only.\n"
    "- compare: title (max 7 words), left and right: {name (a first name), mood (happy | excited "
    "| sad | worried | thinking), value (max 6 words — their habit or result), tone (good | "
    "bad)} — left the old habit (bad), right the new (good).\n"
    "- quote: text (max 18 words — the lesson), author (optional), role (optional).\n"
    "- stat: value (a number), prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 12 words — a question for the comments), button (1-3 words, e.g. "
    "\"Follow\", \"Comment\").\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Brain", "say": "..."}, ...]}'
)
# Neural also has a dataset (a small table of examples) and a meme
NEURAL_PROMPT = _EXPLAINER_BASE.replace(
    "5. timeline (a short history: when → what) OR compare",
    "5. timeline (a short history: when → what) OR table (a tiny dataset — the examples an AI "
    "learns from) OR meme (one relatable joke about the topic) OR compare",
).replace(
    "- cta: text (max 12 words — a question for the comments)",
    "- table: title (max 6 words), columns: 2-3 short headers, rows: 3-5 x [one cell per column, "
    "max 4 words each] — a small dataset, e.g. message → label.\n"
    "- meme: top (max 10 words — the setup everyone knows), bottom (max 10 words — the "
    "punchline), mood (laughing | shocked | thinking | cool | crying | happy) — light, never mean.\n"
    "- cta: text (max 12 words — a question for the comments)",
)

# "AI notes · Paper" (motion/src/paper.jsx) — the same story as Neural, on light
# paper: black and red, tech icons floating round the words, AI maths behind.
PAPER_PROMPT = _EXPLAINER_BASE.replace(
    "Look: navy with a glowing neural network, electric blue and purple, amber highlights — calm, "
    "smart, premium.",
    "Look: cool graph paper, deep navy and orange, tech icons floating around the words and "
    "faint AI maths behind — an editorial explainer, clever and clean.",
)

# "Doodle notes" (motion/src/doodle.jsx) — the Khmer self-help Reel: grid paper, a bold
# headline with its key words in orange and a hand-drawn ink sketch under it (app/doodle.py
# draws one per scene from its `draw`).
DOODLE_TYPES = ("hook", "doodle", "list", "quote", "cta")
DOODLE_PROMPT = (
    "You are the best short-form self-improvement storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (Reels / TikTok, 30-60 s) in the style of the popular Khmer \"growth\" "
    "pages: pale grid paper, a bold two-line headline with its key words in orange, and under "
    "it ONE simple hand-drawn ink sketch that shows the feeling — a person lying awake staring "
    "at the clock, a head full of scribbles, someone breathing slowly. Calm, wise, relatable: "
    "life, mindset, habits, money, work, relationships, learning — or the brand's field told "
    "the same way (a lesson, never a sales pitch).\n"
    "\n"
    "THE STORY (5-8 scenes):\n"
    "1. hook — the question everyone has asked themselves (\"Why do we always [overthink]?\").\n"
    "2-5. doodle — one idea per scene: the reason, what it does to us, the turn, what to do. "
    "Each its own picture.\n"
    "optional. list — 2-4 small things to try today.\n"
    "optional. quote — the one line to remember.\n"
    "last. cta — a gentle question for the comments or \"save this\".\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words — a question or a striking line), icon, draw.\n"
    "- doodle: title (max 8 words — the idea as a headline), text (optional, max 12 words — "
    "one line under the picture), icon, draw.\n"
    "- list: title (max 6 words), items: 2-4 x {icon, text (2-7 words)}.\n"
    "- quote: text (max 18 words — the lesson), author (optional — only a real person who "
    "said it).\n"
    "- cta: text (max 12 words), button (1-3 words, e.g. \"Follow\", \"Save\"), draw (optional).\n"
    "\n"
    "draw (ALWAYS in English, whatever the video's language): what the sketch shows, 10-25 "
    "words — one person (or two) and the props that tell the feeling, e.g. \"a young man lying "
    "awake in bed, eyes wide open, a wall clock above him, stress lines around\". Everyday "
    "Cambodian life when it fits. Never any text, signs, screens with words, logos or brand "
    "products in the picture. Each scene's drawing different from the others.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Brain", "draw": "...", "say": "..."}, ...]}'
)

# "Story · Characters" (motion/src/cartoon.jsx) — the Khmer cartoon-story Reel: two drawn
# characters in one AI-drawn place (app/doodle.py draw_place), talking in bubbles, thinking
# in clouds with an icon, the thing they talk about popping up beside them.
CARTOON_TYPES = ("hook", "talk", "note", "cta")
CARTOON_MOODS = ("happy", "excited", "sad", "worried", "thinking", "shocked", "angry")
CAST_LOOKS = ("cap", "apron", "tie", "glasses", "bun", "ponytail")
CAST_COLORS = ("green", "blue", "red", "orange", "purple", "grey", "teal", "yellow")
CARTOON_PROMPT = (
    "You are the best animated-story writer in Cambodia. You plan a REMOTION VIDEO (Reels / "
    "TikTok, 40-70 s) in the style of the popular Khmer cartoon-story pages: TWO simple cartoon "
    "characters in ONE everyday place (a mini-mart, a market stall, a coffee shop, an office, a "
    "home), talking to each other in speech bubbles. A real everyday problem, a funny or "
    "surprising turn, a clear lesson (or the brand's product as the fix, shown in the story — "
    "never an advert read out). The story's question stays on top of the screen.\n"
    "\n"
    "THE CAST — return \"cast\": exactly 2 x {name (a short Cambodian first name, or a role like "
    "the shop owner), look (one of: " + ", ".join(CAST_LOOKS) + "), color (one of: "
    + ", ".join(CAST_COLORS) + ")}. Character 1 is usually the one with the problem, 2 the one who "
    "helps or brings news. Give them different looks and colours.\n"
    "THE PLACE — return \"place\": the one place it all happens, in ENGLISH, 15-35 words — what "
    "is in it (counter, shelves, boxes, a fridge, a street outside…), Cambodian everyday life. No "
    "people, no text.\n"
    "\n"
    "THE STORY (7-11 scenes):\n"
    "1. hook — the story's question in a few words (\"Selling well... [where did the money go]?\").\n"
    "then talk scenes — the two take turns, short lines like real people talk, each moving the "
    "story on; a think scene when someone worries or gets an idea; a note scene when there is a "
    "list (stock, costs, steps).\n"
    "last. cta — the lesson as a question for the comments, or follow for part 2.\n"
    "\n"
    "SCENE TYPES and their fields (who = 1 or 2, mood one of: " + ", ".join(CARTOON_MOODS) + "):\n"
    "- hook: text (max 8 words), who, mood, icon (what the character is wondering about).\n"
    "- talk: who, mood, text (max 14 words — what they say, in the bubble), think (true when it "
    "is a thought, not said aloud), icon (with think: the thing in the cloud), item (optional "
    "{icon, label (max 3 words)} — the thing the line is about: the delivery, the money, the "
    "phone, a receipt).\n"
    "- note: who, mood, title (max 4 words), checks: 2-5 short lines (max 5 words each) — a "
    "clipboard list they hold up.\n"
    "- cta: text (max 12 words), button (1-3 words).\n"
    "`say` for a talk scene is that character speaking — the bubble's line said fully and "
    "naturally (it may add a few words); for hook / note / cta a narrator.\n"
    + _COMMON_RULES
    + '{"cast": [{"name": "...", "look": "apron", "color": "teal"}, {...}], "place": "...", '
    '"scenes": [{"type": "hook", "text": "...", "who": 1, "mood": "thinking", "icon": "Wallet", "say": "..."}, ...]}'
)

# "Reaction meme" (motion/src/reaction.jsx) — the TikTok reaction-animal meme: the
# situation behind (the brand's screenshot / photo, or a drawn photo), a white meme
# caption on top, the funny bit circled in red, and 1-2 cut-out animals in front
# popping their mouths on the beat or freezing in shock. The animals are our own,
# drawn once per film (app/doodle.py draw_reaction).
REACTION_TYPES = ("hook", "react", "punch", "cta")
REACTION_MOODS = ("pop", "shock", "laugh", "side", "cry", "cool")
REACTION_ANIMALS = {
    "black-kitten": "a small fluffy black kitten with a white chest and big round amber eyes",
    "cream-cat": "a cream-and-white short-haired cat with a round face",
    "orange-cat": "a chubby orange tabby cat with a big round face",
    "grey-cat": "a fluffy grey British shorthair cat with copper eyes",
    "shiba": "a shiba inu dog with a cheeky face",
    "pug": "a fawn pug dog with big round eyes",
    "hamster": "a chubby golden hamster with full cheeks",
    "capybara": "a calm capybara",
}
REACTION_PROMPT = (
    "You are the funniest meme-page admin in Cambodia. You plan a REMOTION VIDEO (TikTok / Reels, "
    "8-20 s) in the reaction-meme format everyone shares: a relatable situation on screen, a short "
    "meme caption on top, and 1-2 animals in front REACTING — popping their mouths on the beat, "
    "freezing in shock, laughing. The joke is about the viewer's everyday life around the brief "
    "(a shop owner, a seller, an office worker, a customer) — the brand is the happy ending, never "
    "an advert read out.\n"
    "\n"
    "THE CAST — return \"cast\": 1 or 2 animals, each one of: " + ", ".join(REACTION_ANIMALS) + ". "
    "Two different ones when two react.\n"
    "\n"
    "THE MEME (3-5 scenes):\n"
    "1. hook — the setup everyone knows (\"Me after posting for 3 months: [47 followers]\").\n"
    "then react scenes — the situation getting worse or funnier, one beat each.\n"
    "then punch — the twist / punchline, one animal close up.\n"
    "last. cta — a short line + button (follow, comment, try it).\n"
    "\n"
    "SCENE TYPES and their fields (who = list of cast numbers 1-2 in front, moods = one per animal, "
    "each one of: " + ", ".join(REACTION_MOODS) + " — pop flaps on the beat, shock freezes screaming, "
    "laugh cackles, side gives side-eye, cry sobs, cool stays smug):\n"
    "- hook / react: text (max 12 words, the meme caption, [key words] marked), who, moods, "
    "bubble (optional, max 4 words — what an animal whispers / says, \"psst psst\"), and THE PICTURE "
    "behind: shot (the number of one of the brand's screenshots, when one shows the situation) OR "
    "product (a product's exact name) OR draw (in ENGLISH, 10-30 words: a realistic phone photo of "
    "the situation — an empty shop, a phone showing a chat, a pile of boxes; no text in it), and "
    "circle (optional, with shot only, in ENGLISH, a few words — the funny bit on that screenshot to "
    "circle in red: \"the follower count\", \"the 2 likes\").\n"
    "- punch: text (max 12 words, [key words]), who (one cast number), moods (one).\n"
    "- cta: text (max 10 words), button (1-3 words).\n"
    "`say` — optional: a short line in a deadpan meme voice; leave it empty when the caption says it "
    "all (memes often have no voice).\n"
    + _COMMON_RULES
    + '{"cast": ["black-kitten", "cream-cat"], "scenes": [{"type": "hook", "text": "...", "who": [1, 2], '
    '"moods": ["pop", "shock"], "bubble": "...", "draw": "...", "say": ""}, ...]}'
)

# "Collage · Studio" (motion/src/studio.jsx) — the polished academy / studio Reel:
# a soft light set, big thin words in the brand's deep colour, the brand kit's
# photos as cards sticking together like a collage, vines / leaves / a stone
# column / clouds for depth (drawn once, shipped with the app).
STUDIO_TYPES = ("hook", "collage", "statement", "pedestal", "cta")
STUDIO_PROMPT = (
    "You are the creative director of a premium design studio in Cambodia. You plan a REMOTION "
    "VIDEO (Reels / TikTok, 20-40 s) in an elegant editorial style: a soft light set, BIG THIN "
    "words, the brand's own photos as cards sticking together like a collage, green vines and a "
    "stone column for depth. Calm, confident, aspirational — for a school / academy, a studio, a "
    "premium shop or service showing what it does and inviting people in.\n"
    "\n"
    "THE STORY (4-6 scenes):\n"
    "1. hook — word (ONE big word, max 12 letters, often English: Creative, Portfolio, Design, "
    "Future…) and text (max 10 words, the line on the main photo: the invitation or the promise).\n"
    "then collage — word (one big word under the cards), tiles: 3-5 {icon, label (max 3 words)} — "
    "what the brand does / teaches / sells (shown as the brand's photos when it has them).\n"
    "then statement — text (max 12 words, an elegant line, [key words] marked), sub (optional, max "
    "8 words).\n"
    "then pedestal — title (max 3 words, the course / product / service name, often English, "
    "UPPERCASE reads best), left and right (max 6 words each — two short facts either side), icon.\n"
    "last. cta — text (max 10 words), button (1-3 words).\n"
    "`say` — the voice: warm, calm, inviting; one short sentence per scene.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "word": "Creative", "text": "...", "say": "..."}, '
    '{"type": "collage", "word": "Portfolio", "tiles": [{"icon": "Palette", "label": "..."}], "say": "..."}, ...]}'
)

# "Podcast · Story Talk" (motion/src/podcast.jsx) — the brand's podcaster tells a
# story / insight: at the desk in a cosy studio (shipped with the app), then out in
# 1-2 places the story goes, painted by the image model (doodle.BACKDROP_STYLE) behind
# our coded host — the same person in every scene.
PODCAST_TYPES = ("hook", "onair", "visit", "list", "cta")
PODCAST_POSES = ("stand", "hips", "wave", "idea", "point", "shrug", "laptop")
PODCAST_MOODS = ("happy", "excited", "thinking", "worried", "sad", "surprised")
MAX_PODCAST_PLACES = 2
PODCAST_PROMPT = (
    "You are the host of a popular Khmer storytelling podcast on YouTube / Facebook (45-90 s "
    "episodes). The host talks to the viewer from a cosy studio desk with a mic, then the video "
    "cuts away to where the story happens — the host stands in that place (a park, a home office, a "
    "market, a café, a classroom…), acting it out — and comes back to the desk for the lesson. A "
    "personal, honest, curious voice: a real situation, a choice, what happened, what we learn. "
    "Any topic the brief gives (money, work, business, life, tech, the brand's field); the brand "
    "may appear as part of the story, never as an advert read out.\n"
    "\n"
    "THE PLACES — return \"places\": 1-" + str(MAX_PODCAST_PLACES) + " places the story visits, in "
    "ENGLISH, 15-35 words each — what is there (trees, a path, a desk by a window, stalls…), the "
    "light and time of day, everyday Cambodia when it fits. No people, no text.\n"
    "\n"
    "THE EPISODE (6-10 scenes):\n"
    "1. hook — text (max 9 words: the episode's question or title, [key words] marked), icon. "
    "`say`: a hook that makes them stay (\"Have you ever…?\").\n"
    "then the story, cutting between the studio and the places:\n"
    "- onair: (at the studio desk) text (max 12 words — the point, [key words] marked), icon, "
    "gesture (talk or shrug), mood.\n"
    "- visit: (in a place) place (1 or 2 — which of THE PLACES), pose (one of: "
    + ", ".join(PODCAST_POSES) + " — laptop = sitting at a laptop at a table), mood, text (max 10 "
    "words — a caption for the moment, [key words] marked), icon (optional — what is on the host's "
    "mind, in a thought cloud).\n"
    "- list: (at the desk) title (max 6 words), items: 2-4 x {icon, text (max 6 words)} — steps / tips.\n"
    "last. cta — text (max 10 words: follow for the next episode, comment your story), button (1-3 words).\n"
    "mood one of: " + ", ".join(PODCAST_MOODS) + ".\n"
    "`say` is the HOST speaking, first person (\"I\", \"me\") — at the desk to the viewer, in a "
    "place telling what was happening (\"That morning I stood there thinking…\"); natural and "
    "warm, each line leading into the next.\n"
    + _COMMON_RULES
    + '{"places": ["...", "..."], "scenes": [{"type": "hook", "text": "...", "icon": "Mic", "say": "..."}, '
    '{"type": "visit", "place": 1, "pose": "hips", "mood": "thinking", "text": "...", "icon": "Signpost", "say": "..."}, ...]}'
)


def clean_places(raw) -> list[str]:
    """Podcast: the 1-2 places its story visits (English, for the image model)."""
    return [p for p in (_line(x, 400) for x in (raw if isinstance(raw, list) else [])) if p][:MAX_PODCAST_PLACES]


# "Presenter · Brand host" (motion/src/presenter.jsx) — the brand's own presenter: a
# friendly robot host in a T-shirt with the brand's logo, at a desk, who greets ("Hi! I'm
# Kalyan, BCIE's personal assistant"), brings today's topic and talks it through, a panel
# beside her showing the words. Drawn in code, the same host in every video.
PRESENTER_TYPES = ("hook", "speak", "list", "stat", "qa", "cta")
PRESENTER_GESTURES = ("present", "point", "thumb", "wave")
PRESENTER_PROMPT = (
    "You write for the brand's own video host — its personal assistant who presents a topic "
    "every day on Reels / TikTok (30-60 s), like a friendly professional content creator "
    "talking to camera. She sits at a desk in the brand's T-shirt, a panel beside her shows "
    "the key words. She explains ANY topic the brief gives — news, tips, how-to, an idea, the "
    "brand's product — clearly, warmly and with energy, never like an advert read out.\n"
    "\n"
    "THE STORY (5-8 scenes):\n"
    "1. hook — text (max 9 words: today's topic as a title or a question, [key words] marked), "
    "icon, draw. Its `say` IS her introduction: it starts with THE GREETING given below, word for "
    "word, then brings today's new topic in one sentence (Khmer: \"ថ្ងៃនេះ មានប្រធានបទថ្មីមួយ…\").\n"
    "then 3-6 scenes that explain it, one idea each, building to the most useful:\n"
    "- speak: text (max 12 words — the idea on the panel, [key words] marked), icon, gesture "
    "(one of: " + ", ".join(PRESENTER_GESTURES) + "), product (optional — a product's exact "
    "name when the line is about it: its photo goes on the panel), draw.\n"
    "- list: title (max 7 words), items: 2-4 x {icon, text (max 6 words)} — steps, tips, reasons.\n"
    "- stat: value (a number), prefix, suffix, label (max 8 words), icon — only a TRUE number "
    "from the brief or common knowledge.\n"
    "- qa: q (max 10 words — what people often ask), a (max 18 words — her answer).\n"
    "last. cta — text (max 10 words: follow for tomorrow's topic, comment, message us), button "
    "(1-3 words). Its `say` ends warmly, like a host signing off.\n"
    "draw — the PICTURE on the panel above the words, in ENGLISH, 10-30 words: one clear scene "
    "that shows the idea (a shop owner smiling at a phone full of messages, a robot helping at a "
    "desk…) — a colour illustration is made from it. No text in it, no logos, no brand or product "
    "packaging (a product's own photo is used for that). Give `draw` to the hook and to the 2 most "
    "important speak scenes only; leave it out elsewhere.\n"
    "`say` is HER talking to the viewer — first person, lively, natural, as a presenter speaks "
    "(\"let me show you…\", \"here is the trick…\"), each line leading into the next.\n"
    + _COMMON_RULES
    + '{"host": {"name": "...", "gender": "female"}, "scenes": [{"type": "hook", "text": "...", '
    '"icon": "Lightbulb", "say": "..."}, {"type": "speak", "text": "...", "icon": "MessageCircle", '
    '"gesture": "present", "say": "..."}, ...]}'
)
HOST_NAMES = {("female", True): "កល្យាណ", ("female", False): "Kalyan", ("male", True): "ដារ៉ា", ("male", False): "Dara"}


def host_greeting(host: dict, brand_name: str, khmer: bool) -> str:
    """Her first words, always the same shape: hello, who she is, whose assistant."""
    if khmer:
        me = "នាងខ្ញុំ" if host.get("gender") != "male" else "ខ្ញុំបាទ"
        return f"សួស្តី! {me} {host['name']} ជំនួយការផ្ទាល់របស់ {brand_name}។" if brand_name else f"សួស្តី! {me} {host['name']}។"
    return f"Hi! I'm {host['name']}, {possessive(brand_name)} personal assistant." if brand_name else f"Hi! I'm {host['name']}."


def possessive(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def clean_host(raw, khmer: bool, voice: str = "") -> dict:
    """Presenter · Brand host: her name and whether she's a he. The brief may name
    the host; else the default name — a male voice makes a male host."""
    raw = raw if isinstance(raw, dict) else {}
    gender = raw.get("gender") if raw.get("gender") in ("female", "male") else ("male" if voice == "male" else "female")
    return {"name": _line(raw.get("name"), 30) or HOST_NAMES[(gender, khmer)], "gender": gender}


def _host_intro(script: dict, brand_name: str, khmer: bool) -> None:
    """The hook's voice opens with her greeting — put back if the editors dropped it."""
    hook = next((s for s in script["scenes"] if s["type"] == "hook"), None)
    host = script.get("host") or {}
    if hook is not None and host.get("name") and host["name"] not in (hook.get("say") or ""):
        hook["say"] = _line(f"{host_greeting(host, brand_name, khmer)} {hook.get('say') or ''}".strip(), 300)


# "Lesson · Teacher" (motion/src/lesson.jsx) — a cartoon teacher with a pointer stick
# explains one idea on a whiteboard (list / steps / sum / bars), then shows it with 2-3
# example people. All drawn in code — no pictures to make.
LESSON_TYPES = ("hook", "whiteboard", "example", "remember", "cta")
BOARD_KINDS = ("list", "flow", "sum", "bars")
SUM_OPS = ("+", "-", "×", "÷")
LESSON_PROMPT = (
    "You are the best teacher on Khmer TikTok. You plan a REMOTION VIDEO (Reels / TikTok, "
    "40-80 s): a friendly cartoon teacher with a pointer stick explains ONE idea on a "
    "whiteboard — money, business, health, study, tech, the brand's field — then makes it "
    "real with 2-3 example people who do it differently. Simple, concrete, a little funny.\n"
    "\n"
    "THE STORY (6-9 scenes):\n"
    "1. hook — the question (\"Selling a lot [but no profit]?\").\n"
    "2-4. whiteboard — the idea, one board per step of the explanation; use DIFFERENT kinds: a sum "
    "(the maths), bars (where the money / time goes), flow (steps in order), list (things to do).\n"
    "then example — 2-3 people (Cambodian first names) who do it differently and what happens to "
    "each, the same idea, the same numbers as the board.\n"
    "optional. remember — the one line to remember, written on the board.\n"
    "last. cta — a question for the comments.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 8 words), icon.\n"
    "- whiteboard: title (max 7 words), kind (list | flow | sum | bars), parts: 2-4 x {icon, label (max "
    "4 words), value (optional, max 8 characters, e.g. \"$300\", \"30%\", \"2h\")}.\n"
    "  sum: 3-4 parts, the LAST is the result; a part may have op (+ | - | × | ÷, the sign before "
    "it, default +) — the maths MUST be right ($1000 - $700 = $300).\n"
    "  bars: 2-4 parts, each value a number — the bars are drawn to scale.\n"
    "  flow: 2-4 steps in order. list: 2-4 short points.\n"
    "- example: title (max 6 words), people: 2-3 x {name, look (cap | apron | tie | glasses | bun "
    "| ponytail), color (green | blue | red | orange | purple | grey | teal | yellow), mood (happy "
    "| excited | sad | worried | thinking | shocked | angry), icon, text (max 5 words — what they "
    "do), value (optional, max 8 characters — their result), tone (good | bad)}. Different looks "
    "and colours.\n"
    "- remember: title (max 4 words), text (max 12 words), icon.\n"
    "- cta: text (max 12 words), button (1-3 words).\n"
    "Example numbers may be made up when they are clearly an example — small round numbers, and "
    "the same numbers through the video. The teacher speaks every `say`, to the viewer.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "CircleDollarSign", "say": "..."}, '
    '{"type": "whiteboard", "title": "...", "kind": "sum", "parts": [...], "say": "..."}, ...]}'
)

# "Rise · Mindset" (motion/src/rise.jsx) — a motivational video told as one climb: a person
# climbs a staircase a step per habit while the sky turns from night to sunrise; old me vs
# new me, a seed growing, the lesson at the summit. All drawn in code.
RISE_TYPES = ("hook", "climb", "mirror", "grow", "summit", "cta")
RISE_PROMPT = (
    "You are the most uplifting mindset creator on Khmer TikTok. You plan a REMOTION VIDEO "
    "(Reels / TikTok, 35-60 s) that encourages people to live the best version of their life: "
    "warm, honest, never preachy — like an older sibling who believes in them. The video is ONE "
    "climb: a person climbs a staircase, one step per habit or mindset shift, while the night "
    "sky turns into sunrise; at the top, the lesson.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    "1. hook — the feeling they know (\"Tired of [waiting] for Monday?\").\n"
    "2-5. climb — one small, doable habit or mindset per step, in an order that builds; "
    "somewhere in the middle a mirror (old me vs new me) or a grow (small habits take time).\n"
    "then summit — the one line to remember.\n"
    "last. cta — a gentle question or \"start today\".\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words).\n"
    "- climb: title (max 7 words — the habit / mindset), text (optional, max 12 words — why it "
    "matters), word (max 3 words — written on the step, e.g. \"Wake at 5\", \"Read 10 pages\").\n"
    "- mirror: title (max 6 words), before (max 6 words — the old me), after (max 6 words — the "
    "new me).\n"
    "- grow: title (max 6 words), text (optional, max 12 words).\n"
    "- summit: text (max 14 words — the lesson), author (optional — only a real person who said it).\n"
    "- cta: text (max 10 words), button (1-3 words).\n"
    "Concrete beats abstract: \"walk 10 minutes after dinner\" not \"be healthy\". No guilt, no "
    "hustle-culture pressure, no promises of money.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "say": "..."}, {"type": "climb", "title": "...", "word": "...", "say": "..."}, ...]}'
)

CANVAS_TYPES = ("canvas",)
from app.canvas_layouts import LAYOUTS, LOOK_BACKGROUNDS, LOOKS  # noqa: E402
from app.canvas_layouts import layout_layers  # noqa: E402
from app.canvas_layouts import look as canvas_look  # noqa: E402
CANVAS_LAYERS = ("text", "card", "icon", "shape", "device", "logo", "image", "chart", "metric", "pill", "list", "alert", "stream")
CANVAS_BGS = ("solid", "gradient", "grid", "dots", "city", "streams", "particles", "rings", "spotlight", "aurora", "trails", "hex", "waves", "warp")
CANVAS_IN = ("fade", "rise", "drop", "scale", "pop", "slide-left", "slide-right", "blur", "zoom", "type")
CANVAS_LOOP = ("float", "pulse", "spin", "glow")
CANVAS_PROMPT = (
    "You are an award-winning motion designer and art director. You DESIGN a REMOTION VIDEO "
    "for this exact brief — an LED screen at a corporate event, a TikTok for a café, a SaaS "
    "launch… If the brief describes its own scenes, acts, colours or messages, FOLLOW THEM in "
    "order and keep their exact wording for titles and product names.\n"
    "\n"
    "HOW YOU DESIGN: you never place things yourself. Each scene picks ONE designed LAYOUT and "
    "fills its slots; the studio places everything so every frame is balanced. Vary the layouts "
    "through the film (never the same one twice in a row) and give it rhythm: a big hero, then "
    "detail, then a number, then the reveal.\n"
    "\n"
    "THE LOOK — return \"theme\": {\"look\": one of: "
    + "; ".join(f"{k} ({v['say']})" for k, v in LOOKS.items())
    + "; brand (the brand's own colour), \"accent\": \"#RRGGBB\" ONLY if the brief names its "
    "colours, \"backgrounds\": 1-2 of: " + ", ".join(LOOK_BACKGROUNDS) + ", \"pictures\": sketch (the "
    "default — hand-drawn ink sketches that draw themselves onto the scene) | flat (colour "
    "illustrations — ONLY when the brief asks for colourful / colour pictures)}. Each scene picks "
    "\"tone\": dark | light (keep runs of the same tone — switch only at a change of act) and "
    "\"bg\": one of the theme's backgrounds.\n"
    "\n"
    "THE LAYOUTS and their slots:\n"
    + "\n".join(f"- {k}: {v}" for k, v in LAYOUTS.items())
    + "\n"
    "SLOTS (fill only what the layout uses): kicker (1-4 words, a small label), title (max 10 "
    "words — wrap the key words in [brackets]), sub (max 14 words), icon (an icon name), visual "
    "({\"kind\": device, \"device\": phone | laptop | tablet, \"src\": \"shot:N\" or \"product:<name>\", "
    "\"lines\": up to 4 short rows shown on it} | {\"kind\": image, \"src\": \"product:<name>\" or "
    "\"shot:N\"} | {\"kind\": icon, \"icon\": …} | {\"kind\": chart, \"chart\": line | bars | donut, "
    "\"values\": 3-6 small SAMPLE numbers} | {\"kind\": picture, \"draw\": IN ENGLISH, 10-30 words — "
    "what the picture shows: the people, the place, the moment, e.g. \"a young Cambodian woman "
    "smiling at her phone behind the counter of a small coffee shop\", \"icon\": a fallback icon}), cards (2-3 x {icon, title (max 4 words), line (max 8 "
    "words)}), items (2-5 x {icon, text (2-6 words)}), value + prefix + suffix + label (metric — "
    "ONLY a true number), quote + author, steps (3 x {icon, label (max 3 words)}), before / after "
    "({title, lines: 1-3 short rows, icon}), alert ({text (max 6 words), level: info | warn | danger "
    "| ok}), cta (1-3 words — the end's button). PICTURES: at most 4 in the film, only where "
    "seeing the moment beats an icon (people, a place, a feeling); never draw the brand's product "
    "(use product:<name>) or a screen (use shot:N); never ask for words in a picture. hit: true on the scene's big reveal (2-3 a film); "
    "pause: 0.5-1.5 = a quiet near-black breath BEFORE the scene (the brief's \"pause before the "
    "reveal\").\n"
    "\n"
    "Every scene: {\"type\": \"canvas\", \"layout\": …, \"seconds\": 3-8, \"tone\": …, \"bg\": …, "
    "\"req\": [asks it delivers], …its slots…, \"say\": the voice line}.\n"
    "\n"
    "FIRST, THE CHECKLIST — \"asks\": read the brief line by line and list EVERY thing it asks "
    "for, one small item each (\"24/7 monitoring, threat detection\" = two items): {\"id\": \"R1\", "
    "\"kind\": text | visual | motion | timing | style | brand | avoid, \"need\": one sentence you "
    "could check on the screen, \"text\": the EXACT on-screen words when the brief quotes them "
    "(same script, spelling, capitals and mixed English/Khmer — never translate or correct a name)}. "
    "Every scene says which asks it delivers (\"req\"); EVERY ask is delivered by at least one "
    "scene, and quoted text appears character for character in a slot. Use the brand's "
    "screenshots in devices when they help.\n"
    "THE STORY: 6-12 scenes, following the brief's own order; the voice tells it as one story. The "
    "last scene is the end layout (logo, tagline, call to action).\n"
    "\n"
    + _COMMON_RULES
    + '{"asks": [{"id": "R1", "kind": "text", "need": "...", "text": "..."}, ...], "theme": {"look": "midnight", '
    '"backgrounds": ["grid", "rings"]}, "scenes": [{"type": "canvas", "layout": "hero", "req": ["R1"], "seconds": 5, '
    '"tone": "dark", "bg": "grid", "kicker": "...", "title": "...", "sub": "...", "icon": "Sparkles", "say": "..."}, ...]}'
)


TYPE_SCALE = (40, 44, 56, 64, 72, 96, 120, 150)


def clean_theme(raw, brand_hex: str = "#3B82F6") -> dict:
    """AI design's one design system for the film (see CANVAS_PROMPT)."""
    t = raw if isinstance(raw, dict) else {}
    kinds = [k for k in (t.get("backgrounds") or []) if k in CANVAS_BGS][:3] if isinstance(t.get("backgrounds"), list) else []
    return {
        "dark": _hex(t.get("dark"), "#0B1020"),
        "light": _hex(t.get("light"), "#F5F7FB"),
        "a": _hex(t.get("a"), brand_hex),
        "b": _hex(t.get("b"), "#22D3EE"),
        "backgrounds": kinds or ["grid", "aurora"],
        "card": "solid" if t.get("card") == "solid" else "glass",
        "radius": int(_num(t.get("radius"), 6, 28, 14)),
    }


def apply_theme(scene: dict, theme: dict) -> dict:
    """One AI-designed scene put into the film's design system: the theme's
    palette for its tone, one of the theme's backgrounds, the theme's cards,
    text on the type scale, the logo's corner left empty."""
    if scene.get("type") != "canvas" or not theme:
        return scene
    tone = theme.get("tones") or scene.get("tone")  # a look whose accent reads on one tone only keeps every scene there
    if tone not in ("dark", "light"):  # older designs: the tone their own palette had
        tone = (scene.get("pal") or {}).get("mode") if (scene.get("pal") or {}).get("mode") in ("dark", "light") else "dark"
    light = tone == "light"
    scene["tone"] = tone
    scene["pal"] = {
        "bg": theme["light"] if light else theme["dark"],
        "a": theme["a"],
        "b": theme["b"],
        "ink": "#0F172A" if light else "#FFFFFF",
        "sub": "rgba(15,23,42,0.66)" if light else "rgba(226,232,255,0.72)",
        "mode": tone,
    }
    bg = dict(scene.get("bg") or {})
    if bg.get("kind") not in theme["backgrounds"]:
        bg["kind"] = theme["backgrounds"][0]
    bg.pop("color", None)
    bg.pop("color2", None)  # the theme's colours, not a one-off
    scene["bg"] = bg
    for L in scene.get("layers") or []:
        if L["kind"] == "card":
            L["glass"] = theme["card"] == "glass"
            L["radius"] = theme["radius"]
            L.pop("fill", None)
        if L["kind"] in ("image", "device") and "radius" in L:
            L["radius"] = theme["radius"]
        if L["kind"] == "text":
            L["size"] = min(TYPE_SCALE, key=lambda v: abs(v - L.get("size", 64)))
        for k in ("color", "highlight", "iconBg", "tile", "gradient", "border"):  # theme colours only
            if str(L.get(k) or "").startswith("#") and L[k].upper() not in (theme["a"].upper(), theme["b"].upper()):
                L[k] = "a"
        # the top-left corner is the logo chip's
        if L["kind"] not in ("shape", "stream") and L["x"] < 26 and L["y"] < 18:
            L["y"] = 22
    return scene


def _reqs(v) -> list[str]:
    """The asks a scene / layer delivers: ["R1", "R4"]."""
    return list(dict.fromkeys(str(x).strip().upper() for x in (v if isinstance(v, list) else []) if re.fullmatch(r"R\d{1,2}", str(x).strip(), re.I)))[:8]


def _clean_asks(raw) -> list[dict]:
    """AI design's checklist: every ask in the brief, {"id", "kind", "need", "text"?}."""
    asks, seen = [], set()
    for a in raw if isinstance(raw, list) else []:
        if not isinstance(a, dict):
            continue
        aid = str(a.get("id") or "").strip().upper()
        need = _line(a.get("need"), 160)
        if not re.fullmatch(r"R\d{1,2}", aid) or aid in seen or not need:
            continue
        seen.add(aid)
        ask = {"id": aid, "kind": a.get("kind") if a.get("kind") in ("text", "visual", "motion", "timing", "style", "brand", "avoid") else "visual", "need": need}
        if _line(a.get("text"), 120):
            ask["text"] = _line(a.get("text"), 120)
        asks.append(ask)
        if len(asks) >= 30:
            break
    return asks


def _plain(v) -> str:
    """Text as it reads on screen — no [highlight] marks, zero-width spaces or extra spaces, any case."""
    return re.sub(r"\s+", " ", re.sub(r"[\[\]⟦⟧\u200b\u200c\u200d]", "", str(v or ""))).strip().casefold()


def _scene_words(sc: dict) -> str:
    """Every word a canvas scene shows, as one plain string."""
    out = []
    for L in sc.get("layers") or []:
        out += [L.get(k) for k in ("kicker", "text", "title", "label", "sub") if L.get(k)]
        out += list(L.get("lines") or [])
        out += [x.get("text") for x in L.get("items") or [] if isinstance(x, dict)]
    return _plain(" ".join(str(x) for x in out))


def asks_status(script: dict) -> list[dict]:
    """Each ask of the brief and whether the design delivers it: a quoted text
    must be on screen as written; any other ask needs a scene or layer
    tagged with it. [{"id", "need", "ok"}]"""
    scenes = script.get("scenes") or []
    tagged = {x for sc in scenes for x in [*(sc.get("req") or []), *(r for L in sc.get("layers") or [] for r in L.get("req") or [])]}
    words = [_scene_words(sc) for sc in scenes]
    out = []
    for a in script.get("asks") or []:
        if a.get("text"):
            ok = any(_plain(a["text"]) in w for w in words)
        else:
            ok = a["id"] in tagged
        out.append({"id": a["id"], "need": a["need"], "ok": ok})
    return out


def _hex(v, fallback=None):
    v = str(v or "").strip()
    return v if re.fullmatch(r"#[0-9a-fA-F]{6}", v) else fallback


def _ccol(v):
    """A layer colour: a palette name or a hex — else None (the default)."""
    v = str(v or "").strip()
    return v if v in ("a", "b", "ink", "sub", "bg", "white", "black") else _hex(v)


def _src_ok(v) -> bool:
    """A picture a design may show: a brand-kit ref ("shot:N", "product:<name>")
    or one the server already put in (/media/…, a data: image) — never a web link."""
    v = str(v or "")
    return bool(re.fullmatch(r"(shot:\d{1,2}|product:.{1,60})", v)) or v.startswith(("/media/", "data:image/"))


def _num(v, lo, hi, default=None):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


LAYOUT_ARROWS = ("ArrowRight", "ArrowDown")  # the layouts' own arrows (not in ICONS, which the AI picks from)


def _resolve_slots(layers: list[dict]) -> list[dict]:
    """A layout's icon names checked against the icon list (the slots come from the AI)."""
    for L in layers:
        for k in ("name", "icon"):
            if L.get(k) and L[k] not in LAYOUT_ARROWS:
                L[k] = _icon(L[k])
        for it in L.get("items") or []:
            it["icon"] = _icon(it.get("icon"), "CircleCheck")
    return layers


def _clean_canvas(raw: dict, say: str) -> dict | None:
    """An AI-designed scene, checked layer by layer: only kinds, colours and
    motions canvas.jsx draws, numbers clamped onto the frame, text trimmed —
    whatever doesn't pass is left out, so a design can't break the render."""
    design = raw.get("layout") if raw.get("layout") in LAYOUTS else None
    if design and not raw.get("layers"):  # a layout + its slots: placed here, not by the AI
        raw = {**raw, "layers": _resolve_slots(layout_layers(raw, bool(raw.get("_wide"))))}
        if isinstance(raw.get("bg"), str):
            raw["bg"] = {"kind": raw["bg"]}
    pal_raw = raw.get("pal") if isinstance(raw.get("pal"), dict) else {}
    bg = _hex(pal_raw.get("bg"), "#070B16")
    lum = sum(int(bg[i : i + 2], 16) for i in (1, 3, 5)) / 3
    mode = pal_raw.get("mode") if pal_raw.get("mode") in ("dark", "light") else ("light" if lum > 150 else "dark")
    ink = _hex(pal_raw.get("ink"), "#0F172A" if mode == "light" else "#FFFFFF")
    pal = {
        "bg": bg,
        "a": _hex(pal_raw.get("a"), "#3B82F6"),
        "b": _hex(pal_raw.get("b"), "#22D3EE"),
        "ink": ink,
        "sub": "rgba(15,23,42,0.66)" if mode == "light" else "rgba(226,232,255,0.72)",
        "mode": mode,
    }
    bg_raw = raw.get("bg") if isinstance(raw.get("bg"), dict) else {}
    back = {"kind": bg_raw.get("kind") if bg_raw.get("kind") in CANVAS_BGS else "solid"}
    for k in ("color", "color2", "accent"):
        if _ccol(bg_raw.get(k)):
            back[k] = _ccol(bg_raw.get(k))
    if _num(bg_raw.get("angle"), 0, 360) is not None:
        back["angle"] = _num(bg_raw.get("angle"), 0, 360)

    layers = []
    for L in (raw.get("layers") or [])[:9]:
        if not isinstance(L, dict) or L.get("kind") not in CANVAS_LAYERS:
            continue
        kind = L["kind"]
        out = {
            "kind": kind,
            "x": _num(L.get("x"), 6, 94, 50),
            "y": _num(L.get("y"), 8, 88, 50),
            "at": _num(L.get("at"), 0, 6, 0),
            "in": L.get("in") if L.get("in") in CANVAS_IN else "fade",
        }
        if L.get("loop") in CANVAS_LOOP:
            out["loop"] = L["loop"]
        if _reqs(L.get("req")):
            out["req"] = _reqs(L.get("req"))
        if L.get("hit") is True and sum(1 for x in layers if x.get("hit")) < 2:
            out["hit"] = True
        for k, lo, hi in (("z", 0, 9), ("rotate", -30, 30), ("w", 20, 1700), ("h", 20, 1000), ("radius", 0, 200), ("opacity", 0.05, 1), ("blur", 0, 120), ("stroke", 0, 30), ("maxw", 20, 95)):
            if _num(L.get(k), lo, hi) is not None:
                out[k] = _num(L.get(k), lo, hi)
        for k in ("color", "fill", "tile", "iconBg", "highlight", "gradient", "border"):
            if _ccol(L.get(k)):
                out[k] = _ccol(L[k])
        if kind == "text":
            text = _line(L.get("text"), 120)
            if not text:
                continue
            out.update(text=text, size=_num(L.get("size"), 40, 180, 64), weight=int(_num(L.get("weight"), 300, 800, 700)))
            if L.get("align") in ("left", "center", "right"):
                out["align"] = L["align"]
            if L.get("mono"):
                out["mono"] = True
            # a headline block (the hero layout): its kicker, accent rule and sub
            if _line(L.get("kicker"), 40):
                out["kicker"] = _line(L["kicker"], 40)
            if _line(L.get("sub"), 120):
                out.update(sub=_line(L["sub"], 120), subSize=_num(L.get("subSize"), 36, 64, 50))
            if L.get("rule") is True:
                out["rule"] = True
        elif kind == "card":
            out.update(title=_line(L.get("title"), 50), lines=[_line(x, 60) for x in (L.get("lines") or []) if _line(x, 60)][:5])
            if L.get("icon"):
                out["icon"] = _icon(L.get("icon"))
            if L.get("glass") is False:
                out["glass"] = False
            if _num(L.get("size"), 28, 64) is not None:
                out["size"] = _num(L.get("size"), 28, 64)
        elif kind == "icon":
            name = L.get("name") or L.get("icon")
            out.update(name=name if name in LAYOUT_ARROWS else _icon(name), size=_num(L.get("size"), 60, 260, 120))
        elif kind == "shape":
            out["shape"] = L.get("shape") if L.get("shape") in ("circle", "rect", "ring", "line") else "circle"
        elif kind == "device":
            out["device"] = L.get("device") if L.get("device") in ("phone", "tablet", "laptop", "monitor", "screen") else "laptop"
            out["lines"] = [_line(x, 40) for x in (L.get("lines") or []) if _line(x, 40)][:6]
            if _src_ok(L.get("src")):
                out["src"] = L["src"]
        elif kind in ("logo", "image"):
            if kind == "image":
                if L.get("sketch") is True:
                    out["sketch"] = True
                if _line(L.get("draw"), 300) and not L.get("src"):
                    # a picture still to be drawn (app/doodle.py draw_pictures) — its icon if that fails
                    out["draw"], out["icon"] = _line(L["draw"], 300), _icon(L.get("icon"), "Sparkles")
                elif not _src_ok(L.get("src")):
                    continue
                else:
                    out["src"] = L["src"]
            if _num(L.get("size"), 30, 200) is not None:
                out["size"] = _num(L.get("size"), 30, 200)
        elif kind == "chart":
            vals = [_num(v, -1e9, 1e9) for v in (L.get("values") or [])]
            out.update(chart=L.get("chart") if L.get("chart") in ("line", "bars", "donut") else "line", values=[v for v in vals if v is not None][:8])
            if len(out["values"]) < 1:
                continue
        elif kind == "metric":
            if _num(L.get("value"), -1e12, 1e12) is None:
                continue
            out.update(value=_num(L.get("value"), -1e12, 1e12), prefix=_line(L.get("prefix"), 4), suffix=_line(L.get("suffix"), 6), label=_line(L.get("label"), 50), size=_num(L.get("size"), 90, 200, 150))
        elif kind == "pill":
            text = _line(L.get("text"), 40)
            if not text:
                continue
            out.update(text=text, size=_num(L.get("size"), 24, 44, 32))
            if L.get("icon"):
                out["icon"] = _icon(L.get("icon"))
            if L.get("caps"):
                out["caps"] = True
        elif kind == "list":
            items = [{"icon": _icon(x.get("icon"), "Check"), "text": _line(x.get("text"), 50)} for x in (L.get("items") or []) if isinstance(x, dict) and _line(x.get("text"), 50)][:5]
            if not items:
                continue
            out.update(items=items, size=_num(L.get("size"), 32, 60, 44))
        elif kind == "alert":
            text = _line(L.get("text"), 50)
            if not text:
                continue
            out.update(text=text, level=L.get("level") if L.get("level") in ("info", "warn", "danger", "ok") else "info", size=_num(L.get("size"), 26, 44, 34))
            if L.get("icon"):
                out["icon"] = _icon(L.get("icon"))
        elif kind == "stream":
            pts = [L.get("from"), L.get("to")]
            if not all(isinstance(q, (list, tuple)) and len(q) == 2 for q in pts):
                continue
            out["from"] = [_num(pts[0][0], 0, 100, 10), _num(pts[0][1], 0, 100, 50)]
            out["to"] = [_num(pts[1][0], 0, 100, 50), _num(pts[1][1], 0, 100, 50)]
            out["count"] = int(_num(L.get("count"), 2, 10, 6))
        layers.append(out)
    if not layers:
        return None
    scene = {"type": "canvas", "seconds": _num(raw.get("seconds"), 2.5, 9, 5), "pal": pal, "bg": back, "layers": layers, "say": say}
    if design or raw.get("design") in LAYOUTS:
        scene["design"] = design or raw["design"]  # placed by a layout: the design check leaves it alone
    if raw.get("tone") in ("dark", "light"):
        scene["tone"] = raw["tone"]
    if _reqs(raw.get("req")):
        scene["req"] = _reqs(raw.get("req"))
    if _num(raw.get("pause"), 0.3, 1.5) is not None and float(raw.get("pause") or 0) > 0:
        scene["pause"] = _num(raw.get("pause"), 0.3, 1.5)  # the breath before a reveal
    return scene


# ── Showcase (motion/src/showcase.jsx) — a bright SaaS promo ───────────────
SHOWCASE_TYPES = ("hook", "roll", "apps", "table", "board", "screen", "flow", "dashboard", "list", "stat", "cta")
SHOWCASE_PROMPT = (
    "You are the best SaaS promo director in Cambodia. You plan a REMOTION VIDEO (about 40-60 s) "
    "that SHOWCASES a software product the way polished app launch videos do: a bright lavender "
    "look with soft colour blobs, app icons floating in white bubbles, the product's own views "
    "(a table, a board) animating in a window, and a word that rolls like a slot machine and lands. "
    "Light, fast, confident — every scene shows the product doing something.\n"
    "\n"
    "THE STORY (7-9 scenes):\n"
    "1. hook — what the product gives, in one line, with the apps it replaces or joins floating "
    "round it (\"All your orders, [one place]\").\n"
    "2. roll — who it is for or what it handles: a lead word and 3-4 words that roll and land on "
    "the last one (\"For your\" → \"shop / team / agency\").\n"
    "3. apps — the tools it works with (only ones the product information names or that it "
    "clearly connects to).\n"
    "4-6. the product working — `table` (its list / records view), `board` (work moving to done), "
    "`screen` (a real screenshot), `flow` or `dashboard`; two or three of these, different types.\n"
    "7. stat or list — what they get (stat only with a TRUE number).\n"
    "last. cta — try it / book a demo / message us.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), apps: 6-8 x {\"name\": a real app the customer uses today, e.g. "
    "\"Excel\", \"Telegram\", \"Google Drive\"} — they float round the line.\n"
    "- roll: lead (1-2 words, e.g. \"Your\", \"For every\"), words: 3-4 single short words (max 12 "
    "letters each) — the last one is the point, icon, text (max 8 words, optional — under it).\n"
    "- apps: title (max 7 words), apps: 4-8 x {\"name\"} — real app / platform names.\n"
    "- table: title (the view's name, 2-4 words, e.g. \"Customer list\"), columns: 3-4 short "
    "headers (the first a name, the last a status), rows: 4-5 rows of SAMPLE records, each a list "
    "of cells matching the columns (short — names, products, dates, statuses), groups: 2-3 folder "
    "names (optional). Believable local sample data (Cambodian names, riel or $ amounts).\n"
    "- board: title (max 7 words), columns: 3 x {\"name\": a status, 1-2 words, in order — e.g. "
    "New → Packing → Delivered, \"cards\": 1-3 short items (max 5 words)} — the first card of the "
    "first column is dragged to the last.\n"
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 7 "
    "words), target (in ENGLISH: the ONE element to point at), action (\"click\" | \"highlight\"), "
    "result (max 6 words, optional).\n"
    "- flow: title (max 6 words), nodes: 3-4 x {\"icon\", \"label\": 2-5 words, \"sub\": the app, optional}.\n"
    "- dashboard: title (optional), metrics: 2-3 x {\"label\", \"value\", \"prefix\", \"suffix\", "
    "\"delta\"}, chart: \"line\" | \"bars\" — small, believable SAMPLE data.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-6 words}.\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "Only features the product information supports — never invent one. Sample records are "
    "examples, never presented as real customers' data.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "apps": [{"name": "Excel"}], "say": "..."}, ...]}'
)

# ── Training & Presentation (motion/src/training.jsx) — 16:9 or 9:16 ──────
TRAINING_TYPES = ("hook", "chapter", "list", "checklist", "quote", "beforeafter", "recap", "stat", "cta")
TRAINING_PROMPT = (
    "You are an expert instructional designer who turns team trainings, talks and internal "
    "presentations into clear, professional explainer videos — like a well-made keynote deck "
    "that animates while a narrator speaks. Corporate and calm, never an ad.\n"
    "\n"
    "STRUCTURE — follow the material's own structure:\n"
    "1. hook — the title card: the training's title (text) and who it is for (sub).\n"
    "2. the opening — why it matters: a `list` of the key ideas, or a `quote`.\n"
    "3. for EACH part / section of the material: a `chapter` card (its number and title), then "
    "1-4 content scenes that show that part's ideas — `list` (key points), `checklist` (steps, "
    "rules, things to bring or do), `beforeafter` (instead of X → do Y), `quote` (the one sentence "
    "worth remembering), `stat` (only a number the material gives).\n"
    "4. the ending — a `recap` of the main behaviours / takeaways, then a `checklist` of the "
    "commitments or next actions if the material has them.\n"
    "last. cta — the closing line (\"Sales excellence is built one action at a time.\"), button "
    "optional (\"Let's start today\").\n"
    "Number the chapters in order (n = 1, 2, 3 …). Vary the scene types inside a part.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (the title, max 10 words), sub (max 10 words — e.g. \"Proseth Solutions · Sales "
    "Team Training\"), icon.\n"
    "- chapter: n (its number), title (max 7 words), text (max 10 words, optional — the part in one line).\n"
    "- list: title (max 7 words), items: 2-4 x {\"icon\", \"text\": 2-7 words}.\n"
    "- checklist: title (max 8 words), checks: 2-6 short lines (2-8 words each).\n"
    "- quote: text (8-25 words — a line from the material), author (\"\" or the company / speaker).\n"
    "- beforeafter: title (max 6 words, optional), before (max 14 words — the old habit), after "
    "(max 14 words — the better way).\n"
    "- recap: title (max 7 words), points: 2-5 x {\"title\": 1-3 words, \"text\": max 8 words}.\n"
    "- stat: value (a number), prefix, suffix, label (max 7 words), icon — ONLY a number from the material.\n"
    "- cta: text (max 10 words), button (1-3 words, optional).\n"
    "On-screen words are SHORT summaries; the voice carries the full explanation.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "sub": "...", "icon": "GraduationCap", "say": "..."}, ...]}'
)

# ── "Designed for you" (style "custom", motion/src/saas.jsx customTemplate) ──
# The AI picks the look for THIS video and composes the story from the scene
# kit — including the brand's real screenshots (Brand kit "screenshot").
CUSTOM_TYPES = ("hook", "notify", "reveal", "screen", "step", "flow", "dashboard", "list", "stat", "news", "offer", "cta")

CUSTOM_PROMPT = (
    "You are the creative director of a top SaaS video studio — the clean, confident launch "
    "videos of Linear, Notion, Stripe or Microsoft Power Platform — making videos for Cambodian "
    "businesses. You design ONE vertical REMOTION VIDEO (TikTok / Facebook Reels, 45-60 s): "
    "animated product UI, no actors. You choose the LOOK for this exact topic and compose the "
    "story from a kit of animated scenes. Videos must not all look alike — the look comes from "
    "the SUBJECT, while the brand's logo, voice and subtitles stay the same.\n"
    "\n"
    "THE LOOK — return \"look\": {\"mode\": \"dark\" | \"light\", \"bg\": \"#RRGGBB\", \"a\": \"#RRGGBB\" "
    "(the main accent — vivid, readable on bg), \"b\": \"#RRGGBB\" (a second accent for "
    "gradients on buttons and tiles), \"background\": \"grid\" | \"dots\" | \"clean\", \"kicker\": the product "
    "category in English, 1-3 words (\"POWER APPS\", \"AUTOMATION\", \"CRM\") or \"\"}.\n"
    "SaaS looks: dark navy / charcoal (bg like #070B16) with ONE vivid accent — or clean light "
    "(bg like #F7F8FC) with a strong accent. When the brief names a platform, use its real "
    "colour: Power Apps #742774, Power Automate #0066FF, Power BI #F2C811 (on dark), Microsoft "
    "Teams #6264A7, Excel #217346, Salesforce #00A1E0, Shopify #95BF47 — else the brand's own "
    "feel. background: grid for tech and automation (the default), dots for a clean product, "
    "clean (plain colour) for minimal. NEVER a glow or a gradient background — the background "
    "is a flat colour with a grid, dots, or nothing.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    "THE STORY (8-10 scenes):\n"
    "1. hook — the outcome or the pain, specific (a number, a time, a role): \"Approving leave "
    "still takes [3 days]?\"\n"
    "2. the pain made visible — `notify` (the inbox / phone filling up).\n"
    "3. the turn — `reveal` that names the product: \"Meet [Power Apps]\", \"There's a [2-minute] "
    "way\".\n"
    "4-6. how it works, 2-3 beats — `screen` (a real screenshot) wherever one fits, else `step`; "
    "a `flow` when the value is automation (work or data moving between apps).\n"
    "7. the outcome — `dashboard` (the product's live view) or `stat` (a TRUE number).\n"
    "8. what you get — `list` of 3 concrete features, in UI words.\n"
    "last. cta — ONE action: \"Book a demo\", \"Start free\", \"Message us 'DEMO'\".\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words; never the brand name, a greeting or \"Did you know\"), icon.\n"
    "- notify: title (max 7 words, optional), time (\"23:47\", optional), notes: 3-4 x "
    "{\"app\": \"Outlook\" | \"Messenger\" | \"Telegram\" | \"Teams\" | \"Mail\", \"text\": max 8 words}.\n"
    "- reveal: text (max 8 words), icon.\n"
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 6 "
    "words), text (max 10 words, optional), target (in ENGLISH: the ONE element to point at, e.g. "
    "\"the Submit button\" — or \"\" for the whole screen), action (\"click\" | \"highlight\"), result "
    "(max 5 words — what happens, optional).\n"
    "- step: title (max 6 words — the action), text (max 12 words), icon, result (max 5 words) — "
    "a drawn app window, for a beat no screenshot shows.\n"
    "- flow: title (max 6 words), nodes: 3-4 x {\"icon\", \"label\": 2-5 words — what happens, "
    "\"sub\": the app or tool, 1-3 words, optional} — how work or data moves (form → approval → "
    "Teams → SharePoint).\n"
    "- dashboard: title (max 6 words, optional), metrics: 2-3 x {\"label\": 1-3 words like a UI "
    "card (\"Requests today\"), \"value\": number, \"prefix\", \"suffix\", \"delta\": e.g. \"+18%\" or "
    "\"\"}, chart: \"line\" | \"bars\". It is the product's screen with SAMPLE data of a demo account "
    "— keep numbers small and believable, never present them as a customer's results.\n"
    "- list: title (max 6 words), items: 3 x {\"icon\", \"text\": 2-5 words}.\n"
    "- stat: value (a number), prefix, suffix, label (max 6 words), icon — ONLY a true number.\n"
    "- news: tag, headline (max 14 words), text (max 16 words) — only a real, widely known trend.\n"
    "- offer: plan, price, period, was, badge, features: 3 x 2-5 words — ONLY when the brief or the "
    "product information gives an offer; never invent a price or a discount.\n"
    "- cta: text (max 8 words, pays off the hook), button (2-4 words).\n"
    "Real screenshots beat drawn screens: when THE BRAND'S SCREENSHOTS show what a beat needs, "
    "use them (1-3 `screen` scenes).\n"
    + _COMMON_RULES
    + '{"look": {"mode": "dark", "bg": "#0B0714", "a": "#742774", "b": "#C239B3", "background": "grid", '
    '"kicker": "POWER APPS"}, "scenes": [{"type": "hook", "text": "...", "icon": "Mail", "say": "..."}, ...]}'
)

_HEX = re.compile(r"#[0-9a-fA-F]{6}")


def _lum(hex_: str) -> float:
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def _contrast(x: str, y: str) -> float:
    hi, lo = sorted((_lum(x), _lum(y)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def clean_look(raw, brand_hex: str) -> dict:
    """The AI's look, made safe: a background that is really dark / light and
    accents that stay readable on it (else the brand colour, else a default)."""
    raw = raw if isinstance(raw, dict) else {}
    mode = "light" if raw.get("mode") == "light" else "dark"
    hexes = {k: str(raw.get(k) or "") for k in ("bg", "a", "b")}
    bg = hexes["bg"] if _HEX.fullmatch(hexes["bg"]) else ""
    if not bg or (mode == "dark" and _lum(bg) > 0.04) or (mode == "light" and _lum(bg) < 0.82):
        bg = "#0A0F1F" if mode == "dark" else "#F8FAFC"

    def accent(value: str, fallback: str, need: float) -> str:
        for c in (value, brand_hex, fallback):
            if _HEX.fullmatch(c or "") and _contrast(c, bg) >= need:
                return c
        return fallback

    a = accent(hexes["a"], "#6366F1" if mode == "dark" else "#4338CA", 3.0)
    b = accent(hexes["b"], a, 2.0)
    # flat backgrounds only (grid / dots / plain) — no glow, no gradient
    background = raw.get("background") if raw.get("background") in ("grid", "dots", "clean") else "grid"
    look = {"mode": mode, "bg": bg, "a": a, "b": b, "background": background, "kicker": _line(raw.get("kicker"), 20).upper()}
    card = str(raw.get("card") or "")
    if _HEX.fullmatch(card) and ((mode == "light" and _lum(card) > 0.6) or (mode == "dark" and _lum(card) < 0.12)):
        look["card"] = card
    if raw.get("radius") in ("sharp", "soft", "round"):
        look["radius"] = raw["radius"]
    return look


# The brand's app / product screenshots — shown (and zoomed into) by `screen` scenes.
MAX_SHOTS = 8


def brand_screens(db: Session, brand_id: int) -> list[dict]:
    """[{id, name, note, uri, w, h}] — the Brand kit's screenshots, oldest
    first (their numbers in the prompt), embedded and sized for the video."""
    rows = db.scalars(
        select(BrandAsset).where(BrandAsset.brand_id == brand_id, BrandAsset.kind == "screenshot").order_by(BrandAsset.id)
    ).all()[:MAX_SHOTS]
    out = []
    for a in rows:
        try:
            im = Image.open(io.BytesIO(read_media(a.url) or b""))
            im.thumbnail((1600, 1600))
            buf = io.BytesIO()
            im.convert("RGB").save(buf, "JPEG", quality=90)
        except Exception:  # noqa: BLE001 — an unreadable upload is just left out
            continue
        uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        out.append({"id": a.id, "name": a.name, "note": a.note, "uri": uri, "w": im.width, "h": im.height})
    return out


def _shots_prompt(shots: list[dict]) -> str:
    if not shots:
        return "\n\nTHE BRAND'S SCREENSHOTS: none — don't use `screen` scenes."
    lines = [f"{i}. {s['name'] or 'Screenshot'}" + (f" — {s['note']}" if s.get("note") else "") for i, s in enumerate(shots, 1)]
    return "\n\nTHE BRAND'S SCREENSHOTS (a `screen` scene shows one by its number):\n" + "\n".join(lines)


def _vision_model() -> str:
    cfg = get_settings()
    return cfg.azure_openai_vision_deployment or cfg.azure_openai_deployment


def describe_screen(blob: bytes) -> str:
    """One line on what a screenshot shows (the Brand kit's note, so the
    storyboard knows when to use it). "" when the AI can't tell."""
    from app.content_ai import ContentAIError, _chat

    try:
        im = Image.open(io.BytesIO(blob))
        im.thumbnail((1280, 1280))
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=85)
        out = _chat(
            [
                {
                    "role": "system",
                    "content": "You describe app / website screenshots for a video storyboard writer. In one "
                    "sentence (max 25 words): which product or app it is if you can tell, which screen, and its "
                    'main buttons or areas. Return JSON {"note": "..."}.',
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this screenshot."},
                        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}},
                    ],
                },
            ],
            _vision_model(),
            max_tokens=2000,
        )
    except (ContentAIError, OSError, ValueError):
        return ""
    return _line(out.get("note"), 300)


def _box(value) -> list[float] | None:
    """[x, y, w, h] as fractions of the picture, or None when it isn't one."""
    if not isinstance(value, list) or len(value) != 4:
        return None
    try:
        x, y, w, h = (float(v) for v in value)
    except (TypeError, ValueError):
        return None
    if not (0 <= x < 1 and 0 <= y < 1 and 0.004 < w <= 1 and 0.004 < h <= 1 and x + w <= 1.02 and y + h <= 1.02):
        return None
    return [round(x, 4), round(y, 4), round(min(w, 1 - x), 4), round(min(h, 1 - y), 4)]


def locate_targets(scenes: list[dict], shots: list[dict]) -> None:
    """Find each `screen` scene's target on its screenshot (one vision call)
    and set scene["focus"]; a target that isn't found shows the whole screen.
    A Reaction meme moment's ``circle`` the same way → scene["mark"] (the red
    circle, % of the screenshot); not found = no circle."""
    from app.content_ai import ContentAIError, _chat

    asks = [(i, s) for i, s in enumerate(scenes) if s["type"] == "screen" and s.get("target") and 1 <= s.get("shot", 0) <= len(shots) and not s.get("focus")]
    asks += [(i, s) for i, s in enumerate(scenes) if s.get("circle") and 1 <= s.get("shot", 0) <= len(shots) and not s.get("mark")]
    if not asks:
        return
    used = sorted({s["shot"] for _, s in asks})
    content: list[dict] = [
        {"type": "text", "text": "Find these elements:\n" + "\n".join(f"{i}. In screenshot {s['shot']}: {s.get('target') or s.get('circle')}" for i, s in asks)}
    ]
    for n in used:
        content += [{"type": "text", "text": f"Screenshot {n}:"}, {"type": "image_url", "image_url": {"url": shots[n - 1]["uri"], "detail": "high"}}]
    try:
        out = _chat(
            [
                {
                    "role": "system",
                    "content": "You locate user-interface elements in app screenshots. For each request give the "
                    "element's bounding box as fractions of that screenshot's width and height: [x, y, w, h], x/y = "
                    "its top-left corner (0-1). Tight around the element. null when it isn't visible. Return JSON "
                    '{"boxes": [{"id": <request number>, "box": [x, y, w, h] | null}]}.',
                },
                {"role": "user", "content": content},
            ],
            _vision_model(),
            max_tokens=4000,
        )
    except ContentAIError:
        out = {}
    found = {b.get("id"): _box(b.get("box")) for b in (out.get("boxes") or []) if isinstance(b, dict)}
    for i, s in asks:
        if s.get("circle"):  # a loose circle round it, a little bigger than the box
            box = found.get(i)
            if box:
                x, y, w, h = box
                s["mark"] = {"x": round((x + w / 2) * 100, 1), "y": round((y + h / 2) * 100, 1), "w": round(min(95, w * 100 * 1.35 + 6), 1), "h": round(min(60, h * 100 * 1.5 + 3), 1)}
            continue
        if found.get(i):
            s["focus"] = found[i]
        else:
            s["action"] = "zoom"



# style → (story prompt, scene types, most scenes between the hook and the
# call to action, a scene type the story must have)
STYLES = {
    "tech": (SELL_PROMPT, TECH_TYPES, 8, None),
    "explainer": (TEACH_PROMPT, EXPLAINER_TYPES, 8, None),
    "versus": (VERSUS_PROMPT, VERSUS_TYPES, 7, None),
    "poll": (POLL_PROMPT, POLL_TYPES, 6, "options"),
    "quote": (QUOTE_PROMPT, QUOTE_TYPES, 3, "quote"),
    "testimonial": (TESTIMONIAL_PROMPT, TESTIMONIAL_TYPES, 7, "customer"),
    "trend": (TREND_PROMPT, TREND_TYPES, 6, "news"),
    "pov": (POV_PROMPT, POV_TYPES, 5, "notify"),
    "demo": (DEMO_PROMPT, DEMO_TYPES, 7, "step"),
    "offer": (OFFER_PROMPT, OFFER_TYPES, 5, "offer"),
    "spotlight": (SPOTLIGHT_PROMPT, SPOTLIGHT_TYPES, 5, "offer"),
    "showcase": (SHOWCASE_PROMPT, SHOWCASE_TYPES, 7, None),
    "launch": (LAUNCH_PROMPT, LAUNCH_TYPES, 7, None),
    "unveil": (UNVEIL_PROMPT, UNVEIL_TYPES, 6, None),
    "gridcards": (GRID_PROMPT, GRID_TYPES, 5, "fanout"),
    "techflow": (TECHFLOW_PROMPT, TECHFLOW_TYPES, 6, None),
    "canvas": (CANVAS_PROMPT, CANVAS_TYPES, 12, "canvas"),
    "neural": (NEURAL_PROMPT, NEURAL_TYPES, 8, None),
    "paper": (PAPER_PROMPT, PAPER_TYPES, 8, None),
    "doodle": (DOODLE_PROMPT, DOODLE_TYPES, 7, "doodle"),
    "cartoon": (CARTOON_PROMPT, CARTOON_TYPES, 10, "talk"),
    "lesson": (LESSON_PROMPT, LESSON_TYPES, 8, "whiteboard"),
    "rise": (RISE_PROMPT, RISE_TYPES, 8, "climb"),
    "reaction": (REACTION_PROMPT, REACTION_TYPES, 3, None),
    "studio": (STUDIO_PROMPT, STUDIO_TYPES, 4, None),
    "presenter": (PRESENTER_PROMPT, PRESENTER_TYPES, 7, None),
    "podcast": (PODCAST_PROMPT, PODCAST_TYPES, 10, "visit"),
    "clarity": (CLARITY_PROMPT, CLARITY_TYPES, 8, None),
    "countdown": (COUNTDOWN_PROMPT, COUNTDOWN_TYPES, 7, "rank"),
    "thisorthat": (THISORTHAT_PROMPT, THISORTHAT_TYPES, 6, "choice"),
    "reviews": (REVIEWS_PROMPT, REVIEWS_TYPES, 6, None),
    "tips": (TIPS_PROMPT, TIPS_TYPES, 7, "tip"),
    "hottake": (HOTTAKE_PROMPT, HOTTAKE_TYPES, 5, "take"),
    "casestudy": (CASESTUDY_PROMPT, CASESTUDY_TYPES, 6, "client"),
    "faq": (FAQ_PROMPT, FAQ_TYPES, 5, "qa"),
    "report": (REPORT_PROMPT, REPORT_TYPES, 5, None),
    "custom": (CUSTOM_PROMPT, CUSTOM_TYPES, 8, None),
    "training": (TRAINING_PROMPT, TRAINING_TYPES, 12, None),
}
# Styles made for long material (a whole training): story mode up to 10 minutes.
LONG_STYLES = {"training"}
# The templates laid out for 16:9 too (motion/src/training.jsx, saas.jsx wide scenes);
# every other template is always vertical. Scenes drawn only for a tall frame are
# left out of a wide video.
WIDE_STYLES = {"podcast", "presenter", "neural", "paper", "doodle", "cartoon", "lesson", "rise", "training", "custom", "demo", "offer", "spotlight", "trend", "pov", "showcase", "launch", "unveil", "gridcards", "techflow", "canvas", "clarity", "countdown", "thisorthat", "reviews", "tips", "hottake", "casestudy", "faq", "report"}
TALL_ONLY_TYPES = {"problem", "chat", "product", "point"}


def final_ratio(asked: str, style: str, suggested: str | None = None) -> str:
    """The video's shape: "16:9" only for a template that has a wide layout —
    asked for, or the director's suggestion when the Size is Auto."""
    if style not in WIDE_STYLES:
        return "9:16"
    if asked == "16:9":
        return "16:9"
    if asked == "auto":
        return suggested if suggested in ("16:9", "9:16") else ("16:9" if style == "training" else "9:16")
    return "9:16"
SCREEN_STYLES = {"custom", "demo", "showcase", "launch", "unveil", "clarity", "canvas", "reaction"}  # the stories that can show the brand's screenshots
# The templates that sell (the auto topic picks a product, not a teaching topic).
SELLING_STYLES = {"tech", "demo", "offer", "spotlight", "showcase", "launch", "unveil", "gridcards"}

# Story mode (write_script ``seconds``): the person pasted their own story.
MAX_STORY_SCENES = 20  # ~2 minutes
MAX_LONG_SCENES = 80  # LONG_STYLES — ~10 minutes
STORY_RULES = (
    "\n\nTHE PERSON WROTE THEIR OWN STORY — it is under THE VIDEO IS ABOUT. Turn THAT story "
    "into the storyboard instead of inventing one: follow its order and its content scene by "
    "scene (the story order above is only a guide to the scene types). The `say` lines are the "
    "story's own sentences, lightly shortened to be spoken — same meaning, in LANGUAGE "
    "(translate only if the story is written in another language). For each scene pick the "
    "scene type that shows its sentence best, and keep the on-screen words short. Start with a "
    "hook and end with a cta, taken from the story's opening and ending. Make about {count} "
    "scenes — the video should run about {seconds} seconds (one scene is about 6 seconds).\n"
    "FAITHFUL — it is THEIR story: keep its order, its people (names spelled EXACTLY as written), "
    "its dialogue (the words in quotes «…» / \"…\" stay in the `say` lines, in quotes), its "
    "questions, its tips and its ending — word for word where you can. NEVER add anything the "
    "story doesn't say: no new numbers, amounts, savings, results, tips, steps or outcomes, and "
    "never change how it ends. A `chart`, `stat`, `result` or `dashboard` only when the story "
    "itself gives ALL its numbers — otherwise show that sentence another way.\n"
    "VARIETY comes from HOW each sentence is shown, never from new content: never more than 2 "
    "scenes of the same type in a row, no type for more than a third of the scenes — a person's "
    "moment → their scene, several things → list, two people → compare, a number the story "
    "gives → stat, the one idea to remember → its own scene."
)


_SCENE_HEAD = re.compile(r"(?im)^\W*(?:scene|act|shot|ឈុត(?:ទី)?)\s*(\d{1,2})\b")
# "Voice:", "Narration:", "VO:", "សំឡេង:" — also with the language around it: "Khmer
# narration:", "Narration (Khmer):", "English voice-over:", "VO (KH):"
_VOICE_LINE = re.compile(
    r"(?im)^\W*(?:(?:khmer|english|kh|en|ខ្មែរ)\s+)?(?:voice(?:[- ]?over)?|vo|narrat(?:or|ion)|សំឡេង)"
    r"(?:\s*\([^)]{1,20}\))?\s*[:：]\s*(.+)$"
)
_LOOK_WORDS = re.compile(r"(?i)\b(?:look|visual|background|colou?r|palette|lighting|transition|pause|reveal|impact|split screen|led screen)\b")


def own_scenes(text: str) -> int:
    """How many numbered scenes a pasted script has ("Scene 1", "SCENE 2 –",
    "ឈុតទី 3"…) — 0 when it isn't written scene by scene (fewer than 3)."""
    nums = {int(m) for m in _SCENE_HEAD.findall(text or "")}
    return len(nums) if len(nums) >= 3 else 0


_MOMENT = re.compile(r"(?m)^\s*(?:[-•*]|\d{1,2}[.)])\s+\S")


def own_moments(text: str) -> int:
    """The moments a numbered script lists inside its scenes (its "- 24/7
    Monitoring" bullets, its "1. Customers captured" points) — each is a scene."""
    first = _SCENE_HEAD.search(text or "")
    return len(_MOMENT.findall(text[first.start():])) if first else 0


# A voice label alone on its line — "🎙 Voice Over (Khmer)", "Narration:" — its
# line is the next one with words on it (scripts written by ChatGPT often do this).
_VOICE_HEAD = re.compile(
    r"(?i)^\W*(?:(?:khmer|english|kh|en|ខ្មែរ)\s+)?(?:voice(?:[- ]?over)?|vo|narrat(?:or|ion)|សំឡេង)"
    r"(?:\s*\([^)]{1,20}\))?\s*[:：]?\s*$"
)


def _voice_lines(text: str) -> list[tuple[int, str]]:
    """(line number, words) of each of the script's own voice lines: "Voice: …"
    on one line, or a label alone on its line with the words under it."""
    lines = (text or "").splitlines()
    out: list[tuple[int, str]] = []
    i = 0
    while i < len(lines):
        m = _VOICE_LINE.match(lines[i])
        if m:
            out.append((i, m.group(1)))
        elif _VOICE_HEAD.match(lines[i]):
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and not _SCENE_HEAD.match(lines[j]) and not _VOICE_HEAD.match(lines[j]) and not _VOICE_LINE.match(lines[j]):
                out.append((j, lines[j]))
                i = j
        i += 1
    return out


def own_voice(text: str) -> list[str]:
    """The script's own voice lines ("Voice: …", or under a "Voice Over" label), quotes taken off."""
    return [ln for ln in (w.strip().strip("\"“”«»'").strip() for _, w in _voice_lines(text)) if ln]


_QUOTED = re.compile(r"[\"“]([^\"“”\n]{2,120})[\"”]")


def own_onscreen(text: str) -> list[str]:
    """Every line a numbered script puts on screen in quotes — "On screen:",
    "Subtitle:", its features, its final titles — never its Voice lines."""
    first = _SCENE_HEAD.search(text or "")
    if not first:
        return []
    out = []
    spoken = {n for n, _ in _voice_lines(text)}  # a quoted voice line is said, not shown
    start = text[: first.start()].count("\n")
    for n, line in enumerate(text[first.start():].splitlines(), start):
        if n in spoken or _VOICE_LINE.match(line):
            continue
        for q in _QUOTED.findall(line):  # "A · B" may be shown as two items — each part counts
            out += [part.strip() for part in re.split(r"\s+[·|]\s+", q) if len(part.strip()) > 1]
    return list(dict.fromkeys(out))


def _shown(raw_scenes) -> str:
    """Every word a raw storyboard puts on screen (all its text but the voice lines), plain."""
    bits: list[str] = []

    def walk(v, key=""):
        if key == "say":
            return
        if isinstance(v, str):
            bits.append(v)
        elif isinstance(v, dict):
            for k, x in v.items():
                walk(x, k)
        elif isinstance(v, list):
            for x in v:
                walk(x, key)

    walk(raw_scenes)
    return _plain(" ".join(bits))


def _missing_onscreen(idea: str, raw: dict) -> list[str]:
    shown = _shown(raw.get("scenes") or [])
    return [q for q in own_onscreen(idea) if _plain(q) not in shown]


def _keep_own_voice(script: dict, idea: str) -> None:
    """A script with its own Voice lines: a `say` that isn't from them (the AI
    filled a scene with a line of its own) is taken out — the scene plays
    without a voice rather than say something they never wrote."""
    lines = own_voice(idea)
    if not lines:
        return
    theirs = _plain(" ".join(lines))
    words = set(theirs.split())
    # one storyboard scene per Voice line: each scene says exactly the person's
    # line — the AI's light rewrites ("ចាំ" → "រង់ចាំ", an added opening) and its
    # translations never replace words they wrote themselves
    if len(lines) == len(script["scenes"]):
        for sc, line in zip(script["scenes"], lines):
            sc["say"] = _line(line, 300)
        return
    for sc in script["scenes"]:
        said = _plain(sc.get("say"))
        if said and said in theirs:
            continue
        mine = [w.strip(".,!?;:") for w in said.split()]
        if not said or sum(1 for w in mine if w in words) / max(1, len(mine)) < 0.75:
            if said:
                log.info("storyboard: a voice line the script doesn't have taken out: %s", _line(sc["say"], 80))
            sc["say"] = ""


def own_design(text: str) -> bool:
    """A script that designs its own film: numbered scenes AND visual
    direction (looks, backgrounds, colours, a pause, a reveal…) — the AI
    design style follows that; a fixed template can't."""
    return own_scenes(text) >= 3 and len(_LOOK_WORDS.findall(text or "")) >= 4


def stated_seconds(text: str) -> int:
    """The length a brief asks for in its first lines ("Duration: about 2 minutes
    (120 seconds)", "about 80 seconds") — 0 when it doesn't say."""
    head = (text or "")[:600]
    m = re.search(r"(\d{2,3})\s*(?:seconds|secs?)\b", head, re.I)
    if m:
        return int(m[1])
    m = re.search(r"(\d(?:\.\d)?)\s*(?:minutes?|mins?)\b", head, re.I)
    return int(float(m[1]) * 60) if m else 0


def story_seconds(text: str, length: str = "auto", cap: int = 120) -> int:
    """How long a story video should be: "60" / "120" / "300" / "600", or from
    how long the story takes to read aloud (Khmer ~11 characters a second,
    English ~2.6 words), between 30 s and ``cap`` (2 minutes; 10 for a training)."""
    if length in ("60", "120", "300", "600"):
        return min(int(length), cap)
    if stated_seconds(text) >= 20:  # the brief says how long
        return int(min(cap, stated_seconds(text)))
    lines = own_voice(text)
    if lines and own_scenes(text):  # a written script: its voice lines + a beat per scene
        said = " ".join(lines)
        spoken = sum(1 for ch in said if "\u1780" <= ch <= "\u17ff") / 11 + len(re.findall(r"[A-Za-z0-9]+", said)) / 2.6 + 2.5 * own_scenes(text)
        return int(min(cap, max(30, round(spoken / 5) * 5)))
    khmer = sum(1 for ch in text if "\u1780" <= ch <= "\u17ff")
    spoken = khmer / 11 + len(re.findall(r"[A-Za-z0-9]+", text)) / 2.6
    return int(min(cap, max(30, round(spoken / 15) * 15)))


def estimate_seconds(script: dict) -> int:
    """Roughly how long the video will run, before the voice is recorded."""
    total = 0.0
    for sc in script["scenes"]:
        say = sc.get("say") or ""
        spoken = sum(1 for ch in say if "\u1780" <= ch <= "\u17ff") / 11 + len(re.findall(r"[A-Za-z0-9]+", say)) / 2.6
        total += max(default_seconds(sc), spoken + 1.3)
    return round(total - TRANSITION_S * (len(script["scenes"]) - 1))


# Content goals (app/goals.py) → templates. A goal with several takes one at
# random per video, so a week's plan doesn't repeat the same look.
GOAL_STYLES = {
    "sell": ("tech",),
    "solution": ("tech", "demo", "custom", "showcase", "clarity", "gridcards", "cartoon"),
    "conversion": ("offer", "spotlight", "tech", "launch", "reviews", "casestudy", "unveil", "studio"),
    "teach": ("explainer",),
    "education": ("explainer", "training", "custom", "clarity", "tips", "gridcards", "techflow", "neural", "paper", "doodle", "cartoon", "lesson", "presenter", "podcast"),
    "reach": ("pov", "explainer", "countdown", "thisorthat", "hottake", "doodle", "cartoon", "lesson", "rise", "reaction", "podcast"),
    "awareness": ("trend", "custom", "clarity", "showcase", "report", "unveil", "canvas", "studio", "presenter"),
    "authority": ("versus", "report", "casestudy", "hottake", "clarity", "techflow"),
    "engagement": ("poll", "thisorthat", "faq", "countdown", "hottake", "reaction"),
    "followers": ("quote", "explainer", "tips", "countdown", "hottake", "doodle", "lesson", "rise", "presenter", "podcast"),
    "trust": ("testimonial", "reviews", "casestudy", "faq", "report"),
}


def style_for(goal: str) -> str:
    """The template for a content goal; "auto" / unknown = explainer unless
    the brief is clearly a sale (the caller decides that with a product
    chosen). A template name itself ("versus", "poll", …) is taken as is."""
    goal = (goal or "").lower()
    return goal if goal in STYLES else random.choice(GOAL_STYLES.get(goal, ("explainer",)))


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


# The templates told by a narrator to everyone (not a shop talking to its customer, បង).
NARRATOR_STYLES = {"explainer", "training", "quote", "doodle", "lesson", "rise", "countdown", "tips", "hottake", "report"}


def story_language(idea: str, picked: str) -> str:
    """The language of the person's own story — Khmer when most of its letters
    are Khmer, English when they're Latin, else what they picked. A script
    with its own Voice / Narration lines speaks the language of those lines:
    its visual prompts are often English, and longer, but the voice is what
    the video says and shows."""
    voice = " ".join(own_voice(idea))
    if voice.strip():
        idea = voice
    km = sum(1 for ch in idea if "\u1780" <= ch <= "\u17ff")
    latin = sum(1 for ch in idea if ch.isascii() and ch.isalpha())
    if km > latin * 2:
        return "Khmer"
    if latin > km * 2:
        return "English"
    return picked


def _numbers_in(text: str) -> set[float]:
    """Every number written in a text — Khmer digits too, "1,400" / "១ ៤០០" as one."""
    t = text.translate(str.maketrans("០១២៣៤៥៦៧៨៩", "0123456789"))
    t = re.sub(r"(?<=\d)[,\u00a0\u2009\u202f ](?=\d{3}(?!\d))", "", t)
    return {float(x) for x in re.findall(r"\d+(?:\.\d+)?", t)}


def _only_story_numbers(scene: dict, story: str, allowed: tuple = ()) -> dict:
    """Story mode: a chart / stat / result / dashboard whose numbers the story
    never gave is turned into a plain statement of that line (its words and
    voice kept) — the video never shows a figure the person didn't write."""
    have = _numbers_in(story) | {0.0}
    kind = scene["type"]
    if kind in ("stat", "result"):
        nums = [float(scene.get("value") or 0)]
    elif kind == "chart":
        nums = [float(v) for ser in scene.get("series") or [] for v in ser.get("values") or []]
    elif kind == "dashboard":
        nums = [float(m.get("value") or 0) for m in scene.get("metrics") or []]
    else:
        return scene
    if all(n in have for n in nums):
        return scene
    text = scene.get("title") or scene.get("label") or ""
    if "reveal" in allowed:
        return {"type": "reveal", "text": text, "icon": scene.get("icon") or "Lightbulb", "say": scene.get("say", "")}
    if "character" in allowed:  # Teach: the person, thinking it over
        return {"type": "character", "title": text, "mood": "thinking", "icon": "", "tag": "", "say": scene.get("say", "")}
    return {"type": "list", "title": text, "items": [], "say": scene.get("say", "")} if "list" in allowed else scene


def _apps(value) -> list[dict]:
    """Showcase's app bubbles: [{"name"}] — the template draws each known app's icon."""
    return [{"name": _line(a.get("name"), 24)} for a in (value or []) if isinstance(a, dict) and _line(a.get("name"), 24)][:8]


def _who(value) -> int:
    """Story · Characters: which of the two speaks (1 or 2)."""
    return 2 if str(value).strip() == "2" else 1


def clean_cast(raw) -> list[dict]:
    """Story · Characters: the two people — a name, a look, a colour each."""
    people = [p for p in (raw if isinstance(raw, list) else []) if isinstance(p, dict)][:2]
    while len(people) < 2:
        people.append({})
    out = []
    for n, p in enumerate(people):
        look = p.get("look") if p.get("look") in CAST_LOOKS else ("apron", "cap")[n]
        color = p.get("color") if p.get("color") in CAST_COLORS else ("teal", "green")[n]
        if out and look == out[0]["look"]:
            look = "cap" if look != "cap" else "apron"
        if out and color == out[0]["color"]:
            color = "green" if color != "green" else "blue"
        out.append({"name": _line(p.get("name"), 30), "look": look, "color": color})
    return out


def clean_animals(raw) -> list[str]:
    """Reaction meme: the 1-2 animals in front (REACTION_ANIMALS names)."""
    out = [a for a in (raw if isinstance(raw, list) else []) if a in REACTION_ANIMALS]
    out = list(dict.fromkeys(out))[:2]
    return out or ["black-kitten", "cream-cat"]


def _react_fields(raw: dict, one: bool = False) -> dict:
    """Reaction meme: who reacts (0-based cast indices), how, what they say,
    and the picture behind (a screenshot, a product, or a photo to draw)."""
    who = raw.get("who") if isinstance(raw.get("who"), list) else [raw.get("who")]
    idx = list(dict.fromkeys(1 if str(w).strip() == "2" else 0 for w in who if str(w).strip() in ("1", "2"))) or [0]
    idx = idx[:1] if one else idx[:2]
    moods = [m if m in REACTION_MOODS else ("shock" if one else "pop") for m in (raw.get("moods") if isinstance(raw.get("moods"), list) else [])][: len(idx)]
    while len(moods) < len(idx):
        moods.append("shock" if one or moods else "pop")
    out = {"who": idx, "moods": moods}
    if one:
        return out
    if _line(raw.get("bubble"), 30):
        out["bubble"] = _line(raw["bubble"], 30)
    try:
        shot = int(raw.get("shot") or 0)
    except (TypeError, ValueError):
        shot = 0
    if shot > 0:
        out["shot"] = shot
    elif _line(raw.get("product"), 80):
        out["product"] = _line(raw["product"], 80)
    elif _line(raw.get("draw"), 300):
        out["draw"] = _line(raw["draw"], 300)
    if "shot" in out and _line(raw.get("circle"), 80):
        out["circle"] = _line(raw["circle"], 80)  # found on the screenshot by locate_targets → mark
    mark = raw.get("mark") if isinstance(raw.get("mark"), dict) else None
    if mark and "shot" in out:  # a reviewed storyboard keeps the circle it found
        try:
            out["mark"] = {k: max(lo, min(hi, float(mark.get(k)))) for k, lo, hi in (("x", 3, 97), ("y", 3, 97), ("w", 6, 95), ("h", 4, 60))}
        except (TypeError, ValueError):
            pass
    return out


def _clean_scene(raw: dict, names: dict[str, str]) -> dict | None:
    """One scene from the AI, checked and trimmed — None when it's unusable.
    A scene whose fields have the wrong shape (a number where a list goes…)
    is left out, never fails the whole storyboard."""
    try:
        return _clean_one(raw, names)
    except (TypeError, ValueError, AttributeError, KeyError, IndexError) as exc:
        log.warning("storyboard: a %s scene left out — malformed (%s)", str(raw.get("type"))[:20], exc)
        return None


def _clean_one(raw: dict, names: dict[str, str]) -> dict | None:
    kind = raw.get("type")
    say = _line(raw.get("say"), 300)
    if kind == "hook":
        text = _line(raw.get("text"), 160)
        hook = {"type": kind, "text": text, "icon": _icon(raw.get("icon"), "Zap"), "say": say}
        if _line(raw.get("sub"), 100):
            hook["sub"] = _line(raw.get("sub"), 100)
        apps = _apps(raw.get("apps"))
        if apps:
            hook["apps"] = apps  # Showcase: the bubbles floating round the line
        if raw.get("device") in TECH_DEVICES:
            hook["device"] = raw["device"]  # Tech explainer: the device in the viewer's hand
        if _line(raw.get("draw"), 300):
            hook["draw"] = _line(raw.get("draw"), 300)  # Doodle notes: the sketch under the line (app/doodle.py)
        if raw.get("mood") in CARTOON_MOODS:  # Story · Characters: who wonders, and how
            hook["who"], hook["mood"] = _who(raw.get("who")), raw["mood"]
        if isinstance(raw.get("moods"), list):  # Reaction meme: the first meme moment
            hook.update(_react_fields(raw))
        if _line(raw.get("word"), 14):  # Collage · Studio: the big thin word over the main photo
            hook["word"] = _line(raw["word"], 14)
        return hook if text else None
    if kind == "react":
        text = _line(raw.get("text"), 120)
        return {"type": kind, "text": text, "icon": _icon(raw.get("icon"), "Smartphone"), **_react_fields(raw), "say": say} if text else None
    if kind == "collage":
        given = raw.get("tiles") if isinstance(raw.get("tiles"), list) else raw.get("items") if isinstance(raw.get("items"), list) else []
        tiles = [{"icon": _icon(x.get("icon"), "Sparkles"), "label": _line(x.get("label"), 30)} for x in given if isinstance(x, dict) and _line(x.get("label"), 30)][:5]
        word = _line(raw.get("word"), 14)
        return {"type": kind, "word": word, "tiles": tiles, "say": say} if word or tiles else None
    if kind == "statement":
        text = _line(raw.get("text"), 120)
        return {"type": kind, "text": text, "sub": _line(raw.get("sub"), 60), "say": say} if text else None
    if kind == "onair":  # Podcast: at the studio desk
        text = _line(raw.get("text"), 120)
        return {"type": kind, "text": text, "icon": _icon(raw.get("icon"), "MessageCircle"), "gesture": "shrug" if raw.get("gesture") == "shrug" else "talk", "mood": raw.get("mood") if raw.get("mood") in PODCAST_MOODS else "happy", "say": say} if text else None
    if kind == "visit":  # Podcast: out in a place the story goes
        scene = {"type": kind, "place": 2 if str(raw.get("place")).strip() == "2" else 1, "pose": raw.get("pose") if raw.get("pose") in PODCAST_POSES else "stand", "mood": raw.get("mood") if raw.get("mood") in PODCAST_MOODS else "happy", "text": _line(raw.get("text"), 100), "say": say}
        if raw.get("icon"):
            scene["icon"] = _icon(raw.get("icon"), "Lightbulb")
        return scene if scene["text"] or say else None
    if kind == "speak":  # Presenter · Brand host: one idea on the panel beside her
        text = _line(raw.get("text"), 120)
        scene = {"type": kind, "text": text, "icon": _icon(raw.get("icon"), "Lightbulb"), "gesture": raw.get("gesture") if raw.get("gesture") in PRESENTER_GESTURES else "present", "say": say}
        product = names.get(_line(raw.get("product"), 120).lower(), "")
        if product:
            scene["product"] = product
        if _line(raw.get("draw"), 300):
            scene["draw"] = _line(raw["draw"], 300)  # the picture over the words (app/doodle.py HOST_PICTURE_STYLE)
        return scene if text else None
    if kind == "pedestal":
        title = _line(raw.get("title"), 40)
        return {"type": kind, "title": title, "left": _line(raw.get("left"), 50), "right": _line(raw.get("right"), 50), "icon": _icon(raw.get("icon"), "Sparkles"), "say": say} if title else None
    if kind == "punch":
        text = _line(raw.get("text"), 120)
        return {"type": kind, "text": text, **_react_fields(raw, one=True), "say": say} if text else None
    if kind == "talk":
        text = _line(raw.get("text"), 120)
        scene = {"type": kind, "who": _who(raw.get("who")), "mood": raw.get("mood") if raw.get("mood") in CARTOON_MOODS else "happy", "text": text, "say": say}
        if raw.get("think") is True:
            scene["think"] = True
        if raw.get("icon") and (scene.get("think") or not text):
            scene["icon"] = _icon(raw.get("icon"), "Lightbulb")
        item = raw.get("item") if isinstance(raw.get("item"), dict) else None
        if item and (item.get("icon") or item.get("label")):
            scene["item"] = {"icon": _icon(item.get("icon"), "Package"), "label": _line(item.get("label"), 24)}
        return scene if text or scene.get("icon") else None
    if kind == "climb":
        title = _line(raw.get("title"), 70)
        return {"type": kind, "title": title, "text": _line(raw.get("text"), 120), "word": _line(raw.get("word"), 24), "say": say} if title else None
    if kind == "mirror":
        before, after = _line(raw.get("before"), 60), _line(raw.get("after"), 60)
        return {"type": kind, "title": _line(raw.get("title"), 60), "before": before, "after": after, "say": say} if before and after else None
    if kind == "grow":
        title = _line(raw.get("title"), 60)
        return {"type": kind, "title": title, "text": _line(raw.get("text"), 120), "say": say} if title else None
    if kind == "summit":
        text = _line(raw.get("text"), 140)
        return {"type": kind, "text": text, "author": _line(raw.get("author"), 40), "say": say} if text else None
    if kind == "whiteboard":
        board_kind = raw.get("kind") if raw.get("kind") in BOARD_KINDS else "list"
        parts = []
        for x in (raw.get("parts") if isinstance(raw.get("parts"), list) else [])[:4]:
            if not isinstance(x, dict) or not _line(x.get("label"), 30):
                continue
            part = {"icon": _icon(x.get("icon"), "Sparkles"), "label": _line(x.get("label"), 30), "value": _line(x.get("value"), 12)}
            if board_kind == "sum" and x.get("op") in SUM_OPS:
                part["op"] = x["op"]
            parts.append(part)
        if board_kind == "bars" and any(_number(p["value"]) <= 0 for p in parts):
            board_kind = "list"  # bars need a number each — else it's a list
        if board_kind == "sum" and len(parts) < 3:
            board_kind = "flow"
        return {"type": kind, "title": _line(raw.get("title"), 70), "kind": board_kind, "parts": parts, "say": say} if len(parts) >= 2 else None
    if kind == "example":
        people = []
        for x in (raw.get("people") if isinstance(raw.get("people"), list) else [])[:3]:
            if not isinstance(x, dict) or not _line(x.get("text"), 50):
                continue
            people.append({
                "name": _line(x.get("name"), 20),
                "look": x.get("look") if x.get("look") in CAST_LOOKS else CAST_LOOKS[len(people) % len(CAST_LOOKS)],
                "color": x.get("color") if x.get("color") in CAST_COLORS else ("teal", "orange", "purple")[len(people)],
                "mood": x.get("mood") if x.get("mood") in CARTOON_MOODS else "happy",
                "icon": _icon(x.get("icon"), "User"),
                "text": _line(x.get("text"), 50),
                "value": _line(x.get("value"), 12),
                "tone": "bad" if x.get("tone") == "bad" else "good",
            })
        return {"type": kind, "title": _line(raw.get("title"), 60), "people": people, "say": say} if len(people) >= 2 else None
    if kind == "remember":
        text = _line(raw.get("text"), 120)
        return {"type": kind, "title": _line(raw.get("title"), 40), "text": text, "icon": _icon(raw.get("icon"), "Star"), "say": say} if text else None
    if kind == "note":
        checks = [c for c in (_line(c, 40) for c in (raw.get("checks") if isinstance(raw.get("checks"), list) else []) if isinstance(c, str)) if c][:5]
        return (
            {"type": kind, "who": _who(raw.get("who")), "mood": raw.get("mood") if raw.get("mood") in CARTOON_MOODS else "happy", "title": _line(raw.get("title"), 40), "checks": checks, "say": say}
            if len(checks) >= 2
            else None
        )
    if kind == "doodle":
        title = _line(raw.get("title") or raw.get("text"), 100)
        scene = {"type": kind, "title": title, "text": _line(raw.get("text"), 120) if raw.get("title") else "", "icon": _icon(raw.get("icon"), "Brain"), "say": say}
        if _line(raw.get("draw"), 300):
            scene["draw"] = _line(raw.get("draw"), 300)
        return scene if title else None
    if kind == "meme":
        top, bottom = _line(raw.get("top"), 90), _line(raw.get("bottom"), 90)
        mood = raw.get("mood") if raw.get("mood") in MEME_FACES else "laughing"
        return {"type": kind, "top": top, "bottom": bottom, "mood": mood, "say": say} if top and bottom else None
    if kind == "take":
        text = _line(raw.get("text"), 120)
        return {"type": kind, "before": _line(raw.get("before"), 80), "text": text, "say": say} if text else None
    if kind == "client":
        name = _line(raw.get("name"), 40)
        text = _line(raw.get("text"), 140)
        return (
            {"type": kind, "name": name, "field": _line(raw.get("field"), 50), "text": text, "example": raw.get("example") is not False, "say": say}
            if name and text
            else None
        )
    if kind == "metrics":
        items = []
        for m in (raw.get("rows") or [])[:3]:
            if not isinstance(m, dict) or not _line(m.get("label"), 30):
                continue
            b, a = _number_signed(m.get("before")), _number_signed(m.get("after"))
            if b is None or a is None:
                continue
            items.append({"label": _line(m.get("label"), 30), "before": b, "after": a, "prefix": _line(m.get("prefix"), 3), "suffix": _line(m.get("suffix"), 10)})
        return {"type": kind, "title": _line(raw.get("title"), 60), "rows": items, "say": say} if items else None
    if kind == "timeline":
        steps = [
            {"when": _line(x.get("when"), 16), "text": _line(x.get("text"), 60)}
            for x in (raw.get("steps") or [])
            if isinstance(x, dict) and _line(x.get("text"), 60)
        ][:4]
        return {"type": kind, "title": _line(raw.get("title"), 60), "steps": steps, "say": say} if len(steps) >= 2 else None
    if kind == "qa":
        q, a = _line(raw.get("q"), 100), _line(raw.get("a"), 200)
        return {"type": kind, "q": q, "a": a, "say": say} if q and a else None
    if kind == "bars":
        items = []
        for x in (raw.get("data") or [])[:6]:
            v = _number_signed(x.get("value")) if isinstance(x, dict) else None
            if v is not None and _line(x.get("label"), 24):
                items.append({"label": _line(x.get("label"), 24), "value": v})
        return (
            {"type": kind, "title": _line(raw.get("title"), 70), "data": items, "prefix": _line(raw.get("prefix"), 3), "suffix": _line(raw.get("suffix"), 6), "source": _line(raw.get("source"), 60), "say": say}
            if len(items) >= 2
            else None
        )
    if kind == "donut":
        v = _number(raw.get("value"))
        label = _line(raw.get("label"), 80)
        return {"type": kind, "value": round(v, 1), "label": label, "source": _line(raw.get("source"), 60), "say": say} if 0 < v < 100 and label else None
    if kind in ("rank", "tip"):
        title = _line(raw.get("title"), 70)
        return {"type": kind, "title": title, "text": _line(raw.get("text"), 120), "icon": _icon(raw.get("icon"), "Sparkles"), "say": say} if title else None
    if kind == "choice":
        sides = []
        for key in ("left", "right"):
            side = raw.get(key) if isinstance(raw.get(key), dict) else {}
            sides.append({"name": _line(side.get("name") or side.get("label"), 30), "icon": _icon(side.get("icon"), "Circle")})
        question = _line(raw.get("question"), 80)
        pct = int(_number(str(raw.get("percent") or "").replace("%", "")))
        return (
            {"type": kind, "question": question, "left": sides[0], "right": sides[1], "percent": pct if 0 < pct < 100 else 0, "prompt": _line(raw.get("prompt"), 30), "say": say}
            if question and sides[0]["name"] and sides[1]["name"]
            else None
        )
    if kind == "reviews":
        cards = []
        for c in (raw.get("cards") or [])[:4]:
            if not isinstance(c, dict) or not _line(c.get("text"), 140):
                continue
            stars = int(_number(c.get("stars")) or 5)
            cards.append({"name": _line(c.get("name"), 24), "text": _line(c.get("text"), 140), "stars": max(1, min(5, stars))})
        rating = _number(raw.get("rating"))
        rating = round(rating, 1) if 1 <= rating <= 5 else 0
        return (
            {"type": kind, "title": _line(raw.get("title"), 30), "rating": rating, "count": _line(raw.get("count"), 30), "cards": cards, "say": say}
            if len(cards) >= 2 or rating
            else None
        )
    if kind == "logos":
        names = [n for n in (_line(n, 24) for n in (raw.get("names") or [])) if n][:8]
        return {"type": kind, "title": _line(raw.get("title"), 60), "names": names, "say": say} if len(names) >= 3 else None
    if kind == "save":
        text = _line(raw.get("text"), 80)
        return {"type": kind, "text": text, "button": _line(raw.get("button"), 16), "say": say} if text else None
    if kind == "platform":
        text = _line(raw.get("text"), 100)
        shot = int(raw.get("shot")) if str(raw.get("shot") or "").strip().isdigit() else 0
        return {"type": kind, "text": text, "shot": shot, "say": say} if text else None
    if kind == "orbit":
        c = raw.get("center") if isinstance(raw.get("center"), dict) else {}
        tags = [
            {"icon": _icon(x.get("icon"), "Check"), "label": _line(x.get("label"), 24)}
            for x in (raw.get("tags") or [])
            if isinstance(x, dict) and _line(x.get("label"), 24)
        ][:6]
        center = {"icon": _icon(c.get("icon"), "FileText"), "title": _line(c.get("title"), 40), "sub": _line(c.get("sub"), 24)}
        return {"type": kind, "text": _line(raw.get("text"), 100), "center": center, "tags": tags, "say": say} if center["title"] and len(tags) >= 3 else None
    if kind == "chaos":
        cards = [
            {"app": _line(x.get("app"), 20), "title": _line(x.get("title"), 40), "sub": _line(x.get("sub"), 40)}
            for x in (raw.get("cards") or [])
            if isinstance(x, dict) and _line(x.get("title"), 40)
        ][:6]
        text = _line(raw.get("text"), 80)
        return {"type": kind, "text": text, "cards": cards, "say": say} if text and len(cards) >= 3 else None
    if kind == "phones":
        words = [w for w in (_line(w, 20) for w in (raw.get("words") or [])) if w][:4]
        shots = [int(x) for x in (raw.get("shots") or []) if str(x).strip().isdigit() and int(x) >= 1][:4]
        return {"type": kind, "words": words, "shots": shots, "say": say} if words else None
    if kind == "pair":
        left, right = _line(raw.get("left"), 30), _line(raw.get("right"), 24)
        return (
            {"type": kind, "left": left, "right": right, "icon": _icon(raw.get("icon"), "BookOpen"), "label": _line(raw.get("label"), 20), "say": say}
            if left and right
            else None
        )
    if kind == "launch":
        name = _line(raw.get("name"), 30)
        return {"type": kind, "name": names.get(name.lower(), name), "text": _line(raw.get("text"), 100), "badge": _line(raw.get("badge"), 16), "say": say} if name else None
    if kind == "canvas":  # AI design — the AI designed it; checked layer by layer
        return _clean_canvas(raw, say)
    if kind in ("send", "address", "lookup", "hops", "assemble"):  # Tech explainer
        dev = lambda v, d="phone": v if v in TECH_DEVICES else d  # noqa: E731
        text = _line(raw.get("text"), 80)
        if kind == "send":
            ends = [raw.get("from") or {}, raw.get("to") or {}]
            if not all(isinstance(e, dict) for e in ends):
                return None
            (a, b) = ({"device": dev(e.get("device"), d), "label": _line(e.get("label"), 30)} for e, d in zip(ends, ("phone", "router")))
            return {"type": kind, "from": a, "to": b, "text": text, "say": say}
        if kind == "address":
            frm, to = _line(raw.get("from"), 24), _line(raw.get("to"), 24)
            return {"type": kind, "device": dev(raw.get("device"), "router"), "from": frm, "to": to, "text": text, "say": say} if frm and to else None
        if kind == "lookup":
            q, a = _line(raw.get("question"), 60), _line(raw.get("answer"), 30)
            return {"type": kind, "server": _line(raw.get("server"), 16) or "Server", "question": q, "answer": a, "text": text, "say": say} if q and a else None
        if kind == "hops":
            nodes = [
                {"device": dev(x.get("device"), "server"), "label": _line(x.get("label"), 24)}
                for x in (raw.get("nodes") or [])
                if isinstance(x, dict)
            ][:5]
            return {"type": kind, "nodes": nodes, "text": text, "say": say} if len(nodes) >= 3 else None
        return {"type": kind, "device": dev(raw.get("device")), "label": _line(raw.get("label"), 30), "text": text, "say": say}
    if kind == "tasks":
        items = [
            {"icon": _icon(x.get("icon"), "Repeat"), "text": _line(x.get("text"), 40)}
            for x in (raw.get("items") or [])
            if isinstance(x, dict) and _line(x.get("text"), 40)
        ][:4]
        return {"type": kind, "title": _line(raw.get("title"), 60), "items": items, "sticker": _line(raw.get("sticker"), 40), "say": say} if len(items) >= 2 else None
    if kind == "fanout":
        kinds = ("post", "price", "tags", "chat", "list")
        outputs = [
            {"kind": x.get("kind"), "value": _line(x.get("value"), 50)}
            for x in (raw.get("outputs") or [])
            if isinstance(x, dict) and x.get("kind") in kinds
        ][:3]
        name = _line(raw.get("product"), 60)
        checks = [_line(c, 40) for c in (raw.get("checks") or []) if _line(c, 40)][:2]
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "product": names.get(name.lower(), name), "icon": _icon(raw.get("icon"), "Image"), "outputs": outputs, "checks": checks, "say": say}
            if len(outputs) >= 2
            else None
        )
    if kind == "word":
        word = _line(raw.get("word"), 24)
        rows = [
            {"name": _line(x.get("name"), 30), "sub": _line(x.get("sub"), 40)}
            for x in (raw.get("rows") or [])
            if isinstance(x, dict) and _line(x.get("name"), 30)
        ][:3]
        return (
            {"type": kind, "word": word, "title": _line(raw.get("title"), 40), "action": _line(raw.get("action"), 14), "text": _line(raw.get("text"), 90), "rows": rows, "say": say}
            if word
            else None
        )
    if kind == "field":
        value = _line(raw.get("value"), 40)
        return {"type": kind, "label": _line(raw.get("label"), 30), "value": value, "button": _line(raw.get("button"), 20), "say": say} if value else None
    if kind == "done":
        text = _line(raw.get("text"), 40)
        return {"type": kind, "text": text, "icon": _icon(raw.get("icon"), "Check"), "say": say} if text else None
    if kind == "button":
        button = _line(raw.get("button"), 28)
        return (
            {"type": kind, "title": _line(raw.get("title"), 40), "text": _line(raw.get("text"), 80), "button": button, "result": _line(raw.get("result"), 50), "say": say}
            if button
            else None
        )
    if kind == "form":
        fields = [
            {"label": _line(f.get("label"), 24), "value": _line(f.get("value"), 40)}
            for f in (raw.get("fields") or [])
            if isinstance(f, dict) and _line(f.get("label"), 24) and _line(f.get("value"), 40)
        ][:3]
        return {"type": kind, "title": _line(raw.get("title"), 40), "fields": fields, "toggle": _line(raw.get("toggle"), 50), "say": say} if fields else None
    if kind == "stack":
        shots = [int(x) for x in (raw.get("shots") or []) if str(x).strip().isdigit()][:4]
        words = [w for w in (_line(w, 16) for w in (raw.get("words") or [])) if w][:3]
        shots = [x for x in dict.fromkeys(shots) if x >= 1]
        return {"type": kind, "words": words, "shots": shots, "say": say} if len(shots) >= 2 else None
    if kind == "apps":
        apps = _apps(raw.get("apps"))
        return {"type": kind, "title": _line(raw.get("title"), 80), "apps": apps, "say": say} if len(apps) >= 3 else None
    if kind == "roll":
        words = [w for w in (_line(w, 16) for w in (raw.get("words") or [])) if w][:5]
        return (
            {"type": kind, "lead": _line(raw.get("lead"), 24), "words": words, "icon": _icon(raw.get("icon"), "Check"), "text": _line(raw.get("text"), 80), "say": say}
            if len(words) >= 2
            else None
        )
    if kind == "table":
        columns = [c for c in (_line(c, 24) for c in (raw.get("columns") or [])) if c][:5]
        rows = [
            [_line(cell, 40) for cell in (list(r) + [""] * len(columns))[: len(columns)]]
            for r in (raw.get("rows") or [])
            if isinstance(r, list) and r and _line(r[0], 40)
        ][:6]
        groups = [g for g in (_line(g, 24) for g in (raw.get("groups") or [])) if g][:4]
        return (
            {"type": kind, "title": _line(raw.get("title"), 40), "columns": columns, "rows": rows, "groups": groups, "say": say}
            if len(columns) >= 2 and len(rows) >= 2
            else None
        )
    if kind == "board":
        columns = [
            {"name": _line(c.get("name"), 20), "cards": [x for x in (_line(x, 50) for x in (c.get("cards") or [])) if x][:3]}
            for c in (raw.get("columns") or [])
            if isinstance(c, dict) and _line(c.get("name"), 20)
        ][:3]
        return {"type": kind, "title": _line(raw.get("title"), 80), "columns": columns, "say": say} if len(columns) >= 2 and columns[0]["cards"] else None
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
                "suffix": _line(raw.get("suffix"), 10),  # "/month", not "/mon"
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
        cta = {"type": kind, "text": text, "button": _line(raw.get("button"), 40), "say": say}
        if _line(raw.get("draw"), 300):
            cta["draw"] = _line(raw.get("draw"), 300)  # Doodle notes
        return cta if text else None
    if kind == "character":
        title = _line(raw.get("title"), 80)
        icon = str(raw.get("icon") or "").strip()
        return (
            {
                "type": kind,
                "title": title,
                "mood": raw.get("mood") if raw.get("mood") in MOODS else "happy",
                "icon": icon if icon in ICONS else "",
                "tag": _line(raw.get("tag"), 16),
                "say": say,
            }
            if title
            else None
        )
    if kind == "compare":

        def person(p) -> dict | None:
            if not isinstance(p, dict) or not _line(p.get("name"), 40):
                return None
            return {
                "name": _line(p.get("name"), 40),
                "mood": p.get("mood") if p.get("mood") in MOODS else "happy",
                "value": _line(p.get("value"), 16),
                "tone": "bad" if p.get("tone") == "bad" else "good",
            }

        left, right = person(raw.get("left")), person(raw.get("right"))
        return {"type": kind, "title": _line(raw.get("title"), 80), "left": left, "right": right, "say": say} if left and right else None
    if kind == "chart":
        # Checked here, so the chart always draws: same number of values as
        # labels, real numbers, at most two lines. Its tags are computed from
        # these values by the template, so they always agree with the lines.
        labels = [_line(lab, 10) for lab in (raw.get("labels") or [])][:8]
        series = []
        for s in (raw.get("series") or [])[:2]:
            if not isinstance(s, dict):
                continue
            values = [_number_signed(v) for v in (s.get("values") or [])]
            if len(values) >= 2 and None not in values and (not labels or len(values) == len(labels)):
                series.append({"name": _line(s.get("name"), 40), "tone": "bad" if s.get("tone") == "bad" else "good", "values": values})
        if not series:
            return None
        n = len(series[0]["values"])
        series = [s for s in series if len(s["values"]) == n]
        return {
            "type": kind,
            "title": _line(raw.get("title"), 80),
            "prefix": _line(raw.get("prefix"), 3),
            "suffix": _line(raw.get("suffix"), 4),
            "labels": labels or [str(i) for i in range(n)],
            "series": series,
            "say": say,
        }
    if kind == "split":

        def side(p) -> dict | None:
            if not isinstance(p, dict):
                return None
            points = [x for x in (_line(x, 60) for x in (p.get("points") or [])) if x][:3]
            label = _line(p.get("label"), 40)
            return {"label": label, "icon": _icon(p.get("icon"), "Circle"), "points": points} if label and points else None

        left, right = side(raw.get("left")), side(raw.get("right"))
        return {"type": kind, "title": _line(raw.get("title"), 80), "left": left, "right": right, "say": say} if left and right else None
    if kind == "myth":
        myth, fact = _line(raw.get("myth"), 160), _line(raw.get("fact"), 160)
        return {"type": kind, "myth": myth, "fact": fact, "say": say} if myth and fact else None
    if kind in ("verdict", "reveal"):
        text = _line(raw.get("text"), 140)
        return {"type": kind, "text": text, "icon": _icon(raw.get("icon"), "Award" if kind == "verdict" else "Lightbulb"), "say": say} if text else None
    if kind == "options":
        opts = [o for o in (_line(o, 50) for o in (raw.get("options") or [])) if o][:4]
        try:
            answer = int(raw.get("answer"))
        except (TypeError, ValueError):
            answer = -1
        return (
            {"type": kind, "question": _line(raw.get("question"), 60), "options": opts, "answer": answer if 0 <= answer < len(opts) else -1, "say": say}
            if len(opts) >= 2
            else None
        )
    if kind == "customer":
        name = _line(raw.get("name"), 40)
        return (
            {
                "type": kind,
                "name": name,
                "business": _line(raw.get("business"), 60),
                "text": _line(raw.get("text"), 140),
                "mood": raw.get("mood") if raw.get("mood") in MOODS else "thinking",
                "say": say,
            }
            if name
            else None
        )
    if kind == "beforeafter":
        before, after = _line(raw.get("before"), 140), _line(raw.get("after"), 140)
        return {"type": kind, "title": _line(raw.get("title"), 80), "before": before, "after": after, "say": say} if before and after else None
    if kind == "result":
        value = _number(raw.get("value"))
        label = _line(raw.get("label"), 80)
        return (
            {
                "type": kind,
                "value": int(value) if value == int(value) else round(value, 1),
                "prefix": _line(raw.get("prefix"), 3),
                "suffix": _line(raw.get("suffix"), 4),
                "label": label,
                "say": say,
            }
            if value and label
            else None
        )
    if kind == "review":
        text = _line(raw.get("text"), 220)
        try:
            stars = int(raw.get("stars") or 5)
        except (TypeError, ValueError):
            stars = 5
        return {"type": kind, "text": text, "name": _line(raw.get("name"), 40), "stars": max(1, min(5, stars)), "say": say} if text else None
    if kind == "quote":
        text = _line(raw.get("text"), 220)
        return {"type": kind, "text": text, "author": _line(raw.get("author"), 40), "role": _line(raw.get("role"), 50), "say": say} if text else None
    if kind == "screen":
        try:
            shot = int(raw.get("shot"))
        except (TypeError, ValueError):
            return None
        scene = {
            "type": kind,
            "shot": shot,
            "title": _line(raw.get("title"), 80),
            "text": _line(raw.get("text"), 120),
            "target": _line(raw.get("target"), 80),
            "action": raw.get("action") if raw.get("action") in ("click", "highlight", "zoom") else "click",
            "result": _line(raw.get("result"), 50),
            "say": say,
        }
        if _box(raw.get("focus")):
            scene["focus"] = _box(raw.get("focus"))  # found already (a reviewed storyboard)
        return scene if shot >= 1 else None
    if kind == "chapter":
        title = _line(raw.get("title"), 80)
        return {"type": kind, "title": title, "text": _line(raw.get("text"), 120), "say": say} if title else None
    if kind == "checklist":
        checks = [c for c in (_line(c, 90) for c in (raw.get("checks") or [])) if c][:6]
        return {"type": kind, "title": _line(raw.get("title"), 90), "checks": checks, "say": say} if len(checks) >= 2 else None
    if kind == "recap":
        points = [
            {"title": _line(x.get("title"), 40), "text": _line(x.get("text"), 100)}
            for x in (raw.get("points") or [])
            if isinstance(x, dict) and _line(x.get("title"), 40)
        ][:5]
        return {"type": kind, "title": _line(raw.get("title"), 80), "points": points, "say": say} if len(points) >= 2 else None
    if kind == "dashboard":
        metrics = []
        for m in (raw.get("metrics") or [])[:3]:
            if not isinstance(m, dict) or not _line(m.get("label"), 30):
                continue
            value = _number(m.get("value"))
            metrics.append(
                {
                    "label": _line(m.get("label"), 30),
                    "value": int(value) if value == int(value) else round(value, 1),
                    "prefix": _line(m.get("prefix"), 3),
                    "suffix": _line(m.get("suffix"), 4),
                    "delta": _line(m.get("delta"), 8),
                }
            )
        chart = "bars" if raw.get("chart") == "bars" else "line"
        return {"type": kind, "title": _line(raw.get("title"), 60), "metrics": metrics, "chart": chart, "say": say} if metrics else None
    if kind == "flow":
        nodes = [
            {"icon": _icon(n.get("icon"), "Zap"), "label": _line(n.get("label"), 40), "sub": _line(n.get("sub"), 30)}
            for n in (raw.get("nodes") or [])
            if isinstance(n, dict) and _line(n.get("label"), 40)
        ][:4]
        return {"type": kind, "title": _line(raw.get("title"), 60), "nodes": nodes, "say": say} if len(nodes) >= 2 else None
    if kind == "news":
        headline = _line(raw.get("headline"), 140)
        return {"type": kind, "tag": _line(raw.get("tag"), 30), "headline": headline, "text": _line(raw.get("text"), 160), "say": say} if headline else None
    if kind == "notify":
        notes = [
            {"app": _line(n.get("app"), 20) or "Messenger", "text": _line(n.get("text"), 90)}
            for n in (raw.get("notes") or [])
            if isinstance(n, dict) and _line(n.get("text"), 90)
        ][:4]
        time = _line(raw.get("time"), 5)
        return (
            {"type": kind, "title": _line(raw.get("title"), 80), "time": time if re.fullmatch(r"\d{1,2}:\d{2}", time) else "", "notes": notes, "say": say}
            if len(notes) >= 2
            else None
        )
    if kind == "step":
        title = _line(raw.get("title"), 80)
        return (
            {"type": kind, "title": title, "text": _line(raw.get("text"), 140), "icon": _icon(raw.get("icon"), "Zap"), "result": _line(raw.get("result"), 50), "say": say}
            if title
            else None
        )
    if kind == "offer":
        features = [f for f in (_line(f, 50) for f in (raw.get("features") or [])) if f][:4]
        offer = {
            "type": kind,
            "plan": _line(raw.get("plan"), 40),
            "price": _line(raw.get("price"), 14),
            "period": _line(raw.get("period"), 14),
            "was": _line(raw.get("was"), 14),
            "badge": _line(raw.get("badge"), 28),
            "features": features,
            "say": say,
        }
        if not offer["price"]:
            offer["was"] = offer["period"] = ""  # no price, no "/month" or old price either
        return offer if (offer["plan"] or offer["price"]) and features else None
    return None


def _number_signed(value) -> float | None:
    """A chart value — negatives allowed (money spent), None when not a number."""
    try:
        n = float(str(value).replace(",", "").replace("$", "").strip())
    except ValueError:
        return None
    return n if -1e9 < n < 1e9 else None


# The on-screen and spoken text of each scene type, for the Khmer editor pass.
_TEXT_FIELDS = {
    "hook": (("text", 160), ("say", 300)),
    "problem": (("title", 80), ("text", 140), ("say", 300)),
    "chat": (("title", 100), ("say", 300)),
    "list": (("title", 80), ("say", 300)),
    "stat": (("label", 80), ("say", 300)),
    "product": (("title", 100), ("say", 300)),
    "cta": (("text", 140), ("button", 40), ("say", 300)),
    "character": (("title", 80), ("say", 300)),
    "compare": (("title", 80), ("say", 300)),
    "chart": (("title", 80), ("say", 300)),
    "split": (("title", 80), ("say", 300)),
    "myth": (("myth", 160), ("fact", 160), ("say", 300)),
    "verdict": (("text", 140), ("say", 300)),
    "reveal": (("text", 140), ("say", 300)),
    "options": (("question", 60), ("say", 300)),
    "quote": (("text", 220), ("say", 300)),
    "customer": (("business", 60), ("text", 140), ("say", 300)),
    "beforeafter": (("title", 80), ("before", 140), ("after", 140), ("say", 300)),
    "result": (("label", 80), ("say", 300)),
    "review": (("say", 300),),
    "news": (("tag", 30), ("headline", 140), ("text", 160), ("say", 300)),
    "screen": (("title", 80), ("text", 120), ("result", 50), ("say", 300)),
    "dashboard": (("title", 60), ("say", 300)),
    "chapter": (("title", 80), ("text", 120), ("say", 300)),
    "checklist": (("title", 90), ("say", 300)),
    "recap": (("title", 80), ("say", 300)),
    "flow": (("title", 60), ("say", 300)),
    "notify": (("title", 80), ("say", 300)),
    "step": (("title", 80), ("text", 140), ("result", 50), ("say", 300)),
    "offer": (("badge", 28), ("period", 14), ("say", 300)),
    "apps": (("title", 80), ("say", 300)),
    "launch": (("text", 100), ("badge", 16), ("say", 300)),
    "platform": (("text", 100), ("say", 300)),
    "rank": (("title", 70), ("text", 120), ("say", 300)),
    "take": (("before", 80), ("text", 120), ("say", 300)),
    "meme": (("top", 90), ("bottom", 90), ("say", 300)),
    "client": (("field", 50), ("text", 140), ("say", 300)),
    "metrics": (("title", 60), ("say", 300)),
    "timeline": (("title", 60), ("say", 300)),
    "qa": (("q", 100), ("a", 200), ("say", 300)),
    "bars": (("title", 70), ("say", 300)),
    "donut": (("label", 80), ("say", 300)),
    "tip": (("title", 70), ("text", 120), ("say", 300)),
    "doodle": (("title", 100), ("text", 120), ("say", 300)),
    "talk": (("text", 120), ("say", 300)),
    "react": (("text", 120), ("bubble", 30), ("say", 300)),
    "collage": (("word", 14), ("say", 300)),
    "statement": (("text", 120), ("sub", 60), ("say", 300)),
    "pedestal": (("title", 40), ("left", 50), ("right", 50), ("say", 300)),
    "punch": (("text", 120), ("say", 300)),
    "speak": (("text", 120), ("say", 300)),
    "onair": (("text", 120), ("say", 300)),
    "visit": (("text", 100), ("say", 300)),
    "whiteboard": (("title", 70), ("say", 300)),
    "climb": (("title", 70), ("text", 120), ("word", 24), ("say", 300)),
    "mirror": (("title", 60), ("before", 60), ("after", 60), ("say", 300)),
    "grow": (("title", 60), ("text", 120), ("say", 300)),
    "summit": (("text", 140), ("say", 300)),
    "example": (("title", 60), ("say", 300)),
    "remember": (("title", 40), ("text", 120), ("say", 300)),
    "note": (("title", 40), ("say", 300)),
    "choice": (("question", 80), ("prompt", 30), ("say", 300)),
    "reviews": (("title", 30), ("say", 300)),
    "logos": (("title", 60), ("say", 300)),
    "save": (("text", 80), ("button", 16), ("say", 300)),
    "orbit": (("text", 100), ("say", 300)),
    "chaos": (("text", 80), ("say", 300)),
    "phones": (("say", 300),),
    "pair": (("left", 30), ("right", 24), ("label", 20), ("say", 300)),
    "button": (("title", 40), ("text", 80), ("button", 28), ("result", 50), ("say", 300)),
    "word": (("word", 24), ("title", 40), ("text", 90), ("say", 300)),
    "tasks": (("title", 60), ("sticker", 40), ("say", 300)),
    "send": (("text", 80), ("say", 300)),
    "address": (("text", 80), ("say", 300)),
    "lookup": (("question", 60), ("text", 80), ("say", 300)),
    "hops": (("text", 80), ("say", 300)),
    "assemble": (("text", 80), ("say", 300)),
    "fanout": (("title", 60), ("say", 300)),
    "field": (("label", 30), ("button", 20), ("say", 300)),
    "done": (("text", 40), ("say", 300)),
    "form": (("title", 40), ("toggle", 50), ("say", 300)),
    "stack": (("say", 300),),
    "roll": (("lead", 24), ("text", 80), ("say", 300)),
    "table": (("title", 40), ("say", 300)),
    "board": (("title", 80), ("say", 300)),
    "canvas": (("say", 300),),  # its layers' words: write_script's AI-design branch
}


# "Make one for me": no topic given — each press asks for another angle, so
# pressing again gives a different video, not the same one reworded.
AUTO_ANGLES = (
    "the everyday problem it solves",
    "3 clear benefits",
    "how it works, in 3 simple steps",
    "3 mistakes people make without it",
    "before and after using it",
    "a common belief about it, and the truth",
)
AUTO_LABEL = "✨ Topic chosen by the AI"


TEACH_ANGLES = (
    "a surprising number about it",
    "how small choices about it add up over time",
    "two people making different choices",
    "the mistake most people make with it",
    "what most people get wrong about it, and the truth",
)


def _auto_topic(products: list[Product], style: str = "tech") -> str:
    if style not in SELLING_STYLES:
        topic = f"a topic around {products[0].name}" if len(products) == 1 else "a topic around what this brand does" if products else "a useful everyday topic for this brand's customers"
        if style == "custom":
            return (
                "THE VIDEO IS ABOUT: no topic was given — choose it yourself: the most interesting thing to "
                f"show about {topic} right now — the product shown working when there are screenshots or "
                "products, else one useful idea. Stay within the product information."
            )
        if style == "trend":
            return (
                "THE VIDEO IS ABOUT: no topic was given — choose it yourself: what is changing in AI "
                f"and software that matters to this brand's customers ({topic}). Real trends only — never an ad."
            )
        if style == "pov":
            return (
                "THE VIDEO IS ABOUT: no topic was given — choose it yourself: one everyday moment "
                f"this brand's customers know too well ({topic}) — the one they would tag a friend on."
            )
        if style != "explainer":  # comparison / poll / quote: the template sets the angle
            return (
                f"THE VIDEO IS ABOUT: no topic was given — choose it yourself: {topic}. Pick what "
                "a Cambodian viewer would share, answer or want more of — never an ad."
            )
        return (
            "THE VIDEO IS ABOUT: no topic was given — choose it yourself. Teach "
            f"{topic}, told as {random.choice(TEACH_ANGLES)}. Pick what a Cambodian viewer "
            "would save and share — useful, surprising, never an ad."
        )
    angle = {"demo": "how it works, in 3 simple steps", "offer": "its offer and what you get"}.get(style) or random.choice(AUTO_ANGLES)
    about = (
        f"the product {products[0].name}"
        if len(products) == 1
        else "the ONE product from the list that makes the most interesting video right now"
        if products
        else "the brand's main service"
    )
    return (
        "THE VIDEO IS ABOUT: no topic was given — choose it yourself. Make it about "
        f"{about}, told as {angle}. Pick the angle a Cambodian business owner would stop "
        "scrolling for, and stay strictly within the product information."
    )


NO_BRAND = (
    "(none — this video carries no brand: never add a company or brand name, logo or slogan of "
    "your own; a product or company the brief itself names may be mentioned as the brief does)"
)


def write_script(
    brand: Brand,
    products: list[Product],
    idea: str,
    language: str,
    learnings: str = "",
    moods: list[str] | None = None,
    style: str = "tech",
    job_id: int | None = None,
    seconds: int | None = None,
    shots: list[dict] | None = None,
    design: dict | None = None,
    wide: bool = False,
    voice: str = "",
) -> dict:
    """The video's storyboard: one AI call, then for Khmer the same
    native-editor pass the captions get. {"scenes": [...]} — always starting
    with a hook and ending with a call to action. Raises ContentAIError.

    ``seconds`` = story mode: ``idea`` is the person's own story / script, to
    be followed scene by scene (keeping their sentences for the voice) at
    about that length — the storyboard they review before it's rendered."""
    from app.content_ai import ContentAIError, _chat, _fix_khmer_punctuation, _polish_khmer, writer_model

    khmer = "khmer" in language.lower()
    model = writer_model(khmer)
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
    prompt, allowed, most, must = STYLES.get(style) or STYLES["tech"]
    if wide:
        allowed = tuple(t for t in allowed if t not in TALL_ONLY_TYPES)
        extra += "\n\nTHIS VIDEO IS WIDE 16:9 — don't use " + ", ".join(f"`{t}`" for t in sorted(TALL_ONLY_TYPES)) + " scenes."
    own_colors = [c for c in (getattr(brand, "colors", None) or []) if isinstance(c, str)]
    if style == "canvas" and own_colors:
        extra += (
            "\n\nTHIS BRAND'S OWN COLOURS: " + ", ".join(own_colors) + " — use \"look\": \"brand\" (the film in "
            "these colours) unless the brief asks for a different mood or names other colours."
        )
    if style in SCREEN_STYLES:
        extra += _shots_prompt(shots or [])
        if design:
            extra += _design_prompt(design)
        if not shots:
            allowed = tuple(t for t in allowed if t != "screen")
        if len(shots or []) < 2:
            allowed = tuple(t for t in allowed if t != "stack")
    if style == "presenter":
        host = clean_host(None, khmer, voice)
        extra += (
            f"\n\nTHE HOST — return \"host\": {{name, gender}}. If the brief names the host (or asks for a "
            f"male / female one), use that; otherwise name \"{host['name']}\", gender \"{host['gender']}\". "
            f"THE GREETING (the hook's `say` starts with it, with her name and the brand): "
            f"\"{host_greeting(host, brand.name, khmer)}\""
        )
    story = bool(seconds and idea.strip())
    extra += SCRIPT_CRAFT + (SCRIPT_CRAFT_STORY if story else "")
    if story:  # their own story: the video speaks its language, whatever the picker says
        language = story_language(idea, language)
        khmer = "khmer" in language.lower()
        model = writer_model(khmer)
    if story:
        count = max(5, min(MAX_LONG_SCENES if style in LONG_STYLES else MAX_STORY_SCENES, round(seconds / 6.5)))
        numbered = own_scenes(idea)
        if numbered:  # their own scene list — plus a scene for each moment a scene lists
            count = max(2, min(MAX_LONG_SCENES if style in LONG_STYLES else MAX_STORY_SCENES, numbered + own_moments(idea)))
        most = count  # the person's story sets the length, not the template
        extra += STORY_RULES.format(count=count, seconds=seconds)
        if numbered:
            extra += (
                f"\nTHE SCRIPT IS WRITTEN SCENE BY SCENE ({numbered} numbered scenes): follow them in the same "
                "order — never merge two, never drop one (a scene whose visual doesn't fit a scene type is "
                "shown with the closest one). A numbered scene that lists several moments of its own "
                "(features one at a time, a reveal then its points) gets ONE scene per moment, in its "
                f"order; otherwise one scene. About {count} scenes in all. Its hook is scene 1; if the "
                "template needs a closing call to action, it is the last scene's own call to action or "
                "final line, not an extra scene. When a scene gives its own Voice line, "
                "`say` is THAT line, word for word — never write a voice line the script doesn't have, "
                "and never add the brand's name or a slogan it doesn't say. Its on-screen text stays "
                "exactly as written — every quoted line (On screen, Subtitle, features, final titles) is on "
                "screen. Sample content inside a screen (a typed caption, a chat, a name, a number) comes "
                "from THIS brief's subject — never an unrelated example (no coffee in a security film), "
                "and no made-up people's names."
            )
    raw = _chat(
        [
            {"role": "system", "content": prompt + extra},
            {
                "role": "user",
                "content": f"BRAND: {brand.name or NO_BRAND}\nLANGUAGE: {language}\nPRODUCTS:\n{facts}\n\n"
                + (
                    f"THE VIDEO IS ABOUT: {idea.strip()[: 12000 if story else 4000]}"
                    if idea.strip()
                    else _auto_topic(products, style)
                ),
            },
        ],
        model,
        # AI design writes every layer of every scene — it needs more room
        max_tokens=(32000 if style in LONG_STYLES or style == "canvas" else 16000) if story else (20000 if style == "canvas" else 9000),
        # A storyboard follows the template's recipe — it doesn't need long
        # reasoning; the default (medium) took 1-2 minutes on gpt-5-mini. The
        # Khmer editor pass after it still runs at high effort.
        effort="low",
    )
    if story and own_scenes(idea):
        missing = _missing_onscreen(idea, raw)
        if missing:
            # their quoted on-screen lines are the brief's contract: one more pass with what's missing
            log.info("storyboard: %d quoted line(s) missing — asking again: %s", len(missing), "; ".join(missing)[:200])
            try:
                again = _chat(
                    [
                        {"role": "system", "content": prompt + extra},
                        {"role": "user", "content": f"BRAND: {brand.name or NO_BRAND}\nLANGUAGE: {language}\nPRODUCTS:\n{facts}\n\nTHE VIDEO IS ABOUT: {idea.strip()[:12000]}"},
                        {"role": "assistant", "content": json.dumps(raw, ensure_ascii=False)[:60000]},
                        {
                            "role": "user",
                            "content": "Your storyboard leaves out these on-screen lines of the script — each must be on screen, "
                            "character for character, in the scene where the script puts it (add a scene for a reveal or "
                            "a feature that has none):\n- " + "\n- ".join(missing) + "\nReturn the WHOLE storyboard again, same JSON.",
                        },
                    ],
                    model,
                    max_tokens=(32000 if style in LONG_STYLES or style == "canvas" else 16000),
                    effort="low",
                )
                if isinstance(again.get("scenes"), list) and len(_missing_onscreen(idea, again)) < len(missing):
                    raw = again
            except ContentAIError as exc:
                log.warning("storyboard: the second pass for missing lines failed: %s", exc)
    names = {p.name.strip().lower(): p.name for p in products}
    if style == "canvas":  # AI design's layouts are placed for the video's shape
        for r in raw.get("scenes") or []:
            if isinstance(r, dict):
                r["_wide"] = wide
    scenes = [
        s
        for s in (_clean_scene(r, names) for r in (raw.get("scenes") or []) if isinstance(r, dict))
        if s and s["type"] in allowed
    ][: ((MAX_LONG_SCENES if style in LONG_STYLES else MAX_STORY_SCENES) + 2) if story else 14]
    if style == "canvas":
        # AI design: its own scenes in the brief's order (no hook / CTA types), and its checklist
        if len(scenes) < 2:
            log.warning("AI design unusable: %d scenes back, %d kept", len(raw.get("scenes") or []), len(scenes))
            raise ContentAIError("The AI didn't return a usable storyboard — try again.")
        r, g, b = brand_rgb(brand)
        theme_raw = raw.get("theme") if isinstance(raw.get("theme"), dict) else {}
        own = [c for c in (getattr(brand, "colors", None) or []) if isinstance(c, str)]
        theme = (
            canvas_look(theme_raw, own[0] if own else f"#{r:02x}{g:02x}{b:02x}", own[1] if len(own) > 1 else None, brand_default=bool(own))
            if "look" in theme_raw or own
            else clean_theme(theme_raw, f"#{r:02x}{g:02x}{b:02x}")
        )
        if story:
            _keep_own_voice({"scenes": scenes}, idea)
        script = {"scenes": [apply_theme(sc, theme) for sc in scenes[: (count if story else most)]], "style": style, "asks": _clean_asks(raw.get("asks")), "theme": theme, "language": language}
        if moods:
            script["mood"] = raw.get("mood") if raw.get("mood") in moods else moods[0]
        if khmer:  # the native editor polishes what the AI wrote — never the brief's quoted words
            quoted = {_plain(a.get("text")) for a in script["asks"] if a.get("text")}
            slots = [
                (L, k, n)
                for sc in script["scenes"]
                for L in sc["layers"]
                for k, n in (("text", 120), ("title", 50))
                if L.get(k) and _plain(L[k]) not in quoted and not any(q and q in _plain(L[k]) for q in quoted)
            ]
            if slots:
                fixed = _polish_khmer(
                    [obj[key] for obj, key, _ in slots],
                    model,
                    voice_examples=brand.voice_examples or "",
                    khmer_only="english" not in (brand.lang or "").lower(),
                    keep=[brand.name, *(p.name for p in products)],
                    effort="low",
                )
                for (obj, key, n), value in zip(slots, fixed):
                    obj[key] = _line(_fix_khmer_punctuation(value), n)
        if not (story and own_voice(idea)):
            _report(job_id, stage="polish", scenes=_board(script), asks=asks_status(script))
            _narrate(script, brand, products, model, khmer, own=story, narrator=story)
        _report(job_id, stage="pictures", scenes=_board(script), asks=asks_status(script))
        return script
    # A hook first and a call to action last, whatever came back.
    hooks = [s for s in scenes if s["type"] == "hook"]
    ctas = [s for s in scenes if s["type"] == "cta"]
    middle = [s for s in scenes if s["type"] not in ("hook", "cta")]
    if style == "poll":  # an answer is revealed after its question, never before
        asked = False
        kept = []
        for sc in middle:
            asked = asked or sc["type"] == "options"
            if sc["type"] != "reveal" or asked:
                kept.append(sc)
        middle = kept
    middle = middle[:most]
    if story and len(scenes) >= 2 and not (hooks and ctas):
        # their own script needn't open on a "hook" or end on a "cta" scene
        # type (a grand reveal, a tagline): it is kept as written, in its order
        log.info("storyboard: their script kept in its own order (%s)", ", ".join(s["type"] for s in scenes))
        hooks, ctas, middle = [scenes[0]], [scenes[-1]], scenes[1:-1][:most]
    if not hooks or not ctas or not middle or (must and not story and not any(s["type"] == must for s in middle)):
        log.warning(
            "storyboard unusable (%s): %d scenes back (%s), hook %s, cta %s",
            style, len(raw.get("scenes") or []), ", ".join(str(x.get("type")) for x in (raw.get("scenes") or []) if isinstance(x, dict))[:300], bool(hooks), bool(ctas),
        )
        raise ContentAIError("The AI didn't return a usable storyboard — try again.")
    # the language it's made in — a pasted script's own (story_language), which
    # can differ from the picker: the voice and the Khmer word breaks follow it
    script = {"scenes": [hooks[0], *middle, ctas[0]], "style": style, "language": language}
    if story:  # a chart / number the story never gave becomes a plain statement of that line
        script["scenes"] = [_only_story_numbers(s, idea, allowed) for s in script["scenes"]]
        _keep_own_voice(script, idea)
    if style == "cartoon":
        script["cast"], script["place"] = clean_cast(raw.get("cast")), _line(raw.get("place"), 400)
    if style == "reaction":
        script["cast"] = clean_animals(raw.get("cast"))
    if style == "presenter":
        script["host"] = clean_host(raw.get("host"), khmer, voice)
    if style == "podcast":
        script["host"] = clean_host(None, khmer, voice)
        script["places"] = clean_places(raw.get("places"))
        n = len(script["places"])  # a visit to a place that wasn't given: the first one (or none — a plain backdrop)
        for sc in script["scenes"]:
            if sc["type"] == "visit" and sc["place"] > max(1, n):
                sc["place"] = 1
    if style == "custom":
        r, g, b = brand_rgb(brand)
        script["look"] = clean_look(raw.get("look"), f"#{r:02x}{g:02x}{b:02x}")
        if design:  # their own app's design wins over the AI's guess
            script["look"] = {**script["look"], **design["look"]}
    if shots:
        script["scenes"] = [sc for sc in script["scenes"] if sc["type"] != "screen" or sc["shot"] <= len(shots)]
        locate_targets(script["scenes"], shots)
    if moods:
        script["mood"] = raw.get("mood") if raw.get("mood") in moods else moods[0]
    _report(job_id, stage="polish" if khmer or not (story and own_voice(idea)) else "pictures", scenes=_board(script), look=script.get("look"))

    if khmer:
        # Every line — on screen and spoken — through the native editor
        # (correct words, natural phrasing, names untouched), put back in place.
        slots: list[tuple[dict, str, int]] = []
        for s in script["scenes"]:
            slots += [(s, key, n) for key, n in _TEXT_FIELDS[s["type"]] if key in s]  # optional ones (a meme's bubble) may be missing
            slots += [(m, "text", 140) for m in s.get("messages", [])]
            slots += [(i, "text", 80) for i in s.get("items", [])]
            slots += [(x, "label", 30) for x in s.get("tiles", [])]  # Collage · Studio's cards
            slots += [(p, "name", 40) for p in (s.get("left"), s.get("right")) if isinstance(p, dict) and "name" in p]
            if s["type"] == "split":
                for p in (s["left"], s["right"]):
                    slots += [(p, "label", 40)] + [(p["points"], k, 60) for k in range(len(p["points"]))]
            if s["type"] == "options":
                slots += [(s["options"], k, 50) for k in range(len(s["options"]))]
            slots += [(ser, "name", 40) for ser in s.get("series", [])]
            if s["type"] == "product":
                slots += [(s["chips"], k, 30) for k in range(len(s["chips"]))]
            if s["type"] == "offer":
                slots += [(s["features"], k, 50) for k in range(len(s["features"]))]
            slots += [(n, "text", 90) for n in s.get("notes", [])]
            slots += [(m, "label", 30) for m in s.get("metrics", [])]
            if s["type"] == "checklist":
                slots += [(s["checks"], k, 90) for k in range(len(s["checks"]))]
            slots += [(x, key, n) for x in s.get("points", []) for key, n in (("title", 40), ("text", 100)) if x.get(key)]
            if s.get("sub"):
                slots += [(s, "sub", 100)]
            slots += [(n, "label", 40) for n in s.get("nodes", [])]
            slots += [(x, "label", 24) for x in s.get("tags", [])]
            if isinstance(s.get("center"), dict) and s["center"].get("title"):
                slots += [(s["center"], "title", 40)]
            slots += [(x, key, 40) for x in s.get("cards", []) if isinstance(x, dict) for key in ("title", "sub") if x.get(key)]
            if s["type"] == "phones":
                slots += [(s["words"], k, 20) for k in range(len(s["words"]))]
        # Story mode: the voice lines are the person's own sentences — kept.
        slots = [x for x in slots if x[0][x[1]] and x[1] != "say"]  # the voice lines: voice_script_khmer
        fixed = _polish_khmer(
            [obj[key] for obj, key, _ in slots],
            model,
            voice_examples=brand.voice_examples or "",
            khmer_only="english" not in (brand.lang or "").lower(),
            keep=[brand.name, *(p.name for p in products), *([script["host"]["name"]] if script.get("host") else [])],
            # Story mode: only the short on-screen words are left to edit (the
            # voice lines are the person's own) — the quick pass; at high effort
            # it took a minute and more, while the person waited on the plan.
            effort="low" if story else "high",
        )
        for (obj, key, n), value in zip(slots, fixed):
            obj[key] = _line(_fix_khmer_punctuation(value), n)
        # every spoken line rewritten to be heard, not read (story mode: a light touch)
        spoken = [s for s in script["scenes"] if s.get("say")]
        shows = [screen for screen, _ in script_lines({"scenes": spoken})]
        for s, line in zip(
            spoken,
            voice_script_khmer(
                [s["say"] for s in spoken], model, [brand.name, *(p.name for p in products), *([script["host"]["name"]] if script.get("host") else [])], brand.voice_examples or "",
                own=story, shows=shows, narrator=story or style in NARRATOR_STYLES,
            ),
        ):
            s["say"] = line
        _report(job_id, stage="pictures", scenes=_board(script))
    elif not (story and own_voice(idea)):
        # English: the same storyteller pass — the lines linked into one spoken story
        _narrate(script, brand, products, model, False, own=story, narrator=story)
        _report(job_id, stage="pictures", scenes=_board(script))
    if style == "presenter" and not (story and own_voice(idea)):
        _host_intro(script, brand.name, khmer)
    return script


def making_of(db: Session, props: dict, script: dict, job_id: int, voice: str, narrator: str | None, language: str) -> dict:
    """A finished video's "How it was made" (GenerationJob.making): the
    template, the voice, and per scene what's on screen, what's said, where it
    starts in the video and its narration clip (stored, so it can be played on
    its own). Scenes overlap by one transition, like length_of counts them."""
    lines = script_lines(script)
    scenes, start = [], 0.0
    for n, scene in enumerate(props["scenes"]):
        seconds = scene.get("seconds") or default_seconds(scene)
        audio = scene.get("audio") or ""
        clip = ""
        if audio.startswith("data:audio/mpeg;base64,"):
            try:
                clip = store_blob(db, base64.b64decode(audio.split(",", 1)[1]), ".mp3", "audio/mpeg")
            except Exception as exc:  # noqa: BLE001 — the scene list is worth more than one clip
                log.warning("motion %s: couldn't keep scene %s's voice: %s", job_id, n + 1, exc)
        screen, say = lines[n] if n < len(lines) else ("", "")
        src = script["scenes"][n] if n < len(script["scenes"]) else {}
        scenes.append(
            {
                "type": src.get("type") or scene.get("type") or "",
                "screen": screen,
                "say": (say or "") if narrator else "",
                "start": round(start, 2),
                "seconds": round(seconds, 2),
                "audio": clip,
            }
        )
        start += seconds - TRANSITION_S
    music = props.get("music") or ""
    return {
        "style": script.get("style") or "",
        "why": (_progress.get(job_id) or {}).get("why") or "",
        "voice": voice if narrator else "none",
        "narrator": narrator or "",
        "language": language,
        "music": Path(music).stem.replace("-", " ").replace("_", " ") if music else "",
        "ratio": props.get("ratio") or script.get("ratio") or "",
        "scenes": scenes,
    }


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
        elif s["type"] == "split":
            screen = " vs ".join(f"{p['label']} ({', '.join(p['points'])})" for p in (s["left"], s["right"]))
        elif s["type"] == "myth":
            screen = f"Myth: {s['myth']} — Fact: {s['fact']}"
        elif s["type"] == "options":
            screen = " / ".join(f"{'ABCD'[k]}. {o}" for k, o in enumerate(s["options"])) + (
                f" — answer {'ABCD'[s['answer']]}" if s["answer"] >= 0 else ""
            )
        elif s["type"] == "quote":
            screen = f"“{s['text']}”" + (f" — {s['author']}" if s.get("author") else "")
        elif s["type"] == "customer":
            screen = s["name"] + (f" ({s['business']})" if s.get("business") else "") + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "beforeafter":
            screen = f"Before: {s['before']} → After: {s['after']}"
        elif s["type"] == "result":
            screen = f"{s.get('prefix', '')}{s['value']}{s.get('suffix', '')} {s['label']}"
        elif s["type"] == "review":
            screen = f"{'★' * s.get('stars', 5)} “{s['text']}”" + (f" — {s['name']}" if s.get("name") else "")
        elif s["type"] == "screen":
            screen = f"Screenshot {s['shot']}: {s.get('title', '')}" + (f" → {s['target']}" if s.get("target") else "") + (f" ✓ {s['result']}" if s.get("result") else "")
        elif s["type"] == "chapter":
            screen = f"Chapter: {s['title']}" + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "checklist":
            screen = (s.get("title") or "Checklist") + " — " + " / ".join(s["checks"])
        elif s["type"] == "recap":
            screen = (s.get("title") or "Recap") + " — " + " / ".join(x["title"] + (f": {x['text']}" if x.get("text") else "") for x in s["points"])
        elif s["type"] == "dashboard":
            screen = (s.get("title") or "Dashboard") + " — " + ", ".join(f"{m['label']} {m.get('prefix', '')}{m['value']}{m.get('suffix', '')}" + (f" ({m['delta']})" if m.get("delta") else "") for m in s["metrics"])
        elif s["type"] == "flow":
            screen = (s.get("title") or "Flow") + " — " + " → ".join(n["label"] + (f" ({n['sub']})" if n.get("sub") else "") for n in s["nodes"])
        elif s["type"] == "news":
            screen = (f"{s['tag']}: " if s.get("tag") else "") + s["headline"] + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "notify":
            screen = (s.get("title") or "Notifications") + " — " + " / ".join(f"{n['app']}: {n['text']}" for n in s["notes"])
        elif s["type"] == "step":
            screen = s["title"] + (f" — {s['text']}" if s.get("text") else "") + (f" ✓ {s['result']}" if s.get("result") else "")
        elif s["type"] == "take":
            screen = (f"Not: {s['before']} → " if s.get("before") else "") + s["text"]
        elif s["type"] == "meme":
            screen = f"{s['top']} / {s['bottom']}"
        elif s["type"] == "client":
            screen = f"{s['name']}" + (f" ({s['field']})" if s.get("field") else "") + f" — {s['text']}" + (" [example]" if s.get("example") else "")
        elif s["type"] == "metrics":
            screen = (s.get("title") or "Results") + " — " + ", ".join(f"{m['label']}: {m.get('prefix', '')}{m['before']}{m.get('suffix', '')} → {m.get('prefix', '')}{m['after']}{m.get('suffix', '')}" for m in s["rows"])
        elif s["type"] == "timeline":
            screen = (s.get("title") or "Timeline") + " — " + " → ".join(f"{x['when']}: {x['text']}" for x in s["steps"])
        elif s["type"] == "qa":
            screen = f"Q: {s['q']} — A: {s['a']}"
        elif s["type"] == "bars":
            screen = (s.get("title") or "Data") + " — " + ", ".join(f"{x['label']} {s.get('prefix', '')}{x['value']}{s.get('suffix', '')}" for x in s["data"]) + (f" (source: {s['source']})" if s.get("source") else "")
        elif s["type"] == "donut":
            screen = f"{s['value']}% {s['label']}" + (f" (source: {s['source']})" if s.get("source") else "")
        elif s["type"] in ("rank", "tip"):
            screen = s["title"] + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "choice":
            screen = f"{s['question']} — A: {s['left']['name']} vs B: {s['right']['name']}" + (f" ({s['percent']}% A)" if s.get("percent") else "")
        elif s["type"] == "reviews":
            screen = (f"★ {s['rating']} " if s.get("rating") else "") + " / ".join(f"“{c['text']}” — {c['name']}" for c in s["cards"])
        elif s["type"] == "logos":
            screen = (s.get("title") or "Trusted by") + " — " + ", ".join(s["names"])
        elif s["type"] == "save":
            screen = s["text"] + (f" [{s['button']}]" if s.get("button") else "")
        elif s["type"] == "platform":
            screen = s["text"] + (f" — screenshot {s['shot']}" if s.get("shot") else "")
        elif s["type"] == "orbit":
            screen = f"{s['center']['title']} — " + ", ".join(x["label"] for x in s["tags"]) + (f" · {s['text']}" if s.get("text") else "")
        elif s["type"] == "chaos":
            screen = s["text"] + " — " + " / ".join(f"{x['app']}: {x['title']}" for x in s["cards"])
        elif s["type"] == "phones":
            screen = " ".join(s["words"]) + (f" — screenshots {', '.join(str(x) for x in s['shots'])}" if s.get("shots") else "")
        elif s["type"] == "pair":
            screen = f"{s['left']} [{s.get('label') or 'card'}] {s['right']}"
        elif s["type"] == "launch":
            screen = f"Introducing {s['name']}" + (f" — {s['text']}" if s.get("text") else "") + (f" [{s['badge']}]" if s.get("badge") else "")
        elif s["type"] == "canvas":
            screen = " / ".join(str(L.get("text") or L.get("title") or "") for L in s["layers"] if L.get("text") or L.get("title")) or "Designed scene"
        elif s["type"] == "send":
            screen = f"{s['from']['label'] or s['from']['device']} → {s['to']['label'] or s['to']['device']}" + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "address":
            screen = f"{s['from']} → {s['to']}" + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "lookup":
            screen = f"{s['server']}: “{s['question']}” → {s['answer']}"
        elif s["type"] == "hops":
            screen = " → ".join(n["label"] or n["device"] for n in s["nodes"]) + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "assemble":
            screen = (s.get("label") or s["device"]) + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "tasks":
            screen = (f"{s['title']} — " if s.get("title") else "") + ", ".join(x["text"] for x in s["items"]) + (f" [{s['sticker']}]" if s.get("sticker") else "")
        elif s["type"] == "fanout":
            screen = (s.get("title") or "One → many") + " — " + " / ".join(o["kind"] + (f" {o['value']}" if o.get("value") else "") for o in s["outputs"]) + ("".join(f" ✓ {c}" for c in s.get("checks") or []))
        elif s["type"] == "word":
            screen = f"“{s['word']}” — " + (s.get("title") or "card") + (": " + ", ".join(x["name"] for x in s["rows"]) if s.get("rows") else "")
        elif s["type"] == "field":
            screen = (s.get("label") or "Field") + f": {s['value']}" + (f" → [{s['button']}]" if s.get("button") else "")
        elif s["type"] == "done":
            screen = f"✓ {s['text']}"
        elif s["type"] == "button":
            screen = (s.get("title") or "Card") + f" → click “{s['button']}”" + (f" ✓ {s['result']}" if s.get("result") else "")
        elif s["type"] == "form":
            screen = (s.get("title") or "Form") + " — " + ", ".join(f"{f['label']}: {f['value']}" for f in s["fields"]) + (f" · toggle {s['toggle']}" if s.get("toggle") else "")
        elif s["type"] == "stack":
            screen = "Screens " + ", ".join(str(x) for x in s["shots"]) + (" — " + " / ".join(s["words"]) if s.get("words") else "")
        elif s["type"] == "apps":
            screen = (s.get("title") or "Apps") + " — " + ", ".join(a["name"] for a in s["apps"])
        elif s["type"] == "roll":
            screen = f"{s.get('lead', '')} " + " / ".join(s["words"]) + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "table":
            screen = (s.get("title") or "Table") + " — " + " | ".join(s["columns"]) + f" ({len(s['rows'])} rows)"
        elif s["type"] == "board":
            screen = (s.get("title") or "Board") + " — " + " → ".join(c["name"] for c in s["columns"])
        elif s["type"] == "climb":
            screen = s["title"] + (f" — {s['text']}" if s.get("text") else "") + (f" [step: {s['word']}]" if s.get("word") else "")
        elif s["type"] == "grow":
            screen = s["title"] + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "mirror":
            screen = (f"{s['title']} — " if s.get("title") else "") + f"Old me: {s['before']} → New me: {s['after']}"
        elif s["type"] == "summit":
            screen = f"⛰ {s['text']}" + (f" — {s['author']}" if s.get("author") else "")
        elif s["type"] == "whiteboard":
            last = len(s["parts"]) - 1
            sign = lambda i, x: (" = " if i == last else f" {x.get('op', '+')} ") if s["kind"] == "sum" else " / "  # noqa: E731
            body = "".join((sign(i, x) if i else "") + x["label"] + (f" {x['value']}" if x.get("value") else "") for i, x in enumerate(s["parts"]))
            screen = f"{s.get('title', '')} — {s['kind']}: {body}"
        elif s["type"] == "example":
            screen = (s.get("title") or "Example") + " — " + " | ".join(f"{x['name']}: {x['text']}" + (f" ({x['value']})" if x.get("value") else "") for x in s["people"])
        elif s["type"] in ("talk", "note"):
            who = f"#{s.get('who', 1)} ({s.get('mood', '')})"
            body = (f"{s.get('title', '')}: " + " / ".join(s["checks"])) if s["type"] == "note" else ("💭 " if s.get("think") else "") + s.get("text", "")
            item = f" [{s['item'].get('label') or s['item'].get('icon')}]" if s.get("item") else ""
            screen = f"{who} {body}{item}"
        elif s["type"] == "collage":
            screen = (s.get("word") or "Collage") + " — " + " / ".join(x["label"] for x in s.get("tiles") or []) + (f" [{len(s['images'])} photos]" if s.get("images") else "")
        elif s["type"] == "visit":
            screen = f"(in place {s.get('place', 1)}, {s.get('pose', 'stand')}, {s.get('mood', 'happy')}) " + (s.get("text") or "") + (f" 💭 {s['icon']}" if s.get("icon") else "")
        elif s["type"] == "pedestal":
            screen = s["title"] + " — " + " | ".join(x for x in (s.get("left"), s.get("right")) if x)
        elif s["type"] in ("react", "punch") or (s["type"] == "hook" and "moods" in s):
            pic = f" ✎ {s['draw']}" if s.get("draw") else f" [screenshot {s['shot']}]" if s.get("shot") else f" [{s['product']}]" if s.get("product") else ""
            screen = s["text"] + f" — {', '.join(s.get('moods') or [])}" + (f" 💬 {s['bubble']}" if s.get("bubble") else "") + pic
        elif s["type"] == "doodle":
            screen = s["title"] + (f" — {s['text']}" if s.get("text") else "") + (f" ✎ {s['draw']}" if s.get("draw") else "")
        elif s["type"] == "offer":
            price = f" {s['price']}{s.get('period', '')}" if s.get("price") else ""
            screen = f"{s.get('plan', '')}{price} — " + ", ".join(s["features"])
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


# ── The voice script: every Khmer voice line rewritten to be SPOKEN ────────
# How a professional scriptwriter writes the video — every template's first
# draft follows it (write_script), on top of the template's own scene recipe.
SCRIPT_CRAFT = (
    "\n\nWRITE IT LIKE A PROFESSIONAL SCRIPTWRITER — a story the viewer follows, never a list of "
    "features read out:\n"
    "- ONE PERSON, ONE MOMENT: open on someone the viewer recognises in a real moment (the shop "
    "owner answering messages at 11 pm, a mum choosing between two prices) and follow them to the "
    "end. Concrete details — a time, a place, a thing in their hand — never \"businesses today\".\n"
    "- AN ARC: the hook (a tension felt in 3 seconds) → the struggle (concrete, felt) → the turn "
    "(the moment it changes — the product) → how it works, shown through what it does FOR that "
    "person → the payoff (their day now) → the close, which calls back to the opening image or "
    "line, plus one clear action.\n"
    "- LINKED SCENES: each line hands off to the next, so the viewer never feels a reset. Use the "
    "real bridges of speech: a question the next scene answers, a turn (\"But…\", \"That's "
    "when…\", \"So…\"), time moving on (\"By Friday…\"), a word picked up from the line before. "
    "Read all the `say` lines in a row before answering: they must sound like ONE voice telling ONE "
    "story; rewrite any line that starts from zero or could be cut without losing anything.\n"
    "- SHOW, DON'T LIST: one idea a scene; a feature appears only as what it does for the person "
    "(\"Her phone stays quiet at midnight — the replies are already sent\"), never \"Feature: …\".\n"
    "- SCREEN AND VOICE WORK TOGETHER: the screen carries the headline or the keyword; the voice "
    "says what it MEANS — never read the screen out loud.\n"
    "- RHYTHM: vary the length — a short punchy line (3-6 words) at the turn, after a longer one; "
    "the rule of three once at most; one real question to the viewer.\n"
    "- NO ADVERTISING CLICHÉS: never \"in today's fast-paced world\", \"Are you tired of…\", "
    "\"look no further\", \"say goodbye to\", \"game-changer\", \"revolutionize\", \"take it "
    "to the next level\", \"unlock\", \"seamless\".\n"
)
SCRIPT_CRAFT_STORY = (
    "\nTHE PERSON'S OWN WORDS WIN: use the craft above only to shape and link what they wrote — "
    "never to add a person, a moment or a claim their script doesn't have.\n"
)

VOICE_SCRIPT_EN_PROMPT = (
    "You are a senior scriptwriter for short brand films. Below is a short video: for each scene, "
    "what the viewer SEES on screen and a DRAFT of what the narrator says. Rewrite the narration "
    "into ONE spoken story told by one warm, confident voice — the lines must flow into each "
    "other, never sound like separate captions. Viewers HEAR it; they don't read it.\n"
    "\n"
    "RULES:\n"
    "1. ONE STORY: the opening moment → the problem → the turn (the product) → what it does for "
    "the person → how life feels now → the close that echoes the opening, then the action. Each "
    "line carries on from the one before; a bridge (\"But…\", \"So…\", \"That's when…\", a "
    "question answered next) starts at most a third of the lines.\n"
    "2. TALK ABOUT THEIR LIFE, NOT THE SCREEN: the picture already shows the words, the lists and "
    "the numbers — never read them out; say what they MEAN. At most one feature a line.\n"
    "3. PLAIN ENGLISH (CEFR A2-B1): common words, sentences of max 14 words, 1-2 a line; one short "
    "punchy line (3-6 words) at the turn; one real question somewhere. No idioms, slang or "
    "buzzwords (leverage, seamless, unlock, elevate, game-changer, next level, revolutionize).\n"
    "4. Keep every fact, number, price, brand and product name EXACTLY. Never add a claim, a "
    "number or a feature the drafts don't have.\n"
    "5. Each line still belongs to its scene (it plays while that scene is shown) and is about the "
    "same length as its draft (±30%). No brackets, emoji, lists or abbreviations.\n"
    'Return JSON {"lines": [...]} — one line per scene, the same number, in the same order.'
)

VOICE_SCRIPT_PROMPT = (
    "You are a Cambodian storyteller and voice-over writer. Below is a short video: for each scene, "
    "what the viewer SEES on screen and a DRAFT of what the narrator says. The drafts sound robotic — "
    "a feature list read out, each line on its own. Rewrite the narration as ONE story told by one "
    "real person talking to a friend — natural, warm, alive. Viewers HEAR it; they don't read it.\n"
    "\n"
    "RULES:\n"
    "1. ONE STORY, start to end: a moment the viewer knows (a person, a time of day, a feeling) → "
    "what goes wrong → the turn (the product) → how it feels after → what to do now. Each line "
    "follows from the one before it — read in order, it must sound like one person talking, never "
    "separate captions. A connector (ហើយ, ប៉ុន្តែ, អ៊ីចឹង, ពេលនោះ, ចុះបើ…) starts AT MOST a third of "
    "the lines; most lines simply carry on from the last thought, the way people really talk.\n"
    "2. TALK ABOUT THEIR LIFE, NOT THE SCREEN: the picture already shows the table, the board, the "
    "apps, the numbers — never describe or list them (\"this table has name, product, status…\"). "
    "Say what it MEANS for the viewer (\"no more scrolling through chats to find who paid\"). At "
    "most one feature named per line.\n"
    "3. Spoken Khmer, not written Khmer: the words a Phnom Penh presenter actually says. Drop "
    "formal, bookish constructions (stacked ការ… nouns, នៃ, ដែលជា, ក្នុងការ…, long noun chains). "
    "Particles where they fit (ណា, ហ្នឹង, ទេ, មែនទេ) — never forced.\n"
    "4. Sentences that flow: mostly 8-18 words, 1-3 per line; somewhere one short punchy line (3-6 "
    "words) and one real question to the viewer. Never a run of tiny fragments.\n"
    "5. Written the way good Khmer is written: words joined, a SPACE only where a sentence "
    "naturally pauses — between clauses, about every 6-12 words. End every sentence with ។, ! only "
    "where the voice lifts, ? only for a real question.\n"
    "6. Keep every fact, number, price, brand and product name EXACTLY (numbers may stay as "
    "digits). Never add a claim, a number or a feature the drafts don't have. No brackets, "
    "slashes, emoji, lists or abbreviations.\n"
    "7. Correct Khmer — real, common words only, each one MEANING what you intend (\"important\" "
    "is សំខាន់, never ចាំ). Before answering, re-read every line: any word that is rare, misspelt, "
    "made up or that a market seller wouldn't say — replace it with a plain common word.\n"
    "8. The viewer is បង — NEVER អ្នក (\"you\") anywhere. Khmer usually needs no \"you\" at all: "
    "leave it out (\"សន្សំម៉ោងបានច្រើន\", not \"អ្នកសន្សំម៉ោង\"); say បង only 2-3 times in the whole "
    "narration, never at the start of every line, never \"បង,\" with a comma. អ្នក inside a word "
    "(អ្នកលក់, អ្នកទិញ) is fine.\n"
    "9. Each line still belongs to its scene (it plays while that scene is shown) and is about "
    "the same length as its draft (±30%).\n"
    'Return JSON {"lines": [...]} — one line per scene, the same number, in the same order.'
)
VOICE_SCRIPT_NARRATOR = (
    "\n\nA STORYTELLER NARRATES THIS (a lesson or the person's own story): rule 8 changes — "
    "speak to the audience the way the material does; អ្នក for everyone is fine here, as long as "
    "it stays the same through the whole narration. Keep the people's names exactly as written."
)
VOICE_SCRIPT_LIGHT = (
    "\n\nTHESE ARE THE PERSON'S OWN SCRIPT LINES: keep their meaning, their order and as much of "
    "their wording as you can — only make them speakable (shorter sentences, marked breaths, a "
    "formal word swapped for the spoken one where it reads stiffly)."
)


def voice_script_khmer(
    lines: list[str],
    model: str,
    keep: list[str],
    voice_examples: str = "",
    own: bool = False,
    shows: list[str] | None = None,
    narrator: bool = False,
) -> list[str]:
    """The Khmer voice lines rewritten as one spoken story (VOICE_SCRIPT_PROMPT)
    — ``shows`` is what each line's scene puts on screen, so the narration
    stops describing it. Best effort: on any failure the lines are kept."""
    from app.content_ai import ContentAIError, _chat, _fix_khmer_punctuation

    if not lines:
        return lines
    system = VOICE_SCRIPT_PROMPT + (VOICE_SCRIPT_LIGHT if own else "") + (VOICE_SCRIPT_NARRATOR if narrator else "")
    if keep:
        system += "\n\nNames to copy EXACTLY as written: " + ", ".join(k for k in keep if k)
    if voice_examples.strip():
        system += "\n\nHow this brand talks (its real posts — tone only):\n---\n" + voice_examples.strip()[:2000] + "\n---"
    try:
        out = _chat(
            [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"scenes": [{"shows": sh, "draft": line} for sh, line in zip(shows, lines)]} if shows and len(shows) == len(lines) else {"lines": lines},
                        ensure_ascii=False,
                    ),
                },
            ],
            model,
            max_tokens=24000,
            # meaning and spelling matter more than speed — but their own story only
            # needs a light touch, and at high effort it kept them waiting minutes
            effort="medium" if own else "high",
        )
    except ContentAIError:
        return lines
    new = out.get("lines") if isinstance(out, dict) else None
    if not (isinstance(new, list) and len(new) == len(lines) and all(isinstance(x, str) and x.strip() for x in new)):
        return lines
    fix = (lambda x: x) if narrator else _bong  # a storyteller may say អ្នក to everyone
    return [_line(fix(_fix_khmer_punctuation(x.strip())), 300) for x in new]


def voice_script_english(lines: list[str], model: str, keep: list[str], own: bool = False, shows: list[str] | None = None) -> list[str]:
    """The English voice lines rewritten as one linked spoken story
    (VOICE_SCRIPT_EN_PROMPT) — the pass Khmer has always had. Best effort:
    on any failure the lines are kept."""
    from app.content_ai import ContentAIError, _chat

    if not lines:
        return lines
    system = VOICE_SCRIPT_EN_PROMPT + (VOICE_SCRIPT_LIGHT if own else "")
    if keep:
        system += "\n\nNames to copy EXACTLY as written: " + ", ".join(k for k in keep if k)
    try:
        out = _chat(
            [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"scenes": [{"shows": sh, "draft": line} for sh, line in zip(shows, lines)]} if shows and len(shows) == len(lines) else {"lines": lines},
                        ensure_ascii=False,
                    ),
                },
            ],
            model,
            max_tokens=12000,
            effort="low",
        )
    except ContentAIError:
        return lines
    new = out.get("lines") if isinstance(out, dict) else None
    if not (isinstance(new, list) and len(new) == len(lines) and all(isinstance(x, str) and x.strip() for x in new)):
        return lines
    return [_line(x.strip(), 300) for x in new]


def _narrate(script: dict, brand: Brand, products: list, model: str, khmer: bool, own: bool, narrator: bool) -> None:
    """Every voice line rewritten as one linked spoken story, in place —
    Khmer (voice_script_khmer) or English (voice_script_english)."""
    spoken = [s for s in script["scenes"] if s.get("say")]
    if not spoken:
        return
    shows = [screen for screen, _ in script_lines({"scenes": spoken})]
    keep = [brand.name, *(p.name for p in products)]
    if khmer:
        new = voice_script_khmer([s["say"] for s in spoken], model, keep, brand.voice_examples or "", own=own, shows=shows, narrator=narrator)
    else:
        new = voice_script_english([s["say"] for s in spoken], model, keep, own=own, shows=shows)
    for s, line in zip(spoken, new):
        s["say"] = line


# អ្នក as part of a noun (seller, buyer, who, user, …) — never "you"; the rest of
# the time a voice line's អ្នក is "you", and our viewer is បង (VOICE_SCRIPT_PROMPT rule 8).
_ANAK_WORDS = (
    "ទាំង", "រាល់គ្នា", "លក់", "ទិញ", "ប្រើ", "គ្រប់គ្រង", "ជំនាញ", "ណា", "ផ្សេង", "ដទៃ", "ផលិត", "ធ្វើការ", "ស្រុក", "នាំ",
    "បើកបរ", "ដឹក", "ជិតខាង", "មាន", "ក្រ", "រៀន", "សិក្សា", "និពន្ធ", "បង្កើត", "គាំទ្រ", "ចូលរួម",
    "មើល", "តាមដាន", "ទទួល", "ផ្គត់ផ្គង់", "វិនិយោគ", "បម្រើ", "ជំនួញ", "អាជីវកម្ម", "ថែទាំ", "ច្នៃ",
    "រចនា", "ប្រកួត", "ដំណើរ", "ធានា", "កាសែត", "ឧបត្ថម្ភ", "ចាប់ផ្ដើម", "ចាប់ផ្តើម", "នយោបាយ", "ស្ម័គ្រចិត្ត",
)


def _bong(line: str) -> str:
    """អ្នក meaning "you" → បង; អ្នក in a noun (អ្នកលក់, អ្នកទិញ…) stays."""
    out, i = [], 0
    while (j := line.find("អ្នក", i)) >= 0:
        rest = line[j + 4 :]
        out.append(line[i:j] + ("អ្នក" if rest.startswith(_ANAK_WORDS) else "បង"))
        i = j + 4
    return "".join(out) + line[i:]


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
    script: dict,
    products: list[Product],
    by_product: dict[int, str],
    order: list[str],
    product_id: int | None,
    shots: list[dict] | None = None,
) -> None:
    """Put the brand kit's photos into the scenes that show one: the product
    scene shows the product it names (else the chosen / newest photo); the
    hook and the close show the chosen product (else the newest photo)."""
    ids = {p.name: p.id for p in products}
    main = (by_product.get(product_id) if product_id is not None else None) or (order[0] if order else None)
    shots = shots or []
    # a screenshot scene whose screenshot is gone (removed from the Brand kit) is left out
    script["scenes"] = [s for s in script["scenes"] if s["type"] != "screen" or 1 <= s.get("shot", 0) <= len(shots)]
    for s in script["scenes"]:
        if s["type"] == "stack":  # the deck: its screenshots that still exist
            s["images"] = [{"src": shots[n - 1]["uri"], "w": shots[n - 1]["w"], "h": shots[n - 1]["h"]} for n in s.get("shots", []) if 1 <= n <= len(shots)]
    script["scenes"] = [s for s in script["scenes"] if s["type"] != "stack" or len(s["images"]) >= 2]
    for s in script["scenes"]:
        if s["type"] == "platform" and 1 <= s.get("shot", 0) <= len(shots):  # the app in its frame (else drawn)
            shot = shots[s["shot"] - 1]
            s["image"], s["imgW"], s["imgH"] = shot["uri"], shot["w"], shot["h"]
        if s["type"] == "phones":  # the phones' screens (else drawn)
            s["images"] = [{"src": shots[n - 1]["uri"]} for n in s.get("shots", []) if 1 <= n <= len(shots)]
    for s in script["scenes"]:
        if s["type"] == "screen":
            shot = shots[s["shot"] - 1]
            s["image"], s["imgW"], s["imgH"] = shot["uri"], shot["w"], shot["h"]
        elif s["type"] in ("product", "fanout"):
            s["image"] = by_product.get(ids.get(s.get("product") or "")) or main
        elif s["type"] == "canvas":  # "shot:N" / "product:<name>" → the brand kit's own picture
            for L in s["layers"]:
                src = str(L.get("src") or "")
                if src.startswith("shot:") and 1 <= int(src[5:]) <= len(shots):
                    L["src"] = shots[int(src[5:]) - 1]["uri"]
                elif src.startswith("product:"):
                    L["src"] = by_product.get(ids.get(src[8:].strip())) or main or ""
                elif src:
                    L.pop("src", None)
        elif script.get("style") == "studio":  # Collage · Studio: the brand kit's photos on its cards
            if s["type"] == "hook":
                s["image"] = main
            elif s["type"] == "collage":
                rest = [u for u in order if u != main] or order
                s["images"] = rest[:5]
            elif s["type"] == "pedestal" and product_id is not None:
                s["image"] = main
        elif script.get("style") == "presenter":  # Presenter · Brand host: a product's photo on the panel
            if s["type"] == "speak" and s.get("product"):
                s["image"] = by_product.get(ids.get(s["product"])) or main
        elif script.get("style") == "reaction":  # the picture behind a meme moment (else drawn, app/doodle.py)
            if 1 <= s.get("shot", 0) <= len(shots):
                shot = shots[s["shot"] - 1]
                s["image"], s["imgW"], s["imgH"] = shot["uri"], shot["w"], shot["h"]
            elif s.get("product"):
                s["image"] = by_product.get(ids.get(s["product"])) or main
        elif script.get("style") in ("doodle", "cartoon", "lesson", "rise", "podcast"):
            continue  # drawn templates: no product photos (doodle / cartoon draw their own, app/doodle.py)
        elif script.get("style") == "spotlight":  # 3D · Spotlight: the product's photo on the 3D box
            if s["type"] in ("hook", "list", "offer", "cta"):
                s["image"] = by_product.get(ids.get(s.get("product") or "")) or main
        elif s["type"] in ("hook", "cta", "offer") or script.get("style") == "quote":
            s["image"] = main


def _brackets(text: str) -> str:
    """[highlight] → ⟦highlight⟧, the template's marker (square brackets may
    be real text elsewhere)."""
    return re.sub(r"\[([^\[\]]{1,60})\]", "⟦\\1⟧", text or "")


def logo_prints(logo: str | None) -> bool:
    """Presenter: a logo on a transparent ground can be printed on the T-shirt in
    white; a logo on a solid ground (a JPEG, a white box) goes on a white patch."""
    if not logo or not logo.startswith("data:"):
        return False
    try:
        from PIL import Image

        im = Image.open(io.BytesIO(base64.b64decode(logo.split(",", 1)[1])))
        if "A" not in im.getbands():
            return False
        alpha = im.getchannel("A")
        w, h = im.size
        corners = [alpha.getpixel((x, y)) for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
        return sum(1 for a in corners if a < 40) >= 3
    except Exception:  # noqa: BLE001 — a patch always works
        return False


def build_props(brand: Brand, script: dict, logo: str | None, khmer: bool) -> dict:
    """The template's input (motion/sample.json shape)."""

    def t(text: str) -> str:
        text = _brackets(text)
        return _km_words(text) if khmer else text

    r, g, b = brand_rgb(brand)
    scenes = []
    for s in script["scenes"]:
        scene = {k: v for k, v in s.items() if k not in ("say", "product", "target", "shot", "draw")}
        for key in ("text", "title", "label", "button", "myth", "fact", "question", "author", "name", "business", "before", "after", "headline", "tag", "result", "badge", "plan", "period", "sub", "word", "action", "sticker", "top", "bottom", "bubble"):
            if scene.get(key):
                scene[key] = t(scene[key])
        if s.get("say"):
            scene["caption"] = t(s["say"]).replace("⟦", "").replace("⟧", "")  # the subtitles
        for side in ("left", "right"):
            if scene.get(side):
                if isinstance(scene[side], str):  # pair: a plain word either side of the card
                    scene[side] = t(scene[side])
                elif "points" in scene[side]:  # split: a way and its points
                    scene[side] = {**scene[side], "label": t(scene[side]["label"]), "points": [t(x) for x in scene[side]["points"]]}
                else:
                    scene[side] = {**scene[side], "name": t(scene[side]["name"])}
        if "series" in scene:
            scene["series"] = [{**ser, "name": t(ser["name"])} for ser in scene["series"]]
        if "messages" in scene:
            scene["messages"] = [{**m, "text": t(m["text"])} for m in scene["messages"]]
        if "items" in scene:
            scene["items"] = [{**i, "text": t(i["text"])} for i in scene["items"]]
        if "tiles" in scene:
            scene["tiles"] = [{**x, "label": t(x["label"])} for x in scene["tiles"]]
        if "options" in scene:
            scene["options"] = [t(o) for o in scene["options"]]
        if "chips" in scene:
            scene["chips"] = [t(c) for c in scene["chips"]]
        if "features" in scene:
            scene["features"] = [t(f) for f in scene["features"]]
        if "checks" in scene:
            scene["checks"] = [t(c) for c in scene["checks"]]
        if "points" in scene:
            scene["points"] = [{"title": t(x["title"]), "text": t(x["text"]) if x.get("text") else ""} for x in scene["points"]]
        if s["type"] == "chapter":
            scene["n"] = sum(1 for x in scenes if x["type"] == "chapter") + 1  # Part 1, 2, 3 …
            scene["of"] = sum(1 for x in script["scenes"] if x["type"] == "chapter")
        if "metrics" in scene:
            scene["metrics"] = [{**m, "label": t(m["label"])} for m in scene["metrics"]]
        if "nodes" in scene:
            scene["nodes"] = [{**n, "label": t(n["label"]), "sub": t(n["sub"]) if n.get("sub") else ""} for n in scene["nodes"]]
        if "notes" in scene:
            scene["notes"] = [{**n, "text": t(n["text"])} for n in scene["notes"]]
        if s["type"] == "canvas":  # every word the AI put on its canvas
            layers = []
            for L in scene.get("layers") or []:
                L = dict(L)
                for k in ("text", "title", "sub"):
                    if L.get(k):
                        L[k] = t(L[k])
                if L.get("lines"):
                    L["lines"] = [t(x) for x in L["lines"]]
                if L.get("items"):
                    L["items"] = [{**x, "text": t(x["text"])} for x in L["items"]]
                layers.append(L)
            scene["layers"] = layers
        if s["type"] == "send":
            scene["from"] = {**scene["from"], "label": t(scene["from"]["label"])}
            scene["to"] = {**scene["to"], "label": t(scene["to"]["label"])}
        if s["type"] == "hops":
            scene["nodes"] = [{**n, "label": t(n["label"])} for n in scene["nodes"]]
        if s["type"] == "fanout":
            scene["outputs"] = [{**o, "value": t(o["value"]) if o.get("value") else ""} for o in scene.get("outputs") or []]
            scene["checks"] = [t(c) for c in scene.get("checks") or []]
        if s["type"] == "word" and scene.get("rows"):  # Unveil's card: its people / items
            scene["rows"] = [{"name": t(x["name"]), "sub": t(x["sub"]) if x.get("sub") else ""} for x in scene["rows"]]
        if script.get("style") == "rise":  # Rise: the climb and the sky move on scene by scene
            scene["n"], scene["of"] = len(scenes), len(script["scenes"])
        if s["type"] == "whiteboard":
            scene["parts"] = [{**x, "label": t(x["label"]), "value": t(x["value"]) if x.get("value") else ""} for x in scene["parts"]]
        if s["type"] == "example":
            scene["people"] = [{**x, "name": t(x["name"]) if x.get("name") else "", "text": t(x["text"]), "value": t(x["value"]) if x.get("value") else ""} for x in scene["people"]]
        if s["type"] == "talk" and scene.get("item"):
            scene["item"] = {**scene["item"], "label": t(scene["item"]["label"]) if scene["item"].get("label") else ""}
        if s["type"] == "step":
            scene["n"] = sum(1 for x in scenes if x["type"] == "step") + 1  # STEP 1, 2, 3
        if s["type"] in ("rank", "tip", "qa"):  # Top 5 counts down (#5 … #1); tips / questions count up (01 / 05)
            total = sum(1 for x in script["scenes"] if x["type"] == s["type"])
            before = sum(1 for x in scenes if x["type"] == s["type"])
            scene["n"], scene["of"] = (total - before, total) if s["type"] == "rank" else (before + 1, total)
        if not scene.get("image"):
            scene.pop("image", None)
        scenes.append(scene)
    props = {
        "brand": {"name": brand.name, "color": f"#{r:02x}{g:02x}{b:02x}", "logo": logo},
        "scenes": scenes,
        "style": script.get("style") or "tech",
    }
    if script.get("look"):
        props["look"] = script["look"]
    if script.get("style") == "cartoon":  # Story · Characters: the two people and their place
        props["cast"] = [{**c, "name": t(c["name"]) if c.get("name") else ""} for c in script.get("cast") or clean_cast(None)]
        props["place"] = {"image": script["place_image"]} if script.get("place_image") else {}
    if script.get("style") == "podcast":  # the places, painted (app/doodle.py); the host's look
        host = script.get("host") or clean_host(None, khmer)
        props["places"] = list(script.get("place_images") or [])
        props["host"] = {"kicker": t("ផតខាស្ត៍" if khmer else "PODCAST"), "female": host.get("gender") != "male", "print": logo_prints(logo)}
    if script.get("style") == "presenter":  # the host: her name strap, her greeting bubble, the print on her shirt
        host = script.get("host") or clean_host(None, khmer)
        props["host"] = {
            "name": t(host["name"]),
            "role": t(("ជំនួយការផ្ទាល់របស់ " + brand.name if brand.name else "ជំនួយការផ្ទាល់") if khmer else (f"{possessive(brand.name)} personal assistant" if brand.name else "Personal assistant")),
            "hello": "សួស្តី!" if khmer else "Hi!",
            "kicker": t("ប្រធានបទថ្មី" if khmer else "Today's topic"),
            "female": host.get("gender") != "male",
            "print": logo_prints(logo),
        }
    if script.get("style") == "reaction":  # the animals in front, mouth closed / open (app/doodle.py draw_reaction)
        props["cast"] = script.get("cast_images") or []
    if script.get("ratio") == "16:9" and props["style"] in WIDE_STYLES:
        props["ratio"] = "16:9"
    library = music_tracks()
    tracks = library.get(script.get("mood") or "")
    if tracks:
        # a file under public/ — the template mixes it in; the voice adds ~20 % to the length
        props["music"] = track_for(tracks, 1.2 * sum(default_seconds(x) for x in scenes))
        if sum(1 for x in scenes if x["type"] == "chapter") >= 2:
            # a long video with chapters: a new track per chapter — the mood's own
            # tracks first, then the calm / corporate ones that sit under a talk
            playlist = random.sample(tracks, len(tracks))
            for mood in (MUSIC_NEIGHBOURS.get(script.get("mood") or "") or ()):
                playlist += random.sample(library.get(mood, []), len(library.get(mood, [])))
            props["musicList"] = list(dict.fromkeys(playlist))
    return props


def default_seconds(scene: dict) -> float:
    """A scene's length without a voice-over — mirrors MotionPost.jsx defaultSeconds."""
    kind = scene.get("type")
    if kind == "chat":
        return 1.6 + 1.5 * min(4, len(scene.get("messages") or []))
    if kind == "list":
        return 1.8 + 1.0 * min(4, len(scene.get("items") or []))
    if kind == "split":
        return 2.6 + 0.9 * min(6, len((scene.get("left") or {}).get("points") or []) + len((scene.get("right") or {}).get("points") or []))
    if kind == "options":
        return 2.4 + 0.35 * min(4, len(scene.get("options") or [])) + 6.0
    if kind == "notify":
        return 2.2 + 1.2 * min(4, len(scene.get("notes") or []))
    if kind == "flow":
        return 2.4 + 1.0 * min(4, len(scene.get("nodes") or []))
    if kind == "apps":
        return 2.6 + 0.35 * min(8, len(scene.get("apps") or []))
    if kind == "take":
        return 5.2 if scene.get("before") else 4.2
    if kind == "meme":
        return 4.6
    if kind == "collage":  # MotionPost/shared.jsx defaultSeconds says the same
        return 2.8 + 0.4 * min(5, max(len(scene.get("tiles") or []), len(scene.get("images") or [])))
    if kind == "statement":
        return 4.4
    if kind == "pedestal":
        return 4.6
    if kind in ("speak", "onair"):  # MotionPost/shared.jsx defaultSeconds says the same
        return 4.2
    if kind == "visit":
        return 4.4
    if kind == "react":  # MotionPost/shared.jsx defaultSeconds says the same
        return 4.2
    if kind == "punch":
        return 3.2
    if kind == "doodle":  # MotionPost/shared.jsx defaultSeconds says the same
        return 4.8 if scene.get("text") else 4.2
    if kind == "climb":  # MotionPost/shared.jsx defaultSeconds says the same
        return 4.6 if scene.get("text") else 4.0
    if kind in ("mirror", "grow"):
        return 4.8
    if kind == "summit":
        return 5.2
    if kind == "whiteboard":
        return 2.4 + 1.1 * min(4, len(scene.get("parts") or []))
    if kind == "example":
        return 2.6 + 1.3 * min(3, len(scene.get("people") or []))
    if kind == "remember":
        return 4.4
    if kind == "talk":
        return 2.8 + min(2.4, len(scene.get("text") or "") / 30) + (0.6 if scene.get("item") else 0)
    if kind == "note":
        return 2.6 + 0.6 * min(5, len(scene.get("checks") or []))
    if kind == "metrics":
        return 3.6 + 0.8 * min(3, len(scene.get("rows") or []))
    if kind == "timeline":
        return 2.8 + 0.8 * min(4, len(scene.get("steps") or []))
    if kind == "qa":
        return 3.0 + min(5, len(scene.get("a") or "") / 30)
    if kind == "bars":
        return 3.4 + 0.4 * min(6, len(scene.get("data") or []))
    if kind == "reviews":
        return 3.4 + 0.6 * min(4, len(scene.get("cards") or []))
    if kind == "orbit":
        return 2.6 + 0.5 * min(6, len(scene.get("tags") or []))
    if kind == "chaos":
        return 2.6 + 0.4 * min(6, len(scene.get("cards") or []))
    if kind == "phones":
        return 1.4 + 1.2 * min(4, len(scene.get("words") or []))
    if kind == "form":
        return 2.6 + 0.9 * min(3, len(scene.get("fields") or [])) + (1.4 if scene.get("toggle") else 0)
    if kind == "word":
        return 3.0 + 0.6 * min(3, len(scene.get("rows") or []))
    if kind == "canvas":  # + the breath before a reveal (canvas.jsx scene.pause)
        return max(2.5, min(9.0, float(scene.get("seconds") or 5))) + min(1.5, max(0.0, float(scene.get("pause") or 0)))
    if kind == "hops":
        return 3.0 + 0.8 * min(5, len(scene.get("nodes") or []))
    if kind in ("send", "address", "lookup", "assemble"):
        return {"send": 4.2, "address": 4.4, "lookup": 5.2, "assemble": 4.6}[kind]
    if kind == "tasks":
        return 2.2 + 0.7 * min(4, len(scene.get("items") or [])) + (1.0 if scene.get("sticker") else 0)
    if kind == "fanout":
        return 3.0 + 0.8 * min(3, len(scene.get("outputs") or [])) + 0.5 * min(2, len(scene.get("checks") or []))
    if kind == "field":
        return 3.6 + 0.07 * len(scene.get("value") or "")
    if kind == "done":
        return 3.4
    if kind == "stack":
        return 1.6 + 1.1 * min(4, len(scene.get("images") or scene.get("shots") or []))
    if kind == "table":
        return 3.6 + 0.3 * min(6, len(scene.get("rows") or []))
    if kind == "roll":
        return 2.4 + 0.6 * min(5, len(scene.get("words") or []))
    if kind == "checklist":
        return 1.8 + 1.0 * min(6, len(scene.get("checks") or []))
    if kind == "recap":
        return 2.0 + 1.0 * min(5, len(scene.get("points") or []))
    return {"cta": 3.8, "product": 3.6, "chart": 5.2, "compare": 4.2, "character": 3.8, "myth": 5.0, "quote": 5.6, "beforeafter": 5.4, "result": 4.2, "review": 6.0, "customer": 4.4, "news": 5.0, "step": 4.8, "offer": 5.6, "screen": 5.0, "dashboard": 5.2, "chapter": 3.2, "board": 4.6, "launch": 4.2, "button": 4.6, "platform": 4.4, "pair": 3.8, "rank": 4.2, "choice": 5.0, "logos": 4.0, "tip": 4.6, "save": 3.4, "client": 5.0, "donut": 4.6}.get(kind, 3.4)


def length_of(props: dict) -> int:
    scenes = props["scenes"]
    return round(sum(s.get("seconds") or default_seconds(s) for s in scenes) - TRANSITION_S * (len(scenes) - 1))


# Silence after a scene's line, so it ends before the next scene slides in.
VOICE_TAIL = 0.8


def _cut(path: Path, start: float, end: float) -> bytes | None:
    """The MP3 from ``start`` to ``end`` seconds — None when ffmpeg can't."""
    from app.story import _ffmpeg

    out = path.with_name(path.stem + "-cut.mp3")
    try:
        subprocess.run(
            [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
             "-ss", f"{max(0.0, start):.3f}", "-to", f"{end:.3f}", "-c:a", "libmp3lame", "-b:a", "128k", str(out)],
            check=True,
            capture_output=True,
            timeout=60,
        )
        blob = out.read_bytes()
    except (subprocess.SubprocessError, OSError):
        return None
    return blob if len(blob) > 1000 else None


def _pauses(path: Path) -> list[float]:
    """When the voice pauses in a line (seconds, the middle of each pause of
    0.12 s or more) — the subtitles of a voice without word timings (Gemini)
    change phrase there, so they follow its real rhythm."""
    from app.story import _ffmpeg

    try:
        info = subprocess.run(
            [_ffmpeg(), "-hide_banner", "-i", str(path), "-af", "silencedetect=n=-38dB:d=0.12", "-f", "null", "-"],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=60,
        ).stderr
    except (subprocess.SubprocessError, OSError):
        return []
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", info)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", info)]
    return [round((a + b) / 2, 2) for a, b in zip(starts, ends) if a > 0.2]


def _trim_silence(path: Path) -> bytes | None:
    """The MP3 without the silence the voice service puts before and after
    the words — None when ffmpeg can't do it (the line is used as it is)."""
    from app.story import _ffmpeg

    out = path.with_name(path.stem + "-trim.mp3")
    edge = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03"
    try:
        subprocess.run(
            [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
             "-af", f"{edge},areverse,{edge},areverse", "-c:a", "libmp3lame", "-b:a", "128k", str(out)],
            check=True,
            capture_output=True,
            timeout=60,
        )
        blob = out.read_bytes()
    except (subprocess.SubprocessError, OSError):
        return None
    return blob if len(blob) > 1000 else None


def spoken_text(say: str, pronunciations: list[dict] | None) -> tuple[str, list[tuple[str, str]]]:
    """(what the voice reads, its parts) for a line: numbers as Khmer words for
    Khmer lines, the brand's pronunciation list, and Khmer split into words
    (zero-width spaces) so Azure times every word. Parts that weren't changed
    show what's spoken, so remap_words leaves their words alone."""
    from app.khmer_speech import spoken_parts

    say = (say or "").strip()
    khmer = any("ក" <= ch <= "៿" for ch in say)
    pieces = []
    for shown, spoken in spoken_parts(say, pronunciations, numbers=khmer):
        said = _km_words(spoken) if any("ក" <= ch <= "៿" for ch in spoken) else spoken
        pieces.append((said if shown == spoken else shown, said))
    return "".join(s for _, s in pieces), pieces


def voice_pronunciations(voice: str, says: list[str], pronunciations: list[dict] | None) -> list[dict]:
    """The brand's pronunciation list — plus every other English / brand word
    in a Khmer line written in Khmer letters, the way a Cambodian says it
    (khmer_speech.LOANWORDS, acronyms spelled out, else the AI —
    local_voice.transliterate): a Khmer voice reading Latin letters inside a
    Khmer sentence guesses and gets them wrong. English lines stay as they
    are, except for the local Khmer voice, which can't read Latin at all."""
    from app import local_voice

    rules = list(pronunciations or [])
    local = voice.startswith(local_voice.PREFIX)
    lines = [s for s in says if s and (local or any("ក" <= ch <= "៿" for ch in s))]
    if not lines:
        return rules
    known = {(p.get("word") or "").strip().lower() for p in rules}
    latin = sorted({w for say in lines for w in local_voice.LATIN_WORD.findall(say) if w.lower() not in known})
    if latin:
        rules += [{"word": w, "say": k} for w, k in local_voice.transliterate(latin).items()]
    return rules


def add_voice(
    props: dict,
    script: dict,
    voice: str,
    ws: int | None,
    user_id: int | None,
    job_id: int,
    pronunciations: list[dict] | None = None,
    clone: bytes | None = None,
) -> int:
    """Each scene's spoken line, read by ``voice`` — and, with ``clone`` (a
    brand voice's fingerprint, app/voice_clone.py), turned into that voice
    after it's read: the MP3 goes into the scene
    and the scene lasts as long as its line (never shorter than its
    animation). Best effort — a line that fails just stays silent. Returns
    the characters spoken (what Azure bills)."""
    from app import speech
    from app.story import _probe

    says = [s.get("say") for s in script["scenes"]]
    pronunciations = voice_pronunciations(voice, says, pronunciations)
    local = voice.startswith("local:")  # the local Khmer voice costs no credit
    board = [dict(b) for b in (_progress.get(job_id, {}).get("scenes") or [])]
    _report(job_id, stage="voice")

    def mark(n: int, **fields) -> None:
        if n < len(board):
            board[n] = {**board[n], **fields}
            _report(job_id, scenes=[dict(b) for b in board])

    failed_before = len(speech.GEMINI_FAILURES)
    # Gemini answers in seconds but one at a time adds up — its lines are asked
    # for 4 at once up front; the loop below then takes them in order.
    ahead: dict = {}
    pool = None
    if voice.startswith(speech.GEMINI):
        from concurrent.futures import ThreadPoolExecutor

        pool = ThreadPoolExecutor(max_workers=4)
        for n, say in enumerate(says):
            if say:
                ahead[n] = pool.submit(contextvars.copy_context().run, lambda t: (t, speech.speak_timed(t[0], voice)), spoken_text(say, pronunciations))

    spoken = 0
    with tempfile.TemporaryDirectory() as tmp:
        for n, (scene, say) in enumerate(zip(props["scenes"], says)):
            _check(job_id)  # Stop pressed: no more lines are spoken (or billed)
            if not say:
                mark(n, voice="skip")
                continue
            mark(n, voice="speaking")
            try:
                # What the voice reads: numbers as Khmer words, the brand's
                # pronunciations, Khmer split into words so Azure times each one.
                if n in ahead:
                    (text, pieces), (mp3, words) = ahead[n].result()
                else:
                    text, pieces = spoken_text(say, pronunciations)
                    mp3, words = speech.speak_timed(text, voice)
                from app.khmer_speech import remap_words

                words = remap_words(words, pieces, text)  # subtitles keep "$80", not its Khmer words
            except Exception as exc:  # noqa: BLE001 — a failed line stays silent, the video goes on
                log.warning("motion %s: voice for scene %s failed: %s", job_id, n + 1, exc)
                mark(n, voice="skip")
                continue
            path = Path(tmp) / f"say-{n}.mp3"
            path.write_bytes(mp3)
            # Only the speech itself — the subtitles follow it. With word
            # timings the cut is exact (and the timings move with it); without,
            # the silence at either end is detected.
            cut = _cut(path, words[0]["t"] - 0.05, words[-1]["e"] + 0.12) if words else None
            if cut:
                shift = max(0.0, words[0]["t"] - 0.05)
                words = [{**w, "t": round(max(0.0, w["t"] - shift), 3), "e": round(w["e"] - shift, 3)} for w in words]
                mp3 = cut
            else:
                words = []
                mp3 = _trim_silence(path) or mp3
            if clone:
                # the brand's own voice: same length out, so the word timings still fit
                from app import voice_clone

                try:
                    mp3 = voice_clone.convert(mp3, clone)
                except Exception as exc:  # noqa: BLE001 — the reader's voice beats a silent scene
                    log.warning("motion %s: brand voice for scene %s failed: %s", job_id, n + 1, exc)
            path.write_bytes(mp3)
            _has_audio, duration = _probe(str(path))
            if duration <= 0:
                continue
            scene["audio"] = "data:audio/mpeg;base64," + base64.b64encode(mp3).decode()
            # The line starts once the scene has slid in + 6 frames breathing room (MotionPost.jsx).
            lead = (TRANSITION_S if n else 0.0) + 0.2 + min(1.5, float(scene.get("pause") or 0))
            scene["seconds"] = round(max(default_seconds(scene), lead + duration + VOICE_TAIL), 2)
            scene["voiceSeconds"] = round(duration, 2)  # subtitles follow the voice
            if words:
                scene["voiceWords"] = words  # …word by word, when Azure said when each word is (not "words": phones / stack / roll show their own)
            else:
                scene["pauses"] = _pauses(path)  # …else phrase by phrase, at the voice's own pauses
            mark(n, voice="done", seconds=round(duration, 1))
            spoken += len(say)
    if pool:
        pool.shutdown(wait=False, cancel_futures=True)
    new_failures = speech.GEMINI_FAILURES[failed_before:]
    del speech.GEMINI_FAILURES[:-50]
    backup = speech.backup_for(voice)
    if new_failures and backup:
        # Gemini dropped out part-way: some lines are Gemini, some Sreymom.
        # One video, one voice — the whole thing is read again by the backup
        # (the reason is for the team, in the log).
        log.error("motion %s: Gemini voice failed on %s line(s) (%s) — reading the whole video with %s", job_id, len(new_failures), new_failures[-1], backup)
        for scene in props["scenes"]:
            for k in ("audio", "voiceWords", "pauses", "voiceSeconds"):
                scene.pop(k, None)
        _report(job_id, voice_note=_backup_note(backup))
        return add_voice(props, script, backup, ws, user_id, job_id, pronunciations, clone)
    if voice.startswith("km-KH") and speech.gemini_ready() and not speech.gemini_available():
        # the person picked the Gemini voice; Gemini is out, so a backup read it
        _report(job_id, voice_note=_backup_note(voice))
    own = min(spoken, (speech._WS_TALLY.get() or {}).get("chars", 0))  # read with the workspace's own Gemini key
    if spoken - own > 0 and not local:
        billing.charge(
            ws, "video", (spoken - own) * speech.price_per_char(voice), user_id=user_id, model=voice, note="Remotion video voice-over", job_id=job_id
        )
    return spoken


def _backup_note(azure_voice: str) -> str:
    """The video card's note when Sreymom / Piseth read a video instead of
    Gemini — what happened and that they can carry on, nothing technical."""
    who = azure_voice.split("-")[2].removesuffix("Neural")
    return f"The Gemini voice isn’t available right now, so {who} read this whole video. You can keep making videos with {who} — Gemini comes back by itself."


class Stopped(Exception):
    """The person pressed Stop — the job ends quietly, not as an error."""


_procs: dict[int, subprocess.Popen] = {}  # job id → its running render
_stopped: set[int] = set()

# Live progress of each motion job, for the page's storyboard while it waits
# (GET /ai/video/{id} → progress). In memory: one backend process, and a job
# lives only while its thread runs.
#   stage   — "story" | "polish" | "pictures" | "voice" | "render"
#   style   — the template
#   scenes  — [{type, text, voice: "" | "speaking" | "done" | "skip", seconds}]
#   render  — 0..1 of the frames drawn
_progress: dict[int, dict] = {}


# Doodle notes: at most this many scenes get an AI sketch (the hook first, the
# rest spread over the film); the others draw their icon by hand on screen.
DOODLE_DRAWINGS = 3


def _start_doodles(script: dict, job, job_id: int, style: str | None = None) -> tuple[threading.Thread, dict]:
    """Start drawing the Doodle sketches in a background thread — on copies of
    the prompts, so nothing shared changes under the rest of the job.
    Returns (thread, {scene index: picture}) for _finish_doodles."""
    from app import doodle

    asks = [n for n, sc in enumerate(script["scenes"]) if sc.get("draw") and not sc.get("image")]
    if len(asks) > DOODLE_DRAWINGS:  # the first, then evenly spread
        step = (len(asks) - 1) / (DOODLE_DRAWINGS - 1)
        asks = [asks[round(i * step)] for i in range(DOODLE_DRAWINGS)]
    todo = [{"draw": script["scenes"][n]["draw"], "n": n} for n in asks]
    got: dict[int, str] = {}

    def work():
        doodle.draw_scenes(todo, job.workspace_id, job.user_id, report=lambda done, total: _report(job_id, drawn=done, drawings=total), style=style)
        got.update({t["n"]: t["image"] for t in todo if t.get("image")})

    _report(job_id, drawn=0, drawings=len(todo))
    thread = threading.Thread(target=contextvars.copy_context().run, args=(work,), daemon=True, name=f"doodle-{job_id}")
    thread.start()
    return thread, got


def _finish_doodles(doodling: tuple[threading.Thread, dict], props: dict, job_id: int) -> None:
    """Wait for the sketches still being drawn, then put each into its scene
    (build_props keeps the scenes one to one with the script's)."""
    thread, got = doodling
    if thread.is_alive():
        _report(job_id, stage="pictures")
        while thread.is_alive():
            thread.join(2)
            _check(job_id)  # Stop pressed: stop waiting (the drawing in hand finishes on its own)
    for n, uri in got.items():
        if n < len(props["scenes"]):
            props["scenes"][n]["image"] = uri


def _report(job_id: int | None, **fields) -> None:
    if job_id is not None:
        _progress[job_id] = {**_progress.get(job_id, {}), **fields}


def progress_of(job_id: int) -> dict | None:
    return _progress.get(job_id)


def _scene_summary(s: dict) -> str:
    """A scene's words in one short line, whatever its type (the live
    storyboard's rows) — the on-screen words, else what's said."""
    t = s.get("type")
    side = lambda p: (p or {}).get("name") or (p or {}).get("label") or ""  # noqa: E731
    if t == "compare" or t == "split":
        head = s.get("title") or ""
        pair = f"{side(s.get('left'))} vs {side(s.get('right'))}".strip(" vs")
        text = f"{head} — {pair}" if head and pair else head or pair
    elif t == "chart":
        names = " · ".join(x.get("name", "") for x in s.get("series") or [] if x.get("name"))
        text = f"{s.get('title') or ''}" + (f" — {names}" if names else "")
    elif t in ("stat", "result"):
        text = f"{s.get('prefix', '')}{s.get('value', '')}{s.get('suffix', '')} {s.get('label', '')}"
    elif t == "myth":
        text = s.get("myth") or ""
    elif t == "options":
        text = s.get("question") or " / ".join(s.get("options") or [])
    elif t == "customer":
        text = s.get("name", "") + (f" — {s['text']}" if s.get("text") else "")
    elif t == "beforeafter":
        text = f"{s.get('before', '')} → {s.get('after', '')}"
    elif t == "checklist":
        text = s.get("title") or " / ".join(s.get("checks") or [])
    elif t == "recap":
        text = s.get("title") or " · ".join(x.get("title", "") for x in s.get("points") or [])
    elif t == "flow":
        text = s.get("title") or " → ".join(n.get("label", "") for n in s.get("nodes") or [])
    elif t == "dashboard":
        text = s.get("title") or " · ".join(m.get("label", "") for m in s.get("metrics") or [])
    elif t == "news":
        text = s.get("headline") or ""
    elif t == "notify":
        text = s.get("title") or " / ".join(n.get("text", "") for n in s.get("notes") or [])
    elif t == "offer":
        text = " ".join(x for x in (s.get("plan"), s.get("price"), s.get("period")) if x)
    elif t == "launch":
        text = s.get("name") or ""
    elif t in ("rank", "tip"):
        text = s.get("title") or ""
    elif t == "take":
        text = s.get("text") or ""
    elif t == "meme":
        text = f"{s.get('top') or ''} / {s.get('bottom') or ''}"
    elif t == "client":
        text = s.get("name") or ""
    elif t in ("metrics", "timeline", "bars"):
        text = s.get("title") or ""
    elif t == "qa":
        text = s.get("q") or ""
    elif t == "donut":
        text = f"{s.get('value', '')}% {s.get('label', '')}"
    elif t == "choice":
        text = s.get("question") or ""
    elif t == "reviews":
        text = s.get("title") or (f"★ {s['rating']}" if s.get("rating") else "Reviews")
    elif t == "logos":
        text = s.get("title") or ", ".join(s.get("names") or [])
    elif t == "save":
        text = s.get("text") or ""
    elif t in ("platform", "chaos"):
        text = s.get("text") or ""
    elif t == "orbit":
        text = (s.get("center") or {}).get("title") or s.get("text") or ""
    elif t == "phones":
        text = " ".join(s.get("words") or [])
    elif t == "pair":
        text = f"{s.get('left', '')} · {s.get('right', '')}"
    elif t == "word":
        text = s.get("word") or s.get("title") or ""
    elif t == "canvas":
        text = " ".join(str(L.get("text") or L.get("title") or "") for L in s.get("layers") or [])
    elif t in ("send", "address", "hops", "assemble"):
        text = s.get("text") or s.get("label") or ""
    elif t == "lookup":
        text = f"{s.get('question', '')} {s.get('answer', '')}"
    elif t == "tasks":
        text = s.get("title") or " · ".join(x.get("text", "") for x in s.get("items") or [])
    elif t == "fanout":
        text = s.get("title") or " / ".join(o.get("kind", "") for o in s.get("outputs") or [])
    elif t == "field":
        text = f"{s.get('label') or ''} {s.get('value') or ''}".strip()
    elif t == "button":
        text = s.get("title") or s.get("button") or ""
    elif t == "form":
        text = s.get("title") or " · ".join(f.get("label", "") for f in s.get("fields") or [])
    elif t == "stack":
        text = " / ".join(s.get("words") or []) or "Screens"
    elif t == "apps":
        text = s.get("title") or " · ".join(a.get("name", "") for a in s.get("apps") or [])
    elif t == "roll":
        text = f"{s.get('lead', '')} " + " / ".join(s.get("words") or [])
    elif t in ("table", "board", "doodle", "whiteboard", "example", "climb", "grow", "mirror"):
        text = s.get("title") or ""
    else:
        text = s.get("text") or s.get("title") or s.get("label") or ""
    text = " ".join(str(text).split()) or (s.get("say") or "")
    return text.replace("[", "").replace("]", "").replace("⟦", "").replace("⟧", "")[:120]


def _board(script: dict) -> list[dict]:
    """The storyboard as the page shows it: each scene's type and its words —
    the one-line summary, and (opened on the page) everything on screen and
    the voice line."""
    rows = []
    for s in script["scenes"]:
        screen = script_lines({"scenes": [s]})[0][0].split("] ", 1)[-1]
        rows.append(
            {
                "type": s["type"],
                "text": _scene_summary(s),
                "screen": re.sub(r"[\[\]⟦⟧]", "", screen)[:400],
                "say": s.get("say") or "",
                "voice": "",
                "seconds": 0,
            }
        )
    return rows


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
        sources = [*(MOTION_DIR / "src").rglob("*"), *(MOTION_DIR / "public" / "fonts").rglob("*"), *(MOTION_DIR / "public" / "music").rglob("*")]
        if all(p.stat().st_mtime <= stamp for p in sources if p.is_file()):
            return "build", BUNDLE_DIR / "public"
    return "src/index.jsx", MOTION_DIR / "public"


def render(props: dict, job_id: int | None = None, preview: bool = False) -> bytes:
    """The MP4 for ``props`` — Remotion, run as a subprocess. Raises
    RuntimeError, or Stopped when the person pressed Stop. ``preview``: small
    and silent, for AI design's self-check (review_design) — quick."""
    reason = not_ready()
    if reason:
        raise RuntimeError(reason)
    with _render_lock, tempfile.TemporaryDirectory() as tmp:
        _check(job_id)
        entry, public = _entry()
        rel = f"run-{uuid.uuid4().hex[:12]}"
        assets = public / rel  # served to the render as staticFile(rel/…)
        assets.mkdir(parents=True)
        try:
            props_path = Path(tmp) / "props.json"
            out = Path(tmp) / "motion.mp4"
            props_path.write_text(json.dumps(_to_files(props, assets, rel), ensure_ascii=False), encoding="utf-8")
            proc = subprocess.Popen(
                [
                    _npx(), "remotion", "render", entry, "MotionPost", str(out), f"--props={props_path}",
                    # every core draws frames (the default is half — one at a time on a 2-core server)
                    # all cores Remotion is allowed (containers too); the default log
                    # level prints "Rendered 120/900" lines — the page's progress
                    "--concurrency=100%",
                    # 3D · Spotlight draws with WebGL — the server has no graphics card, so in software
                    *(["--gl=swangle"] if props.get("style") == "spotlight" else []),
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
                        _report(job_id, render=round(int(m[1]) / int(m[2]), 3))
                    elif "Encoded" in line or "Stitch" in line:
                        _report(job_id, render=1.0)

            reader = threading.Thread(target=follow, daemon=True)
            reader.start()
            try:
                proc.wait(timeout=900 + 2 * length_of(props))  # a 10-minute training renders for a while
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


# ── AI design's self-check (stage 2) ───────────────────────────────────────
DESIGN_REVIEW_PROMPT = (
    "You are the art director checking an animated video's DESIGN before it is rendered for the "
    "client. The image is a contact sheet: each scene at its settled moment, numbered 1..N in the "
    "top-left corner. You also get the design (each scene's palette, background and layers; "
    "x/y = a layer's centre in % of the frame).\n"
    "Look for real problems only: text overlapping text or other elements, text or elements cut "
    "off at the frame's edge, text too small or low contrast to read, a crowded or cluttered "
    "scene, an empty or unbalanced one, anything in the bottom 15 % of the frame (the subtitles go "
    "there), a reveal that looks weak.\n"
    "Also judge the film as ONE design: a scene that looks out of family (crowded, a different "
    "layout logic, an odd element) is a real problem — make it rhyme with the others. Colours "
    "and backgrounds come from the film's theme; a scene may only switch \"tone\" (dark | light).\n"
    "Fix only what is wrong — move (x, y), resize (size, w, h), reorder (z), remove a "
    "layer (fewer is often the fix), or add a small accent. KEEP the wording, the story, the scene order and the brand.\n"
    "Return ONLY JSON: {\"fixes\": [{\"scene\": <its number>, \"pal\"?: {...}, \"bg\"?: {...}, "
    "\"layers\": [<the scene's FULL corrected layer list>]}], \"note\": <max 12 words>}. "
    "\"fixes\": [] when every scene is fine.\n"
    "You also get THE CHECKLIST — every ask in the client's brief — and the asks NOT DELIVERED "
    "yet. Each missing ask is a real problem: deliver it in the scene where it belongs (change a "
    "layer or add one; quoted text character for character; tag the layer \"req\": [its id]). "
    "Keep every layer's \"req\" tags."
)


def _small(im) -> bytes:
    """A frame as a JPEG at the preview's full size — for the live making card."""
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=86)
    return buf.getvalue()


_SKETCHES: dict[str, tuple[float, list]] = {}


def _keep_sketches(frames: list) -> list:
    """The pictures kept behind a new unguessable code; their URLs (None where there's none)."""
    now = time.time()
    for k, (at, _) in list(_SKETCHES.items()):
        if now - at > 3 * 3600:
            _SKETCHES.pop(k, None)
    code = secrets.token_urlsafe(18)
    _SKETCHES[code] = (now, frames)
    return [f"/api/ai/motion/sketch/{code}/{i}.jpg" if f else None for i, f in enumerate(frames)]


@sketch_router.get("/sketch/{code}/{n}.jpg", include_in_schema=False)
def sketch(code: str, n: int):
    """One scene picture of a video being made (see _keep_sketches)."""
    frames = (_SKETCHES.get(code) or (0, []))[1]
    if not (0 <= n < len(frames)) or not frames[n]:
        raise HTTPException(404, "Not here any more.")
    return Response(content=frames[n], media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


def _sheet(mp4: bytes, times: list[float], sketches: list | None = None) -> bytes | None:
    """The preview's frame at each time, side by side with its number — one
    JPEG. ``sketches`` (a list) gets each scene's frame as a small picture
    (a data URI, None where there's none) — the making card shows them live."""
    import imageio_ffmpeg
    from PIL import Image, ImageDraw

    frames = []
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "p.mp4"
        src.write_bytes(mp4)
        for i, t in enumerate(times):
            out = Path(tmp) / f"f{i}.jpg"
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(src), "-frames:v", "1", "-q:v", "4", str(out)], capture_output=True, timeout=60)
            if out.exists():
                frames.append(Image.open(out).convert("RGB"))
            if sketches is not None:
                sketches.append(_small(frames[-1]) if out.exists() else None)
    if not frames:
        return None
    w, h = frames[0].size
    cols = 3 if w > h else 4
    rows = -(-len(frames) // cols)
    sheet = Image.new("RGB", (cols * (w + 12) + 12, rows * (h + 12) + 12), "white")
    draw = ImageDraw.Draw(sheet)
    for i, im in enumerate(frames):
        x, y = 12 + (i % cols) * (w + 12), 12 + (i // cols) * (h + 12)
        sheet.paste(im.resize((w, h)), (x, y))
        draw.rectangle([x, y, x + 46, y + 34], fill="#E11D48")
        draw.text((x + 14, y + 8), str(i + 1), fill="white")
    buf = io.BytesIO()
    sheet.save(buf, "JPEG", quality=80)
    return buf.getvalue()


def _sketch(props: dict, job_id: int) -> None:
    """Each scene's picture once it has settled, from a quick small silent
    preview — the making card's Animate step shows them. Best effort: the
    video never waits on a failure here."""
    try:
        mp4 = render(props, None, preview=True)
        times, start = [], 0.0
        for sc in props["scenes"]:
            dur = sc.get("seconds") or default_seconds(sc)
            times.append(start + min(dur - 0.3, 1.8))  # the templates have settled by then
            start += dur - TRANSITION_S
        sketches: list = []
        _sheet(mp4, times, sketches)
        if any(sketches) and job_id in _progress:
            _report(job_id, sketches=_keep_sketches(sketches))
    except Exception as exc:  # noqa: BLE001 — pictures for the card only
        log.warning("motion %s: no scene pictures for the card: %s", job_id, exc)


def review_design(brand: Brand, script: dict, logo: str | None, khmer: bool, job_id: int | None) -> dict:
    """AI design (style "canvas"), stage 2: a quick small preview of the
    designed scenes is rendered, each scene's settled frame goes on a contact
    sheet, and the AI looks at it and fixes what looks off — overlaps, text off
    the frame, crowding, contrast. The fixes pass _clean_canvas like any
    design. Anything going wrong here just keeps the design as it was: the
    check never blocks a video."""
    from app.content_ai import ContentAIError, _chat

    scenes = script.get("scenes") or []
    if script.get("style") != "canvas" or not scenes:
        return script
    _report(job_id, stage="check")
    asks = script.get("asks") or []
    if all(sc.get("design") for sc in scenes):  # placed by layouts: nothing to fix by eye

        status = asks_status(script)
        if status:
            _report(job_id, design_note=f"Checked the design · {sum(1 for a in status if a['ok'])} of your {len(status)} asks in it", asks=status)
        return script

    def done(fixed: int) -> dict:
        status = asks_status(script)
        got = sum(1 for a in status if a["ok"])
        note = f"{fixed} scene{'s' if fixed != 1 else ''} improved" if fixed else "it looks right"
        if status:
            note += f" · {got} of your {len(status)} asks in it"
        _report(job_id, design_note="Checked the design · " + note, asks=status)
        return script

    try:
        props = build_props(brand, script, logo, khmer)
        mp4 = render(props, job_id, preview=True)
        # when each scene has settled: its last layer is in, plus a second
        times, start = [], 0.0
        for sc in props["scenes"]:
            dur = sc.get("seconds") or default_seconds(sc)
            last = max([float(L.get("at") or 0) for L in sc.get("layers") or []] + [0.0]) + float(sc.get("pause") or 0)
            times.append(start + min(dur - 0.3, last + 1.2))
            start += dur - TRANSITION_S
        sketches: list = []
        sheet = _sheet(mp4, times, sketches)
        if any(sketches):  # the card swaps them in, scene by scene, while the video is made
            _report(job_id, sketches=_keep_sketches(sketches))
        if not sheet:
            return done(0)
        design = [
            {"scene": i + 1, "pal": sc.get("pal"), "bg": sc.get("bg"), "layers": [{k: ("<picture>" if k == "src" else v) for k, v in L.items()} for L in sc.get("layers") or []]}
            for i, sc in enumerate(scenes)
        ]
        missing = [a for a, st in zip(asks, asks_status(script)) if not st["ok"]]
        out = _chat(
            [
                {"role": "system", "content": DESIGN_REVIEW_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "THE DESIGN:\n" + json.dumps(design, ensure_ascii=False)
                            + "\n\nTHE CHECKLIST:\n" + json.dumps(asks, ensure_ascii=False)
                            + "\n\nNOT DELIVERED YET:\n" + (json.dumps(missing, ensure_ascii=False) if missing else "(none)"),
                        },
                        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(sheet).decode()}},
                    ],
                },
            ],
            get_settings().azure_openai_vision_deployment or get_settings().azure_openai_deployment,
            max_tokens=12000,
            effort="low",
        )
    except Stopped:
        raise
    except (ContentAIError, RuntimeError, OSError, subprocess.SubprocessError, ValueError) as exc:
        log.warning("motion %s: design check skipped: %s", job_id, exc)
        return done(0)
    fixed = 0
    for fx in (out.get("fixes") or [])[: len(scenes)]:
        try:
            n = int(fx.get("scene")) - 1
        except (TypeError, ValueError):
            continue
        if not (0 <= n < len(scenes)) or not isinstance(fx.get("layers"), list):
            continue
        old = scenes[n]
        pictures = [L.get("src") for L in old.get("layers") or [] if L.get("src")]
        cand = {"type": "canvas", "seconds": old.get("seconds"), "pause": old.get("pause"), "tone": fx.get("tone") or old.get("tone"), "req": old.get("req"), "pal": fx.get("pal") or old.get("pal"), "bg": fx.get("bg") or old.get("bg"), "layers": fx["layers"]}
        # the pictures were sent as "<picture>": they keep the brand kit's own
        for L in cand["layers"]:
            if isinstance(L, dict) and L.get("src") == "<picture>":
                L["src"] = pictures.pop(0) if pictures else None
        clean = _clean_canvas(cand, old.get("say") or "")
        if clean:
            scenes[n] = apply_theme(clean, script.get("theme") or clean_theme({}))
            fixed += 1
    log.info("motion %s: design check fixed %s scene(s) — %s", job_id, fixed, _line(out.get("note"), 80))
    return done(fixed)


# ── API ───────────────────────────────────────────────────────────────────
class MotionIn(BaseModel):
    brand_id: int
    # Long prompts are fine (e.g. one written for a filmed video) — the AI
    # reads the topic out of the first part of it. Empty: "Make one for me" —
    # the AI picks the topic itself (write_script).
    idea: str = Field(default="", max_length=20000)
    product_id: int | None = None
    language: str = "Khmer"
    # Narrator: "female", "male", "brand" (the brand's own voice,
    # app/voice_clone.py), or "none" for a silent video.
    voice: str = "female"
    # Background music under the video (when tracks are installed).
    music: bool = True
    # What the video is for: a content goal (app/goals.py), "sell", "teach", a
    # template name ("versus", "poll", "quote") or "auto" — style_for picks
    # the template.
    goal: str = "auto"
    # A storyboard the person reviewed (POST /ai/motion/plan, then edited):
    # made exactly as it is — no new script. {"style", "mood"?, "scenes": [...]}
    script: dict | None = None
    # "16:9" = a wide video — only the templates laid out for it (WIDE_STYLES);
    # every other template is always vertical 9:16.
    ratio: str = "9:16"
    # An attached screenshot of the brand's own app (a media URL): the design
    # the video copies, and screenshot 1 it can show.
    ref_url: str = Field(default="", max_length=500)
    # More screenshots attached with it (up to 6 in all) — screenshots 2, 3…
    ref_urls: list[str] = Field(default_factory=list, max_length=6)
    # False = "No logo": a video without the brand — no logo, name, colours,
    # photos or products (Unbranded), e.g. a script about another product
    branded: bool = True


class PlanIn(BaseModel):
    brand_id: int
    idea: str = Field(min_length=1, max_length=20000)  # their story / script (MotionIn takes it after)
    product_id: int | None = None
    language: str = "Khmer"
    goal: str = "auto"
    music: bool = True
    length: str = "auto"  # "auto" | "60" | "120" | "300" | "600" (the last two: a training)
    ratio: str = "auto"  # "auto" (the director picks) | "9:16" | "16:9" — see final_ratio
    ref_url: str = Field(default="", max_length=500)  # see MotionIn
    ref_urls: list[str] = Field(default_factory=list, max_length=6)  # see MotionIn
    branded: bool = True  # see MotionIn


# ── The director: Story "Auto" reads the brief and picks the template ──────
# What each template is for, in the words the director chooses by.
TEMPLATE_GUIDE = {
    "custom": "SaaS, software, an app, an AI tool, a platform (Power Apps, a CRM…), B2B tech — product UI, dashboards, flows, the brand's screenshots",
    "demo": "showing HOW to use a software product, step by step in an app window",
    "hottake": "a bold opinion about the industry — a common belief struck out, the take, agree or disagree",
    "casestudy": "one customer's story with numbers — their problem, what they did, before → after, their quote",
    "faq": "the questions customers ask, each answered — chat bubbles, the answer typing itself",
    "report": "numbers about the topic with their source — bars, a percent ring, a big number",
    "countdown": "a TOP 5 / ranked list of tips, mistakes, tools or ideas — counting down to the best one",
    "thisorthat": "A-or-B choices the audience answers in the comments — this or that, which one are you",
    "reviews": "social proof — real reviews, a rating, the customers who use it (only when the brief gives them)",
    "tips": "practical tips people save — 3-5 numbered tip cards and a \"save this\" ask",
    "clarity": "explaining what a software product does and why it matters — calm, white and light blue: the mess of tools today, the product, how it works",
    "launch": "launching a product or a new feature — a cinematic launch film: the one click that does the job, the product's screens, \"now live\"",
    "unveil": "unveiling a product or a new feature in a light, elegant way — one big word, the app card coming into focus, a field typing itself, a check with confetti",
    "gridcards": "how a product or service solves an everyday problem — the repetitive work today, then one input becoming several results (a post, a price poster, a caption), clear and friendly",
    "techflow": "explaining HOW a technology works step by step (the internet, email, payments, AI, apps) — devices, data packets travelling, addresses, lookups, the path, a recap",
    "rise": "mindset / motivation — encouraging people to live their best life: small habits, a fresh start, believing in yourself; a person climbing stairs as night turns to sunrise",
    "lesson": "teaching one idea step by step with a cartoon teacher and a pointer stick at a whiteboard — the maths (a sum, bars), steps, a list — then 2-3 example people who do it differently; money, business, health, study",
    "cartoon": "a little story with two cartoon characters talking in one everyday place (a shop, a market, an office, home) — speech bubbles, thought clouds, a business or life problem and its fix, part 1 / part 2 series",
    "podcast": "a storytelling podcast episode — the host talks from a cosy studio desk with a mic, then the video cuts to the places the story happens (a park, a home office, a market) where the host acts it out; a personal story, a choice, a life / work / money lesson, told first person",
    "presenter": "the brand's own host presents a topic to camera — a friendly robot assistant in the brand's T-shirt at a desk greets ('Hi, I'm Kalyan, the brand's personal assistant'), brings today's topic and explains it point by point; daily tips, news, how-tos, explainers in a personal, talk-show way",
    "studio": "an elegant editorial showcase — big thin words on a soft light set, the brand's photos as a collage of cards, green vines and a stone column; for an academy / school, a design studio, a premium shop or service showing its work and inviting people in",
    "reaction": "a short funny reaction meme (8-20 s) — a relatable situation on screen (a screenshot, few followers, a customer asking 'price?'), a meme caption on top, cut-out cats / dogs popping their mouths or freezing in shock; for reach and shares",
    "doodle": "a self-improvement / mindset / life lesson told calmly (overthinking, habits, money, stress, work, relationships) — grid paper, a bold Khmer headline with orange key words, a hand-drawn sketch of the feeling in every scene",
    "paper": "an AI / tech concept explained simply on graph paper (what is machine learning, deep learning, an API…) — editorial, navy and orange, icons and maths floating around",
    "neural": "a tech or AI explainer / lesson / history with a motivating message — a big question, before vs after with AI, a timeline, two people who chose differently, a quote to remember",
    "canvas": "a brief that asks for its OWN look or scenes — an event / LED-screen film, a cinematic launch with acts and colours of its own, or anything no template fits: the AI designs every scene",
    "showcase": "a bright, polished promo / launch video for a SaaS or app — the tools it connects, its table and board views, who it is for",
    "training": "a team training, an internal presentation, a workshop, a lesson or a long talk with parts / sections — chapters, key points, checklists, recap",
    "explainer": "a story with people — characters with feelings (stick figures), everyday life, money and life lessons, a tale that teaches",
    "testimonial": "a customer's story or case study — who they are, before → after, their result",
    "tech": "selling a product or service of a shop / business — the problem, the product working, proof, buy now",
    "offer": "a promotion, a price, a discount, a package — one clear offer and action",
    "spotlight": "a physical product shown like a launch film — its photo on a real 3D box turning under a spotlight, 3 reasons to want it, its price card, one action; for a drink, snack, cosmetic, gadget or any product with a photo in the brand kit",
    "versus": "a comparison — old way vs new way, option A vs B, myths vs facts",
    "poll": "a quiz or questions for the audience to answer in the comments",
    "quote": "inspiring quotes or short lessons worth following",
    "trend": "news — what's new in AI / tech / the industry and what it means (NOT a lesson or a how-to — those are training or explainer)",
    "pov": "a funny or relatable everyday moment (\"POV: …\") people tag friends on",
}


def pick_style(idea: str, products: list[Product], has_product: bool, has_ui: bool = False, ratio: str = "9:16") -> tuple[str, str, str | None]:
    """(template, why) for a brief when Story is "Auto" — one quick AI call
    that reads what the video is about. Falls back to the simple rule (a chosen
    product = Sell, else Teach) when the AI can't answer."""
    from app.content_ai import ContentAIError, _chat

    fallback = ("custom" if ratio == "16:9" else "tech" if has_product else "explainer", "", None)
    if not idea.strip():
        return fallback
    guide = "\n".join(f"- {k}: {v}" for k, v in TEMPLATE_GUIDE.items() if ratio != "16:9" or k in WIDE_STYLES)
    shape = (
        "\n\nTHE VIDEO MUST BE WIDE 16:9 — choose only from the templates above."
        if ratio == "16:9"
        else '\n\nAlso choose the shape: "16:9" when the brief is for YouTube, LinkedIn, a website, a '
        'presentation, a training or a meeting screen; "9:16" for TikTok, Reels, Facebook / Instagram '
        "or when nothing is said."
        if ratio == "auto"
        else ""
    )
    if own_design(idea):
        # scene by scene with its own looks, backgrounds, pauses and reveals:
        # only AI design can follow that — a fixed template would drop it
        return "canvas", "Your script designs each scene — the AI builds every scene to match it", "16:9" if re.search(r"16\s*:\s*9|landscape|led screen|youtube", idea, re.I) else None
    names = ", ".join(p.name for p in products[:10]) or "(none)"
    try:
        out = _chat(
            [
                {
                    "role": "system",
                    "content": "You are a video director. Read the brief and choose the ONE video template that fits "
                    "what it is about and how it should be told. Templates:\n" + guide + shape + "\n\nReturn JSON "
                    '{"template": "<one of the names above>", "ratio": "16:9" | "9:16", "why": "<max 12 words, in English>"}.',
                },
                {
                    "role": "user",
                    "content": f"THE BRAND'S PRODUCTS: {names}\nA PRODUCT IS CHOSEN: {'yes' if has_product else 'no'}\n"
                    f"A SCREENSHOT OF THEIR APP IS ATTACHED: {'yes — prefer custom or demo' if has_ui else 'no'}\n\nTHE BRIEF:\n{idea.strip()[:3000]}",
                },
            ],
            get_settings().azure_openai_deployment,
            max_tokens=1500,
            effort="low",
        )
    except ContentAIError:
        return fallback
    style = str(out.get("template") or "").strip().lower()
    if style not in TEMPLATE_GUIDE or (ratio == "16:9" and style not in WIDE_STYLES):
        return fallback
    suggested = out.get("ratio") if out.get("ratio") in ("16:9", "9:16") else None
    return style, _line(out.get("why"), 120), suggested


# ── A reference screenshot of the brand's own app → the video's design ─────
def _shot_from_blob(blob: bytes, name: str, note: str = "") -> dict | None:
    try:
        im = Image.open(io.BytesIO(blob))
        im.thumbnail((1600, 1600))
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=90)
    except Exception:  # noqa: BLE001 — not a picture
        return None
    uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    return {"id": 0, "name": name, "note": note, "uri": uri, "w": im.width, "h": im.height}


def design_from_image(shot: dict, brand_hex: str) -> dict | None:
    """The design of an app screenshot the person attached — the look the
    video's drawn screens copy: light/dark, colours, card colour, corner style,
    the app's name and menu items. None when the AI can't read it."""
    from app.content_ai import ContentAIError, _chat

    try:
        out = _chat(
            [
                {
                    "role": "system",
                    "content": "You are a UI designer. Read the design of this app / website screenshot. Return JSON "
                    '{"mode": "light" | "dark", "bg": "#RRGGBB" (page background), "surface": "#RRGGBB" (card / panel '
                    'colour), "a": "#RRGGBB" (the main accent — buttons, active items), "b": "#RRGGBB" (a second accent, '
                    'or a lighter / darker shade of a), "radius": "sharp" | "soft" | "round" (corners of cards and '
                    'buttons), "app": "the app / product name if visible, else \\"\\"", "nav": [up to 5 menu / tab '
                    'labels as written], "screen": "what this screen is, max 15 words"}. Colours sampled from the '
                    "screenshot, not guessed.",
                },
                {"role": "user", "content": [{"type": "text", "text": "The screenshot:"}, {"type": "image_url", "image_url": {"url": shot["uri"], "detail": "high"}}]},
            ],
            _vision_model(),
            max_tokens=3000,
        )
    except ContentAIError:
        return None
    look = clean_look({**out, "background": "grid" if out.get("mode") != "light" else "dots"}, brand_hex)
    surface = str(out.get("surface") or "")
    if _HEX.fullmatch(surface) and ((look["mode"] == "light" and _lum(surface) > 0.6) or (look["mode"] == "dark" and _lum(surface) < 0.12)):
        look["card"] = surface
    look["radius"] = out.get("radius") if out.get("radius") in ("sharp", "soft", "round") else "soft"
    nav = [x for x in (_line(n, 24) for n in (out.get("nav") or [])) if x][:5]
    app_name = _line(out.get("app"), 40)
    if app_name:
        look["kicker"] = app_name.upper()[:20]
    return {"look": look, "nav": nav, "app": app_name, "screen": _line(out.get("screen"), 140)}


def _design_prompt(design: dict) -> str:
    look = design["look"]
    parts = [
        f"{look['mode']} theme",
        f"accent {look['a']}",
        f"{look['radius']} corners",
    ]
    text = "\n\nTHE BRAND'S OWN APP DESIGN (from the screenshot they attached — screenshot 1): " + ", ".join(parts) + "."
    if design.get("app"):
        text += f" The app is called {design['app']}."
    if design.get("nav"):
        text += " Its menu: " + ", ".join(design["nav"]) + " — use these real names in `step`, `flow` and `dashboard` scenes."
    if design.get("screen"):
        text += f" Screenshot 1 shows: {design['screen']}."
    return text + " The video's look is set from this design — keep \"look\" close to it."


MAX_ATTACHED = 6


def attached_shots(ref_url: str, ref_urls: list[str] | None) -> list[dict]:
    """The screenshots attached after the first one (screenshots 2, 3…), in
    the order attached — the plan and the video number them the same way."""
    urls = [u for u in dict.fromkeys(str(u or "")[:500] for u in (ref_urls or [])) if u and u != ref_url][: MAX_ATTACHED - 1]
    out = []
    for u in urls:  # numbered as they land (an unreadable one takes no number)
        shot = _shot_from_blob(read_media(u) or b"", f"Your app (attached screenshot {len(out) + 2})")
        if shot:
            out.append(shot)
    return out


def reference_shot(db: Session, ref_url: str, brand_hex: str) -> tuple[dict | None, dict | None]:
    """(screenshot, design) for an attached reference, or (None, None)."""
    if not ref_url:
        return None, None
    blob = read_media(ref_url)
    shot = _shot_from_blob(blob or b"", "Your app (the attached screenshot)") if blob else None
    if not shot:
        return None, None
    design = design_from_image(shot, brand_hex)
    if design:
        shot["note"] = design.get("screen") or ""
    return shot, design


def _style_of(goal: str, product_id: int | None) -> str:
    # Auto: a chosen product means a sales video, otherwise a teaching one.
    return style_for(goal) if goal not in ("auto", "") else ("tech" if product_id is not None else "explainer")


# Storyboards being written (POST /plan → GET /plan/{id}): the work runs in a
# thread because the AI steps together (director, storyboard, Khmer editor,
# voice director) can take longer than the proxy in front of us waits (100 s →
# a 524). {id: {"ws", "status": running|done|failed, "result" | "error", "at"}}
_plans: dict[str, dict] = {}
_PLAN_KEEP = 3600  # seconds a finished storyboard waits to be picked up


class Unbranded:
    """A brand with its branding taken off — the "No logo" choice, for a video
    about something else (another product, a client's script): no name, no
    colours, no past posts, no products; the rest (its workspace, its voice,
    its pronunciations) from the real one."""

    name = ""
    colors = ["#2F6FD6"]
    slug = "unbranded"
    voice_examples = ""
    unbranded = True

    def __init__(self, brand):
        self._brand = brand

    def __getattr__(self, key):
        return getattr(self._brand, key)


def _build_plan(payload: "PlanIn", ws: int, user_id: int, on_style=None) -> dict:
    """The storyboard itself — the slow part (several AI calls). ``on_style``
    hears the template picked (and why) as soon as it's decided, for the page."""
    db = SessionLocal()
    try:
        brand = db.get(Brand, payload.brand_id)
        all_products = list(db.scalars(select(Product).where(Product.brand_id == brand.id).order_by(Product.name)).all())
        products = [p for p in all_products if p.id == payload.product_id] or all_products
        if not payload.branded:  # "No logo": nothing of the brand in it
            brand, products = Unbranded(brand), []
        style, why, suggested = (
            pick_style(payload.idea, products, payload.product_id is not None, bool(payload.ref_url), payload.ratio)
            if payload.goal in ("auto", "")
            else (_style_of(payload.goal, payload.product_id), "", None)
        )
        if on_style:
            on_style(style, why)
        shape = final_ratio(payload.ratio, style, suggested)
        seconds = story_seconds(payload.idea, payload.length, 600 if style in LONG_STYLES else 120)
        r, g, b = brand_rgb(brand)
        ref, design = reference_shot(db, payload.ref_url, f"#{r:02x}{g:02x}{b:02x}")
        more = attached_shots(payload.ref_url, payload.ref_urls) if ref else []
        for shot in more:  # what each one shows, so the storyboard knows where it belongs
            shot["note"] = describe_screen(base64.b64decode(shot["uri"].split(",", 1)[1]))
        shots = ([ref] if ref else []) + more + (brand_screens(db, brand.id) if style in SCREEN_STYLES and payload.branded else [])
        db.rollback()  # no transaction held open through the AI calls
        script = write_script(
            brand, products, payload.idea, payload.language, "", list(music_tracks()) if payload.music else [], style,
            seconds=seconds, shots=shots, design=design, wide=shape == "16:9",
        )
        script["ratio"] = shape
        # a script that designs its own film, put in a fixed template: the page offers AI design
        misfit = style != "canvas" and own_design(payload.idea)
        return {"script": script, "target_seconds": seconds, "estimate_seconds": estimate_seconds(script), "why": why, "misfit": misfit}
    finally:
        db.close()


def _run_plan(plan_id: str, payload: "PlanIn", ws: int, user_id: int, model: str = "") -> None:
    from app.content_ai import ContentAIError

    billing.bind(ws, user_id, model)  # the AI calls in this thread are charged to them (and use their pick)
    try:
        # the template and why, as soon as they're picked — the page shows its thinking
        result = _build_plan(payload, ws, user_id, on_style=lambda style, why: _plans[plan_id].update(style=style, why=why))
        _plans[plan_id].update(status="done", result=result)
    except ContentAIError as exc:
        _plans[plan_id].update(status="failed", error=str(exc))
    except Exception:  # noqa: BLE001 — the page shows it instead of waiting forever
        log.exception("storyboard %s failed", plan_id)
        _plans[plan_id].update(status="failed", error="The storyboard couldn't be written just now — try again in a moment.")


@router.post("/plan")
def plan_motion(
    payload: PlanIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Start writing the storyboard for the person's own story — to review and
    edit before anything is voiced or rendered (POST /ai/motion with
    ``script``). Answers at once with an id; GET /plan/{id} until it's done."""
    owned(db, Brand, payload.brand_id, ws)
    if payload.product_id is not None:
        owned(db, Product, payload.product_id, ws)
    billing.require(ws, 0.0, db)
    now = time.time()
    for k in [k for k, v in _plans.items() if now - v["at"] > _PLAN_KEEP]:
        _plans.pop(k, None)
    plan_id = uuid.uuid4().hex
    _plans[plan_id] = {"ws": ws, "status": "running", "at": now}
    threading.Thread(target=_run_plan, args=(plan_id, payload, ws, user.id, billing.requested_model()), daemon=True, name=f"plan-{plan_id[:8]}").start()
    return {"plan_id": plan_id, "status": "running"}


@router.get("/voice-status")
def voice_status(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Whether the Gemini voice reads Khmer right now — the composer says so
    before a video is made, and who reads instead (Sreymom / Piseth). Counts
    the workspace's own Gemini key."""
    from app import gemini_keys, speech

    speech.use_workspace_key(gemini_keys.workspace_key(db, ws))
    return speech.gemini_status()


@router.get("/making/{job_id}")
def making(job_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """A Remotion video's "How it was made": the brief, and — for videos made
    since it's kept — the template, voice and every scene with its voice clip.
    Older videos have only the brief and the storyboard text (``making`` null)."""
    job = owned(db, GenerationJob, job_id, ws, "Generation job")
    brief, _, board = (job.prompt or "").partition("\n\nREMOTION STORYBOARD:\n")
    video = db.get(Video, job.video_id) if job.video_id else None
    return {
        "brief": brief.strip(),
        "storyboard": board.strip(),
        "making": json.loads(job.making) if job.making else None,
        "video": {"url": video.url, "seconds": video.duration_seconds} if video else None,
    }


@router.get("/plan/{plan_id}")
def plan_status(plan_id: str, ws: int = Depends(current_workspace_id)):
    """The storyboard once it's written: {"status": "running"} meanwhile,
    {"status": "done", "script", …} or {"status": "failed", "error"}."""
    job = _plans.get(plan_id)
    if not job or job["ws"] != ws:
        raise HTTPException(404, "This storyboard isn't here any more — write it again.")
    if job["status"] == "running":
        # what the AI has decided so far (the template and why) — the card shows it
        return {"status": "running", "style": job.get("style"), "why": job.get("why") or ""}
    if job["status"] == "failed":
        return {"status": "failed", "error": job.get("error") or "The storyboard couldn't be written."}
    return {"status": "done", **job["result"]}


class SayIn(BaseModel):
    brand_id: int
    text: str = Field(min_length=1, max_length=600)
    language: str = "Khmer"
    voice: str = "female"
    # the storyboard's template: Gemini acts the line the way the video will
    style: str = Field(default="", max_length=30)


@router.post("/say")
def say_line(
    payload: SayIn,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """One voice line read aloud (MP3), exactly as the video will say it —
    the storyboard's ▶ button, to hear a line before the video is made."""
    from app import speech

    from app import voice_clone

    brand = owned(db, Brand, payload.brand_id, ws)
    from app import gemini_keys

    tally = speech.use_workspace_key(gemini_keys.workspace_key(db, ws))  # Khmer: ours, then theirs, then Azure
    narrator, clone = voice_clone.narrator_for(brand, payload.language, payload.voice if payload.voice != "none" else "female", payload.style or None)
    if not narrator:
        raise HTTPException(503, "No voice service is set up on this server.")
    billing.require(ws, 0.0, db)
    text, _pieces = spoken_text(payload.text, voice_pronunciations(narrator, [payload.text], brand.pronunciations or []))
    try:
        mp3, _words = speech.speak_timed(text, narrator)
        if clone:
            mp3 = voice_clone.convert(mp3, clone)
    except Exception as exc:  # noqa: BLE001 — the details are for the log, not the person
        log.warning("voice preview failed (%s): %s", narrator, exc)
        raise HTTPException(502, "That line couldn't be read just now — try again in a moment.") from exc
    if not narrator.startswith("local:") and not tally["chars"]:  # the local voice and their own key cost us nothing
        billing.charge(ws, "video", len(payload.text) * speech.price_per_char(narrator), user_id=user.id, model=narrator, note="Voice preview")
    return Response(content=mp3, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


def checked_script(raw: dict, products: list[Product]) -> dict:
    """A storyboard sent back by the page, cleaned scene by scene like the
    AI's own (lengths, icons, numbers) — the person may have edited it."""
    from app.content_ai import ContentAIError

    style = raw.get("style") if raw.get("style") in STYLES else "explainer"
    _prompt, allowed, _most, _must = STYLES[style]
    names = {p.name.strip().lower(): p.name for p in products}
    scenes = [
        sc
        for sc in (_clean_scene(r, names) for r in (raw.get("scenes") or [])[: MAX_LONG_SCENES + 2] if isinstance(r, dict))
        if sc and sc["type"] in allowed
    ]
    if len(scenes) < 2:
        raise ContentAIError("The storyboard needs at least 2 scenes.")
    script = {"scenes": scenes, "style": style}
    if raw.get("language") in ("Khmer", "English"):
        script["language"] = raw["language"]
    if raw.get("ratio") in ("16:9", "9:16"):
        script["ratio"] = raw["ratio"]
    if style == "custom":
        script["look"] = clean_look(raw.get("look"), "#6366F1")
    if style == "cartoon":
        script["cast"], script["place"] = clean_cast(raw.get("cast")), _line(raw.get("place"), 400)
    if style == "reaction":
        script["cast"] = clean_animals(raw.get("cast"))
    if style in ("presenter", "podcast"):
        script["host"] = clean_host(raw.get("host"), script.get("language", "Khmer") == "Khmer")
    if style == "podcast":
        script["places"] = clean_places(raw.get("places"))
    if style == "canvas":
        script["asks"] = _clean_asks(raw.get("asks"))
        t = raw.get("theme") if isinstance(raw.get("theme"), dict) else {}
        # a look from LOOKS keeps its name and its accent (the brand's colour, or the brief's)
        script["theme"] = (
            canvas_look({"look": t["name"], "accent": t.get("a"), "accent2": t.get("b") if t["name"] == "brand" else None, "backgrounds": t.get("backgrounds"), "pictures": t.get("pictures")}, "#3B82F6")
            if t.get("name")
            else clean_theme(t)
        )
        script["scenes"] = [apply_theme(sc, script["theme"]) for sc in script["scenes"]]
    if raw.get("mood") in music_tracks():
        script["mood"] = raw["mood"]
    return script


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
        aspect_ratio="16:9" if payload.ratio == "16:9" else "9:16",  # "auto": set once the template is known
        seconds=0,
        provider="remotion",
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    threading.Thread(
        target=_make,
        args=(job.id, payload.product_id, payload.language, payload.voice, "", payload.music, payload.goal, payload.script, payload.ratio, payload.ref_url, billing.requested_model()),
        kwargs={"ref_urls": payload.ref_urls, "branded": payload.branded},
        daemon=True,
        name=f"motion-{job.id}",
    ).start()
    return _out(job, None)


def make_motion(
    brand_id: int,
    idea: str,
    language: str,
    voice: str = "female",
    product_id: int | None = None,
    caption: str = "",
    goal: str = "auto",
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
    _make(job_id, product_id, language, voice, caption, True, goal)
    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        return job.video_id if job is not None and job.status == "succeeded" else None
    finally:
        db.close()


def _make(
    job_id: int,
    product_id: int | None,
    language: str,
    voice: str = "none",
    caption: str = "",
    music: bool = True,
    goal: str = "auto",
    reviewed: dict | None = None,
    ratio: str = "9:16",
    ref_url: str = "",
    model: str = "",
    ref_urls: list[str] | None = None,
    branded: bool = True,
) -> None:
    from app.content_ai import ContentAIError
    from app.video import _ready_push

    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        billing.bind(job.workspace_id, job.user_id, model)  # the script is an AI call — written by the model they picked
        job.status = "running"
        db.commit()
        _report(job_id, stage="story")  # also marks the job as alive in this process (video._tick)
        brand = db.get(Brand, job.brand_id)
        all_products = list(db.scalars(select(Product).where(Product.brand_id == brand.id).order_by(Product.name)).all())
        # A chosen product: the script is about it alone.
        products = [p for p in all_products if p.id == product_id] or all_products if product_id is not None else all_products
        try:
            from app.learning import brand_learnings

            learned = brand_learnings(db, brand.id).get("prompt") or ""
        except Exception:  # noqa: BLE001 — a video without learnings beats no video
            learned = ""
        if not branded:  # "No logo": nothing of the brand in it
            brand, all_products, products, learned, product_id = Unbranded(brand), [], [], "", None
        try:
            _check(job_id)
            moods = list(music_tracks()) if music else []
            if reviewed:
                # The storyboard the person reviewed — made as it is.
                script = checked_script(reviewed, all_products)
                if not music:
                    script.pop("mood", None)
                elif "mood" not in script and moods:
                    script["mood"] = moods[0]
                _report(job_id, stage="pictures", style=script["style"], scenes=_board(script), look=script.get("look"))
            else:
                if goal in ("auto", "") and job.prompt.strip():
                    style, why, suggested = pick_style(job.prompt, products, product_id is not None, bool(ref_url), ratio)
                else:
                    style, why, suggested = _style_of(goal, product_id), "", None
                shape = final_ratio(ratio, style, suggested)
                _report(job_id, stage="story", style=style, why=why)
                r, g, b = brand_rgb(brand)
                ref, design = reference_shot(db, ref_url, f"#{r:02x}{g:02x}{b:02x}")
                more = attached_shots(ref_url, ref_urls) if ref else []
                for shot in more:  # what each one shows, so the storyboard knows where it belongs
                    shot["note"] = describe_screen(base64.b64decode(shot["uri"].split(",", 1)[1]))
                shots = ([ref] if ref else []) + more + (brand_screens(db, brand.id) if style in SCREEN_STYLES and branded else [])
                script = write_script(
                    brand, products, job.prompt, language, learned, moods, style, job_id=job_id, shots=shots, design=design, wide=shape == "16:9", voice=voice
                )
                script["ratio"] = shape
            _check(job_id)
            # a reviewed storyboard keeps the shape it was planned in
            script["ratio"] = script.get("ratio") or final_ratio(ratio, script["style"])
            if job.aspect_ratio != script["ratio"]:
                job.aspect_ratio = script["ratio"]
                db.commit()
            by_product, order, logo = _brand_pictures(db, brand.id) if branded else ({}, [], None)
            ref_shot = _shot_from_blob(read_media(ref_url) or b"", "reference") if ref_url else None  # screenshot 1, as planned
            more_now = attached_shots(ref_url, ref_urls) if ref_shot else []  # screenshots 2, 3… as planned
            shots_now = ([ref_shot] if ref_shot else []) + more_now + (brand_screens(db, brand.id) if script.get("style") in SCREEN_STYLES and branded else [])
            pick_pictures(script, all_products, by_product, order, product_id, shots_now)
            # Doodle notes: its hand-drawn sketches are drawn in the background while
            # the rest of the video is prepared and the voice records — joined just
            # before the render (each drawing ~20 s, and the image quota is small)
            doodling = _start_doodles(script, job, job_id) if script.get("style") == "doodle" else None
            if script.get("style") == "presenter":  # Presenter: colour pictures over the panel's words
                from app import doodle

                r, g, b = brand_rgb(brand)
                doodling = _start_doodles(script, job, job_id, style=doodle.host_picture_style(f"#{r:02x}{g:02x}{b:02x}"))
            if script.get("style") == "canvas":  # AI design: the pictures its scenes asked for
                from app import doodle

                if any(L.get("draw") and not L.get("src") for sc in script["scenes"] for L in sc.get("layers") or []):
                    _report(job_id, stage="pictures")
                    doodle.draw_pictures(script["scenes"], script.get("theme") or {}, job.workspace_id, job.user_id)
                    _check(job_id)
            if script.get("style") == "reaction":  # Reaction meme: its animals, and the pictures behind
                from app import doodle

                _report(job_id, stage="pictures")
                script["cast_images"] = doodle.draw_reaction(script, job.workspace_id, job.user_id)
                _check(job_id)
            if script.get("style") == "podcast" and script.get("places"):  # Podcast: the places its story visits
                from app import doodle

                _report(job_id, stage="pictures")
                script["place_images"] = [doodle.draw_place(p, job.workspace_id, job.user_id, style=doodle.BACKDROP_STYLE) for p in script["places"]]
                _check(job_id)
            if script.get("style") == "cartoon" and script.get("place"):  # Story · Characters: its one place
                from app import doodle

                _report(job_id, stage="pictures")
                script["place_image"] = doodle.draw_place(script["place"], job.workspace_id, job.user_id)
                _check(job_id)
            # AI design: a quick preview, the AI looks at it and fixes what looks off
            language = script.get("language") or language  # a pasted script speaks its own language
            script = review_design(brand, script, logo, "khmer" in language.lower(), job_id)
            props = build_props(brand, script, logo, "khmer" in language.lower())
            db.rollback()  # no transaction held open through the voice and render
            if not (_progress.get(job_id) or {}).get("sketches"):
                # a template video: its scene pictures for the making card, from a
                # quick silent preview made while the voice records (AI design has
                # them from its self-check already)
                threading.Thread(target=_sketch, args=(json.loads(json.dumps(props)), job_id), daemon=True, name=f"sketch-{job_id}").start()
            from app import voice_clone

            # "brand": read by the closest base voice, then turned into the brand's own
            from app import gemini_keys, speech

            speech.use_workspace_key(gemini_keys.workspace_key(db, job.workspace_id))  # Khmer: ours, then theirs, then Azure
            if script.get("style") == "presenter" and voice in ("female", "male") and script.get("host"):  # (Podcast: the host follows the voice)
                voice = script["host"]["gender"]  # the host speaks in her own voice (a male host: a male one)
            narrator, clone = voice_clone.narrator_for(brand, language, voice, script.get("style"))
            if narrator:
                add_voice(props, script, narrator, job.workspace_id, job.user_id, job_id, brand.pronunciations or [], clone)
            if doodling:
                _finish_doodles(doodling, props, job_id)
            _report(job_id, stage="render", render=0.0)
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
            resolution="1920x1080" if props.get("ratio") == "16:9" else "1080x1920",
            size_bytes=len(blob),
            source="ai",
            tag="ai-motion",
            url=url,
        )
        db.add(video)
        db.flush()
        # The Library's "How it was made" shows the brief and the storyboard.
        job.prompt = f"{job.prompt or AUTO_LABEL}\n\nREMOTION STORYBOARD:\n" + "\n".join(
            f"- {screen}" + (f"\n  🎙 {say}" if say and narrator else "") for screen, say in script_lines(script)
        )
        try:
            made = making_of(db, props, script, job_id, voice, narrator, language)
            try:
                made["remake"] = keep_props(db, props)  # so it can be drawn again in the other shape
            except Exception:  # noqa: BLE001 — the video matters more than a later re-draw
                log.exception("motion %s: props not kept for a re-draw", job_id)
            job.making = json.dumps(made, ensure_ascii=False)
        except Exception:  # noqa: BLE001 — the video matters more than its making-of
            log.exception("motion %s: making-of not saved", job_id)
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
        _progress.pop(job_id, None)
        db.close()


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
            ext = ".jpg" if "jpeg" in head else ".png" if "png" in head else ".mp3" if "audio" in head else ".bin"
            name = f"rm-{hashlib.sha1(raw).hexdigest()}{ext}"
            if db.scalar(select(MediaBlob.id).where(MediaBlob.name == name)) is None:
                try:
                    with db.begin_nested():  # another video may store the same file at the same moment
                        db.add(MediaBlob(name=name, content_type=head[5:].split(";")[0] or "application/octet-stream", size_bytes=len(raw), data=raw))
                except IntegrityError:
                    pass
            return f"blob:{head}|/media/{name}"
        if isinstance(value, dict):
            return {k: swap(v) for k, v in value.items()}
        if isinstance(value, list):
            return [swap(v) for v in value]
        return value

    return store_blob(db, json.dumps(swap(props), ensure_ascii=False).encode("utf-8"), ".json", "application/json")


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
    from app.story import _ffmpeg

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
            [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-filter_complex", graph,
             "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
             "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)],
            timeout=1200, check=False, capture_output=True, text=True, errors="replace",
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
    from app.video import _ready_push

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
            job.error = str(exc) if not isinstance(exc, subprocess.TimeoutExpired) else "Resizing took too long — try again."
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
            job.making = json.dumps({**making, "ratio": target}, ensure_ascii=False)  # and back again, if wanted
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
            job.status, job.error = "failed", "Something went wrong while resizing the video — try again."
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
    threading.Thread(target=_other_shape, args=(job.id, src.id, target, redraw), daemon=True, name=f"shape-{job.id}").start()
    return {"id": job.id, "target": target, "redraw": redraw}
