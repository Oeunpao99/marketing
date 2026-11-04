"""A pasted script (story mode): its scenes, its own voice lines and on-screen words kept, its length, its language, and no number it didn't give.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import re

from typing import TYPE_CHECKING

from app.video.motion.common import TRANSITION_S, _line, _numbers_in, log
from app.video.motion.templates.picture import PICTURE_SAY_MAX
from app.video.motion.templates.lifestory import _life_numbers
from app.video.motion.templates.canvas import _plain


# Story mode (write_script ``seconds``): the person pasted their own story.
# Every template may run to ~10 minutes (2026-10-24 — it was 2, Training only went long).
MAX_STORY_SCENES = 80  # ~10 minutes


STORY_MAX_S = 600


LONG_STORY_SCENES = 20  # past this many scenes the storyboard gets the long writing budget


STORY_RULES = (
    "\n\nTHE PERSON WROTE THEIR OWN STORY — it is under THE VIDEO IS ABOUT. Turn THAT story "
    "into the storyboard instead of inventing one: follow its order and its content scene by "
    "scene (the story order above is only a guide to the scene types). The `say` lines are the "
    "story's own sentences, lightly shortened to be spoken — same meaning, in LANGUAGE "
    "(translate only if the story is written in another language). For each scene pick the "
    "scene type that shows its sentence best, and keep the on-screen words short. Start with a "
    "hook and end with a cta, taken from the story's opening and ending. Make about {count} "
    "scenes — the video should run about {seconds} seconds (one scene is about 6 seconds).\n"
    "FAITHFUL — it is THEIR story: keep its order, its people (names spelled EXACTLY as written), "
    'its dialogue (the words in quotes «…» / "…" stay in the `say` lines, in quotes), its '
    "questions, its tips and its ending — word for word where you can. NEVER add anything the "
    "story doesn't say: no new numbers, amounts, savings, results, tips, steps or outcomes, and "
    "never change how it ends. A `chart`, `stat`, `result` or `dashboard` only when the story "
    "itself gives ALL its numbers — otherwise show that sentence another way.\n"
    "VARIETY comes from HOW each sentence is shown, never from new content: never more than 2 "
    "scenes of the same type in a row, no type for more than a third of the scenes — a person's "
    "moment → their scene, several things → list, two people → compare, a number the story "
    "gives → stat, the one idea to remember → its own scene."
)


_SCENE_HEAD = re.compile(r"(?im)^\W*(?:scene|act|shot|ឈុត(?:ទី)?)\s*(\d{1,2})\b")


# "Voice:", "Narration:", "VO:", "សំឡេង:" — also with the language around it: "Khmer
# narration:", "Narration (Khmer):", "English voice-over:", "VO (KH):"
_VOICE_LINE = re.compile(
    r"(?im)^\W*(?:(?:khmer|english|kh|en|ខ្មែរ)\s+)?(?:voice(?:[- ]?over)?|vo|narrat(?:or|ion)|សំឡេង)"
    r"(?:\s*\([^)]{1,20}\))?\s*[:：]\s*(.+)$"
)


_LOOK_WORDS = re.compile(
    r"(?i)\b(?:look|visual|background|colou?r|palette|lighting|transition|pause|reveal|impact|split screen|led screen)\b"
)


def own_scenes(text: str) -> int:
    """How many numbered scenes a pasted script has ("Scene 1", "SCENE 2 –",
    "ឈុតទី 3"…) — 0 when it isn't written scene by scene (fewer than 3)."""
    nums = {int(m) for m in _SCENE_HEAD.findall(text or "")}
    return len(nums) if len(nums) >= 3 else 0


_MOMENT = re.compile(r"(?m)^\s*(?:[-•*]|\d{1,2}[.)])\s+\S")


def own_moments(text: str) -> int:
    """The moments a numbered script lists inside its scenes (its "- 24/7
    Monitoring" bullets, its "1. Customers captured" points) — each is a scene."""
    first = _SCENE_HEAD.search(text or "")
    return len(_MOMENT.findall(text[first.start() :])) if first else 0


# A voice label alone on its line — "🎙 Voice Over (Khmer)", "Narration:" — its
# line is the next one with words on it (scripts written by ChatGPT often do this).
_VOICE_HEAD = re.compile(
    r"(?i)^\W*(?:(?:khmer|english|kh|en|ខ្មែរ)\s+)?(?:voice(?:[- ]?over)?|vo|narrat(?:or|ion)|សំឡេង)"
    r"(?:\s*\([^)]{1,20}\))?\s*[:：]?\s*$"
)


