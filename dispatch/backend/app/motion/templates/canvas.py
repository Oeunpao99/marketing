"""The canvas template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

import re
from app.canvas_layouts import LAYOUTS, LOOKS, LOOK_BACKGROUNDS, layout_layers

from app.motion.common import _icon, _line
from app.motion.templates._shared import _COMMON_RULES


CANVAS_TYPES = ("canvas",)


CANVAS_LAYERS = (
    "text",
    "card",
    "icon",
    "shape",
    "device",
    "logo",
    "image",
    "chart",
    "metric",
    "pill",
    "list",
    "alert",
    "stream",
)


CANVAS_BGS = (
    "solid",
    "gradient",
    "grid",
    "dots",
    "city",
    "streams",
    "particles",
    "rings",
    "spotlight",
    "aurora",
    "trails",
    "hex",
    "waves",
    "warp",
)


CANVAS_IN = (
    "fade",
    "rise",
    "drop",
    "scale",
    "pop",
    "slide-left",
    "slide-right",
    "blur",
    "zoom",
    "type",
)


CANVAS_LOOP = ("float", "pulse", "spin", "glow")


CANVAS_PROMPT = (
    "You are an award-winning motion designer and art director. You DESIGN a REMOTION VIDEO "
    "for this exact brief — an LED screen at a corporate event, a TikTok for a café, a SaaS "
    "launch… If the brief describes its own scenes, acts, colours or messages, FOLLOW THEM in "
    "order and keep their exact wording for titles and product names.\n"
    "\n"
    "HOW YOU DESIGN: you never place things yourself. Each scene picks ONE designed LAYOUT and "
    "fills its slots; the studio places everything so every frame is balanced. Vary the layouts "
    "through the film (never the same one twice in a row) and give it rhythm: a big hero, then "
    "detail, then a number, then the reveal.\n"
    "\n"
    'THE LOOK — return "theme": {"look": one of: '
    + "; ".join(f"{k} ({v['say']})" for k, v in LOOKS.items())
    + '; brand (the brand\'s own colour), "accent": "#RRGGBB" ONLY if the brief names its '
    'colours, "backgrounds": 1-2 of: ' + ", ".join(LOOK_BACKGROUNDS) + ', "pictures": flat (the '
    "default — painted colour illustrations in the look's colours) | vector (flat vector "
    "illustrations drawn as code with moving parts — ONLY when the brief asks for vector / flat "
    "drawings or animated illustrations) | sketch (hand-drawn ink sketches — ONLY when the brief asks for sketches / "
    'doodles / hand-drawn), "cast": when the pictures show people, ONE line describing each '
    "recurring person so every picture draws them the same — name, age, skin tone hex, hair, "
    'clothes colours (e.g. "Sophea: Cambodian girl ~17, skin #B8794F, black ponytail, pink '
    't-shirt #F472B6, jeans")}. Each scene picks '
    '"tone": dark | light (keep runs of the same tone — switch only at a change of act) and '
    '"bg": one of the theme\'s backgrounds.\n'
    "\n"
    "THE LAYOUTS and their slots:\n" + "\n".join(f"- {k}: {v}" for k, v in LAYOUTS.items()) + "\n"
    "SLOTS (fill only what the layout uses): kicker (1-4 words, a small label), title (max 10 "
    "words — wrap the key words in [brackets]), sub (max 14 words), icon (an icon name), visual "
    '({"kind": device, "device": phone | laptop | tablet, "src": "shot:N" or "product:<name>", '
    '"lines": up to 4 short rows shown on it} | {"kind": image, "src": "product:<name>" or '
    '"shot:N"} | {"kind": icon, "icon": …} | {"kind": chart, "chart": line | bars | donut, '
    '"values": 3-6 small SAMPLE numbers} | {"kind": picture, "draw": IN ENGLISH, 10-30 words — '
    'what the picture shows: the people, the place, the moment, e.g. "a young Cambodian woman '
    'smiling at her phone behind the counter of a small coffee shop", "icon": a fallback icon}), cards (2-3 x {icon, title (max 4 words), line (max 8 '
    "words)}), items (2-5 x {icon, text (2-6 words)}), value + prefix + suffix + label (metric — "
    "ONLY a true number), quote + author, steps (3 x {icon, label (max 3 words)}), before / after "
    "({title, lines: 1-3 short rows, icon}), alert ({text (max 6 words), level: info | warn | danger "
    "| ok}), cta (1-3 words — the end's button). PICTURES: at most 6 in the film, only where "
    "seeing the moment beats an icon (people, a place, a feeling); never draw the brand's product "
    "(use product:<name>) or a screen (use shot:N); never ask for words in a picture. hit: true on the scene's big reveal (2-3 a film); "
    "pause: 0.5-1.5 = a quiet near-black breath BEFORE the scene (the brief's \"pause before the "
    'reveal").\n'
    "\n"
    'Every scene: {"type": "canvas", "layout": …, "seconds": 3-8, "tone": …, "bg": …, '
    '"req": [asks it delivers], …its slots…, "say": the voice line}.\n'
    "\n"
    'FIRST, THE CHECKLIST — "asks": read the brief line by line and list EVERY thing it asks '
    'for, one small item each ("24/7 monitoring, threat detection" = two items): {"id": "R1", '
    '"kind": text | visual | motion | timing | style | brand | avoid, "need": one sentence you '
    'could check on the screen, "text": the EXACT on-screen words when the brief quotes them '
    "(same script, spelling, capitals and mixed English/Khmer — never translate or correct a name)}. "
    'Every scene says which asks it delivers ("req"); EVERY ask is delivered by at least one '
    "scene, and quoted text appears character for character in a slot. Use the brand's "
    "screenshots in devices when they help.\n"
    "THE STORY: 6-12 scenes, following the brief's own order; the voice tells it as one story. The "
    "last scene is the end layout (logo, tagline, call to action).\n"
    "\n"
    + _COMMON_RULES
    + '{"asks": [{"id": "R1", "kind": "text", "need": "...", "text": "..."}, ...], "theme": {"look": "midnight", '
    '"backgrounds": ["grid", "rings"]}, "scenes": [{"type": "canvas", "layout": "hero", "req": ["R1"], "seconds": 5, '
    '"tone": "dark", "bg": "grid", "kicker": "...", "title": "...", "sub": "...", "icon": "Sparkles", "say": "..."}, ...]}'
)


TYPE_SCALE = (40, 44, 56, 64, 72, 96, 120, 150)


def clean_theme(raw, brand_hex: str = "#3B82F6") -> dict:
    """AI design's one design system for the film (see CANVAS_PROMPT)."""
    t = raw if isinstance(raw, dict) else {}
    kinds = (
        [k for k in (t.get("backgrounds") or []) if k in CANVAS_BGS][:3]
        if isinstance(t.get("backgrounds"), list)
        else []
    )
    return {
        "dark": _hex(t.get("dark"), "#0B1020"),
        "light": _hex(t.get("light"), "#F5F7FB"),
        "a": _hex(t.get("a"), brand_hex),
        "b": _hex(t.get("b"), "#22D3EE"),
        "backgrounds": kinds or ["grid", "aurora"],
        "card": "solid" if t.get("card") == "solid" else "glass",
        # how the pictures are made (app/doodle.py draw_pictures) and who's in them
        # painted (gpt-image) unless vector drawings (Claude, ~10-30x the cost) or sketches were picked
        "pictures": t.get("pictures") if t.get("pictures") in ("vector", "sketch") else "flat",
        "cast": _line(t.get("cast"), 400),
        "radius": int(_num(t.get("radius"), 6, 28, 14)),
    }


