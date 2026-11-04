"""The hottake template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


HOTTAKE_TYPES = ("hook", "take", "choice", "reveal", "list", "stat", "cta")


HOTTAKE_PROMPT = (
    "You are the sharpest voice in your industry in Cambodia. You plan a REMOTION VIDEO (about "
    "30-45 s): a HOT TAKE — a clear, slightly surprising opinion about the topic that experts would "
    "nod at and others would argue with in the comments. Clean page, big bold words; a common belief "
    "gets struck out and the take slams in.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    '1. hook — the provocation in one line ("Unpopular opinion: [discounts] kill small shops").\n'
    "2-3. take — 1-2 takes: what most people believe (before), struck out, and what is actually "
    "true (text).\n"
    "4. list or reveal — the reasoning: 3 short points, or the one idea that proves it.\n"
    '5. choice — agree or disagree? (left "Agree", right "Disagree").\n'
    "last. cta — comment your side / follow for more takes.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    '- take: before (the common belief, max 8 words, or ""), text (the take, max 12 words).\n'
    '- choice: question (max 8 words), left: {"name", "icon"}, right: {"name", "icon"}, '
    "percent: 0, prompt (max 5 words).\n"
    "- reveal: text (max 10 words), icon — the one idea to remember.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (1-3 words).\n"
    "A strong opinion, never an insult, never about a named person or company, never a false fact.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Flame", "say": "..."}, ...]}'
)
