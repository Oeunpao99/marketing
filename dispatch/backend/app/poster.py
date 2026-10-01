"""Topic posters — the auto-generated image matches what the post is about,
so a comparison looks like a comparison and a tips post like a checklist.

Same split as app/meme.py: the image model draws only the picture (it
garbles Khmer letters), and this module lays the post's own text over a
fixed design in a real Khmer + Latin font (KantumruyPro). One layout per
pillar in POSTER_PILLARS; the text comes from the idea's ``poster`` object
(content_ai.py). 1080×1350 (4:5) — the feed size Facebook and Instagram
show largest.

Each topic has its own base, so it's recognisable in a feed at a glance:

    educate        benefit        comparison       trend (dark)    quote          community (colour)
    ┌────────┐     ┌────────┐     ┌────────┐       ┌────────┐      ┌────────┐     ┌────────┐
    │ photo  │     │ photo  │     │grey│col│       │ photo  │      │ “      │     │  (◯)   │
    ├────────┤     ├────────┤     │ VS │   │       │ fades  │      │ quote  │     │Question│
    │Headline│     │Headline│     ├────────┤       │ NEW    │      │ text   │     │(A) ... │
    │① step  │     │[✓][✓]  │     │Headline│       │Headline│      │—author │     │(B) ... │
    │② step  │     │[✓]     │     │✗ ..│✓ ..│       │ glow + │      │(photo, │     │(C) ... │
    │▪ brand │     │▪ brand │     │▪ brand │       │ grid   │      │ dimmed)│     │▪ brand │
    └────────┘     └────────┘     └────────┘       └────────┘      └────────┘     └────────┘
"""

from __future__ import annotations

import io
import logging

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, features

from app.meme import _font, _has_khmer, _wrap

log = logging.getLogger("app.poster")

# The pillars (content_ai.PILLARS) that get a topic poster instead of a plain photo.
POSTER_PILLARS = ("educate", "benefit", "comparison", "trend", "quote", "community")

W, H = 1080, 1350
PAD = 64
INK = (17, 24, 39)
MUTED = (75, 85, 99)
WHITE = (255, 255, 255)
# A brand's accent colour — picked by its slug, so each brand keeps one look.
_ACCENTS = [
    (37, 99, 235),  # blue
    (79, 70, 229),  # indigo
    (13, 148, 136),  # teal
    (5, 150, 105),  # emerald
    (234, 88, 12),  # orange
    (225, 29, 72),  # rose
    (124, 58, 237),  # violet
    (2, 132, 199),  # sky
]


def accent_for(slug: str) -> tuple[int, int, int]:
    return _ACCENTS[sum(map(ord, slug or "x")) % len(_ACCENTS)]


