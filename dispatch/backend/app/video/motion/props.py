"""The template's input (build_props): the brand kit's pictures put in, the words split for Khmer, scene lengths.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import base64
import io
import random
import re
from PIL import Image, ImageChops
from app.storage.media import read_media
from app.models import Brand, BrandAsset, Product
from app.images.poster import brand_rgb
from app.images.brand_kit import main_logo
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.video.motion.common import MUSIC_NEIGHBOURS, TRANSITION_S, _km_words, music_tracks, track_for
from app.video.motion.templates.picture import clean_ink, picture_side, title_tone
from app.video.motion.templates.lifestory import clean_hero
from app.video.motion.templates.presenter import clean_host, possessive
from app.video.motion.templates.parable import clean_duo
from app.video.motion.templates.illustrated import clean_lead
from app.video.motion.styles import WIDE_STYLES
from app.video.motion.scenes import clean_cast


# ── pictures (embedded, so the render needs no network) ───────────────────
def _trim_logo(im: Image.Image) -> Image.Image:
    """A logo without the empty border round it — a see-through margin, or a plain
    white / one-colour one: the video fits the WHOLE picture into the corner (62 px tall
    in a tall video), so a small mark in a big empty canvas came out tiny (the user,
    2026-11-06). A thin margin is kept. Anything unreadable: the logo as it came."""
    try:
        rgba = im.convert("RGBA")
        w, h = rgba.size
        box = rgba.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
        if box is None:
            return im
        if box == (0, 0, w, h):  # no see-through margin: a plain border of one colour?
            rgb = rgba.convert("RGB")
            corners = [rgb.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
            if max(max(abs(a - b) for a, b in zip(c, corners[0])) for c in corners) > 24:
                return im  # the corners differ: a picture to the edges, not a border
            plain = Image.new("RGB", (w, h), corners[0])
            box = ImageChops.difference(rgb, plain).convert("L").point(lambda v: 255 if v > 24 else 0).getbbox()
            if box is None:
                return im
        x0, y0, x1, y1 = box
        if (x1 - x0) * (y1 - y0) > 0.9 * w * h:
            return im  # hardly any border — leave it be
        pad = max(2, int(0.04 * max(x1 - x0, y1 - y0)))
        return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))
    except Exception:  # noqa: BLE001
        return im


def _data_uri(blob: bytes, max_side: int, keep_alpha: bool = False, trim: bool = False) -> str | None:
    try:
        im = Image.open(io.BytesIO(blob))
        if trim:  # a logo: its empty border off first, so it fills its place on the video
            im = _trim_logo(im)
        im.thumbnail((max_side, max_side))
        out = io.BytesIO()
        if keep_alpha:
            im.convert("RGBA").save(out, "PNG", optimize=True)
            return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()
        im.convert("RGB").save(out, "JPEG", quality=88)
        return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
    except Exception:  # noqa: BLE001 — an unreadable upload is just left out
        return None


def _brand_pictures(
    db: Session, brand_id: int, logo_id: int | None = None
) -> tuple[dict[int, str], list[str], str | None]:
    """The brand kit's product photos — by product id, and all of them newest
    first — and its logo, ready to embed: the one the video picked (``logo_id``),
    else the brand's main one."""
    assets = db.scalars(
        select(BrandAsset).where(
            BrandAsset.brand_id == brand_id, BrandAsset.kind.in_(("product", "logo"))
        )
    ).all()
    by_product: dict[int, str] = {}
    order: list[str] = []
    for a in sorted((a for a in assets if a.kind == "product"), key=lambda a: -a.id)[:6]:
        uri = _data_uri(read_media(a.url) or b"", 1280)
        if uri:
            order.append(uri)
            if a.product_id is not None:
                by_product.setdefault(a.product_id, uri)
    logo = next((a for a in assets if a.kind == "logo" and a.id == logo_id), None) or main_logo(db, brand_id)
    logo_uri = _data_uri(read_media(logo.url) or b"", 512, keep_alpha=True, trim=True) if logo else None
    return by_product, order, logo_uri


