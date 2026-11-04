"""The parable template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

from app.video.motion.common import _icon, _line
from app.video.motion.templates._shared import _COMMON_RULES
from app.video.motion.templates.cartoon import CARTOON_MOODS


# "Parable · Two paths" (motion/src/parable.jsx) — a little story with a lesson about two
# people who start the same (the same job, shop, money, chance) and choose differently:
# one stays stuck, the other gets ahead. Our own flat cartoon, all drawn in code — the
# two villagers and Cambodian places (a village, rice fields, a river, a market, a city
# street, an office, a home) at morning / day / evening / night.
PARABLE_TYPES = ("hook", "tale", "tally", "fork", "moral", "cta")


PARABLE_PLACES = ("village", "field", "river", "market", "city", "office", "home")


PARABLE_TIMES = ("morning", "day", "evening", "night")


PARABLE_POSES = (
    "stand",
    "walk",
    "carry",
    "cheer",
    "wave",
    "point",
    "think",
    "tired",
    "shrug",
    "proud",
    "sad",
)


PARABLE_ITEMS = ("none", "bucket", "basket", "bag", "sack", "box", "phone", "money", "book")


PARABLE_GUESTS = ("elder", "boss", "buyer", "child")


DUO_SKINS = ("light", "tan", "brown", "deep")


DUO_HAIRS = ("short", "spiky", "side", "bun", "long", "ponytail", "cap", "krama")


DUO_SHIRTS = ("green", "blue", "red", "orange", "purple", "teal", "yellow", "pink", "brown", "navy")


DUO_EXTRAS = ("krama", "glasses", "none")


PARABLE_PROMPT = (
    "You are the best animated-parable writer in Cambodia. You plan a REMOTION VIDEO (Reels / "
    "TikTok, 40-75 s): a little story with a lesson about TWO people who start out the same — the "
    "same job, the same shop, the same money, the same chance — and make different choices; one "
    "stays stuck, the other gets ahead (or one learns the hard way). A narrator tells it like a "
    "fable: simple, concrete, a little funny, with a clear turn. The lesson can be about money, "
    "work, business, selling, marketing, habits, health or study — or the brand's product as the "
    "smarter choice, shown in the story, never an advert read out. Tell it fresh, in everyday "
    "Cambodian life — never retell a famous parable (the pipeline, the two buckets) word for word.\n"
    "\n"
    'THE CAST — return "cast": exactly 2 x {name (a short Cambodian first name), gender (male | '
    "female), skin ("
    + " | ".join(DUO_SKINS)
    + "), hair ("
    + " | ".join(DUO_HAIRS)
    + "), shirt ("
    + " | ".join(DUO_SHIRTS)
    + "), extra ("
    + " | ".join(DUO_EXTRAS)
    + ")}. Different hair and "
    "shirt colours. Character 1 is usually the one who stays stuck, character 2 the one who gets "
    "ahead.\n"
    "\n"
    "THE STORY (7-10 scenes):\n"
    '1. hook — the setup in a few words ("Two friends, [the same job]").\n'
    "2. tale — who they are and what they both do (who 0).\n"
    "then tale / tally scenes — what each one does, one moment per scene, day after day; a tally "
    "when a number tells it (buckets, customers, money, followers, hours).\n"
    "a fork — the turn: one path vs the other, the result for each.\n"
    "then moral — the lesson in one line.\n"
    "last. cta — a question for the comments (which one are you?) or follow for part 2.\n"
    "A guest (an elder, a boss, a buyer, a child) may come into a tale to ask or tell something.\n"
    "\n"
    "SCENE TYPES and their fields — who: 0 (both), 1 or 2; acts: exactly 2 x {pose, mood, item}, "
    "one per character in cast order (only the shown ones matter); pose one of: "
    + ", ".join(PARABLE_POSES)
    + " (walk = walks in); mood one of: "
    + ", ".join(CARTOON_MOODS)
    + "; item (what they hold) one of: "
    + ", ".join(PARABLE_ITEMS)
    + ":\n"
    "- hook: text (max 7 words).\n"
    "- tale: title (max 5 words — the moment, like a chapter title), place (one of: "
    + ", ".join(PARABLE_PLACES)
    + "), time ("
    + " | ".join(PARABLE_TIMES)
    + "), who, acts, icon "
    "(optional — the thing that matters popping up over a head), guest (optional {name, look ("
    + " | ".join(PARABLE_GUESTS)
    + "), pose, mood}).\n"
    "- tally: the same as tale (title, place, time, who, acts) + label (max 3 words — what is "
    'counted, e.g. "Customers today"), value (a number), start (optional — the number it counts '
    'from), prefix ("$"), suffix.\n'
    "- fork: title (max 5 words), sides: exactly 2 x {label (max 3 words — Poor / Rich, Waiting / "
    "Posting daily), tone (good | bad), pose, mood, item, icon (optional)} — side 1 is character 1.\n"
    '- moral: title (max 3 words, e.g. "The lesson"), text (max 14 words), icon.\n'
    "- cta: text (max 10 words), button (1-3 words).\n"
    "Numbers in a tally are the story's example numbers — small round numbers, the same through "
    "the video, the maths right. `say` is the narrator telling the story to the viewer, each line "
    "leading into the next.\n"
    + _COMMON_RULES
    + '{"cast": [{"name": "...", "gender": "male", "skin": "tan", "hair": "short", "shirt": "blue", '
    '"extra": "krama"}, {...}], "scenes": [{"type": "hook", "text": "...", "say": "..."}, {"type": '
    '"tale", "title": "...", "place": "market", "time": "morning", "who": 0, "acts": [{"pose": '
    '"stand", "mood": "happy", "item": "basket"}, {...}], "say": "..."}, ...]}'
)


DUO_DEFAULT = (
    {"gender": "male", "skin": "tan", "hair": "short", "shirt": "blue", "extra": "krama"},
    {"gender": "female", "skin": "light", "hair": "bun", "shirt": "pink", "extra": "none"},
)


def clean_duo(raw) -> list[dict]:
    """Parable · Two paths: the two people — a name and how they look."""
    people = [p for p in (raw if isinstance(raw, list) else []) if isinstance(p, dict)][:2]
    while len(people) < 2:
        people.append({})
    out = []
    for n, p in enumerate(people):
        d = DUO_DEFAULT[n]
        gender = p.get("gender") if p.get("gender") in ("male", "female") else d["gender"]
        hair = (
            p.get("hair")
            if p.get("hair") in DUO_HAIRS
            else (d["hair"] if gender == d["gender"] else ("short", "bun")[gender == "female"])
        )
        shirt = p.get("shirt") if p.get("shirt") in DUO_SHIRTS else d["shirt"]
        if out and shirt == out[0]["shirt"]:
            shirt = next(c for c in ("pink", "green", "orange", "teal") if c != shirt)
        if out and hair == out[0]["hair"]:
            hair = next(
                h
                for h in (("bun", "long") if gender == "female" else ("spiky", "side"))
                if h != hair
            )
        out.append(
            {
                "name": _line(p.get("name"), 20),
                "gender": gender,
                "skin": p.get("skin") if p.get("skin") in DUO_SKINS else d["skin"],
                "hair": hair,
                "shirt": shirt,
                "extra": p.get("extra") if p.get("extra") in DUO_EXTRAS else d["extra"],
            }
        )
    return out


def _duo_who(value) -> int:
    """Parable: who is in the scene — 0 both, 1 or 2."""
    v = str(value).strip().lower()
    return 1 if v == "1" else 2 if v == "2" else 0


def _duo_act(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    return {
        "pose": raw.get("pose") if raw.get("pose") in PARABLE_POSES else "stand",
        "mood": raw.get("mood") if raw.get("mood") in CARTOON_MOODS else "happy",
        "item": raw.get("item") if raw.get("item") in PARABLE_ITEMS else "none",
    }


def _tale_fields(raw: dict) -> dict:
    """Parable: a story moment — the place, the time, who is there and what they do."""
    acts = raw.get("acts") if isinstance(raw.get("acts"), list) else []
    out = {
        "title": _line(raw.get("title"), 50),
        "place": raw.get("place") if raw.get("place") in PARABLE_PLACES else "village",
        "time": raw.get("time") if raw.get("time") in PARABLE_TIMES else "day",
        "who": _duo_who(raw.get("who")),
        "acts": [_duo_act(acts[i] if i < len(acts) else None) for i in range(2)],
    }
    icon = _icon(raw.get("icon"), "")
    if icon:
        out["icon"] = icon
    guest = raw.get("guest") if isinstance(raw.get("guest"), dict) else None
    if guest and (_line(guest.get("name"), 20) or guest.get("look") in PARABLE_GUESTS):
        act = _duo_act(guest)
        out["guest"] = {
            "name": _line(guest.get("name"), 20),
            "look": guest.get("look") if guest.get("look") in PARABLE_GUESTS else "elder",
            "pose": act["pose"],
            "mood": act["mood"],
        }
    return out
