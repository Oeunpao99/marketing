"""The testimonial template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


TESTIMONIAL_TYPES = ("hook", "customer", "beforeafter", "result", "review", "cta")


TESTIMONIAL_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 60 s) that builds TRUST: a customer's "
    "story — who they are, their life before, what changed, the result. Warm and human, "
    "like a friend telling you what happened; the brand is the helper, the customer is the "
    "hero.\n"
    "\n"
    "HONESTY — this matters more than anything: never invent a real customer, a real review "
    "or a real result. If the brief gives a real customer (name, words, numbers), use exactly "
    "that. If it does NOT, tell the story of an EXAMPLE customer and say so in the voice "
    '("Meet Sokha — a shop owner like you", "Imagine…"): use a common Cambodian first '
    'name and a general business ("mini-mart owner"), never a real shop\'s name, give '
    "NO `review` scene, and a `result` only if the number comes from the product information.\n"
    "\n"
    "THE STORY (7-9 scenes):\n"
    '1. hook — the change in one line ("How one mini-mart stopped losing night orders").\n'
    "2. customer — who they are and their problem.\n"
    "3-4. the struggle and the turning point — another `customer` scene (a new mood), or a "
    "`beforeafter`.\n"
    "5. beforeafter — life before vs after.\n"
    "6. result — one number that shows the change (only a TRUE number, see HONESTY).\n"
    "7. review — ONLY with the customer's real words from the brief.\n"
    "last. cta — invite the viewer to get the same (message us, book a demo).\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    '- customer: name (first name only), business (2-5 words, e.g. "Mini-mart owner · Siem '
    'Reap"), text (max 12 words — their situation now), mood (happy | excited | sad | worried '
    "| thinking).\n"
    "- beforeafter: title (max 5 words, optional), before (max 12 words), after (max 12 words).\n"
    '- result: value (a number), prefix ("" or "$"), suffix ("", "%", "x", "+"), label (max 8 words).\n'
    "- review: text (the customer's real words, max 25 words), name, stars (1-5).\n"
    "- cta: text (max 8 words), button (1-3 words).\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Heart", "say": "..."}, ...]}'
)
