"""One scene from the AI, checked and trimmed (_clean_scene / _clean_one), and the text fields the Khmer editor polishes.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import re

from app.video.motion.common import ICONS, _icon, _line, _number, log
from app.video.motion.templates.teach import MOODS
from app.video.motion.templates.techflow import TECH_DEVICES
from app.video.motion.templates.neural_paper import MEME_FACES
from app.video.motion.templates.picture import PICTURE_SAY_MAX
from app.video.motion.templates.cartoon import CARTOON_MOODS, CAST_COLORS, CAST_LOOKS
from app.video.motion.templates.reaction import REACTION_ANIMALS, REACTION_MOODS
from app.video.motion.templates.podcast import PODCAST_MOODS, PODCAST_POSES
from app.video.motion.templates.lifestory import LIFE_MOODS, LIFE_POSES, MAX_LIFE_PLACES, _amount, clean_prop
from app.video.motion.templates.presenter import PRESENTER_GESTURES
from app.video.motion.templates.lesson import BOARD_KINDS, SUM_OPS
from app.video.motion.templates.parable import PARABLE_ITEMS, PARABLE_PLACES, PARABLE_POSES, PARABLE_TIMES, _duo_act, _tale_fields
from app.video.motion.templates.illustrated import ILL_ITEMS, ILL_OBJECTS, ILL_PLACES, ILL_POSES, ILL_TIMES
from app.video.motion.templates.deck import _deck_scene
from app.video.motion.templates.aiteam import _aiteam_scene
from app.video.motion.templates.saashub import _saashub_scene
from app.video.motion.templates.street3d import STREET_PROPS
from app.video.motion.templates.canvas import _clean_canvas
from app.video.motion.screens import _box


def _apps(value) -> list[dict]:
    """Showcase's app bubbles: [{"name"}] — the template draws each known app's icon."""
    return [
        {"name": _line(a.get("name"), 24)}
        for a in (value or [])
        if isinstance(a, dict) and _line(a.get("name"), 24)
    ][:8]


def _cast_names(script: dict) -> list[str]:
    """The people's names in a story (Story · Characters, Parable, Life story) — the Khmer editors keep them."""
    hero = script.get("hero") if isinstance(script.get("hero"), dict) else {}
    return [
        c["name"] for c in (script.get("cast") or []) if isinstance(c, dict) and c.get("name")
    ] + ([hero["name"]] if hero.get("name") else [])


def _who(value) -> int:
    """Story · Characters: which of the two speaks (1 or 2)."""
    return 2 if str(value).strip() == "2" else 1


def clean_cast(raw) -> list[dict]:
    """Story · Characters: the two people — a name, a look, a colour each."""
    people = [p for p in (raw if isinstance(raw, list) else []) if isinstance(p, dict)][:2]
    while len(people) < 2:
        people.append({})
    out = []
    for n, p in enumerate(people):
        look = p.get("look") if p.get("look") in CAST_LOOKS else ("apron", "cap")[n]
        color = p.get("color") if p.get("color") in CAST_COLORS else ("teal", "green")[n]
        if out and look == out[0]["look"]:
            look = "cap" if look != "cap" else "apron"
        if out and color == out[0]["color"]:
            color = "green" if color != "green" else "blue"
        out.append({"name": _line(p.get("name"), 30), "look": look, "color": color})
    return out


def clean_animals(raw) -> list[str]:
    """Reaction meme: the 1-2 animals in front (REACTION_ANIMALS names)."""
    out = [a for a in (raw if isinstance(raw, list) else []) if a in REACTION_ANIMALS]
    out = list(dict.fromkeys(out))[:2]
    return out or ["black-kitten", "cream-cat"]


def _react_fields(raw: dict, one: bool = False) -> dict:
    """Reaction meme: who reacts (0-based cast indices), how, what they say,
    and the picture behind (a screenshot, a product, or a photo to draw)."""
    who = raw.get("who") if isinstance(raw.get("who"), list) else [raw.get("who")]
    idx = list(
        dict.fromkeys(
            1 if str(w).strip() == "2" else 0 for w in who if str(w).strip() in ("1", "2")
        )
    ) or [0]
    idx = idx[:1] if one else idx[:2]
    moods = [
        m if m in REACTION_MOODS else ("shock" if one else "pop")
        for m in (raw.get("moods") if isinstance(raw.get("moods"), list) else [])
    ][: len(idx)]
    while len(moods) < len(idx):
        moods.append("shock" if one or moods else "pop")
    out = {"who": idx, "moods": moods}
    if one:
        return out
    if _line(raw.get("bubble"), 30):
        out["bubble"] = _line(raw["bubble"], 30)
    try:
        shot = int(raw.get("shot") or 0)
    except (TypeError, ValueError):
        shot = 0
    if shot > 0:
        out["shot"] = shot
    elif _line(raw.get("product"), 80):
        out["product"] = _line(raw["product"], 80)
    elif _line(raw.get("draw"), 300):
        out["draw"] = _line(raw["draw"], 300)
    if "shot" in out and _line(raw.get("circle"), 80):
        out["circle"] = _line(raw["circle"], 80)  # found on the screenshot by locate_targets → mark
    mark = raw.get("mark") if isinstance(raw.get("mark"), dict) else None
    if mark and "shot" in out:  # a reviewed storyboard keeps the circle it found
        try:
            out["mark"] = {
                k: max(lo, min(hi, float(mark.get(k))))
                for k, lo, hi in (("x", 3, 97), ("y", 3, 97), ("w", 6, 95), ("h", 4, 60))
            }
        except (TypeError, ValueError):
            pass
    return out


def _clean_scene(raw: dict, names: dict[str, str]) -> dict | None:
    """One scene from the AI, checked and trimmed — None when it's unusable.
    A scene whose fields have the wrong shape (a number where a list goes…)
    is left out, never fails the whole storyboard."""
    try:
        scene = _clean_one(raw, names)
        if scene and str(raw.get("speaker")).strip() in (
            "1",
            "2",
        ):  # Dialogue · Two voices: whose voice
            scene["speaker"] = int(str(raw["speaker"]).strip())
        if (
            scene and scene["type"] in ("hook", "cta") and raw.get("place") in ILL_PLACES
        ):  # Illustrated: where it is
            scene["place"] = raw["place"]
            if raw.get("time") in ILL_TIMES:
                scene["time"] = raw["time"]
        if scene and (
            raw.get("hero") in STREET_PROPS or raw.get("hero") == "product"
        ):  # 3D · Street: the thing in front
            scene["hero"] = raw["hero"]
            if raw["hero"] == "product":
                product = names.get(_line(raw.get("product"), 120).lower(), "")
                if product:
                    scene["product"] = product
        return scene
    except (TypeError, ValueError, AttributeError, KeyError, IndexError) as exc:
        log.warning(
            "storyboard: a %s scene left out — malformed (%s)", str(raw.get("type"))[:20], exc
        )
        return None


