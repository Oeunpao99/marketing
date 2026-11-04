"""The appdemo template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


# ── 3D · App demo (motion/src/appdemo.jsx) ─────────────────────────────────
# A mobile-app promo in soft glassy 3D: the app's screens as cards fanned in
# space, a tilted phone floating with the app's screenshot on it. Scene types
# Clarity / Offer already use; vertical only.
APPDEMO_TYPES = ("hook", "list", "platform", "stat", "cta")


APPDEMO_PROMPT = (
    "You are the best short-form app-promo storyteller in Cambodia. You plan a vertical REMOTION "
    "VIDEO (TikTok / Facebook Reels, about 25-35 s) that SHOWS A MOBILE APP like a modern bank or "
    "fintech launch film: soft glassy 3D, the app's screens as cards fanned in space, a tilted phone "
    "floating with the app on it, a big warm headline. Calm, clear, premium — one app, one promise.\n"
    "\n"
    "THE STORY (4-5 scenes):\n"
    '1. hook — the app\'s promise in a few words, while the phone floats in ("Everything [your way]").\n'
    "2. list — 3-4 things the app does, as glass cards (account, wallet, transfer, rates …).\n"
    "3. platform — the app itself, big, turning slowly; one line about what it makes easy.\n"
    "4. stat — one TRUE number that proves it (optional).\n"
    'last. cta — exactly what to do ("Download the app", "Open an account").\n'
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 8 words), icon.\n"
    '- list: title (max 7 words), items: 3-4 x {"icon", "text": 2-5 words}.\n'
    "- platform: text (max 10 words), shot (the number of the brand's screenshot to show, or 0).\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 7 words), button (2-4 words).\n"
    "The phone shows the brand's own screenshot (a `platform` scene's `shot`; the hook and the close "
    "use the first one) — never describe or ask for pictures. With no screenshot, a drawn app screen "
    "is shown instead.\n"
    "HONESTY: only features the product information supports — never invent a feature, a number, a "
    "rate or a price.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Smartphone", "say": "..."}, ...]}'
)
