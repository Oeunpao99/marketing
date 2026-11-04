"""The launch template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES, _SAAS_CRAFT


# ── Product launch (motion/src/launch.jsx) — a cinematic launch film ─────────
LAUNCH_TYPES = (
    "hook",
    "launch",
    "gallery",
    "button",
    "form",
    "stack",
    "screen",
    "flow",
    "dashboard",
    "reveal",
    "list",
    "stat",
    "cta",
)


LAUNCH_PROMPT = (
    "You are the director of premium SaaS launch films in Cambodia. You plan a REMOTION VIDEO (about "
    "40-60 s) that LAUNCHES a product or a new feature, soft and After-Effects smooth: a light "
    "lavender stage, the line landing word by word with a glowing icon, the product's GALLERY — "
    "what it makes or keeps, as cards popping into a tilted 3D app window — the camera pushing in "
    "on one button while a cartoon hand clicks it, the product's real screens stacking up like a "
    "deck. Confident, few words on screen — the product itself is the hero.\n"
    "\n"
    "THE STORY (7-9 scenes):\n"
    '1. hook — the pain or the promise in one line ("Still chasing approvals by [email]?").\n'
    "2. launch — introduce the product or feature by name, with its one-line promise.\n"
    "3. gallery — the product's library: what it makes, keeps or sells, as cards (ALWAYS, right "
    "after the launch).\n"
    "4-6. the product working, the hand doing it: `button` (the ONE click that does the job, and "
    "what happens), `stack` (the real screens, when there are screenshots), `screen`, `flow`, "
    "`dashboard`, or `form` ONLY when filling in a form is truly what the product is about — two or "
    "three of these, different types, in the order a user would really do it.\n"
    "7. reveal or stat — the one thing to remember (stat only with a TRUE number).\n"
    "last. cta — try it / book a demo / it's live today.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    "- launch: name (the product or feature name, as written), text (its promise, max 10 words), "
    'badge (1-2 words, e.g. "Now live", "New", "Beta").\n'
    '- gallery: title (the app page\'s name, 1-2 words — "Library", "My videos", "Menu"), tabs: '
    '3-4 x 1 word, cards: 4-6 x {"title": max 3 words — a believable item the product makes, keeps '
    'or sells, "sub": max 3 words, "icon": "Video" | "Image" | "FileText" | "ShoppingBag" …}, '
    "shots: screenshot numbers for the thumbnails (from THE BRAND'S SCREENSHOTS, or []), text "
    "(max 8 words, optional).\n"
    '- button: title (what the card is, 2-4 words, e.g. "Leave request"), text (one detail line, '
    'max 8 words, sample data), button (the action, 1-3 words — e.g. "Send for approval"), result '
    "(what happens, max 6 words).\n"
    '- form: title (2-4 words), fields: 2-3 x {"label": 1-2 words, "value": what a user types, max '
    "4 words, sample data}, toggle (a setting switched on, max 6 words, optional).\n"
    '- stack: words: 2-3 single big words that change as the screens arrive ("direct", "fast", '
    '"yours"), shots: 2-4 screenshot numbers — only from THE BRAND\'S SCREENSHOTS, never without them.\n'
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
    "Only features the product information supports — never invent one. Typed values and card "
    "details are sample data, never a real customer's.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Rocket", "say": "..."}, ...]}'
)
