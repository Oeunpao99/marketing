"""AI design's layouts and looks (motion/src/canvas.jsx draws them).

The AI used to place every layer itself (x / y / size) — and a writing model
can't see the frame, so designs came out crowded, overlapping or lopsided.
Now it PICKS a designed layout per scene and FILLS its slots (words, icons,
pictures, numbers); the layers are placed here, for a tall (9:16) or wide
(16:9) frame — the same rules every time, so every scene is balanced. Its
colours come from a designed look (LOOKS), never any hex it fancies.

layout_layers(raw, wide) → the raw layers app/motion.py _clean_canvas checks
like any design.
"""

import re

# ── the looks: designed colour sets (dark / light background, two accents) ──
# Backgrounds are flat colour with line patterns only — never a glow or a
# gradient (the user's rule for every template).
LOOKS = {
    "midnight": {"dark": "#0B1020", "light": "#F4F6FB", "a": "#4F8CFF", "b": "#22D3EE", "backgrounds": ["grid"], "card": "glass", "radius": 18, "say": "navy and electric blue — tech, SaaS, AI, security"},
    "ember": {"dark": "#170D08", "light": "#FFF6EE", "a": "#FF6B2C", "b": "#FFC24B", "backgrounds": ["dots", "rings"], "card": "solid", "radius": 22, "say": "warm black, orange and amber — food, coffee, energy, events"},
    "forest": {"dark": "#0B1A14", "light": "#F1F8F3", "a": "#2FBF71", "b": "#B5E655", "backgrounds": ["grid", "waves"], "card": "solid", "radius": 20, "say": "deep green and lime — health, nature, farming, growth, money saved"},
    "royal": {"dark": "#120B24", "light": "#F6F3FF", "a": "#8B5CF6", "b": "#F472B6", "backgrounds": ["hex", "rings"], "card": "glass", "radius": 24, "say": "violet and pink — beauty, fashion, creative, premium"},
    "ocean": {"dark": "#06161F", "light": "#EEF8FB", "a": "#14B8A6", "b": "#38BDF8", "backgrounds": ["waves", "dots"], "card": "glass", "radius": 20, "say": "teal and sky blue — travel, water, clean, calm, healthcare"},
    "gold": {"dark": "#14110A", "light": "#FBF7EC", "a": "#E8B931", "b": "#F5E6B3", "backgrounds": ["city", "grid"], "card": "solid", "radius": 12, "say": "black and gold — corporate, finance, real estate, luxury, LED-screen events"},
    "coral": {"dark": "#1A0E12", "light": "#FFF3F1", "a": "#F43F5E", "b": "#FB923C", "backgrounds": ["dots", "grid"], "card": "solid", "radius": 26, "say": "coral and orange — retail, promotions, sale, youth"},
    "mono": {"dark": "#111111", "light": "#F5F5F4", "a": "#FACC15", "b": "#A3A3A3", "backgrounds": ["grid", "solid"], "card": "solid", "radius": 10, "say": "black, white and one yellow — bold, editorial, news"},
}
# no "network" (dots joined by lines): too busy behind the words
LOOK_BACKGROUNDS = ("grid", "dots", "city", "hex", "waves", "rings", "solid")

# ── the layouts ────────────────────────────────────────────────────────────
LAYOUTS = {
    "hero": "one big headline in the middle (kicker pill above, a short line under, an icon tile on top) — the opening, a big statement",
    "split": "text on one side, a visual on the other (a drawn picture of the moment, a phone / laptop with the brand's screenshot, a product photo, a big icon or a small chart) — explaining an idea or a feature",
    "picture": "a big drawn picture of the moment with the headline beside it (16:9) or above it (9:16) — when SEEING the situation tells the story (people, a place, a feeling)",
    "cards": "a title and 2-3 cards, each an icon + a short title + one line — features, reasons, options",
    "metric": "one big number counting up with its label (a kicker above, a line under) — ONLY a true number",
    "list": "a title and 2-5 short points with icons — steps, benefits, what's included",
    "quote": "a quotation, big, with who said it — a testimonial or a lesson",
    "device": "a title and a phone / laptop showing the brand's app, a notification popping beside it — the product working",
    "compare": "before vs after (or old way vs new way): two cards, the second one highlighted",
    "chart": "a title and a chart (line / bars / donut) with a caption — a trend, growth, a share",
    "steps": "three steps in a row, each an icon and a label, data flowing from one to the next — how it works",
    "reveal": "THE reveal: a small pill, then the product or big word lands (use hit: true, often after a pause)",
    "end": "the brand's logo, the tagline and the call-to-action pill — the last scene",
}