def _tint(c: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    """``c`` mixed with white — amount 0 = c, 1 = white."""
    return tuple(round(v + (255 - v) * amount) for v in c)


def poster_photo_prompt(pillar: str, scene: str) -> str:
    """The image brief for a poster's picture — no text in it (the poster's
    words are drawn on by render_poster)."""
    framing = {
        "quote": "a wide, atmospheric frame with lots of calm, dark space — it sits behind large white text",
        "trend": "a striking frame with a sense of something new arriving — dusk or neon light works well",
        "comparison": "one wide scene with the action spread across the whole width (the left half is "
        "shown in grey as 'before', the right in colour as 'after')",
        "community": "one person centred in the frame with space around them, looking warm and real — it "
        "is shown cropped to a small circle",
    }.get(pillar, "the subject in the centre to upper part of the frame, the moment clear at a glance")
    return f"{CAMBODIA_PHOTO}\nThe moment: {scene.strip()}\nFraming: {framing}."


# The look every auto-made photo shares: real Cambodian life shot like a
# documentary, not stock — the user found the office-around-a-laptop look dull.
CAMBODIA_PHOTO = (
    "A cinematic documentary photograph taken in Cambodia — real life, not stock photography. "
    "Real Cambodian people in real places: street-side shops, market stalls, cafés, home "
    "businesses, tuk-tuks, riverside streets of Phnom Penh or Siem Reap. Candid and natural — "
    "people busy doing something, not posing or smiling at the camera. Shot on a full-frame "
    "camera with a 35mm lens, shallow depth of field, rich but natural colour, real light "
    "(warm morning sun, golden hour, shop lights at night, rain on the street), real texture "
    "and detail. Never: office workers around a laptop, people pointing at screens, "
    "handshakes, posed smiling teams, glossy corporate looks. Absolutely no text, letters, "
    "numbers, signs with words, readable screens, logos or watermarks anywhere in the image."
)


# ── text helpers ──────────────────────────────────────────────────────────
def _fit(text: str, width: int, max_lines: int, big: int, small: int, weight: str = "Bold"):
    """The biggest size (big → small) where ``text`` wraps into ≤ max_lines
    lines that each fit ``width``. (font, lines, line height)."""
    for size in range(big, small - 1, -2):
        font = _font(size, weight)
        lines = _wrap(text, font, width)
        if len(lines) <= max_lines and all(font.getlength(ln) <= width for ln in lines):
            return font, lines, _line_h(font)
    font = _font(small, weight)
    return font, _wrap(text, font, width)[:max_lines], _line_h(font)


def _line_h(font: ImageFont.FreeTypeFont) -> int:
    a, d = font.getmetrics()
    return int((a + d) * 1.15)


def _text(draw: ImageDraw.ImageDraw, xy, lines, font, fill, line_h, center_w: int | None = None) -> int:
    """Draws ``lines`` from xy; centred within center_w when given. Returns the y below them."""
    x, y = xy
    for ln in lines:
        dx = (center_w - font.getlength(ln)) / 2 if center_w else 0
        draw.text((x + dx, y), ln, font=font, fill=fill)
        y += line_h
    return y


def _cover(photo: Image.Image, w: int, h: int) -> Image.Image:
    """``photo`` scaled and centre-cropped to fill w×h."""
    scale = max(w / photo.width, h / photo.height)
    img = photo.resize((max(w, round(photo.width * scale)), max(h, round(photo.height * scale))), Image.LANCZOS)
    left, top = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((left, top, left + w, top + h))


def _brand_tag(draw: ImageDraw.ImageDraw, brand: str, accent, y: int, on_dark: bool = False) -> None:
    if not brand.strip():
        return
    font = _font(30, "SemiBold")
    r = 9
    cy = y + _line_h(font) // 2 - 2
    draw.ellipse((PAD, cy - r, PAD + 2 * r, cy + r), fill=accent)
    draw.text((PAD + 2 * r + 14, y), brand.strip()[:40], font=font, fill=WHITE if on_dark else MUTED)


def _check(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: int, fill) -> None:
    """A ✓ drawn as two strokes (the font may not have the glyph)."""
    w = max(4, s // 6)
    draw.line([(cx - s * 0.45, cy), (cx - s * 0.12, cy + s * 0.32), (cx + s * 0.45, cy - s * 0.35)], fill=fill, width=w, joint="curve")


def _points_block(texts: list[str], width: int, avail_h: int, big: int = 40, small: int = 26, max_lines: int = 2):
    """The biggest size at which every point (≤ max_lines lines each) fits
    avail_h with gaps. (font, [lines per point], line height, gap)."""
    for size in range(big, small - 1, -2):
        font = _font(size, "Medium")
        lh = _line_h(font)
        gap = int(lh * 0.55)
        wrapped = [_wrap(t, font, width)[:max_lines] for t in texts]
        total = sum(len(w) * lh for w in wrapped) + gap * (len(texts) - 1)
        if total <= avail_h and all(font.getlength(ln) <= width for w in wrapped for ln in w):
            return font, wrapped, lh, gap
    font = _font(small, "Medium")
    lh = _line_h(font)
    return font, [_wrap(t, font, width)[:max_lines] for t in texts], lh, int(lh * 0.55)


# ── layouts ───────────────────────────────────────────────────────────────
def _list_poster(canvas, photo, p: dict, accent, brand: str, numbered: bool) -> None:
    """educate (numbered steps) and benefit (✓ points)."""
    font, lines, lh = _fit(p["headline"], W - 2 * PAD, 3, 62, 38)
    points = p["points"][:5]
    badge = 54
    tx = PAD + badge + 26
    # Text first, at the size it gets under the smallest photo; the photo then
    # takes whatever height is left, so short text doesn't leave a gap.
    min_band = 480
    pfont, wrapped, plh, gap = _points_block(points, W - tx - PAD, H - 120 - (min_band + 52 + lh * len(lines) + 28))
    text_h = 52 + lh * len(lines) + 28 + sum(len(w) * plh for w in wrapped) + gap * (len(wrapped) - 1)
    band = max(min_band, min(760, H - 150 - text_h))
    canvas.paste(_cover(photo, W, band), (0, 0))
    draw = ImageDraw.Draw(canvas)
    y = _text(draw, (PAD, band + 52), lines, font, INK, lh) + 28
    for n, wl in enumerate(wrapped):
        cy = y + plh // 2
        draw.ellipse((PAD, cy - badge // 2, PAD + badge, cy + badge // 2), fill=accent)
        if numbered:
            nf = _font(30, "Bold")
            label = str(n + 1)
            draw.text((PAD + (badge - nf.getlength(label)) / 2, cy - _line_h(nf) / 2 - 1), label, font=nf, fill=WHITE)
        else:
            _check(draw, PAD + badge // 2, cy + 2, 26, WHITE)
        y = _text(draw, (tx, y), wl, pfont, INK, plh) + gap
    _brand_tag(draw, brand, accent, H - PAD - 34)


def _comparison_poster(canvas, photo, p: dict, accent, brand: str) -> None:
    """A before / after split: the picture's left half in grey (the old way),
    the right half in colour (the new way), VS on the seam; the points sit
    below in two matching columns."""
    font, lines, lh = _fit(p["headline"], W - 2 * PAD, 2, 58, 36)
    col = (W - 2 * PAD - 60) // 2
    lx, rx = PAD, PAD + col + 60
    min_band, limit = 460, H - 130
    head_h = 40 + lh * len(lines) + 36
    blocks = [
        _points_block(items[:4], col - 50, limit - min_band - head_h, big=42, small=24, max_lines=3)
        for items in (p["left"], p["right"])
    ]
    cols_h = max(sum(len(w) * b[2] for w in b[1]) + b[3] * (len(b[1]) - 1) for b in blocks)
    band = max(min_band, min(820, limit - head_h - cols_h - 10))

    pic = _cover(photo, W, band)
    half = W // 2
    old = ImageOps.grayscale(pic.crop((0, 0, half, band))).convert("RGB")
    old = Image.blend(old, Image.new("RGB", old.size, (40, 40, 48)), 0.25)
    canvas.paste(pic, (0, 0))
    canvas.paste(old, (0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((half - 3, 0, half + 3, band), fill=WHITE)
    # Each side's name as a pill on its half of the picture.
    for x0, x1, title, fill in ((0, half, p["left_title"], (55, 65, 81)), (half, W, p["right_title"], accent)):
        tfont, tlines, _ = _fit(title, half - 2 * PAD, 1, 40, 26)
        tw = tfont.getlength(tlines[0]) + 56
        cx = (x0 + x1) / 2
        top = band - 92
        draw.rounded_rectangle((cx - tw / 2, top, cx + tw / 2, top + 64), radius=32, fill=fill)
        draw.text((cx - tw / 2 + 28, top + 32 - _line_h(tfont) / 2 - 1), tlines[0], font=tfont, fill=WHITE)
    r = 54
    cy = band // 2
    draw.ellipse((half - r, cy - r, half + r, cy + r), fill=INK, outline=WHITE, width=6)
    vf = _font(38, "Bold")
    draw.text((half - vf.getlength("VS") / 2, cy - _line_h(vf) / 2 - 1), "VS", font=vf, fill=WHITE)

    y = _text(draw, (PAD, band + 40), lines, font, INK, lh, center_w=W - 2 * PAD) + 36
    draw.line((W // 2, y, W // 2, y + cols_h), fill=(209, 213, 219), width=3)
    for x, (pfont, wrapped, plh, gap), good in ((lx, blocks[0], False), (rx, blocks[1], True)):
        ty = y
        for wl in wrapped:
            cy = ty + plh // 2
            if good:
                draw.ellipse((x, cy - 17, x + 34, cy + 17), fill=accent)
                _check(draw, x + 17, cy + 1, 18, WHITE)
            else:
                draw.line((x + 7, cy - 9, x + 25, cy + 9), fill=(156, 163, 175), width=5)
                draw.line((x + 7, cy + 9, x + 25, cy - 9), fill=(156, 163, 175), width=5)
            ty = _text(draw, (x + 50, ty), wl, pfont, INK if good else MUTED, plh) + gap
    _brand_tag(draw, brand, accent, H - PAD - 34)


DARK = (11, 15, 30)


def _trend_poster(canvas, photo, p: dict, accent, brand: str) -> None:
    """New tech: a dark poster — the picture fades into the night, a soft glow
    in the brand colour, a faint grid, light text."""
    canvas.paste(DARK, (0, 0, W, H))
    band = 760
    pic = _cover(photo, W, band)
    fade = Image.new("L", (W, band), 255)
    fd = ImageDraw.Draw(fade)
    for i in range(300):
        fd.line((0, band - 300 + i, W, band - 300 + i), fill=int(255 * (1 - i / 300)))
    canvas.paste(pic, (0, 0), fade)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((W - 520, band - 120, W + 180, band + 520), fill=(*accent, 150))
    gd.ellipse((-260, H - 300, 300, H + 200), fill=(*accent, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(130))
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gg = ImageDraw.Draw(grid)
    for gx in range(0, W, 72):
        gg.line((gx, band - 80, gx, H), fill=(255, 255, 255, 14), width=1)
    for gy in range(band - 80, H, 72):
        gg.line((0, gy, W, gy), fill=(255, 255, 255, 14), width=1)
    base = Image.alpha_composite(Image.alpha_composite(canvas.convert("RGBA"), glow), grid)
    canvas.paste(base.convert("RGB"))

    draw = ImageDraw.Draw(canvas)
    pf = _font(30, "Bold")
    label = "NEW"
    pw = int(pf.getlength(label)) + 56
    top = band - 70
    draw.rounded_rectangle((PAD, top, PAD + pw, top + 60), radius=30, fill=accent)
    draw.text((PAD + 28, top + 30 - _line_h(pf) / 2 - 2), label, font=pf, fill=WHITE)
    font, lines, lh = _fit(p["headline"], W - 2 * PAD, 3, 66, 38)
    y = _text(draw, (PAD, band + 26), lines, font, WHITE, lh) + 22
    if p["points"]:
        sfont, slines, slh = _fit(p["points"][0], W - 2 * PAD, 3, 38, 28, "Regular")
        _text(draw, (PAD, y), slines, sfont, (203, 213, 225), slh)
    _brand_tag(draw, brand, accent, H - PAD - 34, on_dark=True)


def _benefit_poster(canvas, photo, p: dict, accent, brand: str) -> None:
    """Why it matters: the benefits as icon tiles (a row of 2-3, or 2×2),
    not a list."""
    font, lines, lh = _fit(p["headline"], W - 2 * PAD, 2, 60, 38)
    points = p["points"][:4]
    cols = 2 if len(points) in (2, 4) else 3
    rows = (len(points) + cols - 1) // cols
    gap = 28
    tw = (W - 2 * PAD - gap * (cols - 1)) // cols
    icon = 92
    inner = tw - 40
    # One text size for all tiles: the biggest at which each fits 4 lines.
    for size in range(44, 23, -2):
        tfont = _font(size, "SemiBold")
        wrapped = [_wrap(t, tfont, inner) for t in points]
        if all(len(w) <= 4 and all(tfont.getlength(ln) <= inner for ln in w) for w in wrapped):
            break
    wrapped = [w[:4] for w in wrapped]
    tlh = _line_h(tfont)
    tile_h = 36 + icon + 26 + max(len(w) for w in wrapped) * tlh + 34
    grid_h = rows * tile_h + gap * (rows - 1)
    head_h = 46 + lh * len(lines) + 34
    band = max(360, min(800, H - 130 - head_h - grid_h))
    canvas.paste(_cover(photo, W, band), (0, 0))
    draw = ImageDraw.Draw(canvas)
    y = _text(draw, (PAD, band + 46), lines, font, INK, lh, center_w=W - 2 * PAD) + 34
    for n, wl in enumerate(wrapped):
        r, c = divmod(n, cols)
        # A last row with fewer tiles is centred.
        in_row = min(cols, len(points) - r * cols)
        x0 = PAD + (W - 2 * PAD - (in_row * tw + gap * (in_row - 1))) // 2 + c * (tw + gap)
        y0 = y + r * (tile_h + gap)
        draw.rounded_rectangle((x0, y0, x0 + tw, y0 + tile_h), radius=30, fill=WHITE)
        cx, cy = x0 + tw // 2, y0 + 36 + icon // 2
        draw.ellipse((cx - icon // 2, cy - icon // 2, cx + icon // 2, cy + icon // 2), fill=_tint(accent, 0.85))
        draw.ellipse((cx - 30, cy - 30, cx + 30, cy + 30), fill=accent)
        _check(draw, cx, cy + 2, 30, WHITE)
        _text(draw, (x0 + 20, y0 + 36 + icon + 26), wl, tfont, INK, tlh, center_w=inner)
    _brand_tag(draw, brand, accent, H - PAD - 34)


def _quote_poster(canvas, photo, p: dict, accent, brand: str) -> None:
    canvas.paste(_cover(photo, W, H), (0, 0))
    shade = Image.new("RGBA", (W, H), (10, 12, 20, 165))
    canvas.paste(Image.alpha_composite(canvas.convert("RGBA"), shade).convert("RGB"))
    draw = ImageDraw.Draw(canvas)
    qf = _font(220, "Bold")
    draw.text((PAD - 6, 120), "“", font=qf, fill=accent)
    font, lines, lh = _fit(p["headline"], W - 2 * PAD, 7, 70, 40)
    block = lh * len(lines)
    y = max(380, (H - block) // 2 - 20)
    y = _text(draw, (PAD, y), lines, font, WHITE, lh) + 30
    if p["author"]:
        af = _font(36, "Medium")
        draw.line((PAD, y + 24, PAD + 60, y + 24), fill=accent, width=5)
        draw.text((PAD + 80, y), p["author"][:60], font=af, fill=_tint(accent, 0.6))
    _brand_tag(draw, brand, accent, H - PAD - 34, on_dark=True)


def _community_poster(canvas, photo, p: dict, accent, brand: str) -> None:
    """A poll card: the brand colour all over, a big faint "?", the picture
    in a circle, the question in large white text and A-D answer buttons."""
    canvas.paste(accent, (0, 0, W, H))
    mark = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    qf = _font(900, "Bold")
    ImageDraw.Draw(mark).text((W - 520, -120), "?", font=qf, fill=(255, 255, 255, 28))
    canvas.paste(Image.alpha_composite(canvas.convert("RGBA"), mark).convert("RGB"))
    draw = ImageDraw.Draw(canvas)

    font, lines, lh = _fit(p["headline"], W - 2 * PAD, 3, 66, 40)
    options = p["points"][:4]
    # Size it all first, then centre the block — fewer answers, bigger photo.
    d = 300 if len(options) <= 3 else 250
    head = d + 50 + lh * len(lines) + 40
    row = min(112, (H - 140 - 90 - head - 18 * (len(options) - 1)) // max(1, len(options)))
    total = head + len(options) * row + 18 * max(0, len(options) - 1)
    y0 = max(70, (H - 120 - total) // 2)

    circle = _cover(photo, d, d)
    m = Image.new("L", (d, d), 0)
    ImageDraw.Draw(m).ellipse((0, 0, d, d), fill=255)
    x0 = (W - d) // 2
    draw.ellipse((x0 - 10, y0 - 10, x0 + d + 10, y0 + d + 10), fill=WHITE)
    canvas.paste(circle, (x0, y0), m)

    y = _text(draw, (PAD, y0 + d + 50), lines, font, WHITE, lh, center_w=W - 2 * PAD) + 40
    if options:
        for n, opt in enumerate(options):
            top = y + n * (row + 18)
            draw.rounded_rectangle((PAD, top, W - PAD, top + row), radius=row // 2, fill=WHITE)
            r = row // 2 - 12
            cx, cy = PAD + 12 + r, top + row // 2
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=accent)
            letter = "ABCD"[n]
            lf = _font(32, "Bold")
            draw.text((cx - lf.getlength(letter) / 2, cy - _line_h(lf) / 2 - 1), letter, font=lf, fill=WHITE)
            tfont, tlines, tlh = _fit(opt, W - PAD - (cx + r + 24) - 40, 1, 38, 24, "Medium")
            draw.text((cx + r + 24, cy - tlh / 2), tlines[0], font=tfont, fill=INK)
    _brand_tag(draw, brand, WHITE, H - PAD - 34, on_dark=True)


def render_poster(photo: bytes, pillar: str, poster: dict, brand: str = "", slug: str = "") -> bytes:
    """The topic poster for ``pillar`` with the idea's ``poster`` text over
    ``photo``. Returns a JPEG. Raises ValueError for a pillar without a layout."""
    texts = [poster.get("headline", ""), *poster.get("points", []), *poster.get("left", []), *poster.get("right", [])]
    if any(_has_khmer(t) for t in texts) and not features.check("raqm"):
        log.warning("poster: Khmer text but Pillow has no raqm — install libraqm for correct shaping")
    accent = accent_for(slug or brand)
    canvas = Image.new("RGB", (W, H), _tint(accent, 0.94))
    img = Image.open(io.BytesIO(photo)).convert("RGB")
    if pillar == "educate":
        _list_poster(canvas, img, poster, accent, brand, numbered=True)
    elif pillar == "benefit":
        _benefit_poster(canvas, img, poster, accent, brand)
    elif pillar == "comparison":
        _comparison_poster(canvas, img, poster, accent, brand)
    elif pillar == "trend":
        _trend_poster(canvas, img, poster, accent, brand)
    elif pillar == "quote":
        _quote_poster(canvas, img, poster, accent, brand)
    elif pillar == "community":
        _community_poster(canvas, img, poster, accent, brand)
    else:
        raise ValueError(f"no poster layout for pillar {pillar!r}")
    out = io.BytesIO()
    canvas.save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()


def clean_poster(pillar: str, raw) -> dict | None:
    """The AI's ``poster`` object, trimmed and checked for what ``pillar``'s
    layout needs — None when it's missing or unusable (the post then gets a
    plain photo, as before)."""
    if pillar not in POSTER_PILLARS or not isinstance(raw, dict):
        return None

    def s(key: str, n: int) -> str:
        return " ".join(str(raw.get(key) or "").split())[:n]

    def items(key: str, n: int, size: int) -> list[str]:
        vals = raw.get(key) if isinstance(raw.get(key), list) else []
        return [t for t in (" ".join(str(v).split())[:size] for v in vals[:n]) if t]

    p = {
        "headline": s("headline", 220 if pillar == "quote" else 90),
        "points": items("points", 5, 90),
        "left_title": s("left_title", 40),
        "right_title": s("right_title", 40),
        "left": items("left", 4, 70),
        "right": items("right", 4, 70),
        "author": s("author", 60),
        "scene": s("scene", 400),
    }
    need = {
        "educate": len(p["points"]) >= 2,
        "benefit": len(p["points"]) >= 2,
        "comparison": bool(p["left_title"] and p["right_title"] and p["left"] and p["right"]),
        "community": len(p["points"]) >= 2,
    }.get(pillar, True)
    return p if p["headline"] and p["scene"] and need else None
