"""The unveil template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES, _SAAS_CRAFT


# ── Unveil (motion/src/unveil.jsx) — a light, airy product launch ──────────
UNVEIL_TYPES = (
    "hook",
    "word",
    "field",
    "done",
    "screen",
    "flow",
    "dashboard",
    "reveal",
    "list",
    "stat",
    "cta",
)


UNVEIL_PROMPT = (
    "You are the director of premium product launch films in Cambodia. You plan a REMOTION VIDEO "
    "(about 35-55 s) that UNVEILS a product or a new feature the way the big software companies do: "
    "a bright white stage with soft teal and blue light, one huge thin word filling the top of the "
    "frame while the real app card rises into focus under it, cards flying past the camera out of "
    "focus, a field typing itself in, and a glossy check with confetti when the job is done. Calm, "
    "elegant, very few words on screen — the product's moment is the hero.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    '1. hook — the promise in one line ("Approvals in one place").\n'
    "2-5. the feature at work, the way a user really does it, 2-4 of: `word` (the ONE word for what "
    "it lets you do + the card that does it), `field` (what the user types, then the button), "
    "`screen` / `flow` / `dashboard` (the real screens, when there are screenshots).\n"
    'then. done — the result, in 2-4 words ("User invited", "Request approved").\n'
    "last. cta — try it / it's live today.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    '- word: word (ONE word, the verb or idea, e.g. "Collaborate", "Approve", "សហការ"), title (the '
    'card\'s title, 2-4 words, e.g. "Collaborators (2)"), action (a small link on the card, 1 word, '
    'optional), text (one short line on the card, max 12 words, optional), rows: 1-3 x {"name": a '
    'person or item, 2-3 words, sample data, "sub": their role or a detail, max 4 words}.\n'
    '- field: label (what the field is, 1-3 words, e.g. "Invite by email"), value (what the user '
    "types, max 5 words, sample data — an email, a name, an amount), button (the action, 1-2 words, "
    'e.g. "Invite").\n'
    "- done: text (the result, 2-4 words), icon (optional).\n"
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 7 "
    'words), target (in ENGLISH: the ONE element to point at), action ("click" | "highlight"), '
    "result (max 6 words, optional).\n"
    '- flow: title (max 6 words), nodes: 3-4 x {"icon", "label": 2-5 words, "sub": the app, optional}.\n'
    '- dashboard: title (optional), metrics: 2-3 x {"label", "value", "prefix", "suffix", '
    '"delta"}, chart: "line" | "bars" — small, believable SAMPLE data.\n'
    "- reveal: text (max 10 words), icon.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "Only features the product information supports — never invent one. Names, emails and typed "
    "values are sample data, never a real customer's.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Sparkles", "say": "..."}, ...]}'
)