_TEXT_IN = ("rise", "blur", "scale", "fade")


def _s(v, n: int) -> str:
    return " ".join(str(v or "").split())[:n]


def _plain_len(text: str) -> int:
    return len(re.sub(r"[\[\]​]", "", text or ""))


def _head(text: str, big: bool = False) -> int:
    """A headline size that fits its length (px of a 1080 frame)."""
    n = _plain_len(text)
    if big:  # the thumbnail look (Picture story): big words in two lines
        return 146 if n <= 16 else 126 if n <= 28 else 106 if n <= 48 else 88
    return 116 if n <= 20 else 102 if n <= 36 else 86 if n <= 60 else 72


def _text(text, x, y, size, at, *, maxw, align="center", weight=800, tin="rise", color=None, hit=False, highlight=None):
    # [key words] marked in the look's accent, not the brand's colour
    L = {"kind": "text", "text": text, "x": x, "y": y, "size": size, "weight": weight, "at": at, "in": tin, "maxw": maxw, "align": align, "highlight": "a"}
    if color:
        L["color"] = color
    if highlight:
        L["highlight"] = highlight
    if hit:
        L["hit"] = True
    return L


def _pill(text, x, y, at=0.1, *, fill=None, icon=None, caps=False):
    L = {"kind": "pill", "text": text, "x": x, "y": y, "at": at, "in": "fade", "size": 38}
    if fill:
        L.update(fill=fill, color="bg")
    if icon:
        L["icon"] = icon
    if caps:
        L["caps"] = True
    return L


def _visual(v: dict, x, y, at, wide: bool, *, big=False) -> list[dict]:
    """The picture side of a scene: a device, a photo, an icon tile or a chart."""
    kind = v.get("kind")
    if kind == "device":
        device = v.get("device") if v.get("device") in ("phone", "laptop", "tablet", "monitor") else ("laptop" if wide else "phone")
        w = {"phone": 340 if wide else 400, "laptop": 820 if wide else 860, "tablet": 520 if wide else 600, "monitor": 820 if wide else 860}[device]
        if big:
            w = int(w * 1.08)
        L = {"kind": "device", "device": device, "x": x, "y": y, "w": w, "at": at, "in": "rise", "loop": "float", "lines": [_s(t, 40) for t in (v.get("lines") or []) if _s(t, 40)][:5]}
        if v.get("src"):
            L["src"] = v["src"]
        return [L]
    if kind == "picture" and _s(v.get("draw"), 300):
        # drawn by the image model in the film's look (app/doodle.py draw_pictures); its icon if that fails
        return [{"kind": "image", "draw": _s(v.get("draw"), 300), "icon": v.get("icon") or "Sparkles", "x": x, "y": y, "w": (560 if wide else 640) if not big else (600 if wide else 800), "radius": 32, "at": at, "in": "scale", "loop": "float"}]
    if kind == "image" and v.get("src"):
        return [{"kind": "image", "src": v["src"], "x": x, "y": y, "w": 560 if wide else 640, "radius": 28, "at": at, "in": "scale", "loop": "float"}]
    if kind == "chart":
        vals = v.get("values") or []
        return [{"kind": "chart", "chart": v.get("chart") if v.get("chart") in ("line", "bars", "donut") else "bars", "values": vals, "x": x, "y": y, "w": 760 if wide else 860, "h": 380 if wide else 440, "at": at, "in": "fade"}]
    icon = v.get("icon") or "Sparkles"
    return [
        {"kind": "shape", "shape": "ring", "x": x, "y": y, "w": 520 if wide else 600, "stroke": 3, "color": "a", "opacity": 0.35, "at": at, "in": "scale", "loop": "pulse"},
        {"kind": "icon", "name": icon, "x": x, "y": y, "size": 300 if wide else 340, "tile": "a", "at": at + 0.1, "in": "pop", "loop": "float"},
    ]


