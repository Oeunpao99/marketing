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

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat, features

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
    "INFOGRAPHIC — only when the prompt (or the post it quotes) explains 2-4 ways, benefits, "
    "tips or steps, each with its own short title AND a sentence about it, also return:\n"
    '"intro": "...", "items": [{"title": "...", "detail": "..."}, ...], "banner": "...", "question": "..."\n'
    "- headline: then the full title as written (at most 12 words), not cut.\n"
    "- intro: the line under the title that sets it up, at most 22 words, or \"\".\n"
    "- items: 2-4, in order — title at most 7 words, detail at most 20 words (the post's own "
    "sentence, trimmed). No emoji.\n"
    "- banner: the closing line (the take-away), at most 14 words, or \"\".\n"
    "- question: a closing question to the reader, at most 14 words, or \"\".\n"
    "Otherwise leave intro, items, banner and question out.\n"
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
        max_tokens=4000,  # an infographic's rows (Khmer is token-heavy) cut off at 1500
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
    # an infographic: 2-4 titled rows (_render_infographic draws the whole layout)
    rows = raw.get("items") if isinstance(raw.get("items"), list) else []
    items = [
        {"title": s(tidy(r.get("title")), 60), "detail": s(tidy(r.get("detail")), 150)}
        for r in rows[:4]
        if isinstance(r, dict) and str(r.get("title") or "").strip()
    ]
    if len(items) >= 2:
        text.update(
            headline=s(head, 120, lines=2),
            highlight=key if key and key in " ".join(s(head, 120, lines=2).split()) else "",
            intro=s(tidy(raw.get("intro")), 170),
            items=items,
            banner=s(tidy(raw.get("banner")), 110),
            question=s(tidy(raw.get("question")), 100),
            points=[],
        )
    if not text["headline"]:
        return None
    every = [text["headline"], text["subheading"], text["cta"], *text["points"], *(i["title"] for i in text.get("items", []))]
    return text if any(_has_khmer(t) for t in every) else None


# The picture under an infographic: one subject and a calm background — the
# headline, the cards and the banner are all drawn by _render_infographic.
INFOGRAPHIC_RULE = (
    "\n\nLAYOUT AND TEXT ARE ADDED AFTERWARDS — this overrides any layout, card, TYPOGRAPHY or "
    "text instructions above. Draw ONLY the background and ONE friendly subject (the mascot, "
    "robot or person the prompt describes — with a laptop or a desk if it fits). In a wide or "
    "square frame the subject sits in the LOWER-LEFT: it fills the left third of the frame, "
    "below the top 30%. In a tall frame it sits in the middle band (from 28% to 50% of the "
    "height), centred. Everything else is a calm, bright, softly blurred background (a light "
    "modern office, window light, a few plants at the edges) with nothing on it — a designer "
    "places the headline at the top and a column of cards over the rest. Draw NO letters, "
    "numbers, cards, panels, buttons, banners, icons, logos or screens with UI anywhere."
)


def picture_rule(text: dict) -> str:
    """What goes after the person's prompt for the picture under ``text``."""
    return INFOGRAPHIC_RULE if text.get("items") else NO_TEXT_RULE


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
    if len(text.get("items") or []) >= 2:
        return _render_infographic(picture, text, accent, logo)
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


# ── infographic ───────────────────────────────────────────────────────────
# The user's reference (2026-11-02), drawn by us so the Khmer is always right:
#
#    ┌──────────────────────────────────┐
#    │  3 វិធីដែល [AI] អាចជួយ             │  ← two balanced lines, the key word on a badge
#    │  អាជីវកម្មរបស់អ្នក                    │
#    │  ▌ the intro line                 │
#    │ (subject) ┌[1] title ──────────┐  │  ← soft cards, a coloured number tile each
#    │           │    detail…         │  │
#    │           ├[2] title ──────────┤  │
#    │           ├[3] title ──────────┤  │
#    │ [ banner…            ] [? ask →] │
#    └──────────────────────────────────┘
#
# A tall frame: the cards span the width under the subject's band.
TILES = ((14, 165, 233), (245, 158, 11), (16, 185, 129))  # after the brand colour: sky, amber, green


