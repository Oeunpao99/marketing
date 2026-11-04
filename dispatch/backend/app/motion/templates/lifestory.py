"""The lifestory template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.common import _line, _number, _numbers_in
from app.motion.templates._shared import _COMMON_RULES


# "Life story · One person" (motion/src/lifestory.jsx) — one person's money / life
# journey (a salary, a debt paid off month by month, savings growing): our own coded
# person (a krama round the neck, a mustard shirt) in 1-3 warm Cambodian rooms
# painted by the image model (doodle.LIFE_STYLE), with coded props that show the
# story's EXACT numbers — a salary envelope, a bill stamped PAID, a wall calendar,
# a savings jar, a phone, a notebook, cash — so no figure is ever garbled.
LIFE_TYPES = ("hook", "moment", "ledger", "takeaway", "cta")


LIFE_POSES = ("stand", "write", "count", "phone", "cheer", "worry", "walk", "point", "sit")


LIFE_MOODS = ("happy", "excited", "thinking", "worried", "sad", "proud", "tired")


LIFE_PROPS = ("envelope", "bill", "calendar", "jar", "phone", "notebook", "cash")


MAX_LIFE_PLACES = 3


LIFE_PROMPT = (
    "You make short animated life-story videos for Khmer Facebook / TikTok (45-90 s): ONE person "
    "we follow through a real money or life journey — getting a salary, paying off a debt "
    "month by month, saving for something, starting a small business, a habit that changed "
    "things. Warm, honest and simple, like a friend telling what happened to someone they "
    "know, with the lesson at the end. The brand may appear as part of the story (the app "
    "they used, the shop), never as an advert read out.\n"
    "\n"
    'THE PERSON — return "hero": {"name": a Cambodian first name (the brief\'s own name '
    'when it gives one, spelled exactly), "gender": "female" | "male"}.\n'
    'THE PLACES — return "places": 1-' + str(MAX_LIFE_PLACES) + " places the story happens, in "
    "ENGLISH, 15-35 words each — the room or place (a small home with a wooden table by a "
    "window, a market stall, a bank counter, a shop, an office), what is in it, the light and "
    "the time of day; everyday Cambodia. No people, no text.\n"
    "\n"
    "THE STORY (6-10 scenes):\n"
    "1. hook — text (max 9 words: the question or the story's title, [key words] marked), "
    "icon, mood. `say`: a hook that makes them stay.\n"
    "then the journey, in order:\n"
    "- moment: place (1-"
    + str(MAX_LIFE_PLACES)
    + " — which of THE PLACES), pose (one of: "
    + ", ".join(LIFE_POSES)
    + " — write / sit = at a table; count = counting cash; cheer = a fist "
    "up), mood, text (max 10 words — a caption for the moment, [key words] marked), and "
    'OPTIONAL prop — the one thing that shows the moment: {"kind": one of '
    + ", ".join(LIFE_PROPS)
    + ', "label": max 3 words written on it (SALARY, DEBT, MONTH 7, '
    'SAVINGS, Rent…), "amount": the money on it exactly as the story writes it ("$350"), '
    '"paid": true to stamp a bill PAID, "done": 1-31 days crossed off on a calendar, '
    '"lines": 1-3 x {"text": max 4 words, "amount"} for a notebook}.\n'
    "- ledger: (the person writing it down) title (max 6 words), lines: 2-5 x {label (max 4 "
    "words), amount} — money in and out, debts, a plan; total: {label, amount} (optional).\n"
    "- takeaway: title (max 6 words), checks: 1-3 short lessons (max 9 words each).\n"
    "last. cta — text (max 10 words: share it, follow for the next story, try the brand), "
    "button (1-3 words).\n"
    "mood one of: " + ", ".join(LIFE_MOODS) + ".\n"
    "NUMBERS: every amount, month and day count comes from the brief / story — NEVER invent "
    "one. When the brief gives none, leave amount out and use props without money (a "
    "calendar, a notebook of things to do, a phone).\n"
    "`say` is a NARRATOR telling the person's story to the viewer, by their name (\"Bora "
    'opened his salary envelope: $350…"), warm and natural, each line leading into the next.\n'
    + _COMMON_RULES
    + '{"hero": {"name": "...", "gender": "male"}, "places": ["...", "..."], "scenes": [{"type": "hook", "text": "...", "icon": "Wallet", "mood": "thinking", "say": "..."}, '
    '{"type": "moment", "place": 1, "pose": "write", "mood": "worried", "text": "...", "prop": {"kind": "envelope", "label": "SALARY", "amount": "$350"}, "say": "..."}, ...]}'
)


def clean_hero(raw, voice: str = "") -> dict:
    """Life story: the person we follow — their name and whether he or she (the story's
    word first, else the voice picked)."""
    from app.speech import setting_gender

    raw = raw if isinstance(raw, dict) else {}
    gender = raw.get("gender") if raw.get("gender") in ("female", "male") else setting_gender(voice)
    return {"name": _line(raw.get("name"), 30), "gender": gender}


def _amount(value) -> str:
    """Money on a prop, as the story writes it ("$350", "៣៥០ ដុល្លារ")."""
    return _line(value, 16)


def clean_prop(raw) -> dict | None:
    """Life story: the one thing a moment shows — None when there is none."""
    if not isinstance(raw, dict) or raw.get("kind") not in LIFE_PROPS:
        return None
    prop = {"kind": raw["kind"], "label": _line(raw.get("label"), 24)}
    if _amount(raw.get("amount")):
        prop["amount"] = _amount(raw.get("amount"))
    if raw["kind"] == "bill" and raw.get("paid") in (True, "true", 1):
        prop["paid"] = True
    if raw["kind"] == "calendar":
        prop["done"] = int(min(31, max(0, _number(raw.get("done")) or 10)))
    if raw["kind"] == "notebook":
        lines = [
            x
            for x in (raw.get("lines") if isinstance(raw.get("lines"), list) else [])
            if isinstance(x, dict)
        ]
        prop["lines"] = [
            {"text": _line(x.get("text"), 30), "amount": _amount(x.get("amount"))}
            for x in lines
            if _line(x.get("text"), 30)
        ][:3]
    return prop


def _life_numbers(scene: dict) -> list[float]:
    """Every number a Life story scene shows — on its prop, its ledger, its total."""
    texts = []
    prop = scene.get("prop") or {}
    texts += [prop.get("amount") or "", prop.get("label") or ""] + [
        x.get("amount") or "" for x in prop.get("lines") or []
    ]
    texts += [x.get("amount") or "" for x in scene.get("lines") or []] + [
        (scene.get("total") or {}).get("amount") or ""
    ]
    return [n for t in texts for n in _numbers_in(t)]
