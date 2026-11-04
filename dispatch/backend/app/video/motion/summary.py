"""A storyboard in words: "How it was made", the live board's rows, a scene's one-line summary.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import base64
import re
from app.storage.media import store_blob
from pathlib import Path
from sqlalchemy.orm import Session

from typing import TYPE_CHECKING

from app.video.motion.common import TRANSITION_S, log


def making_of(
    db: Session,
    props: dict,
    script: dict,
    job_id: int,
    voice: str,
    narrator: str | None,
    language: str,
) -> dict:
    """A finished video's "How it was made" (GenerationJob.making): the
    template, the voice, and per scene what's on screen, what's said, where it
    starts in the video and its narration clip (stored, so it can be played on
    its own). Scenes overlap by one transition, like length_of counts them."""
    lines = script_lines(script)
    scenes, start = [], 0.0
    for n, scene in enumerate(props["scenes"]):
        seconds = scene.get("seconds") or default_seconds(scene)
        audio = scene.get("audio") or ""
        clip = ""
        if audio.startswith("data:audio/mpeg;base64,"):
            try:
                clip = store_blob(
                    db, base64.b64decode(audio.split(",", 1)[1]), ".mp3", "audio/mpeg"
                )
            except Exception as exc:  # noqa: BLE001 — the scene list is worth more than one clip
                log.warning("motion %s: couldn't keep scene %s's voice: %s", job_id, n + 1, exc)
        screen, say = lines[n] if n < len(lines) else ("", "")
        src = script["scenes"][n] if n < len(script["scenes"]) else {}
        scenes.append(
            {
                "type": src.get("type") or scene.get("type") or "",
                "screen": screen,
                "say": (say or "") if narrator else "",
                "start": round(start, 2),
                "seconds": round(seconds, 2),
                "audio": clip,
            }
        )
        start += seconds - TRANSITION_S
    music = props.get("music") or ""
    return {
        "style": script.get("style") or "",
        "why": (_progress.get(job_id) or {}).get("why") or "",
        "voice": voice if narrator else "none",
        "narrator": narrator or "",
        "language": language,
        "music": Path(music).stem.replace("-", " ").replace("_", " ") if music else "",
        "ratio": props.get("ratio") or script.get("ratio") or "",
        "scenes": scenes,
    }


def script_lines(script: dict) -> list[tuple[str, str]]:
    """(what's on screen, what's said) per scene — for "How it was made"."""
    out = []
    for s in script["scenes"]:
        if s["type"] == "chat":
            screen = (
                (s.get("title") or "Chat") + " — " + " / ".join(m["text"] for m in s["messages"])
            )
        elif s["type"] == "list":
            screen = (s.get("title") or "") + " — " + ", ".join(i["text"] for i in s["items"])
        elif s["type"] == "stat":
            screen = f"{s.get('prefix', '')}{s['value']}{s.get('suffix', '')} {s['label']}"
        elif s["type"] == "product":
            screen = s["title"] + (" — " + ", ".join(s["chips"]) if s["chips"] else "")
        elif s["type"] == "problem":
            screen = s["title"] + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "split":
            screen = " vs ".join(
                f"{p['label']} ({', '.join(p['points'])})" for p in (s["left"], s["right"])
            )
        elif s["type"] == "myth":
            screen = f"Myth: {s['myth']} — Fact: {s['fact']}"
        elif s["type"] == "options":
            screen = " / ".join(f"{'ABCD'[k]}. {o}" for k, o in enumerate(s["options"])) + (
                f" — answer {'ABCD'[s['answer']]}" if s["answer"] >= 0 else ""
            )
        elif s["type"] == "quote":
            screen = f"“{s['text']}”" + (f" — {s['author']}" if s.get("author") else "")
        elif s["type"] == "customer":
            screen = (
                s["name"]
                + (f" ({s['business']})" if s.get("business") else "")
                + (f" — {s['text']}" if s.get("text") else "")
            )
        elif s["type"] == "beforeafter":
            screen = f"Before: {s['before']} → After: {s['after']}"
        elif s["type"] == "result":
            screen = f"{s.get('prefix', '')}{s['value']}{s.get('suffix', '')} {s['label']}"
        elif s["type"] == "review":
            screen = f"{'★' * s.get('stars', 5)} “{s['text']}”" + (
                f" — {s['name']}" if s.get("name") else ""
            )
        elif s["type"] == "screen":
            screen = (
                f"Screenshot {s['shot']}: {s.get('title', '')}"
                + (f" → {s['target']}" if s.get("target") else "")
                + (f" ✓ {s['result']}" if s.get("result") else "")
            )
        elif s["type"] == "chapter":
            screen = f"Chapter: {s['title']}" + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "checklist":
            screen = (s.get("title") or "Checklist") + " — " + " / ".join(s["checks"])
        elif s["type"] == "recap":
            screen = (
                (s.get("title") or "Recap")
                + " — "
                + " / ".join(
                    x["title"] + (f": {x['text']}" if x.get("text") else "") for x in s["points"]
                )
            )
        elif s["type"] == "dashboard":
            screen = (
                (s.get("title") or "Dashboard")
                + " — "
                + ", ".join(
                    f"{m['label']} {m.get('prefix', '')}{m['value']}{m.get('suffix', '')}"
                    + (f" ({m['delta']})" if m.get("delta") else "")
                    for m in s["metrics"]
                )
            )
        elif s["type"] == "flow":
            screen = (
                (s.get("title") or "Flow")
                + " — "
                + " → ".join(
                    n["label"] + (f" ({n['sub']})" if n.get("sub") else "") for n in s["nodes"]
                )
            )
        elif s["type"] == "news":
            screen = (
                (f"{s['tag']}: " if s.get("tag") else "")
                + s["headline"]
                + (f" — {s['text']}" if s.get("text") else "")
            )
        elif s["type"] == "notify":
            screen = (
                (s.get("title") or "Notifications")
                + " — "
                + " / ".join(f"{n['app']}: {n['text']}" for n in s["notes"])
            )
        elif s["type"] == "step":
            screen = (
                s["title"]
                + (f" — {s['text']}" if s.get("text") else "")
                + (f" ✓ {s['result']}" if s.get("result") else "")
            )
        elif s["type"] == "take":
            screen = (f"Not: {s['before']} → " if s.get("before") else "") + s["text"]
        elif s["type"] == "meme":
            screen = f"{s['top']} / {s['bottom']}"
        elif s["type"] == "client":
            screen = (
                f"{s['name']}"
                + (f" ({s['field']})" if s.get("field") else "")
                + f" — {s['text']}"
                + (" [example]" if s.get("example") else "")
            )
        elif s["type"] == "metrics" and "stats" in s:  # SaaS Hub
            screen = (
                (s.get("text") or "Results")
                + " — "
                + ", ".join(
                    f"{m['label']}: {m.get('prefix', '')}{m['value']}{m.get('suffix', '')}"
                    + (f" ({m['note']})" if m.get("note") else "")
                    for m in s["stats"]
                )
            )
        elif s["type"] == "metrics":
            screen = (
                (s.get("title") or "Results")
                + " — "
                + ", ".join(
                    f"{m['label']}: {m.get('prefix', '')}{m['before']}{m.get('suffix', '')} → {m.get('prefix', '')}{m['after']}{m.get('suffix', '')}"
                    for m in s["rows"]
                )
            )
        elif s["type"] == "timeline":
            screen = (
                (s.get("title") or "Timeline")
                + " — "
                + " → ".join(f"{x['when']}: {x['text']}" for x in s["steps"])
            )
        elif s["type"] == "qa":
            screen = f"Q: {s['q']} — A: {s['a']}"
        elif s["type"] == "bars":
            screen = (
                (s.get("title") or "Data")
                + " — "
                + ", ".join(
                    f"{x['label']} {s.get('prefix', '')}{x['value']}{s.get('suffix', '')}"
                    for x in s["data"]
                )
                + (f" (source: {s['source']})" if s.get("source") else "")
            )
        elif s["type"] == "donut":
            screen = f"{s['value']}% {s['label']}" + (
                f" (source: {s['source']})" if s.get("source") else ""
            )
        elif s["type"] in ("rank", "tip"):
            screen = s["title"] + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "choice":
            screen = f"{s['question']} — A: {s['left']['name']} vs B: {s['right']['name']}" + (
                f" ({s['percent']}% A)" if s.get("percent") else ""
            )
        elif s["type"] == "reviews":
            screen = (f"★ {s['rating']} " if s.get("rating") else "") + " / ".join(
                f"“{c['text']}” — {c['name']}" for c in s["cards"]
            )
        elif s["type"] == "logos":
            screen = (s.get("title") or "Trusted by") + " — " + ", ".join(s["names"])
        elif s["type"] == "save":
            screen = s["text"] + (f" [{s['button']}]" if s.get("button") else "")
        elif s["type"] == "platform":
            screen = s["text"] + (f" — screenshot {s['shot']}" if s.get("shot") else "")
        elif s["type"] == "orbit":
            screen = (
                f"{s['center']['title']} — "
                + ", ".join(x["label"] for x in s["tags"])
                + (f" · {s['text']}" if s.get("text") else "")
            )
        elif s["type"] == "chaos":
            screen = (
                s["text"]
                + " — "
                + (
                    " / ".join(f"{x['app']}: {x['title']}" for x in s["cards"])
                    if s.get("cards")
                    else ", ".join(s.get("tools") or [])
                )
            )
        elif s["type"] == "hub":  # SaaS Hub
            screen = (
                s["text"]
                + " — "
                + ", ".join(
                    a["name"] + (f" ({a['desc']})" if a.get("desc") else "")
                    for a in s.get("apps") or []
                )
            )
        elif s["type"] == "trigger":  # SaaS Hub
            screen = (
                s["text"]
                + f" — when {s['event']['label']}: "
                + ", ".join(a["label"] for a in s.get("actions") or [])
            )
        elif s["type"] == "phones":
            screen = " ".join(s["words"]) + (
                f" — screenshots {', '.join(str(x) for x in s['shots'])}" if s.get("shots") else ""
            )
        elif s["type"] == "gallery":
            screen = (
                f"{s['title']} — "
                + " / ".join(x["title"] for x in s["cards"])
                + (f" · {s['text']}" if s.get("text") else "")
            )
        elif s["type"] == "pair":
            screen = f"{s['left']} [{s.get('label') or 'card'}] {s['right']}"
        elif s["type"] == "launch":
            screen = (
                f"Introducing {s['name']}"
                + (f" — {s['text']}" if s.get("text") else "")
                + (f" [{s['badge']}]" if s.get("badge") else "")
            )
        elif s["type"] == "canvas":
            screen = (
                " / ".join(
                    str(L.get("text") or L.get("title") or "")
                    for L in s["layers"]
                    if L.get("text") or L.get("title")
                )
                or "Designed scene"
            )
        elif s["type"] == "send":
            screen = (
                f"{s['from']['label'] or s['from']['device']} → {s['to']['label'] or s['to']['device']}"
                + (f" — {s['text']}" if s.get("text") else "")
            )
        elif s["type"] == "address":
            screen = f"{s['from']} → {s['to']}" + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "lookup":
            screen = f"{s['server']}: “{s['question']}” → {s['answer']}"
        elif s["type"] == "hops":
            screen = " → ".join(n["label"] or n["device"] for n in s["nodes"]) + (
                f" — {s['text']}" if s.get("text") else ""
            )
        elif s["type"] == "assemble":
            screen = (s.get("label") or s["device"]) + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "tasks":
            screen = (
                (f"{s['title']} — " if s.get("title") else "")
                + ", ".join(x["text"] for x in s["items"])
                + (f" [{s['sticker']}]" if s.get("sticker") else "")
            )
        elif s["type"] == "fanout":
            screen = (
                (s.get("title") or "One → many")
                + " — "
                + " / ".join(
                    o["kind"] + (f" {o['value']}" if o.get("value") else "") for o in s["outputs"]
                )
                + ("".join(f" ✓ {c}" for c in s.get("checks") or []))
            )
        elif s["type"] == "word":
            screen = (
                f"“{s['word']}” — "
                + (s.get("title") or "card")
                + (": " + ", ".join(x["name"] for x in s["rows"]) if s.get("rows") else "")
            )
        elif s["type"] == "field":
            screen = (
                (s.get("label") or "Field")
                + f": {s['value']}"
                + (f" → [{s['button']}]" if s.get("button") else "")
            )
        elif s["type"] == "done":
            screen = f"✓ {s['text']}"
        elif s["type"] == "button":
            screen = (
                (s.get("title") or "Card")
                + f" → click “{s['button']}”"
                + (f" ✓ {s['result']}" if s.get("result") else "")
            )
        elif s["type"] == "form":
            screen = (
                (s.get("title") or "Form")
                + " — "
                + ", ".join(f"{f['label']}: {f['value']}" for f in s["fields"])
                + (f" · toggle {s['toggle']}" if s.get("toggle") else "")
            )
        elif s["type"] == "stack":
            screen = (
                "Screens "
                + ", ".join(str(x) for x in s["shots"])
                + (" — " + " / ".join(s["words"]) if s.get("words") else "")
            )
        elif s["type"] == "apps":
            screen = (s.get("title") or "Apps") + " — " + ", ".join(a["name"] for a in s["apps"])
        elif s["type"] == "roll":
            screen = (
                f"{s.get('lead', '')} "
                + " / ".join(s["words"])
                + (f" — {s['text']}" if s.get("text") else "")
            )
        elif s["type"] == "table":
            screen = (
                (s.get("title") or "Table")
                + " — "
                + " | ".join(s["columns"])
                + f" ({len(s['rows'])} rows)"
            )
        elif s["type"] == "board":
            screen = (
                (s.get("title") or "Board") + " — " + " → ".join(c["name"] for c in s["columns"])
            )
        elif s["type"] == "climb":
            screen = (
                s["title"]
                + (f" — {s['text']}" if s.get("text") else "")
                + (f" [step: {s['word']}]" if s.get("word") else "")
            )
        elif s["type"] == "grow":
            screen = s["title"] + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "mirror":
            screen = (
                f"{s['title']} — " if s.get("title") else ""
            ) + f"Old me: {s['before']} → New me: {s['after']}"
        elif s["type"] == "summit":
            screen = f"⛰ {s['text']}" + (f" — {s['author']}" if s.get("author") else "")
        elif s["type"] == "whiteboard":
            last = len(s["parts"]) - 1
            sign = lambda i, x: (
                (" = " if i == last else f" {x.get('op', '+')} ") if s["kind"] == "sum" else " / "
            )  # noqa: E731
            body = "".join(
                (sign(i, x) if i else "")
                + x["label"]
                + (f" {x['value']}" if x.get("value") else "")
                for i, x in enumerate(s["parts"])
            )
            screen = f"{s.get('title', '')} — {s['kind']}: {body}"
        elif s["type"] in ("tale", "tally"):
            who = {0: "both", 1: "#1", 2: "#2"}[s.get("who", 0)]
            acts = ", ".join(
                f"#{i + 1} {a['pose']}/{a['mood']}"
                + (f" with {a['item']}" if a.get("item", "none") != "none" else "")
                for i, a in enumerate(s["acts"])
                if s.get("who", 0) in (0, i + 1)
            )
            screen = f"({s['place']}, {s['time']}; {who}: {acts}) {s.get('title', '')}"
            if s["type"] == "tally":
                screen += (
                    f" — {s['label']}: "
                    + (
                        f"{s.get('prefix', '')}{s['start']}{s.get('suffix', '')} → "
                        if s.get("start")
                        else ""
                    )
                    + f"{s.get('prefix', '')}{s['value']}{s.get('suffix', '')}"
                )
            if s.get("icon"):
                screen += f" [{s['icon']}]"
            if s.get("guest"):
                screen += f" + {s['guest']['look']} {s['guest']['name']}".rstrip()
        elif s["type"] == "agenda":
            screen = (f"{s['title']}: " if s.get("title") else "") + "; ".join(s["entries"])
        elif s["type"] == "keypoints":
            screen = (f"{s['title']}: " if s.get("title") else "") + "; ".join(
                f"{b['title']} — {b['text']}" for b in s["blocks"]
            )
        elif s["type"] == "bignum":
            screen = f"{s.get('prefix', '')}{s['value']}{s.get('suffix', '')} {s['label']}" + (
                f" — {s['text']}" if s.get("text") else ""
            )
        elif s["type"] == "barchart":
            screen = (f"{s['title']}: " if s.get("title") else "") + ", ".join(
                f"{d['label']} {d['value']}{s.get('suffix', '')}" for d in s["data"]
            )
        elif s["type"] == "twocol":
            screen = (f"{s['title']}: " if s.get("title") else "") + " | ".join(
                f"{c['label']}: " + "; ".join(c["items"]) for c in s["cols"]
            )
        elif s["type"] == "pullquote":
            screen = f"“{s['text']}”" + (f" — {s['author']}" if s.get("author") else "")
        elif s["type"] == "picture":
            screen = f"(a picture) {s['title']}" + (f" — {s['text']}" if s.get("text") else "")
        elif s["type"] == "roadmap":
            screen = (f"{s['title']}: " if s.get("title") else "") + " → ".join(
                st["title"] for st in s["stages"]
            )
        elif s["type"] == "overload":
            screen = (f"{s['text']}: " if s.get("text") else "") + "; ".join(s["tasks"])
        elif s["type"] == "crew":
            screen = (f"{s['text']}: " if s.get("text") else "") + "; ".join(
                f"{a['role']} — {a['task']}" for a in s["agents"]
            )
        elif s["type"] == "pipeline":
            screen = (
                (f"{s['text']}: " if s.get("text") else "")
                + f"{s['input']['label']} → "
                + ", ".join(o["label"] for o in s["outputs"])
            )
        elif s["type"] == "approve":
            screen = (
                (f"{s['text']}: " if s.get("text") else "")
                + f"(phone, post: {s['post']}) [{s.get('button') or '✓'}]"
                + (f" → {', '.join(s['channels'])}" if s.get("channels") else "")
            )
        elif s["type"] == "gains":
            screen = (f"{s['text']}: " if s.get("text") else "") + "; ".join(
                f"{m.get('prefix', '')}{m['value']}{m.get('suffix', '')} {m['label']}"
                for m in s["metrics"]
            )
        elif s["type"] == "plans":
            screen = (f"{s['text']}: " if s.get("text") else "") + "; ".join(
                f"{x['name']}" + (f" {x['price']}" if x.get("price") else "") for x in s["tiers"]
            )
        elif s["type"] == "wide":
            screen = (
                f"({s['place']}, {s['time']}; {s['pose']}"
                + (f" with {s['item']}" if s.get("item", "none") != "none" else "")
                + f", {s.get('crowd', 0)} people around)"
                + (f" {s['title']}" if s.get("title") else "")
            )
        elif s["type"] == "closeup":
            screen = f"(close-up: their face and the {s['object']})" + (
                f" {s['text']}" if s.get("text") else ""
            )
        elif s["type"] == "fact":
            screen = (
                (f"{s['title']}: " if s.get("title") else "")
                + (
                    f"{s.get('prefix', '')}{s['value']}{s.get('suffix', '')} — "
                    if s.get("value")
                    else ""
                )
                + s["text"]
            )
        elif s["type"] == "shops":
            screen = (f"{s['title']} — " if s.get("title") else "") + " vs ".join(
                f"{x['label']} ({x['tone']})" for x in s["sides"]
            )
        elif s["type"] == "crowd":
            screen = (s.get("title") or "People walk in") + (
                f" — {s['label']}: "
                + (
                    f"{s.get('prefix', '')}{s['start']}{s.get('suffix', '')} → "
                    if s.get("start")
                    else ""
                )
                + f"{s.get('prefix', '')}{s['value']}{s.get('suffix', '')}"
                if s.get("value")
                else ""
            )
        elif s["type"] == "chatter":
            screen = (f"{s['title']} — " if s.get("title") else "") + " / ".join(
                f"“{m['text']}”" for m in s["messages"]
            )
        elif s["type"] == "line":
            screen = f"#{s.get('speaker', 1)} ({s['mood']}{', thinking' if s.get('think') else ''}; {s['place']}, {s['time']}) “{s['text']}”"
        elif s["type"] == "fork":
            screen = (f"{s['title']} — " if s.get("title") else "") + " vs ".join(
                f"{x['label']} ({x['tone']}, {x['pose']})" for x in s["sides"]
            )
        elif s["type"] == "moral":
            screen = (f"{s['title']}: " if s.get("title") else "") + s["text"]
        elif s["type"] == "example":
            screen = (
                (s.get("title") or "Example")
                + " — "
                + " | ".join(
                    f"{x['name']}: {x['text']}" + (f" ({x['value']})" if x.get("value") else "")
                    for x in s["people"]
                )
            )
        elif s["type"] in ("talk", "note"):
            who = f"#{s.get('who', 1)} ({s.get('mood', '')})"
            body = (
                (f"{s.get('title', '')}: " + " / ".join(s["checks"]))
                if s["type"] == "note"
                else ("💭 " if s.get("think") else "") + s.get("text", "")
            )
            item = f" [{s['item'].get('label') or s['item'].get('icon')}]" if s.get("item") else ""
            screen = f"{who} {body}{item}"
        elif s["type"] == "collage":
            screen = (
                (s.get("word") or "Collage")
                + " — "
                + " / ".join(x["label"] for x in s.get("tiles") or [])
                + (f" [{len(s['images'])} photos]" if s.get("images") else "")
            )
        elif s["type"] == "shot":  # Picture story: its words on the picture, and the picture
            screen = (s.get("title") or "") + (f" ✎ {s['draw']}" if s.get("draw") else "")
        elif s["type"] == "acronym":  # Cybersecurity's long-script scenes
            screen = (
                f"{s['term']} = "
                + " ".join(s.get("expand") or [])
                + (f" — {s['text']}" if s.get("text") else "")
            )
        elif s["type"] == "guard":
            screen = "(24/7 clock, analysts) " + (s.get("title") or "")
        elif s["type"] == "sectors":
            screen = (f"{s['title']} — " if s.get("title") else "") + ", ".join(
                x["label"] for x in s["sectors"]
            )
        elif s["type"] == "breach":
            screen = (
                f"(night{', ' + s['time'] if s.get('time') else ''}: a worker asleep, the hacker takes the screen) "
                + (s.get("title") or "")
                + (f" — {s['text']}" if s.get("text") else "")
            )
        elif s["type"] == "ransom":
            screen = (
                "(files encrypted) "
                + (f"{s['title']} — " if s.get("title") else "")
                + ", ".join(x["label"] for x in s.get("losses") or [])
            )
        elif s["type"] == "moment":  # Life story
            p = s.get("prop") or {}
            thing = ""
            if p:
                bits = [
                    p.get("label") or "",
                    p.get("amount") or "",
                    "PAID" if p.get("paid") else "",
                    f"{p['done']} days crossed" if p.get("kind") == "calendar" else "",
                ]
                bits += [
                    f"{x['text']} {x.get('amount') or ''}".strip() for x in p.get("lines") or []
                ]
                thing = f" [{p['kind']}: {', '.join(b for b in bits if b)}]"
            screen = (
                f"(place {s.get('place', 1)}, {s.get('pose', 'stand')}, {s.get('mood', 'happy')}) "
                + (s.get("text") or "")
                + thing
            )
        elif s["type"] == "ledger":
            screen = (
                (f"{s['title']} — " if s.get("title") else "")
                + "; ".join(f"{x['label']} {x['amount']}".strip() for x in s["lines"])
                + (f" = {s['total']['label']} {s['total']['amount']}" if s.get("total") else "")
            )
        elif s["type"] == "takeaway":
            screen = (f"{s['title']} — " if s.get("title") else "") + " / ".join(s["checks"])
        elif s["type"] == "visit":
            screen = (
                f"(in place {s.get('place', 1)}, {s.get('pose', 'stand')}, {s.get('mood', 'happy')}) "
                + (s.get("text") or "")
                + (f" 💭 {s['icon']}" if s.get("icon") else "")
            )
        elif s["type"] == "pedestal":
            screen = (
                s["title"] + " — " + " | ".join(x for x in (s.get("left"), s.get("right")) if x)
            )
        elif s["type"] in ("react", "punch") or (s["type"] == "hook" and "moods" in s):
            pic = (
                f" ✎ {s['draw']}"
                if s.get("draw")
                else f" [screenshot {s['shot']}]"
                if s.get("shot")
                else f" [{s['product']}]"
                if s.get("product")
                else ""
            )
            screen = (
                s["text"]
                + f" — {', '.join(s.get('moods') or [])}"
                + (f" 💬 {s['bubble']}" if s.get("bubble") else "")
                + pic
            )
        elif s["type"] == "doodle":
            screen = (
                s["title"]
                + (f" — {s['text']}" if s.get("text") else "")
                + (f" ✎ {s['draw']}" if s.get("draw") else "")
            )
        elif s["type"] == "offer":
            price = f" {s['price']}{s.get('period', '')}" if s.get("price") else ""
            screen = f"{s.get('plan', '')}{price} — " + ", ".join(s["features"])
        else:
            screen = s.get("text", "")
        if s.get("hero"):  # 3D · Street: the thing floating in front of the shop
            screen += f" [3D: {s.get('product') or 'product photo' if s['hero'] == 'product' else s['hero']}]"
        out.append((f"[{s['type']}] {screen}", s.get("say", "")))
    return out


def _scene_summary(s: dict) -> str:
    """A scene's words in one short line, whatever its type (the live
    storyboard's rows) — the on-screen words, else what's said."""
    t = s.get("type")
    side = lambda p: (p or {}).get("name") or (p or {}).get("label") or ""  # noqa: E731
    if t == "compare" or t == "split":
        head = s.get("title") or ""
        pair = f"{side(s.get('left'))} vs {side(s.get('right'))}".strip(" vs")
        text = f"{head} — {pair}" if head and pair else head or pair
    elif t == "chart":
        names = " · ".join(x.get("name", "") for x in s.get("series") or [] if x.get("name"))
        text = f"{s.get('title') or ''}" + (f" — {names}" if names else "")
    elif t in ("stat", "result"):
        text = (
            f"{s.get('prefix', '')}{s.get('value', '')}{s.get('suffix', '')} {s.get('label', '')}"
        )
    elif t == "myth":
        text = s.get("myth") or ""
    elif t == "options":
        text = s.get("question") or " / ".join(s.get("options") or [])
    elif t == "customer":
        text = s.get("name", "") + (f" — {s['text']}" if s.get("text") else "")
    elif t == "beforeafter":
        text = f"{s.get('before', '')} → {s.get('after', '')}"
    elif t == "checklist":
        text = s.get("title") or " / ".join(s.get("checks") or [])
    elif t == "recap":
        text = s.get("title") or " · ".join(x.get("title", "") for x in s.get("points") or [])
    elif t == "flow":
        text = s.get("title") or " → ".join(n.get("label", "") for n in s.get("nodes") or [])
    elif t == "dashboard":
        text = s.get("title") or " · ".join(m.get("label", "") for m in s.get("metrics") or [])
    elif t == "news":
        text = s.get("headline") or ""
    elif t == "notify":
        text = s.get("title") or " / ".join(n.get("text", "") for n in s.get("notes") or [])
    elif t == "offer":
        text = " ".join(x for x in (s.get("plan"), s.get("price"), s.get("period")) if x)
    elif t == "launch":
        text = s.get("name") or ""
    elif t in ("rank", "tip"):
        text = s.get("title") or ""
    elif t == "take":
        text = s.get("text") or ""
    elif t == "meme":
        text = f"{s.get('top') or ''} / {s.get('bottom') or ''}"
    elif t == "client":
        text = s.get("name") or ""
    elif t in ("metrics", "timeline", "bars"):
        text = s.get("title") or ""
    elif t == "qa":
        text = s.get("q") or ""
    elif t == "donut":
        text = f"{s.get('value', '')}% {s.get('label', '')}"
    elif t == "choice":
        text = s.get("question") or ""
    elif t == "reviews":
        text = s.get("title") or (f"★ {s['rating']}" if s.get("rating") else "Reviews")
    elif t == "logos":
        text = s.get("title") or ", ".join(s.get("names") or [])
    elif t == "save":
        text = s.get("text") or ""
    elif t in ("platform", "chaos"):
        text = s.get("text") or ""
    elif t == "orbit":
        text = (s.get("center") or {}).get("title") or s.get("text") or ""
    elif t == "phones":
        text = " ".join(s.get("words") or [])
    elif t == "gallery":
        text = s.get("text") or s.get("title") or ""
    elif t == "pair":
        text = f"{s.get('left', '')} · {s.get('right', '')}"
    elif t == "word":
        text = s.get("word") or s.get("title") or ""
    elif t == "canvas":
        text = " ".join(str(L.get("text") or L.get("title") or "") for L in s.get("layers") or [])
    elif t in ("send", "address", "hops", "assemble"):
        text = s.get("text") or s.get("label") or ""
    elif t == "lookup":
        text = f"{s.get('question', '')} {s.get('answer', '')}"
    elif t == "tasks":
        text = s.get("title") or " · ".join(x.get("text", "") for x in s.get("items") or [])
    elif t == "fanout":
        text = s.get("title") or " / ".join(o.get("kind", "") for o in s.get("outputs") or [])
    elif t == "field":
        text = f"{s.get('label') or ''} {s.get('value') or ''}".strip()
    elif t == "button":
        text = s.get("title") or s.get("button") or ""
    elif t == "form":
        text = s.get("title") or " · ".join(f.get("label", "") for f in s.get("fields") or [])
    elif t == "stack":
        text = " / ".join(s.get("words") or []) or "Screens"
    elif t == "apps":
        text = s.get("title") or " · ".join(a.get("name", "") for a in s.get("apps") or [])
    elif t == "roll":
        text = f"{s.get('lead', '')} " + " / ".join(s.get("words") or [])
    elif t in ("table", "board", "doodle", "whiteboard", "example", "climb", "grow", "mirror"):
        text = s.get("title") or ""
    else:
        text = s.get("text") or s.get("title") or s.get("label") or ""
    text = " ".join(str(text).split()) or (s.get("say") or "")
    return text.replace("[", "").replace("]", "").replace("⟦", "").replace("⟧", "")[:120]


def _board(script: dict) -> list[dict]:
    """The storyboard as the page shows it: each scene's type and its words —
    the one-line summary, and (opened on the page) everything on screen and
    the voice line."""
    rows = []
    for s in script["scenes"]:
        screen = script_lines({"scenes": [s]})[0][0].split("] ", 1)[-1]
        rows.append(
            {
                "type": s["type"],
                "text": _scene_summary(s),
                "screen": re.sub(r"[\[\]⟦⟧]", "", screen)[:400],
                "say": s.get("say") or "",
                "voice": "",
                "seconds": 0,
            }
        )
    return rows


if TYPE_CHECKING:  # loaded after this module — app/video/motion/__init__.py binds these (_link)
    from app.video.motion.props import default_seconds
    from app.video.motion.jobs import _progress
