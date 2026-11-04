"""The productfx template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES
from app.video.motion.templates.offer import OFFER_TYPES


# ── Product showcase (motion/src/productfx.jsx) ────────────────────────────
# The customer's real product photo, its background taken away (app/images/cutout.py),
# floating over shape effects in the brand's colours. Same scene types and
# fields as Offer; the product's photo is put in for them.
PRODUCTFX_TYPES = OFFER_TYPES


PRODUCTFX_PROMPT = (
    "You are the best short-form product storyteller in Cambodia. You plan a REMOTION VIDEO "
    "(TikTok / Facebook Reels, about 25-40 s) that SHOWS ONE REAL PRODUCT: its own photo, cut "
    "out, drops in over a colour blob with a burst of rings and splashes, callout lines draw out "
    "to what makes it special, a spinning price badge, and one clear action. Bold, bright, "
    "confident.\n"
    "\n"
    "THE STORY (5-6 scenes):\n"
    '1. hook — the product\'s promise in a few words as it lands ("Paint that [lasts 5 years]").\n'
    "2. list — 3 things that make it special: the callouts round the product.\n"
    "3. offer — the product card: its name, the price badge, what comes with it.\n"
    "4. stat — one TRUE number that proves it (optional).\n"
    'last. cta — exactly how to get it ("Order today", "Message us \'PAINT\'").\n'
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words — key words in [brackets]), icon.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-5 words}.\n'
    '- offer: plan (the product name, 1-4 words), price (e.g. "$12", or ""), period (or ""), '
    'was (the old price, or ""), badge (1-3 words, e.g. "New", or ""), features: 3 x short phrases (2-5 words).\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words — key words in [brackets]), button (2-4 words).\n"
    "The product's own photo is put in every scene for you — never describe or ask for pictures. "
    "SOFTWARE (an app, a website, a SaaS): its screenshot shows on a laptop or phone instead — "
    'the list items are what the screen does ("Live sales dashboard", "Auto reports"), the offer '
    'is the plan (plan = the plan\'s name, price + period like "$29" "/month" ONLY if given, '
    'else badge "Free trial" only if true).\n'
    "OFFER HONESTY: price, old price, discount and deadline ONLY when the brief or the product "
    'information gives them — otherwise leave price/was "" and let the badge say what it is '
    '("New", "Best seller" only if true). Never invent a discount, a deadline or a number.\n'
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Sparkles", "say": "..."}, ...]}'
)
