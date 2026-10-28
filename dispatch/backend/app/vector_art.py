"""AI design's vector pictures (style "canvas", theme pictures "vector" — the
default): the writing AI draws each picture itself as flat vector SVG, in the
film's colours, with the same people in every scene (theme["cast"], and the
film's first picture handed to the rest as their reference). Crisp at any size,
the brand's exact colours, and no image model's look-of-the-day.

The pictures move: the AI tags parts with one of MOVES (stars twinkle, eyes
blink, chat messages pop in one by one…) and motion/src/canvas.jsx VectorArt
plays them frame by frame — the AI never writes code, only these names. Short
real words (a chat bubble, "24/7" on a robot) may be drawn as <text>, set in
the video's own font.

The SVG is the AI's text, so it is cleaned before it goes anywhere: only plain
drawing elements, text, presentation attributes and the move tags are kept —
no scripts, events, links, styles, fonts, external references or embedded
images. A picture that fails (or comes back empty) returns None; app/doodle.py
draw_pictures then paints it with the image model instead, or shows its icon.
"""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET

log = logging.getLogger(__name__)

SVG_NS = "http://www.w3.org/2000/svg"
MAX_SVG = 60_000  # characters — a scene picture, not a poster
MIN_SHAPES = 6  # fewer = it didn't really draw anything
MAX_WORDS = 80  # characters of one <text> / <tspan>

# drawing elements and short text only (no image, use, foreignObject, script, style, a, animate…)
TAGS = {
    "svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
    "linearGradient", "radialGradient", "stop", "clipPath", "text", "tspan",
}
SHAPES = {"path", "rect", "circle", "ellipse", "line", "polyline", "polygon"}
ATTRS = {
    "id", "viewBox", "preserveAspectRatio", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
    "width", "height", "points", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
    "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity", "transform", "offset", "stop-color",
    "stop-opacity", "gradientUnits", "gradientTransform", "fx", "fy", "clip-path", "clipPathUnits", "clip-rule",
    # text — never a font-family: the video's own font (Khmer-ready) is used
    "dx", "dy", "text-anchor", "font-size", "font-weight", "letter-spacing", "dominant-baseline",
}
# The moves a part can be tagged with (class="…"), played by canvas.jsx VectorArt.
MOVES = ("twinkle", "blink", "wave", "float", "bob", "glow", "pop", "typing", "spin", "sway")
_LOCAL_URL = re.compile(r"^url\(#[\w-]{1,40}\)$")
_NUM = re.compile(r"^-?\d{1,5}(\.\d{1,3})?$")

PROMPT = (
    "You are a senior illustrator and motion designer who draws in code. Draw ONE flat "
    "vector illustration as SVG for a scene of a marketing video.\n"
    "RULES:\n"
    "- viewBox=\"0 0 {w} {h}\". {frame}\n"
    "- Flat 2D vector: simple confident shapes, flat fills (a soft gradient on the background "
    "is fine), no outlines except where they help, no photo-realism, no 3D.\n"
    "- COMPOSITION: the subject is BIG — {subject}; a person's head is at least 1/8 of the "
    "picture's height. Build it in layers, "
    "back to front: the back wall or sky, the floor or ground, the furniture / setting, the "
    "people, then 1-2 foreground details. Generous margins — nothing cut off at the edges.\n"
    "- PEOPLE: built from clear parts — head, hair as its own shape, neck, body in their "
    "clothes, both arms with simple hands, legs and feet — in a natural pose that acts out "
    "the moment (lying, holding a phone, waving). Simple friendly faces: dot eyes, small "
    "smile or the feeling the moment needs, a touch of cheek colour.\n"
    "- DETAIL: 40-120 shapes — enough that it looks finished (a pillow and blanket on the "
    "bed, a book on the desk, light glowing from a lamp), never a bare sketch. Everyday "
    "Cambodian life when it fits.\n"
    "- The people look EXACTLY like this in every scene of the film (same skin, hair, "
    "clothes): {cast}\n"
    "- Colours: {palette}. Use them; add skin tones and soft neutrals only.\n"
    "- MOTION — the video brings the picture to life. Tag 3-8 parts by wrapping each in a <g> "
    "whose class is the move's own name — e.g. <g class=\"twinkle\">…</g>, <g class=\"pop\" "
    "data-delay=\"1.5\">…</g> (that <g> itself has NO transform attribute). The names:\n"
    "  twinkle = stars, fairy lights · blink = a <g> around BOTH eyes of one face · wave = a raised "
    "arm or hand, with data-pivot=\"x y\" at the shoulder · float = question marks, hearts, bubbles "
    "drifting up · bob = a person or robot gently moving up and down · glow = a lamp's or a "
    "screen's light · sway = a plant, a curtain · spin = a slow sun or gear · pop = appears at "
    "data-delay=\"seconds\" (chat messages, items, icons — one after another, 0.6-1.2 s apart) · "
    "typing = three dots shown from data-delay until data-until=\"seconds\", just before a reply pops.\n"
    "  Give every scene at least one gentle looping move (twinkle / blink / glow / bob / sway). "
    "The scene lasts about {seconds} s — every data-delay under {last} s.\n"
    "- WORDS: only where the moment needs real words — a chat bubble (max 8 words), a label on "
    "a screen, sign or shirt (\"24/7\"). In {language}. Use <text> with x, y, font-size (at least "
    "{min_font}), font-weight, fill and text-anchor — no font-family. Never the scene's headline "
    "(the video sets it), never long sentences; no letters drawn as shapes.\n"
    "- No <image>, <script>, <style>, <use>, links or CSS. Only path, rect, circle, ellipse, line, "
    "polyline, polygon, g, defs, linearGradient, radialGradient, stop, clipPath, text, tspan.\n"
    "- Under {kb} KB: good shapes, not thousands of points.\n"
    'Return JSON: {{"svg": "<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 {w} {h}\\">…</svg>"}}'
)


