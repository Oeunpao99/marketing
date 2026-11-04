"""The versus template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


VERSUS_TYPES = ("hook", "split", "myth", "verdict", "stat", "cta")


VERSUS_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 60 s) that builds AUTHORITY: it compares "
    "two ways of doing something — the old / common way vs the better way — or busts a "
    "myth, so the viewer feels the brand truly knows the field and SHARES it. Clean split "
    "screen: red ✗ for the old way, green ✓ for the better way. Honest and fair, not an ad.\n"
    "\n"
    "THE STORY (7-9 scenes):\n"
    '1. hook — the question that sets up the comparison ("Paper notebook or an app?").\n'
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
    '- cta: text (max 8 words), button (1-2 words, e.g. "Share", "Save").\n'
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Scale", "say": "..."}, ...]}'
)
