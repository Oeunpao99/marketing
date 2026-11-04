"""The reviews template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


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
    '- reviews: title (2-3 words, e.g. "Customers say"), rating (e.g. 4.9 — only a real rating from '
    'the brief, else 0), count (e.g. "1,240 reviews" — only real, else ""), cards: 2-4 x '
    '{"name": first name, "text": their words, max 12 words, "stars": 1-5}.\n'
    '- logos: title (max 6 words, e.g. "Trusted by [200+] shops"), names: 4-8 real customer or '
    "partner names.\n"
    "- step: title (max 7 words), text (max 12 words), icon, result (max 6 words, optional).\n"
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    "REVIEW HONESTY: `reviews` cards, ratings, counts and `logos` names ONLY when the brief or the "
    "product information gives them — real words, real names, never invented, never reworded into "
    "a claim. Without them, leave those scenes out and build trust with `list`, `step` and `reveal` "
    "(what they get, how it works, a guarantee the brief states).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Star", "say": "..."}, ...]}'
)
