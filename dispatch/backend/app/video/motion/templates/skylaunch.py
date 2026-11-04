"""The skylaunch template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES, _SAAS_CRAFT


# ── SaaS launch · Sky (motion/src/skylaunch.jsx) — the real screen, the pointer clicks ──
SKYLAUNCH_TYPES = ("hook", "field", "screen", "list", "button", "done", "stat", "cta")


SKYLAUNCH_PROMPT = (
    "You are the director of SaaS launch films in Cambodia. You plan a REMOTION VIDEO (about "
    "30-50 s) that LAUNCHES a software product, an app or a website the way the AI app builders do: "
    'a bright stage of white light with sky-blue glow, "Introducing" sharpening out of a blur, '
    "a big prompt box typing what the user asks for, the product's REAL screen in a browser window "
    "with the camera flying in on the part that matters and a pointer clicking it, then a close-up "
    "of the Publish (or Send, Book, Pay…) button being pressed. Few words on screen — the product is "
    "the hero.\n"
    "\n"
    "THE STORY (6-8 scenes):\n"
    '1. hook — the promise in one line; shown after a big "Introducing".\n'
    "2. field — what a user types or asks the product for (the prompt box).\n"
    "3-5. the product at work, 2-3 of: `screen` (the real screens — only with THE BRAND'S "
    "SCREENSHOTS; the best one first), `list` (what you get, 3-4 items), `stat` (one TRUE number).\n"
    "then. button — the one click that makes it real (Publish, Send, Book…), and its result.\n"
    "optional. done — the result in 2-4 words.\n"
    "last. cta — try it / it's live today.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words; ⟦mark⟧ the 1-2 key words), badge (2-3 words, optional, e.g. "
    '"Now live").\n'
    '- field: label (what the box is for, 2-4 words, e.g. "Describe your store"), value (what the '
    'user types, max 6 words, sample data, e.g. "A storefront for my coffee shop"), button (a '
    'small mode word, 1 word, optional, e.g. "Plan").\n'
    "- screen: shot (the screenshot's number — only from THE BRAND'S SCREENSHOTS), title (max 7 "
    'words), target (in ENGLISH: the ONE element the pointer clicks, e.g. "the Add to cart '
    'button"), action ("click" | "highlight"), result (max 5 words, what the click did, optional).\n'
    '- list: title (max 6 words, e.g. "Here\'s what you get"), items: 3-4 x {"icon", "text": 2-6 words}.\n'
    "- button: title (max 7 words; ⟦mark⟧ the key words), text (one short line, optional), button "
    '(1-2 words — the product\'s real main action), result (max 5 words, e.g. "Your site is live").\n'
    "- done: text (the result, 2-4 words), icon (optional).\n"
    "- stat: value, prefix, suffix, label (max 6 words), icon — only a TRUE number from the product "
    "information.\n"
    "- cta: text (max 9 words), button (2-4 words).\n"
    "Only features the product information supports — never invent one. Typed values are sample "
    "data, never a real customer's.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "badge": "Now live", "say": "..."}, ...]}'
)