def apply_theme(scene: dict, theme: dict) -> dict:
    """One AI-designed scene put into the film's design system: the theme's
    palette for its tone, one of the theme's backgrounds, the theme's cards,
    text on the type scale, the logo's corner left empty."""
    if scene.get("type") != "canvas" or not theme:
        return scene
    tone = theme.get("tones") or scene.get(
        "tone"
    )  # a look whose accent reads on one tone only keeps every scene there
    if tone not in ("dark", "light"):  # older designs: the tone their own palette had
        tone = (
            (scene.get("pal") or {}).get("mode")
            if (scene.get("pal") or {}).get("mode") in ("dark", "light")
            else "dark"
        )
    light = tone == "light"
    scene["tone"] = tone
    scene["pal"] = {
        "bg": theme["light"] if light else theme["dark"],
        "a": theme["a"],
        "b": theme["b"],
        "ink": "#0F172A" if light else "#FFFFFF",
        "sub": "rgba(15,23,42,0.66)" if light else "rgba(226,232,255,0.72)",
        "mode": tone,
    }
    bg = dict(scene.get("bg") or {})
    if bg.get("kind") not in theme["backgrounds"]:
        bg["kind"] = theme["backgrounds"][0]
    bg.pop("color", None)
    bg.pop("color2", None)  # the theme's colours, not a one-off
    scene["bg"] = bg
    for L in scene.get("layers") or []:
        if L["kind"] == "card":
            L["glass"] = theme["card"] == "glass"
            L["radius"] = theme["radius"]
            L.pop("fill", None)
        if L["kind"] in ("image", "device") and "radius" in L:
            L["radius"] = theme["radius"]
        if L["kind"] == "text":
            L["size"] = min(TYPE_SCALE, key=lambda v: abs(v - L.get("size", 64)))
        for k in (
            "color",
            "highlight",
            "iconBg",
            "tile",
            "gradient",
            "border",
        ):  # theme colours only
            if str(L.get(k) or "").startswith("#") and L[k].upper() not in (
                theme["a"].upper(),
                theme["b"].upper(),
            ):
                L[k] = "a"
        # the top-left corner is the logo chip's
        if L["kind"] not in ("shape", "stream") and L["x"] < 26 and L["y"] < 18:
            L["y"] = 22
    return scene