def layout_layers(raw: dict, wide: bool) -> list[dict]:
    """A layout + its slots → placed layers. Positions are % of the frame
    (centres), sizes px of a 1080-px short side. Tall frames keep the top-left
    corner for the logo and the bottom 23 % for the subtitles; wide ones the
    bottom 18 %."""
    lay = raw.get("layout") if raw.get("layout") in LAYOUTS else "hero"
    kicker = _s(raw.get("kicker"), 40)
    title = _s(raw.get("title"), 120)
    sub = _s(raw.get("sub"), 120)
    icon = raw.get("icon")
    hit = raw.get("hit") is True
    out: list[dict] = []

    if lay == "hero":
        # one block — kicker, title, accent rule, sub — so the gaps follow the
        # title's real height; a soft glow of the accent behind it
        y = 54 if wide else 52 if icon else 44
        if icon:
            out.append({"kind": "icon", "name": icon, "x": 50, "y": 17 if wide else 21, "size": 150 if wide else 180, "tile": "a", "at": 0, "in": "pop", "loop": "float"})
        out.append({"kind": "shape", "shape": "circle", "x": 50, "y": y, "w": 820 if wide else 900, "color": "a", "opacity": 0.14, "blur": 110, "at": 0, "in": "fade", "loop": "pulse", "z": 0})
        L = _text(title, 50, y, _head(title, big=True), 0.15, maxw=78 if wide else 88, hit=hit, tin="blur" if hit else "rise")
        if kicker:
            L["kicker"] = kicker
        L["rule"] = True
        if sub:
            L["sub"] = sub
            L["subSize"] = 50 if wide else 52
        out.append(L)
    elif lay == "split":
        v = raw.get("visual") if isinstance(raw.get("visual"), dict) else {"kind": "icon", "icon": icon}
        # kicker, title and sub in one block (like hero): a title that wraps to
        # three lines pushes them apart instead of running into them
        if wide:
            L = _text(title, 30, 47, min(108, _head(title)), 0.3, maxw=40, align="left")
            if sub:
                L["sub"], L["subSize"] = sub, 46
            out += _visual(v, 71, 47, 0.5, wide)
        else:
            L = _text(title, 50, 26, _head(title), 0.3, maxw=88)
            if sub:
                L["sub"], L["subSize"] = sub, 48
            out += _visual(v, 50, 60 if v.get("kind") != "device" or v.get("device") != "phone" else 61, 0.5, wide)
        if kicker:
            L["kicker"] = kicker
        out.append(L)
    elif lay == "picture":
        v = raw.get("visual") if isinstance(raw.get("visual"), dict) else {}
        v = {"kind": "picture", "draw": v.get("draw") or raw.get("draw"), "icon": v.get("icon") or icon}
        if wide:
            out += _visual(v, 31, 48, 0.2, wide, big=True)
            if kicker:
                out.append(_pill(kicker, 60, 30, 0.4))
            out.append(_text(title, 72, 45, min(96, _head(title)), 0.5, maxw=40, align="left"))
            if sub:
                out.append(_text(sub, 72, 62, 46, 1.0, maxw=40, align="left", weight=500, tin="fade", color="sub"))
        else:
            out.append(_text(title, 50, 19, _head(title), 0.2, maxw=88))
            out += _visual(v, 50, 47, 0.4, wide, big=True)
            if sub:
                out.append(_text(sub, 50, 71, 46, 1.0, maxw=84, weight=500, tin="fade", color="sub"))
    elif lay == "cards":
        cards = [c for c in (raw.get("cards") or []) if isinstance(c, dict) and _s(c.get("title"), 40)][:3]
        out.append(_text(title, 50, 20 if wide else 21, min(92, _head(title)), 0.1, maxw=80 if wide else 88))
        for i, c in enumerate(cards):
            card = {"kind": "card", "title": _s(c.get("title"), 40), "lines": [_s(c.get("line"), 60)] if _s(c.get("line"), 60) else [], "icon": c.get("icon") or "Sparkles", "at": 0.5 + i * 0.35, "in": "rise", "size": 44 if wide else 48}
            if wide:
                xs = [32, 68] if len(cards) == 2 else [20, 50, 80]
                card.update(x=xs[i], y=54, w=560 if len(cards) == 2 else 520)
            else:
                ys = [40, 56] if len(cards) == 2 else [36, 50, 64]
                card.update(x=50, y=ys[i], w=880)
            out.append(card)
    elif lay == "metric":
        if kicker:
            out.append(_pill(kicker, 50, 28 if wide else 30, 0.1, caps=True))
        out.append({"kind": "shape", "shape": "ring", "x": 50, "y": 47 if wide else 45, "w": 560 if wide else 640, "stroke": 3, "color": "a", "opacity": 0.3, "at": 0.2, "in": "scale", "loop": "spin"})
        out.append({"kind": "metric", "value": raw.get("value"), "prefix": _s(raw.get("prefix"), 4), "suffix": _s(raw.get("suffix"), 6), "label": _s(raw.get("label"), 50), "x": 50, "y": 47 if wide else 45, "size": 190 if wide else 200, "at": 0.3, "in": "scale", **({"hit": True} if hit else {})})
        if sub or title:
            out.append(_text(sub or title, 50, 68 if wide else 62, 50, 1.0, maxw=70 if wide else 84, weight=600, tin="fade", color="sub"))
    elif lay == "list":
        items = [{"icon": x.get("icon") or "CircleCheck", "text": _s(x.get("text"), 50)} for x in (raw.get("items") or []) if isinstance(x, dict) and _s(x.get("text"), 50)][:5]
        if wide:
            out.append(_text(title, 28, 46, min(96, _head(title)), 0.1, maxw=38, align="left"))
            out.append({"kind": "list", "items": items, "x": 70, "y": 48, "w": 820, "size": 44, "at": 0.4, "in": "fade"})
        else:
            out.append(_text(title, 50, 22, _head(title), 0.1, maxw=88))
            out.append({"kind": "list", "items": items, "x": 50, "y": 50, "w": 900, "size": 46, "at": 0.4, "in": "fade"})
    elif lay == "quote":
        quote = _s(raw.get("quote") or title, 160)
        out.append(_text("“", 50, 26 if wide else 28, 200, 0, maxw=20, weight=800, tin="scale", color="a"))
        out.append(_text(quote, 50, 46 if wide else 44, 84 if _plain_len(quote) <= 50 else 70, 0.3, maxw=74 if wide else 86, weight=700))
        if _s(raw.get("author"), 50):
            out.append(_pill("— " + _s(raw.get("author"), 50), 50, 66 if wide else 60, 1.2))
    elif lay == "device":
        v = raw.get("visual") if isinstance(raw.get("visual"), dict) else {}
        v = {**v, "kind": "device"}
        alert = raw.get("alert") if isinstance(raw.get("alert"), dict) else {}
        if wide:
            out.append(_text(title, 28, 42, min(92, _head(title)), 0.1, maxw=38, align="left"))
            if sub:
                out.append(_text(sub, 28, 60, 44, 0.7, maxw=38, align="left", weight=500, tin="fade", color="sub"))
            out += _visual({**v, "device": v.get("device") or "laptop"}, 68, 47, 0.3, wide, big=True)
            ax, ay = 82, 20
        else:
            out.append(_text(title, 50, 21, _head(title), 0.1, maxw=88))
            out += _visual({**v, "device": v.get("device") or "phone"}, 50, 54, 0.3, wide)
            ax, ay = 62, 37
        if _s(alert.get("text"), 40):
            out.append({"kind": "alert", "text": _s(alert.get("text"), 40), "level": alert.get("level") if alert.get("level") in ("info", "warn", "danger", "ok") else "ok", "x": ax, "y": ay, "at": 1.4, "in": "slide-left", "size": 36, "z": 5})
    elif lay == "compare":
        sides = []
        for key in ("before", "after"):
            s = raw.get(key) if isinstance(raw.get(key), dict) else {}
            sides.append({"title": _s(s.get("title"), 40) or ("Before" if key == "before" else "After"), "lines": [_s(t, 60) for t in (s.get("lines") or []) if _s(t, 60)][:3], "icon": s.get("icon") or ("CircleX" if key == "before" else "CircleCheck")})
        out.append(_text(title, 50, 20 if wide else 21, min(92, _head(title)), 0.1, maxw=80 if wide else 88))
        for i, s in enumerate(sides):
            card = {"kind": "card", **s, "at": 0.5 + i * 0.9, "in": "slide-right" if i else "slide-left", "size": 46 if wide else 50}
            if i:
                card.update(border="a", iconBg="a")
            else:
                card.update(iconBg="sub")
            card.update({"x": 30 if i == 0 else 70, "y": 54, "w": 700} if wide else {"x": 50, "y": 40 if i == 0 else 62, "w": 880})
            out.append(card)
        out.append({"kind": "icon", "name": "ArrowRight" if wide else "ArrowDown", "x": 50, "y": 54 if wide else 51, "size": 90, "color": "a", "at": 1.1, "in": "pop"})
    elif lay == "chart":
        v = raw.get("visual") if isinstance(raw.get("visual"), dict) else {}
        chart = {"kind": "chart", "chart": v.get("chart") or raw.get("chart") or "bars", "values": v.get("values") or raw.get("values") or []}
        if wide:
            out.append(_text(title, 28, 42, min(92, _head(title)), 0.1, maxw=38, align="left"))
            if sub:
                out.append(_text(sub, 28, 60, 44, 0.7, maxw=38, align="left", weight=500, tin="fade", color="sub"))
            out += _visual(chart, 68, 50, 0.4, wide)
        else:
            out.append(_text(title, 50, 22, _head(title), 0.1, maxw=88))
            out += _visual(chart, 50, 48, 0.4, wide)
            if sub:
                out.append(_pill(sub[:40], 50, 64, 1.2))
    elif lay == "steps":
        steps = [s for s in (raw.get("steps") or []) if isinstance(s, dict) and _s(s.get("label"), 30)][:3]
        out.append(_text(title, 50, 22 if wide else 24, min(92, _head(title)), 0.1, maxw=80 if wide else 88))
        xs = [22, 50, 78] if len(steps) == 3 else [32, 68]
        y = 50 if wide else 46
        for i, s in enumerate(steps):
            out.append({"kind": "icon", "name": s.get("icon") or "CircleCheck", "x": xs[i], "y": y, "size": 170 if wide else 190, "tile": "a" if i == len(steps) - 1 else "b", "at": 0.4 + i * 0.5, "in": "pop"})
            out.append(_text(_s(s.get("label"), 30), xs[i], y + (16 if wide else 10), 44 if wide else 40, 0.6 + i * 0.5, maxw=26 if wide else 30, weight=700, tin="fade"))
            if i:
                out.append({"kind": "stream", "from": [xs[i - 1] + (6 if wide else 9), y], "to": [xs[i] - (6 if wide else 9), y], "count": 4, "color": "a", "at": 0.3 + i * 0.5, "in": "fade"})
    elif lay == "reveal":
        if kicker:
            out.append(_pill(kicker, 50, 36 if wide else 36, 0.2, caps=True))
        out.append({"kind": "shape", "shape": "ring", "x": 50, "y": 48 if wide else 45, "w": 760 if wide else 820, "stroke": 3, "color": "a", "opacity": 0.4, "at": 1.4, "in": "scale", "loop": "spin"})
        out.append({"kind": "shape", "shape": "ring", "x": 50, "y": 48 if wide else 45, "w": 560 if wide else 600, "stroke": 2, "color": "b", "opacity": 0.4, "at": 1.5, "in": "scale", "loop": "pulse"})
        out.append(_text(title, 50, 48 if wide else 45, _head(title, big=True) + 10, 1.6, maxw=80 if wide else 90, tin="zoom", hit=True))
        if sub:
            out.append(_text(sub, 50, 64 if wide else 57, 50, 2.3, maxw=70 if wide else 84, weight=500, tin="fade", color="sub"))
    else:  # end
        out.append({"kind": "logo", "x": 50, "y": 34 if wide else 34, "w": 440, "size": 96, "at": 0.1, "in": "scale"})
        if title:
            out.append(_text(title, 50, 52 if wide else 47, min(88, _head(title)), 0.5, maxw=74 if wide else 86))
        cta = _s(raw.get("cta"), 30)
        if cta:
            out.append(_pill(cta, 50, 68 if wide else 59, 1.1, fill="a", icon=raw.get("cta_icon") or "ArrowRight"))
    return [L for L in out if L.get("kind") != "text" or L.get("text")]


