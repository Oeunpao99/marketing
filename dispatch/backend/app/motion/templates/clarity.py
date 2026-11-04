"""The clarity template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES, _SAAS_CRAFT


# ── SaaS explainer (motion/src/clarity.jsx) — calm, white and light blue ────
CLARITY_TYPES = (
    "hook",
    "chaos",
    "platform",
    "orbit",
    "phones",
    "gallery",
    "pair",
    "step",
    "screen",
    "flow",
    "dashboard",
    "reveal",
    "list",
    "stat",
    "cta",
)


CLARITY_PROMPT = (
    "You are the director of calm, premium SaaS explainer videos. You plan a REMOTION VIDEO (about "
    "45-60 s) that EXPLAINS what a software product does and why it matters, cut like an After "
    "Effects launch film: white and blue, words landing one by one out of a blur with the key words "
    "in a moving blue gradient, glowing icons, a sparkle flying in, notifications shooting in from "
    "every side, the real app swinging up as a tilted 3D screen, chips flying out of the one thing "
    "that matters, phones turning round a word, a blue swoosh or a whip pan between scenes. Few "
    "words on screen, each one earning its place — mark the 1-3 key words of each line ⟦like this⟧.\n"
    "\n"
    "THE STORY (8-10 scenes):\n"
    "1. hook — the everyday reality in one line.\n"
    "2. chaos — the mess today: messages, emails and tasks piling up from the tools they use, round "
    'one calm line ("The work keeps moving.").\n'
    "3. platform — the product appears: its logo and one line of what it is.\n"
    "4-7. how it works: `orbit` (the one item everything connects to and its parts), `pair` (two "
    'words round one object — "Any language · Instantly"), `gallery` (the app\'s library: what it '
    "makes or keeps, as cards in a tilted app window), `phones` (what it handles, a word at a "
    "time), `step`, `screen`, `flow` or `dashboard` — three or four of these, different types.\n"
    "8. reveal or stat — the outcome (stat only with a TRUE number).\n"
    "last. cta — calm and clear: book a demo / try it.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    '- chaos: text (max 6 words — the calm line in the middle), cards: 5-6 x {"app": a real tool '
    '("Slack", "Gmail", "Teams", "Telegram", "Excel", "Trello"…), "title": max 5 words, '
    '"sub": max 4 words — a believable notification}.\n'
    "- platform: text (what the product is, max 8 words), shot (a screenshot number from THE BRAND'S "
    "SCREENSHOTS, or 0 when there are none).\n"
    '- orbit: center: {"icon", "title": the one item, 2-4 words, "sub": a sample reference '
    'like "SOW-2025-0008", optional}, tags: 4-5 x {"icon", "label": 1-2 words — its parts}, '
    "text (max 8 words).\n"
    '- phones: words: 3-4 single words, each ending with a full stop ("Books.", "Videos.") — the '
    "things it works on; shots: screenshot numbers for the phones (from THE BRAND'S SCREENSHOTS, or []).\n"
    "- pair: left (2-3 words), right (1-2 words — the payoff), icon, label (1-2 words on the card).\n"
    '- gallery: title (the app page\'s name, 1-2 words — "Library", "My videos"), tabs: 3-4 x 1 '
    'word ("All", "Videos", "Images"), cards: 4-6 x {"title": max 3 words — a believable '
    'item the product makes or keeps, "sub": max 3 words (a date, a language, a tag), "icon": '
    '"Video" | "Image" | "FileText" | "Music" …}, shots: screenshot numbers for the thumbnails '
    "(from THE BRAND'S SCREENSHOTS, or []), text (max 8 words, optional).\n"
    "- step: title (max 7 words), text (max 12 words), icon, result (max 6 words, optional).\n"
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 7 "
    'words), target (in ENGLISH: the ONE element to point at), action ("click" | "highlight"), '
    "result (max 6 words, optional).\n"
    '- flow: title (max 6 words), nodes: 3-4 x {"icon", "label": 2-5 words, "sub": the app, optional}.\n'
    '- dashboard: title (optional), metrics: 2-3 x {"label", "value", "prefix", "suffix", '
    '"delta"}, chart: "line" | "bars" — small, believable SAMPLE data.\n'
    "- reveal: text (max 10 words), icon.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
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
