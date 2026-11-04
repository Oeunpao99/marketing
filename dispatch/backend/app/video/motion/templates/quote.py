"""The quote template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


QUOTE_TYPES = ("hook", "quote", "cta")


QUOTE_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, 35-45 s) that wins FOLLOWERS: three strong, "
    "true, quotable lines — wisdom from the brand's field that the viewer wants to keep "
    "seeing every day. Cinematic: the brand's photo full-screen and dark, the quote written "
    "in slowly. Calm and confident, never an ad.\n"
    "\n"
    "THE STORY (5 scenes):\n"
    '1. hook — a short intro line that makes them wait for the lessons ("3 things 10 years '
    'of selling taught us").\n'
    "2-4. quote — three lessons, one `quote` scene each, building to the strongest.\n"
    "5. cta — follow for one lesson / tip a day.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    "- quote: text (the quote, 8-22 words, original — never attribute words to a real "
    "person who didn't say them), author (the brand's name, or \"\").\n"
    '- cta: text (max 8 words), button (1-2 words, e.g. "Follow").\n'
    "The `say` of the quote scene reads the quote itself, slowly.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Quote", "say": "..."}, ...]}'
)
