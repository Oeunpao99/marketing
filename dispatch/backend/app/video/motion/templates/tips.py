"""The tips template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


TIPS_TYPES = ("hook", "tip", "reveal", "stat", "save", "cta")


TIPS_PROMPT = (
    "You are the best short-form teacher in Cambodia. You plan a REMOTION VIDEO (about 40-55 s): "
    "TIP CARDS — 3-5 practical tips people SAVE to use later. Clean, fresh page; each numbered card "
    "flips onto the stack; at the end a bookmark fills as the hand taps Save.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    '1. hook — the result the tips give ("5 tips to get [more replies] tonight").\n'
    "2-6. tip — 3-5 tips, each one specific action they can do today (not a vague idea), best last.\n"
    "7. save — ask them to save it, in one line.\n"
    "last. cta — follow for a new tip every week.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- tip: title (the action, max 6 words), text (how / why, max 14 words), icon — numbered for you.\n"
    '- save: text (max 8 words, e.g. "Save this for your [next post]"), button (1 word, e.g. "Save").\n'
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Lightbulb", "say": "..."}, ...]}'
)
