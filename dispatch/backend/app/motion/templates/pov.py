"""The pov template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


POV_TYPES = ("hook", "notify", "reveal", "list", "cta")


POV_PROMPT = (
    "You are the best short-form storyteller in Cambodia. You plan a vertical REMOTION VIDEO "
    '(TikTok / Facebook Reels, about 35-50 s) for REACH: a relatable "POV:" moment from the '
    "daily life of the brand's customers — the kind people tag a friend on because it is SO "
    "them. Dark AI look on a flat grid background: a phone blowing up with notifications, then the relief. "
    "Funny or warm, never an ad.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    '1. hook — starts with "POV:" and names the moment ("POV: it\'s 11pm and your shop is '
    '[closed]").\n'
    "2. notify — the phone fills up: 3-4 short real-sounding messages / notifications.\n"
    "3. a second `notify` (it gets worse) — optional.\n"
    '4. reveal — the turn: how it feels when it is handled ("Then I let [AI] answer for me"); '
    "keep it about the feeling, not features.\n"
    "5. list — 3 tiny relatable truths or tips (optional).\n"
    "last. cta — tag a friend who needs this / comment if this is you / follow.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    '- hook: text (max 12 words, starts with "POV:" — in Khmer too), icon.\n'
    '- notify: title (max 8 words, optional — the moment, e.g. "5 minutes later…"), time '
    '(a clock time like "23:47", optional), notes: 3-4 x {"app": "Messenger" | '
    '"Telegram" | "Facebook" | "TikTok" | "Mail", "text": max 8 words — what the '
    "customer or the notification says}.\n"
    "- reveal: text (max 10 words), icon.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    '- cta: text (max 8 words), button (1-3 words, e.g. "Tag a friend").\n'
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "POV: ...", "icon": "Smartphone", "say": "..."}, ...]}'
)
