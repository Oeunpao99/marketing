"""Read models + actions shaped for the five operational screens.

These sit on top of the same tables the generic ``/api/<resource>`` endpoints
expose; they just pre-join the data so the React pages stay thin.
"""

import threading
import time
from datetime import UTC, date, datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import linkedin, meta, tiktok
from app.config import get_settings
from app.database import get_db
from app.media import local_path_for
from app.models import (
    Automation,
    Brand,
    Channel,
    Draft,
    GenerationJob,
    Platform,
    Post,
    PostTarget,
    Video,
)
from app.publishers import PublishError, publish, verify_telegram
from app.security import sign_payload, verify_payload
from app.tenancy import current_workspace_id, owned, scope

# Every route here is workspace-scoped (app/tenancy.py) and mounted behind
# login in app/main.py — except ``public_router``: the OAuth callbacks, which
# the platforms redirect a bare browser to (no Authorization header). Those
# trust the signed ``state`` minted by the authed /start route instead.
router = APIRouter(prefix="/views", tags=["Views"])
public_router = APIRouter(prefix="/views", tags=["Views"])

# The portal presents every time on a Phnom Penh clock (UTC+7, no DST),
# regardless of where the server or the viewer sits.
PHNOM_PENH = timezone(timedelta(hours=7))


def _clock(dt: datetime | None) -> str:
    """A stored instant as "HH:MM" on a Phnom Penh wall clock."""
    if dt is None:
        return "--:--"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(PHNOM_PENH).strftime("%H:%M")


def _run_publish(db: Session, target: PostTarget) -> dict:
    """Deliver one target and persist the outcome."""
    channel = db.get(Channel, target.channel_id)
    if channel is None:
        raise HTTPException(404, "Channel not found for this target.")
    if channel.status == "off":
        raise HTTPException(409, "Channel is not connected.")
    video = db.get(Video, target.post.video_id) if target.post and target.post.video_id else None

    # Mark the hand-off so a polling UI can show a "posting…" state.
    target.status = "posting"
    db.commit()

    try:
        result = publish(target, channel, video)
    except PublishError as exc:
        target.status = "failed"
        target.error = str(exc)
        db.commit()
        _push_outcome(db, target, channel, failed=str(exc))
        return {"id": target.id, "status": "failed", "error": str(exc)}

    now = datetime.now(UTC)
    target.status = "posted"
    target.error = ""
    target.external_id = result.external_id
    target.published_at = now
    channel.last_post_at = now
    if target.post and all(t.status == "posted" for t in target.post.targets):
        target.post.status = "posted"
    db.commit()
    _push_outcome(db, target, channel)
    return {
        "id": target.id,
        "status": "posted",
        "external_id": result.external_id,
        "detail": result.detail,
    }


def _push_outcome(db: Session, target: PostTarget, channel: Channel, failed: str | None = None) -> None:
    """Phone / desktop push for a delivery result (app/push.py). One
    notification per post (``tag``), so a post going to 3 channels updates the
    same notification instead of stacking three."""
    from app.push import notify_workspace

    post = target.post
    brand = db.get(Brand, post.brand_id) if post else None
    if brand is None:
        return
    title_text = target.title or (post.title if post else "") or "Your post"
    platform = channel.platform.name if channel.platform else "your channel"
    if failed:
        notify_workspace(
            brand.workspace_id, "failed", f"Couldn’t post to {platform}",
            f"{brand.name} · {title_text} — {failed}", "/", f"post-{target.post_id}",
        )
    else:
        notify_workspace(
            brand.workspace_id, "published", f"Posted to {platform} ✓",
            f"{brand.name} · {title_text}", "/", f"post-{target.post_id}",
        )


def _brand_map(db: Session, ws: int) -> dict[int, Brand]:
    return {b.id: b for b in db.scalars(select(Brand).where(scope(Brand, ws))).all()}


def _scoped(db: Session, model, ws: int):
    return db.scalars(select(model).where(scope(model, ws))).all()


def _platform_map(db: Session) -> dict[int, Platform]:
    return {p.id: p for p in db.scalars(select(Platform)).all()}