def _left(draw, x: int, y: int, lines, font, fill, lh: int, key: str = "", key_fill=None, badge: bool = False) -> int:
    """Left-aligned lines from (x, y); ``key`` words in ``key_fill`` — on a rounded
    badge of that colour (white letters) when ``badge``."""
    for ln in lines:
        cx = x
        for part, hot in _runs(ln, key):
            pw = font.getlength(part)
            if hot and key_fill and badge:
                bx = round(lh * 0.16)
                top, bottom = y + round(lh * 0.06), y + round(lh * 0.98)
                draw.rounded_rectangle((cx, top, cx + pw + 2 * bx, bottom), radius=round(lh * 0.22), fill=key_fill)
                draw.text((cx + bx, y), part, font=font, fill=WHITE)
                cx += pw + 2 * bx
            else:
                draw.text((cx, y), part, font=font, fill=key_fill if hot and key_fill else fill)
                cx += pw
        y += lh
    return y


def _shadowed(img: Image.Image, box, radius: int, fill, alpha: int, blur: int, fade_from: int = 0) -> Image.Image:
    """A rounded box of ``fill`` at ``alpha`` with a faint shadow under it.
    ``fade_from``: the box's left edge is that see-through and grows to ``alpha``
    over its first 45% — the picture beside it stays in view, the words sit on
    the solid part (the user: no heavy overlay on the picture, 2026-11-02)."""
    w, h = img.size
    sh = Image.new("L", (w, h), 0)
    ImageDraw.Draw(sh).rounded_rectangle((box[0], box[1] + blur // 2, box[2], box[3] + blur // 2), radius=radius, fill=22)
    img = Image.composite(Image.new("RGB", (w, h), (15, 23, 42)), img, sh.filter(ImageFilter.GaussianBlur(blur)))
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=radius, fill=255)
    ramp = Image.new("L", (w, 1), alpha)
    if fade_from:
        x0, span = box[0], max(1, round((box[2] - box[0]) * 0.45))
        for x in range(x0, min(w, x0 + span)):
            ramp.putpixel((x, 0), round(fade_from + (alpha - fade_from) * (x - x0) / span))
    m = ImageChops.multiply(m, ramp.resize((w, h)))
    return Image.composite(Image.new("RGB", (w, h), fill), img, m.filter(ImageFilter.GaussianBlur(1)))


def _infographic_layout(text: dict, w: int, h: int, scale: float, top: int):
    """Every font, wrapped line and box of the infographic at ``scale`` — and the
    height it all needs, so the caller can shrink until it fits."""
    u = min(w, h) * scale
    wide = w >= h * 0.95
    pad = round(min(w, h) * 0.05)
    measure = w - 2 * pad
    hf, hl, hlh = _fit(text["headline"], measure, 2, round(u * 0.09), round(u * 0.05), "Bold")
    hl = _balanced(text["headline"], hf, measure, hl)
    intro = text.get("intro", "")
    bar = max(3, round(u * 0.005))
    inf, il, ilh = _fit(intro, measure - bar * 4, 2, round(u * 0.031), round(u * 0.024), "Regular") if intro else (None, [], 0)
    il = _balanced(intro, inf, measure - bar * 4, il) if intro else il
    # the cards' column: right of the subject in a wide / square frame, the full width when tall
    cx0 = round(w * 0.3) if wide else pad
    cw = w - pad - cx0
    tf, df = _font(round(u * 0.04), "Bold"), _font(round(u * 0.028), "Regular")
    tlh, dlh = _line_h(tf), _line_h(df)
    tile = round(tlh * 1.55)
    cpx, cpy = round(u * 0.028), round(u * 0.022)
    tx = cpx + tile + round(u * 0.025)
    cards = []
    for it in text["items"]:
        tl = _wrap(it["title"], tf, cw - tx - cpx)[:2]
        dl = _wrap(it["detail"], df, cw - tx - cpx)[:3] if it.get("detail") else []
        cards.append((tl, dl, max(tile, len(tl) * tlh + len(dl) * dlh) + 2 * cpy))
    bf, qf = _font(round(u * 0.032), "SemiBold"), _font(round(u * 0.026), "SemiBold")
    banner, question = text.get("banner", ""), text.get("question", "")
    gap = round(u * 0.022)
    # the bottom row: banner (wider) and the question side by side; stacked when tall
    side = wide and banner and question
    bw = round(measure * 0.62) if side else measure
    qw = measure - bw - gap if side else measure
    bl = _balanced(banner, bf, bw - round(u * 0.09), _wrap(banner, bf, bw - round(u * 0.09))[:2]) if banner else []
    qdot = round(_line_h(qf) * 1.5)
    ql = _balanced(question, qf, qw - qdot - round(u * 0.11), _wrap(question, qf, qw - qdot - round(u * 0.11))[:2]) if question else []
    bh = len(bl) * _line_h(bf) + 2 * round(u * 0.028) if bl else 0
    qh = max(qdot, len(ql) * _line_h(qf)) + 2 * round(u * 0.022) if ql else 0
    bottom_h = max(bh, qh) if side else bh + qh + (gap if bh and qh else 0)
    head_h = len(hl) * hlh + (gap + len(il) * ilh if il else 0)
    cards_h = sum(c[2] for c in cards) + gap * (len(cards) - 1)
    need = top + head_h + gap * 2 + cards_h + (gap * 2 + bottom_h if bottom_h else 0) + pad
    return locals()


def _render_infographic(picture: bytes, text: dict, accent: tuple[int, int, int], logo: bytes | None = None) -> bytes:
    """The infographic layout (see the drawing above) over ``picture``. PNG bytes."""
    img = Image.open(io.BytesIO(picture)).convert("RGB")
    w, h = img.size
    top = round(min(w, h) * 0.05)
    if logo:
        chip_h, margin = logo_corner(w)
        top = max(top, margin + chip_h + round(h * 0.02))
    text = {**text, "headline": drawable(text["headline"]), "intro": drawable(text.get("intro", "")),
            "items": [{"title": drawable(i["title"]), "detail": drawable(i.get("detail", ""))} for i in text["items"]],
            "banner": drawable(text.get("banner", "")), "question": drawable(text.get("question", ""))}
    for scale in (1.0, 0.93, 0.86, 0.79, 0.72, 0.65, 0.58):
        L = _infographic_layout(text, w, h, scale, top)
        if L["need"] <= h:
            break
    pad, gap, wide = L["pad"], L["gap"], L["wide"]

    # a light veil behind the headline, fading into the picture
    head_bottom = top + L["head_h"]
    zone = img.crop((0, 0, w, min(h, head_bottom + pad))).convert("L")
    light = ImageStat.Stat(zone).mean[0] >= 120
    shade = (255, 255, 255) if light else (8, 12, 20)
    ink = INK if light else WHITE
    scrim = Image.new("L", (1, h), 0)
    fade = round(h * 0.1)
    for y in range(min(h, head_bottom + pad + fade)):
        a = 105 if y <= head_bottom + pad // 2 else 105 * (1 - (y - head_bottom - pad // 2) / (pad // 2 + fade))  # a light veil, not a wash
        scrim.putpixel((0, y), max(0, round(a)))
    img = Image.composite(Image.new("RGB", (w, h), shade), img, scrim.resize((w, h)))
    hot = _readable(accent, light)

    # the cards first (their shadows go under everything after them)
    y_cards = head_bottom + gap * 2
    bottom_h = L["bottom_h"]
    y_bottom = h - pad - bottom_h
    room = (y_bottom - gap * 2 if bottom_h else h - pad) - y_cards
    if not wide:  # tall: below the subject's band when there's room for it
        y_cards = max(y_cards, min(round(h * 0.5), y_cards + room - L["cards_h"]))
        room = (y_bottom - gap * 2 if bottom_h else h - pad) - y_cards
    spare = max(0, room - L["cards_h"])
    step = gap + min(spare // max(1, len(L["cards"]) - 1), gap * 2) if len(L["cards"]) > 1 else 0
    radius = round(L["u"] * 0.035)
    y = y_cards
    boxes = []
    for i, (tl, dl, ch) in enumerate(L["cards"]):
        colour = accent if i == 0 else TILES[(i - 1) % len(TILES)]
        box = (L["cx0"], y, L["cx0"] + L["cw"], y + ch)
        # see-through, fading in from the left: the picture shows, the words stay readable
        img = _shadowed(img, box, radius, _tint(colour, 0.9), 200, max(6, round(L["u"] * 0.02)), fade_from=70)
        boxes.append((box, colour, tl, dl))
        y += ch + step
    draw = ImageDraw.Draw(img)

    # the headline, its key word on a brand badge, and the intro with its accent bar
    key = text.get("highlight", "")
    y = _left(draw, pad, top, L["hl"], L["hf"], ink, L["hlh"], key, hot, badge=len(key) <= 12)
    if L["il"]:
        y += gap
        draw.rounded_rectangle((pad, y + round(L["ilh"] * 0.15), pad + L["bar"], y + len(L["il"]) * L["ilh"] - round(L["ilh"] * 0.1)), radius=L["bar"], fill=hot)
        _left(draw, pad + L["bar"] * 4, y, L["il"], L["inf"], _tint(ink, 0.25) if light else ink, L["ilh"])

    # inside each card: the numbered tile, the bold title, the detail
    tf, df, tlh, dlh, tile, cpx, cpy, tx = L["tf"], L["df"], L["tlh"], L["dlh"], L["tile"], L["cpx"], L["cpy"], L["tx"]
    nf = _font(round(tile * 0.5), "Bold")
    for n, (box, colour, tl, dl) in enumerate(boxes, 1):
        x0, y0 = box[0], box[1]
        ty = y0 + (box[3] - y0 - tile) // 2
        draw.rounded_rectangle((x0 + cpx, ty, x0 + cpx + tile, ty + tile), radius=round(tile * 0.26), fill=colour)
        num = str(n)
        draw.text((x0 + cpx + (tile - nf.getlength(num)) / 2, ty + (tile - _line_h(nf)) / 2), num, font=nf, fill=WHITE)
        block = len(tl) * tlh + len(dl) * dlh
        yy = y0 + (box[3] - y0 - block) // 2
        yy = _left(draw, x0 + tx, yy, tl, tf, INK, tlh)
        _left(draw, x0 + tx, yy, dl, df, _tint(INK, 0.3), dlh)

    # the bottom row: the banner in the brand colour, the question as an outlined pill
    if bottom_h:
        u = L["u"]
        x = pad
        yb = y_bottom
        if L["bl"]:
            bh = L["bh"]
            by = yb + (bottom_h - bh) // 2 if L["side"] else yb
            draw.rounded_rectangle((x, by + 4, x + L["bw"], by + bh + 4), radius=round(bh * 0.3), fill=tuple(c // 2 for c in accent))
            draw.rounded_rectangle((x, by, x + L["bw"], by + bh), radius=round(bh * 0.3), fill=accent)
            _left(draw, x + round(u * 0.045), by + round(u * 0.028), L["bl"], L["bf"], WHITE, _line_h(L["bf"]))
            if L["side"]:
                x += L["bw"] + gap
            else:
                yb += bh + gap
        if L["ql"]:
            qh, qf, qdot = L["qh"], L["qf"], L["qdot"]
            qy = yb + (bottom_h - qh) // 2 if L["side"] else yb
            qx1 = x + L["qw"]
            draw.rounded_rectangle((x, qy, qx1, qy + qh), radius=round(qh * 0.3), fill=WHITE, outline=hot, width=max(2, round(u * 0.004)))
            dx, dy = x + round(u * 0.03), qy + (qh - qdot) // 2
            draw.ellipse((dx, dy, dx + qdot, dy + qdot), fill=hot)
            qm = _font(round(qdot * 0.62), "Bold")
            draw.text((dx + (qdot - qm.getlength("?")) / 2, dy + (qdot - _line_h(qm)) / 2), "?", font=qm, fill=WHITE)
            qlh = _line_h(qf)
            _left(draw, dx + qdot + round(u * 0.022), qy + (qh - len(L["ql"]) * qlh) // 2, L["ql"], qf, INK, qlh)
            # an arrow at the end: →
            ax, ay, al = qx1 - round(u * 0.035), qy + qh // 2, round(u * 0.022)
            lw = max(2, round(u * 0.005))
            draw.line((ax - al, ay, ax, ay), fill=hot, width=lw)
            draw.line((ax - al // 2, ay - al // 2, ax, ay, ax - al // 2, ay + al // 2), fill=hot, width=lw, joint="curve")

    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return stamp_logo(out.getvalue(), logo) if logo else out.getvalue()
