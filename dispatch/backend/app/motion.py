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
}


# Moods that sound right after each other when a long video changes track per chapter.
MUSIC_NEIGHBOURS = {
    "corporate": ("calm", "warm"),
    "calm": ("corporate", "warm"),
    "warm": ("calm", "corporate"),
    "upbeat": ("festive", "corporate"),
    "festive": ("upbeat", "warm"),
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
    "as បង (never អ្នក), brand / product / app names in Latin exactly as written. English: "
    "plain and punchy.\n"
    "FACTS: only what the product information supports — never invent prices, features or "
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
    "NUMBERS: you may use clearly illustrative scenarios (\"if you save $80 a month…\") "
    "but every number must be arithmetically EXACT and consistent across scenes: chart "
    "values must follow from the story (saving $80/month → after 12 months $960, after 36 "
    "months $2,880). Never invent statistics about real companies, studies or markets. "
    "Wrap the 1-3 most important words of the hook and titles in [square brackets] — they "
    "are highlighted.\n"
    "icon: exactly one name from this list: " + ", ".join(ICONS) + ".\n"
    "\n"
    "VOICE-OVER: every scene has `say` — one or two natural spoken sentences, 12-24 words, "
    "that tell the story (also shown as subtitles), each line leading into the next, like a "
    "friendly teacher telling one person a story. Same language.\n"
    "\n"
    "LANGUAGE: write in the LANGUAGE given. Khmer: everyday spoken Khmer — short common "
    "words, correct spelling, address the viewer as បង (never អ្នក), digits are fine. "
    "English: plain and punchy.\n"
    "The topic may come from a brand that sells something related — teach the topic, don't "
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
    "story, each leading into the next. Same language.\n"
    "\n"
    "LANGUAGE: write in the LANGUAGE given. Khmer: everyday spoken Khmer — short common "
    "words, correct spelling, address the viewer as បង (never អ្នក), brand / product names in "
    "Latin exactly as written. English: plain and punchy.\n"
    "FACTS: only what the product information supports or common knowledge — never invent "
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
TREND_TYPES = ("hook", "news", "list", "stat", "cta")
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
    and set scene["focus"]; a target that isn't found shows the whole screen."""
    from app.content_ai import ContentAIError, _chat

    asks = [(i, s) for i, s in enumerate(scenes) if s["type"] == "screen" and s.get("target") and 1 <= s.get("shot", 0) <= len(shots) and not s.get("focus")]
    if not asks:
        return
    used = sorted({s["shot"] for _, s in asks})
    content: list[dict] = [
        {"type": "text", "text": "Find these elements:\n" + "\n".join(f"{i}. In screenshot {s['shot']}: {s['target']}" for i, s in asks)}
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
    "showcase": (SHOWCASE_PROMPT, SHOWCASE_TYPES, 7, None),
    "custom": (CUSTOM_PROMPT, CUSTOM_TYPES, 8, None),
    "training": (TRAINING_PROMPT, TRAINING_TYPES, 12, None),
}
# Styles made for long material (a whole training): story mode up to 10 minutes.
LONG_STYLES = {"training"}
# The templates laid out for 16:9 too (motion/src/training.jsx, saas.jsx wide scenes);
# every other template is always vertical. Scenes drawn only for a tall frame are
# left out of a wide video.
WIDE_STYLES = {"training", "custom", "demo", "offer", "trend", "pov", "showcase"}
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
SCREEN_STYLES = {"custom", "demo", "showcase"}  # the stories that can show the brand's screenshots
# The templates that sell (the auto topic picks a product, not a teaching topic).
SELLING_STYLES = {"tech", "demo", "offer", "showcase"}

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
    "scenes — the video should run about {seconds} seconds (one scene is about 6 seconds)."
)