def pick_pictures(
    script: dict,
    products: list[Product],
    by_product: dict[int, str],
    order: list[str],
    product_id: int | None,
    shots: list[dict] | None = None,
) -> None:
    """Put the brand kit's photos into the scenes that show one: the product
    scene shows the product it names (else the chosen / newest photo); the
    hook and the close show the chosen product (else the newest photo)."""
    ids = {p.name: p.id for p in products}
    main = (by_product.get(product_id) if product_id is not None else None) or (
        order[0] if order else None
    )
    shots = shots or []
    # a screenshot scene whose screenshot is gone (removed from the Brand kit) is left out
    script["scenes"] = [
        s for s in script["scenes"] if s["type"] != "screen" or 1 <= s.get("shot", 0) <= len(shots)
    ]
    for s in script["scenes"]:
        if s["type"] == "stack":  # the deck: its screenshots that still exist
            s["images"] = [
                {"src": shots[n - 1]["uri"], "w": shots[n - 1]["w"], "h": shots[n - 1]["h"]}
                for n in s.get("shots", [])
                if 1 <= n <= len(shots)
            ]
    script["scenes"] = [
        s for s in script["scenes"] if s["type"] != "stack" or len(s["images"]) >= 2
    ]
    for s in script["scenes"]:
        if s["type"] == "platform" and 1 <= s.get("shot", 0) <= len(
            shots
        ):  # the app in its frame (else drawn)
            shot = shots[s["shot"] - 1]
            s["image"], s["imgW"], s["imgH"] = shot["uri"], shot["w"], shot["h"]
        if s["type"] in (
            "phones",
            "gallery",
        ):  # the phones' screens / the library's thumbnails (else drawn)
            s["images"] = [
                {"src": shots[n - 1]["uri"]} for n in s.get("shots", []) if 1 <= n <= len(shots)
            ]
    for s in script["scenes"]:
        if s["type"] == "screen":
            shot = shots[s["shot"] - 1]
            s["image"], s["imgW"], s["imgH"] = shot["uri"], shot["w"], shot["h"]
        elif s["type"] in ("product", "fanout"):
            s["image"] = by_product.get(ids.get(s.get("product") or "")) or main
        elif s["type"] == "canvas":  # "shot:N" / "product:<name>" → the brand kit's own picture
            for L in s["layers"]:
                src = str(L.get("src") or "")
                if src.startswith("shot:") and 1 <= int(src[5:]) <= len(shots):
                    L["src"] = shots[int(src[5:]) - 1]["uri"]
                elif src.startswith("product:"):
                    L["src"] = by_product.get(ids.get(src[8:].strip())) or main or ""
                elif src:
                    L.pop("src", None)
        elif (
            script.get("style") == "studio"
        ):  # Collage · Studio: the brand kit's photos on its cards
            if s["type"] == "hook":
                s["image"] = main
            elif s["type"] == "collage":
                rest = [u for u in order if u != main] or order
                s["images"] = rest[:5]
            elif s["type"] == "pedestal" and product_id is not None:
                s["image"] = main
        elif (
            script.get("style") == "presenter"
        ):  # Presenter · Brand host: a product's photo on the panel
            if s["type"] == "speak" and s.get("product"):
                s["image"] = by_product.get(ids.get(s["product"])) or main
        elif (
            script.get("style") == "reaction"
        ):  # the picture behind a meme moment (else drawn, app/images/doodle.py)
            if 1 <= s.get("shot", 0) <= len(shots):
                shot = shots[s["shot"] - 1]
                s["image"], s["imgW"], s["imgH"] = shot["uri"], shot["w"], shot["h"]
            elif s.get("product"):
                s["image"] = by_product.get(ids.get(s["product"])) or main
        elif (
            script.get("style") == "street3d"
        ):  # 3D · Street: the product's photo as the hero, else no hero
            if s.get("hero") == "product":
                photo = by_product.get(ids.get(s.get("product") or "")) or main
                if photo:
                    s["image"] = photo
                else:
                    s.pop("hero")
        elif (
            script.get("style") == "deck"
        ):  # Slides: a picture slide shows the product's photo, else one painted
            if s["type"] == "picture" and main:
                s["image"] = main
                s.pop("draw", None)
        elif (
            script.get("style") == "aiteam"
        ):  # AI service: the product's photo on the post and in the pipeline
            if s["type"] in ("approve", "pipeline") and main:
                s["image"] = main
                s.pop("draw", None)
        elif script.get("style") in (
            "doodle",
            "cartoon",
            "lesson",
            "rise",
            "podcast",
            "lifestory",
            "parable",
            "dialogue",
            "illustrated",
            "picture",
        ):
            continue  # drawn templates: no product photos (doodle / cartoon draw their own, app/images/doodle.py)
        elif (
            script.get("style") == "appdemo"
        ):  # 3D · App demo: the app's own screenshot on the phone
            if s["type"] in ("hook", "cta") and shots:
                s["image"], s["imgW"], s["imgH"] = shots[0]["uri"], shots[0]["w"], shots[0]["h"]
            elif s["type"] == "platform" and not s.get("image") and shots:
                s["image"], s["imgW"], s["imgH"] = shots[0]["uri"], shots[0]["w"], shots[0]["h"]
        elif (
            script.get("style") == "spotlight"
        ):  # 3D · Spotlight: the product's photo on the 3D box
            if s["type"] in ("hook", "list", "offer", "cta"):
                s["image"] = by_product.get(ids.get(s.get("product") or "")) or main
        elif (
            script.get("style") == "productfx"
        ):  # Product showcase: the product in every scene (cut out later)
            # a software brand with no product photo: its app's screen (a device frame later)
            s["image"] = (
                by_product.get(ids.get(s.get("product") or ""))
                or main
                or (shots[0]["uri"] if shots else None)
            )
        elif s["type"] in ("hook", "cta", "offer") or script.get("style") == "quote":
            s["image"] = main


