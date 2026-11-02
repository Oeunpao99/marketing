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
    │   Headline   │  ← two balanced lines at most; scrim fades into the picture
    │   headline   │
    │  subheading  │
    │ ░ • point  ░ │  ← the detail list, on a soft panel with faded edges
    │ ░ • point  ░ │
    │   picture    │
    │  ( button )  │  ← 2-4 words, wraps rather than being cut
    │   site.com   │  ← the link, small
    └──────────────┘

The words are made poster-ready when they're read out of the prompt: one
language, the brand named once, a short headline, never a URL on the button.

Only used when the extracted text has Khmer in it — English text the model
spells fine, so those images are made exactly as before.
"""

from __future__ import annotations

import io
import logging
import re

from PIL import Image, ImageDraw, ImageFilter, ImageStat, features

from app.meme import _font, _has_khmer, _wrap, drawable, fit_lines, logo_corner, stamp_logo
from app.poster import INK, WHITE, _line_h, _tint

log = logging.getLogger("app.text_overlay")

EXTRACT_PROMPT = (
    "You read an image-generation prompt for a social media poster and return the words "
    "to PRINT on it — poster-ready: read in one glance while scrolling. LESS IS MORE: "
    "the posters that stop people carry one short, bold headline and at most one small "
    "line — never a paragraph. Use the prompt's own "
    "words and spelling (never translate or reword), but choose and trim:\n"
    "- ONE language: when a line is given in two languages (Khmer / English, or the same "
    "idea twice), keep only the Khmer version; English-only text stays English.\n"
    "- Say the brand or product name at most once on the whole poster.\n"
    "- Never print web addresses, step lists (\"Connect → Configure → …\") or long paragraphs "
    "in the headline, subheading or button.\n"
    "Return a JSON object:\n"
    '{"headline": "...", "highlight": "...", "subheading": "...", "points": ["...", ...], "cta": "...", "link": "..."}\n'
    "- headline: the main title, at most 6 words — punchy (if the prompt's is longer, keep its "
    "strongest part, e.g. the words before a dash). Two stacked lines (a brand name, then a "
    "Khmer line) may be joined with \\n.\n"
    "- highlight: the 1-3 words of the headline that carry its point (the key idea, the "
    "question word, the product), copied EXACTLY as they appear in the headline — they are "
    "printed in the brand colour. \"\" when nothing stands out.\n"
    "- subheading: usually \"\". Only a must-know fact the headline lacks — the offer, "
    "price, date or place — in at most 10 words.\n"
    "- points: [] — unless the prompt itself lists details, benefits or tags to print on the "
    "poster; then at most 3, each one short line of at most 6 words (they are printed as a "
    "bullet list), and only when there is no subheading.\n"
    "- cta: the button, 2-4 words of action (e.g. \"ចុះឈ្មោះឥឡូវ\", \"Order now\") — never a URL; "
    "\"\" when the prompt asks for none.\n"
    "- link: the website (without https://) or phone number to show small under the button, or \"\".\n"
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
    "clear space at the bottom centre for a button. Never draw EMPTY placeholders meant for "
    "words — no blank banners, ribbons, brush strokes, pills or label bars: "
    "where words would go, just show the picture. If a brand logo image is given, place "
    "it unchanged in a bottom corner."
)


_URL = re.compile(r"(?:https?://|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|kh|io|app|co)(?:/\S*)?", re.I)


def wanted() -> bool:
    """Whether this server can draw Khmer at all (libraqm shapes it)."""
    return features.check("raqm")


def extract_text(prompt: str) -> dict | None:
    """The on-image text in ``prompt`` — None when there is none, or none of
    it is Khmer (the model spells Latin text fine). Raises ContentAIError."""
    from app.content_ai import _chat, writer_model

    # the same writer as captions and scripts: the model the person / workspace
    # picked (Claude, GPT, Gemini …), else the platform's Khmer writer
    raw = _chat(
        [{"role": "system", "content": EXTRACT_PROMPT}, {"role": "user", "content": prompt[:6000]}],
        writer_model(khmer=True),
        max_tokens=1500,
        effort="low",
    )

    def s(v, n: int, lines: int = 1) -> str:
        """Whitespace tidied; up to ``lines`` stacked lines kept as \\n; at
        most ``n`` characters, cut between words — never inside one."""
        kept = [t for t in (" ".join(ln.split()) for ln in str(v or "").split("\n")) if t]
        out = "\n".join(kept[:lines]) if lines > 1 else " ".join(kept)
        if len(out) > n:
            cut = out[: n + 1].rsplit(" ", 1)[0].rstrip(" ,;:—-/")
            out = (cut if len(cut) > n // 2 else out[:n]) + "…"
        return out

    # Even when the model copies too much, the poster gets one language and no
    # web address in its big text: the address moves to the small link line.
    found: list[str] = []

    def tidy(v) -> str:
        t = str(v or "")

        def keep_url(m):
            found.append(m.group(0))
            return ""

        t = _URL.sub(keep_url, t)
        t = t.split("→")[0] if "→" in t else t  # "Connect → Configure → …" steps
        parts = [p.strip() for p in t.split(" / ")]
        if len(parts) > 1 and any(_has_khmer(p) for p in parts):
            t = " ".join(p for p in parts if _has_khmer(p))  # the Khmer side of "Khmer / English"
        return t.strip(" :–—-")

    points = raw.get("points") if isinstance(raw.get("points"), list) else []
    head, sub, cta = tidy(raw.get("headline")), tidy(raw.get("subheading")), tidy(raw.get("cta"))
    link = s(raw.get("link") or (found[0] if found else ""), 48)
    link = link.removeprefix("https://").removeprefix("http://").removeprefix("www.").rstrip("/.")
    headline = s(head, 90, lines=2)
    key = " ".join(str(raw.get("highlight") or "").split())
    text = {
        "headline": headline,
        # only words really in the headline — anything else is dropped, never drawn
        "highlight": key if key and len(key) < len(headline) and key in " ".join(headline.split()) else "",
        "subheading": s(sub, 90),
        # tags only on a poster with no subheading — a headline + one more row at most
        "points": [] if sub else [p for p in (s(v, 48) for v in points[:3]) if p],
        "cta": s(cta, 32),
        "link": link,
    }
    if not text["headline"]:
        return None
    every = [text["headline"], text["subheading"], text["cta"], *text["points"]]
    return text if any(_has_khmer(t) for t in every) else None


# ── drawing ───────────────────────────────────────────────────────────────
def _fit(text: str, width: int, max_lines: int, big: int, small: int, weight: str):
    """The biggest size (big → small) where ``text`` wraps into ≤ max_lines
    lines that each fit ``width`` — whole words first, nothing cut.
    (font, lines, line height)."""
    font, lines = fit_lines(text, width, max_lines, range(big, small - 1, -max(1, (big - small) // 12)), weight)
    return font, lines, _line_h(font)


def _centred(draw: ImageDraw.ImageDraw, w: int, y: int, lines, font, fill, lh: int, glow=None, key: str = "", key_fill=None) -> int:
    """Lines centred from ``y``. ``glow``: an "L" draw the same text goes into too
    (blurred later into a soft halo behind it). ``key``: the headline's key words,
    drawn in ``key_fill`` — also when the wrap split them over two lines."""
    for ln in lines:
        x = (w - font.getlength(ln)) / 2
        for part, hot in _runs(ln, key):
            draw.text((x, y), part, font=font, fill=key_fill if hot and key_fill else fill)
            if glow is not None:
                glow.text((x, y), part, font=font, fill=255)
            x += font.getlength(part)
        y += lh
    return y


def _runs(line: str, key: str) -> list[tuple[str, bool]]:
    """``line`` cut into (text, is key) pieces. The key may sit inside the line,
    or be split by the wrap: the line's end starts it, or its start ends it."""
    if not key:
        return [(line, False)]
    i = line.find(key)
    if i >= 0:
        return [p for p in ((line[:i], False), (key, True), (line[i + len(key):], False)) if p[0]]
    if line.strip() and line.strip() in key:
        return [(line, True)]
    for n in range(min(len(line), len(key)) - 1, 1, -1):
        if line.endswith(key[:n]) and key[:n].strip():
            return [(line[:-n], False), (line[-n:], True)]
        if line.startswith(key[-n:]) and key[-n:].strip():
            return [(line[:n], True), (line[n:], False)]
    return [(line, False)]