def story_seconds(text: str, length: str = "auto", cap: int = 120) -> int:
    """How long a story video should be: "60" / "120" / "300" / "600", or from
    how long the story takes to read aloud (Khmer ~11 characters a second,
    English ~2.6 words), between 30 s and ``cap`` (2 minutes; 10 for a training)."""
    if length in ("60", "120", "300", "600"):
        return min(int(length), cap)
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
    "solution": ("tech", "demo", "custom", "showcase"),
    "conversion": ("offer", "tech"),
    "teach": ("explainer",),
    "education": ("explainer", "custom"),
    "reach": ("pov", "explainer"),
    "awareness": ("trend", "explainer", "custom"),
    "authority": ("versus",),
    "engagement": ("poll",),
    "followers": ("quote",),
    "trust": ("testimonial",),
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


def _apps(value) -> list[dict]:
    """Showcase's app bubbles: [{"name"}] — the template draws each known app's icon."""
    return [{"name": _line(a.get("name"), 24)} for a in (value or []) if isinstance(a, dict) and _line(a.get("name"), 24)][:8]


def _clean_scene(raw: dict, names: dict[str, str]) -> dict | None:
    """One scene from the AI, checked and trimmed — None when it's unusable."""
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
        return hook if text else None
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
        return {"type": kind, "text": text, "author": _line(raw.get("author"), 40), "say": say} if text else None
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
    "roll": (("lead", 24), ("text", 80), ("say", 300)),
    "table": (("title", 40), ("say", 300)),
    "board": (("title", 80), ("say", 300)),
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
    if style in SCREEN_STYLES:
        extra += _shots_prompt(shots or [])
        if design:
            extra += _design_prompt(design)
        if not shots:
            allowed = tuple(t for t in allowed if t != "screen")
    story = bool(seconds and idea.strip())
    if story:
        count = max(5, min(MAX_LONG_SCENES if style in LONG_STYLES else MAX_STORY_SCENES, round(seconds / 6.5)))
        most = count  # the person's story sets the length, not the template
        extra += STORY_RULES.format(count=count, seconds=seconds)
    raw = _chat(
        [
            {"role": "system", "content": prompt + extra},
            {
                "role": "user",
                "content": f"BRAND: {brand.name}\nLANGUAGE: {language}\nPRODUCTS:\n{facts}\n\n"
                + (
                    f"THE VIDEO IS ABOUT: {idea.strip()[: 12000 if story else 4000]}"
                    if idea.strip()
                    else _auto_topic(products, style)
                ),
            },
        ],
        model,
        max_tokens=(32000 if style in LONG_STYLES else 16000) if story else 9000,
        # A storyboard follows the template's recipe — it doesn't need long
        # reasoning; the default (medium) took 1-2 minutes on gpt-5-mini. The
        # Khmer editor pass after it still runs at high effort.
        effort="low",
    )
    names = {p.name.strip().lower(): p.name for p in products}
    scenes = [
        s
        for s in (_clean_scene(r, names) for r in (raw.get("scenes") or []) if isinstance(r, dict))
        if s and s["type"] in allowed
    ][: ((MAX_LONG_SCENES if style in LONG_STYLES else MAX_STORY_SCENES) + 2) if story else 14]
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
    if not hooks or not ctas or not middle or (must and not any(s["type"] == must for s in middle)):
        raise ContentAIError("The AI didn't return a usable storyboard — try again.")
    script = {"scenes": [hooks[0], *middle, ctas[0]], "style": style}
    if style == "custom":
        r, g, b = accent_for(brand.slug)
        script["look"] = clean_look(raw.get("look"), f"#{r:02x}{g:02x}{b:02x}")
        if design:  # their own app's design wins over the AI's guess
            script["look"] = {**script["look"], **design["look"]}
    if shots:
        script["scenes"] = [sc for sc in script["scenes"] if sc["type"] != "screen" or sc["shot"] <= len(shots)]
        locate_targets(script["scenes"], shots)
    if moods:
        script["mood"] = raw.get("mood") if raw.get("mood") in moods else moods[0]
    _report(job_id, stage="polish" if khmer else "pictures", scenes=_board(script), look=script.get("look"))

    if khmer:
        # Every line — on screen and spoken — through the native editor
        # (correct words, natural phrasing, names untouched), put back in place.
        slots: list[tuple[dict, str, int]] = []
        for s in script["scenes"]:
            slots += [(s, key, n) for key, n in _TEXT_FIELDS[s["type"]]]
            slots += [(m, "text", 140) for m in s.get("messages", [])]
            slots += [(i, "text", 80) for i in s.get("items", [])]
            slots += [(p, "name", 40) for p in (s.get("left"), s.get("right")) if p and "name" in p]
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
        # Story mode: the voice lines are the person's own sentences — kept.
        slots = [x for x in slots if x[0][x[1]] and x[1] != "say"]  # the voice lines: voice_script_khmer
        fixed = _polish_khmer(
            [obj[key] for obj, key, _ in slots],
            model,
            voice_examples=brand.voice_examples or "",
            khmer_only="english" not in (brand.lang or "").lower(),
            keep=[brand.name, *(p.name for p in products)],
            # Story mode: only the short on-screen words are left to edit (the
            # voice lines are the person's own) — the quick pass; at high effort
            # it took a minute and more, while the person waited on the plan.
            effort="low" if story else "high",
        )
        for (obj, key, n), value in zip(slots, fixed):
            obj[key] = _line(_fix_khmer_punctuation(value), n)
        # every spoken line rewritten to be heard, not read (story mode: a light touch)
        spoken = [s for s in script["scenes"] if s.get("say")]
        for s, line in zip(
            spoken,
            voice_script_khmer([s["say"] for s in spoken], model, [brand.name, *(p.name for p in products)], brand.voice_examples or "", own=story),
        ):
            s["say"] = line
        _report(job_id, stage="pictures", scenes=_board(script))
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
        elif s["type"] == "apps":
            screen = (s.get("title") or "Apps") + " — " + ", ".join(a["name"] for a in s["apps"])
        elif s["type"] == "roll":
            screen = f"{s.get('lead', '')} " + " / ".join(s["words"]) + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "table":
            screen = (s.get("title") or "Table") + " — " + " | ".join(s["columns"]) + f" ({len(s['rows'])} rows)"
        elif s["type"] == "board":
            screen = (s.get("title") or "Board") + " — " + " → ".join(c["name"] for c in s["columns"])
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
VOICE_SCRIPT_PROMPT = (
    "You are a Cambodian voice-over director and scriptwriter. The lines below are read aloud by "
    "an AI voice over a short video — viewers HEAR them, they don't read them. Rewrite each line "
    "so it sounds like a real Cambodian presenter talking to one person on camera — natural, "
    "warm, alive — never like written text read out.\n"
    "\n"
    "RULES:\n"
    "1. Spoken Khmer, not written Khmer: the words a Phnom Penh presenter actually says. Address "
    "the viewer as បង. Drop formal, bookish constructions (stacked ការ… nouns, នៃ, ដែលជា, "
    "ក្នុងការ…, long noun chains) for the plain spoken way of saying it.\n"
    "2. It is a STORY told by one person, not a list of facts: sentences that flow into each "
    "other with spoken connectors, mostly 8-18 words, 1-3 per line — mix a longer sentence with "
    "a short punchy one. Never a run of tiny fragments; that sounds like a robot.\n"
    "3. Write it the way good Khmer is written: words joined, a SPACE only where a written "
    "sentence naturally pauses — between clauses, about every 6-12 words — never every few "
    "words. End every sentence with ។, use ! only where the voice should lift with energy and ? "
    "only for a real question (\"…មែនទេ?\").\n"
    "4. Spoken connectors and particles where they fit naturally (ហើយ, ប៉ុន្តែ, ព្រោះ, អ៊ីចឹង, "
    "ណា, ហ្នឹង) — not in every line, never forced.\n"
    "5. The lines are ONE narration: each leads into the next; no line repeats the previous one.\n"
    "6. Keep every fact, number, price, brand and product name EXACTLY (numbers may stay as "
    "digits — they are spoken correctly later). Never add claims. No brackets, slashes, emoji, "
    "lists or abbreviations.\n"
    "7. Correct Khmer — real words only, and check each word MEANS what you intend (e.g. "
    "\"important\" is សំខាន់, never ចាំ). When unsure, keep the original word.\n"
    "8. Keep every idea of the original line and add NONE — shorten the words, never drop a "
    "point, never add advice or a sentence that wasn't there.\n"
    "9. Say បង at most once or twice in the whole narration — never start every line with it, "
    "and never \"បង,\" with a comma.\n"
    "10. About the same length as the original (±20%).\n"
    'Return JSON {"lines": [...]} — the same number of lines, in the same order.'
)
VOICE_SCRIPT_LIGHT = (
    "\n\nTHESE ARE THE PERSON'S OWN SCRIPT LINES: keep their meaning, their order and as much of "
    "their wording as you can — only make them speakable (shorter sentences, marked breaths, a "
    "formal word swapped for the spoken one where it reads stiffly)."
)


