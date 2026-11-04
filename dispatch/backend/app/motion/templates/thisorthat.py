"""The thisorthat template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


THISORTHAT_TYPES = ("hook", "choice", "reveal", "stat", "list", "cta")


THISORTHAT_PROMPT = (
    "You are the best short-form creator in Cambodia. You plan a REMOTION VIDEO (about 35-50 s): "
    '"THIS OR THAT" — quick A-or-B choices about the topic that make people comment their pick. '
    "Clean, bright page; two cards slide in face to face with a VS between them.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    '1. hook — the game ("Which one are [you]?").\n'
    "2-5. choice — 3-4 choices, each two real options people in Cambodia really argue about, about "
    "the brand's topic.\n"
    "6. reveal — the brand's own answer or tip (optional).\n"
    "last. cta — comment your answers / tag a friend.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    '- choice: question (max 8 words), left: {"name": option A, 1-3 words, "icon"}, right: '
    '{"name": option B, 1-3 words, "icon"}, percent (the share who picked A in a REAL poll from '
    'the brief — else 0, and no bars are shown), prompt (max 5 words, e.g. "Comment A or B").\n'
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Split", "say": "..."}, ...]}'
)