def _reqs(v) -> list[str]:
    """The asks a scene / layer delivers: ["R1", "R4"]."""
    return list(
        dict.fromkeys(
            str(x).strip().upper()
            for x in (v if isinstance(v, list) else [])
            if re.fullmatch(r"R\d{1,2}", str(x).strip(), re.I)
        )
    )[:8]


def _clean_asks(raw) -> list[dict]:
    """AI design's checklist: every ask in the brief, {"id", "kind", "need", "text"?}."""
    asks, seen = [], set()
    for a in raw if isinstance(raw, list) else []:
        if not isinstance(a, dict):
            continue
        aid = str(a.get("id") or "").strip().upper()
        need = _line(a.get("need"), 160)
        if not re.fullmatch(r"R\d{1,2}", aid) or aid in seen or not need:
            continue
        seen.add(aid)
        ask = {
            "id": aid,
            "kind": a.get("kind")
            if a.get("kind") in ("text", "visual", "motion", "timing", "style", "brand", "avoid")
            else "visual",
            "need": need,
        }
        if _line(a.get("text"), 120):
            ask["text"] = _line(a.get("text"), 120)
        asks.append(ask)
        if len(asks) >= 30:
            break
    return asks


def _plain(v) -> str:
    """Text as it reads on screen — no [highlight] marks, zero-width spaces or extra spaces, any case."""
    return (
        re.sub(r"\s+", " ", re.sub(r"[\[\]⟦⟧\u200b\u200c\u200d]", "", str(v or "")))
        .strip()
        .casefold()
    )


def _scene_words(sc: dict) -> str:
    """Every word a canvas scene shows, as one plain string."""
    out = []
    for L in sc.get("layers") or []:
        out += [L.get(k) for k in ("kicker", "text", "title", "label", "sub") if L.get(k)]
        out += list(L.get("lines") or [])
        out += [x.get("text") for x in L.get("items") or [] if isinstance(x, dict)]
    return _plain(" ".join(str(x) for x in out))


