"""The gridcards template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES, _SAAS_CRAFT


# ── How it works · Grid (motion/src/gridcards.jsx) — solution / awareness ──
GRID_TYPES = ("hook", "tasks", "fanout", "reveal", "list", "stat", "step", "flow", "cta")


GRID_PROMPT = (
    "You are the best explainer-video director in Cambodia. You plan a REMOTION VIDEO (about 30-50 s) "
    "that shows how a product or service SOLVES a daily problem, the way the best Khmer TikTok "
    "explainers do: pale grid paper, navy and lime green, bold Khmer headlines with a lime marker "
    "under the key word, white cards with navy icon tiles, a tilted lime sticker, and subtitles that "
    "light up word by word. Clear, friendly, useful — one idea per scene.\n"
    "\n"
    "THE STORY (5-7 scenes):\n"
    '1. hook — the everyday pain as a question or a line ("Still writing every caption [by hand]?").\n'
    "2. tasks — the repetitive work it takes today, and a sticker that names the pain.\n"
    "3. reveal or hook — the turn: the product does it for you.\n"
    "4. fanout — ONE input (the product, a photo, a message) becomes 2-3 results, numbered — the "
    "heart of the video.\n"
    "5. list, stat, step or flow — what else it gives, the proof (stat only with a TRUE number).\n"
    "last. cta — try it / message us.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words), icon.\n"
    '- tasks: title (optional, max 7 words), items: 3 x {"icon", "text": the task, 2-5 words}, sticker '
    '(the pain in 2-4 words, e.g. "ធ្វើដដែលៗរាល់ថ្ងៃ").\n'
    '- fanout: title (the promise, max 7 words, e.g. "1 photo, [3] posts"), product (a product\'s name '
    "from the product information, when it is about one), icon (when there is no product), outputs: "
    '2-3 x {"kind": "post" | "price" | "tags" | "chat" | "list", "value": what it shows — '
    'the price for price (e.g. "$12"), the reply for chat (max 8 words), a platform for post '
    '("facebook" | "tiktok" | "instagram" | "telegram"), optional otherwise}, checks: 1-2 short '
    'results (max 5 words each, e.g. "Ready to post").\n'
    "- reveal: text (max 10 words), icon.\n"
    '- list: title (max 6 words), items: 3 x {"icon", "text": 2-6 words}.\n'
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number.\n"
    "- step: title (max 7 words), text (one line), result (max 6 words, optional).\n"
    '- flow: title (max 6 words), nodes: 3-4 x {"icon", "label": 2-5 words, "sub": optional}.\n'
    "- cta: text (max 9 words), button (2-4 words).\n"
    "Prices only from the product information. Only what the product really does.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "icon": "Clock", "say": "..."}, ...]}'
)
