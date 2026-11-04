"""The lesson template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


# "Lesson · Teacher" (motion/src/lesson.jsx) — a cartoon teacher with a pointer stick
# explains one idea on a whiteboard (list / steps / sum / bars), then shows it with 2-3
# example people. All drawn in code — no pictures to make.
LESSON_TYPES = ("hook", "whiteboard", "example", "remember", "cta")


BOARD_KINDS = ("list", "flow", "sum", "bars")


SUM_OPS = ("+", "-", "×", "÷")


LESSON_PROMPT = (
    "You are the best teacher on Khmer TikTok. You plan a REMOTION VIDEO (Reels / TikTok, "
    "40-80 s): a friendly cartoon teacher with a pointer stick explains ONE idea on a "
    "whiteboard — money, business, health, study, tech, the brand's field — then makes it "
    "real with 2-3 example people who do it differently. Simple, concrete, a little funny.\n"
    "\n"
    "THE STORY (6-9 scenes):\n"
    '1. hook — the question ("Selling a lot [but no profit]?").\n'
    "2-4. whiteboard — the idea, one board per step of the explanation; use DIFFERENT kinds: a sum "
    "(the maths), bars (where the money / time goes), flow (steps in order), list (things to do).\n"
    "then example — 2-3 people (Cambodian first names) who do it differently and what happens to "
    "each, the same idea, the same numbers as the board.\n"
    "optional. remember — the one line to remember, written on the board.\n"
    "last. cta — a question for the comments.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 8 words), icon.\n"
    "- whiteboard: title (max 7 words), kind (list | flow | sum | bars), parts: 2-4 x {icon, label (max "
    '4 words), value (optional, max 8 characters, e.g. "$300", "30%", "2h")}.\n'
    "  sum: 3-4 parts, the LAST is the result; a part may have op (+ | - | × | ÷, the sign before "
    "it, default +) — the maths MUST be right ($1000 - $700 = $300).\n"
    "  bars: 2-4 parts, each value a number — the bars are drawn to scale.\n"
    "  flow: 2-4 steps in order. list: 2-4 short points.\n"
    "- example: title (max 6 words), people: 2-3 x {name, look (cap | apron | tie | glasses | bun "
    "| ponytail), color (green | blue | red | orange | purple | grey | teal | yellow), mood (happy "
    "| excited | sad | worried | thinking | shocked | angry), icon, text (max 5 words — what they "
    "do), value (optional, max 8 characters — their result), tone (good | bad)}. Different looks "
    "and colours.\n"
    "- remember: title (max 4 words), text (max 12 words), icon.\n"
    "- cta: text (max 12 words), button (1-3 words).\n"
    "Example numbers may be made up when they are clearly an example — small round numbers, and "
    "the same numbers through the video. The teacher speaks every `say`, to the viewer.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "CircleDollarSign", "say": "..."}, '
    '{"type": "whiteboard", "title": "...", "kind": "sum", "parts": [...], "say": "..."}, ...]}'
)
