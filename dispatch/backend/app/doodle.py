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
import contextvars
import io
import logging
import threading
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


def _draw(prompt: str, ratio: str, busy=None):
    """One drawing from the image service. The image quota (Azure S0) allows only
    a few a minute: a "rate limit" refusal is waited out and tried again —
    up to three more times — instead of the scene losing its picture. ``busy``
    (a threading.Event) is set on such a refusal: painting two at a time
    (_two_at_a_time) then goes back to one."""
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
            if busy is not None:
                busy.set()
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


def _flat(prompt: str, style: str, ws: int | None, user_id: int | None, ratio: str = "16:9", side: int = 1200, busy=None) -> str | None:
    """One colour illustration (``style`` + ``prompt``) in ``ratio``, at most
    ``side`` px, as a JPEG data URI — or None."""
    if ws:
        try:
            billing.require(ws, billing.IMAGE_HOLD)
        except billing.OutOfCredit:
            return None
    try:
        _provider, blob, usage = _draw(style + prompt, ratio, busy)
    except Exception as exc:  # noqa: BLE001 — the scene shows its drawn icon instead
        log.warning("presenter: picture failed (%s)", str(exc)[:200])
        return None
    billing.charge(
        ws, "image", billing.image_cost(usage.get("input", 0), usage.get("output", 0)), user_id=user_id,
        model=get_settings().azure_openai_image_deployment, tokens=usage.get("total", 0), note=f"Picture: {prompt[:150]}",
    )
    try:
        im = Image.open(io.BytesIO(blob)).convert("RGB")
        im.thumbnail((side, side))
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


# Picture story (motion/src/picture.jsx): every scene one full-screen picture, in
# the art style picked (app/motion.py PICTURE_ARTS); its words are real text on top.
PICTURE_ARTS = {
    "film": "A cinematic film still, photo-real: natural light, real depth of field, rich but "
    "natural colour, shot like a scene from a well-made drama film.",
    "painted": "A hand-painted anime film frame: warm natural light, soft painterly detail, rich "
    "colour, real depth, like a scene from a beloved animated feature film.",
    "illustration": "A modern flat 2D illustration: clean simple shapes, smooth flat colour fills, "
    "friendly people with simple faces, a calm composition with one clear subject.",
    "3d": "A frame from a 3D animated feature film: soft studio lighting, appealing stylised "
    "characters, gentle colour, cinematic depth.",
    # the Stick figures template (app/motion.py STYLE_ALIASES): a whiteboard explainer's drawings
    "stickman": "A hand-drawn black ink stick-figure cartoon on a PURE WHITE background, like a "
    "whiteboard explainer video: a round head with simple expressive eyes, eyebrows and mouth, "
    "thin black line arms and legs, a few simple props and furniture drawn in the same clean black "
    "line (a desk, a chair, a thought bubble, a light bulb, a phone…). Black lines only — no colour, "
    "no grey shading, no background scenery, a clean white background.",
}
PICTURE_RULES = (
    " One clear moment, composed for a video frame, with calm space near the top for a line of "
    "text. Where people or places appear and the story doesn't say otherwise, set it in "
    "Cambodia. ABSOLUTELY NO text, letters, numbers, words, captions, signs with writing, logos "
    "or watermarks anywhere in the image.\n\n"
)


def white_page(uri: str) -> str:
    """A stick-figure drawing on a truly white page: the image AI leaves faint grey
    ghosts (letters, smudges) in the white, so everything nearly white turns pure
    white and only the ink stays — the page then matches the template's white."""
    try:
        import numpy as np

        im = Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1]))).convert("RGB")
        px = np.asarray(im).copy()
        px[px.mean(axis=2) > 205] = 255
        buf = io.BytesIO()
        Image.fromarray(px).save(buf, "JPEG", quality=90)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:  # noqa: BLE001 — the drawing as it came is still fine
        log.warning("stick figures: could not whiten a page")
        return uri


def picture_style(art: str, cast: list[dict]) -> str:
    """The picture brief before each scene's ``draw``: the art style, and how
    the story's returning people look, so every picture draws them alike."""
    people = "".join(f"{c['name'] or 'Person'}: {c['look']}. " for c in cast if c.get("look"))
    return (
        PICTURE_ARTS.get(art, PICTURE_ARTS["film"])
        + PICTURE_RULES
        + (f"The people in this story (draw them EXACTLY like this whenever they appear): {people}\n\n" if people else "")
        + "The picture: "
    )


PLACE_STYLE = (
    "A flat 2D cartoon background illustration for an animated explainer video, wide shot at eye "
    "level: clean bold black outlines, flat soft colours (cream, warm red, light grey, a little "
    "blue and orange), simple shapes, a slightly sketchy pale-grey city or room in the far "
    "background, a few small sparkles. EMPTY of people and animals. The lower middle of the "
    "picture is open floor with room for two characters to stand. ABSOLUTELY NO text, letters, "
    "numbers, words or logos anywhere — shop signs, boards, labels and screens are left blank.\n\n"
    "The place: "
)