@router.get("/today")
def today(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    brands = _brand_map(db, ws)
    plats = _platform_map(db)
    chans = {c.id: c for c in _scoped(db, Channel, ws)}
    videos = {v.id: v for v in _scoped(db, Video, ws)}
    targets = db.scalars(
        select(PostTarget)
        .options(selectinload(PostTarget.post))
        .where(scope(PostTarget, ws))
        .order_by(PostTarget.scheduled_for.nulls_last(), PostTarget.id)
    ).all()
    out = []
    for t in targets:
        ch = chans.get(t.channel_id)
        brand = brands.get(t.post.brand_id) if t.post else None
        plat = plats.get(ch.platform_id) if ch else None
        video = videos.get(t.post.video_id) if t.post else None
        out.append(
            {
                "id": t.id,
                "post_id": t.post_id,
                "time": _clock(t.scheduled_for),
                "scheduled_for": t.scheduled_for,
                "brand_id": brand.id if brand else None,
                "brand_slug": brand.slug if brand else None,
                "brand_name": brand.name if brand else "?",
                "channel": plat.name if plat else "?",
                "title": t.title or (t.post.title if t.post else ""),
                "caption": t.caption,
                "status": t.status,
                "error": t.error or "",
                "video_id": video.id if video else None,
                "video_filename": video.filename if video else None,
                "video_url": video.url if video else None,
            }
        )
    return out


@router.get("/channels")
def channels_view(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    plats = _platform_map(db)
    brands = db.scalars(select(Brand).where(scope(Brand, ws)).order_by(Brand.name)).all()
    chans = _scoped(db, Channel, ws)
    result = []
    for b in brands:
        rows = []
        for c in chans:
            if c.brand_id != b.id:
                continue
            plat = plats.get(c.platform_id)
            rows.append(
                {
                    "id": c.id,
                    "platform": plat.name if plat else "?",
                    "platform_slug": plat.slug if plat else "?",
                    "char_limit": plat.char_limit if plat else 2200,
                    "supports_title": plat.supports_title if plat else False,
                    "post_as": plat.post_as if plat else "",
                    "handle": c.handle,
                    "status": c.status,
                    "token_note": c.token_note,
                    "last_post_at": c.last_post_at,
                    "configured": bool(c.config),
                    "config_keys": sorted((c.config or {}).keys()),
                    # Whether this channel's token actually carries the
                    # video.publish scope (TikTok Direct Post) — see
                    # app/tiktok.py's module docstring. False for every
                    # non-TikTok channel too, harmlessly.
                    "tiktok_direct_post": "video.publish"
                    in (c.config or {}).get("scope", "").split(","),
                }
            )
        result.append(
            {
                "id": b.id,
                "slug": b.slug,
                "name": b.name,
                "lang": b.lang,
                "note": b.note,
                "channels": rows,
            }
        )
    return result


@router.get("/review")
def review_view(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    brands = _brand_map(db, ws)
    drafts = db.scalars(
        select(Draft)
        .where(scope(Draft, ws), Draft.status == "waiting")
        .order_by(Draft.generated_at)
    ).all()
    video_ids = [d.video_id for d in drafts if d.video_id is not None]
    videos = (
        {v.id: v for v in db.scalars(select(Video).where(Video.id.in_(video_ids)))}
        if video_ids
        else {}
    )
    return [
        {
            "id": d.id,
            "brand_id": d.brand_id,
            "brand_slug": brands[d.brand_id].slug if d.brand_id in brands else None,
            "brand_name": brands[d.brand_id].name if d.brand_id in brands else "?",
            "title": d.title,
            "body": d.body,
            "insight": d.insight,
            "planned_for": d.planned_for,
            "length_seconds": d.length_seconds,
            "generated_at": d.generated_at,
            "source": d.source,
            "fit_score": d.fit_score,
            "fact_issues": d.fact_issues,
            "video_id": d.video_id,
            "video_url": videos[d.video_id].url if d.video_id in videos else None,
        }
        for d in drafts
    ]


@router.get("/calendar")
def calendar_view(
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    """Every planned idea (any status) with a calendar slot, for the Calendar page."""
    from app.content_scheduler import _today  # local import avoids a module cycle

    start = start or _today() - timedelta(days=7)
    end = end or _today() + timedelta(days=30)
    brands = _brand_map(db, ws)
    drafts = db.scalars(
        select(Draft)
        .where(
            scope(Draft, ws),
            Draft.planned_for.is_not(None),
            Draft.planned_for >= start,
            Draft.planned_for <= end,
        )
        .order_by(Draft.planned_for, Draft.brand_id)
    ).all()
    return [
        {
            "id": d.id,
            "brand_id": d.brand_id,
            "brand_slug": brands[d.brand_id].slug if d.brand_id in brands else None,
            "brand_name": brands[d.brand_id].name if d.brand_id in brands else "?",
            "title": d.title,
            "body": d.body,
            "insight": d.insight,
            "planned_for": d.planned_for,
            "status": d.status,
            "source": d.source,
            "generated_at": d.generated_at,
        }
        for d in drafts
    ]


@router.get("/auto")
def auto_view(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    from app.content_scheduler import run_status  # local import avoids a module cycle

    brands = _brand_map(db, ws)
    autos = _scoped(db, Automation, ws)
    return [
        {
            "id": a.id,
            "brand_id": a.brand_id,
            "brand_slug": brands[a.brand_id].slug if a.brand_id in brands else None,
            "brand_name": brands[a.brand_id].name if a.brand_id in brands else "?",
            "brand_lang": brands[a.brand_id].lang if a.brand_id in brands else "",
            "brand_voice": brands[a.brand_id].voice_examples if a.brand_id in brands else "",
            "enabled": a.enabled,
            "run_at": a.run_at.strftime("%H:%M"),
            "videos_per_day": a.videos_per_day,
            "topic_source": a.topic_source,
            "require_approval": a.require_approval,
            "auto_media": a.auto_media,
            "auto_channel_ids": a.auto_channel_ids,
            "post_at": a.post_at.strftime("%H:%M") if a.post_at else None,
            "last_run_on": a.last_run_on,
            "run": run_status(a.id),
        }
        for a in sorted(autos, key=lambda x: x.brand_id)
    ]


@router.post("/auto/{automation_id}/run-now", status_code=202)
def auto_run_now(
    automation_id: int, force: bool = False, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Start writing today's batch for one brand right now, in the
    background, ignoring its "write at" time. Returns at once with a status
    the page polls at ``GET .../run`` (percent, current step, and the result
    when done). ``force=true`` discards today's batch and writes a fresh one
    (app/content_scheduler.py's ``force_regenerate``); without it, a brand
    that already ran today just reports the ideas it already has."""
    from app.content_scheduler import start_background_run

    owned(db, Automation, automation_id, ws)
    return start_background_run(automation_id, force)


@router.get("/auto/{automation_id}/run")
def auto_run_status(
    automation_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    from app.content_scheduler import run_status

    owned(db, Automation, automation_id, ws)
    return run_status(automation_id) or {"automation_id": automation_id, "status": "idle"}


@router.get("/library")
def library_view(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Every AI-generated image / video, newest first — the generation gallery."""
    brands = _brand_map(db, ws)
    videos = {v.id: v for v in _scoped(db, Video, ws)}
    jobs = db.scalars(
        select(GenerationJob)
        .where(scope(GenerationJob, ws), GenerationJob.video_id.is_not(None))
        .order_by(GenerationJob.created_at.desc(), GenerationJob.id.desc())
    ).all()
    out = []
    for j in jobs:
        v = videos.get(j.video_id)
        if v is None:
            continue
        b = brands.get(j.brand_id)
        out.append(
            {
                "id": j.id,
                "kind": j.kind,
                "status": j.status,
                "prompt": j.prompt,
                "aspect_ratio": j.aspect_ratio,
                "seconds": j.seconds,
                "created_at": j.created_at,
                "brand_id": j.brand_id,
                "brand_slug": b.slug if b else None,
                "brand_name": b.name if b else "No brand",
                "video_id": v.id,
                "url": v.url,
                "filename": v.filename,
                "resolution": v.resolution,
                "input_tokens": j.input_tokens or 0,
                "output_tokens": j.output_tokens or 0,
                "total_tokens": j.total_tokens or 0,
            }
        )
    return out


@router.delete("/library/{job_id}", status_code=204)
def library_delete(job_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Remove a generation and its file — unless a post already uses the asset."""
    job = owned(db, GenerationJob, job_id, ws, "Generation")
    if job.video_id:
        video = db.get(Video, job.video_id)
        if video is not None:
            in_use = db.scalar(
                select(func.count()).select_from(Post).where(Post.video_id == video.id)
            )
            if not in_use:
                path = local_path_for(video.url)
                if path is not None:
                    path.unlink(missing_ok=True)
                db.delete(video)
    db.delete(job)
    db.commit()
    return None


# ── insights — live per-post numbers pulled from each platform ───────────
# On-demand, not stored: every open of the Insights page fans out one live
# API call per published post to that post's platform (in a small thread pool
# — these are blocking httpx calls). Capped by ``limit`` to keep that bounded.
_INSIGHTS_DEFAULT_LIMIT = 30


class _MetricsCache:
    """Thread-safe, one-per-request cache for ``_post_metrics``. Per-key
    locking, not a single global lock: the worker pool fires every row at
    once, so a plain dict's check-then-set has a real race (every thread
    misses the cache before the first write lands — this isn't rare, it
    happens on essentially every request with more than one row sharing a
    key). A caller that finds its key already being computed waits for that
    result instead of duplicating the call; different keys still run in
    parallel."""

    def __init__(self) -> None:
        self._meta_lock = threading.Lock()
        self._key_locks: dict[str, threading.Lock] = {}
        self._data: dict[str, object] = {}

    def get_or_set(self, key: str, compute):
        with self._meta_lock:
            key_lock = self._key_locks.setdefault(key, threading.Lock())
        with key_lock:
            if key not in self._data:
                self._data[key] = compute()
            return self._data[key]


def _post_metrics(platform_slug: str, config: dict, external_id: str, cache: "_MetricsCache") -> dict:
    """Live like/comment/share/view numbers for one published post.

    Returns ``{"status": "ok"|"processing"|"unavailable", "metrics": {...},
    "url": str|None, "note": str}`` — never raises; a platform error becomes
    an "unavailable" row so one bad post doesn't blank the whole page.

    ``cache`` is shared across every post in one ``/insights`` call — mainly
    for Telegram, where the "metric" (subscriber count) is really per-channel,
    not per-post: without it, 10 posts from the same Telegram channel meant 10
    identical live calls to Telegram on every page load.
    """
    try:
        if platform_slug == "facebook":
            from app import meta

            token = config.get("access_token")
            if not token:
                return {"status": "unavailable", "note": "Channel not connected.", "metrics": {}}
            data = meta.page_post_insights(token, external_id)
            return {"status": "ok", "metrics": data, "url": data.get("url"), "note": ""}
        if platform_slug == "instagram":
            from app import meta

            token = config.get("access_token")
            if not token:
                return {"status": "unavailable", "note": "Channel not connected.", "metrics": {}}
            data = meta.instagram_media_insights(token, external_id)
            return {"status": "ok", "metrics": data, "url": data.get("url"), "note": ""}
        if platform_slug == "tiktok":
            from app import tiktok

            token = config.get("access_token")
            if not token:
                return {"status": "unavailable", "note": "Channel not connected.", "metrics": {}}
            return {**tiktok.video_insights(token, external_id), "url": None}
        if platform_slug == "telegram":
            from app.publishers import telegram_subscriber_count

            bot_token = config.get("bot_token") or get_settings().telegram_bot_token
            chat_id = config.get("chat_id")
            if not bot_token or not chat_id:
                return {"status": "unavailable", "note": "Channel not connected.", "metrics": {}, "url": None}
            subscribers = cache.get_or_set(
                f"telegram_subscribers:{chat_id}",
                lambda: telegram_subscriber_count(bot_token, chat_id),
            )
            return {
                "status": "partial",
                "note": "Views and reactions aren't available through Telegram's bot API — "
                "only the channel's current subscriber count is.",
                "metrics": {"subscribers": subscribers},
                "url": None,
            }
        return {"status": "unavailable", "note": "No insights integration for this platform.", "metrics": {}, "url": None}
    except Exception as exc:  # noqa: BLE001 - one post's failure shouldn't blank the page
        return {"status": "unavailable", "note": str(exc), "metrics": {}, "url": None}


@router.get("/insights")
def insights_view(
    brand_id: int | None = None,
    limit: int = _INSIGHTS_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    from concurrent.futures import ThreadPoolExecutor

    from app.media import kind_for

    brands = _brand_map(db, ws)
    plats = _platform_map(db)
    chans = {c.id: c for c in _scoped(db, Channel, ws)}
    videos = {v.id: v for v in _scoped(db, Video, ws)}

    q = (
        select(PostTarget)
        .options(selectinload(PostTarget.post))
        .where(scope(PostTarget, ws), PostTarget.status == "posted", PostTarget.external_id != "")
        .order_by(PostTarget.published_at.desc())
    )
    rows = []
    for t in db.scalars(q).all():
        post = t.post
        brand = brands.get(post.brand_id) if post else None
        if brand_id is not None and (brand is None or brand.id != brand_id):
            continue
        ch = chans.get(t.channel_id)
        plat = plats.get(ch.platform_id) if ch else None
        video = videos.get(post.video_id) if post and post.video_id else None
        rows.append(
            {
                "target_id": t.id,
                "post_id": t.post_id,
                "brand_slug": brand.slug if brand else None,
                "brand_name": brand.name if brand else "?",
                "platform_slug": plat.slug if plat else "?",
                "title": t.title or (post.title if post else "") or "Untitled",
                "caption": t.caption,
                "media_url": video.url if video else None,
                "media_kind": kind_for(video.url, None) if video and video.url else None,
                "published_at": t.published_at,
                "_channel_config": (ch.config if ch else None) or {},
                "_external_id": t.external_id,
            }
        )
        if len(rows) >= limit:
            break

    metrics_cache = _MetricsCache()

    def fetch(row: dict) -> dict:
        config = row.pop("_channel_config")
        external_id = row.pop("_external_id")
        result = _post_metrics(row["platform_slug"], config, external_id, metrics_cache)
        return {**row, **result}

    if not rows:
        return []
    with ThreadPoolExecutor(max_workers=min(8, len(rows))) as pool:
        return list(pool.map(fetch, rows))


@router.get("/sidebar")
def sidebar_counts(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    def count(model, *where):
        return db.scalar(
            select(func.count()).select_from(model).where(scope(model, ws), *where)
        )

    live = count(Channel, Channel.status != "off")
    total = count(Channel)
    queued = count(PostTarget)
    waiting = count(Draft, Draft.status == "waiting")
    library = count(GenerationJob, GenerationJob.video_id.is_not(None))
    per_brand = dict(
        db.execute(
            select(Post.brand_id, func.count(PostTarget.id))
            .join(PostTarget, PostTarget.post_id == Post.id)
            .where(scope(Post, ws))
            .group_by(Post.brand_id)
        ).all()
    )
    brands = db.scalars(select(Brand).where(scope(Brand, ws)).order_by(Brand.name)).all()
    return {
        "channels_live": live or 0,
        "channels_total": total or 0,
        "today_count": queued or 0,
        "waiting_count": waiting or 0,
        "library_count": library or 0,
        "brands": [
            {"id": b.id, "slug": b.slug, "name": b.name, "posts": per_brand.get(b.id, 0)}
            for b in brands
        ],
    }


# ── actions ──────────────────────────────────────────────────────────────
class TargetIn(BaseModel):
    channel_id: int
    caption: str = ""
    title: str = ""
    scheduled_for: datetime | None = None
    # Per-platform posting choices — currently only TikTok Direct Post reads
    # this, e.g. {"tiktok": {"privacy_level": "SELF_ONLY", ...}}.
    platform_options: dict = Field(default_factory=dict)


class ScheduleIn(BaseModel):
    brand_id: int
    video_id: int | None = None
    title: str = ""
    targets: list[TargetIn]
    publish_now: bool = False  # deliver immediately instead of queueing


@router.post("/schedule", status_code=201)
def schedule(payload: ScheduleIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    if not payload.targets:
        raise HTTPException(422, "At least one target channel is required.")
    owned(db, Brand, payload.brand_id, ws)
    if payload.video_id is not None:
        owned(db, Video, payload.video_id, ws)
    for t in payload.targets:
        owned(db, Channel, t.channel_id, ws, f"Channel {t.channel_id}")

    post = Post(
        brand_id=payload.brand_id,
        video_id=payload.video_id,
        title=payload.title,
        status="scheduled",
    )
    db.add(post)
    db.flush()
    created: list[PostTarget] = []
    for t in payload.targets:
        pt = PostTarget(
            post_id=post.id,
            channel_id=t.channel_id,
            caption=t.caption,
            title=t.title,
            scheduled_for=t.scheduled_for,
            status="queued",
            platform_options=t.platform_options,
        )
        db.add(pt)
        created.append(pt)
    db.commit()
    for pt in created:
        db.refresh(pt)
    db.refresh(post)

    result = {"post_id": post.id, "targets": len(created), "target_ids": [pt.id for pt in created]}
    if payload.publish_now:
        published, failed = [], []
        for pt in created:
            outcome = _run_publish(db, pt)
            (published if outcome["status"] == "posted" else failed).append(outcome)
        result["published"] = published
        result["failed"] = failed
    return result


class ConnectIn(BaseModel):
    handle: str | None = None
    token_note: str | None = None
    # merged into channel.config; e.g. {"bot_token": "...", "chat_id": "@my_channel"}
    config: dict | None = None


@router.post("/channels/{channel_id}/connect")
def connect_channel(
    channel_id: int,
    payload: ConnectIn | None = None,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    ch = owned(db, Channel, channel_id, ws)
    merged_config = {**(ch.config or {}), **(payload.config if payload and payload.config else {})}
    verified = _verify_channel_config(ch.platform.slug if ch.platform else "", merged_config)

    ch.status = "live"
    # Prefer the real name the platform reported, then an explicit handle.
    if verified and verified.get("chat_title"):
        ch.handle = verified["chat_title"]
    elif payload and payload.handle:
        ch.handle = payload.handle
    ch.config = merged_config
    ch.token_note = _connect_note(verified, payload)
    ch.last_post_at = None
    db.commit()
    return {
        "id": ch.id,
        "status": ch.status,
        "config_keys": sorted((ch.config or {}).keys()),
        "verified": verified,
    }


@router.get("/channels/{channel_id}/pending")
def channel_pending(channel_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """How many not-yet-sent posts are queued for this channel — shown in the
    disconnect confirmation so nobody cancels them by surprise."""
    owned(db, Channel, channel_id, ws)
    count = db.scalar(
        select(func.count())
        .select_from(PostTarget)
        .where(PostTarget.channel_id == channel_id, PostTarget.status.in_(("queued", "posting")))
    )
    return {"queued": count or 0}


@router.post("/channels/{channel_id}/disconnect")
def disconnect_channel(channel_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Forget this channel's credentials so the app can no longer post to it.

    The Channel row itself stays (status "off") so its post history and
    Insights still resolve, and "Connect" can bring it back later. Posts still
    queued for it are marked failed with a clear reason — the delivery worker
    skips "off" channels, so otherwise they'd sit in the queue forever.
    Already-published posts are untouched."""
    ch = owned(db, Channel, channel_id, ws)

    pending = db.scalars(
        select(PostTarget).where(
            PostTarget.channel_id == ch.id, PostTarget.status.in_(("queued", "posting"))
        )
    ).all()
    for t in pending:
        t.status = "failed"
        t.error = "Channel was disconnected before this went out."

    ch.status = "off"
    ch.config = {}
    ch.token_note = "Not connected"
    ch.last_post_at = None
    db.commit()
    return {"id": ch.id, "status": ch.status, "cancelled": len(pending)}


def _connect_note(verified: dict | None, payload) -> str:
    if payload and payload.token_note:
        return payload.token_note
    if verified and verified.get("chat_title"):
        return f"Bot @{verified.get('bot_username')} → {verified['chat_title']}"
    return "Just connected"


def _verify_channel_config(platform_slug: str, config: dict) -> dict | None:
    """For platforms with a live integration, confirm the credentials work now."""
    if platform_slug != "telegram":
        return None
    from app.config import get_settings

    token = config.get("bot_token") or get_settings().telegram_bot_token
    chat_id = config.get("chat_id")
    try:
        return verify_telegram(token, chat_id)
    except PublishError as exc:
        raise HTTPException(400, str(exc)) from exc


class AddChannelIn(BaseModel):
    brand_id: int
    platform_slug: str
    handle: str = ""
    config: dict = Field(default_factory=dict)


@router.post("/channels", status_code=201)
def create_channel_for_brand(payload: AddChannelIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The 'Add platform' flow: connect a brand to a platform.

    For Telegram, pass ``config`` with a ``bot_token`` and a ``chat_id``
    (the ``@channelusername`` or numeric id). The bot must be an admin of the
    channel.
    """
    owned(db, Brand, payload.brand_id, ws)
    plat = db.scalar(select(Platform).where(Platform.slug == payload.platform_slug))
    if plat is None:
        raise HTTPException(404, f"Unknown platform '{payload.platform_slug}'.")
    existing = db.scalar(
        select(Channel).where(Channel.brand_id == payload.brand_id, Channel.platform_id == plat.id)
    )
    if existing is not None:
        raise HTTPException(409, "That brand is already connected to this platform.")
    verified = _verify_channel_config(plat.slug, payload.config or {})
    handle = (
        (verified or {}).get("chat_title") or payload.handle or payload.config.get("chat_id", "")
    )
    ch = Channel(
        brand_id=payload.brand_id,
        platform_id=plat.id,
        handle=handle,
        status="live",
        token_note=_connect_note(verified, None),
        config=payload.config or {},
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return {"id": ch.id, "status": ch.status, "verified": verified}


# ── TikTok OAuth connect ─────────────────────────────────────────────────
# "Add platform → TikTok" sends the browser to /oauth/tiktok/start, which
# redirects to tiktok.com; TikTok then redirects back to
# /oauth/tiktok/callback (a real browser navigation, not an API call — no
# frontend origin involved), which stores the tokens and bounces the user
# back into the React app.
_TIKTOK_STATE_TTL_SECONDS = 600


@router.get("/oauth/tiktok/start")
def tiktok_oauth_start(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, brand_id, ws)
    state = sign_payload({"brand_id": brand_id}, _TIKTOK_STATE_TTL_SECONDS)
    try:
        return {"url": tiktok.authorize_url(state)}
    except tiktok.TikTokError as exc:
        raise HTTPException(503, str(exc)) from exc


@public_router.get("/oauth/tiktok/callback", include_in_schema=False)
def tiktok_oauth_callback(
    code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)
):
    frontend = get_settings().frontend_url.rstrip("/")

    def back(ok: bool, message: str = "") -> RedirectResponse:
        params = {"tiktok": "connected" if ok else "error"}
        if message:
            params["message"] = message[:200]
        return RedirectResponse(f"{frontend}/channels?{urlencode(params)}")

    if error:
        return back(False, error)

    try:
        payload = verify_payload(state)
    except Exception:
        return back(False, "That connect link expired — try again.")
    brand = db.get(Brand, payload.get("brand_id"))
    if brand is None:
        return back(False, "Brand not found.")

    try:
        tokens = tiktok.exchange_code(code)
    except tiktok.TikTokError as exc:
        return back(False, str(exc))

    plat = db.scalar(select(Platform).where(Platform.slug == "tiktok"))
    if plat is None:
        return back(False, "TikTok platform is not set up on the server.")

    channel = db.scalar(
        select(Channel).where(Channel.brand_id == brand.id, Channel.platform_id == plat.id)
    )
    if channel is None:
        channel = Channel(brand_id=brand.id, platform_id=plat.id)
        db.add(channel)
    channel.status = "live"
    if tokens.get("open_id"):
        channel.handle = f"tiktok:{tokens['open_id'][:10]}"
    channel.token_note = "Connected via TikTok login"
    channel.config = {**(channel.config or {}), **tokens}
    channel.last_post_at = None
    db.commit()
    return back(True)


@router.get("/channels/{channel_id}/tiktok/creator-info")
def tiktok_creator_info_view(channel_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Feeds the Direct Post picker in the composer — allowed privacy levels
    and the account's duet/comment/stitch defaults. Only meaningful for a
    channel whose token actually carries video.publish (see /views/channels'
    ``tiktok_direct_post`` flag); calling it on an Upload-only channel just
    503s with TikTok's own "scope not authorized" message."""
    channel = owned(db, Channel, channel_id, ws)
    try:
        access_token, updated_config = tiktok.ensure_access_token(channel.config or {})
    except tiktok.TikTokError as exc:
        raise HTTPException(503, str(exc)) from exc
    if updated_config is not None:
        channel.config = updated_config
        db.commit()
    try:
        info = tiktok.creator_info(access_token)
    except tiktok.TikTokError as exc:
        raise HTTPException(503, str(exc)) from exc
    if not get_settings().tiktok_app_audited:
        # An unaudited app's Direct Post calls are rejected outright for any
        # privacy_level besides SELF_ONLY — don't offer options that would
        # just fail (app/publishers.py enforces this too, independently).
        info["privacy_level_options"] = ["SELF_ONLY"]
    return info


# ── Facebook / Instagram OAuth connect ───────────────────────────────────
# One Facebook login can return several Pages, so unlike Telegram/TikTok this
# needs an extra "pick a Page" step: /start -> facebook.com -> /callback
# (exchanges tokens, fetches every Page + its linked Instagram, stashes them
# server-side under an opaque id) -> the React app fetches /pending/<id> and
# shows the picker -> /pending/<id>/confirm saves the chosen Page's token onto
# the brand's Channel(s). Raw Page tokens never reach the browser.
_META_STATE_TTL_SECONDS = 600


@router.get("/oauth/meta/start")
def meta_oauth_start(
    brand_id: int, intent: str = "facebook", db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    owned(db, Brand, brand_id, ws)
    state = sign_payload({"brand_id": brand_id, "intent": intent}, _META_STATE_TTL_SECONDS)
    try:
        return {"url": meta.authorize_url(state)}
    except meta.MetaError as exc:
        raise HTTPException(503, str(exc)) from exc


@public_router.get("/oauth/meta/callback", include_in_schema=False)
def meta_oauth_callback(
    code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)
):
    frontend = get_settings().frontend_url.rstrip("/")

    def to_channels(message: str) -> RedirectResponse:
        params = {"meta": "error", "message": message[:200]}
        return RedirectResponse(f"{frontend}/channels?{urlencode(params)}")

    if error:
        return to_channels(error)

    try:
        payload = verify_payload(state)
    except Exception:
        return to_channels("That connect link expired — try again.")
    brand = db.get(Brand, payload.get("brand_id"))
    if brand is None:
        return to_channels("Brand not found.")

    try:
        short_token = meta.exchange_code(code)
        user_token = meta.long_lived_token(short_token)
        pages = meta.list_pages(user_token)
    except meta.MetaError as exc:
        return to_channels(str(exc))

    if not pages:
        return to_channels(
            "No Facebook Pages found — you need to be an admin of at least one Page."
        )

    pending_id = meta.stash_pending(brand.id, payload.get("intent", "facebook"), pages)
    return RedirectResponse(f"{frontend}/channels/add?{urlencode({'meta_pending': pending_id})}")


@router.get("/oauth/meta/pending/{pending_id}")
def meta_pending_view(pending_id: str, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    record = meta.peek_pending(pending_id)
    if record is None:
        raise HTTPException(404, "That connect session expired — start again.")
    brand = owned(db, Brand, record["brand_id"], ws)
    return {
        "brand_id": record["brand_id"],
        "brand_name": brand.name if brand else "?",
        "intent": record["intent"],
        "pages": [
            {
                "id": p["id"],
                "name": p["name"],
                "has_instagram": bool(p.get("ig_user_id")),
                "instagram_username": p.get("ig_username"),
            }
            for p in record["pages"]
        ],
    }


class MetaConfirmIn(BaseModel):
    page_id: str
    connect_facebook: bool = True
    connect_instagram: bool = False


@router.post("/oauth/meta/pending/{pending_id}/confirm")
def meta_pending_confirm(
    pending_id: str, payload: MetaConfirmIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    record = meta.peek_pending(pending_id)
    if record is None:
        raise HTTPException(404, "That connect session expired — start again.")
    owned(db, Brand, record["brand_id"], ws)
    meta.pop_pending(pending_id)
    page = next((p for p in record["pages"] if p["id"] == payload.page_id), None)
    if page is None:
        raise HTTPException(404, "That Page was not in the list you connected.")
    if not payload.connect_facebook and not payload.connect_instagram:
        raise HTTPException(400, "Pick at least Facebook or Instagram.")
    if payload.connect_instagram and not page.get("ig_user_id"):
        raise HTTPException(400, "That Page has no linked Instagram Business account.")

    brand_id = record["brand_id"]
    connected: list[str] = []

    def upsert(platform_slug: str, handle: str, config: dict) -> None:
        plat = db.scalar(select(Platform).where(Platform.slug == platform_slug))
        if plat is None:
            return
        ch = db.scalar(
            select(Channel).where(Channel.brand_id == brand_id, Channel.platform_id == plat.id)
        )
        if ch is None:
            ch = Channel(brand_id=brand_id, platform_id=plat.id)
            db.add(ch)
        ch.status = "live"
        ch.handle = handle
        ch.token_note = "Connected via Facebook login"
        ch.config = {**(ch.config or {}), **config}
        ch.last_post_at = None
        connected.append(platform_slug)

    if payload.connect_facebook:
        upsert(
            "facebook",
            page["name"],
            {"access_token": page["access_token"], "page_id": page["id"], "page_name": page["name"]},
        )
    if payload.connect_instagram:
        upsert(
            "instagram",
            f"@{page['ig_username']}" if page.get("ig_username") else page["name"],
            {
                "access_token": page["access_token"],
                "page_id": page["id"],
                "ig_user_id": page["ig_user_id"],
                "ig_username": page.get("ig_username", ""),
            },
        )
    db.commit()
    return {"connected": connected}


# ── LinkedIn OAuth connect ────────────────────────────────────────────────
# Personal-profile posting only (see app/linkedin.py) — a single LinkedIn
# login maps to one person's own feed, so like TikTok (and unlike Meta) this
# needs no "pick a Page" step: /start -> linkedin.com -> /callback stores the
# token straight onto the brand's Channel and bounces back into the app.
_LINKEDIN_STATE_TTL_SECONDS = 600


@router.get("/oauth/linkedin/start")
def linkedin_oauth_start(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, brand_id, ws)
    state = sign_payload({"brand_id": brand_id}, _LINKEDIN_STATE_TTL_SECONDS)
    try:
        return {"url": linkedin.authorize_url(state)}
    except linkedin.LinkedInError as exc:
        raise HTTPException(503, str(exc)) from exc


@public_router.get("/oauth/linkedin/callback", include_in_schema=False)
def linkedin_oauth_callback(
    code: str = "",
    state: str = "",
    error: str = "",
    error_description: str = "",
    db: Session = Depends(get_db),
):
    frontend = get_settings().frontend_url.rstrip("/")

    def back(ok: bool, message: str = "") -> RedirectResponse:
        params = {"linkedin": "connected" if ok else "error"}
        if message:
            params["message"] = message[:200]
        return RedirectResponse(f"{frontend}/channels?{urlencode(params)}")

    if error:
        if error == "invalid_scope_error":
            return back(
                False,
                "LinkedIn app is missing a product — add “Sign In with LinkedIn using OpenID Connect” "
                "and “Share on LinkedIn” in the developer portal.",
            )
        return back(False, error_description or error)

    try:
        payload = verify_payload(state)
    except Exception:
        return back(False, "That connect link expired — try again.")
    brand = db.get(Brand, payload.get("brand_id"))
    if brand is None:
        return back(False, "Brand not found.")

    try:
        access_token = linkedin.exchange_code(code)
        member = linkedin.fetch_member(access_token)
    except linkedin.LinkedInError as exc:
        return back(False, str(exc))

    plat = db.scalar(select(Platform).where(Platform.slug == "linkedin"))
    if plat is None:
        return back(False, "LinkedIn platform is not set up on the server.")

    channel = db.scalar(
        select(Channel).where(Channel.brand_id == brand.id, Channel.platform_id == plat.id)
    )
    if channel is None:
        channel = Channel(brand_id=brand.id, platform_id=plat.id)
        db.add(channel)
    channel.status = "live"
    channel.handle = member["name"]
    channel.token_note = "Connected via LinkedIn login"
    channel.config = {**(channel.config or {}), "access_token": access_token, "person_sub": member["sub"]}
    channel.last_post_at = None
    db.commit()
    return back(True)


# ── publishing ───────────────────────────────────────────────────────────
@router.post("/post-targets/{target_id}/publish")
def publish_target(target_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Send one queued post to its channel right now (Telegram goes live)."""
    target = owned(db, PostTarget, target_id, ws, "Post target")
    return _run_publish(db, target)


class PublishDueIn(BaseModel):
    until: datetime | None = None  # default: now
    limit: int = Field(default=50, ge=1, le=500)
    dry_run: bool = False


# A target that has sat in "posting" longer than this was almost certainly
# orphaned by a crash mid-send; the worker re-attempts it.
_STALE_POSTING = timedelta(minutes=5)
# Brief pause after flagging due posts "posting" so a polling UI can render the
# in-progress animation before they flip to "posted".
_POSTING_DWELL_SECONDS = 2.0


def publish_due_targets(
    db: Session,
    *,
    until: datetime | None = None,
    limit: int = 50,
    dry_run: bool = False,
    dwell: bool = False,
    workspace_id: int | None = None,
) -> dict:
    """Deliver every queued target whose scheduled time has passed.

    Shared by the ``/publish-due`` endpoint and the in-process delivery worker
    (``app.scheduler``). ``dwell`` inserts a short pause between marking posts
    "posting" and sending them, so the UI can show progress — the worker passes
    it, request handlers do not. ``workspace_id`` limits it to one tenant
    (the endpoint); the worker passes None and serves every workspace.
    """
    now = datetime.now(UTC)
    cutoff = until or now
    stale_before = now - _STALE_POSTING
    q = select(PostTarget).join(Channel, Channel.id == PostTarget.channel_id)
    if workspace_id is not None:
        q = q.where(scope(PostTarget, workspace_id))
    rows = db.scalars(
        q.where(
            PostTarget.scheduled_for.is_not(None),
            PostTarget.scheduled_for <= cutoff,
            Channel.status != "off",
            (PostTarget.status == "queued")
            | ((PostTarget.status == "posting") & (PostTarget.updated_at <= stale_before)),
        )
        .order_by(PostTarget.scheduled_for)
        .limit(limit)
    ).all()

    if dry_run:
        return {"due": [t.id for t in rows], "published": [], "failed": []}

    if rows:
        for t in rows:
            t.status = "posting"
        db.commit()
        if dwell:
            time.sleep(_POSTING_DWELL_SECONDS)

    published, failed = [], []
    for t in rows:
        outcome = _run_publish(db, t)
        (published if outcome["status"] == "posted" else failed).append(outcome)
    return {"due": len(rows), "published": published, "failed": failed}


@router.post("/publish-due")
def publish_due(
    payload: PublishDueIn | None = None, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Publish every queued target whose scheduled time has passed.

    Runs automatically in-process (see ``app.scheduler``); this endpoint lets you
    trigger it on demand or from an external cron / ``/loop``.
    """
    payload = payload or PublishDueIn()
    return publish_due_targets(
        db, until=payload.until, limit=payload.limit, dry_run=payload.dry_run, workspace_id=ws
    )


@router.post("/drafts/{draft_id}/approve")
def approve_draft(draft_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Approving a plain idea just marks it approved — you still build the
    post yourself from the Calendar. Approving one that already has
    auto-generated media (Automation.auto_media) goes further: it schedules
    a real Post to every connected channel right here, one click."""
    from app.content_scheduler import ContentAIError, schedule_draft_as_post

    d = owned(db, Draft, draft_id, ws)

    if d.video_id is not None:
        try:
            post = schedule_draft_as_post(db, d)
        except ContentAIError as exc:
            raise HTTPException(422, str(exc)) from exc
        d.status = "scheduled"
        db.commit()
        return {"id": d.id, "status": d.status, "post_id": post.id}

    d.status = "approved"
    db.commit()
    return {"id": d.id, "status": d.status}


@router.post("/drafts/{draft_id}/reject")
def reject_draft(draft_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    d = owned(db, Draft, draft_id, ws)
    d.status = "rejected"
    db.commit()
    return {"id": d.id, "status": d.status}
