"""The deck template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.common import _icon, _line, _number
from app.motion.templates._shared import _COMMON_RULES


# "Slides · Presentation" (motion/src/deck.jsx) — a slide deck from a prompt or a pasted
# text: presented in the app (PresentPage), downloaded as a PDF (deck_pdf), or played
# as a 16:9 video. One scene = one slide; hook = the cover, cta = the closing slide.
DECK_TYPES = (
    "hook",
    "agenda",
    "keypoints",
    "bignum",
    "barchart",
    "twocol",
    "pullquote",
    "picture",
    "roadmap",
    "statement",
    "cta",
)


DECK_PROMPT = (
    "You are a top presentation designer. You turn the brief into a clear, beautiful SLIDE DECK "
    "(8-14 slides) for a business audience — like the best pitch and training decks: one idea per "
    "slide, short words on the slide, the details in what the presenter says. Use the slide that "
    "fits each idea best and vary them; never a wall of text.\n"
    "\n"
    "THE DECK: a cover first (hook), often an agenda second, then the content slides, a closing "
    "slide last (cta).\n"
    'A DOCUMENT as the brief (read from a PDF / Word / PowerPoint): "# …" lines are its headings, '
    '"- …" its bullets, "a | b | c" its table rows, "## Slide 3: …" an old deck\'s slides. Follow '
    "its structure — each main heading becomes a slide (or two), bullets become keypoints / agenda / "
    "twocol, a table's numbers become a barchart or a bignum (its own numbers, exactly), an old "
    "deck's slides stay in their order — and cover EVERY section, condensed to the slides' few "
    "words; the details go in `say`.\n"
    "\n"
    "SLIDE TYPES and their fields:\n"
    "- hook (the cover): text (the deck's title, max 9 words), sub (one line, max 14 words).\n"
    "- agenda: title (max 6 words), entries (3-6 sections, max 7 words each).\n"
    "- keypoints: title (max 9 words), blocks (2-4: {title (max 4 words), text (max 14 words), icon}).\n"
    "- bignum: value (ONE true number from the brief or common knowledge), prefix (optional, e.g. $), "
    "suffix (optional, e.g. % or +), label (what it counts, max 8 words), text (optional, max 18 words).\n"
    "- barchart: title (max 9 words), data (2-7: {label (max 3 words), value (a number)}), suffix (optional "
    "unit, e.g. %) — ONLY numbers the brief gives.\n"
    "- twocol: title (max 8 words), cols (exactly 2: {label (max 4 words), items (2-5 lines, max 10 "
    "words each)}) — before / after, problem / solution, option A / option B.\n"
    "- pullquote: text (a quote or a key message, max 24 words), author (optional), role (optional).\n"
    "- picture: title (max 8 words), text (max 24 words), draw (ENGLISH, max 25 words — the picture "
    "beside the words: what it shows, never any text in it).\n"
    "- roadmap: title (max 8 words), stages (2-5 steps in order: {title (max 3 words), text (max 12 "
    "words)}).\n"
    "- statement: text (one big sentence, max 14 words), sub (optional, max 12 words).\n"
    "- cta (the closing slide): text (max 9 words), button (optional, 1-3 words — the next step).\n"
    "`say` is what the presenter says on that slide (it becomes the voice of the deck's video).\n"
    "Every word on the slides is in the LANGUAGE; names of products and brands as written.\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "sub": "...", "say": "..."}, {"type": "agenda", "title": '
    '"...", "entries": ["..."], "say": "..."}, {"type": "keypoints", "title": "...", "blocks": [{"title": "...", '
    '"text": "...", "icon": "Lightbulb"}], "say": "..."}, ..., {"type": "cta", "text": "...", "button": "...", '
    '"say": "..."}]}'
)


def _deck_scene(kind: str, raw: dict, say: str) -> dict | None:
    """Slides · Presentation: its own slides (None = not one of them, or empty)."""
    title = _line(raw.get("title"), 90)

    def items(key, n, most):
        return [
            _line(x, n)
            for x in (raw.get(key) if isinstance(raw.get(key), list) else [])
            if _line(x, n)
        ][:most]

    if kind == "agenda":
        entries = items("entries", 70, 6)
        return (
            {"type": kind, "title": title, "entries": entries, "say": say}
            if len(entries) >= 2
            else None
        )
    if kind == "keypoints":
        blocks = [
            {
                "title": _line(b.get("title"), 40),
                "text": _line(b.get("text"), 120),
                "icon": _icon(b.get("icon"), "Lightbulb"),
            }
            for b in (raw.get("blocks") if isinstance(raw.get("blocks"), list) else [])
            if isinstance(b, dict) and _line(b.get("title"), 40)
        ][:4]
        return (
            {"type": kind, "title": title, "blocks": blocks, "say": say}
            if len(blocks) >= 2
            else None
        )
    if kind == "bignum":
        value = _number(raw.get("value")) if raw.get("value") not in (None, "") else 0.0
        label = _line(raw.get("label"), 80)
        if value <= 0 or not label:
            return None
        return {
            "type": kind,
            "value": int(value) if value == int(value) else round(value, 1),
            "prefix": _line(raw.get("prefix"), 3),
            "suffix": _line(raw.get("suffix"), 8),
            "label": label,
            "text": _line(raw.get("text"), 160),
            "say": say,
        }
    if kind == "barchart":
        data = []
        for d in raw.get("data") if isinstance(raw.get("data"), list) else []:
            if isinstance(d, dict) and _line(d.get("label"), 24) and _number(d.get("value")) > 0:
                v = _number(d.get("value"))
                data.append(
                    {
                        "label": _line(d.get("label"), 24),
                        "value": int(v) if v == int(v) else round(v, 1),
                    }
                )
        return (
            {
                "type": kind,
                "title": title,
                "data": data[:7],
                "suffix": _line(raw.get("suffix"), 6),
                "say": say,
            }
            if len(data) >= 2
            else None
        )
    if kind == "twocol":
        cols = []
        for c in (raw.get("cols") if isinstance(raw.get("cols"), list) else [])[:2]:
            if not isinstance(c, dict):
                continue
            lines = [
                _line(x, 90)
                for x in (c.get("items") if isinstance(c.get("items"), list) else [])
                if _line(x, 90)
            ][:5]
            if _line(c.get("label"), 34) and lines:
                cols.append({"label": _line(c.get("label"), 34), "items": lines})
        return {"type": kind, "title": title, "cols": cols, "say": say} if len(cols) == 2 else None
    if kind == "pullquote":
        text = _line(raw.get("text"), 220)
        return (
            {
                "type": kind,
                "text": text,
                "author": _line(raw.get("author"), 40),
                "role": _line(raw.get("role"), 50),
                "say": say,
            }
            if text
            else None
        )
    if kind == "picture":
        scene = {
            "type": kind,
            "title": title,
            "text": _line(raw.get("text"), 200),
            "icon": _icon(raw.get("icon"), "Image"),
            "say": say,
        }
        if _line(raw.get("draw"), 300):
            scene["draw"] = _line(raw["draw"], 300)  # painted beside the words (app/doodle.py)
        return scene if title else None
    if kind == "roadmap":
        stages = [
            {"title": _line(x.get("title"), 30), "text": _line(x.get("text"), 100)}
            for x in (raw.get("stages") if isinstance(raw.get("stages"), list) else [])
            if isinstance(x, dict) and _line(x.get("title"), 30)
        ][:5]
        return (
            {"type": kind, "title": title, "stages": stages, "say": say}
            if len(stages) >= 2
            else None
        )
    return None
