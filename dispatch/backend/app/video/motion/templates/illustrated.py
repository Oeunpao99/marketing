"""The illustrated template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.common import _line
from app.video.motion.templates._shared import _COMMON_RULES


# "Illustrated · Everyday Cambodia" (motion/src/illustrated.jsx) — a calm documentary
# story in a muted hand-drawn look: a phsar, a street of shophouses, a bank, a home,
# rice fields; one main person walking through it, close-ups of their face beside the
# thing that matters (an ATM, a phone, money, a paper, a stall, a laptop).
ILL_TYPES = ("hook", "wide", "closeup", "fact", "cta")


ILL_PLACES = ("market", "street", "bank", "home", "field")


ILL_TIMES = ("morning", "day", "evening")


ILL_POSES = ("stand", "walk", "carry", "phone", "talk", "point")


ILL_ITEMS = ("none", "basket", "bag", "phone", "money")


ILL_OBJECTS = ("atm", "phone", "money", "paper", "stall", "laptop")


LEAD_HAIRS = ("short", "long", "bun")


LEAD_SHIRTS = ("blue", "white", "yellow", "teal", "rust", "green", "pink", "navy")


LEAD_BOTTOMS = ("pants", "khaki", "sarong", "skirt")


LEAD_HATS = ("none", "cap", "straw", "krama")


ILL_PROMPT = (
    "You are a documentary storyteller in Cambodia. You plan a REMOTION VIDEO (Reels / TikTok / "
    "YouTube, 40-80 s) in a calm, hand-drawn documentary look: everyday Cambodian life — the "
    "phsar (market), a street of shophouses with motos and tuk-tuks, a bank, a home, the rice "
    "fields — and ONE main person we follow through a small real-life story: a seller, a farmer, "
    "a worker, a student. A narrator tells it simply and warmly, like a short documentary: what "
    "their day is like, the problem, what changes. Explainers about money, banking and payments, "
    "health, work, business or the brand's service fit well — the brand shown as part of their "
    "life, never an advert read out.\n"
    "\n"
    'THE MAIN PERSON — return "cast": [{name (a Cambodian first name), gender (male | female), '
    "skin (light | tan | brown | deep), hair ("
    + " | ".join(LEAD_HAIRS)
    + "), shirt ("
    + " | ".join(LEAD_SHIRTS)
    + "), bottom ("
    + " | ".join(LEAD_BOTTOMS)
    + "), hat ("
    + " | ".join(LEAD_HATS)
    + ")}].\n"
    "\n"
    "THE STORY (7-11 scenes): a hook over a wide place; then wide shots of the places their "
    "day goes through, close-ups when they face the thing that matters, a fact when a fact or a "
    "number helps; a call to action at the end.\n"
    "\n"
    "SCENE TYPES and their fields (place one of: "
    + ", ".join(ILL_PLACES)
    + "; time: "
    + " | ".join(ILL_TIMES)
    + "):\n"
    "- hook: text (max 8 words), place, time.\n"
    "- wide: place, time, pose ("
    + " | ".join(ILL_POSES)
    + " — walk = they walk in), item ("
    + " | ".join(ILL_ITEMS)
    + " — what they hold), crowd (0-6 — how many other people around), "
    "title (optional, max 6 words — a small caption card).\n"
    "- closeup: object (" + " | ".join(ILL_OBJECTS) + " — what they look at, beside their face), "
    "text (optional, max 7 words — a caption card), place (the place behind, soft).\n"
    '- fact: title (max 3 words, e.g. "Did you know"), text (max 14 words), icon, value (optional '
    "— a TRUE number from the brief or common knowledge, counts up), prefix, suffix, place.\n"
    "- cta: text (max 9 words), button (1-3 words), place.\n"
    "`say` is the narrator — calm, warm, simple, like a documentary voice; each line leads into "
    "the next.\n"
    + _COMMON_RULES
    + '{"cast": [{"name": "...", "gender": "male", "skin": "tan", "hair": "short", "shirt": "blue", '
    '"bottom": "pants", "hat": "none"}], "scenes": [{"type": "hook", "text": "...", "place": "market", '
    '"time": "morning", "say": "..."}, {"type": "wide", "place": "market", "time": "morning", "pose": '
    '"walk", "item": "basket", "crowd": 4, "say": "..."}, {"type": "closeup", "object": "atm", "text": '
    '"...", "place": "bank", "say": "..."}, ...]}'
)


def clean_lead(raw) -> list[dict]:
    """Illustrated: the main person — a name and how they look."""
    p = next((x for x in (raw if isinstance(raw, list) else []) if isinstance(x, dict)), {})
    gender = p.get("gender") if p.get("gender") in ("male", "female") else "male"
    return [
        {
            "name": _line(p.get("name"), 20),
            "gender": gender,
            "skin": p.get("skin") if p.get("skin") in ("light", "tan", "brown", "deep") else "tan",
            "hair": p.get("hair")
            if p.get("hair") in LEAD_HAIRS
            else ("bun" if gender == "female" else "short"),
            "shirt": p.get("shirt") if p.get("shirt") in LEAD_SHIRTS else "blue",
            "bottom": p.get("bottom")
            if p.get("bottom") in LEAD_BOTTOMS
            else ("sarong" if gender == "female" else "pants"),
            "hat": p.get("hat") if p.get("hat") in LEAD_HATS else "none",
        }
    ]
