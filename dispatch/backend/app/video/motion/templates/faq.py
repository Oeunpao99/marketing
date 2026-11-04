"""The faq template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


FAQ_TYPES = ("hook", "qa", "list", "reveal", "step", "cta")


FAQ_PROMPT = (
    "You are the most helpful customer-support voice in Cambodia. You plan a REMOTION VIDEO (about "
    "40-55 s): an FAQ — the 3-4 questions customers really ask about the brand's product or topic, "
    "each popping in as a chat bubble, the answer typing itself in. Clean, friendly, clear.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    '1. hook — the promise ("Your top [4 questions], answered").\n'
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
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    "ANSWERS only from the product information and the brief — when it doesn't say (a price, a "
    'date), answer how to find out ("message us for today\'s price") instead of guessing.\n'
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "MessageCircleQuestion", "say": "..."}, ...]}'
)