def _brackets(text: str) -> str:
    """[highlight] → ⟦highlight⟧, the template's marker (square brackets may
    be real text elsewhere)."""
    return re.sub(r"\[([^\[\]]{1,60})\]", "⟦\\1⟧", text or "")


def logo_prints(logo: str | None) -> bool:
    """Presenter: a logo on a transparent ground can be printed on the T-shirt in
    white; a logo on a solid ground (a JPEG, a white box) goes on a white patch."""
    if not logo or not logo.startswith("data:"):
        return False
    try:
        from PIL import Image

        im = Image.open(io.BytesIO(base64.b64decode(logo.split(",", 1)[1])))
        if "A" not in im.getbands():
            return False
        alpha = im.getchannel("A")
        w, h = im.size
        corners = [
            alpha.getpixel((x, y)) for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))
        ]
        return sum(1 for a in corners if a < 40) >= 3
    except Exception:  # noqa: BLE001 — a patch always works
        return False


def _logo_ink(logo: str | None) -> tuple[float, float] | None:
    """A see-through logo's drawn part: (mean brightness 0 black – 255 white, share of it
    that is dark); None for a logo with its own solid ground, or one that can't be read."""
    if not logo_prints(logo):
        return None
    try:
        from PIL import Image, ImageStat

        im = Image.open(io.BytesIO(base64.b64decode(logo.split(",", 1)[1]))).convert("RGBA")
        im.thumbnail((200, 200))
        ink = im.getchannel("A").point(lambda a: 255 if a > 128 else 0)  # its drawn part only
        if not ink.getbbox():
            return None
        grey = im.convert("L")
        drawn = [g for g, a in zip(grey.getdata(), ink.getdata()) if a]
        return ImageStat.Stat(grey, mask=ink).mean[0], sum(1 for g in drawn if g < 70) / len(drawn)
    except Exception:  # noqa: BLE001 — the usual chip
        return None


def logo_is_light(logo: str | None) -> bool:
    """A light logo on a see-through ground (a white logo) — it vanishes on the
    white brand chip, so the video puts it on a dark one."""
    ink = _logo_ink(logo)
    return ink is not None and ink[0] > 185


def logo_is_dark(logo: str | None) -> bool:
    """A see-through logo with black / navy parts (a red mark + black name too) — on a dark
    video they need a thin light edge; an all-colour logo gets none (a white glow round every
    PNG looked cheap, the user 2026-11-04)."""
    ink = _logo_ink(logo)
    return ink is not None and ink[1] > 0.15


