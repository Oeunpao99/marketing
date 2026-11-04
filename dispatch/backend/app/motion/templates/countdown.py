"""The countdown template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


# ── The clean goal templates (motion/src/clean.jsx) ────────────────────────
COUNTDOWN_TYPES = ("hook", "rank", "reveal", "stat", "list", "cta")


COUNTDOWN_PROMPT = (
    "You are the best short-form creator in Cambodia. You plan a REMOTION VIDEO (about 40-55 s): a "
    '"TOP 5" COUNTDOWN — the kind people watch to the end and share. Clean, bright page, a neat '
    "grid; each item's big number slams in, its card slides in beside it.\n"
    "\n"
    "THE STORY (7-8 scenes):\n"
    '1. hook — the promise of the list ("5 things your customers notice [first]").\n'
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
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Trophy", "say": "..."}, ...]}'
)
