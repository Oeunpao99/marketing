"""Prompt pieces several templates share: plain English, the common rules (icons, voice-over, language), SaaS craft, the explainer base.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.common import ICONS


# How an English video talks: viewers in Cambodia often read English at A2-B1
# (the user, 2026-10-16: "the AI seems too high level, hard to understand").
# Used by every story prompt's LANGUAGE line; a pasted story is still followed
# as written (story mode).
_PLAIN_ENGLISH = (
    "English: PLAIN ENGLISH for learners (CEFR A2-B1) — someone who learned English at school "
    "must understand every word the first time. Short sentences (max 12 words), one idea each. "
    'Common everyday words ("use", "help", "fast", "easy", "save time"), present '
    'tense, "you" and "we". No idioms, slang or phrasal-verb tricks ("game-changer", '
    '"level up", "take it to the next level", "hit the ground running"), no buzzwords '
    "(leverage, seamless, streamline, empower, unlock, elevate, robust, cutting-edge, "
    "revolutionize, synergy, next-gen, effortless), no long noun stacks. A technical word only "
    "when needed — then say what it means in simple words. Friendly and clear beats clever.\n"
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


# How SaaS product videos are made — shared by "Designed for you" and Product demo.
_SAAS_CRAFT = (
    "HOW GREAT SAAS VIDEOS WORK (follow it):\n"
    "1. PRODUCT-LED — the product (or the tool the brief is about) is the hero. At least HALF of "
    "the scenes SHOW it working (screen, step, flow, dashboard) instead of talking about it.\n"
    "2. ONE CLEAR TRANSFORMATION — a specific painful moment before, a specific outcome after. "
    'Name the job to be done ("approve leave in 2 minutes"), never a vague promise ("boost '
    'productivity").\n'
    "3. RHYTHM — never two scenes of the same type in a row (steps excepted); alternate a busy "
    "scene (screen, flow, dashboard, notify) with a light one (hook, reveal, stat); one idea per "
    "scene.\n"
    '4. COPY THAT READS LIKE SOFTWARE — titles are short labels, like UI ("Auto-approve rules", '
    '"Live leave calendar"): a verb or a concrete noun, specific numbers and times, max 7 words '
    "on screen. The voice explains; the screen shows. NEVER use: innovative, seamless, "
    "revolutionary, cutting-edge, game-changer, unlock, leverage, empower, synergy, solution(s), "
    "next-level, all-in-one.\n"
    "5. REAL NAMES — the real product, platform and UI names from the brief and the product "
    'information ("Power Apps form", "approval in Teams", "SharePoint list"), never generic '
    '"the app" when a name is known.\n'
)