def _readable(c: tuple[int, int, int], light: bool) -> tuple[int, int, int]:
    """The brand colour, deep enough to read on a light picture / bright enough on a dark one."""
    lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    if light and lum > 120:
        k = 120 / lum
        return tuple(round(v * k) for v in c)
    if not light and lum < 150:
        return _tint(c, min(0.7, (150 - lum) / 255 + 0.25))
    return c


def _balanced(text: str, font, width: int, lines: list[str]) -> list[str]:
    """Two lines of about the same length instead of a full line and a lone
    word under it (the user, 2026-11-02): the narrowest width that still wraps
    ``text`` into as many lines, on whole words."""
    if len(lines) != 2 or "\n" in text:
        return lines
    lo, hi, best = round(width * 0.4), width, lines
    while lo <= hi:
        mid = (lo + hi) // 2
        trial = _wrap(text, font, mid, clusters=False)
        if len(trial) <= 2 and all(font.getlength(ln) <= mid for ln in trial):
            best, hi = trial, mid - 1
        else:
            lo = mid + 1
    return best


def _layout(head: str, sub: str, points: list[str], w: int, measure: int, scale: float):
    """Fonts, wrapped lines and the detail list for the top block at ``scale``.
    The headline is big and at most two balanced lines; on its own it's bigger
    still — it's the whole poster."""
    big = 0.115 if not sub and not points else 0.1
    hf, hl, hlh = _fit(head, measure, 2, round(w * big * scale), round(w * 0.045 * scale), "Bold")
    hl = _balanced(head, hf, measure, hl)
    sf, sl, slh = (
        _fit(sub, measure, 2, round(w * 0.038 * scale), round(w * 0.027 * scale), "Medium") if sub else (None, [], 0)
    )
    # Points: a bullet list on a soft faded panel under the headline — each
    # point one line (two at most), left-aligned after its dot.
    pf = _font(round(w * 0.034 * scale), "Medium")
    plh = _line_h(pf)
    ppx, ppy, dot = round(w * 0.04 * scale), round(w * 0.026 * scale), round(plh * 0.28)
    avail = measure - 2 * ppx - dot * 3
    items = [_wrap(p, pf, avail)[:2] for p in points]
    widest = max((pf.getlength(ln) for it in items for ln in it), default=0)
    panel = (round(widest) + dot * 3 + 2 * ppx, sum(len(it) for it in items) * plh + max(0, len(items) - 1) * round(plh * 0.3) + 2 * ppy) if items else (0, 0)
    return hf, hl, hlh, sf, sl, slh, pf, plh, ppx, ppy, dot, items, panel, round(w * 0.016 * scale)