def _clean_one(raw: dict, names: dict[str, str]) -> dict | None:
    kind = raw.get("type")
    say = _line(raw.get("say"), 300)
    if kind == "shot":  # Picture story: one AI picture under a (long) part of the narration
        scene = {
            "type": kind,
            "title": _line(raw.get("title"), 60),
            "draw": _line(raw.get("draw"), 400),
            "say": _line(raw.get("say"), PICTURE_SAY_MAX),
        }
        if _line(raw.get("image"), 10).startswith(
            "data:"
        ):  # a reviewed storyboard's picture already painted
            scene["image"] = str(raw["image"])
        return scene if scene["draw"] and (scene["say"] or scene["title"]) else None
    if kind == "draw":  # Logo · Drawing: the name and a tagline — never a voice line
        return {
            "type": kind,
            "name": _line(raw.get("name"), 60),
            "tagline": _line(raw.get("tagline"), 60),
            "say": "",
        }
    if kind == "hook":
        text = _line(raw.get("text"), 160)
        hook = {"type": kind, "text": text, "icon": _icon(raw.get("icon"), "Zap"), "say": say}
        if _line(raw.get("sub"), 100):
            hook["sub"] = _line(raw.get("sub"), 100)
        if _line(raw.get("badge"), 40):
            hook["badge"] = _line(raw.get("badge"), 40)
        apps = _apps(raw.get("apps"))
        if apps:
            hook["apps"] = apps  # Showcase: the bubbles floating round the line
        if raw.get("device") in TECH_DEVICES:
            hook["device"] = raw["device"]  # Tech explainer: the device in the viewer's hand
        if _line(raw.get("draw"), 300):
            hook["draw"] = _line(
                raw.get("draw"), 300
            )  # Doodle notes: the sketch under the line (app/images/doodle.py)
        if raw.get("mood") in CARTOON_MOODS:  # Story · Characters: who wonders, and how
            hook["who"], hook["mood"] = _who(raw.get("who")), raw["mood"]
        if isinstance(raw.get("moods"), list):  # Reaction meme: the first meme moment
            hook.update(_react_fields(raw))
        if _line(raw.get("word"), 14):  # Collage · Studio: the big thin word over the main photo
            hook["word"] = _line(raw["word"], 14)
        return hook if text else None
    if kind == "react":
        text = _line(raw.get("text"), 120)
        return (
            {
                "type": kind,
                "text": text,
                "icon": _icon(raw.get("icon"), "Smartphone"),
                **_react_fields(raw),
                "say": say,
            }
            if text
            else None
        )
    if kind == "collage":
        given = (
            raw.get("tiles")
            if isinstance(raw.get("tiles"), list)
            else raw.get("items")
            if isinstance(raw.get("items"), list)
            else []
        )
        tiles = [
            {"icon": _icon(x.get("icon"), "Sparkles"), "label": _line(x.get("label"), 30)}
            for x in given
            if isinstance(x, dict) and _line(x.get("label"), 30)
        ][:5]
        word = _line(raw.get("word"), 14)
        return {"type": kind, "word": word, "tiles": tiles, "say": say} if word or tiles else None
    if kind == "statement":
        text = _line(raw.get("text"), 120)
        return (
            {"type": kind, "text": text, "sub": _line(raw.get("sub"), 60), "say": say}
            if text
            else None
        )
    if kind == "onair":  # Podcast: at the studio desk
        text = _line(raw.get("text"), 120)
        return (
            {
                "type": kind,
                "text": text,
                "icon": _icon(raw.get("icon"), "MessageCircle"),
                "gesture": "shrug" if raw.get("gesture") == "shrug" else "talk",
                "mood": raw.get("mood") if raw.get("mood") in PODCAST_MOODS else "happy",
                "say": say,
            }
            if text
            else None
        )
    if kind == "visit":  # Podcast: out in a place the story goes
        scene = {
            "type": kind,
            "place": 2 if str(raw.get("place")).strip() == "2" else 1,
            "pose": raw.get("pose") if raw.get("pose") in PODCAST_POSES else "stand",
            "mood": raw.get("mood") if raw.get("mood") in PODCAST_MOODS else "happy",
            "text": _line(raw.get("text"), 100),
            "say": say,
        }
        if raw.get("icon"):
            scene["icon"] = _icon(raw.get("icon"), "Lightbulb")
        return scene if scene["text"] or say else None
    if kind == "acronym":  # Cybersecurity: a term, letter by letter, and what it means
        term = re.sub(r"[^A-Za-z0-9]", "", str(raw.get("term") or ""))[:6].upper()
        expand = [
            _line(x, 24) for x in (raw.get("expand") if isinstance(raw.get("expand"), list) else [])
        ][: len(term)]
        return (
            {
                "type": kind,
                "term": term,
                "expand": expand,
                "text": _line(raw.get("text"), 140),
                "say": say,
            }
            if len(term) >= 2
            else None
        )
    if kind == "guard":  # Cybersecurity: watched 24/7
        return {"type": kind, "title": _line(raw.get("title"), 60), "say": say}
    if kind == "sectors":  # Cybersecurity: who it's for
        given = [
            x
            for x in (raw.get("sectors") if isinstance(raw.get("sectors"), list) else [])
            if isinstance(x, dict)
        ]
        sectors = [
            {"icon": _icon(x.get("icon"), "Building2"), "label": _line(x.get("label"), 30)}
            for x in given
            if _line(x.get("label"), 30)
        ][:6]
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "sectors": sectors, "say": say}
            if len(sectors) >= 2
            else None
        )
    if kind == "breach":  # Cybersecurity: the attack nobody saw (a worker asleep, the screen taken)
        scene = {
            "type": kind,
            "title": _line(raw.get("title"), 70),
            "text": _line(raw.get("text"), 120),
            "say": say,
        }
        when = re.search(r"\b([01]?\d|2[0-3]):[0-5]\d\b", str(raw.get("time") or ""))
        if when:
            scene["time"] = when.group(0)
        return scene
    if kind == "ransom":  # Cybersecurity: files locked, what's lost
        given = [
            x
            for x in (raw.get("losses") if isinstance(raw.get("losses"), list) else [])
            if isinstance(x, dict)
        ]
        losses = [
            {"icon": _icon(x.get("icon"), "TriangleAlert"), "label": _line(x.get("label"), 40)}
            for x in given
            if _line(x.get("label"), 40)
        ][:4]
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "losses": losses, "say": say}
            if losses or raw.get("title")
            else None
        )
    if kind == "moment":  # Life story: the person in a place, maybe holding the thing that shows it
        scene = {
            "type": kind,
            "place": int(min(MAX_LIFE_PLACES, max(1, _number(raw.get("place")) or 1))),
            "pose": raw.get("pose") if raw.get("pose") in LIFE_POSES else "stand",
            "mood": raw.get("mood") if raw.get("mood") in LIFE_MOODS else "happy",
            "text": _line(raw.get("text"), 90),
            "say": say,
        }
        prop = clean_prop(raw.get("prop"))
        if prop:
            scene["prop"] = prop
        return scene if scene["text"] or say or prop else None
    if kind == "ledger":  # Life story: money in and out, written down
        lines = [
            x
            for x in (raw.get("lines") if isinstance(raw.get("lines"), list) else [])
            if isinstance(x, dict)
        ]
        lines = [
            {"label": _line(x.get("label"), 30), "amount": _amount(x.get("amount"))}
            for x in lines
            if _line(x.get("label"), 30)
        ][:5]
        scene = {"type": kind, "title": _line(raw.get("title"), 50), "lines": lines, "say": say}
        total = raw.get("total") if isinstance(raw.get("total"), dict) else {}
        if _line(total.get("label"), 30) and _amount(total.get("amount")):
            scene["total"] = {
                "label": _line(total.get("label"), 30),
                "amount": _amount(total.get("amount")),
            }
        return scene if len(lines) >= 2 else None
    if kind == "takeaway":  # Life story: the lesson, 1-3 lines
        checks = [
            c
            for c in (
                _line(x, 70)
                for x in (raw.get("checks") if isinstance(raw.get("checks"), list) else [])
            )
            if c
        ][:3]
        scene = {"type": kind, "title": _line(raw.get("title"), 40), "checks": checks, "say": say}
        return scene if checks or scene["title"] else None
    if kind == "speak":  # Presenter · Brand host: one idea on the panel beside her
        text = _line(raw.get("text"), 120)
        scene = {
            "type": kind,
            "text": text,
            "icon": _icon(raw.get("icon"), "Lightbulb"),
            "gesture": raw.get("gesture")
            if raw.get("gesture") in PRESENTER_GESTURES
            else "present",
            "say": say,
        }
        product = names.get(_line(raw.get("product"), 120).lower(), "")
        if product:
            scene["product"] = product
        if _line(raw.get("draw"), 300):
            scene["draw"] = _line(
                raw["draw"], 300
            )  # the picture over the words (app/images/doodle.py HOST_PICTURE_STYLE)
        return scene if text else None
    if kind == "pedestal":
        title = _line(raw.get("title"), 40)
        return (
            {
                "type": kind,
                "title": title,
                "left": _line(raw.get("left"), 50),
                "right": _line(raw.get("right"), 50),
                "icon": _icon(raw.get("icon"), "Sparkles"),
                "say": say,
            }
            if title
            else None
        )
    if kind == "punch":
        text = _line(raw.get("text"), 120)
        return (
            {"type": kind, "text": text, **_react_fields(raw, one=True), "say": say}
            if text
            else None
        )
    if kind == "talk":
        text = _line(raw.get("text"), 120)
        scene = {
            "type": kind,
            "who": _who(raw.get("who")),
            "mood": raw.get("mood") if raw.get("mood") in CARTOON_MOODS else "happy",
            "text": text,
            "say": say,
        }
        if raw.get("think") is True:
            scene["think"] = True
        if raw.get("icon") and (scene.get("think") or not text):
            scene["icon"] = _icon(raw.get("icon"), "Lightbulb")
        item = raw.get("item") if isinstance(raw.get("item"), dict) else None
        if item and (item.get("icon") or item.get("label")):
            scene["item"] = {
                "icon": _icon(item.get("icon"), "Package"),
                "label": _line(item.get("label"), 24),
            }
        return scene if text or scene.get("icon") else None
    if kind == "climb":
        title = _line(raw.get("title"), 70)
        return (
            {
                "type": kind,
                "title": title,
                "text": _line(raw.get("text"), 120),
                "word": _line(raw.get("word"), 24),
                "say": say,
            }
            if title
            else None
        )
    if kind == "mirror":
        before, after = _line(raw.get("before"), 60), _line(raw.get("after"), 60)
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 60),
                "before": before,
                "after": after,
                "say": say,
            }
            if before and after
            else None
        )
    if kind == "grow":
        title = _line(raw.get("title"), 60)
        return (
            {"type": kind, "title": title, "text": _line(raw.get("text"), 120), "say": say}
            if title
            else None
        )
    if kind == "summit":
        text = _line(raw.get("text"), 140)
        return (
            {"type": kind, "text": text, "author": _line(raw.get("author"), 40), "say": say}
            if text
            else None
        )
    if kind == "whiteboard":
        board_kind = raw.get("kind") if raw.get("kind") in BOARD_KINDS else "list"
        parts = []
        for x in (raw.get("parts") if isinstance(raw.get("parts"), list) else [])[:4]:
            if not isinstance(x, dict) or not _line(x.get("label"), 30):
                continue
            part = {
                "icon": _icon(x.get("icon"), "Sparkles"),
                "label": _line(x.get("label"), 30),
                "value": _line(x.get("value"), 12),
            }
            if board_kind == "sum" and x.get("op") in SUM_OPS:
                part["op"] = x["op"]
            parts.append(part)
        if board_kind == "bars" and any(_number(p["value"]) <= 0 for p in parts):
            board_kind = "list"  # bars need a number each — else it's a list
        if board_kind == "sum" and len(parts) < 3:
            board_kind = "flow"
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 70),
                "kind": board_kind,
                "parts": parts,
                "say": say,
            }
            if len(parts) >= 2
            else None
        )
    if kind == "example":
        people = []
        for x in (raw.get("people") if isinstance(raw.get("people"), list) else [])[:3]:
            if not isinstance(x, dict) or not _line(x.get("text"), 50):
                continue
            people.append(
                {
                    "name": _line(x.get("name"), 20),
                    "look": x.get("look")
                    if x.get("look") in CAST_LOOKS
                    else CAST_LOOKS[len(people) % len(CAST_LOOKS)],
                    "color": x.get("color")
                    if x.get("color") in CAST_COLORS
                    else ("teal", "orange", "purple")[len(people)],
                    "mood": x.get("mood") if x.get("mood") in CARTOON_MOODS else "happy",
                    "icon": _icon(x.get("icon"), "User"),
                    "text": _line(x.get("text"), 50),
                    "value": _line(x.get("value"), 12),
                    "tone": "bad" if x.get("tone") == "bad" else "good",
                }
            )
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "people": people, "say": say}
            if len(people) >= 2
            else None
        )
    if kind in (
        "agenda",
        "keypoints",
        "bignum",
        "barchart",
        "twocol",
        "pullquote",
        "picture",
        "roadmap",
    ):  # Slides
        return _deck_scene(kind, raw, say)
    if kind in (
        "overload",
        "crew",
        "pipeline",
        "approve",
        "gains",
        "plans",
    ):  # AI service · Your AI team
        return _aiteam_scene(kind, raw, say)
    if kind in ("chaos", "hub", "trigger") or (
        kind == "metrics" and "stats" in raw
    ):  # SaaS Hub · Connect & Automate
        return _saashub_scene(kind, raw, say)
    if kind == "wide":  # Illustrated: a wide shot of a place, the main person in it
        try:
            crowd = max(0, min(6, int(raw.get("crowd"))))
        except (TypeError, ValueError):
            crowd = 3
        return {
            "type": kind,
            "title": _line(raw.get("title"), 50),
            "place": raw.get("place") if raw.get("place") in ILL_PLACES else "market",
            "time": raw.get("time") if raw.get("time") in ILL_TIMES else "day",
            "pose": raw.get("pose") if raw.get("pose") in ILL_POSES else "stand",
            "item": raw.get("item") if raw.get("item") in ILL_ITEMS else "none",
            "crowd": crowd,
            "say": say,
        }
    if kind == "closeup":  # Illustrated: their face beside the thing that matters
        if raw.get("object") not in ILL_OBJECTS:
            return None
        return {
            "type": kind,
            "object": raw["object"],
            "text": _line(raw.get("text"), 60),
            "place": raw.get("place") if raw.get("place") in ILL_PLACES else "street",
            "say": say,
        }
    if kind == "fact":  # Illustrated: a fact on a paper card (a number counting, when there is one)
        text = _line(raw.get("text"), 140)
        if not text:
            return None
        scene = {
            "type": kind,
            "title": _line(raw.get("title"), 40),
            "text": text,
            "icon": _icon(raw.get("icon"), "Lightbulb"),
            "place": raw.get("place") if raw.get("place") in ILL_PLACES else "market",
            "say": say,
        }
        value = _number(raw.get("value")) if raw.get("value") not in (None, "") else 0.0
        if value > 0:
            scene.update(
                {
                    "value": int(value) if value == int(value) else round(value, 1),
                    "prefix": _line(raw.get("prefix"), 3),
                    "suffix": _line(raw.get("suffix"), 10),
                }
            )
        return scene
    if kind == "shops":  # 3D · Street: the rival shop and the brand's
        sides = []
        for i, x in enumerate((raw.get("sides") if isinstance(raw.get("sides"), list) else [])[:2]):
            if isinstance(x, dict) and _line(x.get("label"), 40):
                sides.append(
                    {
                        "label": _line(x.get("label"), 40),
                        "tone": x.get("tone")
                        if x.get("tone") in ("good", "bad")
                        else ("bad", "good")[i],
                    }
                )
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "sides": sides, "say": say}
            if len(sides) == 2
            else None
        )
    if kind == "crowd":  # 3D · Street: people walk in, the board counts (when there's a number)
        scene = {"type": kind, "title": _line(raw.get("title"), 60), "say": say}
        value = _number(raw.get("value")) if raw.get("value") not in (None, "") else 0.0
        if value > 0 and _line(raw.get("label"), 40):
            start = _number(raw.get("start")) if raw.get("start") not in (None, "") else 0.0
            scene.update(
                {
                    "label": _line(raw.get("label"), 40),
                    "value": int(value) if value == int(value) else round(value, 1),
                    "prefix": _line(raw.get("prefix"), 3),
                    "suffix": _line(raw.get("suffix"), 10),
                }
            )
            if 0 < start < value:
                scene["start"] = int(start) if start == int(start) else round(start, 1)
        return scene if scene["title"] or say else None
    if kind == "chatter":  # 3D · Street: customers' messages floating up
        given = raw.get("messages") if isinstance(raw.get("messages"), list) else []
        messages = [
            {"text": _line(m.get("text"), 60)}
            for m in given
            if isinstance(m, dict) and _line(m.get("text"), 60)
        ][:3]
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "messages": messages, "say": say}
            if messages
            else None
        )
    if kind == "line":  # Dialogue · Two voices: one person speaks
        text = _line(raw.get("text"), 120)
        scene = {
            "type": kind,
            "text": text,
            "mood": raw.get("mood") if raw.get("mood") in CARTOON_MOODS else "happy",
            "pose": raw.get("pose")
            if raw.get("pose") in PARABLE_POSES and raw.get("pose") != "walk"
            else "stand",
            "item": raw.get("item") if raw.get("item") in PARABLE_ITEMS else "none",
            "listen": raw.get("listen") if raw.get("listen") in CARTOON_MOODS else "happy",
            "place": raw.get("place") if raw.get("place") in PARABLE_PLACES else "village",
            "time": raw.get("time") if raw.get("time") in PARABLE_TIMES else "day",
            "say": say,
        }
        if raw.get("think") is True:
            scene["think"] = True
        return scene if text else None
    if kind == "tale":  # Parable · Two paths: a story moment
        fields = _tale_fields(raw)
        return {"type": kind, **fields, "say": say} if fields["title"] or say else None
    if kind == "tally":  # Parable: the moment, with a number counting on a chalkboard
        label = _line(raw.get("label"), 40)
        value = _number(raw.get("value"))
        if not label or value <= 0:
            return None
        start = _number(raw.get("start")) if raw.get("start") not in (None, "") else 0.0
        scene = {
            "type": kind,
            **_tale_fields(raw),
            "label": label,
            "value": int(value) if value == int(value) else round(value, 1),
            "prefix": _line(raw.get("prefix"), 3),
            "suffix": _line(raw.get("suffix"), 10),
            "say": say,
        }
        if start > 0:
            scene["start"] = int(start) if start == int(start) else round(start, 1)
        return scene
    if kind == "fork":  # Parable: one path vs the other
        sides = []
        for i, x in enumerate((raw.get("sides") if isinstance(raw.get("sides"), list) else [])[:2]):
            if not isinstance(x, dict) or not _line(x.get("label"), 30):
                continue
            side = {
                "label": _line(x.get("label"), 30),
                "tone": x.get("tone") if x.get("tone") in ("good", "bad") else ("bad", "good")[i],
                **_duo_act(x),
            }
            if _icon(x.get("icon"), ""):
                side["icon"] = _icon(x.get("icon"), "")
            sides.append(side)
        return (
            {"type": kind, "title": _line(raw.get("title"), 50), "sides": sides, "say": say}
            if len(sides) == 2
            else None
        )
    if kind == "moral":  # Parable: the lesson
        text = _line(raw.get("text"), 140)
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 30),
                "text": text,
                "icon": _icon(raw.get("icon"), "Lightbulb"),
                "say": say,
            }
            if text
            else None
        )
    if kind == "remember":
        text = _line(raw.get("text"), 120)
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 40),
                "text": text,
                "icon": _icon(raw.get("icon"), "Star"),
                "say": say,
            }
            if text
            else None
        )
    if kind == "note":
        checks = [
            c
            for c in (
                _line(c, 40)
                for c in (raw.get("checks") if isinstance(raw.get("checks"), list) else [])
                if isinstance(c, str)
            )
            if c
        ][:5]
        return (
            {
                "type": kind,
                "who": _who(raw.get("who")),
                "mood": raw.get("mood") if raw.get("mood") in CARTOON_MOODS else "happy",
                "title": _line(raw.get("title"), 40),
                "checks": checks,
                "say": say,
            }
            if len(checks) >= 2
            else None
        )
    if kind == "doodle":
        title = _line(raw.get("title") or raw.get("text"), 100)
        scene = {
            "type": kind,
            "title": title,
            "text": _line(raw.get("text"), 120) if raw.get("title") else "",
            "icon": _icon(raw.get("icon"), "Brain"),
            "say": say,
        }
        if _line(raw.get("draw"), 300):
            scene["draw"] = _line(raw.get("draw"), 300)
        return scene if title else None
    if kind == "meme":
        top, bottom = _line(raw.get("top"), 90), _line(raw.get("bottom"), 90)
        mood = raw.get("mood") if raw.get("mood") in MEME_FACES else "laughing"
        return (
            {"type": kind, "top": top, "bottom": bottom, "mood": mood, "say": say}
            if top and bottom
            else None
        )
    if kind == "take":
        text = _line(raw.get("text"), 120)
        return (
            {"type": kind, "before": _line(raw.get("before"), 80), "text": text, "say": say}
            if text
            else None
        )
    if kind == "client":
        name = _line(raw.get("name"), 40)
        text = _line(raw.get("text"), 140)
        return (
            {
                "type": kind,
                "name": name,
                "field": _line(raw.get("field"), 50),
                "text": text,
                "example": raw.get("example") is not False,
                "say": say,
            }
            if name and text
            else None
        )
    if kind == "metrics":
        items = []
        for m in (raw.get("rows") or [])[:3]:
            if not isinstance(m, dict) or not _line(m.get("label"), 30):
                continue
            b, a = _number_signed(m.get("before")), _number_signed(m.get("after"))
            if b is None or a is None:
                continue
            items.append(
                {
                    "label": _line(m.get("label"), 30),
                    "before": b,
                    "after": a,
                    "prefix": _line(m.get("prefix"), 3),
                    "suffix": _line(m.get("suffix"), 10),
                }
            )
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "rows": items, "say": say}
            if items
            else None
        )
    if kind == "timeline":
        steps = [
            {"when": _line(x.get("when"), 16), "text": _line(x.get("text"), 60)}
            for x in (raw.get("steps") or [])
            if isinstance(x, dict) and _line(x.get("text"), 60)
        ][:4]
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "steps": steps, "say": say}
            if len(steps) >= 2
            else None
        )
    if kind == "qa":
        q, a = _line(raw.get("q"), 100), _line(raw.get("a"), 200)
        return {"type": kind, "q": q, "a": a, "say": say} if q and a else None
    if kind == "bars":
        items = []
        for x in (raw.get("data") or [])[:6]:
            v = _number_signed(x.get("value")) if isinstance(x, dict) else None
            if v is not None and _line(x.get("label"), 24):
                items.append({"label": _line(x.get("label"), 24), "value": v})
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 70),
                "data": items,
                "prefix": _line(raw.get("prefix"), 3),
                "suffix": _line(raw.get("suffix"), 6),
                "source": _line(raw.get("source"), 60),
                "say": say,
            }
            if len(items) >= 2
            else None
        )
    if kind == "donut":
        v = _number(raw.get("value"))
        label = _line(raw.get("label"), 80)
        return (
            {
                "type": kind,
                "value": round(v, 1),
                "label": label,
                "source": _line(raw.get("source"), 60),
                "say": say,
            }
            if 0 < v < 100 and label
            else None
        )
    if kind in ("rank", "tip"):
        title = _line(raw.get("title"), 70)
        return (
            {
                "type": kind,
                "title": title,
                "text": _line(raw.get("text"), 120),
                "icon": _icon(raw.get("icon"), "Sparkles"),
                "say": say,
            }
            if title
            else None
        )
    if kind == "choice":
        sides = []
        for key in ("left", "right"):
            side = raw.get(key) if isinstance(raw.get(key), dict) else {}
            sides.append(
                {
                    "name": _line(side.get("name") or side.get("label"), 30),
                    "icon": _icon(side.get("icon"), "Circle"),
                }
            )
        question = _line(raw.get("question"), 80)
        pct = int(_number(str(raw.get("percent") or "").replace("%", "")))
        return (
            {
                "type": kind,
                "question": question,
                "left": sides[0],
                "right": sides[1],
                "percent": pct if 0 < pct < 100 else 0,
                "prompt": _line(raw.get("prompt"), 30),
                "say": say,
            }
            if question and sides[0]["name"] and sides[1]["name"]
            else None
        )
    if kind == "reviews":
        cards = []
        for c in (raw.get("cards") or [])[:4]:
            if not isinstance(c, dict) or not _line(c.get("text"), 140):
                continue
            stars = int(_number(c.get("stars")) or 5)
            cards.append(
                {
                    "name": _line(c.get("name"), 24),
                    "text": _line(c.get("text"), 140),
                    "stars": max(1, min(5, stars)),
                }
            )
        rating = _number(raw.get("rating"))
        rating = round(rating, 1) if 1 <= rating <= 5 else 0
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 30),
                "rating": rating,
                "count": _line(raw.get("count"), 30),
                "cards": cards,
                "say": say,
            }
            if len(cards) >= 2 or rating
            else None
        )
    if kind == "logos":
        names = [n for n in (_line(n, 24) for n in (raw.get("names") or [])) if n][:8]
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "names": names, "say": say}
            if len(names) >= 3
            else None
        )
    if kind == "save":
        text = _line(raw.get("text"), 80)
        return (
            {"type": kind, "text": text, "button": _line(raw.get("button"), 16), "say": say}
            if text
            else None
        )
    if kind == "platform":
        text = _line(raw.get("text"), 100)
        shot = int(raw.get("shot")) if str(raw.get("shot") or "").strip().isdigit() else 0
        return {"type": kind, "text": text, "shot": shot, "say": say} if text else None
    if kind == "orbit":
        c = raw.get("center") if isinstance(raw.get("center"), dict) else {}
        tags = [
            {"icon": _icon(x.get("icon"), "Check"), "label": _line(x.get("label"), 24)}
            for x in (raw.get("tags") or [])
            if isinstance(x, dict) and _line(x.get("label"), 24)
        ][:6]
        center = {
            "icon": _icon(c.get("icon"), "FileText"),
            "title": _line(c.get("title"), 40),
            "sub": _line(c.get("sub"), 24),
        }
        return (
            {
                "type": kind,
                "text": _line(raw.get("text"), 100),
                "center": center,
                "tags": tags,
                "say": say,
            }
            if center["title"] and len(tags) >= 3
            else None
        )
    if kind == "chaos":
        cards = [
            {
                "app": _line(x.get("app"), 20),
                "title": _line(x.get("title"), 40),
                "sub": _line(x.get("sub"), 40),
            }
            for x in (raw.get("cards") or [])
            if isinstance(x, dict) and _line(x.get("title"), 40)
        ][:6]
        text = _line(raw.get("text"), 80)
        return (
            {"type": kind, "text": text, "cards": cards, "say": say}
            if text and len(cards) >= 3
            else None
        )
    if kind == "phones":
        words = [w for w in (_line(w, 20) for w in (raw.get("words") or [])) if w][:4]
        shots = [
            int(x) for x in (raw.get("shots") or []) if str(x).strip().isdigit() and int(x) >= 1
        ][:4]
        return {"type": kind, "words": words, "shots": shots, "say": say} if words else None
    if (
        kind == "gallery"
    ):  # SaaS explainer: the app's library, a tilted 3D window of picture / video cards
        cards = [
            {
                "title": _line(x.get("title"), 30),
                "sub": _line(x.get("sub"), 30),
                "icon": _icon(x.get("icon"), "Image"),
            }
            for x in (raw.get("cards") or [])
            if isinstance(x, dict) and _line(x.get("title"), 30)
        ][:6]
        tabs = [t for t in (_line(t, 14) for t in (raw.get("tabs") or [])) if t][:4]
        shots = [
            int(x) for x in (raw.get("shots") or []) if str(x).strip().isdigit() and int(x) >= 1
        ][:6]
        title = _line(raw.get("title"), 30) or "Library"
        out = {
            "type": kind,
            "title": title,
            "text": _line(raw.get("text"), 80),
            "tabs": tabs,
            "cards": cards,
            "shots": shots,
            "say": say,
        }
        return out if len(cards) >= 3 else None
    if kind == "pair":
        left, right = _line(raw.get("left"), 30), _line(raw.get("right"), 24)
        return (
            {
                "type": kind,
                "left": left,
                "right": right,
                "icon": _icon(raw.get("icon"), "BookOpen"),
                "label": _line(raw.get("label"), 20),
                "say": say,
            }
            if left and right
            else None
        )
    if kind == "launch":
        name = _line(raw.get("name"), 30)
        return (
            {
                "type": kind,
                "name": names.get(name.lower(), name),
                "text": _line(raw.get("text"), 100),
                "badge": _line(raw.get("badge"), 16),
                "say": say,
            }
            if name
            else None
        )
    if kind == "canvas":  # AI design — the AI designed it; checked layer by layer
        return _clean_canvas(raw, say)
    if kind in ("send", "address", "lookup", "hops", "assemble"):  # Tech explainer
        dev = lambda v, d="phone": v if v in TECH_DEVICES else d  # noqa: E731
        text = _line(raw.get("text"), 80)
        if kind == "send":
            ends = [raw.get("from") or {}, raw.get("to") or {}]
            if not all(isinstance(e, dict) for e in ends):
                return None
            (a, b) = (
                {"device": dev(e.get("device"), d), "label": _line(e.get("label"), 30)}
                for e, d in zip(ends, ("phone", "router"))
            )
            return {"type": kind, "from": a, "to": b, "text": text, "say": say}
        if kind == "address":
            frm, to = _line(raw.get("from"), 24), _line(raw.get("to"), 24)
            return (
                {
                    "type": kind,
                    "device": dev(raw.get("device"), "router"),
                    "from": frm,
                    "to": to,
                    "text": text,
                    "say": say,
                }
                if frm and to
                else None
            )
        if kind == "lookup":
            q, a = _line(raw.get("question"), 60), _line(raw.get("answer"), 30)
            return (
                {
                    "type": kind,
                    "server": _line(raw.get("server"), 16) or "Server",
                    "question": q,
                    "answer": a,
                    "text": text,
                    "say": say,
                }
                if q and a
                else None
            )
        if kind == "hops":
            nodes = [
                {"device": dev(x.get("device"), "server"), "label": _line(x.get("label"), 24)}
                for x in (raw.get("nodes") or [])
                if isinstance(x, dict)
            ][:5]
            return (
                {"type": kind, "nodes": nodes, "text": text, "say": say}
                if len(nodes) >= 3
                else None
            )
        return {
            "type": kind,
            "device": dev(raw.get("device")),
            "label": _line(raw.get("label"), 30),
            "text": text,
            "say": say,
        }
    if kind == "tasks":
        items = [
            {"icon": _icon(x.get("icon"), "Repeat"), "text": _line(x.get("text"), 40)}
            for x in (raw.get("items") or [])
            if isinstance(x, dict) and _line(x.get("text"), 40)
        ][:4]
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 60),
                "items": items,
                "sticker": _line(raw.get("sticker"), 40),
                "say": say,
            }
            if len(items) >= 2
            else None
        )
    if kind == "fanout":
        kinds = ("post", "price", "tags", "chat", "list")
        outputs = [
            {"kind": x.get("kind"), "value": _line(x.get("value"), 50)}
            for x in (raw.get("outputs") or [])
            if isinstance(x, dict) and x.get("kind") in kinds
        ][:3]
        name = _line(raw.get("product"), 60)
        checks = [_line(c, 40) for c in (raw.get("checks") or []) if _line(c, 40)][:2]
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 60),
                "product": names.get(name.lower(), name),
                "icon": _icon(raw.get("icon"), "Image"),
                "outputs": outputs,
                "checks": checks,
                "say": say,
            }
            if len(outputs) >= 2
            else None
        )
    if kind == "word":
        word = _line(raw.get("word"), 24)
        rows = [
            {"name": _line(x.get("name"), 30), "sub": _line(x.get("sub"), 40)}
            for x in (raw.get("rows") or [])
            if isinstance(x, dict) and _line(x.get("name"), 30)
        ][:3]
        return (
            {
                "type": kind,
                "word": word,
                "title": _line(raw.get("title"), 40),
                "action": _line(raw.get("action"), 14),
                "text": _line(raw.get("text"), 90),
                "rows": rows,
                "say": say,
            }
            if word
            else None
        )
    if kind == "field":
        value = _line(raw.get("value"), 40)
        return (
            {
                "type": kind,
                "label": _line(raw.get("label"), 30),
                "value": value,
                "button": _line(raw.get("button"), 20),
                "say": say,
            }
            if value
            else None
        )
    if kind == "done":
        text = _line(raw.get("text"), 40)
        return (
            {"type": kind, "text": text, "icon": _icon(raw.get("icon"), "Check"), "say": say}
            if text
            else None
        )
    if kind == "button":
        button = _line(raw.get("button"), 28)
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 40),
                "text": _line(raw.get("text"), 80),
                "button": button,
                "result": _line(raw.get("result"), 50),
                "say": say,
            }
            if button
            else None
        )
    if kind == "form":
        fields = [
            {"label": _line(f.get("label"), 24), "value": _line(f.get("value"), 40)}
            for f in (raw.get("fields") or [])
            if isinstance(f, dict) and _line(f.get("label"), 24) and _line(f.get("value"), 40)
        ][:3]
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 40),
                "fields": fields,
                "toggle": _line(raw.get("toggle"), 50),
                "say": say,
            }
            if fields
            else None
        )
    if kind == "stack":
        shots = [int(x) for x in (raw.get("shots") or []) if str(x).strip().isdigit()][:4]
        words = [w for w in (_line(w, 16) for w in (raw.get("words") or [])) if w][:3]
        shots = [x for x in dict.fromkeys(shots) if x >= 1]
        return (
            {"type": kind, "words": words, "shots": shots, "say": say} if len(shots) >= 2 else None
        )
    if kind == "apps":
        apps = _apps(raw.get("apps"))
        return (
            {"type": kind, "title": _line(raw.get("title"), 80), "apps": apps, "say": say}
            if len(apps) >= 3
            else None
        )
    if kind == "roll":
        words = [w for w in (_line(w, 16) for w in (raw.get("words") or [])) if w][:5]
        return (
            {
                "type": kind,
                "lead": _line(raw.get("lead"), 24),
                "words": words,
                "icon": _icon(raw.get("icon"), "Check"),
                "text": _line(raw.get("text"), 80),
                "say": say,
            }
            if len(words) >= 2
            else None
        )
    if kind == "table":
        columns = [c for c in (_line(c, 24) for c in (raw.get("columns") or [])) if c][:5]
        rows = [
            [_line(cell, 40) for cell in (list(r) + [""] * len(columns))[: len(columns)]]
            for r in (raw.get("rows") or [])
            if isinstance(r, list) and r and _line(r[0], 40)
        ][:6]
        groups = [g for g in (_line(g, 24) for g in (raw.get("groups") or [])) if g][:4]
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 40),
                "columns": columns,
                "rows": rows,
                "groups": groups,
                "say": say,
            }
            if len(columns) >= 2 and len(rows) >= 2
            else None
        )
    if kind == "board":
        columns = [
            {
                "name": _line(c.get("name"), 20),
                "cards": [x for x in (_line(x, 50) for x in (c.get("cards") or [])) if x][:3],
            }
            for c in (raw.get("columns") or [])
            if isinstance(c, dict) and _line(c.get("name"), 20)
        ][:3]
        return (
            {"type": kind, "title": _line(raw.get("title"), 80), "columns": columns, "say": say}
            if len(columns) >= 2 and columns[0]["cards"]
            else None
        )
    if kind == "problem":
        title = _line(raw.get("title"), 80)
        count = int(_number(raw.get("count")))
        return (
            {
                "type": kind,
                "icon": _icon(raw.get("icon"), "Frown"),
                "title": title,
                "text": _line(raw.get("text"), 140),
                "count": min(count, 999),
                "say": say,
            }
            if title
            else None
        )
    if kind == "chat":
        msgs = [
            {
                "from": "brand" if m.get("from") == "brand" else "customer",
                "text": _line(m.get("text"), 140),
            }
            for m in (raw.get("messages") or [])
            if isinstance(m, dict) and _line(m.get("text"), 140)
        ][:4]
        return (
            {"type": kind, "title": _line(raw.get("title"), 100), "messages": msgs, "say": say}
            if len(msgs) >= 2
            else None
        )
    if kind == "list":
        items = [
            {"icon": _icon(i.get("icon"), "CircleCheck"), "text": _line(i.get("text"), 80)}
            for i in (raw.get("items") or [])
            if isinstance(i, dict) and _line(i.get("text"), 80)
        ][:4]
        return (
            {"type": kind, "title": _line(raw.get("title"), 80), "items": items, "say": say}
            if len(items) >= 2
            else None
        )
    if kind == "stat":
        value = _number(raw.get("value"))
        label = _line(raw.get("label"), 80)
        return (
            {
                "type": kind,
                "value": int(value) if value == int(value) else round(value, 1),
                "prefix": _line(raw.get("prefix"), 3),
                "suffix": _line(raw.get("suffix"), 10),  # "/month", not "/mon"
                "label": label,
                "icon": _icon(raw.get("icon"), "TrendingUp"),
                "say": say,
            }
            if value and label
            else None
        )
    if kind == "product":
        chips = [c for c in (_line(c, 30) for c in (raw.get("chips") or [])) if c][:3]
        title = _line(raw.get("title"), 100)
        product = names.get(_line(raw.get("product"), 120).lower(), "")
        return (
            {"type": kind, "product": product, "title": title, "chips": chips, "say": say}
            if title
            else None
        )
    if kind == "cta":
        text = _line(raw.get("text"), 140)
        cta = {"type": kind, "text": text, "button": _line(raw.get("button"), 40), "say": say}
        if _line(raw.get("sub"), 60):
            cta["sub"] = _line(raw.get("sub"), 60)
        if _line(raw.get("draw"), 300):
            cta["draw"] = _line(raw.get("draw"), 300)  # Doodle notes
        return cta if text else None
    if kind == "character":
        title = _line(raw.get("title"), 80)
        icon = str(raw.get("icon") or "").strip()
        return (
            {
                "type": kind,
                "title": title,
                "mood": raw.get("mood") if raw.get("mood") in MOODS else "happy",
                "icon": icon if icon in ICONS else "",
                "tag": _line(raw.get("tag"), 16),
                "say": say,
            }
            if title
            else None
        )
    if kind == "compare":

        def person(p) -> dict | None:
            if not isinstance(p, dict) or not _line(p.get("name"), 40):
                return None
            return {
                "name": _line(p.get("name"), 40),
                "mood": p.get("mood") if p.get("mood") in MOODS else "happy",
                "value": _line(p.get("value"), 16),
                "tone": "bad" if p.get("tone") == "bad" else "good",
            }

        left, right = person(raw.get("left")), person(raw.get("right"))
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 80),
                "left": left,
                "right": right,
                "say": say,
            }
            if left and right
            else None
        )
    if kind == "chart":
        # Checked here, so the chart always draws: same number of values as
        # labels, real numbers, at most two lines. Its tags are computed from
        # these values by the template, so they always agree with the lines.
        labels = [_line(lab, 10) for lab in (raw.get("labels") or [])][:8]
        series = []
        for s in (raw.get("series") or [])[:2]:
            if not isinstance(s, dict):
                continue
            values = [_number_signed(v) for v in (s.get("values") or [])]
            if (
                len(values) >= 2
                and None not in values
                and (not labels or len(values) == len(labels))
            ):
                series.append(
                    {
                        "name": _line(s.get("name"), 40),
                        "tone": "bad" if s.get("tone") == "bad" else "good",
                        "values": values,
                    }
                )
        if not series:
            return None
        n = len(series[0]["values"])
        series = [s for s in series if len(s["values"]) == n]
        return {
            "type": kind,
            "title": _line(raw.get("title"), 80),
            "prefix": _line(raw.get("prefix"), 3),
            "suffix": _line(raw.get("suffix"), 4),
            "labels": labels or [str(i) for i in range(n)],
            "series": series,
            "say": say,
        }
    if kind == "split":

        def side(p) -> dict | None:
            if not isinstance(p, dict):
                return None
            points = [x for x in (_line(x, 60) for x in (p.get("points") or [])) if x][:3]
            label = _line(p.get("label"), 40)
            return (
                {"label": label, "icon": _icon(p.get("icon"), "Circle"), "points": points}
                if label and points
                else None
            )

        left, right = side(raw.get("left")), side(raw.get("right"))
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 80),
                "left": left,
                "right": right,
                "say": say,
            }
            if left and right
            else None
        )
    if kind == "myth":
        myth, fact = _line(raw.get("myth"), 160), _line(raw.get("fact"), 160)
        return {"type": kind, "myth": myth, "fact": fact, "say": say} if myth and fact else None
    if kind in ("verdict", "reveal"):
        text = _line(raw.get("text"), 140)
        return (
            {
                "type": kind,
                "text": text,
                "icon": _icon(raw.get("icon"), "Award" if kind == "verdict" else "Lightbulb"),
                "say": say,
            }
            if text
            else None
        )
    if kind == "options":
        opts = [o for o in (_line(o, 50) for o in (raw.get("options") or [])) if o][:4]
        try:
            answer = int(raw.get("answer"))
        except (TypeError, ValueError):
            answer = -1
        return (
            {
                "type": kind,
                "question": _line(raw.get("question"), 60),
                "options": opts,
                "answer": answer if 0 <= answer < len(opts) else -1,
                "say": say,
            }
            if len(opts) >= 2
            else None
        )
    if kind == "customer":
        name = _line(raw.get("name"), 40)
        return (
            {
                "type": kind,
                "name": name,
                "business": _line(raw.get("business"), 60),
                "text": _line(raw.get("text"), 140),
                "mood": raw.get("mood") if raw.get("mood") in MOODS else "thinking",
                "say": say,
            }
            if name
            else None
        )
    if kind == "beforeafter":
        before, after = _line(raw.get("before"), 140), _line(raw.get("after"), 140)
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 80),
                "before": before,
                "after": after,
                "say": say,
            }
            if before and after
            else None
        )
    if kind == "result":
        value = _number(raw.get("value"))
        label = _line(raw.get("label"), 80)
        return (
            {
                "type": kind,
                "value": int(value) if value == int(value) else round(value, 1),
                "prefix": _line(raw.get("prefix"), 3),
                "suffix": _line(raw.get("suffix"), 4),
                "label": label,
                "say": say,
            }
            if value and label
            else None
        )
    if kind == "review":
        text = _line(raw.get("text"), 220)
        try:
            stars = int(raw.get("stars") or 5)
        except (TypeError, ValueError):
            stars = 5
        return (
            {
                "type": kind,
                "text": text,
                "name": _line(raw.get("name"), 40),
                "stars": max(1, min(5, stars)),
                "say": say,
            }
            if text
            else None
        )
    if kind == "quote":
        text = _line(raw.get("text"), 220)
        return (
            {
                "type": kind,
                "text": text,
                "author": _line(raw.get("author"), 40),
                "role": _line(raw.get("role"), 50),
                "say": say,
            }
            if text
            else None
        )
    if kind == "screen":
        try:
            shot = int(raw.get("shot"))
        except (TypeError, ValueError):
            return None
        scene = {
            "type": kind,
            "shot": shot,
            "title": _line(raw.get("title"), 80),
            "text": _line(raw.get("text"), 120),
            "target": _line(raw.get("target"), 80),
            "action": raw.get("action")
            if raw.get("action") in ("click", "highlight", "zoom")
            else "click",
            "result": _line(raw.get("result"), 50),
            "say": say,
        }
        if _box(raw.get("focus")):
            scene["focus"] = _box(raw.get("focus"))  # found already (a reviewed storyboard)
        return scene if shot >= 1 else None
    if kind == "chapter":
        title = _line(raw.get("title"), 80)
        return (
            {"type": kind, "title": title, "text": _line(raw.get("text"), 120), "say": say}
            if title
            else None
        )
    if kind == "checklist":
        checks = [c for c in (_line(c, 90) for c in (raw.get("checks") or [])) if c][:6]
        return (
            {"type": kind, "title": _line(raw.get("title"), 90), "checks": checks, "say": say}
            if len(checks) >= 2
            else None
        )
    if kind == "recap":
        points = [
            {"title": _line(x.get("title"), 40), "text": _line(x.get("text"), 100)}
            for x in (raw.get("points") or [])
            if isinstance(x, dict) and _line(x.get("title"), 40)
        ][:5]
        return (
            {"type": kind, "title": _line(raw.get("title"), 80), "points": points, "say": say}
            if len(points) >= 2
            else None
        )
    if kind == "dashboard":
        metrics = []
        for m in (raw.get("metrics") or [])[:3]:
            if not isinstance(m, dict) or not _line(m.get("label"), 30):
                continue
            value = _number(m.get("value"))
            metrics.append(
                {
                    "label": _line(m.get("label"), 30),
                    "value": int(value) if value == int(value) else round(value, 1),
                    "prefix": _line(m.get("prefix"), 3),
                    "suffix": _line(m.get("suffix"), 4),
                    "delta": _line(m.get("delta"), 8),
                }
            )
        chart = "bars" if raw.get("chart") == "bars" else "line"
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 60),
                "metrics": metrics,
                "chart": chart,
                "say": say,
            }
            if metrics
            else None
        )
    if kind == "flow":
        nodes = [
            {
                "icon": _icon(n.get("icon"), "Zap"),
                "label": _line(n.get("label"), 40),
                "sub": _line(n.get("sub"), 30),
            }
            for n in (raw.get("nodes") or [])
            if isinstance(n, dict) and _line(n.get("label"), 40)
        ][:4]
        return (
            {"type": kind, "title": _line(raw.get("title"), 60), "nodes": nodes, "say": say}
            if len(nodes) >= 2
            else None
        )
    if kind == "news":
        headline = _line(raw.get("headline"), 140)
        return (
            {
                "type": kind,
                "tag": _line(raw.get("tag"), 30),
                "headline": headline,
                "text": _line(raw.get("text"), 160),
                "say": say,
            }
            if headline
            else None
        )
    if kind == "notify":
        notes = [
            {"app": _line(n.get("app"), 20) or "Messenger", "text": _line(n.get("text"), 90)}
            for n in (raw.get("notes") or [])
            if isinstance(n, dict) and _line(n.get("text"), 90)
        ][:4]
        time = _line(raw.get("time"), 5)
        return (
            {
                "type": kind,
                "title": _line(raw.get("title"), 80),
                "time": time if re.fullmatch(r"\d{1,2}:\d{2}", time) else "",
                "notes": notes,
                "say": say,
            }
            if len(notes) >= 2
            else None
        )
    if kind == "step":
        title = _line(raw.get("title"), 80)
        return (
            {
                "type": kind,
                "title": title,
                "text": _line(raw.get("text"), 140),
                "icon": _icon(raw.get("icon"), "Zap"),
                "result": _line(raw.get("result"), 50),
                "say": say,
            }
            if title
            else None
        )
    if kind == "offer":
        features = [f for f in (_line(f, 50) for f in (raw.get("features") or [])) if f][:4]
        offer = {
            "type": kind,
            "plan": _line(raw.get("plan"), 40),
            "price": _line(raw.get("price"), 14),
            "period": _line(raw.get("period"), 14),
            "was": _line(raw.get("was"), 14),
            "badge": _line(raw.get("badge"), 28),
            "features": features,
            "say": say,
        }
        if not offer["price"]:
            offer["was"] = offer["period"] = ""  # no price, no "/month" or old price either
        return offer if (offer["plan"] or offer["price"]) and features else None
    return None


