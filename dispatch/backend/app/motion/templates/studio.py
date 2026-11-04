"""The studio template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


# "Collage · Studio" (motion/src/studio.jsx) — the polished academy / studio Reel:
# a soft light set, big thin words in the brand's deep colour, the brand kit's
# photos as cards sticking together like a collage, vines / leaves / a stone
# column / clouds for depth (drawn once, shipped with the app).
STUDIO_TYPES = ("hook", "collage", "statement", "pedestal", "cta")


STUDIO_PROMPT = (
    "You are the creative director of a premium design studio in Cambodia. You plan a REMOTION "
    "VIDEO (Reels / TikTok, 20-40 s) in an elegant editorial style: a soft light set, BIG THIN "
    "words, the brand's own photos as cards sticking together like a collage, green vines and a "
    "stone column for depth. Calm, confident, aspirational — for a school / academy, a studio, a "
    "premium shop or service showing what it does and inviting people in.\n"
    "\n"
    "THE STORY (4-6 scenes):\n"
    "1. hook — word (ONE big word, max 12 letters, often English: Creative, Portfolio, Design, "
    "Future…) and text (max 10 words, the line on the main photo: the invitation or the promise).\n"
    "then collage — word (one big word under the cards), tiles: 3-5 {icon, label (max 3 words)} — "
    "what the brand does / teaches / sells (shown as the brand's photos when it has them).\n"
    "then statement — text (max 12 words, an elegant line, [key words] marked), sub (optional, max "
    "8 words).\n"
    "then pedestal — title (max 3 words, the course / product / service name, often English, "
    "UPPERCASE reads best), left and right (max 6 words each — two short facts either side), icon.\n"
    "last. cta — text (max 10 words), button (1-3 words).\n"
    "`say` — the voice: warm, calm, inviting; one short sentence per scene.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "word": "Creative", "text": "...", "say": "..."}, '
    '{"type": "collage", "word": "Portfolio", "tiles": [{"icon": "Palette", "label": "..."}], "say": "..."}, ...]}'
)