def voice_script_khmer(lines: list[str], model: str, keep: list[str], voice_examples: str = "", own: bool = False) -> list[str]:
    """The Khmer voice lines rewritten to be heard — spoken words, short
    sentences, breaths marked (VOICE_SCRIPT_PROMPT). Best effort: on any
    failure the lines are kept as they were."""
    from app.content_ai import ContentAIError, _chat, _fix_khmer_punctuation

    if not lines:
        return lines
    system = VOICE_SCRIPT_PROMPT + (VOICE_SCRIPT_LIGHT if own else "")
    if keep:
        system += "\n\nNames to copy EXACTLY as written: " + ", ".join(k for k in keep if k)
    if voice_examples.strip():
        system += "\n\nHow this brand talks (its real posts — tone only):\n---\n" + voice_examples.strip()[:2000] + "\n---"
    try:
        out = _chat(
            [{"role": "system", "content": system}, {"role": "user", "content": json.dumps({"lines": lines}, ensure_ascii=False)}],
            model,
            max_tokens=24000,
            effort="high",  # meaning and spelling matter more than speed here
        )
    except ContentAIError:
        return lines
    new = out.get("lines") if isinstance(out, dict) else None
    if not (isinstance(new, list) and len(new) == len(lines) and all(isinstance(x, str) and x.strip() for x in new)):
        return lines
    return [_line(_fix_khmer_punctuation(x.strip()), 300) for x in new]


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
        if s["type"] == "screen":
            shot = shots[s["shot"] - 1]
            s["image"], s["imgW"], s["imgH"] = shot["uri"], shot["w"], shot["h"]
        elif s["type"] == "product":
            s["image"] = by_product.get(ids.get(s.get("product") or "")) or main
        elif s["type"] in ("hook", "cta", "offer") or script.get("style") == "quote":
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
        scene = {k: v for k, v in s.items() if k not in ("say", "product", "target", "shot")}
        for key in ("text", "title", "label", "button", "myth", "fact", "question", "author", "name", "business", "before", "after", "headline", "tag", "result", "badge", "plan", "period", "sub"):
            if scene.get(key):
                scene[key] = t(scene[key])
        if s.get("say"):
            scene["caption"] = t(s["say"]).replace("⟦", "").replace("⟧", "")  # the subtitles
        for side in ("left", "right"):
            if scene.get(side):
                if "points" in scene[side]:  # split: a way and its points
                    scene[side] = {**scene[side], "label": t(scene[side]["label"]), "points": [t(x) for x in scene[side]["points"]]}
                else:
                    scene[side] = {**scene[side], "name": t(scene[side]["name"])}
        if "series" in scene:
            scene["series"] = [{**ser, "name": t(ser["name"])} for ser in scene["series"]]
        if "messages" in scene:
            scene["messages"] = [{**m, "text": t(m["text"])} for m in scene["messages"]]
        if "items" in scene:
            scene["items"] = [{**i, "text": t(i["text"])} for i in scene["items"]]
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
        if s["type"] == "step":
            scene["n"] = sum(1 for x in scenes if x["type"] == "step") + 1  # STEP 1, 2, 3
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
    if script.get("ratio") == "16:9" and props["style"] in WIDE_STYLES:
        props["ratio"] = "16:9"
    library = music_tracks()
    tracks = library.get(script.get("mood") or "")
    if tracks:
        props["music"] = random.choice(tracks)  # a file under public/ — the template mixes it in
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
    if kind == "table":
        return 3.6 + 0.3 * min(6, len(scene.get("rows") or []))
    if kind == "roll":
        return 2.4 + 0.6 * min(5, len(scene.get("words") or []))
    if kind == "checklist":
        return 1.8 + 1.0 * min(6, len(scene.get("checks") or []))
    if kind == "recap":
        return 2.0 + 1.0 * min(5, len(scene.get("points") or []))
    return {"cta": 3.8, "product": 3.6, "chart": 5.2, "compare": 4.2, "character": 3.8, "myth": 5.0, "quote": 5.6, "beforeafter": 5.4, "result": 4.2, "review": 6.0, "customer": 4.4, "news": 5.0, "step": 4.8, "offer": 5.6, "screen": 5.0, "dashboard": 5.2, "chapter": 3.2, "board": 4.6}.get(kind, 3.4)


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
    """The brand's pronunciation list — plus, for the local Khmer voice (which
    can't read Latin letters), every other English / brand word in ``says``
    written in Khmer letters by the AI (local_voice.transliterate)."""
    from app import local_voice

    rules = list(pronunciations or [])
    if not voice.startswith(local_voice.PREFIX):
        return rules
    known = {(p.get("word") or "").strip().lower() for p in rules}
    latin = sorted({w for say in says for w in local_voice.LATIN_WORD.findall(say or "") if w.lower() not in known})
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
) -> int:
    """Each scene's spoken line, read by ``voice``: the MP3 goes into the scene
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
                ahead[n] = pool.submit(lambda t: (t, speech.speak_timed(t[0], voice)), spoken_text(say, pronunciations))

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
            path.write_bytes(mp3)
            _has_audio, duration = _probe(str(path))
            if duration <= 0:
                continue
            scene["audio"] = "data:audio/mpeg;base64," + base64.b64encode(mp3).decode()
            # The line starts once the scene has slid in + 6 frames breathing room (MotionPost.jsx).
            lead = (TRANSITION_S if n else 0.0) + 0.2
            scene["seconds"] = round(max(default_seconds(scene), lead + duration + VOICE_TAIL), 2)
            scene["voiceSeconds"] = round(duration, 2)  # subtitles follow the voice
            if words:
                scene["words"] = words  # …word by word, when Azure said when each word is
            mark(n, voice="done", seconds=round(duration, 1))
            spoken += len(say)
    if pool:
        pool.shutdown(wait=False, cancel_futures=True)
    new_failures = speech.GEMINI_FAILURES[failed_before:]
    if new_failures:
        # say it on the card: the voice that read it isn't the one chosen
        _report(job_id, voice_note=f"Gemini voice failed ({new_failures[-1]}) — Azure read {len(new_failures)} line(s) instead")
    del speech.GEMINI_FAILURES[:-50]
    if spoken and not local:
        billing.charge(
            ws, "video", spoken * speech.price_per_char(voice), user_id=user_id, model=voice, note="Remotion video voice-over", job_id=job_id
        )
    return spoken


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
    elif t == "apps":
        text = s.get("title") or " · ".join(a.get("name", "") for a in s.get("apps") or [])
    elif t == "roll":
        text = f"{s.get('lead', '')} " + " / ".join(s.get("words") or [])
    elif t in ("table", "board"):
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


def render(props: dict, job_id: int | None = None) -> bytes:
    """The MP4 for ``props`` — Remotion, run as a subprocess. Raises
    RuntimeError, or Stopped when the person pressed Stop."""
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


# ── API ───────────────────────────────────────────────────────────────────
class MotionIn(BaseModel):
    brand_id: int
    # Long prompts are fine (e.g. one written for a filmed video) — the AI
    # reads the topic out of the first part of it. Empty: "Make one for me" —
    # the AI picks the topic itself (write_script).
    idea: str = Field(default="", max_length=20000)
    product_id: int | None = None
    language: str = "Khmer"
    # Narrator: "female", "male", or "none" for a silent video.
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


# ── The director: Story "Auto" reads the brief and picks the template ──────
# What each template is for, in the words the director chooses by.
TEMPLATE_GUIDE = {
    "custom": "SaaS, software, an app, an AI tool, a platform (Power Apps, a CRM…), B2B tech — product UI, dashboards, flows, the brand's screenshots",
    "demo": "showing HOW to use a software product, step by step in an app window",
    "showcase": "a bright, polished promo / launch video for a SaaS or app — the tools it connects, its table and board views, who it is for",
    "training": "a team training, an internal presentation, a workshop, a lesson or a long talk with parts / sections — chapters, key points, checklists, recap",
    "explainer": "a story with people — characters with feelings (stick figures), everyday life, money and life lessons, a tale that teaches",
    "testimonial": "a customer's story or case study — who they are, before → after, their result",
    "tech": "selling a product or service of a shop / business — the problem, the product working, proof, buy now",
    "offer": "a promotion, a price, a discount, a package — one clear offer and action",
    "versus": "a comparison — old way vs new way, option A vs B, myths vs facts",
    "poll": "a quiz or questions for the audience to answer in the comments",
    "quote": "inspiring quotes or short lessons worth following",
    "trend": "news — what's new in AI / tech / the industry and what it means",
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


def _build_plan(payload: "PlanIn", ws: int, user_id: int) -> dict:
    """The storyboard itself — the slow part (several AI calls)."""
    db = SessionLocal()
    try:
        brand = db.get(Brand, payload.brand_id)
        all_products = list(db.scalars(select(Product).where(Product.brand_id == brand.id).order_by(Product.name)).all())
        products = [p for p in all_products if p.id == payload.product_id] or all_products
        style, why, suggested = (
            pick_style(payload.idea, products, payload.product_id is not None, bool(payload.ref_url), payload.ratio)
            if payload.goal in ("auto", "")
            else (_style_of(payload.goal, payload.product_id), "", None)
        )
        shape = final_ratio(payload.ratio, style, suggested)
        seconds = story_seconds(payload.idea, payload.length, 600 if style in LONG_STYLES else 120)
        r, g, b = accent_for(brand.slug)
        ref, design = reference_shot(db, payload.ref_url, f"#{r:02x}{g:02x}{b:02x}")
        shots = ([ref] if ref else []) + (brand_screens(db, brand.id) if style in SCREEN_STYLES else [])
        db.rollback()  # no transaction held open through the AI calls
        script = write_script(
            brand, products, payload.idea, payload.language, "", list(music_tracks()) if payload.music else [], style,
            seconds=seconds, shots=shots, design=design, wide=shape == "16:9",
        )
        script["ratio"] = shape
        return {"script": script, "target_seconds": seconds, "estimate_seconds": estimate_seconds(script), "why": why}
    finally:
        db.close()


def _run_plan(plan_id: str, payload: "PlanIn", ws: int, user_id: int) -> None:
    from app.content_ai import ContentAIError

    billing.bind(ws, user_id)  # the AI calls in this thread are charged to them
    try:
        _plans[plan_id].update(status="done", result=_build_plan(payload, ws, user_id))
    except ContentAIError as exc:
        _plans[plan_id].update(status="failed", error=str(exc))
    except Exception as exc:  # noqa: BLE001 — the page shows it instead of waiting forever
        log.exception("storyboard %s failed", plan_id)
        _plans[plan_id].update(status="failed", error=f"The storyboard couldn't be written — {exc}")


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
    threading.Thread(target=_run_plan, args=(plan_id, payload, ws, user.id), daemon=True, name=f"plan-{plan_id[:8]}").start()
    return {"plan_id": plan_id, "status": "running"}


@router.get("/plan/{plan_id}")
def plan_status(plan_id: str, ws: int = Depends(current_workspace_id)):
    """The storyboard once it's written: {"status": "running"} meanwhile,
    {"status": "done", "script", …} or {"status": "failed", "error"}."""
    job = _plans.get(plan_id)
    if not job or job["ws"] != ws:
        raise HTTPException(404, "This storyboard isn't here any more — write it again.")
    if job["status"] == "running":
        return {"status": "running"}
    if job["status"] == "failed":
        return {"status": "failed", "error": job.get("error") or "The storyboard couldn't be written."}
    return {"status": "done", **job["result"]}


class SayIn(BaseModel):
    brand_id: int
    text: str = Field(min_length=1, max_length=600)
    language: str = "Khmer"
    voice: str = "female"


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

    brand = owned(db, Brand, payload.brand_id, ws)
    narrator = speech.voice_for(payload.language, payload.voice if payload.voice != "none" else "female") if speech.ready() else None
    if not narrator:
        raise HTTPException(503, "No voice service is set up on this server.")
    billing.require(ws, 0.0, db)
    text, _pieces = spoken_text(payload.text, voice_pronunciations(narrator, [payload.text], brand.pronunciations or []))
    try:
        mp3, _words = speech.speak_timed(text, narrator)
    except Exception as exc:  # noqa: BLE001 — the voice service's own message
        raise HTTPException(502, f"The voice couldn't be made — {exc}") from exc
    if not narrator.startswith("local:"):  # the local Khmer voice costs nothing
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
    if raw.get("ratio") in ("16:9", "9:16"):
        script["ratio"] = raw["ratio"]
    if style == "custom":
        script["look"] = clean_look(raw.get("look"), "#6366F1")
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
        args=(job.id, payload.product_id, payload.language, payload.voice, "", payload.music, payload.goal, payload.script, payload.ratio, payload.ref_url),
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
) -> None:
    from app.content_ai import ContentAIError
    from app.video import _ready_push

    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        billing.bind(job.workspace_id, job.user_id)  # the script is an AI call
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
                r, g, b = accent_for(brand.slug)
                ref, design = reference_shot(db, ref_url, f"#{r:02x}{g:02x}{b:02x}")
                shots = ([ref] if ref else []) + (brand_screens(db, brand.id) if style in SCREEN_STYLES else [])
                script = write_script(
                    brand, products, job.prompt, language, learned, moods, style, job_id=job_id, shots=shots, design=design, wide=shape == "16:9"
                )
                script["ratio"] = shape
            _check(job_id)
            # a reviewed storyboard keeps the shape it was planned in
            script["ratio"] = script.get("ratio") or final_ratio(ratio, script["style"])
            if job.aspect_ratio != script["ratio"]:
                job.aspect_ratio = script["ratio"]
                db.commit()
            by_product, order, logo = _brand_pictures(db, brand.id)
            ref_shot = _shot_from_blob(read_media(ref_url) or b"", "reference") if ref_url else None  # screenshot 1, as planned
            shots_now = ([ref_shot] if ref_shot else []) + (brand_screens(db, brand.id) if script.get("style") in SCREEN_STYLES else [])
            pick_pictures(script, all_products, by_product, order, product_id, shots_now)
            props = build_props(brand, script, logo, "khmer" in language.lower())
            db.rollback()  # no transaction held open through the voice and render
            from app import speech

            narrator = speech.voice_for(language, voice, script.get("style")) if speech.ready() else None
            if narrator:
                add_voice(props, script, narrator, job.workspace_id, job.user_id, job_id, brand.pronunciations or [])
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
