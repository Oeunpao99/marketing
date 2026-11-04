"""The brand's screenshots: listed for the storyboard, described and searched by the vision model (locate_targets).

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/video/motion/__init__.py."""

from __future__ import annotations

import base64
import io
from PIL import Image
from app.core.config import get_settings
from app.storage.media import read_media
from app.models import BrandAsset
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.video.motion.common import _line


# The brand's app / product screenshots — shown (and zoomed into) by `screen` scenes.
MAX_SHOTS = 8


def brand_screens(db: Session, brand_id: int) -> list[dict]:
    """[{id, name, note, uri, w, h}] — the Brand kit's screenshots, oldest
    first (their numbers in the prompt), embedded and sized for the video."""
    rows = db.scalars(
        select(BrandAsset)
        .where(BrandAsset.brand_id == brand_id, BrandAsset.kind == "screenshot")
        .order_by(BrandAsset.id)
    ).all()[:MAX_SHOTS]
    out = []
    for a in rows:
        try:
            im = Image.open(io.BytesIO(read_media(a.url) or b""))
            im.thumbnail((1600, 1600))
            buf = io.BytesIO()
            im.convert("RGB").save(buf, "JPEG", quality=90)
        except Exception:  # noqa: BLE001 — an unreadable upload is just left out
            continue
        uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        out.append(
            {"id": a.id, "name": a.name, "note": a.note, "uri": uri, "w": im.width, "h": im.height}
        )
    return out


def _shots_prompt(shots: list[dict]) -> str:
    if not shots:
        return "\n\nTHE BRAND'S SCREENSHOTS: none — don't use `screen` scenes."
    lines = [
        f"{i}. {s['name'] or 'Screenshot'}" + (f" — {s['note']}" if s.get("note") else "")
        for i, s in enumerate(shots, 1)
    ]
    return "\n\nTHE BRAND'S SCREENSHOTS (a `screen` scene shows one by its number):\n" + "\n".join(
        lines
    )


def _vision_model() -> str:
    cfg = get_settings()
    return cfg.azure_openai_vision_deployment or cfg.azure_openai_deployment


def describe_screen(blob: bytes) -> str:
    """One line on what a screenshot shows (the Brand kit's note, so the
    storyboard knows when to use it). "" when the AI can't tell."""
    from app.ai.content_ai import ContentAIError, _chat

    try:
        im = Image.open(io.BytesIO(blob))
        im.thumbnail((1280, 1280))
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=85)
        out = _chat(
            [
                {
                    "role": "system",
                    "content": "You describe app / website screenshots for a video storyboard writer. In one "
                    "sentence (max 25 words): which product or app it is if you can tell, which screen, and its "
                    'main buttons or areas. Return JSON {"note": "..."}.',
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this screenshot."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": "data:image/jpeg;base64,"
                                + base64.b64encode(buf.getvalue()).decode()
                            },
                        },
                    ],
                },
            ],
            _vision_model(),
            max_tokens=2000,
        )
    except (ContentAIError, OSError, ValueError):
        return ""
    return _line(out.get("note"), 300)


def _box(value) -> list[float] | None:
    """[x, y, w, h] as fractions of the picture, or None when it isn't one."""
    if not isinstance(value, list) or len(value) != 4:
        return None
    try:
        x, y, w, h = (float(v) for v in value)
    except (TypeError, ValueError):
        return None
    if not (
        0 <= x < 1
        and 0 <= y < 1
        and 0.004 < w <= 1
        and 0.004 < h <= 1
        and x + w <= 1.02
        and y + h <= 1.02
    ):
        return None
    return [round(x, 4), round(y, 4), round(min(w, 1 - x), 4), round(min(h, 1 - y), 4)]


def locate_targets(scenes: list[dict], shots: list[dict]) -> None:
    """Find each `screen` scene's target on its screenshot (one vision call)
    and set scene["focus"]; a target that isn't found shows the whole screen.
    A Reaction meme moment's ``circle`` the same way → scene["mark"] (the red
    circle, % of the screenshot); not found = no circle."""
    from app.ai.content_ai import ContentAIError, _chat

    asks = [
        (i, s)
        for i, s in enumerate(scenes)
        if s["type"] == "screen"
        and s.get("target")
        and 1 <= s.get("shot", 0) <= len(shots)
        and not s.get("focus")
    ]
    asks += [
        (i, s)
        for i, s in enumerate(scenes)
        if s.get("circle") and 1 <= s.get("shot", 0) <= len(shots) and not s.get("mark")
    ]
    if not asks:
        return
    used = sorted({s["shot"] for _, s in asks})
    content: list[dict] = [
        {
            "type": "text",
            "text": "Find these elements:\n"
            + "\n".join(
                f"{i}. In screenshot {s['shot']}: {s.get('target') or s.get('circle')}"
                for i, s in asks
            ),
        }
    ]
    for n in used:
        content += [
            {"type": "text", "text": f"Screenshot {n}:"},
            {"type": "image_url", "image_url": {"url": shots[n - 1]["uri"], "detail": "high"}},
        ]
    try:
        out = _chat(
            [
                {
                    "role": "system",
                    "content": "You locate user-interface elements in app screenshots. For each request give the "
                    "element's bounding box as fractions of that screenshot's width and height: [x, y, w, h], x/y = "
                    "its top-left corner (0-1). Tight around the element. null when it isn't visible. Return JSON "
                    '{"boxes": [{"id": <request number>, "box": [x, y, w, h] | null}]}.',
                },
                {"role": "user", "content": content},
            ],
            _vision_model(),
            max_tokens=4000,
        )
    except ContentAIError:
        out = {}
    found = {
        b.get("id"): _box(b.get("box")) for b in (out.get("boxes") or []) if isinstance(b, dict)
    }
    for i, s in asks:
        if s.get("circle"):  # a loose circle round it, a little bigger than the box
            box = found.get(i)
            if box:
                x, y, w, h = box
                s["mark"] = {
                    "x": round((x + w / 2) * 100, 1),
                    "y": round((y + h / 2) * 100, 1),
                    "w": round(min(95, w * 100 * 1.35 + 6), 1),
                    "h": round(min(60, h * 100 * 1.5 + 3), 1),
                }
            continue
        if found.get(i):
            s["focus"] = found[i]
        else:
            s["action"] = "zoom"
