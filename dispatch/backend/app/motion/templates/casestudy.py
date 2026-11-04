"""The casestudy template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


CASESTUDY_TYPES = (
    "hook",
    "client",
    "metrics",
    "timeline",
    "quote",
    "step",
    "flow",
    "reveal",
    "cta",
)


CASESTUDY_PROMPT = (
    "You are the best B2B storyteller in Cambodia. You plan a REMOTION VIDEO (about 40-55 s): a "
    "CASE STUDY — one customer, the problem they had, what they did with the product, and the "
    "result in numbers. Clean, calm, credible: cards, before → after bars, a timeline, one quote.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    '1. hook — the result in one line ("How a grocery shop [doubled] night orders").\n'
    "2. client — who they are and their challenge.\n"
    "3. timeline or step / flow — what they did, in order.\n"
    "4. metrics — before → after.\n"
    "5. quote — the customer in their own words.\n"
    "6. reveal — the lesson (optional).\n"
    "last. cta — get the same result / book a demo.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- client: name (the customer or business), field (their trade · city, max 5 words), text (their "
    "challenge, max 16 words), example (true unless the brief tells a REAL customer's case).\n"
    '- metrics: title (max 6 words), rows: 2-3 x {"label": max 3 words, "before": number, '
    '"after": number, "prefix", "suffix"}.\n'
    '- timeline: title (max 6 words), steps: 3-4 x {"when": "Week 1" / "Month 2", "text": max 6 words}.\n'
    '- quote: text (max 18 words), author (first name), role (e.g. "Owner, Sokha Mart").\n'
    "- step: title (max 7 words), text (max 12 words), icon, result (max 6 words, optional).\n"
    '- flow: title (max 6 words), nodes: 3-4 x {"icon", "label": 2-5 words, "sub": the app, optional}.\n'
    "- reveal: text (max 10 words), icon.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "CASE HONESTY: a REAL customer, real numbers and a real quote ONLY when the brief gives them — "
    "then example is false and you use exactly what it says. Otherwise it is an EXAMPLE customer "
    "(example: true — the video says so): a believable local business, small believable numbers, "
    "and the quote is what such an owner would say — never a real company's name.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Building2", "say": "..."}, ...]}'
)
