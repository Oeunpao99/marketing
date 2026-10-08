"""Khmer text overlay for Studio images — the image model garbles Khmer
letters (wrong subscripts, made-up words), so when the words a person wants
on their poster are Khmer, the model draws only the picture and this module
draws the words on top in a real Khmer + Latin font (KantumruyPro, shaped by
libraqm) — the same split app/meme.py and app/poster.py use for Autopilot.

    1. extract_text(prompt) — a small AI call pulls the exact on-image text
       (headline, subheading, points, button) out of the free-form prompt.
    2. NO_TEXT_RULE goes after the prompt: no letters anywhere, keep the top
       of the frame calm and empty for the headline, logo in a bottom corner.
    3. render(picture, text) — headline block at the top over a soft scrim
       (light or dark, picked from the picture), the button as a pill at the
       bottom.

    ┌──────────────┐
    │   Headline   │  ← scrim fades into the picture
    │  subheading  │
    │ (chip)(chip) │
    │   picture    │
    │  ( button )  │
    └──────────────┘

Only used when the extracted text has Khmer in it — English text the model
spells fine, so those images are made exactly as before.
"""

from __future__ import annotations

import io
import logging

from PIL import Image, ImageDraw, ImageStat, features

from app.meme import _font, _has_khmer, _wrap, drawable
from app.poster import INK, WHITE, _line_h, _tint

log = logging.getLogger("app.text_overlay")

EXTRACT_PROMPT = (
    "You read an image-generation prompt for a social media poster and return ONLY the "
    "words that must be printed on the poster, copied exactly as written (same language, "
    "same spelling — never translate, fix or shorten). Return a JSON object:\n"
    '{"headline": "...", "subheading": "...", "points": ["...", ...], "cta": "..."}\n'
    "- headline: the main title (the biggest text). When the prompt stacks it on two "
    "lines (e.g. a brand name, then a Khmer line), keep both, joined with \\n.\n"
    "- subheading: the supporting line(s) under it, or \"\".\n"
    "- points: short feature / benefit labels or chips, at most 4, or [].\n"
    "- cta: the button or call-to-action text, or \"\".\n"
    "Leave out the brand logo, tiny text inside device screens or chat bubbles, and "
    "anything describing style, colour or layout. If the prompt asks for no text at all, "
    'return {"headline": ""}.'
)

# Goes AFTER the person's prompt, so it wins over the prompt's TYPOGRAPHY section.
NO_TEXT_RULE = (
    "\n\nTEXT IS ADDED AFTERWARDS — this overrides any TYPOGRAPHY, HEADLINE or text "
    "instructions above: the poster's words are typeset onto the image later by a "
    "designer, so draw NO letters, words, numbers or captions anywhere — no headline, "
    "no button labels, no chip labels. Device screens, chat bubbles and cards show "
    "simple shapes, icons and colour blocks only, never writing. Keep the TOP 40% of "
    "the frame calm and uncluttered (plain background, soft gradient, wall or sky — no "
    "faces, products or logo there) so the headline can sit on it, and keep a little "
    "clear space at the bottom centre for a button. If a brand logo image is given, place "
    "it unchanged in a bottom corner."
)


def wanted() -> bool:
    """Whether this server can draw Khmer at all (libraqm shapes it)."""
    return features.check("raqm")


def extract_text(prompt: str) -> dict | None:
    """The on-image text in ``prompt`` — None when there is none, or none of
    it is Khmer (the model spells Latin text fine). Raises ContentAIError."""
    from app.config import get_settings
    from app.content_ai import _chat

    cfg = get_settings()
    raw = _chat(
        [{"role": "system", "content": EXTRACT_PROMPT}, {"role": "user", "content": prompt[:6000]}],
        cfg.azure_openai_deployment,
        max_tokens=1500,
        effort="low",
    )

    def s(v, n: int, lines: int = 1) -> str:
        """Whitespace tidied; up to ``lines`` stacked lines kept as \\n."""
        kept = [t for t in (" ".join(ln.split()) for ln in str(v or "").split("\n")) if t]
        return ("\n".join(kept[:lines]) if lines > 1 else " ".join(kept))[:n]

    points = raw.get("points") if isinstance(raw.get("points"), list) else []
    text = {
        "headline": s(raw.get("headline"), 140, lines=2),
        "subheading": s(raw.get("subheading"), 220, lines=2),
        "points": [p for p in (s(v, 60) for v in points[:4]) if p],
        "cta": s(raw.get("cta"), 40),
    }
    if not text["headline"]:
        return None
    every = [text["headline"], text["subheading"], text["cta"], *text["points"]]
    return text if any(_has_khmer(t) for t in every) else None


