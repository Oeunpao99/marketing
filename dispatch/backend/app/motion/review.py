"""AI design's self-check (a quick preview, the vision model fixes what looks off) and the scene sketches for the making card.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

import base64
import io
import json
import secrets
import subprocess
import tempfile
import time
from PIL import Image
from app.config import get_settings
from app.models import Brand
from fastapi import HTTPException, Response
from pathlib import Path

from app.motion.common import TRANSITION_S, _line, log, sketch_router
from app.motion.templates.canvas import _clean_canvas, apply_theme, asks_status, clean_theme
from app.motion.props import build_props, default_seconds
from app.motion.jobs import Stopped, _progress, _report
from app.motion.rendering import render


# ── AI design's self-check (stage 2) ───────────────────────────────────────
DESIGN_REVIEW_PROMPT = (
    "You are the art director checking an animated video's DESIGN before it is rendered for the "
    "client. The image is a contact sheet: each scene at its settled moment, numbered 1..N in the "
    "top-left corner. You also get the design (each scene's palette, background and layers; "
    "x/y = a layer's centre in % of the frame).\n"
    "Look for real problems only: text overlapping text or other elements, text or elements cut "
    "off at the frame's edge, text too small or low contrast to read, a crowded or cluttered "
    "scene, an empty or unbalanced one, anything in the bottom 15 % of the frame (the subtitles go "
    "there), a reveal that looks weak.\n"
    "Also judge the film as ONE design: a scene that looks out of family (crowded, a different "
    "layout logic, an odd element) is a real problem — make it rhyme with the others. Colours "
    'and backgrounds come from the film\'s theme; a scene may only switch "tone" (dark | light).\n'
    "Fix only what is wrong — move (x, y), resize (size, w, h), reorder (z), remove a "
    "layer (fewer is often the fix), or add a small accent. KEEP the wording, the story, the scene order and the brand.\n"
    'Return ONLY JSON: {"fixes": [{"scene": <its number>, "pal"?: {...}, "bg"?: {...}, '
    '"layers": [<the scene\'s FULL corrected layer list>]}], "note": <max 12 words>}. '
    '"fixes": [] when every scene is fine.\n'
    "You also get THE CHECKLIST — every ask in the client's brief — and the asks NOT DELIVERED "
    "yet. Each missing ask is a real problem: deliver it in the scene where it belongs (change a "
    'layer or add one; quoted text character for character; tag the layer "req": [its id]). '
    'Keep every layer\'s "req" tags.'
)


def _small(im) -> bytes:
    """A frame as a JPEG at the preview's full size — for the live making card."""
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=86)
    return buf.getvalue()


_SKETCHES: dict[str, tuple[float, list]] = {}


def _keep_sketches(frames: list) -> list:
    """The pictures kept behind a new unguessable code; their URLs (None where there's none)."""
    now = time.time()
    for k, (at, _) in list(_SKETCHES.items()):
        if now - at > 3 * 3600:
            _SKETCHES.pop(k, None)
    code = secrets.token_urlsafe(18)
    _SKETCHES[code] = (now, frames)
    return [f"/api/ai/motion/sketch/{code}/{i}.jpg" if f else None for i, f in enumerate(frames)]


_PICTURE_CODES: dict[int, str] = {}  # a video being made → its painted pictures' code


def _keep_picture(job_id: int, n: int, count: int, jpeg: bytes) -> str:
    """One painted scene picture kept for the making card (one code per video,
    filled in as the pictures arrive) — its URL."""
    code = _PICTURE_CODES.get(job_id)
    if not code or code not in _SKETCHES:
        for j, c in list(_PICTURE_CODES.items()):  # the codes of pictures already cleared
            if c not in _SKETCHES:
                _PICTURE_CODES.pop(j, None)
        code = secrets.token_urlsafe(18)
        _SKETCHES[code] = (time.time(), [None] * count)
        _PICTURE_CODES[job_id] = code
    frames = _SKETCHES[code][1]
    if 0 <= n < len(frames):
        frames[n] = jpeg
    return f"/api/ai/motion/sketch/{code}/{n}.jpg"


