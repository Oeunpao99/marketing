"""Topic posters — the auto-generated image matches what the post is about,
so a comparison looks like a comparison and a tips post like a checklist.

Same split as app/meme.py: the image model draws only the picture (it
garbles Khmer letters), and this module lays the post's own text over a
fixed design in a real Khmer + Latin font (KantumruyPro). One layout per
pillar in POSTER_PILLARS; the text comes from the idea's ``poster`` object
(content_ai.py). 1080×1350 (4:5) — the feed size Facebook and Instagram
show largest.

    educate / benefit       comparison            trend            quote          community
    ┌──────────┐            ┌──────────┐          ┌──────────┐     ┌──────────┐   ┌──────────┐
    │  photo   │            │  photo   │          │          │     │ “        │   │  photo   │
    ├──────────┤            ├──────────┤          │  photo   │     │  quote   │   ├──────────┤
    │ Headline │            │ Headline │          ├──────────┤     │  text    │   │ Question?│
    │ ① step   │            │ old │ new│          │ Headline │     │ — author │   │ (A) ...  │
    │ ② step   │            │ • ..│✓ ..│          │ one line │     │ (photo,  │   │ (B) ...  │
    │ ③ step   │            │ • ..│✓ ..│          │          │     │  dimmed) │   │          │
    │ ▪ brand  │            │ ▪ brand  │          │ ▪ brand  │     │ ▪ brand  │   │ ▪ brand  │
    └──────────┘            └──────────┘          └──────────┘     └──────────┘   └──────────┘
"""

from __future__ import annotations

import io
import logging

from PIL import Image, ImageDraw, ImageFont, features

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
    style = {
        "quote": "a calm, atmospheric photo with plenty of empty, softly lit space — it sits behind large text",
        "trend": "a modern, bright, optimistic image about new technology in everyday use",
        "comparison": "one clear image that shows the difference or the change the post is about",
    }.get(pillar, "a clean, bright, friendly image that shows the idea at a glance")
    return (
        f"A social media poster picture: {scene.strip()}. Style: {style}. Photorealistic or a clean "
        "modern 3D illustration, one clear subject, simple uncluttered background, soft natural "
        "light. Where people or places appear, set it in Cambodia (Cambodian people, Phnom Penh "
        "shops, homes and offices). Absolutely no text, letters, numbers, captions, signs with "
        "words, screens with readable text, logos or watermarks anywhere in the image."
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
    min_band = 380
    font, lines, lh = _fit(p["headline"], W - 2 * PAD, 2, 58, 36)
    head_h = 44 + lh * len(lines) + 30
    gutter = 40
    cw = (W - 2 * PAD - gutter) // 2
    top, limit = min_band + head_h, H - 130
    lx, rx = PAD, PAD + cw + gutter
    inner = cw - 2 * 34
    # Lay both sides out first, so the two cards share one height that fits
    # the longer side — no empty card bottoms.
    sides = []
    for x, title, items, dark in ((lx, p["left_title"], p["left"], False), (rx, p["right_title"], p["right"], True)):
        tfont, tlines, tlh = _fit(title, inner, 2, 44, 30)
        head = 34 + tlh * len(tlines) + 18 + 26
        block = _points_block(items[:4], inner - 44, limit - top - head - 34, big=34, small=24, max_lines=3)
        _, wrapped, plh, gap = block
        need = head + sum(len(w) * plh for w in wrapped) + gap * (len(wrapped) - 1) + 40
        sides.append((x, dark, tfont, tlines, tlh, block, need))
    cards_h = min(limit - top, max(s[-1] for s in sides))
    # The photo takes the height the text doesn't need, so nothing sits empty.
    band = max(min_band, min(640, limit - 20 - cards_h - head_h))
    canvas.paste(_cover(photo, W, band), (0, 0))
    draw = ImageDraw.Draw(canvas)
    _text(draw, (PAD, band + 44), lines, font, INK, lh, center_w=W - 2 * PAD)
    top = band + head_h
    bottom = top + cards_h
    draw.rounded_rectangle((lx, top, lx + cw, bottom), radius=28, fill=WHITE, outline=(209, 213, 219), width=3)
    draw.rounded_rectangle((rx, top, rx + cw, bottom), radius=28, fill=accent)
    for x, dark, tfont, tlines, tlh, (pfont, wrapped, plh, gap), _ in sides:
        ty = _text(draw, (x + 34, top + 34), tlines, tfont, WHITE if dark else INK, tlh, center_w=inner) + 18
        draw.line((x + 34, ty, x + cw - 34, ty), fill=_tint(accent, 0.45) if dark else (229, 231, 235), width=3)
        ty += 26
        bx = x + 34
        for wl in wrapped:
            cy = ty + plh // 2
            if dark:
                _check(draw, bx + 12, cy + 2, 24, WHITE)
            else:
                draw.ellipse((bx + 4, cy - 7, bx + 18, cy + 7), fill=(156, 163, 175))
            ty = _text(draw, (bx + 44, ty), wl, pfont, WHITE if dark else MUTED, plh) + gap
    # The VS badge across the gap between the cards.
    r = 46
    cx, cy = W // 2, top + 70
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=INK, outline=_tint(accent, 0.94), width=8)
    vf = _font(34, "Bold")
    draw.text((cx - vf.getlength("VS") / 2, cy - _line_h(vf) / 2 - 1), "VS", font=vf, fill=WHITE)
    _brand_tag(draw, brand, accent, H - PAD - 34)


