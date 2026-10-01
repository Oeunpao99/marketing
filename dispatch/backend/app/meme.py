"""Meme posters for the Relatable / fun pillar — the entertainment posts people
share, which is how a page reaches people who don't follow it yet.

The image model draws only the funny photo (it garbles Khmer letters), and
this module adds the setup text above it in a real Khmer + Latin font:

    ┌──────────────────────────────┐
    │ Customer: "Price?" at 2 AM   │  ← white band, bold text (meme["top"])
    │ Me, the shop owner:          │
    ├──────────────────────────────┤
    │        the funny photo       │  ← meme["scene"], no text in it
    │                   [brand] ▪  │  ← small brand tag, so shares carry it
    └──────────────────────────────┘

Khmer needs complex-script shaping (subscript consonants, vowels drawn
before their consonant): Pillow does that only with libraqm installed —
the Dockerfile installs it. Without it (e.g. a Windows dev machine) Latin
text still renders correctly; Khmer would come out mis-ordered, so it's logged.
"""

from __future__ import annotations

import io
import logging
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, features

log = logging.getLogger("app.meme")

FONT_PATH = Path(__file__).parent / "assets" / "fonts" / "KantumruyPro.ttf"
WIDTH = 1080
PAD = 56
MAX_LINES = 4
_KHMER = range(0x1780, 0x1800)


def image_size(blob: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(blob)).size


def meme_photo_prompt(scene: str) -> str:
    """The image brief for the photo half of a meme — the punchline, with no
    text in it (the setup text is drawn on top by render_meme)."""
    return (
        f"A funny, candid, photorealistic photo for a social media meme: {scene.strip()}. "
        "It should look like a real phone photo of a relatable everyday moment — natural light, "
        "genuine expression, a little comic. Where people or places appear, set it in Cambodia "
        "(Cambodian people, Phnom Penh shops, homes and offices). One clear subject, simple "
        "background, square framing. Absolutely no text, letters, captions, signs with words, "
        "logos or watermarks anywhere in the image."
    )


@lru_cache(maxsize=8)
def _font(size: int, weight: str = "Bold") -> ImageFont.FreeTypeFont:
    layout = ImageFont.Layout.RAQM if features.check("raqm") else ImageFont.Layout.BASIC
    f = ImageFont.truetype(str(FONT_PATH), size, layout_engine=layout)
    try:
        f.set_variation_by_name(weight)
    except (OSError, ValueError):
        pass  # a static build of the font — its default weight
    return f


# Typographic characters the AI likes to write, and what to draw instead when
# the font has no glyph for them (they'd come out as an empty box).
_LOOKALIKE = {
    "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-",
    " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
    "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...",
}


@lru_cache(maxsize=4096)
def _has_glyph(ch: str) -> bool:
    """Whether the font draws ``ch`` itself rather than its 'missing' box —
    told by comparing its shape with that of a private-use character."""
    def shape(c: str) -> bytes:
        img = Image.new("L", (64, 64))
        ImageDraw.Draw(img).text((8, 4), c, font=_font(40), fill=255)
        return img.tobytes()

    return shape(ch) != shape("")


def drawable(text: str) -> str:
    """``text`` with every character the font can't draw swapped for a plain
    lookalike or dropped. Khmer, ASCII, joiners and line breaks pass as-is."""
    out = []
    for ch in text or "":
        if ch.isascii() or ord(ch) in _KHMER or ch in "​‌‍" or _has_glyph(ch):
            out.append(ch)
        elif ch in _LOOKALIKE:
            out.append(_LOOKALIKE[ch])
    return "".join(out)


def _has_khmer(text: str) -> bool:
    return any(ord(ch) in _KHMER for ch in text)


def _can_break_before(text: str, i: int) -> bool:
    """A safe line break before text[i] inside a run with no spaces: a zero-
    width space, or a Khmer base letter (consonant / independent vowel) not
    joined to the one before by a coeng (U+17D2) — never inside a cluster."""
    ch = text[i]
    if text[i - 1] == "​":
        return True
    return 0x1780 <= ord(ch) <= 0x17B3 and text[i - 1] != "្"