# AI service · Your AI team (motion/src/aiteam.jsx): the picture of the post the AI made,
# on the phone the owner approves — when the brand has no product photo of its own.
POST_PHOTO_STYLE = (
    "A bright, appealing photo for a small business's social media post: realistic, natural "
    "light, one clear subject (the product or the moment), a clean simple background, warm "
    "inviting colours, shot like a good phone photo by a professional. Where people or places "
    "appear, set it in Cambodia. ABSOLUTELY NO text, letters, numbers, words, price tags, signs "
    "with writing, logos or watermarks anywhere in the image.\n\nThe photo: "
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
MAX_VECTORS = 6  # vector pictures are writing, not image quota — a few more a film
MAX_PAINTED = 6  # AI design's painted pictures (the default since 2026-10-29) — as many as vector


def _full_frame(sc: dict) -> bool:
    """A scene that is only words (a title, its kicker / sub) and one picture —
    its vector picture can be the whole frame, the words on its empty corner."""
    kinds = [L.get("kind") for L in sc.get("layers") or []]
    return kinds.count("image") == 1 and kinds.count("text") >= 1 and all(k in ("text", "pill", "image") for k in kinds)


def _words_on_corner(sc: dict, wide: bool) -> None:
    """The scene's words as one block on the full-frame picture's empty corner:
    the kicker, the title (the biggest text) and the sub stacked together —
    top-left on a wide video, the top on a tall one, below the logo chip."""
    layers = sc["layers"]
    texts = [L for L in layers if L.get("kind") == "text"]
    title = max(texts, key=lambda L: L.get("size") or 0)
    pills = [L for L in layers if L.get("kind") == "pill"]
    if pills and not title.get("kicker"):
        title["kicker"] = pills[0].get("text") or ""
    subs = [L for L in texts if L is not title]
    if subs and not title.get("sub"):
        title["sub"], title["subSize"] = subs[0].get("text") or "", 46 if wide else 48
    if wide:
        title.update(x=27, y=35, maxw=42, align="left")
    else:
        title.update(x=50, y=27, maxw=88, align="center")
    sc["layers"] = [L for L in layers if L.get("kind") == "image" or L is title]


def draw_pictures(scenes: list[dict], theme: dict, ws: int | None, user_id: int | None, wide: bool = False, language: str = "English") -> int:
    """AI design (style "canvas"): every image layer that asks for a drawing
    (``draw``) gets one. The look says how (theme["pictures"]): "vector" (the
    default) = the writing AI draws it as flat vector SVG in the look's colours,
    the same people every scene (app/vector_art.py), up to MAX_VECTORS, three at
    a time; "flat" = a colour illustration by the image model; "sketch" =
    Doodle notes' ink sketch, made transparent and inked in the scene's text
    colour so it draws itself onto the scene (both up to MAX_PICTURES, one at a
    time). A vector picture that fails is painted ("flat") instead; one that
    can't be drawn at all becomes its icon on a tile. Returns how many were drawn."""
    mode = theme.get("pictures") if theme.get("pictures") in ("flat", "sketch") else "vector"
    sketch = mode == "sketch"
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

    def vector(item, reference: str = ""):
        """The picture drawn as SVG: its text kept on the layer (canvas.jsx VectorArt
        plays its moves), a data URI returned for the rest (thumbnails, previews)."""
        from app import vector_art

        sc, L = item
        light = (sc.get("tone") or (sc.get("pal") or {}).get("mode")) == "light"
        palette = (
            f"main {theme.get('a', '#4F8CFF')}, second {theme.get('b', '#22D3EE')}, "
            f"{'light' if light else 'dark'} scene — background around {theme.get('light' if light else 'dark') or ('#F4F6FB' if light else '#0B1020')}, "
            f"deep shade {theme.get('dark') or '#0B1020'}, light shade {theme.get('light') or '#F4F6FB'}"
        )
        tall = (L.get("w") or 0) >= 700  # a phone video's big picture: a taller panel
        full = ("wide" if wide else "tall") if _full_frame(sc) else ""
        svg = vector_art.draw(
            L["draw"], cast=theme.get("cast") or "", palette=palette, tall=tall, full=full, light=light,
            seconds=float(sc.get("seconds") or 5), language=language, reference=reference,
        )
        if not svg:
            return None
        L["svg"] = svg
        return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()

    got = []
    drew_vector: set[int] = set()
    if mode == "vector" and todo[:MAX_VECTORS]:
        # the first picture alone, then the rest — three at once — drawing its people
        # the same way; writing calls, each keeping this job's billing (contextvars)
        first = vector(todo[0])
        reference = todo[0][1].get("svg") or ""
        with ThreadPoolExecutor(max_workers=3) as pool:
            rest = list(pool.map(lambda it: contextvars.copy_context().run(vector, it, reference), todo[1:MAX_VECTORS]))
        got = [first, *rest]
        drew_vector = {k for k, u in enumerate(got) if u}
        missed = [k for k, u in enumerate(got) if not u][:MAX_PICTURES]
        if missed:  # painted instead, one at a time
            with ThreadPoolExecutor(max_workers=1) as pool:
                for k, uri in zip(missed, pool.map(one, [todo[k] for k in missed])):
                    got[k] = uri
    elif todo:
        # painted: two at a time (image_slot caps the whole app); sketches one at a time, as before
        most, workers = (MAX_PICTURES, 1) if sketch else (MAX_PAINTED, 2)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            got = list(pool.map(lambda it: contextvars.copy_context().run(one, it), todo[:most]))
    for k, (sc, L) in enumerate(todo):
        uri = got[k] if k < len(got) else None
        if uri:
            L["src"] = uri
            L.pop("draw", None)
            if k in drew_vector:
                L["radius"] = 0  # the SVG has its own rounded panel — or is the whole frame
                if _full_frame(sc):  # behind everything, edge to edge; the words on its empty corner
                    L.update(x=50, y=50, w=1920 if wide else 1080, z=0, at=0)  # the background: there from the first frame
                    L["in"] = "fade"
                    L.pop("loop", None)
                    _words_on_corner(sc, wide)
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


def _two_at_a_time(todo: list[dict], paint, report, on_start, on_done) -> list[str | None]:
    """Picture story's many pictures, two painted at once (about half the
    wait) — until the image service says it's busy once: from then on the
    rest go one at a time, so the quota isn't hammered. In order.
    ``paint(scene, busy)`` paints one."""
    busy = threading.Event()
    single = threading.Lock()
    done = [0]
    count = threading.Lock()

    def one(s: dict) -> str | None:
        if busy.is_set():
            with single:
                on_start(s)
                uri = paint(s, busy)
        else:
            on_start(s)
            uri = paint(s, busy)
        with count:
            done[0] += 1
            on_done(s, uri)
            if report:
                report(done[0], len(todo))
        return uri

    if report:
        report(0, len(todo))
    with ThreadPoolExecutor(max_workers=2) as pool:
        # each picture runs in a copy of this thread's context (the billing / model settings)
        jobs = [pool.submit(contextvars.copy_context().run, one, s) for s in todo]
        return [j.result() for j in jobs]


def draw_scenes(
    scenes: list[dict],
    ws: int | None,
    user_id: int | None,
    report=None,
    style: str | None = None,
    limit: int = MAX_DRAWINGS,
    ratio: str = "16:9",
    on_start=None,
    on_done=None,
) -> int:
    """Draw every scene that asks for a drawing (``draw``) and has none yet,
    one at a time (the image service rate-limits hard); the picture goes into
    ``scene["image"]`` as soon as it's painted. ``report(drawn, total)`` after
    each, for the progress line; ``on_start(scene)`` / ``on_done(scene, uri)``
    around each one (the making card's rows). ``style`` = a colour
    illustration in that style (Presenter), in ``ratio``, instead of Doodle's
    ink sketch. Returns how many were drawn."""
    todo = [s for s in scenes if s.get("draw") and not s.get("image")][:limit]
    if not todo:
        return 0
    side = 1920 if limit > MAX_DRAWINGS else 1200  # Picture story: each picture fills the screen
    started = on_start or (lambda s: None)

    stick = bool(style) and style.startswith(PICTURE_ARTS["stickman"])

    def finished(s: dict, uri: str | None) -> None:
        if uri and stick:
            uri = white_page(uri)
        if uri:
            s["image"] = uri
        if on_done:
            on_done(s, uri)

    def paint(s: dict, busy) -> str | None:
        """Picture story: a picture that fails is tried once more — with its first
        sentence only (a refusal is usually one detail of a long description)."""
        uri = _flat(s["draw"], style, ws, user_id, ratio, side, busy)
        if uri is None:
            short = s["draw"].split(". ")[0].rstrip(".") + "."
            log.info("picture story: a picture failed — trying again%s", " with its first sentence" if short != s["draw"] else "")
            uri = _flat(short, style, ws, user_id, ratio, side, busy)
        return uri

    if limit > MAX_DRAWINGS and style:
        got = _two_at_a_time(todo, paint, report, started, finished)
    else:
        got = []
        for n, s in enumerate(todo):  # one at a time — the image quota is small
            if report:
                report(n, len(todo))
            started(s)
            got.append(_flat(s["draw"], style, ws, user_id, ratio, side) if style else _one(s["draw"], ws, user_id))
            finished(s, got[-1])
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
