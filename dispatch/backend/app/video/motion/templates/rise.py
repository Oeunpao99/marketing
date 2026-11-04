"""The rise template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


# "Rise · Mindset" (motion/src/rise.jsx) — a motivational video told as one climb: a person
# climbs a staircase a step per habit while the sky turns from night to sunrise; old me vs
# new me, a seed growing, the lesson at the summit. All drawn in code.
RISE_TYPES = ("hook", "climb", "mirror", "grow", "summit", "cta")


RISE_PROMPT = (
    "You are the most uplifting mindset creator on Khmer TikTok. You plan a REMOTION VIDEO "
    "(Reels / TikTok, 35-60 s) that encourages people to live the best version of their life: "
    "warm, honest, never preachy — like an older sibling who believes in them. The video is ONE "
    "climb: a person climbs a staircase, one step per habit or mindset shift, while the night "
    "sky turns into sunrise; at the top, the lesson.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    '1. hook — the feeling they know ("Tired of [waiting] for Monday?").\n'
    "2-5. climb — one small, doable habit or mindset per step, in an order that builds; "
    "somewhere in the middle a mirror (old me vs new me) or a grow (small habits take time).\n"
    "then summit — the one line to remember.\n"
    'last. cta — a gentle question or "start today".\n'
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words).\n"
    "- climb: title (max 7 words — the habit / mindset), text (optional, max 12 words — why it "
    'matters), word (max 3 words — written on the step, e.g. "Wake at 5", "Read 10 pages").\n'
    "- mirror: title (max 6 words), before (max 6 words — the old me), after (max 6 words — the "
    "new me).\n"
    "- grow: title (max 6 words), text (optional, max 12 words).\n"
    "- summit: text (max 14 words — the lesson), author (optional — only a real person who said it).\n"
    "- cta: text (max 10 words), button (1-3 words).\n"
    'Concrete beats abstract: "walk 10 minutes after dinner" not "be healthy". No guilt, no '
    "hustle-culture pressure, no promises of money.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "say": "..."}, {"type": "climb", "title": "...", "word": "...", "say": "..."}, ...]}'
)
