"""A ready-to-post caption for each generated image / video.

When an image or video someone made in the AI Agent / Video Story finishes,
``write_in_background`` has the same caption engine as Auto-generate
(content_ai.generate_ideas — pain → cost → product → ✓ capabilities → example
→ CTA, Khmer polish, the brand's learnings) write one caption for it, grounded
in the brand's products and in what the media shows (its prompt). It's stored
on the Video row, so the Library's "Use" opens Compose with it filled in.

Auto-generate's own media reuse the caption of the idea they were made for
(app/content_scheduler.py) — no second AI call. One caption = one AI text
call, charged to the workspace like every other (app/billing.py).
"""

from __future__ import annotations

import logging
import threading

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import billing
from app.content_ai import ANGLES, GOALS, ContentAIError, generate_ideas
from app.database import SessionLocal
from app.learning import brand_learnings
from app.models import Automation, Brand, Product, Video

log = logging.getLogger("app.media_caption")


def _brief(kind: str, prompt: str, angle: str = "", goal: str = "") -> str:
    lines = [
        f"Write the caption for ONE {kind} that was just generated for this brand — "
        "it is posted together with that "
        f"{kind}, so the caption must fit what it shows.",
        f"What the {kind} shows (the brief it was made from): {prompt.strip()[:1500]}",
    ]
    if angle in ANGLES:
        lines.append(f"Use the {angle} angle.")
    if goal in GOALS:
        lines.append(f"Use the {goal} goal.")
    return " ".join(lines)


def write_caption(db: Session, video: Video, prompt: str, angle: str = "", goal: str = "") -> str:
    """Write (or rewrite) this media's caption now. Raises ContentAIError."""
    brand = db.get(Brand, video.brand_id) if video.brand_id else None
    if brand is None:
        raise ContentAIError("Pick a brand for this image first — the caption is written from its products.")
    kind = "video" if (video.tag or "").endswith("video") or (video.url or "").endswith(".mp4") else "image"
    products = db.scalars(select(Product).where(Product.brand_id == brand.id).order_by(Product.name)).all()
    automation = db.scalar(select(Automation).where(Automation.brand_id == brand.id))
    learnings = (
        brand_learnings(db, brand.id)["prompt"] if automation is None or automation.learn_from_results else ""
    )
    ideas = generate_ideas(
        brand.name,
        brand.lang,
        list(products),
        _brief(kind, prompt, angle, goal),
        1,
        brand.voice_examples or "",
        learnings,
    )
    idea = ideas[0]
    video.caption = idea["caption"]
    video.caption_angle = idea.get("angle") or ""
    video.caption_status = "ready"
    db.commit()
    return video.caption


def write_in_background(video_id: int, prompt: str) -> None:
    """Right after a generation finishes: mark it "writing" and write its
    caption on a thread, so the render itself is never held up."""
    db = SessionLocal()
    try:
        video = db.get(Video, video_id)
        if video is None or video.brand_id is None or video.caption:
            return
        video.caption_status = "writing"
        db.commit()
        ws = video.workspace_id
    finally:
        db.close()

    def run() -> None:
        billing.bind(ws)  # background thread: charge the right workspace
        s = SessionLocal()
        try:
            v = s.get(Video, video_id)
            if v is not None:
                write_caption(s, v, prompt)
        except Exception as exc:  # noqa: BLE001 - a missing caption must not break anything
            s.rollback()
            log.warning("caption for media %s failed: %s", video_id, exc)
            v = s.get(Video, video_id)
            if v is not None:
                v.caption_status = "failed"
                s.commit()
        finally:
            s.close()

    threading.Thread(target=run, daemon=True, name=f"caption-{video_id}").start()