def _move_attrs(el) -> None:
    """Only a known move, and its timing as plain numbers, stay on a part."""
    move = next((c for c in str(el.attrib.pop("class", "")).split() if c in MOVES), "")
    timing = {k: el.attrib.pop(k, "") for k in ("data-delay", "data-until", "data-pivot")}
    if not move:
        return
    el.attrib["class"] = move
    for k in ("data-delay", "data-until"):
        v = timing[k].strip().rstrip("s")
        if _NUM.match(v) and 0 <= float(v) <= 30:
            el.attrib[k] = v
    pivot = timing["data-pivot"].replace(",", " ").split()
    if len(pivot) == 2 and all(_NUM.match(p) for p in pivot):
        el.attrib["data-pivot"] = " ".join(pivot)


def clean_svg(text: str) -> str | None:
    """``text`` (the AI's SVG) with only plain drawing, short text and move tags
    left, as SVG text — or None when it isn't a usable drawing."""
    text = (text or "").strip()
    a, b = text.find("<svg"), text.rfind("</svg>")
    if a < 0 or b < a or b - a > MAX_SVG:
        return None
    text = text[a : b + 6]
    if re.search(r"<!(DOCTYPE|ENTITY)", text, re.I):  # no entity tricks
        return None
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return None
    shapes = 0

    def keep(el, in_text: bool = False) -> bool:
        nonlocal shapes
        tag = el.tag.split("}")[-1]
        if tag not in TAGS or (in_text and tag != "tspan"):
            return False
        shapes += tag in SHAPES
        _move_attrs(el)
        for k in list(el.attrib):
            name = k.split("}")[-1]
            v = el.attrib[k]
            if name in ("class", "data-delay", "data-until", "data-pivot"):
                continue  # checked by _move_attrs
            # a colour or clip may point at a gradient / clip in this SVG — nothing else
            bad = "url(" in v and not _LOCAL_URL.match(v.strip())
            if name not in ATTRS or bad or len(v) > 20_000:
                del el.attrib[k]
            elif k != name:  # a namespaced attribute — kept plain
                del el.attrib[k]
                el.attrib[name] = v
        words = tag in ("text", "tspan")
        el.text = " ".join(el.text.split())[:MAX_WORDS] if words and el.text else None
        for child in list(el):
            if not keep(child, words):
                el.remove(child)
            elif not words:
                child.tail = None
            elif child.tail:
                child.tail = " ".join(child.tail.split())[:MAX_WORDS]
        return True

    if root.tag.split("}")[-1] != "svg" or not keep(root):
        return None
    if shapes < MIN_SHAPES:
        return None
    _lift_moves(root)
    root.attrib.pop("width", None)  # the video sizes it
    root.attrib.pop("height", None)
    ET.register_namespace("", SVG_NS)
    out = ET.tostring(root, encoding="unicode")
    if "xmlns=" not in out[:200]:
        out = out.replace("<svg", f'<svg xmlns="{SVG_NS}"', 1)
    return out