def asks_status(script: dict) -> list[dict]:
    """Each ask of the brief and whether the design delivers it: a quoted text
    must be on screen as written; any other ask needs a scene or layer
    tagged with it. [{"id", "need", "ok"}]"""
    scenes = script.get("scenes") or []
    tagged = {
        x
        for sc in scenes
        for x in [
            *(sc.get("req") or []),
            *(r for L in sc.get("layers") or [] for r in L.get("req") or []),
        ]
    }
    words = [_scene_words(sc) for sc in scenes]
    out = []
    for a in script.get("asks") or []:
        if a.get("text"):
            ok = any(_plain(a["text"]) in w for w in words)
        else:
            ok = a["id"] in tagged
        out.append({"id": a["id"], "need": a["need"], "ok": ok})
    return out


def _hex(v, fallback=None):
    v = str(v or "").strip()
    return v if re.fullmatch(r"#[0-9a-fA-F]{6}", v) else fallback


def _ccol(v):
    """A layer colour: a palette name or a hex — else None (the default)."""
    v = str(v or "").strip()
    return v if v in ("a", "b", "ink", "sub", "bg", "white", "black") else _hex(v)


def _src_ok(v) -> bool:
    """A picture a design may show: a brand-kit ref ("shot:N", "product:<name>")
    or one the server already put in (/media/…, a data: image) — never a web link."""
    v = str(v or "")
    return bool(re.fullmatch(r"(shot:\d{1,2}|product:.{1,60})", v)) or v.startswith(
        ("/media/", "data:image/")
    )


def _num(v, lo, hi, default=None):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


LAYOUT_ARROWS = (
    "ArrowRight",
    "ArrowDown",
)  # the layouts' own arrows (not in ICONS, which the AI picks from)


def _resolve_slots(layers: list[dict]) -> list[dict]:
    """A layout's icon names checked against the icon list (the slots come from the AI)."""
    for L in layers:
        for k in ("name", "icon"):
            if L.get(k) and L[k] not in LAYOUT_ARROWS:
                L[k] = _icon(L[k])
        for it in L.get("items") or []:
            it["icon"] = _icon(it.get("icon"), "CircleCheck")
    return layers