_QUOTE_START = re.compile(r"^\s*[\"“«]")


def _voice_lines(text: str) -> list[tuple[int, str]]:
    """(line number, words) of each of the script's own voice lines: "Voice: …"
    on one line, or a label alone on its line with the words under it — every
    quoted paragraph under it, up to the next heading ("Purpose", "Visual",
    "---"): a scene's voice-over is often two or three paragraphs, and a missed
    one was dropped from the voice and demanded on screen instead."""
    lines = (text or "").splitlines()
    out: list[tuple[int, str]] = []

    def plain_line(k: int) -> bool:
        return not (
            _SCENE_HEAD.match(lines[k])
            or _VOICE_HEAD.match(lines[k])
            or _VOICE_LINE.match(lines[k])
        )

    i = 0
    while i < len(lines):
        m = _VOICE_LINE.match(lines[i])
        if m:
            out.append((i, m.group(1)))
        elif _VOICE_HEAD.match(lines[i]):
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and plain_line(j):
                out.append((j, lines[j]))
                i = j
                # the next quoted paragraphs belong to the same voice-over
                while True:
                    k = i + 1
                    while k < len(lines) and not lines[k].strip():
                        k += 1
                    if k < len(lines) and plain_line(k) and _QUOTE_START.match(lines[k]):
                        out.append((k, lines[k]))
                        i = k
                    else:
                        break
        i += 1
    return out


def own_voice(text: str) -> list[str]:
    """The script's own voice lines ("Voice: …", or under a "Voice Over" label), quotes taken off."""
    return [ln for ln in (w.strip().strip("\"“”«»'").strip() for _, w in _voice_lines(text)) if ln]


_QUOTED = re.compile(r"[\"“]([^\"“”\n]{2,120})[\"”]")


def own_onscreen(text: str) -> list[str]:
    """Every line a numbered script puts on screen in quotes — "On screen:",
    "Subtitle:", its features, its final titles — never its Voice lines."""
    first = _SCENE_HEAD.search(text or "")
    if not first:
        return []
    out = []
    spoken = {n for n, _ in _voice_lines(text)}  # a quoted voice line is said, not shown
    start = text[: first.start()].count("\n")
    for n, line in enumerate(text[first.start() :].splitlines(), start):
        if n in spoken or _VOICE_LINE.match(line):
            continue
        for q in _QUOTED.findall(line):  # "A · B" may be shown as two items — each part counts
            out += [part.strip() for part in re.split(r"\s+[·|]\s+", q) if len(part.strip()) > 1]
    return list(dict.fromkeys(out))


def _shown(raw_scenes) -> str:
    """Every word a raw storyboard puts on screen (all its text but the voice lines), plain."""
    bits: list[str] = []

    def walk(v, key=""):
        if key == "say":
            return
        if isinstance(v, str):
            bits.append(v)
        elif isinstance(v, dict):
            for k, x in v.items():
                walk(x, k)
        elif isinstance(v, list):
            for x in v:
                walk(x, key)

    walk(raw_scenes)
    return _plain(" ".join(bits))


def _missing_onscreen(idea: str, raw: dict) -> list[str]:
    shown = _shown(raw.get("scenes") or [])
    return [q for q in own_onscreen(idea) if _plain(q) not in shown]


_PUNCT = ".,!?;:\"“”‘’'«»()…—–-"


def _keep_own_voice(script: dict, idea: str) -> None:
    """A script with its own Voice lines: a `say` that isn't from them (the AI
    filled a scene with a line of its own) is taken out — the scene plays
    without a voice rather than say something they never wrote."""
    lines = own_voice(idea)
    if not lines:
        return
    theirs = _plain(" ".join(lines))
    # a line the AI took from anywhere in their script is theirs too — however the
    # script lays its voice-over out (a format we don't read must not silence a scene);
    # only words they never wrote take a line out
    written = _plain(idea)
    words = {w.strip(_PUNCT) for w in written.split()}
    # one storyboard scene per Voice line: each scene says exactly the person's
    # line — the AI's light rewrites ("ចាំ" → "រង់ចាំ", an added opening) and its
    # translations never replace words they wrote themselves
    if len(lines) == len(script["scenes"]):
        for sc, line in zip(script["scenes"], lines):
            sc["say"] = _line(line, PICTURE_SAY_MAX if sc["type"] == "shot" else 300)
        return
    for sc in script["scenes"]:
        said = _plain(sc.get("say"))
        if said and (said in theirs or said in written):
            continue
        mine = [w.strip(_PUNCT) for w in said.split()]
        if not said or sum(1 for w in mine if w in words) / max(1, len(mine)) < 0.75:
            if said:
                log.info(
                    "storyboard: a voice line the script doesn't have taken out: %s",
                    _line(sc["say"], 80),
                )
            sc["say"] = ""