def _split_long(word: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    """A word wider than ``width`` (Khmer writes whole phrases without
    spaces) cut at safe break points into pieces that fit."""
    if font.getlength(word) <= width:
        return [word]
    points = [i for i in range(1, len(word)) if _can_break_before(word, i)] + [len(word)]
    pieces, start = [], 0
    while start < len(word):
        best = best_word = None
        for b in points:
            if b <= start:
                continue
            if font.getlength(word[start:b]) > width:
                break
            best = b
            if b == len(word) or word[b - 1] == "​":
                best_word = b  # a real word boundary — preferred over a cluster break
        # One cluster wider than the line on its own: it goes alone.
        best = best_word or best or next(b for b in points if b > start)
        pieces.append(word[start:best])
        start = best
    return pieces


def _wrap(text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    """Greedy wrap on spaces; a run too wide for one line (Khmer puts spaces
    only between phrases) is split at safe Khmer break points."""
    lines: list[str] = []
    for para in text.split("\n"):
        words = [piece for w in para.split(" ") for piece in _split_long(w, font, width)]
        line = ""
        for w in words:
            test = f"{line} {w}".strip()
            if not line or font.getlength(test) <= width:
                line = test
            else:
                lines.append(line)
                line = w
        lines.append(line)
    return [ln for ln in lines if ln.strip()] or [""]


def _fit(text: str, width: int) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    """The biggest font size (64 → 34) at which the text fits in MAX_LINES
    lines with no line wider than the band."""
    for size in range(64, 33, -4):
        font = _font(size)
        lines = _wrap(text, font, width)
        if len(lines) <= MAX_LINES and all(font.getlength(ln) <= width for ln in lines):
            return font, lines
    font = _font(34)
    return font, _wrap(text, font, width)[:MAX_LINES]


def render_meme(photo: bytes, top: str, brand: str = "") -> bytes:
    """Setup text on a white band above the photo (cropped square), with a
    small brand tag in the photo's corner. Returns a JPEG."""
    top = drawable(" ".join(top.replace("\r", "").split(" ")).strip())
    brand = drawable(brand)
    if _has_khmer(top) and not features.check("raqm"):
        log.warning("meme: Khmer text but Pillow has no raqm — install libraqm for correct shaping")

    img = Image.open(io.BytesIO(photo)).convert("RGB")
    side = min(img.size)
    left, upper = (img.width - side) // 2, (img.height - side) // 2
    img = img.crop((left, upper, left + side, upper + side)).resize((WIDTH, WIDTH), Image.LANCZOS)

    font, lines = _fit(top, WIDTH - 2 * PAD)
    ascent, descent = font.getmetrics()
    line_h = int((ascent + descent) * 1.18)
    band = PAD * 2 + line_h * len(lines) - int(line_h - ascent - descent)

    canvas = Image.new("RGB", (WIDTH, band + WIDTH), "white")
    draw = ImageDraw.Draw(canvas)
    y = PAD
    for ln in lines:
        draw.text((PAD, y), ln, font=font, fill=(17, 17, 17))
        y += line_h
    canvas.paste(img, (0, band))

    if brand.strip():
        tag_font = _font(30, "SemiBold")
        label = brand.strip()[:40]
        tw = int(tag_font.getlength(label))
        th = sum(tag_font.getmetrics())
        x1, y1 = WIDTH - 28, band + WIDTH - 28
        x0, y0 = x1 - tw - 36, y1 - th - 18
        overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        odraw.rounded_rectangle((x0, y0, x1, y1), radius=(y1 - y0) // 2, fill=(0, 0, 0, 140))
        odraw.text((x0 + 18, y0 + 8), label, font=tag_font, fill=(255, 255, 255, 235))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")

    out = io.BytesIO()
    canvas.save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()