def _thumb(uri: str) -> bytes | None:
    """A painted picture (a data: URI) as a small JPEG for the card — None if it can't be read."""
    try:
        im = Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1])))
        if im.mode in ("RGBA", "LA", "P"):  # Doodle's ink sketches: on white paper
            im = im.convert("RGBA")
            paper = Image.new("RGB", im.size, (255, 255, 255))
            paper.paste(im, mask=im.getchannel("A"))
            im = paper
        im = im.convert("RGB")
        im.thumbnail((360, 360))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=80)
        return buf.getvalue()
    except Exception:  # noqa: BLE001 — the row just shows no picture
        return None


@sketch_router.get("/sketch/{code}/{n}.jpg", include_in_schema=False)
def sketch(code: str, n: int):
    """One scene picture of a video being made (see _keep_sketches)."""
    frames = (_SKETCHES.get(code) or (0, []))[1]
    if not (0 <= n < len(frames)) or not frames[n]:
        raise HTTPException(404, "Not here any more.")
    return Response(
        content=frames[n],
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )


def _sheet(mp4: bytes, times: list[float], sketches: list | None = None) -> bytes | None:
    """The preview's frame at each time, side by side with its number — one
    JPEG. ``sketches`` (a list) gets each scene's frame as a small picture
    (a data URI, None where there's none) — the making card shows them live."""
    import imageio_ffmpeg
    from PIL import Image, ImageDraw

    frames = []
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "p.mp4"
        src.write_bytes(mp4)
        for i, t in enumerate(times):
            out = Path(tmp) / f"f{i}.jpg"
            subprocess.run(
                [
                    imageio_ffmpeg.get_ffmpeg_exe(),
                    "-y",
                    "-loglevel",
                    "error",
                    "-ss",
                    f"{t:.2f}",
                    "-i",
                    str(src),
                    "-frames:v",
                    "1",
                    "-q:v",
                    "4",
                    str(out),
                ],
                capture_output=True,
                timeout=60,
            )
            if out.exists():
                frames.append(Image.open(out).convert("RGB"))
            if sketches is not None:
                sketches.append(_small(frames[-1]) if out.exists() else None)
    if not frames:
        return None
    w, h = frames[0].size
    cols = 3 if w > h else 4
    rows = -(-len(frames) // cols)
    sheet = Image.new("RGB", (cols * (w + 12) + 12, rows * (h + 12) + 12), "white")
    draw = ImageDraw.Draw(sheet)
    for i, im in enumerate(frames):
        x, y = 12 + (i % cols) * (w + 12), 12 + (i // cols) * (h + 12)
        sheet.paste(im.resize((w, h)), (x, y))
        draw.rectangle([x, y, x + 46, y + 34], fill="#E11D48")
        draw.text((x + 14, y + 8), str(i + 1), fill="white")
    buf = io.BytesIO()
    sheet.save(buf, "JPEG", quality=80)
    return buf.getvalue()


def _sketch(props: dict, job_id: int) -> None:
    """Each scene's picture once it has settled, from a quick small silent
    preview — the making card's Animate step shows them. Best effort: the
    video never waits on a failure here."""
    try:
        mp4 = render(props, None, preview=True)
        times, start = [], 0.0
        for sc in props["scenes"]:
            dur = sc.get("seconds") or default_seconds(sc)
            times.append(start + min(dur - 0.3, 1.8))  # the templates have settled by then
            start += dur - TRANSITION_S
        sketches: list = []
        _sheet(mp4, times, sketches)
        if any(sketches) and job_id in _progress:
            _report(job_id, sketches=_keep_sketches(sketches))
    except Exception as exc:  # noqa: BLE001 — pictures for the card only
        log.warning("motion %s: no scene pictures for the card: %s", job_id, exc)


def review_design(
    brand: Brand, script: dict, logo: str | None, khmer: bool, job_id: int | None
) -> dict:
    """AI design (style "canvas"), stage 2: a quick small preview of the
    designed scenes is rendered, each scene's settled frame goes on a contact
    sheet, and the AI looks at it and fixes what looks off — overlaps, text off
    the frame, crowding, contrast. The fixes pass _clean_canvas like any
    design. Anything going wrong here just keeps the design as it was: the
    check never blocks a video."""
    from app.content_ai import ContentAIError, _chat

    scenes = script.get("scenes") or []
    if script.get("style") != "canvas" or not scenes:
        return script
    _report(job_id, stage="check")
    asks = script.get("asks") or []
    if all(sc.get("design") for sc in scenes):  # placed by layouts: nothing to fix by eye
        status = asks_status(script)
        if status:
            _report(
                job_id,
                design_note=f"Checked the design · {sum(1 for a in status if a['ok'])} of your {len(status)} asks in it",
                asks=status,
            )
        return script

    def done(fixed: int) -> dict:
        status = asks_status(script)
        got = sum(1 for a in status if a["ok"])
        note = f"{fixed} scene{'s' if fixed != 1 else ''} improved" if fixed else "it looks right"
        if status:
            note += f" · {got} of your {len(status)} asks in it"
        _report(job_id, design_note="Checked the design · " + note, asks=status)
        return script

    try:
        props = build_props(brand, script, logo, khmer)
        mp4 = render(props, job_id, preview=True)
        # when each scene has settled: its last layer is in, plus a second
        times, start = [], 0.0
        for sc in props["scenes"]:
            dur = sc.get("seconds") or default_seconds(sc)
            last = max([float(L.get("at") or 0) for L in sc.get("layers") or []] + [0.0]) + float(
                sc.get("pause") or 0
            )
            times.append(start + min(dur - 0.3, last + 1.2))
            start += dur - TRANSITION_S
        sketches: list = []
        sheet = _sheet(mp4, times, sketches)
        if any(sketches):  # the card swaps them in, scene by scene, while the video is made
            _report(job_id, sketches=_keep_sketches(sketches))
        if not sheet:
            return done(0)
        design = [
            {
                "scene": i + 1,
                "pal": sc.get("pal"),
                "bg": sc.get("bg"),
                "layers": [
                    {k: ("<picture>" if k == "src" else v) for k, v in L.items()}
                    for L in sc.get("layers") or []
                ],
            }
            for i, sc in enumerate(scenes)
        ]
        missing = [a for a, st in zip(asks, asks_status(script)) if not st["ok"]]
        out = _chat(
            [
                {"role": "system", "content": DESIGN_REVIEW_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "THE DESIGN:\n"
                            + json.dumps(design, ensure_ascii=False)
                            + "\n\nTHE CHECKLIST:\n"
                            + json.dumps(asks, ensure_ascii=False)
                            + "\n\nNOT DELIVERED YET:\n"
                            + (json.dumps(missing, ensure_ascii=False) if missing else "(none)"),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": "data:image/jpeg;base64," + base64.b64encode(sheet).decode()
                            },
                        },
                    ],
                },
            ],
            get_settings().azure_openai_vision_deployment or get_settings().azure_openai_deployment,
            max_tokens=12000,
            effort="low",
        )
    except Stopped:
        raise
    except (ContentAIError, RuntimeError, OSError, subprocess.SubprocessError, ValueError) as exc:
        log.warning("motion %s: design check skipped: %s", job_id, exc)
        return done(0)
    fixed = 0
    for fx in (out.get("fixes") or [])[: len(scenes)]:
        try:
            n = int(fx.get("scene")) - 1
        except (TypeError, ValueError):
            continue
        if not (0 <= n < len(scenes)) or not isinstance(fx.get("layers"), list):
            continue
        old = scenes[n]
        pictures = [L.get("src") for L in old.get("layers") or [] if L.get("src")]
        moving = {
            L["src"]: L["svg"] for L in old.get("layers") or [] if L.get("src") and L.get("svg")
        }  # vector pictures keep their moves
        cand = {
            "type": "canvas",
            "seconds": old.get("seconds"),
            "pause": old.get("pause"),
            "tone": fx.get("tone") or old.get("tone"),
            "req": old.get("req"),
            "pal": fx.get("pal") or old.get("pal"),
            "bg": fx.get("bg") or old.get("bg"),
            "layers": fx["layers"],
        }
        # the pictures were sent as "<picture>": they keep the brand kit's own
        for L in cand["layers"]:
            if isinstance(L, dict) and L.get("src") == "<picture>":
                L["src"] = pictures.pop(0) if pictures else None
        clean = _clean_canvas(cand, old.get("say") or "")
        if clean:
            for L in clean.get("layers") or []:
                if L.get("src") in moving:
                    L["svg"] = moving[L["src"]]
            scenes[n] = apply_theme(clean, script.get("theme") or clean_theme({}))
            fixed += 1
    log.info(
        "motion %s: design check fixed %s scene(s) — %s", job_id, fixed, _line(out.get("note"), 80)
    )
    return done(fixed)
