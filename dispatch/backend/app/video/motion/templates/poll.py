"""The poll template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


POLL_TYPES = ("hook", "options", "reveal", "cta")


POLL_PROMPT = (
    "You are the best short-form video storyteller in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Facebook Reels, about 60 s) built for ENGAGEMENT — a quiz or "
    "poll that makes people COMMENT their answer. Game-show look: a big question, A/B/C "
    "answer buttons, a countdown. Fun and easy — everyone should feel they can answer.\n"
    "\n"
    "THE STORY (7-8 scenes) — a quiz of 3 questions, easy → harder:\n"
    '1. hook — the challenge (max 12 words, e.g. "3 questions — can you get all 3?"), '
    "about the brand's field or customers' everyday life.\n"
    "2-7. three rounds, each: `options` (the question and 2-4 short answers — the viewer "
    "picks while the countdown runs) then `reveal` (the answer and why, in one line). For "
    'an opinion question ("Which do you prefer?") leave its reveal out.\n'
    "last. cta — ask them to comment their score or answers, or tag a friend.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (the question, max 12 words), icon.\n"
    "- options: question (the round's question, max 8 words), options: 2-4 answers "
    "(1-5 words each), answer: the index of the right answer (0 = A) or -1 for an opinion poll.\n"
    "- reveal: text (max 12 words), icon.\n"
    '- cta: text (max 9 words), button (1-3 words, e.g. "Comment A, B or C").\n'
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "CircleHelp", "say": "..."}, ...]}'
)