def _trend_poster(canvas, photo, p: dict, accent, brand: str) -> None:
    band = 760
    canvas.paste(_cover(photo, W, band), (0, 0))
    draw = ImageDraw.Draw(canvas)
    # A "new" pill riding on the photo's lower edge.
    pf = _font(30, "Bold")
    label = "NEW"
    pw = int(pf.getlength(label)) + 56
    draw.rounded_rectangle((PAD, band - 30, PAD + pw, band + 30), radius=30, fill=accent)
    draw.text((PAD + 28, band - _line_h(pf) / 2 - 2), label, font=pf, fill=WHITE)
    font, lines, lh = _fit(p["headline"], W - 2 * PAD, 3, 64, 38)
    y = _text(draw, (PAD, band + 64), lines, font, INK, lh) + 18
    if p["points"]:
        sfont, slines, slh = _fit(p["points"][0], W - 2 * PAD, 3, 38, 28, "Regular")
        _text(draw, (PAD, y), slines, sfont, MUTED, slh)
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
    band = 480
    canvas.paste(_cover(photo, W, band), (0, 0))
    draw = ImageDraw.Draw(canvas)
    font, lines, lh = _fit(p["headline"], W - 2 * PAD, 3, 62, 38)
    y = _text(draw, (PAD, band + 52), lines, font, INK, lh) + 30
    options = p["points"][:4]
    if options:
        avail = H - 130 - y
        row = min(118, (avail - 18 * (len(options) - 1)) // len(options))
        for n, opt in enumerate(options):
            top = y + n * (row + 18)
            draw.rounded_rectangle((PAD, top, W - PAD, top + row), radius=row // 2, fill=WHITE, outline=_tint(accent, 0.55), width=3)
            r = row // 2 - 12
            cx, cy = PAD + 12 + r, top + row // 2
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=accent)
            letter = "ABCD"[n]
            lf = _font(32, "Bold")
            draw.text((cx - lf.getlength(letter) / 2, cy - _line_h(lf) / 2 - 1), letter, font=lf, fill=WHITE)
            tfont, tlines, tlh = _fit(opt, W - PAD - (cx + r + 24) - 40, 1, 38, 24, "Medium")
            draw.text((cx + r + 24, cy - tlh / 2), tlines[0], font=tfont, fill=INK)
    _brand_tag(draw, brand, accent, H - PAD - 34)


def render_poster(photo: bytes, pillar: str, poster: dict, brand: str = "", slug: str = "") -> bytes:
    """The topic poster for ``pillar`` with the idea's ``poster`` text over
    ``photo``. Returns a JPEG. Raises ValueError for a pillar without a layout."""
    texts = [poster.get("headline", ""), *poster.get("points", []), *poster.get("left", []), *poster.get("right", [])]
    if any(_has_khmer(t) for t in texts) and not features.check("raqm"):
        log.warning("poster: Khmer text but Pillow has no raqm — install libraqm for correct shaping")
    accent = accent_for(slug or brand)
    canvas = Image.new("RGB", (W, H), _tint(accent, 0.94))
    img = Image.open(io.BytesIO(photo)).convert("RGB")
    if pillar in ("educate", "benefit"):
        _list_poster(canvas, img, poster, accent, brand, numbered=pillar == "educate")
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
