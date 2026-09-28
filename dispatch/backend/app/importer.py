"""Past posts made directly on a connected Page — imported so Analytics (and
the learn-from-results loop) see the whole Page, not just what went out
through ContentFlow.

Runs when a Facebook / Instagram channel is connected (last LOOKBACK_DAYS,
at most MAX_PER_CHANNEL posts), then again with every metric-collector tick
(app/scheduler.py) for RECENT_DAYS, so posts made on the Page later keep
showing up. Each import is a Post with ``origin="native"`` and one "posted"
PostTarget carrying the platform's post id — so every existing insights path
(live numbers, snapshots, growth charts, learning) works on it unchanged, and
the delivery worker never touches it (it only sends "queued" targets).

A post ContentFlow published itself is recognised by its stored external id —
the post id, or for a Facebook video the Video id (``alt_id``) — and skipped.
"""

from __future__ import annotations

import logging
import threading
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import meta
from app.database import SessionLocal
from app.models import Channel, Post, PostTarget

log = logging.getLogger("app.importer")

LOOKBACK_DAYS = 90  # first import after connecting
RECENT_DAYS = 7  # each background tick after that
MAX_PER_CHANNEL = 200
PLATFORMS = ("facebook", "instagram")


def _title(caption: str, platform: str) -> str:
    first = next((line.strip() for line in caption.splitlines() if line.strip()), "")
    if not first:
        return f"{platform.capitalize()} post"
    return first if len(first) <= 90 else first[:87].rstrip() + "…"


def import_channel(db: Session, ch: Channel, days: int = LOOKBACK_DAYS) -> int:
    """Import this channel's posts from the last ``days`` that ContentFlow
    doesn't already have. Returns how many were added. Raises meta.MetaError
    when the platform refuses (e.g. a missing permission)."""
    slug = ch.platform.slug if ch.platform else ""
    cfg = ch.config or {}
    token = cfg.get("access_token")
    if slug not in PLATFORMS or ch.status != "live" or not token:
        return 0
    since = datetime.now(UTC) - timedelta(days=days)
    if slug == "facebook":
        if not cfg.get("page_id"):
            return 0
        items = meta.list_page_posts(token, cfg["page_id"], since, MAX_PER_CHANNEL)
    else:
        if not cfg.get("ig_user_id"):
            return 0
        items = meta.list_instagram_media(token, cfg["ig_user_id"], since, MAX_PER_CHANNEL)

    # Every post id the brand already has on this platform — any of its
    # channel rows for it, so a Page reconnected into a new row still matches.
    sibling_ids = select(Channel.id).where(Channel.brand_id == ch.brand_id, Channel.platform_id == ch.platform_id)
    known = set(db.scalars(select(PostTarget.external_id).where(PostTarget.channel_id.in_(sibling_ids))))

    added = 0
    for it in items:
        if it["id"] in known or (it["alt_id"] and it["alt_id"] in known):
            continue
        title = _title(it["caption"], slug)
        post = Post(brand_id=ch.brand_id, title=title, status="posted", origin="native")
        db.add(post)
        db.flush()
        db.add(
            PostTarget(
                post_id=post.id,
                channel_id=ch.id,
                caption=it["caption"],
                title=title,
                scheduled_for=it["published_at"],
                published_at=it["published_at"],
                status="posted",
                external_id=it["id"],
                platform_options={"imported": {"picture": it["picture"], "url": it["url"], "kind": it["kind"]}},
            )
        )
        known.add(it["id"])
        added += 1
    db.commit()
    return added


def import_all(db: Session, days: int = RECENT_DAYS) -> int:
    """Background tick: pick up new posts on every connected Page."""
    total = 0
    chans = db.scalars(select(Channel).where(Channel.status == "live")).all()
    for ch in chans:
        if not ch.platform or ch.platform.slug not in PLATFORMS:
            continue
        try:
            total += import_channel(db, ch, days)
        except Exception as exc:  # noqa: BLE001 - one Page's refusal mustn't stop the rest
            db.rollback()
            log.warning("importing posts for channel %s failed: %s", ch.id, exc)
    return total


def import_in_background(channel_ids: list[int]) -> None:
    """Right after connecting: import the last LOOKBACK_DAYS without making
    the person wait for it."""

    def run() -> None:
        db = SessionLocal()
        try:
            for cid in channel_ids:
                ch = db.get(Channel, cid)
                if ch is None:
                    continue
                try:
                    n = import_channel(db, ch)
                    log.info("imported %d past post(s) for channel %s", n, cid)
                except Exception as exc:  # noqa: BLE001
                    db.rollback()
                    log.warning("importing past posts for channel %s failed: %s", cid, exc)
        finally:
            db.close()

    if channel_ids:
        threading.Thread(target=run, daemon=True, name="import-past-posts").start()
