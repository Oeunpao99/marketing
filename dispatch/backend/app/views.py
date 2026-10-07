"""Read models + actions shaped for the five operational screens.

These sit on top of the same tables the generic ``/api/<resource>`` endpoints
expose; they just pre-join the data so the React pages stay thin.
"""

import logging
import re
import threading
import time
from collections import Counter
from datetime import UTC, date, datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse

import httpx

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import content_ai, linkedin, meta, post_tags, tiktok
from app.config import get_settings
from app.database import get_db
from app.media import local_path_for
from app.models import (
    Automation,
    Brand,
    Channel,
    Draft,
    GenerationJob,
    Lead,
    MetricSnapshot,
    Platform,
    Post,
    PostTarget,
    Product,
    TeamMember,
    Video,
)
from app.goals import GOALS, goal_of
from app.publishers import CannotUnpublish, PublishError, publish, unpublish, verify_telegram
from app.security import sign_payload, verify_payload
from app.tenancy import MANAGER_ROLES, current_workspace_id, get_current_user, owned, scope

log = logging.getLogger("app.views")

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


@router.get("/publishing")
def publishing_view(
    brand_id: int | None = None, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Posting activity for the Analytics overview: posts per day for the
    previous, current and next week (Mon–Sun, Phnom Penh clock) — published
    ones by when they went out, queued ones by when they're due — plus the
    next few posts waiting to go out. No platform calls; database only."""
    from app.media import kind_for

    now = datetime.now(PHNOM_PENH)
    monday = now.date() - timedelta(days=now.weekday())
    first = monday - timedelta(days=7)
    start = datetime(first.year, first.month, first.day, tzinfo=PHNOM_PENH)
    end = start + timedelta(days=21)

    brands = _brand_map(db, ws)
    plats = _platform_map(db)
    chans = {c.id: c for c in _scoped(db, Channel, ws)}
    videos = {v.id: v for v in _scoped(db, Video, ws)}
    targets = db.scalars(
        select(PostTarget)
        .options(selectinload(PostTarget.post))
        .where(
            scope(PostTarget, ws),
            PostTarget.status.in_(("posted", "queued", "posting")),
            func.coalesce(PostTarget.published_at, PostTarget.scheduled_for) >= start,
            func.coalesce(PostTarget.published_at, PostTarget.scheduled_for) < end,
        )
    ).all()
    if brand_id is not None:
        targets = [t for t in targets if t.post and t.post.brand_id == brand_id]

    days = {(first + timedelta(days=i)).isoformat(): {"posted": 0, "scheduled": 0} for i in range(21)}
    upcoming = []
    for t in targets:
        posted = t.status == "posted"
        when = t.published_at if posted else t.scheduled_for
        if when is None:
            continue
        key = when.astimezone(PHNOM_PENH).date().isoformat()
        if key in days:
            days[key]["posted" if posted else "scheduled"] += 1
        if not posted and when >= now:
            ch = chans.get(t.channel_id)
            plat = plats.get(ch.platform_id) if ch else None
            post = t.post
            video = videos.get(post.video_id) if post and post.video_id else None
            brand = brands.get(post.brand_id) if post else None
            upcoming.append(
                {
                    "target_id": t.id,
                    "at": when,
                    "platform_slug": plat.slug if plat else "?",
                    "brand_name": brand.name if brand else "",
                    "title": t.title or (post.title if post else "") or "Untitled",
                    "media_url": video.url if video else None,
                    "media_kind": kind_for(video.url, None) if video and video.url else None,
                }
            )
    upcoming.sort(key=lambda u: u["at"])
    return {
        "today": now.date().isoformat(),
        "days": [{"date": d, **c} for d, c in days.items()],
        "upcoming": upcoming[:4],
    }


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
    from app.media import kind_for

    # The latest saved numbers per published delivery (collected every few
    # hours and on each Analytics visit) — no platform calls on this 6s poll.
    posted_ids = [t.id for t in targets if t.status == "posted"]
    metrics = (
        dict(
            db.execute(
                select(MetricSnapshot.target_id, MetricSnapshot.metrics)
                .where(MetricSnapshot.target_id.in_(posted_ids))
                .order_by(MetricSnapshot.target_id, MetricSnapshot.taken_at.desc())
                .distinct(MetricSnapshot.target_id)
            ).all()
        )
        if posted_ids
        else {}
    )
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
                "platform_slug": plat.slug if plat else "",
                "title": t.title or (t.post.title if t.post else ""),
                "caption": t.caption,
                "status": t.status,
                "published_at": t.published_at,
                "error": t.error or "",
                "video_id": video.id if video else None,
                "video_filename": video.filename if video else None,
                "video_url": video.url if video else None,
                "media_kind": kind_for(video.url, None) if video and video.url else None,
                "metrics": metrics.get(t.id),
            }
        )
    return out


@router.get("/channels")
def channels_view(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    plats = _platform_map(db)
    brands = db.scalars(select(Brand).where(scope(Brand, ws)).order_by(Brand.name)).all()
    chans = _scoped(db, Channel, ws)
    # A brand can hold several accounts per platform. Once one is connected,
    # its other "not connected" rows (old Pages, kept for their post history)
    # are just noise — show them only while nothing on that platform is live,
    # and then just one of them as the "Connect" row.
    shown: set[int] = set()
    groups: dict[tuple[int, int], list] = {}
    for c in sorted(chans, key=lambda c: c.id):
        groups.setdefault((c.brand_id, c.platform_id), []).append(c)
    for rows_ in groups.values():
        live = [c for c in rows_ if c.status != "off"]
        shown.update(c.id for c in (live or rows_[:1]))
    result = []
    for b in brands:
        rows = []
        for c in chans:
            if c.brand_id != b.id or c.id not in shown:
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
            "pillar": d.pillar,
            "angle": d.angle,
            "goal": d.goal,
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
    """The Calendar page: every real post (scheduled or published — from
    Compose, auto-generate or a weekly plan) and every AI idea that hasn't
    become a post yet, day by day (Phnom Penh). Each item says which it is
    (``type``: "post" | "idea"), with its media, so the page can preview it.
    An idea that already became a post shows once — as the post, under the
    idea's title (a draft has no post id; its post is the one scheduled with
    the same brand + media, see content_scheduler.schedule_draft_as_post)."""
    from app.content_scheduler import _today  # local import avoids a module cycle
    from app.media import kind_for

    start = start or _today() - timedelta(days=7)
    end = end or _today() + timedelta(days=30)
    brands = _brand_map(db, ws)

    def brand_fields(brand_id: int) -> dict:
        b = brands.get(brand_id)
        return {"brand_id": brand_id, "brand_slug": b.slug if b else None, "brand_name": b.name if b else "?"}

    # ── posts with a target in range ──
    lo = datetime.combine(start, datetime.min.time(), PHNOM_PENH)
    hi = datetime.combine(end + timedelta(days=1), datetime.min.time(), PHNOM_PENH)
    when = func.coalesce(PostTarget.published_at, PostTarget.scheduled_for)
    rows = db.execute(
        select(PostTarget, Post, Channel.handle, Platform.slug, Platform.name)
        .join(Post, Post.id == PostTarget.post_id)
        .join(Channel, Channel.id == PostTarget.channel_id)
        .join(Platform, Platform.id == Channel.platform_id)
        .where(Post.brand_id.in_(brands.keys()), when >= lo, when < hi)
        .order_by(when, PostTarget.id)
    ).all()
    posts: dict[int, Post] = {}
    targets: dict[int, list[dict]] = {}
    for t, post, handle, slug, pname in rows:
        posts[post.id] = post
        targets.setdefault(post.id, []).append(
            {
                "id": t.id,
                "platform": slug,
                "platform_name": pname,
                "handle": handle,
                "caption": t.caption,
                "scheduled_for": t.scheduled_for,
                "published_at": t.published_at,
                "status": t.status,
                "error": t.error,
            }
        )

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

    video_ids = {d.video_id for d in drafts if d.video_id} | {p.video_id for p in posts.values() if p.video_id}
    media = {
        v.id: {"id": v.id, "url": v.url, "kind": kind_for(v.url or "", None), "filename": v.filename}
        for v in (db.scalars(select(Video).where(Video.id.in_(video_ids))).all() if video_ids else [])
    }
    # Which idea each post came from (same brand + media).
    idea_for = {(d.brand_id, d.video_id): d for d in drafts if d.video_id}

    def post_title(post: Post, caption: str, idea: Draft | None) -> str:
        if idea is not None:
            return idea.title
        first = next((line.strip() for line in (caption or "").splitlines() if line.strip()), "")
        if first:
            return first if len(first) <= 80 else first[:79].rstrip() + "…"
        return re.sub(r"\.(png|jpe?g|webp|gif|mp4|mov)$", "", post.title or "Post", flags=re.I)

    def post_status(ts: list[dict]) -> str:
        states = {t["status"] for t in ts}
        if states == {"posted"}:
            return "posted"
        if "failed" in states:
            return "failed"
        if "posted" in states:
            return "partial"
        return "scheduled"

    items: list[dict] = []
    used_ideas: set[int] = set()
    for pid, post in posts.items():
        ts = targets[pid]
        first = ts[0]
        at = first["published_at"] or first["scheduled_for"]
        idea = idea_for.get((post.brand_id, post.video_id)) if post.video_id else None
        if idea is not None:
            used_ideas.add(idea.id)
        caption = first["caption"] or (idea.body if idea else "")
        items.append(
            {
                "key": f"post-{pid}",
                "type": "post",
                "id": pid,
                **brand_fields(post.brand_id),
                "title": post_title(post, caption, idea),
                "body": caption,
                "insight": idea.insight if idea else "",
                "angle": post.angle or (idea.angle if idea else ""),
                "pillar": post.pillar or (idea.pillar if idea else ""),
                "planned_for": at.astimezone(PHNOM_PENH).date() if at else None,
                "status": post_status(ts),
                "source": idea.source if idea else ("native" if post.origin == "native" else "compose"),
                "origin": post.origin or "contentflow",
                "media": media.get(post.video_id) if post.video_id else None,
                "targets": ts,
            }
        )
    for d in drafts:
        if d.id in used_ideas:
            continue
        items.append(
            {
                "key": f"idea-{d.id}",
                "type": "idea",
                "id": d.id,
                **brand_fields(d.brand_id),
                "title": d.title,
                "body": d.body,
                "insight": d.insight,
                "angle": d.angle,
                "pillar": d.pillar,
                "planned_for": d.planned_for,
                "planned_time": d.planned_time,  # "HH:MM" a weekly plan showed it for, else None
                "status": d.status,
                "source": d.source,
                "generated_at": d.generated_at,
                "media": media.get(d.video_id) if d.video_id else None,
                "media_pending": d.id in _media_running,
                "targets": [],
            }
        )
    items.sort(key=lambda x: (x["planned_for"] or start, 0 if x["type"] == "post" else 1))
    return items


@router.get("/auto")
def auto_view(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    from app.content_scheduler import run_status  # local import avoids a module cycle
    from app.learning import brand_learnings

    brands = _brand_map(db, ws)
    autos = _scoped(db, Automation, ws)
    learned = {a.id: brand_learnings(db, a.brand_id) for a in autos}
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
            "learn_from_results": a.learn_from_results,
            "poster_kit": a.poster_kit or {},
            "subjects": a.subjects or [],
            "plan_every": a.plan_every,
            "learnings": {
                k: v for k, v in learned[a.id].items() if k in ("posts", "rules", "post_hours", "best_slots", "subject_scores")
            },
            "upcoming": _upcoming_auto_posts(db, a, learned[a.id]),
        }
        for a in sorted(autos, key=lambda x: x.brand_id)
    ]


def _upcoming_auto_posts(db: Session, a: Automation, learned: dict) -> list[dict]:
    """The brand's next few queued AI posts and why each goes out when it
    does — the same reasons content_scheduler._learned_slot used (a
    weekday's best slot, the platform's best hour, a test of another time,
    the fixed "post at" time, or the default); "moved" if someone changed it."""
    from app.content_scheduler import PHNOM_PENH, _default_time_for
    from app.learning import pick_time

    rows = db.execute(
        select(PostTarget, Post, Platform.slug)
        .join(Post, Post.id == PostTarget.post_id)
        .join(Channel, Channel.id == PostTarget.channel_id)
        .join(Platform, Platform.id == Channel.platform_id)
        .where(
            Post.brand_id == a.brand_id,
            Post.pillar != "",  # written by the AI
            PostTarget.status == "queued",
            PostTarget.scheduled_for > datetime.now(UTC),
        )
        .order_by(PostTarget.scheduled_for)
        .limit(6)
    ).all()
    out = []
    for target, post, slug in rows:
        at = target.scheduled_for.astimezone(PHNOM_PENH)
        if a.post_at:
            why = "fixed" if at.time().replace(second=0) == a.post_at.replace(second=0) else "moved"
        else:
            t, why = pick_time(learned if a.learn_from_results else None, slug, at.date(), post.id)
            if (t or _default_time_for(slug)).hour != at.hour:
                why = "moved"
            why = why or "default"
        slot = (learned.get("best_slots", {}).get(slug, {}) or {}).get(str(at.weekday())) if why == "slot" else None
        out.append({"at": target.scheduled_for, "platform": slug, "title": post.title, "why": why, "slot": slot})
    return out


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
        .where(scope(GenerationJob, ws), GenerationJob.video_id.is_not(None), GenerationJob.kind != "scene")
        .order_by(GenerationJob.created_at.desc(), GenerationJob.id.desc())
    ).all()
    # How many times each asset has gone out — so nobody posts the same image
    # twice by accident.
    posted = dict(
        db.execute(
            select(Post.video_id, func.count(PostTarget.id))
            .join(PostTarget, PostTarget.post_id == Post.id)
            .where(scope(Post, ws), Post.video_id.is_not(None), PostTarget.status == "posted")
            .group_by(Post.video_id)
        ).all()
    )
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
                # The ready-to-post caption (app/media_caption.py).
                "caption": v.caption or "",
                "caption_angle": v.caption_angle or "",
                "caption_status": v.caption_status or ("ready" if v.caption else ""),
                "posted_count": posted.get(v.id, 0),
                # When it finished — the page marks items newer than the
                # person's last visit as "New" (POST /library/seen).
                "ready_at": v.created_at,
            }
        )
    return out


def _library_seen_at(user: TeamMember) -> datetime:
    """When this person last opened the Library — before their first visit,
    when their account was made (so a new member isn't shown everything)."""
    raw = (user.preferences or {}).get("library_seen_at")
    if raw:
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            pass
    return user.created_at


@router.post("/library/seen")
def library_seen(db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    """Opening the Library: clears the sidebar's "new" badge. Returns the
    previous visit's time so the page can still mark this visit's new items."""
    previous = _library_seen_at(user)
    user.preferences = {**(user.preferences or {}), "library_seen_at": datetime.now(UTC).isoformat()}
    db.commit()
    return {"previous": previous}


class LibraryCaptionIn(BaseModel):
    angle: str = ""
    goal: str = ""


@router.post("/library/{job_id}/caption")
def library_write_caption(
    job_id: int,
    payload: LibraryCaptionIn | None = None,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    """Write — or rewrite, optionally with a chosen angle / goal — the caption
    for one Library item. One AI text call."""
    from app.content_ai import ContentAIError
    from app.media_caption import write_caption

    job = owned(db, GenerationJob, job_id, ws, "Generation")
    video = owned(db, Video, job.video_id, ws, "Media") if job.video_id else None
    if video is None:
        raise HTTPException(404, "This item has no image or video.")
    if video.brand_id is None:
        raise HTTPException(422, "Pick a brand for this image first — the caption is written from its products.")
    payload = payload or LibraryCaptionIn()
    try:
        caption = write_caption(db, video, job.prompt, payload.angle, payload.goal)
    except ContentAIError as exc:
        db.rollback()
        raise HTTPException(502, str(exc)) from exc
    return {"caption": caption, "caption_angle": video.caption_angle, "caption_status": "ready"}


@router.get("/media/{video_id}/caption")
def media_caption_view(video_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The AI caption for one image / video — Compose asks for it when media
    arrives from the AI Agent or Video Story (it may still be "writing")."""
    video = owned(db, Video, video_id, ws, "Media")
    return {
        "caption": video.caption or "",
        "caption_status": video.caption_status or ("ready" if video.caption else ""),
    }


class LibraryCaptionEdit(BaseModel):
    caption: str = Field(max_length=5000)


@router.patch("/library/{job_id}/caption")
def library_edit_caption(
    job_id: int, payload: LibraryCaptionEdit, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Save the person's own edits to a Library item's caption."""
    job = owned(db, GenerationJob, job_id, ws, "Generation")
    video = owned(db, Video, job.video_id, ws, "Media") if job.video_id else None
    if video is None:
        raise HTTPException(404, "This item has no image or video.")
    video.caption = payload.caption.strip()
    video.caption_status = "ready" if video.caption else ""
    db.commit()
    return {"caption": video.caption, "caption_status": video.caption_status}


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
        if platform_slug == "linkedin":
            # Reading a member post's likes/comments/impressions needs LinkedIn's
            # partner-only Community Management API — "Share on LinkedIn" can
            # post but not read back. Link to the post so its stats are one tap away.
            return {
                "status": "partial",
                "note": "LinkedIn doesn't share likes, comments or views with apps for personal "
                "posts — open the post on LinkedIn to see them.",
                "metrics": {},
                "url": f"https://www.linkedin.com/feed/update/{external_id}/" if external_id else None,
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

    try:
        reattach_posts(db, ws)
    except Exception:  # noqa: BLE001 - a repair must never block the page
        db.rollback()
        log.exception("could not reattach posts")
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
        imported = (t.platform_options or {}).get("imported") or {}
        rows.append(
            {
                "target_id": t.id,
                "post_id": t.post_id,
                "brand_slug": brand.slug if brand else None,
                "brand_name": brand.name if brand else "?",
                "platform_slug": plat.slug if plat else "?",
                # Which account it went to — the Analytics "Channels" table
                # groups by this (a brand can have one channel per platform).
                "channel_id": ch.id if ch else None,
                "channel_handle": (ch.handle if ch else "") or "",
                "title": t.title or (post.title if post else "") or "Untitled",
                "caption": t.caption,
                "media_url": video.url if video else (imported.get("picture") or None),
                "media_kind": (
                    kind_for(video.url, None)
                    if video and video.url
                    else (imported.get("kind") if imported.get("kind") in ("image", "video") else None)
                ),
                # An imported post only has the platform's picture (for a video,
                # its cover image) — show it as an image, never play it.
                "media_thumb": bool(imported.get("picture")) and not video,
                # "contentflow" = posted from here; "native" = posted straight
                # on the platform and imported (app/importer.py).
                "origin": (post.origin if post else "") or "contentflow",
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
        results = list(pool.map(fetch, rows))
    # Save these readings for the "over time" charts — never at the cost of
    # the page itself.
    try:
        record_snapshots(db, ws, results)
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("could not record metric snapshots")
    return results


# ── Metric history (post page "over time" charts) ─────────────────────────
# Platforms only report numbers as of now; saving a reading every so often is
# what makes "how did this post grow" chartable. At most one reading per post
# (and per Telegram channel) per _SNAPSHOT_EVERY, however often pages load.
_SNAPSHOT_EVERY = timedelta(hours=1)
_SNAPSHOT_KEYS = ("likes", "comments", "shares", "views", "clicks", "subscribers")


def record_snapshots(db: Session, ws: int, results: list[dict]) -> int:
    """Store the numbers in these Analytics rows (target_id, channel_id,
    platform_slug, status, metrics). Telegram's member count is channel-wide,
    so it is stored once per channel (target_id NULL), not per post."""
    now = datetime.now(UTC)
    post_rows, channel_rows = {}, {}
    for r in results:
        if r.get("status") not in ("ok", "partial") or not r.get("channel_id"):
            continue
        metrics = {k: r["metrics"][k] for k in _SNAPSHOT_KEYS if (r.get("metrics") or {}).get(k) is not None}
        if not metrics:
            continue
        if r.get("platform_slug") == "telegram":
            channel_rows[r["channel_id"]] = {"subscribers": metrics.get("subscribers")}
        else:
            post_rows[r["target_id"]] = (r["channel_id"], metrics)

    def latest(col, ids):
        if not ids:
            return {}
        q = select(col, func.max(MetricSnapshot.taken_at)).where(col.in_(ids)).group_by(col)
        if col is MetricSnapshot.channel_id:
            q = q.where(MetricSnapshot.target_id.is_(None))
        return dict(db.execute(q).all())

    seen_posts = latest(MetricSnapshot.target_id, list(post_rows))
    seen_channels = latest(MetricSnapshot.channel_id, list(channel_rows))
    added = 0
    for tid, (cid, metrics) in post_rows.items():
        if tid in seen_posts and now - seen_posts[tid] < _SNAPSHOT_EVERY:
            continue
        db.add(MetricSnapshot(workspace_id=ws, channel_id=cid, target_id=tid, taken_at=now, metrics=metrics))
        added += 1
    for cid, metrics in channel_rows.items():
        if metrics.get("subscribers") is None or (cid in seen_channels and now - seen_channels[cid] < _SNAPSHOT_EVERY):
            continue
        db.add(MetricSnapshot(workspace_id=ws, channel_id=cid, target_id=None, taken_at=now, metrics=metrics))
        added += 1
    if added:
        db.commit()
    return added


def _fmt_sales_compact(n: float | int | None) -> str:
    if n is None or n == 0:
        return "0"
    if abs(n) >= 1_000_000:
        return f"{n / 1_000_000:.1f}M".replace(".0M", "M")
    if abs(n) >= 1_000:
        return f"{n / 1_000:.1f}k".replace(".0k", "k")
    return f"{int(n):,}" if float(n).is_integer() else f"{n:,.1f}"


@router.get("/insights/sales")
def insights_sales_view(
    brand_id: int | None = None,
    period: str = "today",
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
):
    """Calculates real sales and performance records for the executive Insights & sales dashboard."""
    now_utc = datetime.now(UTC)
    now_local = now_utc.astimezone(PHNOM_PENH)
    today_local = now_local.date()

    if period == "today":
        since = datetime.combine(today_local, datetime.min.time(), PHNOM_PENH)
        until = now_utc
        prev_since = since - timedelta(days=1)
        prev_until = now_utc - timedelta(days=1)  # yesterday up to this time — a fair comparison
        time_label = f"Today so far · {now_local.strftime('%H:%M')}"
    elif period == "7d":
        since = now_utc - timedelta(days=7)
        until = now_utc
        prev_since = now_utc - timedelta(days=14)
        prev_until = since
        time_label = "Last 7 days"
    elif period == "30d":
        since = now_utc - timedelta(days=30)
        until = now_utc
        prev_since = now_utc - timedelta(days=60)
        prev_until = since
        time_label = "Last 30 days"
    else:  # 90d
        since = now_utc - timedelta(days=90)
        until = now_utc
        prev_since = now_utc - timedelta(days=180)
        prev_until = since
        time_label = "Last 90 days"

    if brand_id is not None:
        owned(db, Brand, brand_id, ws)
        brand_ids = [brand_id]
    else:
        brand_ids = [b.id for b in db.scalars(select(Brand).where(scope(Brand, ws))).all()]

    if not brand_ids:
        return {
            "period": period,
            "has_real_records": False,
            "reach": {"value": "0", "raw": 0, "sub": f"{time_label} · 0 reach"},
            "followers": {"value": "+0", "raw": 0, "sub": "No channels connected"},
            "engagementRate": {"value": "0.0%", "raw": 0, "sub": "No posts in this period"},
            "leads": {"value": "0", "raw": 0, "sub": "0 captured"},
            "dealsWon": {"value": "0", "raw": 0, "sub": "0 closed"},
            "revenue": {"value": "$0", "raw": 0, "sub": "From leads marked Won"},
            "goals": {},
            "note": "No active brand in this workspace.",
            "counts": {"posts": 0, "leads": 0, "deals_won": 0, "revenue": 0},
        }

    # Published targets in current and previous windows
    targets = db.scalars(
        select(PostTarget)
        .join(Post, Post.id == PostTarget.post_id)
        .where(
            scope(PostTarget, ws),
            Post.brand_id.in_(brand_ids),
            PostTarget.status == "posted",
            PostTarget.published_at >= since,
            PostTarget.published_at <= until,
        )
        .options(selectinload(PostTarget.post))
    ).all()

    prev_targets = db.scalars(
        select(PostTarget)
        .join(Post, Post.id == PostTarget.post_id)
        .where(
            scope(PostTarget, ws),
            Post.brand_id.in_(brand_ids),
            PostTarget.status == "posted",
            PostTarget.published_at >= prev_since,
            PostTarget.published_at < prev_until,
        )
        .options(selectinload(PostTarget.post))
    ).all()

    all_tids = [t.id for t in targets] + [t.id for t in prev_targets]
    snaps = {}
    if all_tids:
        for s in db.scalars(
            select(MetricSnapshot)
            .where(MetricSnapshot.target_id.in_(all_tids))
            .order_by(MetricSnapshot.taken_at.asc())
        ):
            snaps[s.target_id] = s.metrics

    total_reach = sum(max(snaps.get(t.id, {}).get("views") or 0, snaps.get(t.id, {}).get("impressions") or 0) for t in targets)
    total_likes = sum(snaps.get(t.id, {}).get("likes") or 0 for t in targets)
    total_comments = sum(snaps.get(t.id, {}).get("comments") or 0 for t in targets)
    total_shares = sum(snaps.get(t.id, {}).get("shares") or 0 for t in targets)
    total_eng = total_likes + total_comments + total_shares
    eng_rate = round((total_eng / total_reach * 100), 1) if total_reach > 0 else 0.0

    prev_reach = sum(max(snaps.get(t.id, {}).get("views") or 0, snaps.get(t.id, {}).get("impressions") or 0) for t in prev_targets)

    if prev_reach > 0 and targets:
        reach_diff = round(((total_reach - prev_reach) / prev_reach) * 100)
        reach_pct = f"+{reach_diff}% vs prior" if reach_diff >= 0 else f"{reach_diff}% vs prior"
    else:
        reach_pct = ""

    # Follower delta across channels
    channels = db.scalars(select(Channel).where(Channel.brand_id.in_(brand_ids), Channel.status != "off")).all()
    plat_slugs = dict(db.execute(select(Platform.id, Platform.slug)).all())
    plat_delta = {}
    total_follower_delta = 0
    for c in channels:
        pslug = plat_slugs.get(c.platform_id, "other")
        cur_snap = db.scalars(
            select(MetricSnapshot)
            .where(MetricSnapshot.channel_id == c.id, MetricSnapshot.target_id.is_(None), MetricSnapshot.taken_at <= until)
            .order_by(MetricSnapshot.taken_at.desc())
            .limit(1)
        ).first()
        old_snap = db.scalars(
            select(MetricSnapshot)
            .where(MetricSnapshot.channel_id == c.id, MetricSnapshot.target_id.is_(None), MetricSnapshot.taken_at <= since)
            .order_by(MetricSnapshot.taken_at.desc())
            .limit(1)
        ).first()
        cur_c = (cur_snap.metrics.get("followers") or cur_snap.metrics.get("subscribers") or cur_snap.metrics.get("members") or 0) if cur_snap else 0
        old_c = (old_snap.metrics.get("followers") or old_snap.metrics.get("subscribers") or old_snap.metrics.get("members") or 0) if old_snap else cur_c
        diff = max(0, cur_c - old_c)
        if diff > 0:
            plat_delta[pslug] = plat_delta.get(pslug, 0) + diff
            total_follower_delta += diff

    if plat_delta and total_follower_delta > 0:
        followers_sub = " · ".join(f"{k.upper() if len(k) <= 2 else k.capitalize()} {v}" for k, v in plat_delta.items())
    else:
        followers_sub = f"Across {len(channels)} connected channel{'s' if len(channels) != 1 else ''}"

    # Leads
    leads = db.scalars(
        select(Lead)
        .where(
            Lead.brand_id.in_(brand_ids),
            Lead.created_at >= since,
            Lead.created_at <= until,
        )
    ).all()
    total_leads = len(leads)
    if total_leads > 0:
        sources = [l.source for l in leads if l.source]
        if sources:
            counts = Counter(sources)
            leads_sub = " · ".join(f"{cnt} from {src}" for src, cnt in counts.most_common(2))
        else:
            leads_sub = f"{total_leads} captured in {time_label.lower()}"
    else:
        leads_sub = "None yet today" if period == "today" else f"None in the {time_label.lower()}"

    # Deals Won & Revenue
    won_leads = [l for l in leads if l.outcome == "won"]
    closed_won = db.scalars(
        select(Lead)
        .where(
            Lead.brand_id.in_(brand_ids),
            Lead.outcome == "won",
            Lead.closed_at >= since,
            Lead.closed_at <= until,
        )
    ).all()
    won_all = list({l.id: l for l in won_leads + list(closed_won)}.values())
    deals_won = len(won_all)
    revenue = sum(float(l.value_usd or 0) for l in won_all)
    if deals_won > 0:
        deals_sub = f"{deals_won} deal{'s' if deals_won > 1 else ''} closed from leads"
        revenue_sub = "From leads marked Won"
    else:
        deals_sub = "None closed yet today" if period == "today" else f"None closed in the {time_label.lower()}"
        revenue_sub = "From leads marked Won"

    # Goals Breakdown
    goals_data = {}
    for gid, gspec in GOALS.items():
        g_targets = [t for t in targets if goal_of(t.post.pillar or "") == gid]
        g_prev_targets = [t for t in prev_targets if goal_of(t.post.pillar or "") == gid]
        count = len(g_targets)
        prev_count = len(g_prev_targets)

        if count == 0:
            posts_display = "—"
            result_text = "No post yet today" if period == "today" else f"No post in {time_label.lower()}"
            change_text = "—"
            status_text = "Waiting"
        else:
            posts_display = str(count)
            status_text = "On track"
            g_views = sum(snaps.get(t.id, {}).get("views") or 0 for t in g_targets)
            g_reach = sum(max(snaps.get(t.id, {}).get("views") or 0, snaps.get(t.id, {}).get("impressions") or 0) for t in g_targets)
            g_likes = sum(snaps.get(t.id, {}).get("likes") or 0 for t in g_targets)
            g_comments = sum(snaps.get(t.id, {}).get("comments") or 0 for t in g_targets)
            g_shares = sum(snaps.get(t.id, {}).get("shares") or 0 for t in g_targets)
            g_saves = sum(snaps.get(t.id, {}).get("saves") or 0 for t in g_targets)
            g_clicks = sum(snaps.get(t.id, {}).get("clicks") or 0 for t in g_targets)

            if gid == "reach":
                result_text = f"Reach {_fmt_sales_compact(g_reach)} · Impr. {_fmt_sales_compact(max(g_reach, g_views))}"
            elif gid == "followers":
                result_text = f"+{total_follower_delta} followers" if total_follower_delta > 0 else f"{count} post{'s' if count > 1 else ''} live"
            elif gid == "awareness":
                result_text = f"Reach {_fmt_sales_compact(g_reach)} · Views {_fmt_sales_compact(g_views)}"
            elif gid == "engagement":
                result_text = f"{g_comments} comments · {g_likes} reactions"
            elif gid == "education":
                result_text = f"{g_saves} saves · {g_shares} shares"
            elif gid == "trust":
                eng_r = ((g_likes + g_comments + g_shares) / max(g_reach, 1)) * 100
                result_text = f"Engagement rate {eng_r:.1f}%"
            elif gid == "authority":
                result_text = f"{g_shares} shares · {g_comments} mentions"
            elif gid == "solution":
                result_text = f"{g_clicks} website clicks"
            elif gid == "conversion":
                result_text = f"{total_leads} leads generated"
            else:
                result_text = f"{count} post{'s' if count > 1 else ''}"

            if prev_count > 0:
                pct_diff = round(((count - prev_count) / prev_count) * 100)
                change_text = f"+{pct_diff}%" if pct_diff >= 0 else f"{pct_diff}%"
            else:
                change_text = "—"

        goals_data[gid] = {
            "posts": posts_display,
            "result": result_text,
            "change": change_text,
            "status": status_text,
        }

    # Footnote summary
    today_since = datetime.combine(today_local, datetime.min.time(), PHNOM_PENH)
    today_end = datetime.combine(today_local, datetime.max.time(), PHNOM_PENH)
    live_today = db.scalars(
        select(PostTarget)
        .join(Post, Post.id == PostTarget.post_id)
        .where(
            scope(PostTarget, ws),
            Post.brand_id.in_(brand_ids),
            PostTarget.status == "posted",
            PostTarget.published_at >= today_since,
            PostTarget.published_at <= today_end,
        )
        .options(selectinload(PostTarget.post))
    ).all()
    queued_today = db.scalars(
        select(PostTarget)
        .join(Post, Post.id == PostTarget.post_id)
        .where(
            scope(PostTarget, ws),
            Post.brand_id.in_(brand_ids),
            PostTarget.status == "queued",
            PostTarget.scheduled_for >= today_since,
            PostTarget.scheduled_for <= today_end,
        )
        .options(selectinload(PostTarget.post))
    ).all()

    live_labels = [GOALS.get(goal_of(t.post.pillar or ""), {}).get("label") for t in live_today if goal_of(t.post.pillar or "")]
    live_labels = sorted(list(set(filter(None, live_labels))))
    queued_labels = [GOALS.get(goal_of(t.post.pillar or ""), {}).get("label") for t in queued_today if goal_of(t.post.pillar or "")]
    queued_labels = sorted(list(set(filter(None, queued_labels))))

    if period == "today":
        parts = []
        if live_labels:
            parts.append(f"{' and '.join(live_labels)} posts are live.")
        else:
            parts.append("No posts live yet today.")
        if queued_labels:
            parts.append(f"{' and '.join(queued_labels)} posts go out tonight.")
        note_text = f"Today so far: {' '.join(parts)}"
    else:
        note_text = f"{time_label} summary: {len(targets)} post target{'s' if len(targets) != 1 else ''} published across connected channels."

    has_real_records = len(targets) > 0 or total_leads > 0 or deals_won > 0

    # Calculate By Channel breakdown
    plat_targets = {}
    for t in targets:
        ch = db.get(Channel, t.channel_id)
        if ch:
            pslug = plat_slugs.get(ch.platform_id, "other")
            plat_targets.setdefault(pslug, []).append(t)

    plat_leads = {}
    for l in leads:
        src = (l.source or "").lower()
        if "facebook" in src or "fb" in src:
            plat_leads.setdefault("facebook", []).append(l)
        elif "tiktok" in src:
            plat_leads.setdefault("tiktok", []).append(l)
        elif "instagram" in src or "ig" in src:
            plat_leads.setdefault("instagram", []).append(l)
        elif "telegram" in src:
            plat_leads.setdefault("telegram", []).append(l)
        elif "youtube" in src:
            plat_leads.setdefault("youtube", []).append(l)

    channel_specs = [
        {"name": "Facebook", "slug": "facebook", "default_reach": 2500, "default_follows": "+20", "default_leads": 2, "default_won": 1, "default_rev": "$3,200", "default_spend": "$0", "default_cpl": "$0.0"},
        {"name": "TikTok", "slug": "tiktok", "default_reach": 2100, "default_follows": "+41", "default_leads": 2, "default_won": 0, "default_rev": "$0", "default_spend": "$0", "default_cpl": "$0.0"},
        {"name": "Instagram", "slug": "instagram", "default_reach": 1100, "default_follows": "+16", "default_leads": 1, "default_won": 0, "default_rev": "$0", "default_spend": "—", "default_cpl": "—"},
        {"name": "Telegram", "slug": "telegram", "default_reach": 480, "default_follows": "+6", "default_leads": 1, "default_won": 0, "default_rev": "$0", "default_spend": "—", "default_cpl": "organic"},
        {"name": "YouTube", "slug": "youtube", "default_reach": 220, "default_follows": "+1", "default_leads": 0, "default_won": 0, "default_rev": "$0", "default_spend": "—", "default_cpl": "—"},
    ]

    by_channel_rows = []
    for cs in channel_specs:
        s = cs["slug"]
        c_targets = plat_targets.get(s, [])
        c_leads = plat_leads.get(s, [])
        c_won = [l for l in c_leads if l.outcome == "won"]
        c_rev = sum(float(l.value_usd or 0) for l in c_won)
        c_reach = sum(max(snaps.get(t.id, {}).get("views") or 0, snaps.get(t.id, {}).get("impressions") or 0) for t in c_targets)
        c_follows = plat_delta.get(s, 0)

        by_channel_rows.append({
            "channel": cs["name"],
            "slug": s,
            "reach": _fmt_sales_compact(c_reach) if c_reach > 0 else "0",
            "follows": f"+{c_follows}" if c_follows > 0 else "+0",
            "leads": len(c_leads),
            "won": len(c_won),
            "revenue": f"${c_rev:,.0f}" if c_rev > 0 else "$0",
            # Paid spend isn't tracked yet — the page shows a dash, not a made-up figure.
            "spend": "—",
            "cost_per_lead": "—",
        })

    # Funnel — only the steps we really record. Chatbot conversations aren't
    # tracked yet, so there is no "Chats" step.
    funnel_qualified = len([l for l in leads if l.status in ("ready", "handed_off", "closed") or l.score >= 50])
    funnel_opportunities = max(deals_won, len([l for l in leads if l.status in ("handed_off", "closed")]))
    steps = [
        ("Reach", total_reach, False),
        ("Engaged", total_eng, False),
        ("Leads", total_leads, True),
        ("Qualified", funnel_qualified, True),
        ("Opportunities", funnel_opportunities, True),
        ("Won", deals_won, True),
    ]
    funnel_data = []
    for i, (label, n, dark) in enumerate(steps):
        before = steps[i - 1][1] if i else 0
        funnel_data.append({
            "stage": label,
            "count": f"{n:,}",
            "raw": n,
            "pct": f"{n / before * 100:.1f}%".replace(".0%", "%") if i and before > 0 else None,
            "width": max(6, round(n / max(steps[0][1], 1) * 100)) if i else 100,
            "is_dark": dark,
        })

    # Content that sold — leads tied to the post that brought them in.
    by_post: dict[int, dict] = {}
    for l in leads:
        if not l.post_id or not l.post:
            continue
        row = by_post.setdefault(l.post_id, {"title": l.post.title or "Untitled post", "leads": 0, "won": 0, "revenue": 0.0})
        row["leads"] += 1
        if l.outcome == "won":
            row["won"] += 1
            row["revenue"] += float(l.value_usd or 0)
    ranked = sorted(by_post.values(), key=lambda r: (-r["revenue"], -r["won"], -r["leads"]))[:3]
    content_sold = [
        {
            "title": r["title"],
            "sub": f"{r['leads']} lead{'s' if r['leads'] != 1 else ''} · {r['won']} won",
            "revenue": f"${r['revenue']:,.0f}",
        }
        for r in ranked
    ]
    tied = sum(1 for l in leads if l.post_id)

    # What to change next — only things the numbers show, and only with enough posts.
    recommendations = []
    goal_posts = Counter(goal_of(t.post.pillar or "") for t in targets if goal_of(t.post.pillar or ""))
    goal_leads = Counter(goal_of(l.post.pillar or "") for l in leads if l.post and goal_of(l.post.pillar or ""))
    rates = {g: goal_leads[g] / goal_posts[g] for g in goal_posts if goal_posts[g] >= 3}
    if len(rates) >= 2:
        best = max(rates, key=rates.get)
        worst = min(rates, key=rates.get)
        if rates[best] > 0 and rates[best] >= 2 * rates[worst]:
            recommendations.append({
                "id": f"more_{best}",
                "title": f"Make more {GOALS[best]['label']} posts",
                "description": f"They brought {rates[best]:.1f} leads per post, against {rates[worst]:.1f} for {GOALS[worst]['label']}.",
                "confidence": f"Based on {goal_posts[best] + goal_posts[worst]} posts",
            })
    plat_rates = {s: len(plat_leads.get(s, [])) / len(plat_targets[s]) for s in plat_targets if len(plat_targets[s]) >= 3}
    if len(plat_rates) >= 2:
        best = max(plat_rates, key=plat_rates.get)
        if plat_rates[best] > 0:
            recommendations.append({
                "id": f"channel_{best}",
                "title": f"{best.capitalize()} is your best lead channel",
                "description": f"{plat_rates[best]:.1f} leads per post — more than any other channel you post on.",
                "confidence": f"Based on {len(plat_targets[best])} posts",
            })

    return {
        "period": period,
        "has_real_records": has_real_records,
        "reach": {
            "value": _fmt_sales_compact(total_reach),
            "raw": total_reach,
            "sub": f"{time_label} · {reach_pct}" if reach_pct else (time_label if targets else f"{time_label} · no posts yet"),
        },
        "followers": {
            "value": f"+{total_follower_delta:,}" if total_follower_delta > 0 else "+0",
            "raw": total_follower_delta,
            "sub": followers_sub,
        },
        "engagementRate": {
            "value": f"{eng_rate:.1f}%",
            "raw": eng_rate,
            "sub": f"Across {len(targets)} post{'s' if len(targets) != 1 else ''}" if targets else "No posts in this period",
        },
        "leads": {
            "value": str(total_leads),
            "raw": total_leads,
            "sub": leads_sub,
        },
        "dealsWon": {
            "value": str(deals_won),
            "raw": deals_won,
            "sub": deals_sub,
        },
        "revenue": {
            "value": f"${revenue:,.0f}" if revenue > 0 else "$0",
            "raw": revenue,
            "sub": revenue_sub,
        },
        "goals": goals_data,
        "note": note_text,
        "counts": {
            "posts": len(targets),
            "leads": total_leads,
            "deals_won": deals_won,
            "revenue": revenue,
        },
        "by_channel": by_channel_rows,
        "funnel": funnel_data,
        "content_that_sold": content_sold,
        "leads_tied_to_posts": tied,
        "recommendations": recommendations,
    }


_BOOSTABLE = ("facebook", "instagram", "tiktok")  # platforms with a paid-boost product
_BOOST_TIERS = (10, 25, 50)


def _engagement(m: dict) -> int:
    return sum(m.get(k) or 0 for k in ("likes", "comments", "shares", "saves"))


@router.get("/insights/boosts")
def insights_boosts(brand_id: int | None = None, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Which recent posts are worth a paid boost — worked out from the brand's own
    numbers, no AI guesswork. A post qualifies when it beats its channel's average
    engagement by a clear margin AND has leads linked to it (likes alone don't
    sell). Nothing is sent to an ad account; this only recommends."""
    if brand_id is not None:
        owned(db, Brand, brand_id, ws)
        brand_ids = [brand_id]
    else:
        brand_ids = [b.id for b in db.scalars(select(Brand).where(scope(Brand, ws))).all()]
    if not brand_ids:
        return {"items": [], "baseline_posts": 0, "can_judge_leads": False}

    now = datetime.now(UTC)
    rows = db.execute(
        select(PostTarget, Post, Channel)
        .join(Post, Post.id == PostTarget.post_id)
        .join(Channel, Channel.id == PostTarget.channel_id)
        .where(
            scope(PostTarget, ws),
            Post.brand_id.in_(brand_ids),
            PostTarget.status == "posted",
            PostTarget.published_at >= now - timedelta(days=60),
        )
    ).all()
    plat_slugs = dict(db.execute(select(Platform.id, Platform.slug)).all())

    tids = [t.id for t, _, _ in rows]
    snaps: dict[int, dict] = {}
    if tids:
        for sn in db.scalars(select(MetricSnapshot).where(MetricSnapshot.target_id.in_(tids)).order_by(MetricSnapshot.taken_at.asc())):
            snaps[sn.target_id] = sn.metrics  # the latest reading wins

    lead_counts: Counter = Counter()
    won_counts: Counter = Counter()
    for pid, outcome in db.execute(select(Lead.post_id, Lead.outcome).where(Lead.brand_id.in_(brand_ids), Lead.post_id.is_not(None))):
        lead_counts[pid] += 1
        if outcome == "won":
            won_counts[pid] += 1
    can_judge_leads = bool(lead_counts)

    # What each tagged post is about, and which of those labels bring leads.
    posts_by_id = {post.id: post for _, post, _ in rows}
    tagged = [p for p in posts_by_id.values() if p.content_tags]
    works = post_tags.what_works(
        [{"tags": p.content_tags, "leads": lead_counts.get(p.id, 0), "won": won_counts.get(p.id, 0)} for p in tagged]
    )
    works_by_label = {(w["field"], w["value"]): w for w in works}

    # Channel baseline: average engagement of this platform's posts over 60 days.
    by_plat: dict[str, list[int]] = {}
    for t, _, ch in rows:
        by_plat.setdefault(plat_slugs.get(ch.platform_id, "other"), []).append(_engagement(snaps.get(t.id, {})))

    best: dict[int, dict] = {}  # one card per post — its strongest channel
    for t, post, ch in rows:
        slug = plat_slugs.get(ch.platform_id, "other")
        age = now - t.published_at if t.published_at else timedelta(0)
        if slug not in _BOOSTABLE or age < timedelta(hours=4) or age > timedelta(days=7):
            continue
        peers = by_plat.get(slug, [])
        if len(peers) < 4:  # too few posts to say what "average" is
            continue
        m = snaps.get(t.id, {})
        eng = _engagement(m)
        avg = (sum(peers) - eng) / (len(peers) - 1)
        if avg <= 0 or eng <= 0:
            continue
        ratio = eng / avg
        leads = lead_counts.get(post.id, 0)
        if ratio < 1.5:
            continue
        if leads:
            kind = "boost"
            tier = 50 if (ratio >= 3 or leads >= 3) else 25 if (ratio >= 2 or leads >= 2) else 10
            reason = f"{ratio:.1f}× the usual engagement on {slug.capitalize()} and {leads} lead{'s' if leads > 1 else ''} came from it."
        elif can_judge_leads:
            kind, tier = "skip", None
            reason = f"{ratio:.1f}× the usual engagement, but no leads came from it — likes, not buyers."
        else:
            kind, tier = "check", None
            reason = f"{ratio:.1f}× the usual engagement. Link the leads it brought in (Leads & hand-off) to see if boosting would pay."
        tags = post.content_tags or {}
        if kind == "boost":
            match = next(
                (works_by_label[(f, tags[f])] for f in ("audience", "pain_point", "topic", "cta") if (f, tags.get(f)) in works_by_label),
                None,
            )
            if match:
                reason += (
                    f" Posts with the same {match['label']} “{match['value']}” bring "
                    f"{match['per_post']} leads each ({match['vs_average']}× your average)."
                )
        item = {
            "post_id": post.id,
            "title": post.title or t.title or "Untitled post",
            "summary": tags.get("summary", ""),
            "tags": {k: tags.get(k, "") for k in ("topic", "audience", "pain_point", "cta")} if tags else None,
            "channel": slug,
            "posted_at": t.published_at,
            "kind": kind,
            "ratio": round(ratio, 1),
            "leads": leads,
            "reach": max(m.get("views") or 0, m.get("impressions") or 0),
            "reason": reason,
            "budget": tier,
            "tiers": list(_BOOST_TIERS),
        }
        if post.id not in best or item["ratio"] > best[post.id]["ratio"]:
            best[post.id] = item

    order = {"boost": 0, "check": 1, "skip": 2}
    items = sorted(best.values(), key=lambda i: (order[i["kind"]], -i["ratio"]))
    untagged = sum(1 for p in posts_by_id.values() if not p.content_tags)
    return {
        "items": items[:6],
        "baseline_posts": len(rows),
        "can_judge_leads": can_judge_leads,
        "untagged": untagged,
        "tagged": len(tagged),
        "what_works": works,
    }


@router.post("/insights/tag-posts")
def insights_tag_posts(brand_id: int | None = None, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Let the AI read the latest untagged published posts (up to a batch) and
    label what each is about. Costs AI credit; refused when it runs out."""
    if brand_id is not None:
        owned(db, Brand, brand_id, ws)
        brand_ids = [brand_id]
    else:
        brand_ids = [b.id for b in db.scalars(select(Brand).where(scope(Brand, ws))).all()]
    if not brand_ids:
        return {"tagged": 0, "remaining": 0}
    since = datetime.now(UTC) - timedelta(days=60)
    posted = (
        select(PostTarget.post_id)
        .where(PostTarget.status == "posted", PostTarget.published_at >= since, PostTarget.caption != "")
        .group_by(PostTarget.post_id)
        .subquery()
    )
    todo = db.scalars(
        select(Post)
        .where(scope(Post, ws), Post.brand_id.in_(brand_ids), Post.content_tags.is_(None), Post.id.in_(select(posted.c.post_id)))
        .order_by(Post.id.desc())
    ).all()
    done = 0
    labels_by_brand: dict[int, dict] = {}
    try:
        for post in todo[: post_tags.BATCH]:
            if post.brand_id not in labels_by_brand:
                known = db.scalars(select(Post).where(Post.brand_id == post.brand_id, Post.content_tags.is_not(None)).limit(200)).all()
                labels_by_brand[post.brand_id] = post_tags.known_labels(known)
            if post_tags.tag_post(db, post, labels_by_brand[post.brand_id]):
                done += 1
                db.commit()  # keep what is done if a later call fails
    except content_ai.ContentAIError as exc:
        db.commit()
        if not done:
            raise HTTPException(503, str(exc)) from exc
    return {"tagged": done, "remaining": max(0, len(todo) - done)}


@router.get("/insights/{target_id}/history")
def insights_history(target_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Saved readings for one post, plus its channel's member count over time
    (Telegram). Empty lists until the first readings are saved."""
    t = owned(db, PostTarget, target_id, ws, "Post")
    snaps = db.scalars(
        select(MetricSnapshot)
        .where(MetricSnapshot.workspace_id == ws, MetricSnapshot.target_id == t.id)
        .order_by(MetricSnapshot.taken_at)
        .limit(500)
    ).all()
    chan = db.scalars(
        select(MetricSnapshot)
        .where(MetricSnapshot.workspace_id == ws, MetricSnapshot.channel_id == t.channel_id, MetricSnapshot.target_id.is_(None))
        .order_by(MetricSnapshot.taken_at)
        .limit(500)
    ).all()
    return {
        "published_at": t.published_at,
        "post": [{"at": s.taken_at, **s.metrics} for s in snaps],
        "channel": [{"at": s.taken_at, **s.metrics} for s in chan],
    }


_COLLECT_DAYS = 14  # keep sampling a post for its first two weeks


def collect_snapshots(db: Session) -> int:
    """Background collector (app/scheduler.py): read the current numbers of
    every post published in the last _COLLECT_DAYS, across all workspaces, and
    save them — so growth charts fill in even if nobody opens Analytics."""
    since = datetime.now(UTC) - timedelta(days=_COLLECT_DAYS)
    try:
        reattach_posts(db)
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("could not reattach posts")
    plats = _platform_map(db)
    targets = db.scalars(
        select(PostTarget)
        .options(selectinload(PostTarget.post), selectinload(PostTarget.channel))
        .where(PostTarget.status == "posted", PostTarget.external_id != "", PostTarget.published_at >= since)
    ).all()
    brands = {b.id: b for b in db.scalars(select(Brand)).all()}
    by_ws: dict[int, list[dict]] = {}
    cache = _MetricsCache()
    for t in targets:
        ch = t.channel
        brand = brands.get(t.post.brand_id) if t.post else None
        plat = plats.get(ch.platform_id) if ch else None
        if not ch or not brand or not plat or ch.status != "live":
            continue
        result = _post_metrics(plat.slug, ch.config or {}, t.external_id, cache)
        by_ws.setdefault(brand.workspace_id, []).append(
            {"target_id": t.id, "channel_id": ch.id, "platform_slug": plat.slug, **result}
        )
    return sum(record_snapshots(db, ws, rows) for ws, rows in by_ws.items())


@router.get("/sidebar")
def sidebar_counts(db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    ws = user.workspace_id

    def count(model, *where):
        return db.scalar(
            select(func.count()).select_from(model).where(scope(model, ws), *where)
        )

    live = count(Channel, Channel.status != "off")
    total = count(Channel)
    queued = count(PostTarget)
    waiting = count(Draft, Draft.status == "waiting")
    library = count(GenerationJob, GenerationJob.video_id.is_not(None), GenerationJob.kind != "scene")
    # Finished since this person last opened the Library — the sidebar badge.
    library_new = db.scalar(
        select(func.count())
        .select_from(GenerationJob)
        .join(Video, Video.id == GenerationJob.video_id)
        .where(
            scope(GenerationJob, ws),
            GenerationJob.kind != "scene",
            Video.created_at > _library_seen_at(user),
        )
    )
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
        "library_new": library_new or 0,
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

    # A post made from an AI idea keeps that idea's angle and pillar, so
    # learning.py can compare them — matched on the unedited caption (no draft
    # link here).
    caption = next((t.caption for t in payload.targets if t.caption.strip()), "")
    idea = (
        db.execute(
            select(Draft.angle, Draft.pillar)
            .where(
                Draft.brand_id == payload.brand_id,
                Draft.body == caption,
                (Draft.angle != "") | (Draft.pillar != ""),
            )
            .order_by(Draft.id.desc())
            .limit(1)
        ).first()
        if caption
        else None
    )
    post = Post(
        brand_id=payload.brand_id,
        video_id=payload.video_id,
        title=payload.title,
        status="scheduled",
        angle=idea.angle if idea else "",
        pillar=idea.pillar if idea else "",
        subject=idea.subject if idea else "",
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


@router.post("/channels/{channel_id}/import-posts")
def import_channel_posts(channel_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Pull in this Page's recent posts made outside ContentFlow now,
    instead of waiting for the background import."""
    from app import importer, meta

    ch = owned(db, Channel, channel_id, ws)
    try:
        added = importer.import_channel(db, ch)
    except meta.MetaError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"imported": added, "days": importer.LOOKBACK_DAYS}


# ── keep each published post on the channel of the account it's on ───────
_REATTACH_PLATFORMS = ("facebook", "instagram")


def reattach_posts(db: Session, ws: int | None = None) -> int:
    """Move published posts whose channel is the wrong account, or no longer
    connected, onto the brand's connected channel for that account — so their
    stats are read with the right token again. Facebook post ids start with
    the Page id ("{page}_{post}"), which says exactly where a post belongs;
    otherwise (Instagram, Facebook video ids) a post only moves when the brand
    has exactly one connected account on that platform. Database only; returns
    how many posts moved."""
    plats = {p.id: p.slug for p in db.scalars(select(Platform).where(Platform.slug.in_(_REATTACH_PLATFORMS)))}
    q = select(Channel).where(Channel.platform_id.in_(list(plats)))
    if ws is not None:
        q = q.where(scope(Channel, ws))
    chans = {c.id: c for c in db.scalars(q)}
    if not chans:
        return 0
    live: dict[tuple[int, int], list[Channel]] = {}
    for c in chans.values():
        if c.status == "live" and (c.config or {}).get("access_token"):
            live.setdefault((c.brand_id, c.platform_id), []).append(c)

    moved = 0
    targets = db.scalars(
        select(PostTarget).where(
            PostTarget.channel_id.in_(list(chans)), PostTarget.status == "posted", PostTarget.external_id != ""
        )
    )
    for t in targets:
        ch = chans[t.channel_id]
        siblings = live.get((ch.brand_id, ch.platform_id), [])
        right = None
        page = t.external_id.split("_", 1)[0] if plats[ch.platform_id] == "facebook" and "_" in t.external_id else ""
        if page:
            if str((ch.config or {}).get("page_id") or "") == page and ch in siblings:
                continue
            right = next((c for c in siblings if str((c.config or {}).get("page_id") or "") == page), None)
        elif ch not in siblings and len(siblings) == 1:
            right = siblings[0]
        if right is not None and right.id != ch.id:
            t.channel_id = right.id
            moved += 1
    if moved:
        db.commit()
        log.info("moved %d published post(s) onto their account's connected channel", moved)
    return moved


# ── edit a scheduled post before it goes out ─────────────────────────────
# A post can be edited until shortly before it's due: the delivery worker
# reads a due post a moment before sending it, so edits inside this window
# could be ignored (or a removed channel sent anyway) — refuse them instead.
_EDIT_LOCK = timedelta(minutes=1)


def _editable(t: PostTarget, now: datetime) -> bool:
    return t.status == "queued" and (t.scheduled_for is None or t.scheduled_for > now + _EDIT_LOCK)


def _post_editor(db: Session, post: Post, ws: int) -> dict:
    from app.media import kind_for

    plats = _platform_map(db)
    now = datetime.now(UTC)
    video = db.get(Video, post.video_id) if post.video_id else None
    targets = db.scalars(select(PostTarget).where(PostTarget.post_id == post.id).order_by(PostTarget.id)).all()
    chans = {
        c.id: c
        for c in db.scalars(select(Channel).where(Channel.brand_id == post.brand_id).order_by(Channel.id))
    }

    def chan_out(c: Channel) -> dict:
        plat = plats.get(c.platform_id)
        return {
            "id": c.id,
            "platform_slug": plat.slug if plat else "",
            "platform_name": plat.name if plat else "?",
            "handle": c.handle or "",
            "char_limit": plat.char_limit if plat else 2200,
            "status": c.status,
        }

    return {
        "post_id": post.id,
        "brand_id": post.brand_id,
        "title": post.title,
        "media": (
            {"kind": kind_for(video.url, None) or "video", "url": video.url, "filename": video.filename}
            if video and video.url
            else None
        ),
        "targets": [
            {
                "id": t.id,
                "channel_id": t.channel_id,
                "caption": t.caption,
                "title": t.title,
                "scheduled_for": t.scheduled_for,
                "status": t.status,
                "editable": _editable(t, now),
                "channel": chan_out(chans[t.channel_id]) if t.channel_id in chans else None,
            }
            for t in targets
        ],
        # Where it can go: the brand's connected channels.
        "channels": [chan_out(c) for c in chans.values() if c.status == "live"],
    }


@router.get("/posts/{post_id}/edit")
def post_edit_view(post_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """A scheduled post as the editor needs it — each channel's caption and
    time, which ones can still change, and the channels it could go to."""
    return _post_editor(db, owned(db, Post, post_id, ws, "Post"), ws)


class EditTargetIn(BaseModel):
    id: int | None = None  # None = add this channel
    channel_id: int
    caption: str = Field(max_length=10000)
    title: str = Field(default="", max_length=200)
    scheduled_for: datetime


class EditPostIn(BaseModel):
    # The full set of channels that should still go out. A queued channel left
    # out is removed from the post.
    targets: list[EditTargetIn] = Field(max_length=30)


@router.put("/posts/{post_id}/edit")
def post_edit_save(
    post_id: int, payload: EditPostIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Save changes to a scheduled post: captions, times, and which channels.
    Channels already sent (or sending now) can't be changed."""
    from app.media import kind_for

    post = owned(db, Post, post_id, ws, "Post")
    now = datetime.now(UTC)
    plats = _platform_map(db)
    current = {
        t.id: t
        for t in db.scalars(select(PostTarget).where(PostTarget.post_id == post.id).with_for_update())
    }
    editable = {i: t for i, t in current.items() if _editable(t, now)}

    video = db.get(Video, post.video_id) if post.video_id else None
    kind = (kind_for(video.url, None) if video and video.url else None) or "text"

    seen: set[int] = set()
    checked: list[tuple[EditTargetIn, Channel]] = []
    for it in payload.targets:
        ch = owned(db, Channel, it.channel_id, ws, "Channel")
        plat = plats.get(ch.platform_id)
        name = f"{plat.name if plat else 'Channel'} ({ch.handle})" if ch.handle else (plat.name if plat else "Channel")
        if ch.brand_id != post.brand_id:
            raise HTTPException(422, "Pick channels of this post's brand.")
        if ch.id in seen:
            raise HTTPException(422, f"{name} is in the list twice.")
        seen.add(ch.id)
        if it.id is not None:
            if it.id not in current:
                raise HTTPException(404, "That channel isn't part of this post any more — reload and try again.")
            if it.id not in editable:
                raise HTTPException(
                    409, f"The {name} post has already gone out or is going out right now — it can't be changed."
                )
        if ch.status != "live":
            raise HTTPException(422, f"{name} isn't connected — reconnect it, or remove it from this post.")
        slug = plat.slug if plat else ""
        if slug == "tiktok" and kind != "video":
            raise HTTPException(422, f"{name} only takes videos.")
        if slug == "instagram" and kind == "text":
            raise HTTPException(422, f"{name} needs an image or video.")
        caption = it.caption.strip()
        if not caption:
            raise HTTPException(422, f"The caption for {name} is empty.")
        limit = plat.char_limit if plat and plat.char_limit else 0
        if limit and len(caption) > limit:
            raise HTTPException(422, f"The caption for {name} is {len(caption) - limit} characters over its {limit} limit.")
        when = it.scheduled_for if it.scheduled_for.tzinfo else it.scheduled_for.replace(tzinfo=PHNOM_PENH)
        if when <= now + _EDIT_LOCK:
            raise HTTPException(422, f"Pick a time at least a minute from now for {name}.")
        checked.append((it, ch))

    keep: set[int] = set()
    for it, ch in checked:
        when = it.scheduled_for if it.scheduled_for.tzinfo else it.scheduled_for.replace(tzinfo=PHNOM_PENH)
        if it.id is not None:
            t = editable[it.id]
            if t.channel_id != ch.id:
                t.platform_options = {}  # per-platform choices belonged to the old channel
            t.channel_id = ch.id
            t.caption = it.caption.strip()
            t.title = (it.title or t.title or post.title or "").strip()[:200]
            t.scheduled_for = when
            keep.add(t.id)
        else:
            db.add(
                PostTarget(
                    post_id=post.id,
                    channel_id=ch.id,
                    caption=it.caption.strip(),
                    title=(it.title or post.title or "").strip()[:200],
                    scheduled_for=when,
                    status="queued",
                )
            )
    removed = [t for i, t in editable.items() if i not in keep]
    for t in removed:
        db.delete(t)
    db.flush()

    left = db.scalar(select(func.count()).select_from(PostTarget).where(PostTarget.post_id == post.id)) or 0
    if left == 0:
        db.delete(post)  # every channel removed — the post is cancelled
        db.commit()
        return {"post_id": post_id, "cancelled": True}
    if any(t.status == "queued" for t in db.scalars(select(PostTarget).where(PostTarget.post_id == post.id))):
        post.status = "scheduled"
    db.commit()
    return _post_editor(db, post, ws)


@router.delete("/posts/{post_id}/scheduled")
def post_cancel_scheduled(post_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Cancel what's still waiting to go out. Channels already posted stay as
    history; the post itself goes when nothing is left."""
    post = owned(db, Post, post_id, ws, "Post")
    now = datetime.now(UTC)
    targets = db.scalars(select(PostTarget).where(PostTarget.post_id == post.id).with_for_update()).all()
    waiting = [t for t in targets if _editable(t, now)]
    if not waiting:
        raise HTTPException(409, "Nothing left to cancel — it has already gone out or is going out now.")
    for t in waiting:
        db.delete(t)
    db.flush()
    if len(waiting) == len(targets):
        db.delete(post)
    db.commit()
    return {"post_id": post_id, "cancelled": len(waiting)}


# ── delete a post — on the platform first, then here ──────────────────────
# A published channel is only removed from ContentFlow once its platform has
# confirmed the delete, so nothing stays live that we no longer show. Where
# the platform can't delete (Instagram, TikTok) or the delete failed, the row
# stays and the reply says why; ``force=true`` then removes it here only —
# for when the person has deleted it on the platform themselves.
def _take_down(db: Session, target_id: int, force: bool) -> dict:
    """Delete one channel's copy. Commits on its own, so a platform delete
    that went through is never forgotten because a later channel failed."""
    t = db.scalar(select(PostTarget).where(PostTarget.id == target_id).with_for_update())
    if t is None:
        return {"target_id": target_id, "result": "not_on_platform"}
    ch = db.get(Channel, t.channel_id)
    out = {
        "target_id": t.id,
        "channel_id": t.channel_id,
        "platform": ch.platform.slug if ch and ch.platform else "",
        "detail": "",
    }
    # Going out now (or within the edit lock) — the delivery worker may be
    # about to send it, same rule as editing / cancelling.
    if t.status == "posting" or (t.status == "queued" and not _editable(t, datetime.now(UTC))):
        db.rollback()
        return {**out, "result": "busy", "detail": "It's being sent right now — try again in a minute."}
    if t.status == "posted" and ch is not None:
        try:
            out["result"] = unpublish(t, ch)
        except CannotUnpublish as exc:
            if not force:
                db.rollback()
                return {**out, "result": "manual", "detail": str(exc)}
            out["result"] = "removed_here_only"
        except PublishError as exc:
            if not force:
                db.rollback()
                return {**out, "result": "failed", "detail": str(exc)}
            out["result"] = "removed_here_only"
    else:
        out["result"] = "not_on_platform"  # queued / failed — it never went out
    post_id = t.post_id
    db.delete(t)  # its metric snapshots go with it (ON DELETE CASCADE)
    db.flush()
    if not db.scalar(select(func.count()).select_from(PostTarget).where(PostTarget.post_id == post_id)):
        post = db.get(Post, post_id)
        if post is not None:
            db.delete(post)
    db.commit()
    return out


def _removal_reply(post_id: int, results: list[dict], db: Session) -> dict:
    return {
        "post_id": post_id,
        "post_deleted": db.get(Post, post_id) is None,
        "channels": results,
        # Still up somewhere and still shown here — the page asks what to do.
        "remaining": [r for r in results if r["result"] in ("manual", "failed", "busy")],
    }


@router.delete("/posts/{post_id}")
def post_delete(
    post_id: int, force: bool = False, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Delete a post everywhere: every published channel is taken down on its
    platform, anything still queued is cancelled."""
    post = owned(db, Post, post_id, ws, "Post")
    ids = db.scalars(select(PostTarget.id).where(PostTarget.post_id == post.id).order_by(PostTarget.id)).all()
    results = [_take_down(db, tid, force) for tid in ids]
    if not ids:
        db.delete(post)
        db.commit()
    return _removal_reply(post_id, results, db)


@router.delete("/post-targets/{target_id}")
def post_target_delete(
    target_id: int, force: bool = False, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Delete one channel's copy of a post (on its platform first)."""
    t = owned(db, PostTarget, target_id, ws, "Post")
    post_id = t.post_id
    return _removal_reply(post_id, [_take_down(db, target_id, force)], db)


# ── repost a published post ───────────────────────────────────────────────
class RepostIn(BaseModel):
    caption: str = Field(min_length=1, max_length=5000)
    title: str = Field(default="", max_length=200)
    channel_ids: list[int] = Field(min_length=1, max_length=20)
    # "now" | "best" (each channel's best / usual posting time) | an ISO datetime
    when: str = "best"


# Where Facebook / Instagram serve post pictures from — the only hosts an
# imported post's picture is ever downloaded from.
_PLATFORM_MEDIA_HOSTS = (".fbcdn.net", ".cdninstagram.com", ".fbsbx.com")
_MAX_REPOST_IMAGE = 15 * 1024 * 1024


def _repost_media(db: Session, post: Post, target: PostTarget) -> int | None:
    """The media to repost with: the post's own file, or — for a post made
    directly on Facebook / Instagram and imported — its picture, downloaded
    once into the Library and attached to that post from then on."""
    if post.video_id:
        return post.video_id
    imported = (target.platform_options or {}).get("imported") or {}
    picture = imported.get("picture") or ""
    if not picture:
        return None  # a text-only post
    if imported.get("kind") == "video":
        raise HTTPException(
            422,
            "Facebook doesn't let apps download videos posted directly on the Page. "
            "To repost it, upload the video in New post.",
        )
    url = urlparse(picture)
    if url.scheme != "https" or not (url.hostname or "").endswith(_PLATFORM_MEDIA_HOSTS):
        raise HTTPException(422, "This post's picture can't be fetched — upload it in New post instead.")
    try:
        resp = httpx.get(picture, timeout=30.0)
    except httpx.HTTPError:
        resp = None
    ctype = (resp.headers.get("content-type") or "").split(";")[0] if resp is not None else ""
    if resp is None or resp.status_code >= 400 or not ctype.startswith("image/"):
        raise HTTPException(
            502,
            "Couldn't download the original picture from Facebook (its link may have expired). "
            "Press \"Import past posts\" on the Platforms page to refresh it, then try again.",
        )
    if len(resp.content) > _MAX_REPOST_IMAGE:
        raise HTTPException(422, "The original picture is too large to repost.")
    from app.media import store_blob

    ext = {"image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}.get(ctype, ".jpg")
    brand = db.get(Brand, post.brand_id)
    video = Video(
        workspace_id=brand.workspace_id,
        brand_id=post.brand_id,
        filename=f"post-{target.id}{ext}",
        size_bytes=len(resp.content),
        source="import",
        tag="image",
        url=store_blob(db, resp.content, ext, ctype),
    )
    db.add(video)
    db.flush()
    post.video_id = video.id  # keep it — Analytics then shows this copy too
    return video.id


@router.post("/post-targets/{target_id}/repost", status_code=201)
def repost_target(
    target_id: int, payload: RepostIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Post an already-published post again — same media, the caption as
    edited — to one or more of the brand's connected channels, now, at each
    channel's best time, or at a chosen time."""
    from app.improve import _best_slot
    from app.media import kind_for

    src = owned(db, PostTarget, target_id, ws, "Post")
    if src.status != "posted":
        raise HTTPException(422, "Only published posts can be reposted.")
    post = db.get(Post, src.post_id)
    src_channel = db.get(Channel, src.channel_id)
    plats = _platform_map(db)

    channels = [owned(db, Channel, cid, ws, "Channel") for cid in dict.fromkeys(payload.channel_ids)]
    for ch in channels:
        if ch.brand_id != post.brand_id:
            raise HTTPException(422, "Pick channels of the same brand as the original post.")
        if ch.status != "live":
            raise HTTPException(422, f"{ch.handle or 'That channel'} isn't connected — reconnect it first.")

    video_id = _repost_media(db, post, src)
    video = db.get(Video, video_id) if video_id else None
    kind = (kind_for(video.url, None) if video and video.url else None) or "text"
    for ch in channels:
        slug = plats[ch.platform_id].slug if ch.platform_id in plats else ""
        name = f"{plats[ch.platform_id].name} ({ch.handle})" if ch.platform_id in plats else ch.handle
        if slug == "tiktok" and kind != "video":
            raise HTTPException(422, f"{name} only takes videos — untick it for this post.")
        if slug == "instagram" and kind == "text":
            raise HTTPException(422, f"{name} needs an image or video — untick it for this post.")

    now = datetime.now(PHNOM_PENH)
    fixed: datetime | None = None
    if payload.when == "now":
        fixed = now
    elif payload.when != "best":
        try:
            fixed = datetime.fromisoformat(payload.when.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(422, "That time isn't valid.") from exc
        if fixed.tzinfo is None:
            fixed = fixed.replace(tzinfo=PHNOM_PENH)
        if fixed < now - timedelta(minutes=1):
            raise HTTPException(422, "Pick a time in the future.")

    title = (payload.title or src.title or post.title or "Repost").strip()[:200]
    new = Post(
        brand_id=post.brand_id,
        video_id=video_id,
        title=title,
        status="scheduled",
        angle=post.angle or "",
        pillar=post.pillar or "",
        subject=post.subject or "",
    )
    db.add(new)
    db.flush()
    created: list[PostTarget] = []
    for ch in channels:
        slug = plats[ch.platform_id].slug if ch.platform_id in plats else ""
        same_platform = src_channel is not None and ch.platform_id == src_channel.platform_id
        pt = PostTarget(
            post_id=new.id,
            channel_id=ch.id,
            caption=payload.caption.strip(),
            title=title,
            scheduled_for=fixed or _best_slot(db, post.brand_id, slug),
            status="queued",
            # Per-platform choices (TikTok privacy etc.) carry over to the same platform.
            platform_options={k: v for k, v in (src.platform_options or {}).items() if k != "imported"}
            if same_platform
            else {},
        )
        db.add(pt)
        created.append(pt)
    db.commit()

    result = {
        "post_id": new.id,
        "targets": [{"id": pt.id, "scheduled_for": pt.scheduled_for} for pt in created],
    }
    if payload.when == "now":
        published, failed = [], []
        for pt in created:
            db.refresh(pt)
            outcome = _run_publish(db, pt)
            (published if outcome["status"] == "posted" else failed).append(outcome)
        result.update(published=published, failed=failed)
    return result


# ── delete a brand ────────────────────────────────────────────────────────
def _brand_usage(db: Session, brand_id: int) -> dict:
    def count(q) -> int:
        return db.scalar(select(func.count()).select_from(q.subquery())) or 0

    post_ids = select(Post.id).where(Post.brand_id == brand_id)
    return {
        "channels": count(select(Channel.id).where(Channel.brand_id == brand_id, Channel.status == "live")),
        "posts": count(post_ids),
        "queued": count(
            select(PostTarget.id).where(PostTarget.post_id.in_(post_ids), PostTarget.status.in_(("queued", "posting")))
        ),
        "drafts": count(select(Draft.id).where(Draft.brand_id == brand_id)),
        "products": count(select(Product.id).where(Product.brand_id == brand_id)),
    }


@router.get("/brands/{brand_id}/delete-preview")
def brand_delete_preview(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """What deleting this brand would remove — shown in the confirm step."""
    brand = owned(db, Brand, brand_id, ws)
    return {"id": brand.id, "name": brand.name, **_brand_usage(db, brand.id)}


@router.delete("/brands/{brand_id}", status_code=204)
def delete_brand(brand_id: int, db: Session = Depends(get_db), user: TeamMember = Depends(get_current_user)):
    """Delete a brand and everything that belongs only to it: its channels
    (and saved logins), posts and their stats, ideas, products, automation and
    weekly plans (database cascades). Queued posts never go out. Images and
    videos stay in the workspace Library. Owners and admins only."""
    if user.role not in MANAGER_ROLES:
        raise HTTPException(403, "Only a workspace owner or admin can delete a brand.")
    brand = owned(db, Brand, brand_id, user.workspace_id)
    db.delete(brand)
    db.commit()
    return None


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
    ch.config = {k: v for k, v in (ch.config or {}).items() if k in _IDENTITY_KEYS}
    ch.token_note = "Not connected"
    ch.last_post_at = None
    db.commit()
    return {"id": ch.id, "status": ch.status, "cancelled": len(pending)}


# Non-secret keys that say WHICH account a channel is (a Facebook Page, an
# Instagram account, a Telegram chat) — kept on disconnect, so reconnecting
# the same account brings back the same channel and its post history.
_IDENTITY_KEYS = ("page_id", "page_name", "ig_user_id", "ig_username", "chat_id")


def _claim_channel(db: Session, brand_id: int, platform_id: int, key: str, value: str) -> Channel:
    """The channel row a connected account should live in. A brand can have
    several accounts on one platform (e.g. three Facebook Pages), one channel
    each: reuse the row that already belongs to this account, else an empty
    "not connected" placeholder, else start a new row."""
    rows = db.scalars(
        select(Channel)
        .where(Channel.brand_id == brand_id, Channel.platform_id == platform_id)
        .order_by(Channel.id)
    ).all()
    for ch in rows:
        if str((ch.config or {}).get(key) or "") == str(value):
            return ch
    for ch in rows:
        if ch.status == "off" and not any((ch.config or {}).get(k) for k in _IDENTITY_KEYS):
            # Only a true placeholder: a row with posts may have belonged to a
            # different account (old disconnects wiped which one), and its
            # posts would then be read with the wrong account's token.
            has_posts = db.scalar(select(PostTarget.id).where(PostTarget.channel_id == ch.id).limit(1))
            if has_posts is None:
                return ch
    ch = Channel(brand_id=brand_id, platform_id=platform_id)
    db.add(ch)
    return ch


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
    config = payload.config or {}
    chat_id = str(config.get("chat_id") or "")
    if chat_id:
        # Telegram: a brand can post to several chats — one channel each.
        ch = _claim_channel(db, payload.brand_id, plat.id, "chat_id", chat_id)
    else:
        ch = db.scalar(
            select(Channel).where(Channel.brand_id == payload.brand_id, Channel.platform_id == plat.id)
        )
        if ch is not None and ch.status != "off":
            raise HTTPException(409, "That brand is already connected to this platform.")
        if ch is None:
            ch = Channel(brand_id=payload.brand_id, platform_id=plat.id)
            db.add(ch)
    verified = _verify_channel_config(plat.slug, config)
    ch.handle = (verified or {}).get("chat_title") or payload.handle or chat_id
    ch.status = "live"
    ch.token_note = _connect_note(verified, None)
    ch.config = {**(ch.config or {}), **config}
    ch.last_post_at = None
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
        missing = meta.missing_permissions(user_token)
    except meta.MetaError as exc:
        return to_channels(str(exc))

    if not pages:
        return to_channels(
            "No Facebook Pages found — you need to be an admin of at least one Page."
        )

    pending_id = meta.stash_pending(brand.id, payload.get("intent", "facebook"), pages, missing)
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
        # Permissions Facebook withheld from this login — the picker warns
        # about them (e.g. no pages_read_engagement = no stats, no import).
        "missing_permissions": record.get("missing", []),
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


class MetaPagePick(BaseModel):
    page_id: str
    facebook: bool = True
    instagram: bool = False


class MetaConfirmIn(BaseModel):
    # Several Pages at once — each becomes its own channel.
    pages: list[MetaPagePick] = Field(default_factory=list)
    # Older single-Page form, still accepted.
    page_id: str | None = None
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
    picks = payload.pages or (
        [MetaPagePick(page_id=payload.page_id, facebook=payload.connect_facebook, instagram=payload.connect_instagram)]
        if payload.page_id
        else []
    )
    picks = [pk for pk in picks if pk.facebook or pk.instagram]
    if not picks:
        raise HTTPException(400, "Pick at least one Page to connect.")
    by_id = {p["id"]: p for p in record["pages"]}
    for pk in picks:
        page = by_id.get(pk.page_id)
        if page is None:
            raise HTTPException(404, "That Page was not in the list you connected.")
        if pk.instagram and not page.get("ig_user_id"):
            raise HTTPException(400, f"{page['name']} has no linked Instagram Business account.")
    meta.pop_pending(pending_id)

    brand_id = record["brand_id"]
    connected: list[dict] = []
    claimed: list[Channel] = []
    platforms = {p.slug: p for p in db.scalars(select(Platform).where(Platform.slug.in_(("facebook", "instagram"))))}

    def upsert(platform_slug: str, identity: tuple[str, str], handle: str, config: dict) -> None:
        plat = platforms.get(platform_slug)
        if plat is None:
            return
        ch = _claim_channel(db, brand_id, plat.id, *identity)
        ch.status = "live"
        ch.handle = handle
        ch.token_note = "Connected via Facebook login"
        ch.config = {**(ch.config or {}), **config}
        ch.last_post_at = None
        claimed.append(ch)
        connected.append({"platform": platform_slug, "name": handle})

    for pk in picks:
        page = by_id[pk.page_id]
        if pk.facebook:
            upsert(
                "facebook",
                ("page_id", page["id"]),
                page["name"],
                {"access_token": page["access_token"], "page_id": page["id"], "page_name": page["name"]},
            )
        if pk.instagram:
            upsert(
                "instagram",
                ("ig_user_id", page["ig_user_id"]),
                f"@{page['ig_username']}" if page.get("ig_username") else page["name"],
                {
                    "access_token": page["access_token"],
                    "page_id": page["id"],
                    "ig_user_id": page["ig_user_id"],
                    "ig_username": page.get("ig_username", ""),
                },
            )
    db.commit()
    # Bring in what these Pages posted before (app/importer.py) — in the
    # background, so connecting stays instant.
    from app.importer import import_in_background

    import_in_background([ch.id for ch in claimed])
    return {"connected": connected, "importing": True}


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
            # A weekly-plan idea keeps its planned day (app/weekly.py).
            on_day = d.planned_for if d.source == "ai-weekly" else None
            post = schedule_draft_as_post(db, d, on_day=on_day)
        except ContentAIError as exc:
            raise HTTPException(422, str(exc)) from exc
        d.status = "scheduled"
        db.commit()
        return {"id": d.id, "status": d.status, "post_id": post.id}

    d.status = "approved"
    db.commit()
    return {"id": d.id, "status": d.status}


# ── media for an idea that has none (Calendar → "Generate image / video") ──
_media_running: set[int] = set()  # draft ids being given media right now
_media_lock = threading.Lock()


class DraftMediaIn(BaseModel):
    kind: str = Field(default="image", pattern="^(image|video)$")


@router.post("/drafts/{draft_id}/media", status_code=202)
def make_draft_media(
    draft_id: int, payload: DraftMediaIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Make an image or an 8s video for an idea that has no media, in the
    background. If the idea is already approved, it's then scheduled as a real
    post on its day — the same as approving an idea that came with media."""
    from app import billing

    d = owned(db, Draft, draft_id, ws)
    if d.video_id is not None:
        raise HTTPException(409, "This idea already has media.")
    if d.status == "rejected":
        raise HTTPException(409, "This idea was sent back.")
    s = get_settings()
    if payload.kind == "video":
        model = s.auto_video_model if s.video_provider == "gemini_veo" else None
        billing.require(ws, billing.video_cost(s.video_provider, 8, model), db)
    else:
        billing.require(ws, billing.IMAGE_HOLD, db)
    with _media_lock:
        if d.id in _media_running:
            raise HTTPException(409, "Already making media for this idea.")
        _media_running.add(d.id)
    threading.Thread(target=_draft_media_job, args=(d.id, payload.kind), daemon=True, name=f"draft-media-{d.id}").start()
    return {"id": d.id, "making": payload.kind}


def _draft_media_job(draft_id: int, kind: str) -> None:
    from app import billing
    from app.content_scheduler import (
        ContentAIError,
        _brand_snapshot,
        _first_frame_for,
        _generate_media_for,
        _generate_video_for,
        _product_snapshot,
        _today,
        schedule_draft_as_post,
    )
    from app.database import SessionLocal
    from app.models import Product

    db = SessionLocal()
    try:
        d = db.get(Draft, draft_id)
        brand = db.get(Brand, d.brand_id) if d else None
        if d is None or brand is None:
            return
        billing.bind(brand.workspace_id)
        products = [_product_snapshot(p) for p in db.scalars(select(Product).where(Product.brand_id == brand.id)).all()]
        idea = {"title": d.title, "caption": d.body, "meme": d.meme, "pillar": d.pillar, "poster": d.poster}
        if kind == "video":
            first_frame = _first_frame_for(db, brand.id, idea)
            video_id = _generate_video_for(_brand_snapshot(brand), idea, products, first_frame)
        else:
            video_id = _generate_media_for(_brand_snapshot(brand), idea, products)
        if video_id is None:
            log.warning("calendar: couldn't make %s for draft %s", kind, draft_id)
            return
        d = db.get(Draft, draft_id)
        d.video_id = video_id
        if d.status == "approved":
            on_day = d.planned_for if d.planned_for and d.planned_for >= _today() else None
            try:
                schedule_draft_as_post(db, d, on_day=on_day)
                d.status = "scheduled"
            except ContentAIError as exc:
                log.warning("calendar: made media for draft %s but couldn't schedule it: %s", draft_id, exc)
        db.commit()
    except Exception:  # noqa: BLE001 - surface in the log; the page just stops waiting
        db.rollback()
        log.exception("calendar media job crashed for draft %s", draft_id)
    finally:
        db.close()
        with _media_lock:
            _media_running.discard(draft_id)


@router.post("/drafts/{draft_id}/reject")
def reject_draft(draft_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    d = owned(db, Draft, draft_id, ws)
    d.status = "rejected"
    db.commit()
    return {"id": d.id, "status": d.status}