def own_design(text: str) -> bool:
    """A script that designs its own film: numbered scenes AND visual
    direction (looks, backgrounds, colours, a pause, a reveal…) — the AI
    design style follows that; a fixed template can't."""
    return own_scenes(text) >= 3 and len(_LOOK_WORDS.findall(text or "")) >= 4


def stated_seconds(text: str) -> int:
    """The length a brief asks for in its first lines ("Duration: about 2 minutes
    (120 seconds)", "about 80 seconds") — 0 when it doesn't say."""
    head = (text or "")[:600]
    m = re.search(r"(\d{2,3})\s*(?:seconds|secs?)\b", head, re.I)
    if m:
        return int(m[1])
    m = re.search(r"(\d(?:\.\d)?)\s*(?:minutes?|mins?)\b", head, re.I)
    return int(float(m[1]) * 60) if m else 0


def story_seconds(text: str, length: str = "auto", cap: int = STORY_MAX_S) -> int:
    """How long a story video should be: "60" / "120" / "300" / "600", or from
    how long the story takes to read aloud (Khmer ~11 characters a second,
    English ~2.6 words), between 30 s and ``cap`` (10 minutes, every template)."""
    if length in ("60", "120", "300", "600"):
        return min(int(length), cap)
    if stated_seconds(text) >= 20:  # the brief says how long
        return int(min(cap, stated_seconds(text)))
    lines = own_voice(text)
    if lines and own_scenes(text):  # a written script: its voice lines + a beat per scene
        said = " ".join(lines)
        spoken = (
            sum(1 for ch in said if "\u1780" <= ch <= "\u17ff") / 11
            + len(re.findall(r"[A-Za-z0-9]+", said)) / 2.6
            + 2.5 * own_scenes(text)
        )
        return int(min(cap, max(30, round(spoken / 5) * 5)))
    khmer = sum(1 for ch in text if "\u1780" <= ch <= "\u17ff")
    spoken = khmer / 11 + len(re.findall(r"[A-Za-z0-9]+", text)) / 2.6
    return int(min(cap, max(30, round(spoken / 15) * 15)))


def estimate_seconds(script: dict) -> int:
    """Roughly how long the video will run, before the voice is recorded."""
    total = 0.0
    for sc in script["scenes"]:
        say = sc.get("say") or ""
        spoken = (
            sum(1 for ch in say if "\u1780" <= ch <= "\u17ff") / 11
            + len(re.findall(r"[A-Za-z0-9]+", say)) / 2.6
        )
        total += max(default_seconds(sc), spoken + 1.3)
    return round(total - TRANSITION_S * (len(script["scenes"]) - 1))


def story_language(idea: str, picked: str) -> str:
    """The language of the person's own story — Khmer when most of its letters
    are Khmer, English when they're Latin, else what they picked. A script
    with its own Voice / Narration lines speaks the language of those lines:
    its visual prompts are often English, and longer, but the voice is what
    the video says and shows."""
    voice = " ".join(own_voice(idea))
    if voice.strip():
        idea = voice
    km = sum(1 for ch in idea if "\u1780" <= ch <= "\u17ff")
    latin = sum(1 for ch in idea if ch.isascii() and ch.isalpha())
    if km > latin * 2:
        return "Khmer"
    if latin > km * 2:
        return "English"
    return picked


