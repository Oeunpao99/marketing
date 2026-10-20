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
import time
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageChops, ImageFilter, ImageOps

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
def sketch_prompt(accent_hex: str) -> str:
    """Doodle notes' ink sketch with ONE colour on the scene's key details — the
    brand's colour (AI design's sketches). The server sets that colour exact."""
    return STYLE.replace(
        "NO colour, NO grey fill,",
        f"black ink only EXCEPT 2-3 key details (the most important object of the moment — a shirt, "
        f"a screen, a cup, a chart going up) filled with ONE flat colour, {accent_hex}; no other "
        "colour anywhere, NO grey fill,",
    )


def _rgb(hex_: str) -> tuple:
    h = hex_.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def _lum(c: tuple) -> float:
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = (ch(v) for v in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def readable(accent: tuple, bg: tuple, ink: tuple) -> tuple:
    """The accent nudged towards the ink colour until it stands out on the
    scene's background (a navy brand on a dark scene → a lighter navy)."""
    c = accent
    for _ in range(6):
        hi, lo = sorted((_lum(c), _lum(bg)), reverse=True)
        if (hi + 0.05) / (lo + 0.05) >= 1.6:  # fills have ink outlines: they need less than text
            break
        c = tuple(round(v + (t - v) * 0.15) for v, t in zip(c, ink))
    return c


RATE_WAITS = (20, 40, 60)  # seconds between tries when the image service says "too many"


SOFTER = (
    "Keep the picture wholesome and family-friendly: show the idea with harmless everyday "
    "objects (a glass bottle and a glass instead of alcohol, no weapons, no medicine, nothing "
    "sensitive). "
)


def _draw(prompt: str, ratio: str):
    """One drawing from the image service. The image quota (Azure S0) allows only
    a few a minute: a "rate limit" refusal is waited out and tried again —
    up to three more times — instead of the scene losing its picture."""
    from app import video as video_gen

    softened = False
    for wait in (*RATE_WAITS, None):
        try:
            with video_gen.image_slot():
                return video_gen.generate_image(prompt, ratio)
        except video_gen.VideoGenError as exc:
            why = str(exc).lower()
            if "safety" in why and not softened:
                # the safety filter said no (a wine bottle, …): one more try, asked gently
                softened = True
                log.info("image refused by the safety filter — asking once more, gently")
                prompt = SOFTER + prompt
                continue
            if wait is None or "rate limit" not in why:
                raise
            log.info("image service busy — trying again in %ss", wait)
            time.sleep(wait)


INK = (24, 27, 26)  # the template's ink (doodle.jsx C.ink)
MAX_DRAWINGS = 10
MAX_SIDE = 900


def ink_only(blob: bytes, ink: tuple = INK, accent: tuple | None = None) -> bytes:
    """A black-on-white sketch → ink lines on a transparent PNG, cropped to the
    drawing: dark = opaque, white = clear, so it sits on the grid paper (or on
    an AI-design scene, in ``ink`` — light lines on a dark scene). With
    ``accent``, the sketch's coloured details are kept, in exactly that colour."""
    src = Image.open(io.BytesIO(blob)).convert("RGB")
    im = ImageOps.autocontrast(src.convert("L"), cutoff=1)
    # paper (≥ ~225) clears completely; the rest gets darker → more opaque
    alpha = im.point(lambda v: 0 if v >= 225 else min(255, int((225 - v) * 255 / 150)))
    out = Image.new("RGBA", im.size, (*ink, 0))
    out.putalpha(alpha)
    if accent:
        # the coloured fill: saturated, not too dark — painted in the exact accent over the ink
        _h, sat, val = src.convert("HSV").split()
        mask = Image.eval(sat, lambda v: 255 if v > 80 else 0)
        mask = ImageChops.multiply(mask, Image.eval(val, lambda v: 255 if v > 60 else 0)).filter(ImageFilter.GaussianBlur(0.7))
        fill = Image.new("RGBA", im.size, (*accent, 0))
        fill.putalpha(mask)
        out = Image.alpha_composite(out, fill)
        alpha = out.getchannel("A")
    box = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    if box:
        pad = 24
        out = out.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
    out.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()


# Presenter · Brand host (motion/src/presenter.jsx): the picture on the panel, in a
# white card frame — a colour illustration in the brand's colour, wide (3:2).
HOST_PICTURE_STYLE = (
    "A bright modern flat 2D illustration for an explainer video: clean simple shapes, smooth flat "
    "colour fills (no photo realism, no 3D), friendly cartoon people with simple faces when people "
    "fit, one clear subject in the middle with room around it, a soft plain light background. "
    "Colours: {a} as the main colour, with warm yellow, soft teal and gentle neutrals. Everyday "
    "Cambodian life when it fits. ABSOLUTELY NO text, letters, numbers, words, signs with writing, "
    "logos or watermarks anywhere in the image.\n\nThe picture: "
)


def host_picture_style(accent_hex: str) -> str:
    return HOST_PICTURE_STYLE.format(a=accent_hex)


def _flat(prompt: str, style: str, ws: int | None, user_id: int | None) -> str | None:
    """One colour illustration (``style`` + ``prompt``), wide, as a JPEG data URI — or None."""
    if ws:
        try:
            billing.require(ws, billing.IMAGE_HOLD)
        except billing.OutOfCredit:
            return None
    try:
        _provider, blob, usage = _draw(style + prompt, "16:9")
    except Exception as exc:  # noqa: BLE001 — the scene shows its drawn icon instead
        log.warning("presenter: picture failed (%s)", str(exc)[:200])
        return None
    billing.charge(
        ws, "image", billing.image_cost(usage.get("input", 0), usage.get("output", 0)), user_id=user_id,
        model=get_settings().azure_openai_image_deployment, tokens=usage.get("total", 0), note=f"Presenter picture: {prompt[:150]}",
    )
    try:
        im = Image.open(io.BytesIO(blob)).convert("RGB")
        im.thumbnail((1200, 1200))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=86, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:  # noqa: BLE001
        log.exception("presenter: could not read a picture")
        return None


def _one(prompt: str, ws: int | None, user_id: int | None) -> str | None:

    if ws:
        try:
            billing.require(ws, billing.IMAGE_HOLD)
        except billing.OutOfCredit:
            return None
    try:
        _provider, blob, usage = _draw(STYLE + prompt, "1:1")
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


# Podcast · Story Talk (motion/src/podcast.jsx): the places its story visits —
# painted film backdrops, our coded host stands in front of them.
BACKDROP_STYLE = (
    "A hand-painted anime film background: warm natural light, soft painterly detail, rich "
    "colour, real depth (a near, a middle and a far layer), cinematic wide shot at eye level. "
    "EMPTY of people and animals. The lower middle of the picture is open ground / floor in "
    "front with nothing standing on it, where one character will stand. Everyday life in "
    "Cambodia when it fits. ABSOLUTELY NO text, letters, numbers, words or logos anywhere — "
    "signs, screens and papers are left blank.\n\nThe place: "
)


def draw_place(prompt: str, ws: int | None, user_id: int | None, style: str = PLACE_STYLE) -> str | None:
    """Story · Characters (motion/src/cartoon.jsx): the one place the story
    happens in, as a wide JPEG data URI — or None (the template draws a plain
    room). Podcast passes its own ``style`` (BACKDROP_STYLE)."""
    if ws:
        try:
            billing.require(ws, billing.IMAGE_HOLD)
        except billing.OutOfCredit:
            return None
    try:
        _provider, blob, usage = _draw(style + prompt, "16:9")
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


PICTURE_STYLE = (
    "A modern flat 2D vector illustration for a premium explainer video: clean simple shapes, "
    "smooth flat colour fills (no gradients, no photo realism, no 3D), friendly people with simple "
    "faces, a calm uncluttered composition with one clear subject. Colour palette: {a} and {b} as "
    "the accents, with soft neutrals; the background is a plain flat {bg}. Everyday Cambodian life "
    "when it fits. ABSOLUTELY NO text, letters, numbers, words, signs with writing, logos or "
    "watermarks anywhere in the image.\n\nThe picture: "
)
MAX_PICTURES = 4


def draw_pictures(scenes: list[dict], theme: dict, ws: int | None, user_id: int | None) -> int:
    """AI design (style "canvas"): every image layer that asks for a drawing
    (``draw``) gets one, at most MAX_PICTURES a film, one at a time. The look
    says how (theme["pictures"]): "sketch" (the default) = Doodle notes' ink
    sketch, made transparent and inked in the scene's text colour — light
    lines on a dark scene — so it draws itself onto the scene; "flat" = a
    colour illustration in the look's accents on the scene's background. A
    picture that can't be drawn (or one over the limit) becomes its icon on a
    tile. Returns how many were drawn."""
    sketch = (theme.get("pictures") or "sketch") != "flat"
    todo = [(sc, L) for sc in scenes for L in sc.get("layers") or [] if L.get("kind") == "image" and L.get("draw") and not L.get("src")]

    def one(item):
        sc, L = item
        light = (sc.get("tone") or (sc.get("pal") or {}).get("mode")) == "light"
        bg = theme.get("light" if light else "dark") or ("#F4F6FB" if light else "#0B1020")
        if sketch:  # with the look's accent (the brand's colour on a brand look) on its key details
            prompt = sketch_prompt(theme.get("a") or "#4F8CFF") + L["draw"]
        else:
            prompt = PICTURE_STYLE.format(a=theme.get("a", "#4F8CFF"), b=theme.get("b", "#22D3EE"), bg=bg) + L["draw"]
        if ws:
            try:
                billing.require(ws, billing.IMAGE_HOLD)
            except billing.OutOfCredit:
                return None
        try:
            _provider, blob, usage = _draw(prompt, "1:1")
        except Exception as exc:  # noqa: BLE001 — the scene shows its icon instead
            log.warning("ai design: picture failed (%s)", str(exc)[:200])
            return None
        billing.charge(ws, "image", billing.image_cost(usage.get("input", 0), usage.get("output", 0)), user_id=user_id, model=get_settings().azure_openai_image_deployment, tokens=usage.get("total", 0), note=f"AI design picture: {L['draw'][:150]}")
        try:
            if sketch:  # ink in the scene's text colour: the other tone's background
                hex_ = (theme.get("dark") if light else theme.get("light")) or ("#181B1A" if light else "#F4F6FB")
                ink = _rgb(hex_)
                accent = readable(_rgb(theme.get("a") or "#4F8CFF"), _rgb(bg), ink)
                return "data:image/png;base64," + base64.b64encode(ink_only(blob, ink, accent)).decode()
            im = Image.open(io.BytesIO(blob)).convert("RGB")
            im.thumbnail((1024, 1024))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=88, optimize=True)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception:  # noqa: BLE001
            log.exception("ai design: could not read a picture")
            return None

    got = []
    if todo[:MAX_PICTURES]:
        with ThreadPoolExecutor(max_workers=1) as pool:  # one at a time — the image quota is small
            got = list(pool.map(one, todo[:MAX_PICTURES]))
    for k, (sc, L) in enumerate(todo):
        uri = got[k] if k < len(got) else None
        if uri:
            L["src"] = uri
            L.pop("draw", None)
            if sketch:
                L["sketch"] = True  # canvas.jsx: drawn in with a sweep, then a pen wobble
                L["in"] = "fade"  # the sweep is its entrance — no zoom on top
                L.pop("radius", None)
                L.pop("loop", None)
        else:  # no picture: its icon on the accent tile, in the same place
            icon = L.get("icon") or "Sparkles"
            for key in ("draw", "src", "radius", "w", "icon"):
                L.pop(key, None)
            L.update(kind="icon", name=icon, size=300, tile="a")
    return sum(1 for u in got if u)


