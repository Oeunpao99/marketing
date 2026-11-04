""""Auto": the AI picks the template (pick_style); attached screenshots and the design read from them.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import base64
import io
import re
from PIL import Image
from app.core.config import get_settings
from app.storage.media import read_media
from app.models import Product
from sqlalchemy.orm import Session

from app.video.motion.common import _line
from app.video.motion.templates.custom import _HEX, _lum, clean_look
from app.video.motion.screens import _vision_model
from app.video.motion.styles import TEMPLATE_GUIDE, WIDE_STYLES, style_for
from app.video.motion.own_script import own_design


def pick_style(
    idea: str, products: list[Product], has_product: bool, has_ui: bool = False, ratio: str = "9:16"
) -> tuple[str, str, str | None]:
    """(template, why) for a brief when Story is "Auto" — one quick AI call
    that reads what the video is about. Falls back to the simple rule (a chosen
    product = Sell, else Teach) when the AI can't answer."""
    from app.ai.content_ai import ContentAIError, _chat

    fallback = ("custom" if ratio == "16:9" else "tech" if has_product else "explainer", "", None)
    if not idea.strip():
        return fallback
    guide = "\n".join(
        f"- {k}: {v}" for k, v in TEMPLATE_GUIDE.items() if ratio != "16:9" or k in WIDE_STYLES
    )
    shape = (
        "\n\nTHE VIDEO MUST BE WIDE 16:9 — choose only from the templates above."
        if ratio == "16:9"
        else '\n\nAlso choose the shape: "16:9" when the brief is for YouTube, LinkedIn, a website, a '
        'presentation, a training or a meeting screen; "9:16" for TikTok, Reels, Facebook / Instagram '
        "or when nothing is said."
        if ratio == "auto"
        else ""
    )
    if own_design(idea):
        # scene by scene with its own looks, backgrounds, pauses and reveals:
        # only AI design can follow that — a fixed template would drop it
        return (
            "canvas",
            "Your script designs each scene — the AI builds every scene to match it",
            "16:9" if re.search(r"16\s*:\s*9|landscape|led screen|youtube", idea, re.I) else None,
        )
    names = ", ".join(p.name for p in products[:10]) or "(none)"
    try:
        out = _chat(
            [
                {
                    "role": "system",
                    "content": "You are a video director. Read the brief and choose the ONE video template that fits "
                    "what it is about and how it should be told. Templates:\n"
                    + guide
                    + shape
                    + "\n\nReturn JSON "
                    '{"template": "<one of the names above>", "ratio": "16:9" | "9:16", "why": "<max 12 words, in English>"}.',
                },
                {
                    "role": "user",
                    "content": f"THE BRAND'S PRODUCTS: {names}\nA PRODUCT IS CHOSEN: {'yes' if has_product else 'no'}\n"
                    f"A SCREENSHOT OF THEIR APP IS ATTACHED: {'yes — prefer custom or demo' if has_ui else 'no'}\n\nTHE BRIEF:\n{idea.strip()[:3000]}",
                },
            ],
            get_settings().azure_openai_deployment,
            max_tokens=1500,
            effort="low",
        )
    except ContentAIError:
        return fallback
    style = str(out.get("template") or "").strip().lower()
    if style not in TEMPLATE_GUIDE or (ratio == "16:9" and style not in WIDE_STYLES):
        return fallback
    suggested = out.get("ratio") if out.get("ratio") in ("16:9", "9:16") else None
    return style, _line(out.get("why"), 120), suggested


# ── A reference screenshot of the brand's own app → the video's design ─────
def _shot_from_blob(blob: bytes, name: str, note: str = "") -> dict | None:
    try:
        im = Image.open(io.BytesIO(blob))
        im.thumbnail((1600, 1600))
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=90)
    except Exception:  # noqa: BLE001 — not a picture
        return None
    uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    return {"id": 0, "name": name, "note": note, "uri": uri, "w": im.width, "h": im.height}