# ── drawing ───────────────────────────────────────────────────────────────
def _fit(text: str, width: int, max_lines: int, big: int, small: int, weight: str):
    """The biggest size (big → small) where ``text`` wraps into ≤ max_lines
    lines that each fit ``width``. (font, lines, line height)."""
    step = max(1, (big - small) // 12)
    for size in range(big, small - 1, -step):
        font = _font(size, weight)
        lines = _wrap(text, font, width)
        if len(lines) <= max_lines and all(font.getlength(ln) <= width for ln in lines):
            return font, lines, _line_h(font)
    font = _font(small, weight)
    return font, _wrap(text, font, width)[:max_lines], _line_h(font)


def _centred(draw: ImageDraw.ImageDraw, w: int, y: int, lines, font, fill, lh: int) -> int:
    for ln in lines:
        draw.text(((w - font.getlength(ln)) / 2, y), ln, font=font, fill=fill)
        y += lh
    return y


def _layout(head: str, sub: str, points: list[str], w: int, measure: int, scale: float):
    """Fonts, wrapped lines and chip rows for the top block at ``scale``."""
    hf, hl, hlh = _fit(head, measure, 4, round(w * 0.072 * scale), round(w * 0.04 * scale), "Bold")
    sf, sl, slh = (
        _fit(sub, measure, 3, round(w * 0.038 * scale), round(w * 0.027 * scale), "Medium") if sub else (None, [], 0)
    )
    # Points go as centred rows of chips, so they stay in the top zone.
    pf = _font(round(w * 0.026 * scale), "Medium")
    cpx, cpy, cgap = round(w * 0.02 * scale), round(w * 0.008 * scale), round(w * 0.012 * scale)
    ch = _line_h(pf) + 2 * cpy
    rows: list[list[tuple[str, int]]] = []
    for p in points:
        label = _wrap(p, pf, measure - 2 * cpx)[0]
        cw = round(pf.getlength(label)) + 2 * cpx
        if rows and sum(c for _, c in rows[-1]) + cgap * len(rows[-1]) + cw <= measure:
            rows[-1].append((label, cw))
        elif len(rows) < 3:
            rows.append([(label, cw)])
    return hf, hl, hlh, sf, sl, slh, pf, cpx, cpy, cgap, ch, rows, round(w * 0.016 * scale)


def render(picture: bytes, text: dict, accent: tuple[int, int, int]) -> bytes:
    """``picture`` with ``text`` (from extract_text) drawn on it. PNG bytes."""
    if not wanted():
        raise RuntimeError("Khmer text needs libraqm (text shaping) — not installed on this server")
    img = Image.open(io.BytesIO(picture)).convert("RGB")
    w, h = img.size
    pad = round(w * 0.065)
    inner = w - 2 * pad
    # Wide images keep the headline to a readable measure, not one long line.
    measure = min(inner, round(h * 1.1))

    head = drawable(text["headline"])
    sub = drawable(text.get("subheading", ""))
    points = [drawable(p) for p in text.get("points", [])]
    cta = drawable(text.get("cta", ""))

    # Everything shrinks together until the text block fits the calm top zone
    # the model was asked to leave (~40% of the height).
    for scale in (1.0, 0.92, 0.84, 0.76, 0.68, 0.6):
        hf, hl, hlh, sf, sl, slh, pf, cpx, cpy, cgap, ch, rows, gap = _layout(head, sub, points, w, measure, scale)
        block_h = len(hl) * hlh + (gap + len(sl) * slh if sl else 0) + (gap * 2 + len(rows) * (ch + cgap) if rows else 0)
        if block_h <= h * 0.36:
            break
    top = round(h * 0.05)
    bottom = top + block_h

    # Light text on a dark picture, dark text on a light one — read from the
    # zone the text covers. A busy zone gets a stronger scrim than a calm one.
    zone = img.crop((0, 0, w, min(h, bottom + pad))).convert("L")
    stat = ImageStat.Stat(zone)
    light = stat.mean[0] >= 140
    busy = stat.stddev[0] > 38
    ink = INK if light else WHITE
    shade = (255, 255, 255) if light else (8, 12, 20)
    solid = 215 if busy else 120
    fade = round(h * 0.12)

    scrim = Image.new("L", (1, h), 0)
    for y in range(min(h, bottom + pad + fade)):
        a = solid if y <= bottom + pad // 2 else solid * (1 - (y - bottom - pad // 2) / (pad // 2 + fade))
        scrim.putpixel((0, y), max(0, round(a)))
    img = Image.composite(Image.new("RGB", (w, h), shade), img, scrim.resize((w, h)))
    draw = ImageDraw.Draw(img)

    y = _centred(draw, w, top, hl, hf, ink, hlh)
    if sl:
        y = _centred(draw, w, y + gap, sl, sf, _tint(INK, 0.15) if light else ink, slh)
    if rows:
        y += gap * 2
        chip = _tint(accent, 0.86) if light else tuple(round(c * 0.45 + 12) for c in accent)
        for row in rows:
            x = round((w - sum(c for _, c in row) - cgap * (len(row) - 1)) / 2)
            for label, cw in row:
                draw.rounded_rectangle((x, y, x + cw, y + ch), radius=ch // 2, fill=chip)
                draw.text((x + cpx, y + cpy), label, font=pf, fill=ink)
                x += cw + cgap
            y += ch + cgap

    if cta:
        cf, cl, clh = _fit(cta, round(w * 0.6), 1, round(w * 0.036), round(w * 0.026), "SemiBold")
        tw = cf.getlength(cl[0]) if cl else 0
        px, py = round(w * 0.045), round(clh * 0.32)
        bw, bh = round(tw + 2 * px), round(clh + 2 * py)
        x0, y0 = round((w - bw) / 2), h - round(h * 0.06) - bh
        draw.rounded_rectangle((x0, y0 + 4, x0 + bw, y0 + bh + 4), radius=bh // 2, fill=tuple(c // 2 for c in accent))  # shadow
        draw.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), radius=bh // 2, fill=accent)
        draw.text((x0 + px, y0 + py), cl[0], font=cf, fill=WHITE)

    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()