def _contrast(x: str, y: str) -> float:
    def lum(h):
        def ch(v):
            v /= 255
            return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

        r, g, b = (ch(int(h.lstrip("#")[i : i + 2], 16)) for i in (0, 2, 4))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    hi, lo = sorted((lum(x), lum(y)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _mix(hex_: str, to: str, amount: float) -> str:
    a, b = (tuple(int(h.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4)) for h in (hex_, to))
    return "#%02X%02X%02X" % tuple(round(x + (y - x) * amount) for x, y in zip(a, b))


def look(raw, brand_hex: str, brand_hex2: str | None = None, brand_default: bool = False) -> dict:
    """The film's look from a LOOKS name, or "brand": the brand's own colours —
    its main colour the accent, its second (else a lighter shade) the other,
    and the backgrounds a very dark / very light tint of the main one. A brand
    with its own colours (``brand_default``) gets "brand" unless the AI picked
    another look for the brief's mood. An "accent" hex is kept only when the
    brief named its colours."""
    t = raw if isinstance(raw, dict) else {}
    want = t.get("look") or ("brand" if brand_default else "midnight")
    name = want if want in LOOKS else ("brand" if want == "brand" else "midnight")
    base = dict(LOOKS["midnight" if name == "brand" else name])
    accent = str(t.get("accent") or "")
    if re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
        base["a"] = accent
    elif name == "brand":
        base["a"] = brand_hex
    if name == "brand":
        second = str(t.get("accent2") or brand_hex2 or "")
        base["b"] = second if re.fullmatch(r"#[0-9a-fA-F]{6}", second) else _mix(base["a"], "#FFFFFF", 0.45)
        base["dark"] = _mix(base["a"], "#06080D", 0.88)
        base["light"] = _mix(base["a"], "#FFFFFF", 0.94)
    # an accent that can't be read on one of the backgrounds (a navy brand on
    # near-black, a yellow one on white): every scene takes the other tone
    on_dark, on_light = _contrast(base["a"], base["dark"]), _contrast(base["a"], base["light"])
    tones = "light" if on_dark < 2.6 and on_light > on_dark else "dark" if on_light < 2.6 and on_dark > on_light else ""
    if name != "brand" and not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
        tones = ""  # the designed looks keep both tones, as they were made
    bgs = [b for b in (t.get("backgrounds") or []) if b in LOOK_BACKGROUNDS][:2] if isinstance(t.get("backgrounds"), list) else []
    # painted colour pictures (gpt-image) unless vector drawings as code (app/vector_art.py —
    # Claude, ~10-30x the cost) or Doodle notes' ink sketches were picked
    pictures = t.get("pictures") if t.get("pictures") in ("vector", "sketch") else "flat"
    out = {"name": name, "dark": base["dark"], "light": base["light"], "a": base["a"], "b": base["b"], "backgrounds": bgs or base["backgrounds"], "card": base["card"], "radius": base["radius"], "pictures": pictures, "cast": _s(t.get("cast"), 400)}
    if tones:
        out["tones"] = tones  # apply_theme: every scene in this tone
    return out
