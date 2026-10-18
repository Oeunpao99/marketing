"""The "Doodle notes" template's drawings (motion/src/doodle.jsx): one
hand-drawn sketch per scene — black ink on white, like a Khmer self-help
Reel — drawn by the image model from the scene's ``draw`` (English), then
made transparent here so the grid paper shows through. Never any words in the
picture (the image model garbles Khmer — app/text_overlay.py); the headline is
real text in the video.

A drawing that fails (no credit, image service down) is simply left out — the
template draws the scene's icon in ink instead.
"""

import base64
import io
import logging
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageOps

from app import billing
from app.config import get_settings

log = logging.getLogger(__name__)

STYLE = (
    "A simple hand-drawn doodle illustration in black ink on a plain pure white background, "
    "like a quick pen sketch in a notebook: loose confident black outlines, a little cross-hatching "
    "and a few short motion / emotion strokes around the subject, NO colour, NO grey fill, NO "
    "shading gradients, NO background scene, NO frame or border, NO paper texture. Cute, slightly "
    "exaggerated cartoon people with round heads and simple faces that show the feeling clearly. "
    "One centred subject with lots of white space around it. ABSOLUTELY NO text, letters, numbers, "
    "words, captions or speech bubbles with writing anywhere in the image.\n\nDraw: "
)
INK = (24, 27, 26)  # the template's ink (doodle.jsx C.ink)
MAX_DRAWINGS = 10
MAX_SIDE = 900


def ink_only(blob: bytes) -> bytes:
    """A black-on-white sketch → ink lines on a transparent PNG, cropped to the
    drawing: dark = opaque, white = clear, so it sits on the grid paper."""
    im = Image.open(io.BytesIO(blob)).convert("L")
    im = ImageOps.autocontrast(im, cutoff=1)
    # paper (≥ ~225) clears completely; the rest gets darker → more opaque
    alpha = im.point(lambda v: 0 if v >= 225 else min(255, int((225 - v) * 255 / 150)))
    box = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    out = Image.new("RGBA", im.size, (*INK, 0))
    out.putalpha(alpha)
    if box:
        pad = 24
        out = out.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
    out.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _one(prompt: str, ws: int | None, user_id: int | None) -> str | None:
    from app import video as video_gen

    if ws:
        try:
            billing.require(ws, billing.IMAGE_HOLD)
        except billing.OutOfCredit:
            return None
    try:
        with video_gen.image_slot():
            _provider, blob, usage = video_gen.generate_image(STYLE + prompt, "1:1")
    except Exception as exc:  # noqa: BLE001 — the scene shows its icon instead
        log.warning("doodle: drawing failed (%s)", str(exc)[:200])
        return None
    billing.charge(
        ws,
        "image",
        billing.image_cost(usage.get("input", 0), usage.get("output", 0)),
        user_id=user_id,
        model=get_settings().azure_openai_image_deployment,
        tokens=usage.get("total", 0),
        note=f"Doodle drawing: {prompt[:150]}",
    )
    try:
        return "data:image/png;base64," + base64.b64encode(ink_only(blob)).decode()
    except Exception:  # noqa: BLE001
        log.exception("doodle: could not clean a drawing")
        return None


PLACE_STYLE = (
    "A flat 2D cartoon background illustration for an animated explainer video, wide shot at eye "
    "level: clean bold black outlines, flat soft colours (cream, warm red, light grey, a little "
    "blue and orange), simple shapes, a slightly sketchy pale-grey city or room in the far "
    "background, a few small sparkles. EMPTY of people and animals. The lower middle of the "
    "picture is open floor with room for two characters to stand. ABSOLUTELY NO text, letters, "
    "numbers, words or logos anywhere — shop signs, boards, labels and screens are left blank.\n\n"
    "The place: "
)


def draw_place(prompt: str, ws: int | None, user_id: int | None) -> str | None:
    """Story · Characters (motion/src/cartoon.jsx): the one place the story
    happens in, as a wide JPEG data URI — or None (the template draws a plain
    room)."""
    from app import video as video_gen

    if ws:
        try:
            billing.require(ws, billing.IMAGE_HOLD)
        except billing.OutOfCredit:
            return None
    try:
        with video_gen.image_slot():
            _provider, blob, usage = video_gen.generate_image(PLACE_STYLE + prompt, "16:9")
    except Exception as exc:  # noqa: BLE001 — a plain room instead
        log.warning("cartoon: place drawing failed (%s)", str(exc)[:200])
        return None
    billing.charge(
        ws,
        "image",
        billing.image_cost(usage.get("input", 0), usage.get("output", 0)),
        user_id=user_id,
        model=get_settings().azure_openai_image_deployment,
        tokens=usage.get("total", 0),
        note=f"Story place: {prompt[:150]}",
    )
    try:
        im = Image.open(io.BytesIO(blob)).convert("RGB")
        im.thumbnail((1920, 1280))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=86, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:  # noqa: BLE001
        log.exception("cartoon: could not read the place drawing")
        return None


def draw_scenes(scenes: list[dict], ws: int | None, user_id: int | None) -> int:
    """Draw every scene that asks for a drawing (``draw``) and has none yet,
    two at a time (the image service rate-limits hard); the picture goes into ``scene["image"]``. Returns how
    many were drawn."""
    todo = [s for s in scenes if s.get("draw") and not s.get("image")][:MAX_DRAWINGS]
    if not todo:
        return 0
    with ThreadPoolExecutor(max_workers=min(2, len(todo))) as pool:
        got = list(pool.map(lambda s: _one(s["draw"], ws, user_id), todo))
    for s, uri in zip(todo, got):
        if uri:
            s["image"] = uri
    return sum(1 for u in got if u)