def _lift_moves(parent) -> None:
    """A moving part that also has its own transform gets a plain <g> around it
    carrying the move — the video's motion would otherwise replace its transform."""
    for i, child in enumerate(list(parent)):
        _lift_moves(child)
        if child.attrib.get("class") and child.attrib.get("transform"):
            g = ET.Element(f"{{{SVG_NS}}}g", {k: child.attrib.pop(k) for k in ("class", "data-delay", "data-until", "data-pivot") if k in child.attrib})
            parent.remove(child)
            g.append(child)
            parent.insert(i, g)


# Claude draws far better in SVG than the other writers (measured on the same
# scene) — it draws every vector picture when the platform has it.
ARTIST = "claude-opus-5-5"


def artist() -> str:
    """The model that draws: ARTIST when configured, else the workspace's writer."""
    from app import ai_models
    from app.content_ai import writer_model

    return ARTIST if ai_models.configured(ARTIST) else writer_model()


CARD = (
    "Draw the whole picture inside ONE rounded panel: a <rect> filling the viewBox with "
    "rx=\"48\" as its background, in the colours below."
)
CARD_SUBJECT = "it fills the middle 60-70% of the panel, centred a little low"
# The whole video frame: the headline and the brand's logo sit on its empty corner.
FULL = (
    "This picture IS the whole video frame. Start with a <rect> filling the ENTIRE viewBox "
    "(no rounded corners) as the background: a {tone} colour that suits this moment (night: "
    "deep navy; morning: warm cream; a shop: soft peach…) — big words in {ink} go on it, so "
    "keep it {tone} everywhere they sit. KEEP EMPTY — plain background only, nothing drawn, "
    "no glow: {zone}; the logo and the headline go there. Keep the bottom 12% calm too "
    "(subtitles)."
)
FULL_SUBJECT = {
    "wide": "it fills the right half of the frame, from top to bottom, plus the lower-left corner",
    "tall": "it fills the lower 55% of the frame, side to side",
}
# exact numbers: "the top-left corner" alone let a tall plant grow into the headline
FULL_ZONE = {
    "wide": "the box x 0-980, y 0-640 (the left half, top 60%) — nothing there at all, not a leaf, lamp, sparkle or shelf; things on the left stay below y 640",
    "tall": "the box y 0-820 across the whole width (the top 43%) — nothing there at all; everything drawn stays below y 820",
}
REFERENCE_CHARS = 24_000  # of the film's first picture, handed to the others


def draw(
    draw_: str, *, cast: str, palette: str, tall: bool = False, full: str = "", light: bool = False,
    seconds: float = 5, language: str = "English", reference: str = "",
) -> str | None:
    """One scene's picture as cleaned SVG text (None if it couldn't be drawn) —
    a rounded card, or (``full`` "wide" / "tall") the whole video frame with its
    corner left empty for the words. ``light``: a light scene (dark words).
    ``reference``: the film's first picture — its people are drawn the same way.
    Charged like any AI writing, to the job's workspace."""
    from app.content_ai import ContentAIError, _chat

    if full in FULL_ZONE:
        w, h = (1920, 1080) if full == "wide" else (1080, 1920)
        frame = FULL.format(tone="light" if light else "dark", ink="dark ink" if light else "white", zone=FULL_ZONE[full])
        subject = FULL_SUBJECT[full]
    else:
        w, h = (800, 900) if tall else (900, 700)
        frame, subject = CARD, CARD_SUBJECT
    seconds = max(3.0, min(12.0, float(seconds or 5)))
    system = PROMPT.format(
        w=w, h=h, frame=frame, subject=subject,
        cast=cast or "simple friendly Cambodian people, one look each, kept the same",
        palette=palette, kb=MAX_SVG // 1000 - 10, seconds=round(seconds, 1), last=round(seconds - 1, 1),
        language=language or "English", min_font=round(max(w, h) / 48),
    )
    ask = f"The picture: {draw_}"
    if reference:
        ask += (
            "\n\nTHE FILM'S FIRST PICTURE — draw its people (and any robot or mascot) EXACTLY the "
            "same: reuse their shapes, proportions and colours from this code, moved and posed "
            "for this moment:\n" + reference[:REFERENCE_CHARS]
        )
    try:
        out = _chat(
            [{"role": "system", "content": system}, {"role": "user", "content": ask}],
            artist(),
            max_tokens=16000,
            effort="medium",
        )
    except ContentAIError as exc:
        log.warning("vector picture failed: %s", exc)
        return None
    svg = clean_svg(str(out.get("svg") or ""))
    if not svg:
        log.warning("vector picture: no usable SVG for %r", draw_[:80])
    return svg
