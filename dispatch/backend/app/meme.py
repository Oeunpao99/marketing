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

from app.khmer_words import breaks

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


@lru_cache(maxsize=64)
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


def _split_long(word: str, font: ImageFont.FreeTypeFont, width: int, clusters: bool = True) -> list[str]:
    """A word wider than ``width`` (Khmer writes whole phrases without
    spaces) cut into pieces that fit — between Khmer words (app/khmer_words.py)
    where it can. ``clusters=False``: only between words, so a piece may stay
    too wide (the caller then tries a smaller size instead)."""
    if font.getlength(word) <= width:
        return [word]
    words = breaks(word)
    inner = range(1, len(word))
    points = sorted(i for i in inner if i in words or (clusters and _can_break_before(word, i))) + [len(word)]
    pieces, start = [], 0
    while start < len(word):
        best = best_word = None
        for b in points:
            if b <= start:
                continue
            if font.getlength(word[start:b]) > width:
                break
            best = b
            if b == len(word) or b in words:
                best_word = b  # a real word boundary — preferred over a cluster break
        # One cluster wider than the line on its own: it goes alone.
        best = best_word or best or next(b for b in points if b > start)
        pieces.append(word[start:best])
        start = best
    return pieces


def _wrap(text: str, font: ImageFont.FreeTypeFont, width: int, clusters: bool = True) -> list[str]:
    """Greedy wrap, word by word: on spaces, and between the words of a Khmer
    phrase (which has no spaces — app/khmer_words.py finds them), so a line
    fills up instead of pushing a whole phrase down. A single word too wide
    for a line is split by _split_long."""
    lines: list[str] = []
    for para in text.split("\n"):
        line = ""
        for w in para.split(" "):
            cuts = [0, *sorted(breaks(w)), len(w)]
            pieces = [p for a, b in zip(cuts, cuts[1:]) for p in _split_long(w[a:b], font, width, clusters) if p]
            for k, piece in enumerate(pieces):
                test = f"{line}{' ' if k == 0 else ''}{piece}" if line else piece
                if not line or font.getlength(test) <= width:
                    line = test
                else:
                    lines.append(line)
                    line = piece
        lines.append(line)
    return [ln for ln in lines if ln.strip()] or [""]


def fit_lines(text: str, width: int, max_lines: int, sizes, weight: str = "Bold"):
    """(font, lines) at the biggest of ``sizes`` where ``text`` wraps into
    ≤ max_lines lines that each fit ``width``. Whole words first — a smaller
    size beats breaking inside a Khmer word; only if no size works does it
    break between syllables. Nothing is ever cut: if it still doesn't fit,
    the smallest size with every line."""
    sizes = list(sizes)
    for clusters in (False, True):
        for size in sizes:
            font = _font(size, weight)
            lines = _wrap(text, font, width, clusters)
            if len(lines) <= max_lines and all(font.getlength(ln) <= width for ln in lines):
                return font, lines
    font = _font(sizes[-1], weight)
    return font, _wrap(text, font, width)


def _fit(text: str, width: int) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    """The biggest font size (64 → 34) at which the text fits in MAX_LINES
    lines with no line wider than the band (the band grows to fit)."""
    return fit_lines(text, width, MAX_LINES, range(64, 33, -4))


def logo_chip(logo: bytes, height: int) -> Image.Image | None:
    """The brand's logo file, trimmed and scaled to ``height`` on a white
    rounded chip — the real logo, never redrawn, readable on any background.
    None when the file can't be read."""
    try:
        lg = Image.open(io.BytesIO(logo)).convert("RGBA")
    except Exception:  # noqa: BLE001 — a broken upload just means no logo
        log.warning("brand logo could not be read — posting without it")
        return None
    if box := lg.getchannel("A").getbbox():
        lg = lg.crop(box)
    pad = max(6, height // 7)
    scale = min((height - 2 * pad) / lg.height, (height * 4) / lg.width)  # very wide logos stay sane
    lg = lg.resize((max(1, round(lg.width * scale)), max(1, round(lg.height * scale))), Image.LANCZOS)
    chip = Image.new("RGBA", (lg.width + 2 * pad, height), (0, 0, 0, 0))
    ImageDraw.Draw(chip).rounded_rectangle((0, 0, chip.width - 1, height - 1), radius=height // 4, fill=(255, 255, 255, 245))
    chip.alpha_composite(lg, (pad, (height - lg.height) // 2))
    return chip


def logo_corner(w: int) -> tuple[int, int]:
    """(chip height, margin) of the logo in a picture ``w`` px wide — always the top-left corner."""
    return max(56, round(w * 0.075)), round(w * 0.035)


def stamp_logo(picture: bytes, logo: bytes) -> bytes:
    """``picture`` with the brand's logo chip in its TOP-LEFT corner, the same place on every
    picture (the owner, 2026-10-30) — PNG."""
    img = Image.open(io.BytesIO(picture)).convert("RGB")
    height, margin = logo_corner(img.width)
    chip = logo_chip(logo, height)
    if chip is None:
        return picture
    img.paste(chip, (margin, margin), chip)
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def render_meme(photo: bytes, top: str, brand: str = "", logo: bytes | None = None) -> bytes:
    """Setup text on a white band above the photo (cropped square), with the
    brand's logo (or a small name tag) in the photo's corner. Returns a JPEG."""
    top = drawable(" ".join(top.replace("\r", "").split(" ")).strip())
    brand = drawable(brand)
    if _has_khmer(top) and not features.check("raqm"):
        # Without raqm, Pillow can't shape Khmer — never draw it broken; the
        # caller posts the photo alone.
        raise RuntimeError("Khmer text needs libraqm (text shaping) — not installed on this server")

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

    chip = logo_chip(logo, 76) if logo else None
    if chip is not None:
        x1, y1 = WIDTH - 28, band + WIDTH - 28
        canvas.paste(chip, (x1 - chip.width, y1 - chip.height), chip)
    elif brand.strip():
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
