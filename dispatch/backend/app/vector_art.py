"""AI design's vector pictures (style "canvas", theme pictures "vector" — the
default): the writing AI draws each picture itself as flat vector SVG, in the
film's colours, with the same people in every scene (theme["cast"]). Crisp at
any size, the brand's exact colours, and no image model's look-of-the-day.

The SVG is the AI's text, so it is cleaned before it goes anywhere: only plain
drawing elements and presentation attributes are kept — no scripts, events,
links, external references, text or embedded images. A picture that fails
(or comes back empty) returns None; app/doodle.py draw_pictures then paints it
with the image model instead, or shows its icon.
"""

from __future__ import annotations

import base64
import logging
import re
import xml.etree.ElementTree as ET

log = logging.getLogger(__name__)

SVG_NS = "http://www.w3.org/2000/svg"
MAX_SVG = 60_000  # characters — a scene picture, not a poster
MIN_SHAPES = 6  # fewer = it didn't really draw anything

# drawing elements only (no text, image, use, foreignObject, script, style, a, animate…)
TAGS = {
    "svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
    "linearGradient", "radialGradient", "stop", "clipPath",
}
SHAPES = {"path", "rect", "circle", "ellipse", "line", "polyline", "polygon"}
ATTRS = {
    "id", "viewBox", "preserveAspectRatio", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
    "width", "height", "points", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
    "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity", "transform", "offset", "stop-color",
    "stop-opacity", "gradientUnits", "gradientTransform", "fx", "fy", "clip-path", "clipPathUnits", "clip-rule",
}
_LOCAL_URL = re.compile(r"^url\(#[\w-]{1,40}\)$")

PROMPT = (
    "You are a senior illustrator who draws in code. Draw ONE flat vector illustration as "
    "SVG for a scene of a marketing video.\n"
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
    "- ABSOLUTELY NO <text>, letters, numbers or words anywhere, no <image>, no <script>, "
    "no <style>, no links. Only path, rect, circle, ellipse, line, polyline, polygon, g, "
    "defs, linearGradient, radialGradient, stop, clipPath.\n"
    "- Under {kb} KB: good shapes, not thousands of points.\n"
    'Return JSON: {{"svg": "<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 {w} {h}\\">…</svg>"}}'
)


def clean_svg(text: str) -> str | None:
    """``text`` (the AI's SVG) with only plain drawing left, as SVG text — or
    None when it isn't a usable drawing."""
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

    def keep(el) -> bool:
        nonlocal shapes
        tag = el.tag.split("}")[-1]
        if tag not in TAGS:
            return False
        shapes += tag in SHAPES
        for k in list(el.attrib):
            name = k.split("}")[-1]
            v = el.attrib[k]
            # a colour or clip may point at a gradient / clip in this SVG — nothing else
            bad = "url(" in v and not _LOCAL_URL.match(v.strip())
            if name not in ATTRS or bad or len(v) > 20_000:
                del el.attrib[k]
            elif k != name:  # a namespaced attribute — kept plain
                del el.attrib[k]
                el.attrib[name] = v
        for child in list(el):
            if not keep(child):
                el.remove(child)
        el.text = None  # no words in the picture, ever
        return True

    if root.tag.split("}")[-1] != "svg" or not keep(root):
        return None
    if shapes < MIN_SHAPES:
        return None
    root.attrib.pop("width", None)  # the video sizes it
    root.attrib.pop("height", None)
    ET.register_namespace("", SVG_NS)
    out = ET.tostring(root, encoding="unicode")
    if "xmlns=" not in out[:200]:
        out = out.replace("<svg", f'<svg xmlns="{SVG_NS}"', 1)
    return out


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
FULL_ZONE = {"wide": "the LEFT HALF of the TOP HALF of the frame", "tall": "the TOP 42% of the frame"}


def draw(draw_: str, *, cast: str, palette: str, tall: bool = False, full: str = "", light: bool = False) -> str | None:
    """One scene's picture as an SVG data URI (None if it couldn't be drawn) —
    a rounded card, or (``full`` "wide" / "tall") the whole video frame with its
    corner left empty for the words. ``light``: a light scene (dark words).
    Charged like any AI writing, to the job's workspace."""
    from app.content_ai import ContentAIError, _chat

    if full in FULL_ZONE:
        w, h = (1920, 1080) if full == "wide" else (1080, 1920)
        frame = FULL.format(tone="light" if light else "dark", ink="dark ink" if light else "white", zone=FULL_ZONE[full])
        subject = FULL_SUBJECT[full]
    else:
        w, h = (800, 900) if tall else (900, 700)
        frame, subject = CARD, CARD_SUBJECT
    system = PROMPT.format(w=w, h=h, frame=frame, subject=subject, cast=cast or "simple friendly Cambodian people, one look each, kept the same", palette=palette, kb=MAX_SVG // 1000 - 10)
    try:
        out = _chat(
            [{"role": "system", "content": system}, {"role": "user", "content": f"The picture: {draw_}"}],
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
        return None
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
