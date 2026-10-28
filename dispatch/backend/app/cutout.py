"""A product photo with its background taken away — Product showcase
(motion/src/productfx.jsx) floats the real product over its shape effects.

1. Already see-through (a PNG with clear corners): used as it is.
2. A plain studio background (white, grey, one colour — most product photos):
   removed here, free — filled in from the edges where the colour matches,
   with a soft edge so the product doesn't look cut with scissors.
3. A busy background: the image model takes it away (the product unchanged).
Returns a PNG data URI, or None (the template then shows the photo on a card).
Cut-outs are kept per photo for the server's life — the same product in
several scenes or videos is cut once.
"""

from __future__ import annotations

import base64
import hashlib
import io
import logging
import threading

import numpy as np
from PIL import Image, ImageFilter

log = logging.getLogger(__name__)

MAX_SIDE = 1200
_cache: dict[str, str] = {}
_lock = threading.Lock()

AI_PROMPT = (
    "Cut out the product: keep the product EXACTLY as it is in the photo — its shape, label, "
    "words, logo and colours unchanged, nothing added — and remove everything else, leaving a "
    "fully transparent background. No shadow, no floor, no frame."
)


def _decode(src: str | bytes) -> Image.Image | None:
    try:
        raw = base64.b64decode(src.split(",", 1)[1]) if isinstance(src, str) else src
        im = Image.open(io.BytesIO(raw))
        im.load()
        return im
    except Exception:  # noqa: BLE001
        return None


def _png(im: Image.Image) -> str:
    box = im.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    if box:  # trimmed to the product, with a little air
        pad = round(max(im.size) * 0.03)
        im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def see_through(im: Image.Image) -> bool:
    """A picture whose corners are already clear."""
    if "A" not in im.getbands():
        return False
    a = im.getchannel("A")
    w, h = a.size
    return sum(1 for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)) if a.getpixel(p) < 40) >= 3


def _background(rgb: np.ndarray) -> tuple[np.ndarray, float] | None:
    """The plain background's colour and how far a pixel may differ and still be
    background — None when the border isn't one even colour. The tolerance
    follows the background's own evenness: a white cap on light grey is ~20
    away, and a fixed 34 ate it."""
    edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(edge, axis=0)
    spread = np.abs(edge - bg).max(axis=1)
    if np.mean(spread < 28) < 0.88:
        return None
    return bg, float(np.clip(np.percentile(spread, 90) * 2.5 + 6, 9, 34))


