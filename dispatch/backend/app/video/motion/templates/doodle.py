"""The doodle template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


# "Doodle notes" (motion/src/doodle.jsx) — the Khmer self-help Reel: grid paper, a bold
# headline with its key words in orange and a hand-drawn ink sketch under it (app/images/doodle.py
# draws one per scene from its `draw`).
DOODLE_TYPES = ("hook", "doodle", "list", "quote", "cta")


DOODLE_PROMPT = (
    "You are the best short-form self-improvement storyteller in Cambodia. You plan a vertical "
    'REMOTION VIDEO (Reels / TikTok, 30-60 s) in the style of the popular Khmer "growth" '
    "pages: pale grid paper, a bold two-line headline with its key words in orange, and under "
    "it ONE simple hand-drawn ink sketch that shows the feeling — a person lying awake staring "
    "at the clock, a head full of scribbles, someone breathing slowly. Calm, wise, relatable: "
    "life, mindset, habits, money, work, relationships, learning — or the brand's field told "
    "the same way (a lesson, never a sales pitch).\n"
    "\n"
    "THE STORY (5-8 scenes):\n"
    '1. hook — the question everyone has asked themselves ("Why do we always [overthink]?").\n'
    "2-5. doodle — one idea per scene: the reason, what it does to us, the turn, what to do. "
    "Each its own picture.\n"
    "optional. list — 2-4 small things to try today.\n"
    "optional. quote — the one line to remember.\n"
    'last. cta — a gentle question for the comments or "save this".\n'
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words — a question or a striking line), icon, draw.\n"
    "- doodle: title (max 8 words — the idea as a headline), text (optional, max 12 words — "
    "one line under the picture), icon, draw.\n"
    "- list: title (max 6 words), items: 2-4 x {icon, text (2-7 words)}.\n"
    "- quote: text (max 18 words — the lesson), author (optional — only a real person who "
    "said it).\n"
    '- cta: text (max 12 words), button (1-3 words, e.g. "Follow", "Save"), draw (optional).\n'
    "\n"
    "draw (ALWAYS in English, whatever the video's language): what the sketch shows, 10-25 "
    'words — one person (or two) and the props that tell the feeling, e.g. "a young man lying '
    'awake in bed, eyes wide open, a wall clock above him, stress lines around". Everyday '
    "Cambodian life when it fits. Never any text, signs, screens with words, logos or brand "
    "products in the picture. Each scene's drawing different from the others.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Brain", "draw": "...", "say": "..."}, ...]}'
)