def render(picture: bytes, text: dict, accent: tuple[int, int, int], logo: bytes | None = None) -> bytes:
    """``picture`` with ``text`` (from extract_text) drawn on it. PNG bytes. With ``logo`` the
    brand's logo is stamped top-left (meme.stamp_logo) and the headline starts below it."""
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
        hf, hl, hlh, sf, sl, slh, pf, plh, ppx, ppy, dot, items, panel, gap = _layout(head, sub, points, w, measure, scale)
        block_h = len(hl) * hlh + (gap + len(sl) * slh if sl else 0) + (gap * 2 + panel[1] if items else 0)
        # a detail list may reach a little lower than the calm zone — it brings its own panel
        if block_h <= h * (0.36 + (0.08 if items else 0) - (0.1 if logo else 0)):
            break
    top = round(h * 0.05)
    if logo:  # under the top-left logo, never beside or behind it
        chip_h, margin = logo_corner(w)
        top = max(top, margin + chip_h + round(h * 0.03))
    bottom = top + block_h

    # Light text on a dark picture, dark text on a light one — read from the
    # zone the text covers. A busy zone gets a stronger scrim than a calm one.
    zone = img.crop((0, 0, w, min(h, bottom + pad))).convert("L")
    stat = ImageStat.Stat(zone)
    light = stat.mean[0] >= 140
    busy = stat.stddev[0] > 38
    ink = INK if light else WHITE
    shade = (255, 255, 255) if light else (8, 12, 20)
    # a light veil only — the picture's own colours show through; a soft halo
    # behind the letters (below) keeps them readable instead of a heavy wash
    solid = 150 if busy else 70
    fade = round(h * 0.12)

    scrim = Image.new("L", (1, h), 0)
    for y in range(min(h, bottom + pad + fade)):
        a = solid if y <= bottom + pad // 2 else solid * (1 - (y - bottom - pad // 2) / (pad // 2 + fade))
        scrim.putpixel((0, y), max(0, round(a)))
    img = Image.composite(Image.new("RGB", (w, h), shade), img, scrim.resize((w, h)))

    # the words go on their own layer first, so the halo can be drawn under them
    words = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    halo = Image.new("L", (w, h), 0)
    draw, glow = ImageDraw.Draw(words), ImageDraw.Draw(halo)
    hot = _readable(accent, light)

    y = _centred(draw, w, top, hl, hf, ink, hlh, glow, text.get("highlight", ""), hot)
    if sl:
        y = _centred(draw, w, y + gap, sl, sf, _tint(INK, 0.15) if light else _tint(ink, 0.08), slh, glow)
    list_y = y + gap * 2

    halo = halo.filter(ImageFilter.GaussianBlur(max(4, round(w * 0.012))))
    halo = halo.point(lambda v: min(255, round(v * (1.6 if busy else 1.2))))
    img = Image.composite(Image.new("RGB", (w, h), shade), img, halo)
    img.paste(words, (0, 0), words)

    if items:
        # The detail list on a soft panel whose edges fade into the picture:
        # • point
        # • point
        pw, ph = panel
        px, py = round((w - pw) / 2), list_y
        # a pale tint of the brand colour (deep on a dark picture), so the shape shows
        feather = max(6, round(w * 0.014))
        tint = _tint(accent, 0.76) if light else tuple(round(c * 0.3 + 8) for c in accent)
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).rounded_rectangle((px, py, px + pw, py + ph), radius=round(ph * 0.18), fill=235)
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
        img = Image.composite(Image.new("RGB", (w, h), tint), img, mask)
        d = ImageDraw.Draw(img)
        y = py + ppy
        for lines in items:
            cy = y + plh // 2
            d.ellipse((px + ppx, cy - dot // 2, px + ppx + dot, cy + dot // 2 + dot % 2), fill=hot)
            for ln in lines:
                d.text((px + ppx + dot * 3, y), ln, font=pf, fill=ink)
                y += plh
            y += round(plh * 0.3)
    draw = ImageDraw.Draw(img)

    # The button and the link sit bottom-centre, no wider than the middle ~56%
    # — the logo the model was asked to put in a bottom corner stays clear.
    link = drawable(text.get("link", ""))
    base = h - round(h * 0.055)
    if link:
        lf, ll, llh = _fit(link, round(w * 0.56), 1, round(w * 0.026), round(w * 0.019), "Medium")
        lw = round(max(lf.getlength(ln) for ln in ll)) + round(w * 0.04)
        lh = llh * len(ll) + round(llh * 0.4)
        lx = round((w - lw) / 2)
        draw.rounded_rectangle((lx, base - lh, lx + lw, base), radius=lh // 2, fill=(8, 12, 20) if not light or busy else (255, 255, 255))
        _centred(draw, w, base - lh + round(llh * 0.2), ll, lf, WHITE if not light or busy else INK, llh)
        base -= lh + round(h * 0.018)
    if cta:
        # wraps onto a second line rather than being cut
        cf, cl, clh = _fit(cta, round(w * 0.48), 2, round(w * 0.036), round(w * 0.024), "SemiBold")
        tw = max(cf.getlength(ln) for ln in cl) if cl else 0
        px, py = round(w * 0.045), round(clh * 0.32)
        bw, bh = round(tw + 2 * px), round(clh * len(cl) + 2 * py)
        x0, y0 = round((w - bw) / 2), base - bh
        draw.rounded_rectangle((x0, y0 + 4, x0 + bw, y0 + bh + 4), radius=min(bh // 2, round(clh * 0.9)), fill=tuple(c // 2 for c in accent))  # shadow
        draw.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), radius=min(bh // 2, round(clh * 0.9)), fill=accent)
        _centred(draw, w, y0 + py, cl, cf, WHITE, clh)

    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    # the brand's real logo, top-left, above the text it sits over (the headline starts below it)
    return stamp_logo(out.getvalue(), logo) if logo else out.getvalue()