def draw_scenes(scenes: list[dict], ws: int | None, user_id: int | None, report=None, style: str | None = None) -> int:
    """Draw every scene that asks for a drawing (``draw``) and has none yet,
    one at a time (the image service rate-limits hard); the picture goes into
    ``scene["image"]``. ``report(drawn, total)`` after each, for the progress
    line. ``style`` = a colour illustration in that style (Presenter) instead
    of Doodle's ink sketch. Returns how many were drawn."""
    todo = [s for s in scenes if s.get("draw") and not s.get("image")][:MAX_DRAWINGS]
    if not todo:
        return 0
    got = []
    for n, s in enumerate(todo):  # one at a time — the image quota is small
        if report:
            report(n, len(todo))
        got.append(_flat(s["draw"], style, ws, user_id) if style else _one(s["draw"], ws, user_id))
    for s, uri in zip(todo, got):
        if uri:
            s["image"] = uri
    return sum(1 for u in got if u)


# Reaction meme (motion/src/reaction.jsx): each animal is ONE picture — the same
# animal twice, mouth closed | mouth open, on chroma green — keyed and split here,
# so its mouth can flap on the beat. Our own animals: no one's viral clip.
SHEET_STYLE = (
    "A two-panel reaction meme sprite sheet, photorealistic. The SAME animal shown twice side by "
    "side, identical in size, pose, position, lighting and camera angle in both halves — only the "
    "mouth changes: LEFT half mouth closed, RIGHT half mouth wide open (mid-scream / mid-'pop'). "
    "Head and shoulders only, facing the camera, centred in each half with space around it. "
    "Background: one flat pure chroma-key green (#00FF00) everywhere, no shadow, no floor, no "
    "gradient. No text, no letters, no logos, no border, no divider line.\n\nThe animal: "
)
MEME_PHOTO_STYLE = (
    "A candid, realistic smartphone photo for a funny social media meme: natural light, a real "
    "everyday moment, one clear subject, simple background. Where people or places appear, set it "
    "in Cambodia. Absolutely no text, letters, numbers, captions, signs with words, logos or "
    "watermarks anywhere in the image.\n\nThe photo: "
)
MAX_MEME_PHOTOS = 2


