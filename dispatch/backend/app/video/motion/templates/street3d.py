"""The street3d template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.templates._shared import _COMMON_RULES


# "3D · Street" (motion/src/street3d.jsx) — a low-poly Cambodian street at dusk in real 3D:
# a rival shophouse (shutter half down) and the brand's, lit up with its name on the sign;
# people walk to it, a board on its front counts, customers' messages float up. Words on
# the page over the 3D; rendered with --gl=swangle.
STREET_TYPES = ("hook", "shops", "crowd", "chatter", "cta")


# the 3D things drawn in code (motion/src/props3d.jsx THINGS — keep the same) and the
# kinds of people (street3d.jsx KINDS)
STREET_PROPS = (
    "coffee",
    "iced",
    "book",
    "books",
    "pen",
    "phone",
    "laptop",
    "bag",
    "box",
    "noodles",
    "rice",
    "cake",
    "bread",
    "fruit",
    "flower",
    "plant",
    "shirt",
    "shoe",
    "money",
    "coins",
    "gift",
    "bottle",
    "medicine",
    "house",
    "car",
    "scooter",
    "bicycle",
    "camera",
    "clock",
    "headphones",
    "cart",
    "ball",
    "key",
)


STREET_PEOPLE = ("student", "worker", "monk", "vendor", "chef", "doctor", "kid", "elder", "tourist")


STREET_PROMPT = (
    "You are a top short-video creative in Cambodia. You plan a REMOTION VIDEO in 3D (Reels / "
    "TikTok, 20-40 s) set on one street at dusk: two shophouses side by side — a rival shop that "
    "does things the old way (its shutter half down, nobody there) and THE BRAND's shop, lit up "
    "with its name on the sign, people walking in, messages arriving. The story: why one shop "
    "on the same street is full and the other is empty — and what the brand's shop does "
    "differently (what the brand sells or offers: its product, its service, its way of "
    "working). Proud, warm, a little cinematic; never a list of features read out.\n"
    "\n"
    "THE STORY (5-6 scenes):\n"
    '1. hook — text (max 9 words): the question of the two shops ("Same street. [Why is one '
    'always full?]").\n'
    "2. shops — title (max 6 words), sides: exactly 2 x {label (max 4 words), tone (bad | good)} — "
    "side 1 is the rival (what it does: bad), side 2 the brand's shop (what it does: good).\n"
    "3. crowd — title (max 6 words), label (max 3 words — what the board counts), value (a "
    'number), start (optional — the number it counts from), prefix ("$"), suffix — only a TRUE '
    "number from the brief or product information; with none, leave value out (the people still "
    "walk in, the board is left out).\n"
    "4. chatter — title (max 6 words), messages: 2-3 x {text (max 8 words — what customers send "
    "the shop: a question, an order, a thank-you)}.\n"
    "last. cta — text (max 9 words), button (1-3 words).\n"
    "\n"
    "THE THINGS IN 3D — only these exist, drawn in 3D: " + ", ".join(STREET_PROPS) + ".\n"
    '- return "goods": 1-3 of them — what the shop sells or the story is about (they stand on '
    "its counter and customers carry them away). Pick the closest (a bookshop: books, book, pen; "
    "a café: coffee, iced, cake; a phone shop: phone, headphones; a motorbike shop: scooter).\n"
    '- return "people": 1-3 kinds of customers who come — ' + ", ".join(STREET_PEOPLE) + " (or [] "
    "for everyday people).\n"
    '- any scene may have "hero": one thing from the list floating big in front of the shop, '
    'where it helps the story (2-3 scenes) — or "product" with "product": the exact name of '
    "one of the PRODUCTS, to show the brand's own product photo in 3D.\n"
    + _COMMON_RULES
    + '{"goods": ["coffee", "iced"], "people": ["student", "worker"], "scenes": [{"type": "hook", "text": "...", "hero": "coffee", "say": "..."}, {"type": "shops", "title": "...", '
    '"sides": [{"label": "...", "tone": "bad"}, {"label": "...", "tone": "good"}], "say": "..."}, '
    '{"type": "crowd", "title": "...", "label": "...", "value": 120, "say": "..."}, {"type": '
    '"chatter", "title": "...", "messages": [{"text": "..."}], "say": "..."}, {"type": "cta", '
    '"text": "...", "button": "...", "say": "..."}]}'
)


def clean_street(raw: dict) -> dict:
    """3D · Street: what the shop sells (on its counter, in customers' hands) and who comes."""
    goods = [
        g
        for g in (raw.get("goods") if isinstance(raw.get("goods"), list) else [])
        if g in STREET_PROPS
    ]
    people = [
        k
        for k in (raw.get("people") if isinstance(raw.get("people"), list) else [])
        if k in STREET_PEOPLE
    ]
    return {"goods": list(dict.fromkeys(goods))[:3], "people": list(dict.fromkeys(people))[:3]}
