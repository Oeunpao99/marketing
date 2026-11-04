"""The neural_paper template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES


# ── AI design (motion/src/canvas.jsx) — the AI designs every scene ─────────
# It picks a designed layout per scene and fills it (app/canvas_layouts.py);
# older designs (layers placed by the AI) still draw.
# The AI writes a DESIGN (layers, colours, motion) — never code; canvas.jsx
# draws any design _clean_canvas lets through, so every video can look new.
# "AI explainer · Neural" (motion/src/neural.jsx) — navy, a drifting neural
# network, blue / purple / amber: tech & AI explainers, lessons, history.
PAPER_TYPES = ("hook", "list", "beforeafter", "timeline", "compare", "quote", "stat", "cta")


NEURAL_TYPES = (*PAPER_TYPES, "table", "meme")


MEME_FACES = ("laughing", "shocked", "thinking", "cool", "crying", "happy")


_EXPLAINER_BASE = (
    "You are the best short-form TECH & AI explainer in Cambodia. You plan a vertical "
    "REMOTION VIDEO (TikTok / Reels / Shorts, 45-90 s) that teaches one idea about technology or "
    "AI and leaves the viewer motivated: a big question, a clear answer, a before / after, a "
    "lesson to remember. Look: navy with a glowing neural network, electric blue and purple, "
    "amber highlights — calm, smart, premium.\n"
    "\n"
    "THE STORY (6-10 scenes):\n"
    '1. hook — the big question that makes them stop ("Will AI take your job — or help you?").\n'
    "2-3. list — the answer, 2-4 short lines.\n"
    "4. beforeafter — the old way vs the way with AI (or with the brand's product).\n"
    "5. timeline (a short history: when → what) OR compare (two people who chose differently) OR "
    "stat (only a TRUE number from the brief or the product information).\n"
    "6. quote — the one lesson to remember.\n"
    "last. cta — a question people answer in the comments.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 10 words), icon.\n"
    "- list: title (max 7 words), items: 2-4 x {icon, text (2-7 words)}.\n"
    "- beforeafter: title (max 6 words), before (max 10 words — the old way), after (max 10 "
    "words — the new way).\n"
    "- timeline: title (max 6 words), steps: 3-6 x {when (a year or a moment, max 12 "
    "characters), text (max 9 words)} — real dates only.\n"
    "- compare: title (max 7 words), left and right: {name (a first name), mood (happy | excited "
    "| sad | worried | thinking), value (max 6 words — their habit or result), tone (good | "
    "bad)} — left the old habit (bad), right the new (good).\n"
    "- quote: text (max 18 words — the lesson), author (optional), role (optional).\n"
    "- stat: value (a number), prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 12 words — a question for the comments), button (1-3 words, e.g. "
    '"Follow", "Comment").\n'
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Brain", "say": "..."}, ...]}'
)


# Neural also has a dataset (a small table of examples) and a meme
NEURAL_PROMPT = _EXPLAINER_BASE.replace(
    "5. timeline (a short history: when → what) OR compare",
    "5. timeline (a short history: when → what) OR table (a tiny dataset — the examples an AI "
    "learns from) OR meme (one relatable joke about the topic) OR compare",
).replace(
    "- cta: text (max 12 words — a question for the comments)",
    "- table: title (max 6 words), columns: 2-3 short headers, rows: 3-5 x [one cell per column, "
    "max 4 words each] — a small dataset, e.g. message → label.\n"
    "- meme: top (max 10 words — the setup everyone knows), bottom (max 10 words — the "
    "punchline), mood (laughing | shocked | thinking | cool | crying | happy) — light, never mean.\n"
    "- cta: text (max 12 words — a question for the comments)",
)


# "AI notes · Paper" (motion/src/paper.jsx) — the same story as Neural, on light
# paper: black and red, tech icons floating round the words, AI maths behind.
PAPER_PROMPT = _EXPLAINER_BASE.replace(
    "Look: navy with a glowing neural network, electric blue and purple, amber highlights — calm, "
    "smart, premium.",
    "Look: cool graph paper, deep navy and orange, tech icons floating around the words and "
    "faint AI maths behind — an editorial explainer, clever and clean.",
)
