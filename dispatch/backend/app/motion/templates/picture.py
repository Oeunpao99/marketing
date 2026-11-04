"""The picture template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.motion.common import _line


# "Picture story" (motion/src/picture.jsx) — a narrated story told over AI pictures: one
# full-screen picture per scene (app/doodle.py PICTURE_ARTS, in the art style picked), slow
# camera moves, crossfades, a short line of text on every picture in the colours picked
# (script["ink"]), subtitles. From a brief (the AI writes the story) or a pasted script
# (YouTube-style, up to 10 minutes): the WHOLE narration kept word for word, so the
# person's own recording can later be matched to it.
PICTURE_TYPES = ("shot",)


PICTURE_MIN, PICTURE_MAX = 6, 20


PICTURE_ARTS = (
    "film",
    "painted",
    "illustration",
    "3d",
    "stickman",
    "stickcolor",
)  # app/doodle.py PICTURE_ARTS — the looks


# a template name that is another template in a set look: "stickman" (Stick figures) = a Picture
# story drawn as black-ink stick figures, its words black with red key words; "stickcolor" (Stick
# figures · Colour) = colour stick figures in full painted rooms, white words, the brand's highlight
STYLE_ALIASES = {
    "stickman": ("picture", {"art": "stickman", "ink": {"text": "#111111", "accent": "#E11D2E"}}),
    "stickcolor": ("picture", {"art": "stickcolor"}),
}


# Stick figures: each picture is a simple drawing, so its description is one moment — never film language
STICK_DRAWS = (
    '\n\nTHE PICTURES ARE BLACK-INK STICK-FIGURE DRAWINGS on a white page (art "stickman"). Each '
    "`draw` is ONE simple moment: who is in it (1-3 stick figures), their pose and face (worried, "
    "proud, confused, laughing…), what they do, and 1-3 simple props (a desk, a phone, a thought "
    "bubble with a question mark or a light bulb, a chart, coins…). Whole figures, seen plainly — no "
    "close-ups, camera angles, lighting, colours, weather or detailed scenery.\n"
)


# Stick figures · Colour: one clear moment in a full room; the money / dates are the title's words
STICK_COLOR_DRAWS = (
    '\n\nTHE PICTURES ARE COLOUR STICK-FIGURE CARTOONS in full rooms (art "stickcolor"). Each `draw` '
    "is ONE clear moment: who is in it (1-3 stick figures, named), their pose and face (worried, proud, "
    "tired, cheering with a fist up…), what they do, where (a small room with a table and a lamp, a "
    "market stall, a bank counter, an office, a street) and 1-3 big simple props (an envelope, a "
    "notebook, bills, a calendar, a jar of coins, a phone). Whole figures at eye level, simple and "
    "readable. Props carry NO writing or numbers — the amount, the month or the word goes in the "
    'scene\'s `title` instead ("[$350] salary", "Month [7]").\n'
    "CAST: every returning person is a stick figure with a round white head and ONE colour detail "
    'of their own, the same in every picture — e.g. "Dara: a stick figure with a round white head, '
    'a mustard-yellow cap and a red-and-white checked krama". Give each person a different colour.\n'
)


def alias_art(goal: str) -> str:
    """The art an alias sets ("stickman"), else ""."""
    return (STYLE_ALIASES.get((goal or "").lower()) or ("", {}))[1].get("art", "")


def apply_alias(script: dict, goal: str) -> dict:
    """Give a storyboard written for an alias (STYLE_ALIASES) its set look."""
    alias = STYLE_ALIASES.get((goal or "").lower())
    if alias:
        script.update(alias[1])
    return script


PICTURE_INK = {"text": "#FFFFFF", "accent": ""}  # "" accent = the brand's colour


PICTURE_PROMPT = (
    "You are a film editor turning a story into a PICTURE STORY: a video told over full-screen "
    "AI pictures, one picture per scene, with slow camera moves — like a YouTube documentary or "
    "a motivational story channel. The narration carries the video; each picture shows what the "
    "voice is talking about right then, with a short line of text on it.\n"
    "\n"
    "When THE VIDEO IS ABOUT is a short brief (not a written script), write the story yourself: "
    "6-10 scenes, a gripping opening line, one person or one situation followed through, a real "
    "turn, a clear ending that pays off the opening — about 60-90 seconds spoken in all.\n"
    "\n"
    'EVERY scene is type "shot". Fields:\n'
    "- title (max 7 words, in LANGUAGE): the line of text on the picture — the key words of that "
    "moment (a question, a turn, a rule, a number the story gives, a feeling). Put the ONE most "
    "important word or two in [brackets] — they are shown in the highlight colour. Never the "
    "narration repeated word for word.\n"
    "- draw (ALWAYS in English, 20-45 words): the picture — who is in it, where, what they are "
    "doing, the mood, the light, the camera (wide shot / close-up / over the shoulder). Concrete "
    "and filmable, taken from the script's Visual notes when it has them. People who come back "
    "(the story's characters) are described the SAME way every time and named, e.g. \"David (the "
    'man described in the cast) slumped at his office desk at night". Never any text, writing, '
    "numbers on screens, logos or brand names in the picture. Each picture different from the "
    "one before (another place, angle or moment).\n"
    "- say: the narration for this picture. From a written script: its own voice-over, WORD FOR "
    "WORD — together the scenes' `say` lines are the WHOLE voice-over in order: nothing left "
    "out, nothing added, nothing reworded, nothing summarised; long parts are split over "
    "several scenes at sentence ends. From a brief: 1-3 spoken sentences you write.\n"
    "\n"
    'Also return "cast": the people who appear in more than one picture — [{name, look}], look = '
    "20-40 words in English: age, face, hair, build, clothes, so every picture draws them alike. "
    "[] when there are none.\n"
    'And "art": the picture style that suits the story — film (a cinematic photo-real film '
    "still), painted (a hand-painted anime film), illustration (a flat modern illustration), "
    "3d (a 3D animated film), stickman (black-ink stick figures on a white page — explainers, "
    "lessons, YouTube storytelling) or stickcolor (colour stick figures in full cartoon rooms — "
    "money and life-skills stories). If the brief names a style, use that.\n"
    # the word JSON: the AI service refuses a JSON reply when the messages never say it
    'Return JSON: {"cast": [...], "art": "film", "scenes": [{"type": "shot", "title": "...", '
    '"draw": "...", "say": "..."}, ...]}'
)


PICTURE_SAY_MAX = 1600  # a long part of the narration under one picture (10 minutes / 20 pictures)


PICTURE_STORY = (
    "\n\nTHE PERSON WROTE THEIR OWN SCRIPT — it is under THE VIDEO IS ABOUT. Make about {count} "
    "pictures for it (the video runs about {seconds} seconds), each under its part of the narration, "
    "in the script's order. Its narration is in LANGUAGE (the script's own language). FAITHFUL — it is "
    "THEIR story: names spelled EXACTLY as written, nothing added, nothing left out, never a new "
    "number, result or ending."
)


def picture_side(n: int) -> str:
    """Picture story: the side of scene ``n``'s picture its words sit on — left,
    right, left… (in a wide video; a tall one puts them at the top)."""
    return "left" if n % 2 == 0 else "right"


def picture_room(n: int, wide: bool) -> str:
    """What scene ``n``'s picture is asked to leave free for its words (picture.jsx
    sets them there, two big lines, like a YouTube thumbnail)."""
    if not wide:
        return (
            " Composition: the main subject in the lower 60% of the frame — a person's head well below "
            "the top third, never near the top; the top 35% is calm and simple (sky, a wall, a soft "
            "out-of-focus background) — room for a big title."
        )
    text = picture_side(n)
    subject = "right" if text == "left" else "left"
    return (
        f" Composition: the main subject on the {subject} half of the frame; the {text} half is calm, "
        "simple and uncluttered (a wall, sky, soft out-of-focus background) — room for a big title."
    )


def clean_picture_cast(raw) -> list[dict]:
    """Picture story: the people who come back — [{name, look}] (English looks), at most 4."""
    out = []
    for c in raw if isinstance(raw, list) else []:
        if isinstance(c, dict) and _line(c.get("look"), 300):
            out.append({"name": _line(c.get("name"), 40), "look": _line(c.get("look"), 300)})
    return out[:4]


def clean_ink(raw) -> dict:
    """Picture story: the text colour and the highlight colour of the words on
    the pictures (#RRGGBB; a missing highlight = the brand's colour)."""
    raw = raw if isinstance(raw, dict) else {}
    return {
        "text": (_hex(raw.get("text")) or PICTURE_INK["text"]).upper(),
        "accent": (_hex(raw.get("accent")) or "").upper(),
    }


if TYPE_CHECKING:  # loaded after this module — app/motion/__init__.py binds these (_link)
    from app.motion.templates.canvas import _hex