def key_green(im: Image.Image) -> Image.Image:
    """Chroma-key green → transparent, with the green fringe taken out of the fur."""
    r, g, b = im.convert("RGB").split()
    rest = ImageChops.lighter(r, b)
    green = ImageChops.subtract(g, rest)  # how much greener than red / blue (0 = not green)
    alpha = green.point(lambda d: 255 if d < 30 else 0 if d > 90 else int(255 * (90 - d) / 60))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = Image.merge("RGB", (r, ImageChops.darker(g, rest), b)).convert("RGBA")
    out.putalpha(alpha)
    return out


def split_sheet(blob: bytes) -> tuple[bytes, bytes] | None:
    """A two-panel sheet → (mouth closed, mouth open) PNGs of the same size,
    each cut to the animal and standing on the bottom edge, so swapping them
    moves only the mouth. None when a half is empty."""
    sheet = key_green(Image.open(io.BytesIO(blob)))
    w, h = sheet.size
    halves = []
    for i in (0, 1):
        half = sheet.crop((i * w // 2, 0, (i + 1) * w // 2, h))
        box = half.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        if not box or (box[2] - box[0]) * (box[3] - box[1]) < half.width * half.height * 0.08:
            return None
        halves.append(half.crop(box))
    cw, ch = max(x.width for x in halves), max(x.height for x in halves)
    out = []
    for x in halves:
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        canvas.paste(x, ((cw - x.width) // 2, ch - x.height))
        canvas.thumbnail((MAX_SIDE, MAX_SIDE))
        buf = io.BytesIO()
        canvas.save(buf, "PNG", optimize=True)
        out.append(buf.getvalue())
    return out[0], out[1]


def _paid_draw(prompt: str, ratio: str, ws: int | None, user_id: int | None, note: str):
    """One image, held and charged like every other drawing — None when it can't be had."""
    if ws:
        try:
            billing.require(ws, billing.IMAGE_HOLD)
        except billing.OutOfCredit:
            return None
    try:
        _provider, blob, usage = _draw(prompt, ratio)
    except Exception as exc:  # noqa: BLE001
        log.warning("reaction meme: drawing failed (%s)", str(exc)[:200])
        return None
    billing.charge(ws, "image", billing.image_cost(usage.get("input", 0), usage.get("output", 0)), user_id=user_id, model=get_settings().azure_openai_image_deployment, tokens=usage.get("total", 0), note=note[:200])
    return blob


def draw_reaction(script: dict, ws: int | None, user_id: int | None) -> list[dict]:
    """Reaction meme: its 1-2 animals (one sheet each → mouth closed / open
    PNGs) and the photo behind each meme moment that asked for one
    (``draw``, at most MAX_MEME_PHOTOS, into ``scene["image"]``). One at a
    time — the image quota is small. Returns props.cast: [{who, closed, open}];
    an animal that can't be drawn is {who} (the template shows an emoji face)."""
    from app.motion import REACTION_ANIMALS

    cast = []
    for name in script.get("cast") or []:
        blob = _paid_draw(SHEET_STYLE + REACTION_ANIMALS.get(name, name), "16:9", ws, user_id, f"Reaction meme animal: {name}")
        pair = None
        if blob:
            try:
                pair = split_sheet(blob)
            except Exception:  # noqa: BLE001
                log.exception("reaction meme: could not cut out %s", name)
        if pair:
            closed, opened = ("data:image/png;base64," + base64.b64encode(x).decode() for x in pair)
            cast.append({"who": name, "closed": closed, "open": opened})
        else:
            cast.append({"who": name})
    todo = [s for s in script.get("scenes") or [] if s.get("draw") and not s.get("image")][:MAX_MEME_PHOTOS]
    for s in todo:
        blob = _paid_draw(MEME_PHOTO_STYLE + s["draw"], "1:1", ws, user_id, f"Reaction meme photo: {s['draw']}")
        if not blob:
            continue
        try:
            im = Image.open(io.BytesIO(blob)).convert("RGB")
            im.thumbnail((1024, 1024))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=86, optimize=True)
            s["image"] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
            s["imgW"], s["imgH"] = im.size
        except Exception:  # noqa: BLE001
            log.exception("reaction meme: could not read a photo")
    return cast