def build_props(brand: Brand, script: dict, logo: str | None, khmer: bool) -> dict:
    """The template's input (motion/sample.json shape)."""

    def t(text: str) -> str:
        text = _brackets(text)
        return _km_words(text) if khmer else text

    r, g, b = brand_rgb(brand)
    scenes = []
    for s in script["scenes"]:
        scene = {
            k: v for k, v in s.items() if k not in ("say", "product", "target", "shot", "draw")
        }
        for key in (
            "text",
            "title",
            "label",
            "button",
            "myth",
            "fact",
            "question",
            "author",
            "name",
            "business",
            "before",
            "after",
            "headline",
            "tag",
            "result",
            "badge",
            "plan",
            "period",
            "sub",
            "word",
            "action",
            "sticker",
            "top",
            "bottom",
            "bubble",
        ):
            if scene.get(key):
                scene[key] = t(scene[key])
        if s.get("say"):
            scene["caption"] = t(s["say"]).replace("⟦", "").replace("⟧", "")  # the subtitles
        for side in ("left", "right"):
            if scene.get(side):
                if isinstance(scene[side], str):  # pair: a plain word either side of the card
                    scene[side] = t(scene[side])
                elif "points" in scene[side]:  # split: a way and its points
                    scene[side] = {
                        **scene[side],
                        "label": t(scene[side]["label"]),
                        "points": [t(x) for x in scene[side]["points"]],
                    }
                else:
                    scene[side] = {**scene[side], "name": t(scene[side]["name"])}
        if "series" in scene:
            scene["series"] = [{**ser, "name": t(ser["name"])} for ser in scene["series"]]
        if "messages" in scene:
            scene["messages"] = [{**m, "text": t(m["text"])} for m in scene["messages"]]
        if "items" in scene:
            scene["items"] = [{**i, "text": t(i["text"])} for i in scene["items"]]
        if "tiles" in scene:
            scene["tiles"] = [{**x, "label": t(x["label"])} for x in scene["tiles"]]
        if "options" in scene:
            scene["options"] = [t(o) for o in scene["options"]]
        if "chips" in scene:
            scene["chips"] = [t(c) for c in scene["chips"]]
        if "features" in scene:
            scene["features"] = [t(f) for f in scene["features"]]
        if "checks" in scene:
            scene["checks"] = [t(c) for c in scene["checks"]]
        if "points" in scene:
            scene["points"] = [
                {"title": t(x["title"]), "text": t(x["text"]) if x.get("text") else ""}
                for x in scene["points"]
            ]
        if s["type"] == "chapter":
            scene["n"] = sum(1 for x in scenes if x["type"] == "chapter") + 1  # Part 1, 2, 3 …
            scene["of"] = sum(1 for x in script["scenes"] if x["type"] == "chapter")
        if "metrics" in scene:
            scene["metrics"] = [{**m, "label": t(m["label"])} for m in scene["metrics"]]
        if "nodes" in scene:
            scene["nodes"] = [
                {**n, "label": t(n["label"]), "sub": t(n["sub"]) if n.get("sub") else ""}
                for n in scene["nodes"]
            ]
        if "notes" in scene:
            scene["notes"] = [{**n, "text": t(n["text"])} for n in scene["notes"]]
        if s["type"] == "canvas":  # every word the AI put on its canvas
            layers = []
            for L in scene.get("layers") or []:
                L = dict(L)
                for k in ("text", "title", "sub"):
                    if L.get(k):
                        L[k] = t(L[k])
                if L.get("lines"):
                    L["lines"] = [t(x) for x in L["lines"]]
                if L.get("items"):
                    L["items"] = [{**x, "text": t(x["text"])} for x in L["items"]]
                layers.append(L)
            scene["layers"] = layers
        if s["type"] == "send":
            scene["from"] = {**scene["from"], "label": t(scene["from"]["label"])}
            scene["to"] = {**scene["to"], "label": t(scene["to"]["label"])}
        if s["type"] == "hops":
            scene["nodes"] = [{**n, "label": t(n["label"])} for n in scene["nodes"]]
        if s["type"] == "fanout":
            scene["outputs"] = [
                {**o, "value": t(o["value"]) if o.get("value") else ""}
                for o in scene.get("outputs") or []
            ]
            scene["checks"] = [t(c) for c in scene.get("checks") or []]
        if s["type"] == "agenda":  # Slides · Presentation
            scene["entries"] = [t(x) for x in scene["entries"]]
        if s["type"] == "keypoints":
            scene["blocks"] = [
                {**b, "title": t(b["title"]), "text": t(b["text"]) if b.get("text") else ""}
                for b in scene["blocks"]
            ]
        if s["type"] == "barchart":
            scene["data"] = [{**d, "label": t(d["label"])} for d in scene["data"]]
        if s["type"] == "twocol":
            scene["cols"] = [
                {"label": t(c["label"]), "items": [t(x) for x in c["items"]]} for c in scene["cols"]
            ]
        if s["type"] == "roadmap":
            scene["stages"] = [
                {"title": t(st["title"]), "text": t(st["text"]) if st.get("text") else ""}
                for st in scene["stages"]
            ]
        if s["type"] == "pullquote" and scene.get("role"):
            scene["role"] = t(scene["role"])
        if s["type"] == "overload":  # AI service · Your AI team
            scene["tasks"] = [t(x) for x in scene["tasks"]]
        if s["type"] == "crew":
            scene["agents"] = [
                {**a, "role": t(a["role"]), "task": t(a["task"])} for a in scene["agents"]
            ]
        if s["type"] == "pipeline":
            scene["input"] = {**scene["input"], "label": t(scene["input"]["label"])}
            scene["outputs"] = [{**o, "label": t(o["label"])} for o in scene["outputs"]]
        if s["type"] == "approve" and scene.get("post"):
            scene["post"] = t(scene["post"])
        if s["type"] == "plans":
            scene["tiers"] = [
                {**x, "name": t(x["name"]), "note": t(x["note"]) if x.get("note") else ""}
                for x in scene["tiers"]
            ]
        if s["type"] == "word" and scene.get("rows"):  # Unveil's card: its people / items
            scene["rows"] = [
                {"name": t(x["name"]), "sub": t(x["sub"]) if x.get("sub") else ""}
                for x in scene["rows"]
            ]
        if script.get("style") == "rise":  # Rise: the climb and the sky move on scene by scene
            scene["n"], scene["of"] = len(scenes), len(script["scenes"])
        if s["type"] == "whiteboard":
            scene["parts"] = [
                {**x, "label": t(x["label"]), "value": t(x["value"]) if x.get("value") else ""}
                for x in scene["parts"]
            ]
        if s["type"] in (
            "fork",
            "shops",
        ):  # Parable: the two paths' signs; 3D · Street: the two shops
            scene["sides"] = [{**x, "label": t(x["label"])} for x in scene["sides"]]
        if s["type"] in ("tale", "tally") and scene.get("guest"):
            scene["guest"] = {
                **scene["guest"],
                "name": t(scene["guest"]["name"]) if scene["guest"].get("name") else "",
            }
        if s["type"] == "example":
            scene["people"] = [
                {
                    **x,
                    "name": t(x["name"]) if x.get("name") else "",
                    "text": t(x["text"]),
                    "value": t(x["value"]) if x.get("value") else "",
                }
                for x in scene["people"]
            ]
        if s["type"] in ("sectors", "ransom"):  # Cybersecurity: the businesses, the losses
            key = "sectors" if s["type"] == "sectors" else "losses"
            scene[key] = [{**x, "label": t(x["label"])} for x in scene.get(key) or []]
        if s["type"] == "moment" and scene.get(
            "prop"
        ):  # Life story: the words on the thing (its money as written)
            p = scene["prop"]
            scene["prop"] = {
                **p,
                "label": t(p["label"]) if p.get("label") else "",
                **(
                    {"lines": [{**x, "text": t(x["text"])} for x in p["lines"]]}
                    if p.get("lines")
                    else {}
                ),
            }
        if s["type"] == "ledger":
            scene["lines"] = [{**x, "label": t(x["label"])} for x in scene["lines"]]
            if scene.get("total"):
                scene["total"] = {**scene["total"], "label": t(scene["total"]["label"])}
        if s["type"] == "talk" and scene.get("item"):
            scene["item"] = {
                **scene["item"],
                "label": t(scene["item"]["label"]) if scene["item"].get("label") else "",
            }
        if s["type"] == "step":
            scene["n"] = sum(1 for x in scenes if x["type"] == "step") + 1  # STEP 1, 2, 3
        if s["type"] in (
            "rank",
            "tip",
            "qa",
        ):  # Top 5 counts down (#5 … #1); tips / questions count up (01 / 05)
            total = sum(1 for x in script["scenes"] if x["type"] == s["type"])
            before = sum(1 for x in scenes if x["type"] == s["type"])
            scene["n"], scene["of"] = (
                (total - before, total) if s["type"] == "rank" else (before + 1, total)
            )
        if not scene.get("image"):
            scene.pop("image", None)
        if s["type"] == "draw":  # Logo · Drawing: the logo's lines and the logo, cropped alike
            from app.images import logo_draw

            if scene.get("tagline"):
                scene["tagline"] = t(scene["tagline"]).replace("⟦", "").replace("⟧", "")
            art = logo_draw.line_art(logo)
            if art:
                scene["art"] = art
        scenes.append(scene)
    props = {
        # logoLight: a white logo → a dark corner chip; logoDark: a black logo → a faint light edge; logoSolid: a logo with its own ground → a rounded tile (canvas.jsx);
        # logoChip: the brand's choice for the corner — auto / card / none (shared.jsx chipPlain)
        "brand": {
            "name": brand.name,
            "color": f"#{r:02x}{g:02x}{b:02x}",
            "logo": logo,
            "logoLight": logo_is_light(logo),
            "logoDark": logo_is_dark(logo),
            "logoSolid": bool(logo) and not logo_prints(logo),
            "logoChip": getattr(brand, "logo_chip", None) or "auto",
        },
        "scenes": scenes,
        "style": script.get("style") or "tech",
    }
    if script.get("look"):
        props["look"] = script["look"]
    if script.get("style") == "cartoon":  # Story · Characters: the two people and their place
        props["cast"] = [
            {**c, "name": t(c["name"]) if c.get("name") else ""}
            for c in script.get("cast") or clean_cast(None)
        ]
        props["place"] = {"image": script["place_image"]} if script.get("place_image") else {}
    if script.get("style") == "street3d":  # 3D · Street: what the shop sells, who comes
        props["street"] = script.get("street") or {"goods": [], "people": []}
    if (
        script.get("style") == "picture"
    ):  # Picture story: the words on every picture, in the colours picked
        ink = clean_ink(script.get("ink"))
        for n, sc in enumerate(scenes):
            sc["ink"] = {"text": ink["text"], "accent": ink["accent"] or f"#{r:02x}{g:02x}{b:02x}"}
            sc["side"] = picture_side(
                n
            )  # where its words go — the picture was painted with room there
            sc["art"] = script.get("art") or "film"
            if sc["art"] == "stickcolor" and sc.get("image"):
                # how dark the picture is where its words go: light words on a dark one (a night room)
                sc["tone"] = title_tone(sc["image"], sc["side"])
    if script.get("style") == "illustrated":  # Illustrated: the main person
        props["cast"] = [
            {**c, "name": t(c["name"]) if c.get("name") else ""}
            for c in script.get("cast") or clean_lead(None)
        ]
    if script.get("style") in (
        "parable",
        "dialogue",
    ):  # Parable · Two paths / Dialogue: the two people
        props["cast"] = [
            {**c, "name": t(c["name"]) if c.get("name") else ""}
            for c in script.get("cast") or clean_duo(None)
        ]
    if script.get("style") == "podcast":  # the places, painted (app/images/doodle.py); the host's look
        host = script.get("host") or clean_host(None, khmer)
        props["places"] = list(script.get("place_images") or [])
        props["host"] = {
            "kicker": t("ផតខាស្ត៍" if khmer else "PODCAST"),
            "female": host.get("gender") != "male",
            "print": logo_prints(logo),
        }
    if (
        script.get("style") == "lifestory"
    ):  # Life story: the places, painted (app/images/doodle.py); the person we follow
        hero = script.get("hero") or clean_hero(None)
        props["places"] = list(script.get("place_images") or [])
        props["host"] = {
            "name": t(hero["name"]) if hero.get("name") else "",
            "female": hero.get("gender") != "male",
        }
    if (
        script.get("style") == "presenter"
    ):  # the host: her name strap, her greeting bubble, the print on her shirt
        host = script.get("host") or clean_host(None, khmer)
        props["host"] = {
            "name": t(host["name"]),
            "role": t(
                ("ជំនួយការផ្ទាល់របស់ " + brand.name if brand.name else "ជំនួយការផ្ទាល់")
                if khmer
                else (
                    f"{possessive(brand.name)} personal assistant"
                    if brand.name
                    else "Personal assistant"
                )
            ),
            "hello": "សួស្តី!" if khmer else "Hi!",
            "kicker": t("ប្រធានបទថ្មី" if khmer else "Today's topic"),
            "female": host.get("gender") != "male",
            "print": logo_prints(logo),
        }
    if (
        script.get("style") == "reaction"
    ):  # the animals in front, mouth closed / open (app/images/doodle.py draw_reaction)
        props["cast"] = script.get("cast_images") or []
    if script.get("ratio") == "16:9" and props["style"] in WIDE_STYLES:
        props["ratio"] = "16:9"
    library = music_tracks()
    tracks = library.get(script.get("mood") or "")
    if tracks:
        # a file under public/ — the template mixes it in; the voice adds ~20 % to the length
        props["music"] = track_for(tracks, 1.2 * sum(default_seconds(x) for x in scenes))
        if sum(1 for x in scenes if x["type"] == "chapter") >= 2:
            # a long video with chapters: a new track per chapter — the mood's own
            # tracks first, then the calm / corporate ones that sit under a talk
            playlist = random.sample(tracks, len(tracks))
            for mood in MUSIC_NEIGHBOURS.get(script.get("mood") or "") or ():
                playlist += random.sample(library.get(mood, []), len(library.get(mood, [])))
            props["musicList"] = list(dict.fromkeys(playlist))
    return props