def _only_story_numbers(scene: dict, story: str, allowed: tuple = ()) -> dict:
    """Story mode: a chart / stat / result / dashboard whose numbers the story
    never gave is turned into a plain statement of that line (its words and
    voice kept) — the video never shows a figure the person didn't write."""
    have = _numbers_in(story) | {0.0}
    kind = scene["type"]
    if kind in (
        "moment",
        "ledger",
    ):  # Life story: its props and its ledger show only the story's money
        if all(n in have for n in _life_numbers(scene)):
            return scene
        prop = scene.get("prop") or {}
        if kind == "ledger":  # the person writing it down, the lines without their amounts
            lines = [{"text": x["label"], "amount": ""} for x in scene.get("lines") or []][:3]
            return {k: v for k, v in scene.items() if k not in ("lines", "total", "title")} | {
                "type": "moment",
                "place": 1,
                "pose": "write",
                "mood": "thinking",
                "text": scene.get("title") or "",
                "prop": {"kind": "notebook", "label": "", "lines": lines},
            }
        bare = {
            "kind": prop["kind"],
            "label": "" if _numbers_in(prop.get("label") or "") else prop.get("label") or "",
        }
        if prop.get("paid"):
            bare["paid"] = True
        if prop["kind"] == "calendar":
            bare["done"] = prop.get("done", 10)
        if prop.get("lines"):
            bare["lines"] = [{"text": x["text"], "amount": ""} for x in prop["lines"]]
        return {**scene, "prop": bare}
    if kind in ("stat", "result"):
        nums = [float(scene.get("value") or 0)]
    elif kind == "tally":
        nums = [float(scene.get("value") or 0), float(scene.get("start") or 0)]
    elif kind == "bignum":  # Slides: the big number
        nums = [float(scene.get("value") or 0)]
    elif kind == "barchart":  # Slides: the bars
        nums = [float(d.get("value") or 0) for d in scene.get("data") or []]
    elif kind == "gains":  # AI service: the results
        nums = [float(m.get("value") or 0) for m in scene.get("metrics") or []]
    elif kind == "plans":  # AI service: the prices
        nums = [n for x in scene.get("tiers") or [] for n in _numbers_in(x.get("price") or "")]
    elif kind == "fact" and scene.get("value"):  # Illustrated: the number on the card
        nums = [float(scene.get("value") or 0)]
    elif kind == "crowd":  # 3D · Street: the board's number
        nums = [float(scene.get("value") or 0), float(scene.get("start") or 0)]
    elif kind == "chart":
        nums = [float(v) for ser in scene.get("series") or [] for v in ser.get("values") or []]
    elif kind == "dashboard":
        nums = [float(m.get("value") or 0) for m in scene.get("metrics") or []]
    else:
        return scene
    if all(n in have for n in nums):
        return scene
    if kind in ("bignum", "barchart"):  # Slides: the line as one big sentence
        line = scene.get("label") or scene.get("title") or scene.get("text") or ""
        return (
            {"type": "statement", "text": line, "sub": "", "say": scene.get("say", "")}
            if line
            else scene
        )
    if kind == "plans":  # AI service: the plans without prices
        return {**scene, "tiers": [{**x, "price": ""} for x in scene["tiers"]]}
    if kind == "gains":  # AI service: the line alone
        return (
            {
                "type": "hook",
                "text": scene.get("text") or "",
                "icon": "TrendingUp",
                "say": scene.get("say", ""),
            }
            if scene.get("text")
            else scene
        )
    if kind == "fact":  # Illustrated: the card without its number
        return {k: v for k, v in scene.items() if k not in ("value", "prefix", "suffix")}
    if kind == "crowd":  # 3D · Street: the people walk in, without the board
        return {
            k: v
            for k, v in scene.items()
            if k not in ("label", "value", "start", "prefix", "suffix")
        }
    if kind == "tally" and "tale" in allowed:  # Parable: the moment, without the chalkboard
        return {
            k: v
            for k, v in scene.items()
            if k not in ("label", "value", "start", "prefix", "suffix")
        } | {"type": "tale"}
    text = scene.get("title") or scene.get("label") or ""
    if "reveal" in allowed:
        return {
            "type": "reveal",
            "text": text,
            "icon": scene.get("icon") or "Lightbulb",
            "say": scene.get("say", ""),
        }
    if "character" in allowed:  # Teach: the person, thinking it over
        return {
            "type": "character",
            "title": text,
            "mood": "thinking",
            "icon": "",
            "tag": "",
            "say": scene.get("say", ""),
        }
    return (
        {"type": "list", "title": text, "items": [], "say": scene.get("say", "")}
        if "list" in allowed
        else scene
    )


if TYPE_CHECKING:  # loaded after this module — app/video/motion/__init__.py binds these (_link)
    from app.video.motion.props import default_seconds