def plain_cut(im: Image.Image) -> Image.Image | None:
    """The product on a plain background, its background made clear — None
    when the background isn't one even colour (or nothing would be left)."""
    rgb = np.asarray(im.convert("RGB"), dtype=np.int16)
    h, w, _ = rgb.shape
    found = _background(rgb)
    if found is None:
        return None
    bg, tol = found
    near = np.abs(rgb - bg).max(axis=2) < tol
    # only background joined to the border: a white label inside the product
    # stays — grown in from the edges a step at a time, all in numpy
    seen = np.zeros((h, w), dtype=bool)
    seen[0], seen[-1], seen[:, 0], seen[:, -1] = near[0], near[-1], near[:, 0], near[:, -1]
    for _ in range(h + w):
        grow = seen.copy()
        grow[1:] |= seen[:-1]
        grow[:-1] |= seen[1:]
        grow[:, 1:] |= seen[:, :-1]
        grow[:, :-1] |= seen[:, 1:]
        grow &= near
        if (grow == seen).all():
            break
        seen = grow
    left = 1 - seen.mean()
    if left < 0.04 or left > 0.97:  # nearly all removed, or nothing was
        return None
    alpha = Image.fromarray(np.where(seen, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def _sharpen(im: Image.Image, small_alpha: Image.Image) -> Image.Image:
    """The background found on the small copy, its edge decided again at full
    size: only pixels near that edge are looked at, by their own colour — a mask
    scaled up 3x smeared the product's outline (and a white cap)."""
    rgb = np.asarray(im.convert("RGB"), dtype=np.int16)
    bg, tol = _background(rgb) or (np.median(rgb.reshape(-1, 3), axis=0), 20.0)
    gone = np.asarray(small_alpha.resize(im.size, Image.NEAREST)) < 128  # background, roughly
    band = np.asarray(Image.fromarray((~gone * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    band &= np.asarray(Image.fromarray((gone * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    near = np.abs(rgb - bg).max(axis=2) < tol
    gone = np.where(band, gone & near, gone)  # at the edge: background only where it really looks it
    alpha = Image.fromarray(np.where(gone, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def _ai_cut(raw: bytes) -> Image.Image | None:
    """The image model's cut-out (a busy background). Charged like any picture."""
    from app import billing
    from app.config import get_settings
    from app.video import _image_file, _post_with_retry

    s = get_settings()
    if not s.image_api_key or not s.image_endpoint:
        return None
    try:
        billing.require_current()
    except Exception:  # noqa: BLE001 — out of credit: the photo on its card
        return None
    key = s.image_api_key
    try:
        resp = _post_with_retry(
            f"{s.image_endpoint.rstrip('/')}/images/edits",
            {"api-key": key, "Authorization": f"Bearer {key}"},
            data={"model": s.azure_openai_image_deployment, "prompt": AI_PROMPT, "size": "1024x1024", "n": "1", "background": "transparent", "output_format": "png"},
            files=[("image", _image_file(raw, 1))],
        )
        if resp.status_code >= 400:
            log.warning("cutout: the image service said %s", resp.status_code)
            return None
        data = resp.json()
        usage = data.get("usage") or {}
        ws, user_id = billing.payer()
        billing.charge(ws, "image", billing.image_cost(usage.get("input_tokens", 0), usage.get("output_tokens", 0)), user_id=user_id, model=s.azure_openai_image_deployment, tokens=usage.get("total_tokens", 0), note="Product showcase: product cut-out")
        im = _decode(base64.b64decode(data["data"][0]["b64_json"]))
        return im if im is not None and see_through(im.convert("RGBA")) else None
    except Exception:  # noqa: BLE001 — the photo on its card instead
        log.exception("cutout: the image model's cut-out failed")
        return None


def screen_kind(src: str) -> str | None:
    """A screenshot of an app or a website — "phone" (tall, about 1:2) or
    "laptop" (wide, 4:3 to 16:9) — which goes into a device frame instead of
    being cut out (a software product has nothing to cut). None: a product photo.
    Told by its shape: product photos are square-ish or 3:4, screens aren't."""
    im = _decode(src) if isinstance(src, str) and src.startswith("data:image/") else None
    if im is None or see_through(im.convert("RGBA")):
        return None
    ratio = im.width / max(1, im.height)
    kind = "phone" if ratio <= 0.62 else "laptop" if ratio >= 1.28 else None
    if kind:
        # a tightly cropped photo of a tall bottle has a phone's shape too. One
        # solid object on a plain background is a product: across each row it's
        # one stretch — a screen on a white page is many (words, buttons, cards)
        small = im.copy()
        small.thumbnail((360, 360))
        alone = plain_cut(small)
        if alone is not None:
            solid = np.asarray(alone.getchannel("A")) > 128
            rows = solid[solid.any(axis=1)]
            stretches = (np.diff(rows.astype(np.int8), axis=1) == 1).sum(axis=1) + rows[:, 0]
            if len(rows) and stretches.mean() < 1.6:
                return None
    return kind


def cut(src: str) -> str | None:
    """``src`` (a data URI) with its background taken away, as a PNG data URI."""
    if not isinstance(src, str) or not src.startswith("data:image/"):
        return None
    key = hashlib.sha1(src.encode()).hexdigest()
    with _lock:
        if key in _cache:
            return _cache[key]
    im = _decode(src)
    if im is None:
        return None
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    if see_through(im.convert("RGBA")):
        out = _png(im.convert("RGBA"))
    else:
        small = im.copy()
        small.thumbnail((360, 360))  # the plain-background check and fill, quick
        done = plain_cut(small)
        if done is not None:
            out = _png(_sharpen(im, done.getchannel("A")))
        else:
            buf = io.BytesIO()
            im.convert("RGB").save(buf, "PNG")
            ai = _ai_cut(buf.getvalue())
            out = _png(ai.convert("RGBA")) if ai is not None else None
    if out:
        with _lock:
            _cache[key] = out
    return out