def _number_signed(value) -> float | None:
    """A chart value — negatives allowed (money spent), None when not a number."""
    try:
        n = float(str(value).replace(",", "").replace("$", "").strip())
    except ValueError:
        return None
    return n if -1e9 < n < 1e9 else None


# The on-screen and spoken text of each scene type, for the Khmer editor pass.
_TEXT_FIELDS = {
    "hook": (("text", 160), ("say", 300)),
    "problem": (("title", 80), ("text", 140), ("say", 300)),
    "chat": (("title", 100), ("say", 300)),
    "list": (("title", 80), ("say", 300)),
    "stat": (("label", 80), ("say", 300)),
    "product": (("title", 100), ("say", 300)),
    "cta": (("text", 140), ("button", 40), ("say", 300)),
    "character": (("title", 80), ("say", 300)),
    "compare": (("title", 80), ("say", 300)),
    "chart": (("title", 80), ("say", 300)),
    "split": (("title", 80), ("say", 300)),
    "myth": (("myth", 160), ("fact", 160), ("say", 300)),
    "verdict": (("text", 140), ("say", 300)),
    "reveal": (("text", 140), ("say", 300)),
    "options": (("question", 60), ("say", 300)),
    "quote": (("text", 220), ("say", 300)),
    "customer": (("business", 60), ("text", 140), ("say", 300)),
    "beforeafter": (("title", 80), ("before", 140), ("after", 140), ("say", 300)),
    "result": (("label", 80), ("say", 300)),
    "review": (("say", 300),),
    "news": (("tag", 30), ("headline", 140), ("text", 160), ("say", 300)),
    "screen": (("title", 80), ("text", 120), ("result", 50), ("say", 300)),
    "dashboard": (("title", 60), ("say", 300)),
    "chapter": (("title", 80), ("text", 120), ("say", 300)),
    "checklist": (("title", 90), ("say", 300)),
    "recap": (("title", 80), ("say", 300)),
    "flow": (("title", 60), ("say", 300)),
    "notify": (("title", 80), ("say", 300)),
    "step": (("title", 80), ("text", 140), ("result", 50), ("say", 300)),
    "offer": (("badge", 28), ("period", 14), ("say", 300)),
    "apps": (("title", 80), ("say", 300)),
    "launch": (("text", 100), ("badge", 16), ("say", 300)),
    "platform": (("text", 100), ("say", 300)),
    "rank": (("title", 70), ("text", 120), ("say", 300)),
    "take": (("before", 80), ("text", 120), ("say", 300)),
    "meme": (("top", 90), ("bottom", 90), ("say", 300)),
    "client": (("field", 50), ("text", 140), ("say", 300)),
    "metrics": (("title", 60), ("say", 300)),
    "timeline": (("title", 60), ("say", 300)),
    "qa": (("q", 100), ("a", 200), ("say", 300)),
    "bars": (("title", 70), ("say", 300)),
    "donut": (("label", 80), ("say", 300)),
    "tip": (("title", 70), ("text", 120), ("say", 300)),
    "doodle": (("title", 100), ("text", 120), ("say", 300)),
    "talk": (("text", 120), ("say", 300)),
    "react": (("text", 120), ("bubble", 30), ("say", 300)),
    "collage": (("word", 14), ("say", 300)),
    "statement": (("text", 120), ("sub", 60), ("say", 300)),
    "pedestal": (("title", 40), ("left", 50), ("right", 50), ("say", 300)),
    "punch": (("text", 120), ("say", 300)),
    "speak": (("text", 120), ("say", 300)),
    "onair": (("text", 120), ("say", 300)),
    "visit": (("text", 100), ("say", 300)),
    "acronym": (
        ("text", 140),
        ("say", 300),
    ),  # Cybersecurity's long-script scenes (expand: English words, kept)
    "guard": (("title", 60), ("say", 300)),
    "sectors": (("title", 60), ("say", 300)),
    "breach": (("title", 70), ("text", 120), ("say", 300)),
    "ransom": (("title", 60), ("say", 300)),
    "moment": (
        ("text", 90),
        ("say", 300),
    ),  # Life story (its prop's words: write_script's Khmer pass)
    "ledger": (("title", 50), ("say", 300)),
    "takeaway": (("title", 40), ("say", 300)),
    "whiteboard": (("title", 70), ("say", 300)),
    "climb": (("title", 70), ("text", 120), ("word", 24), ("say", 300)),
    "mirror": (("title", 60), ("before", 60), ("after", 60), ("say", 300)),
    "grow": (("title", 60), ("text", 120), ("say", 300)),
    "summit": (("text", 140), ("say", 300)),
    "example": (("title", 60), ("say", 300)),
    "remember": (("title", 40), ("text", 120), ("say", 300)),
    "line": (("text", 120), ("say", 300)),
    "shops": (("title", 60), ("say", 300)),
    "agenda": (("title", 90), ("say", 300)),
    "keypoints": (("title", 90), ("say", 300)),
    "bignum": (("label", 80), ("text", 160), ("say", 300)),
    "barchart": (("title", 90), ("say", 300)),
    "twocol": (("title", 90), ("say", 300)),
    "pullquote": (("text", 220), ("author", 40), ("role", 50), ("say", 300)),
    "picture": (("title", 90), ("text", 200), ("say", 300)),
    "roadmap": (("title", 90), ("say", 300)),
    "overload": (("text", 120), ("say", 300)),
    "crew": (("text", 120), ("say", 300)),
    "pipeline": (("text", 120), ("say", 300)),
    "approve": (("text", 120), ("post", 160), ("button", 24), ("say", 300)),
    "gains": (("text", 120), ("say", 300)),
    "plans": (("text", 120), ("badge", 16), ("say", 300)),
    "wide": (("title", 50), ("say", 300)),
    "shot": (("title", 60), ("say", PICTURE_SAY_MAX)),  # Picture story
    "closeup": (("text", 60), ("say", 300)),
    "fact": (("title", 40), ("text", 140), ("say", 300)),
    "crowd": (("title", 60), ("label", 40), ("say", 300)),
    "chatter": (("title", 60), ("say", 300)),
    "tale": (("title", 50), ("say", 300)),
    "tally": (("title", 50), ("label", 40), ("say", 300)),
    "fork": (("title", 50), ("say", 300)),
    "moral": (("title", 30), ("text", 140), ("say", 300)),
    "note": (("title", 40), ("say", 300)),
    "choice": (("question", 80), ("prompt", 30), ("say", 300)),
    "reviews": (("title", 30), ("say", 300)),
    "logos": (("title", 60), ("say", 300)),
    "save": (("text", 80), ("button", 16), ("say", 300)),
    "orbit": (("text", 100), ("say", 300)),
    "chaos": (("text", 80), ("say", 300)),
    "phones": (("say", 300),),
    "gallery": (("title", 30), ("text", 80), ("say", 300)),
    "pair": (("left", 30), ("right", 24), ("label", 20), ("say", 300)),
    "button": (("title", 40), ("text", 80), ("button", 28), ("result", 50), ("say", 300)),
    "word": (("word", 24), ("title", 40), ("text", 90), ("say", 300)),
    "tasks": (("title", 60), ("sticker", 40), ("say", 300)),
    "send": (("text", 80), ("say", 300)),
    "address": (("text", 80), ("say", 300)),
    "lookup": (("question", 60), ("text", 80), ("say", 300)),
    "hops": (("text", 80), ("say", 300)),
    "assemble": (("text", 80), ("say", 300)),
    "fanout": (("title", 60), ("say", 300)),
    "field": (("label", 30), ("button", 20), ("say", 300)),
    "done": (("text", 40), ("say", 300)),
    "form": (("title", 40), ("toggle", 50), ("say", 300)),
    "stack": (("say", 300),),
    "roll": (("lead", 24), ("text", 80), ("say", 300)),
    "table": (("title", 40), ("say", 300)),
    "board": (("title", 80), ("say", 300)),
    "canvas": (("say", 300),),  # its layers' words: write_script's AI-design branch
}