def default_seconds(scene: dict) -> float:
    """A scene's length without a voice-over — mirrors MotionPost.jsx defaultSeconds."""
    kind = scene.get("type")
    if kind == "draw":  # Logo · Drawing: the whole 10-second intro
        return 10.0
    if kind == "chat":
        return 1.6 + 1.5 * min(4, len(scene.get("messages") or []))
    if kind == "list":
        return 1.8 + 1.0 * min(4, len(scene.get("items") or []))
    if kind == "split":
        return 2.6 + 0.9 * min(
            6,
            len((scene.get("left") or {}).get("points") or [])
            + len((scene.get("right") or {}).get("points") or []),
        )
    if kind == "options":
        return 2.4 + 0.35 * min(4, len(scene.get("options") or [])) + 6.0
    if kind == "notify":
        return 2.2 + 1.2 * min(4, len(scene.get("notes") or []))
    if kind == "flow":
        return 2.4 + 1.0 * min(4, len(scene.get("nodes") or []))
    if kind == "apps":
        return 2.6 + 0.35 * min(8, len(scene.get("apps") or []))
    if kind == "take":
        return 5.2 if scene.get("before") else 4.2
    if kind == "meme":
        return 4.6
    if kind == "collage":  # MotionPost/shared.jsx defaultSeconds says the same
        return 2.8 + 0.4 * min(
            5, max(len(scene.get("tiles") or []), len(scene.get("images") or []))
        )
    if kind == "statement":
        return 4.4
    if kind == "pedestal":
        return 4.6
    if kind in ("speak", "onair"):  # MotionPost/shared.jsx defaultSeconds says the same
        return 4.2
    if kind == "visit":
        return 4.4
    if (
        kind == "acronym"
    ):  # Cybersecurity · SOC's long-script scenes — shared.jsx defaultSeconds says the same
        return 3.0 + 0.6 * min(6, len(scene.get("term") or ""))
    if kind == "guard":
        return 4.8
    if kind == "sectors":
        return 2.8 + 0.5 * min(6, len(scene.get("sectors") or []))
    if kind == "breach":
        return 5.6
    if kind == "ransom":
        return 3.6 + 0.7 * min(4, len(scene.get("losses") or []))
    if kind == "moment":  # Life story — lifestory.jsx / shared.jsx defaultSeconds say the same
        return 4.8 if scene.get("prop") else 4.0
    if kind == "ledger":
        return (
            2.6 + 0.8 * min(5, len(scene.get("lines") or [])) + (0.8 if scene.get("total") else 0)
        )
    if kind == "takeaway":
        return 2.4 + 0.9 * min(3, len(scene.get("checks") or []))
    if kind == "react":  # MotionPost/shared.jsx defaultSeconds says the same
        return 4.2
    if kind == "punch":
        return 3.2
    if kind == "doodle":  # MotionPost/shared.jsx defaultSeconds says the same
        return 4.8 if scene.get("text") else 4.2
    if kind == "climb":  # MotionPost/shared.jsx defaultSeconds says the same
        return 4.6 if scene.get("text") else 4.0
    if kind in ("mirror", "grow"):
        return 4.8
    if kind == "summit":
        return 5.2
    if kind == "whiteboard":
        return 2.4 + 1.1 * min(4, len(scene.get("parts") or []))
    if kind == "example":
        return 2.6 + 1.3 * min(3, len(scene.get("people") or []))
    if kind == "remember":
        return 4.4
    if kind == "line":  # Dialogue · Two voices — shared.jsx defaultSeconds says the same
        return 3.6
    if kind in (
        "agenda",
        "keypoints",
        "twocol",
        "roadmap",
    ):  # Slides — shared.jsx defaultSeconds says the same
        return 6.5
    if kind in ("bignum", "barchart", "pullquote", "picture"):
        return 5.5
    if kind == "overload":  # AI service · Your AI team — shared.jsx defaultSeconds says the same
        return 4.4
    if kind == "crew":
        return 5.6
    if kind in ("pipeline", "approve"):
        return 5.0
    if kind == "gains":
        return 4.6
    if kind == "plans":
        return 4.8
    if kind == "shot":  # Picture story — shared.jsx defaultSeconds says the same
        return 5.0
    if kind == "wide":  # Illustrated — shared.jsx defaultSeconds says the same
        return 4.4
    if kind == "closeup":
        return 4.2
    if kind == "fact":
        return 4.6
    if kind == "shops":  # 3D · Street — shared.jsx defaultSeconds says the same
        return 4.6
    if kind == "crowd":
        return 5.0
    if kind == "chatter":
        return 2.0 + 1.0 * min(3, len(scene.get("messages") or []))
    if kind == "tale":  # Parable · Two paths — parable.jsx / shared.jsx defaultSeconds say the same
        return 4.2
    if kind in ("tally", "moral"):
        return 4.6
    if kind == "fork":
        return 4.8
    if kind == "talk":
        return 2.8 + min(2.4, len(scene.get("text") or "") / 30) + (0.6 if scene.get("item") else 0)
    if kind == "note":
        return 2.6 + 0.6 * min(5, len(scene.get("checks") or []))
    if kind == "metrics":
        return 3.6 + 0.8 * min(3, len(scene.get("rows") or []))
    if kind == "timeline":
        return 2.8 + 0.8 * min(4, len(scene.get("steps") or []))
    if kind == "qa":
        return 3.0 + min(5, len(scene.get("a") or "") / 30)
    if kind == "bars":
        return 3.4 + 0.4 * min(6, len(scene.get("data") or []))
    if kind == "reviews":
        return 3.4 + 0.6 * min(4, len(scene.get("cards") or []))
    if kind == "orbit":
        return 2.6 + 0.5 * min(6, len(scene.get("tags") or []))
    if kind == "chaos":
        return 2.6 + 0.4 * min(6, len(scene.get("cards") or []))
    if kind == "phones":
        return 1.4 + 1.2 * min(4, len(scene.get("words") or []))
    if kind == "gallery":
        return 3.0 + 0.4 * min(6, len(scene.get("cards") or []))
    if kind == "form":
        return (
            2.6 + 0.9 * min(3, len(scene.get("fields") or [])) + (1.4 if scene.get("toggle") else 0)
        )
    if kind == "word":
        return 3.0 + 0.6 * min(3, len(scene.get("rows") or []))
    if kind == "canvas":  # + the breath before a reveal (canvas.jsx scene.pause)
        return max(2.5, min(9.0, float(scene.get("seconds") or 5))) + min(
            1.5, max(0.0, float(scene.get("pause") or 0))
        )
    if kind == "hops":
        return 3.0 + 0.8 * min(5, len(scene.get("nodes") or []))
    if kind in ("send", "address", "lookup", "assemble"):
        return {"send": 4.2, "address": 4.4, "lookup": 5.2, "assemble": 4.6}[kind]
    if kind == "tasks":
        return (
            2.2 + 0.7 * min(4, len(scene.get("items") or [])) + (1.0 if scene.get("sticker") else 0)
        )
    if kind == "fanout":
        return (
            3.0
            + 0.8 * min(3, len(scene.get("outputs") or []))
            + 0.5 * min(2, len(scene.get("checks") or []))
        )
    if kind == "field":
        return 3.6 + 0.07 * len(scene.get("value") or "")
    if kind == "done":
        return 3.4
    if kind == "stack":
        return 1.6 + 1.1 * min(4, len(scene.get("images") or scene.get("shots") or []))
    if kind == "table":
        return 3.6 + 0.3 * min(6, len(scene.get("rows") or []))
    if kind == "roll":
        return 2.4 + 0.6 * min(5, len(scene.get("words") or []))
    if kind == "checklist":
        return 1.8 + 1.0 * min(6, len(scene.get("checks") or []))
    if kind == "recap":
        return 2.0 + 1.0 * min(5, len(scene.get("points") or []))
    return {
        "cta": 3.8,
        "product": 3.6,
        "chart": 5.2,
        "compare": 4.2,
        "character": 3.8,
        "myth": 5.0,
        "quote": 5.6,
        "beforeafter": 5.4,
        "result": 4.2,
        "review": 6.0,
        "customer": 4.4,
        "news": 5.0,
        "step": 4.8,
        "offer": 5.6,
        "screen": 5.0,
        "dashboard": 5.2,
        "chapter": 3.2,
        "board": 4.6,
        "launch": 4.2,
        "button": 4.6,
        "platform": 4.4,
        "pair": 3.8,
        "rank": 4.2,
        "choice": 5.0,
        "logos": 4.0,
        "tip": 4.6,
        "save": 3.4,
        "client": 5.0,
        "donut": 4.6,
    }.get(kind, 3.4)


def length_of(props: dict) -> int:
    scenes = props["scenes"]
    return round(
        sum(s.get("seconds") or default_seconds(s) for s in scenes)
        - TRANSITION_S * (len(scenes) - 1)
    )
