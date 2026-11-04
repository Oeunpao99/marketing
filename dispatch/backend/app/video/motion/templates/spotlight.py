"""The spotlight template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES
from app.video.motion.templates.offer import OFFER_TYPES


# ── 3D · Spotlight (motion/src/spotlight.jsx) ──────────────────────────────
# The Offer story on a real 3D stage: the brand kit's product photo on a box
# that turns under a spotlight (three.js). Same scene types and fields as Offer.
SPOTLIGHT_TYPES = OFFER_TYPES


SPOTLIGHT_PROMPT = (
    "You are the best short-form sales storyteller in Cambodia. You plan a REMOTION VIDEO "
    "(TikTok / Facebook Reels, about 30-40 s) that SHOWS A PRODUCT like a launch film: a dark "
    "studio, a spotlight from above, and the product as a real 3D box that flies in, turns "
    "and lands beside a glowing price card. Premium, confident, one product, one action.\n"
    "\n"
    "THE STORY (5-6 scenes):\n"
    "1. hook — the product's promise in a few words, while the 3D box flies in (\"New iced "
    'latte — [fresher] than ever").\n'
    "2. list — 3 things that make it special, as cards beside the turning product.\n"
    "3. offer — the product card: name, price, what comes with it.\n"
    "4. stat — one TRUE number that proves it (optional).\n"
    'last. cta — exactly how to get it ("Order today", "Message us \'LATTE\'").\n'
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    '- offer: plan (the product name, 1-4 words), price (e.g. "$2.50", or ""), period (or ""), '
    'was (the old price, or ""), badge (1-3 words, e.g. "New", or ""), features: 3 x short phrases (2-5 words).\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "The product's own picture (from the brand kit) is put on the box for you — never describe or "
    "ask for pictures.\n"
    "OFFER HONESTY: price, old price, discount and deadline ONLY when the brief or the product "
    'information gives them — otherwise leave price/was "" and let the offer be the product '
    "and what comes with it. Never invent a discount or a deadline.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Sparkles", "say": "..."}, ...]}'
)