def design_from_image(shot: dict, brand_hex: str) -> dict | None:
    """The design of an app screenshot the person attached — the look the
    video's drawn screens copy: light/dark, colours, card colour, corner style,
    the app's name and menu items. None when the AI can't read it."""
    from app.ai.content_ai import ContentAIError, _chat

    try:
        out = _chat(
            [
                {
                    "role": "system",
                    "content": "You are a UI designer. Read the design of this app / website screenshot. Return JSON "
                    '{"mode": "light" | "dark", "bg": "#RRGGBB" (page background), "surface": "#RRGGBB" (card / panel '
                    'colour), "a": "#RRGGBB" (the main accent — buttons, active items), "b": "#RRGGBB" (a second accent, '
                    'or a lighter / darker shade of a), "radius": "sharp" | "soft" | "round" (corners of cards and '
                    'buttons), "app": "the app / product name if visible, else \\"\\"", "nav": [up to 5 menu / tab '
                    'labels as written], "screen": "what this screen is, max 15 words"}. Colours sampled from the '
                    "screenshot, not guessed.",
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "The screenshot:"},
                        {"type": "image_url", "image_url": {"url": shot["uri"], "detail": "high"}},
                    ],
                },
            ],
            _vision_model(),
            max_tokens=3000,
        )
    except ContentAIError:
        return None
    look = clean_look(
        {**out, "background": "grid" if out.get("mode") != "light" else "dots"}, brand_hex
    )
    surface = str(out.get("surface") or "")
    if _HEX.fullmatch(surface) and (
        (look["mode"] == "light" and _lum(surface) > 0.6)
        or (look["mode"] == "dark" and _lum(surface) < 0.12)
    ):
        look["card"] = surface
    look["radius"] = (
        out.get("radius") if out.get("radius") in ("sharp", "soft", "round") else "soft"
    )
    nav = [x for x in (_line(n, 24) for n in (out.get("nav") or [])) if x][:5]
    app_name = _line(out.get("app"), 40)
    if app_name:
        look["kicker"] = app_name.upper()[:20]
    return {"look": look, "nav": nav, "app": app_name, "screen": _line(out.get("screen"), 140)}


def _design_prompt(design: dict) -> str:
    look = design["look"]
    parts = [
        f"{look['mode']} theme",
        f"accent {look['a']}",
        f"{look['radius']} corners",
    ]
    text = (
        "\n\nTHE BRAND'S OWN APP DESIGN (from the screenshot they attached — screenshot 1): "
        + ", ".join(parts)
        + "."
    )
    if design.get("app"):
        text += f" The app is called {design['app']}."
    if design.get("nav"):
        text += (
            " Its menu: "
            + ", ".join(design["nav"])
            + " — use these real names in `step`, `flow` and `dashboard` scenes."
        )
    if design.get("screen"):
        text += f" Screenshot 1 shows: {design['screen']}."
    return text + ' The video\'s look is set from this design — keep "look" close to it.'


MAX_ATTACHED = 6


def attached_shots(ref_url: str, ref_urls: list[str] | None) -> list[dict]:
    """The screenshots attached after the first one (screenshots 2, 3…), in
    the order attached — the plan and the video number them the same way."""
    urls = [
        u for u in dict.fromkeys(str(u or "")[:500] for u in (ref_urls or [])) if u and u != ref_url
    ][: MAX_ATTACHED - 1]
    out = []
    for u in urls:  # numbered as they land (an unreadable one takes no number)
        shot = _shot_from_blob(
            read_media(u) or b"", f"Your app (attached screenshot {len(out) + 2})"
        )
        if shot:
            out.append(shot)
    return out


def reference_shot(db: Session, ref_url: str, brand_hex: str) -> tuple[dict | None, dict | None]:
    """(screenshot, design) for an attached reference, or (None, None)."""
    if not ref_url:
        return None, None
    blob = read_media(ref_url)
    shot = _shot_from_blob(blob or b"", "Your app (the attached screenshot)") if blob else None
    if not shot:
        return None, None
    design = design_from_image(shot, brand_hex)
    if design:
        shot["note"] = design.get("screen") or ""
    return shot, design


def _style_of(goal: str, product_id: int | None) -> str:
    # Auto: a chosen product means a sales video, otherwise a teaching one.
    return (
        style_for(goal)
        if goal not in ("auto", "")
        else ("tech" if product_id is not None else "explainer")
    )