def _clean_canvas(raw: dict, say: str) -> dict | None:
    """An AI-designed scene, checked layer by layer: only kinds, colours and
    motions canvas.jsx draws, numbers clamped onto the frame, text trimmed —
    whatever doesn't pass is left out, so a design can't break the render."""
    design = raw.get("layout") if raw.get("layout") in LAYOUTS else None
    if design and not raw.get("layers"):  # a layout + its slots: placed here, not by the AI
        raw = {**raw, "layers": _resolve_slots(layout_layers(raw, bool(raw.get("_wide"))))}
        if isinstance(raw.get("bg"), str):
            raw["bg"] = {"kind": raw["bg"]}
    pal_raw = raw.get("pal") if isinstance(raw.get("pal"), dict) else {}
    bg = _hex(pal_raw.get("bg"), "#070B16")
    lum = sum(int(bg[i : i + 2], 16) for i in (1, 3, 5)) / 3
    mode = (
        pal_raw.get("mode")
        if pal_raw.get("mode") in ("dark", "light")
        else ("light" if lum > 150 else "dark")
    )
    ink = _hex(pal_raw.get("ink"), "#0F172A" if mode == "light" else "#FFFFFF")
    pal = {
        "bg": bg,
        "a": _hex(pal_raw.get("a"), "#3B82F6"),
        "b": _hex(pal_raw.get("b"), "#22D3EE"),
        "ink": ink,
        "sub": "rgba(15,23,42,0.66)" if mode == "light" else "rgba(226,232,255,0.72)",
        "mode": mode,
    }
    bg_raw = raw.get("bg") if isinstance(raw.get("bg"), dict) else {}
    back = {"kind": bg_raw.get("kind") if bg_raw.get("kind") in CANVAS_BGS else "solid"}
    for k in ("color", "color2", "accent"):
        if _ccol(bg_raw.get(k)):
            back[k] = _ccol(bg_raw.get(k))
    if _num(bg_raw.get("angle"), 0, 360) is not None:
        back["angle"] = _num(bg_raw.get("angle"), 0, 360)

    layers = []
    for L in (raw.get("layers") or [])[:9]:
        if not isinstance(L, dict) or L.get("kind") not in CANVAS_LAYERS:
            continue
        kind = L["kind"]
        out = {
            "kind": kind,
            "x": _num(L.get("x"), 6, 94, 50),
            "y": _num(L.get("y"), 8, 88, 50),
            "at": _num(L.get("at"), 0, 6, 0),
            "in": L.get("in") if L.get("in") in CANVAS_IN else "fade",
        }
        if L.get("loop") in CANVAS_LOOP:
            out["loop"] = L["loop"]
        if _reqs(L.get("req")):
            out["req"] = _reqs(L.get("req"))
        if L.get("hit") is True and sum(1 for x in layers if x.get("hit")) < 2:
            out["hit"] = True
        for k, lo, hi in (
            ("z", 0, 9),
            ("rotate", -30, 30),
            ("w", 20, 1700),
            ("h", 20, 1000),
            ("radius", 0, 200),
            ("opacity", 0.05, 1),
            ("blur", 0, 120),
            ("stroke", 0, 30),
            ("maxw", 20, 95),
        ):
            if _num(L.get(k), lo, hi) is not None:
                out[k] = _num(L.get(k), lo, hi)
        for k in ("color", "fill", "tile", "iconBg", "highlight", "gradient", "border"):
            if _ccol(L.get(k)):
                out[k] = _ccol(L[k])
        if kind == "text":
            text = _line(L.get("text"), 120)
            if not text:
                continue
            out.update(
                text=text,
                size=_num(L.get("size"), 40, 180, 64),
                weight=int(_num(L.get("weight"), 300, 800, 700)),
            )
            if L.get("align") in ("left", "center", "right"):
                out["align"] = L["align"]
            if L.get("mono"):
                out["mono"] = True
            # a headline block (the hero layout): its kicker, accent rule and sub
            if _line(L.get("kicker"), 40):
                out["kicker"] = _line(L["kicker"], 40)
            if _line(L.get("sub"), 120):
                out.update(sub=_line(L["sub"], 120), subSize=_num(L.get("subSize"), 36, 64, 50))
            if L.get("rule") is True:
                out["rule"] = True
        elif kind == "card":
            out.update(
                title=_line(L.get("title"), 50),
                lines=[_line(x, 60) for x in (L.get("lines") or []) if _line(x, 60)][:5],
            )
            if L.get("icon"):
                out["icon"] = _icon(L.get("icon"))
            if L.get("glass") is False:
                out["glass"] = False
            if _num(L.get("size"), 28, 64) is not None:
                out["size"] = _num(L.get("size"), 28, 64)
        elif kind == "icon":
            name = L.get("name") or L.get("icon")
            out.update(
                name=name if name in LAYOUT_ARROWS else _icon(name),
                size=_num(L.get("size"), 60, 260, 120),
            )
        elif kind == "shape":
            out["shape"] = (
                L.get("shape") if L.get("shape") in ("circle", "rect", "ring", "line") else "circle"
            )
        elif kind == "device":
            out["device"] = (
                L.get("device")
                if L.get("device") in ("phone", "tablet", "laptop", "monitor", "screen")
                else "laptop"
            )
            out["lines"] = [_line(x, 40) for x in (L.get("lines") or []) if _line(x, 40)][:6]
            if _src_ok(L.get("src")):
                out["src"] = L["src"]
        elif kind in ("logo", "image"):
            if kind == "image":
                if L.get("sketch") is True:
                    out["sketch"] = True
                if _line(L.get("draw"), 300) and not L.get("src"):
                    # a picture still to be drawn (app/doodle.py draw_pictures) — its icon if that fails
                    out["draw"], out["icon"] = (
                        _line(L["draw"], 300),
                        _icon(L.get("icon"), "Sparkles"),
                    )
                elif not _src_ok(L.get("src")):
                    continue
                else:
                    out["src"] = L["src"]
            if _num(L.get("size"), 30, 200) is not None:
                out["size"] = _num(L.get("size"), 30, 200)
        elif kind == "chart":
            vals = [_num(v, -1e9, 1e9) for v in (L.get("values") or [])]
            out.update(
                chart=L.get("chart") if L.get("chart") in ("line", "bars", "donut") else "line",
                values=[v for v in vals if v is not None][:8],
            )
            if len(out["values"]) < 1:
                continue
        elif kind == "metric":
            if _num(L.get("value"), -1e12, 1e12) is None:
                continue
            out.update(
                value=_num(L.get("value"), -1e12, 1e12),
                prefix=_line(L.get("prefix"), 4),
                suffix=_line(L.get("suffix"), 6),
                label=_line(L.get("label"), 50),
                size=_num(L.get("size"), 90, 200, 150),
            )
            # the layout's ring round it (canvas.jsx draws the animated gauge on it) and the room inside
            for k, lo, hi in (("ring", 200, 1000), ("fit", 200, 800)):
                if _num(L.get(k), lo, hi) is not None:
                    out[k] = _num(L.get(k), lo, hi)
        elif kind == "pill":
            text = _line(L.get("text"), 40)
            if not text:
                continue
            out.update(text=text, size=_num(L.get("size"), 24, 44, 32))
            if L.get("icon"):
                out["icon"] = _icon(L.get("icon"))
            if L.get("caps"):
                out["caps"] = True
        elif kind == "list":
            items = [
                {"icon": _icon(x.get("icon"), "Check"), "text": _line(x.get("text"), 50)}
                for x in (L.get("items") or [])
                if isinstance(x, dict) and _line(x.get("text"), 50)
            ][:5]
            if not items:
                continue
            out.update(items=items, size=_num(L.get("size"), 32, 60, 44))
        elif kind == "alert":
            text = _line(L.get("text"), 50)
            if not text:
                continue
            out.update(
                text=text,
                level=L.get("level")
                if L.get("level") in ("info", "warn", "danger", "ok")
                else "info",
                size=_num(L.get("size"), 26, 44, 34),
            )
            if L.get("icon"):
                out["icon"] = _icon(L.get("icon"))
        elif kind == "stream":
            pts = [L.get("from"), L.get("to")]
            if not all(isinstance(q, (list, tuple)) and len(q) == 2 for q in pts):
                continue
            out["from"] = [_num(pts[0][0], 0, 100, 10), _num(pts[0][1], 0, 100, 50)]
            out["to"] = [_num(pts[1][0], 0, 100, 50), _num(pts[1][1], 0, 100, 50)]
            out["count"] = int(_num(L.get("count"), 2, 10, 6))
        layers.append(out)
    if not layers:
        return None
    scene = {
        "type": "canvas",
        "seconds": _num(raw.get("seconds"), 2.5, 9, 5),
        "pal": pal,
        "bg": back,
        "layers": layers,
        "say": say,
    }
    if design or raw.get("design") in LAYOUTS:
        scene["design"] = (
            design or raw["design"]
        )  # placed by a layout: the design check leaves it alone
    if raw.get("tone") in ("dark", "light"):
        scene["tone"] = raw["tone"]
    if _reqs(raw.get("req")):
        scene["req"] = _reqs(raw.get("req"))
    if _num(raw.get("pause"), 0.3, 1.5) is not None and float(raw.get("pause") or 0) > 0:
        scene["pause"] = _num(raw.get("pause"), 0.3, 1.5)  # the breath before a reveal
    return scene
