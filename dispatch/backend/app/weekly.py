"""Weekly AI report + plan — the "one tap on Sunday" habit.

For one brand: how the last 7 days went against the 7 before (from saved
MetricSnapshot readings, same source as app/learning.py — no platform calls,
no AI-invented numbers), what the AI has learned, and a day-by-day set of post
ideas for the coming week written with those learnings. The person trims it
on the Weekly plan page and approves it in one tap:

- every post has a format: "image" (caption + picture), "text" (caption
  only) or "video" (caption + a storyboard, app/story.py);
- an image post's picture is made while the plan is written, so the person
  reviews the real picture (item "video_id" / "media_url"); one that failed,
  or a post switched to image later, gets its picture on approve instead;
- approving an image or text post makes it a Draft on its day (source
  "ai-weekly") and schedules it (content_scheduler's schedule_draft_as_post) —
  at once when it has its picture, else once the picture is made in a
  background thread polled like Auto-generate's runs;
- a video post is approved twice, because video costs the most credit: its
  storyboard first (the clips then render and join by themselves), then the
  finished video, which schedules it.

Plans are written automatically for brands with Autopilot on and a
connected channel (``auto_tick``, called from content_scheduler's minute
loop): on Sunday evening (Phnom Penh) for the week ahead, or — when the
brand's Automation.plan_every is "day" — every evening for tomorrow only.
Or on demand from the page.
"""

from __future__ import annotations

import logging
import threading
import time as time_module  # "time" is datetime.time here
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, date, datetime, time, timedelta

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import billing, goals
from app.content_ai import SELLING_PILLARS, ContentAIError, fact_check, generate_ideas, pick_subjects, selling_days
from app.content_scheduler import (
    NEEDS_MEDIA,
    PHNOM_PENH,
    _MAX_PARALLEL_MEDIA,
    _brand_snapshot,
    _default_time_for,
    _generate_media_for,
    _poster_kit_for,
    _product_snapshot,
    _today,
    last_selling_day,
    schedule_draft_as_post,
)
from app.database import SessionLocal, get_db
from app.learning import _WINDOWS, _engagement, _posts, _window, _wmean, brand_learnings, learned_time
from app.models import (
    Automation,
    Brand,
    Channel,
    Draft,
    Lead,
    MetricSnapshot,
    Platform,
    Post,
    PostTarget,
    Product,
    TeamMember,
    Video,
    VideoStory,
    WeeklyPlan,
)
from app.tenancy import current_workspace_id, get_current_user, owned

log = logging.getLogger("app.weekly")

router = APIRouter(prefix="/weekly", tags=["Weekly plan"])

PLAN_DAYS = 7
MAX_ITEMS = 14
CHUNK_DAYS = 2  # days written per AI call (see build_plan)
# Evening, Phnom Penh: Sunday for a weekly plan (the week starting Monday),
# every day for a daily one (tomorrow).
AUTO_WEEKDAY = 6
AUTO_AT = time(18, 0)


MAX_VIDEOS = 2  # video posts the AI may put in one plan — they cost the most credit
VIDEO_SCENES = [8, 8, 8]  # a plan video: 3 clips of 8 s = 24 s


def item_format(item: dict) -> str:
    """A plan post's format; plans written before formats only had "video"."""
    return item.get("format") or ("video" if item.get("video") else "image")


def _voice_language(brand: Brand) -> str:
    lang = (brand.lang or "").strip()
    return "Khmer" if "khmer" in lang.lower() else lang or "English"


def _storyboard(db: Session, brand: Brand, item: dict, products: list[Product]) -> int | None:
    """Write a plan video's storyboard from its title and caption; its id,
    or None when the AI couldn't (the post then stays a picture). Commits."""
    from app.story import write_story  # local: story pulls in the video worker

    try:
        story = write_story(
            db,
            workspace_id=brand.workspace_id,
            brand=brand,
            user_id=None,
            idea=f"{item['title']}\n\nThe post's caption (the video tells the same thing):\n{item['caption']}",
            lengths=VIDEO_SCENES,
            products=products,
            language=_voice_language(brand),
            auto_join=True,
        )
    except ContentAIError as exc:
        db.rollback()
        log.warning("weekly plan: storyboard for %r failed: %s", item.get("title"), exc)
        return None
    return story.id


def _make_plan_images(
    db: Session, brand: Brand, automation: Automation, items: list[dict], step, should_stop=lambda: False
) -> None:
    """Make the picture for each image post of a plan being written, so the
    person reviews the real image. Fills item["video_id"] / ["media_url"];
    a picture that fails twice is left out — that post gets it on approve.
    On Stop, pictures not started yet are dropped (those already being made
    finish — they're paid for); those posts get theirs on approve."""
    todo = [i for i in items if i["format"] == "image"]
    if not todo:
        return
    products = db.scalars(select(Product).where(Product.brand_id == brand.id)).all()
    brand_args = _brand_snapshot(brand)
    product_args = [_product_snapshot(p) for p in products]
    ideas = [{"title": i["title"], "caption": i["caption"], "meme": i.get("meme"), "pillar": i.get("pillar"), "poster": i.get("poster")} for i in todo]
    # Same brand kit as approve-time images (Automation.poster_kit), gathered
    # here so the image threads don't need the DB.
    kits = [_poster_kit_for(db, automation, brand.id, ideas[n], n, date.fromisoformat(i["day"])) for n, i in enumerate(todo)]
    pool = ThreadPoolExecutor(max_workers=_MAX_PARALLEL_MEDIA, thread_name_prefix="weekly-plan-image")
    try:
        futures = {pool.submit(_media_with_retry, brand_args, ideas[n], product_args, kits[n]): i for n, i in enumerate(todo)}
        done = 0
        stopping = False
        for fut in as_completed(futures):
            item = futures[fut]
            if fut.cancelled():
                item["video_id"] = None
                continue
            try:
                item["video_id"] = fut.result()
            except Exception:  # noqa: BLE001 - one picture mustn't sink the plan
                log.exception("weekly plan: image for %r crashed", item["title"])
                item["video_id"] = None
            done += 1
            step(86 + 4 * done // len(todo), f"Making the pictures ({done} of {len(todo)})…")
            if not stopping and should_stop():
                stopping = True
                for f in futures:
                    f.cancel()  # only those not started yet
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    urls = dict(db.execute(select(Video.id, Video.url).where(Video.id.in_([i["video_id"] for i in todo if i.get("video_id")] or [0]))).all())
    for i in todo:
        if i.get("video_id") in urls:
            i["media_url"] = urls[i["video_id"]]
        else:
            i.pop("video_id", None)


def _drop_storyboards(db: Session, items: list[dict]) -> None:
    """Delete the storyboards of undecided video posts nobody started rendering."""
    ids = [i["story_id"] for i in items if i.get("story_id") and not i.get("state")]
    if ids:
        for story in db.scalars(select(VideoStory).where(VideoStory.id.in_(ids), VideoStory.status == "draft")):
            db.delete(story)


def plan_days(automation: Automation | None) -> int:
    """How many days one plan covers — 7, or 1 for a brand that plans daily."""
    return 1 if automation is not None and automation.plan_every == "day" else PLAN_DAYS


# ── report ────────────────────────────────────────────────────────────────
def _period(db: Session, brand_id: int, since: datetime, until: datetime) -> dict:
    targets = db.scalars(
        select(PostTarget)
        .join(Post, Post.id == PostTarget.post_id)
        .where(
            Post.brand_id == brand_id,
            PostTarget.status == "posted",
            PostTarget.published_at >= since,
            PostTarget.published_at < until,
        )
    ).all()
    latest: dict[int, MetricSnapshot] = {}
    if targets:
        for s in db.scalars(
            select(MetricSnapshot)
            .where(MetricSnapshot.target_id.in_([t.id for t in targets]))
            .order_by(MetricSnapshot.taken_at)
        ):
            latest[s.target_id] = s
    slugs = dict(
        db.execute(
            select(Channel.id, Platform.slug)
            .join(Platform, Platform.id == Channel.platform_id)
            .where(Channel.brand_id == brand_id)
        ).all()
    )
    engagement = 0.0
    views = None
    measured = 0
    top = None
    for t in targets:
        snap = latest.get(t.id)
        eng = _engagement(snap.metrics) if snap else None
        if eng is None:
            continue
        measured += 1
        engagement += eng
        if snap.metrics.get("views") is not None:
            views = (views or 0) + snap.metrics["views"]
        if top is None or eng > top["engagement"]:
            text = t.title or t.caption or ""
            top = {
                "target_id": t.id,
                "title": " ".join(text.split())[:90],
                "platform": slugs.get(t.channel_id, ""),
                "engagement": int(eng),
                "published_at": t.published_at.isoformat() if t.published_at else None,
            }
    return {
        "posts": len(targets),
        "measured": measured,
        "engagement": int(engagement),
        "views": int(views) if views is not None else None,
        "top": top,
    }


def _daily(db: Session, brand_id: int, days: int, now: datetime) -> list[dict]:
    """Posts and engagement per Phnom Penh day for the last ``days`` days
    (oldest first) — the advisor's day-by-day chart."""
    today = now.astimezone(PHNOM_PENH).date()
    out = {today - timedelta(days=n): {"posts": 0, "engagement": 0} for n in range(days)}
    since = datetime.combine(min(out), time(0), PHNOM_PENH)
    targets = db.scalars(
        select(PostTarget)
        .join(Post, Post.id == PostTarget.post_id)
        .where(Post.brand_id == brand_id, PostTarget.status == "posted", PostTarget.published_at >= since)
    ).all()
    latest: dict[int, MetricSnapshot] = {}
    if targets:
        for s in db.scalars(
            select(MetricSnapshot).where(MetricSnapshot.target_id.in_([t.id for t in targets])).order_by(MetricSnapshot.taken_at)
        ):
            latest[s.target_id] = s
    for t in targets:
        day = out.get(t.published_at.astimezone(PHNOM_PENH).date())
        if day is None:
            continue
        day["posts"] += 1
        snap = latest.get(t.id)
        day["engagement"] += int(_engagement(snap.metrics) or 0) if snap else 0
    return [{"date": d.isoformat(), **v} for d, v in sorted(out.items())]


def build_report(db: Session, brand_id: int, learnings: dict | None = None) -> dict:
    now = datetime.now(UTC)
    week = timedelta(days=PLAN_DAYS)
    learnings = learnings if learnings is not None else brand_learnings(db, brand_id)
    return {
        "from": (now - week).astimezone(PHNOM_PENH).date().isoformat(),
        "to": now.astimezone(PHNOM_PENH).date().isoformat(),
        "this_week": _period(db, brand_id, now - week, now),
        "last_week": _period(db, brand_id, now - 2 * week, now - week),
        "daily": _daily(db, brand_id, 2 * PLAN_DAYS, now),
        "rules": learnings.get("rules", []),
        "weak_rules": learnings.get("weak_rules", []),
        "pillar_stats": learnings.get("pillar_stats", {}),
        "learned_from": learnings.get("posts", 0),
    }


# ── the advisor's summary (what worked / improve / audience / next) ───────
ADVISOR_PROMPT = (
    "You are this brand's social media strategist writing the weekly summary a busy "
    "business owner reads in 20 seconds. Use ONLY the DATA given: quote its real "
    "numbers, never invent numbers, trends, competitors or audience traits. Plain, "
    "friendly English, 1-2 short sentences per field. When the data is thin (few "
    "posts, no measured patterns) say so honestly and base the advice on the plan.\n"
    "Fields:\n"
    "- worked: what did best, with its numbers.\n"
    "- improve: what did worst or what's missing, with its numbers, and one concrete fix.\n"
    "- audience: what this audience seems to respond to, judged only from the topic and "
    "format numbers.\n"
    "- recommendation: next week's focus in one sentence, matching the plan given "
    "(e.g. 'Focus on education and questions: 3 tip posts and 2 polls, one promotion').\n"
    "- focus: the 1-2 topic keys the week leans on, from the plan's topics.\n"
    'Respond with ONLY a JSON object: {"worked": "...", "improve": "...", '
    '"audience": "...", "recommendation": "...", "focus": ["..."]}'
)


def advisor_summary(brand: Brand, report: dict, items: list[dict]) -> dict | None:
    """One short AI call turning the measured report + the new plan into the
    Weekly page's advisor text. Best-effort: None if it fails (the page then
    shows the measured rules on their own)."""
    from app.config import get_settings
    from app.content_ai import PILLARS, _chat

    this, last = report.get("this_week", {}), report.get("last_week", {})
    lines = [
        f"Brand: {brand.name}",
        f"Last 7 days: {this.get('posts', 0)} posts, {this.get('engagement', 0)} engagement"
        + (f", {this['views']} views" if this.get("views") is not None else ""),
        f"The 7 days before: {last.get('posts', 0)} posts, {last.get('engagement', 0)} engagement"
        + (f", {last['views']} views" if last.get("views") is not None else ""),
    ]
    if this.get("top"):
        lines.append(f"Best post last week: \"{this['top']['title']}\" on {this['top']['platform']} ({this['top']['engagement']} engagement)")
    lines.append(f"Posts measured over the last 90 days: {report.get('learned_from', 0)}")
    for label, key in (("What worked (measured)", "rules"), ("What lagged (measured)", "weak_rules")):
        rows = report.get(key) or []
        lines.append(f"{label}:" + ("".join(f"\n- {r['text']} ({r['evidence']})" for r in rows) if rows else " none clear yet"))
    stats = report.get("pillar_stats") or {}
    if stats:
        lines.append(
            "Engagement per topic: "
            + "; ".join(f"{s['label']} {s['avg']} per post ({s['posts']} posts)" for s in sorted(stats.values(), key=lambda s: -s["avg"]))
        )
    lines.append(
        "Next week's plan: "
        + "; ".join(
            f"{date.fromisoformat(i['day']).strftime('%a %d %b')} {PILLARS.get(i.get('pillar'), ('?',))[0]} ({i.get('goal') or '-'})"
            for i in items
        )
    )
    try:
        out = _chat(
            [{"role": "system", "content": ADVISOR_PROMPT}, {"role": "user", "content": "\n".join(lines)}],
            get_settings().azure_openai_deployment,
            max_tokens=1500,
        )
    except ContentAIError as exc:
        log.warning("weekly advisor summary failed for brand %s: %s", brand.id, exc)
        return None
    if not isinstance(out, dict):
        return None
    summary = {k: str(out.get(k) or "").strip()[:400] for k in ("worked", "improve", "audience", "recommendation")}
    summary["focus"] = [f for f in (out.get("focus") or []) if f in PILLARS][:2]
    return summary if any(summary[k] for k in ("worked", "improve", "recommendation")) else None


# ── plan ──────────────────────────────────────────────────────────────────
def _free_days(db: Session, brand_id: int, start: date, span: int = PLAN_DAYS) -> list[date]:
    """Days in the plan window (``span`` days from ``start``) an approved plan
    hasn't already filled. A post rejected in Calendar frees its day, so it
    can be planned again."""
    days = [start + timedelta(days=n) for n in range(span)]
    taken = set(
        db.scalars(
            select(Draft.planned_for).where(
                Draft.brand_id == brand_id,
                Draft.source == "ai-weekly",
                Draft.status != "rejected",
                Draft.planned_for >= days[0],
                Draft.planned_for <= days[-1],
            )
        ).all()
    )
    return [d for d in days if d not in taken]


def _plan_slots(db: Session, automation: Automation, learnings: dict):
    """(day → "HH:MM", format → channel names) for a plan's items: one time per post,
    from the main channel (Facebook if connected) — the brand's fixed time,
    else that weekday's learned slot or the platform's best hour, else the
    platform default. Scheduling uses exactly this time on every channel
    (content_scheduler.schedule_draft_as_post, Draft.planned_time)."""
    chans = db.scalars(
        select(Channel).where(Channel.brand_id == automation.brand_id, Channel.status == "live")
    ).all()
    if automation.auto_channel_ids:
        chans = [c for c in chans if c.id in set(automation.auto_channel_ids)]
    slugs = [c.platform.slug for c in chans if c.platform]
    main = "facebook" if "facebook" in slugs else (slugs[0] if slugs else "facebook")
    learned = learnings if automation.learn_from_results else None

    def slot_for(day: date) -> str:
        if automation.post_at:
            return automation.post_at.strftime("%H:%M")
        if learned:
            slot = learned.get("best_slots", {}).get(main, {}).get(str(day.weekday()))
            if slot:
                return f"{slot['hour']:02d}:00"
            t = learned_time(learned, main)
            if t:
                return t.strftime("%H:%M")
        return _default_time_for(main).strftime("%H:%M")

    def names_for(fmt: str) -> list[str]:
        # TikTok takes no picture; Instagram and TikTok take no text-only post.
        skip = NEEDS_MEDIA if fmt == "text" else {"tiktok"} if fmt == "image" else set()
        return sorted({c.platform.name for c in chans if c.platform and c.platform.slug not in skip})

    return slot_for, names_for


LEAD_WINDOW_DAYS = 60
MIN_LEADS_FOR_TIMING = 5  # fewer than this and lead timing is noise — reaction only


def _lead_factor(db: Session, brand_id: int) -> tuple[dict[tuple[int, str], float], int]:
    """How much more often leads arrive in each weekday × window than in the
    average one (last 60 days), smoothed so an empty slot is never 0.
    Empty when there are too few leads to say."""
    since = datetime.now(UTC) - timedelta(days=LEAD_WINDOW_DAYS)
    times = db.scalars(select(Lead.created_at).where(Lead.brand_id == brand_id, Lead.created_at >= since)).all()
    if len(times) < MIN_LEADS_FOR_TIMING:
        return {}, len(times)
    counts: dict[tuple[int, str], int] = {}
    for t in times:
        at = t.astimezone(PHNOM_PENH)
        k = (at.weekday(), _window(at.hour)[0])
        counts[k] = counts.get(k, 0) + 1
    avg = len(times) / (7 * len(_WINDOWS))
    # Square-rooted so a handful of leads nudges the heatmap instead of overriding
    # what months of audience reactions show.
    return {
        (wd, w[0]): ((counts.get((wd, w[0]), 0) + 1) / (avg + 1)) ** 0.5 for wd in range(7) for w in _WINDOWS
    }, len(times)


def best_time(db: Session, brand_id: int) -> dict:
    """Per platform: weekday × time window score (0-100, the best cell = 100) —
    how the audience reacted to posts at that time (the same posts, weights and
    windows learning.py uses) × how often leads arrive then, once there are
    enough leads. The Plan & best time heatmap. Cells with no posts are null."""
    posts = [p for p in _posts(db, brand_id) if p["platform"] and p["published_at"]]
    names = dict(db.execute(select(Platform.slug, Platform.name)).all())
    lead_factor, lead_count = _lead_factor(db, brand_id)
    out = {}
    for slug in sorted({p["platform"] for p in posts}):
        mine = [p for p in posts if p["platform"] == slug]
        prior = _wmean(mine)
        cells: dict[tuple[int, str], list[dict]] = {}
        for p in mine:
            at = p["published_at"].astimezone(PHNOM_PENH)
            cells.setdefault((at.weekday(), _window(at.hour)[0]), []).append(p)
        raw = {k: _wmean(ps, prior) * lead_factor.get(k, 1.0) for k, ps in cells.items()}
        top = max(raw.values(), default=0) or 1
        grid = {
            str(wd): {
                w[0]: {"score": round(100 * raw[(wd, w[0])] / top), "posts": len(cells[(wd, w[0])])}
                if (wd, w[0]) in raw
                else None
                for w in _WINDOWS
            }
            for wd in range(7)
        }
        best = sorted(raw, key=lambda k: -raw[k])[:3]
        out[slug] = {
            "name": names.get(slug, slug.title()),
            "posts": len(mine),
            "grid": grid,
            "top": [[str(wd), w] for wd, w in best],
        }
    return {
        "windows": [{"key": w[0], "label": w[1]} for w in _WINDOWS],
        "platforms": out,
        "with_leads": bool(lead_factor),
        "leads": lead_count,
        "lead_days": LEAD_WINDOW_DAYS,
    }


def build_plan(
    db: Session, brand_id: int, starts_on: date | None = None, step=lambda _p, _s: None, should_stop=lambda: False
) -> WeeklyPlan:
    """Write a fresh plan for the 7 days from ``starts_on`` (default tomorrow)
    — or just that one day for a brand that plans daily — replacing this
    brand's un-approved one. Raises ContentAIError."""
    billing.bind_brand(brand_id)  # often runs in a worker thread: charge the brand's workspace
    brand = db.get(Brand, brand_id)
    automation = db.scalar(select(Automation).where(Automation.brand_id == brand_id))
    if brand is None or automation is None:
        raise ContentAIError("Brand not found.")
    start = starts_on or _today() + timedelta(days=1)
    plan_span = plan_days(automation)  # (not "span": the chunk loop below names its days that)
    days = _free_days(db, brand_id, start, plan_span)
    if not days:
        raise ContentAIError(
            "Tomorrow is already covered by an approved plan." if plan_span == 1 else "The next 7 days are already covered by an approved plan."
        )

    step(10, "Reading last week's results…")
    learnings = brand_learnings(db, brand_id)
    report = build_report(db, brand_id, learnings)
    products = db.scalars(select(Product).where(Product.brand_id == brand_id).order_by(Product.name)).all()
    per_day = max(1, min(automation.videos_per_day, 2))
    count = min(len(days) * per_day, MAX_ITEMS)
    # The brand's content-goal mix → how many posts of each goal this week.
    need = goals.targets(automation.goal_mix, count)

    # Written a couple of days at a time: one call for the whole week squeezes
    # 14 captions into one reply and they come out short (Khmer especially) —
    # a few per call gets each the same room as the daily run's. Each batch
    # hears the pillars already used, so the week still mixes and rotates.
    ideas: list[dict] = []
    last_selling = last_selling_day(db, brand_id, days[0])
    chunks = [days[i : i + CHUNK_DAYS] for i in range(0, len(days), CHUNK_DAYS)]
    stopped = False  # Stop on the page: keep what's written, skip the rest
    for c, chunk in enumerate(chunks):
        if should_stop():
            if not ideas:
                raise ContentAIError("Stopped before any post was written.")
            stopped = True
            break
        span = f"{chunk[0]:%a}" if len(chunk) == 1 else f"{chunk[0]:%a} – {chunk[-1]:%a}"
        step(20 + 60 * c // len(chunks), f"Writing ideas for {span} ({len(ideas)} of {count} done)…")
        n_batch = min(len(chunk) * per_day, count - len(ideas))
        # The awareness → product rhythm carries on across batches.
        planned = [date.fromisoformat(i["day"]) for i in ideas if i.get("pillar") in SELLING_PILLARS]
        allowed = selling_days(chunk, max([d for d in (last_selling, *planned) if d], default=None))
        mix_line, _ = goals.batch_brief(need, n_batch, len(allowed))
        try:
            batch = generate_ideas(
                brand.name,
                brand.lang,
                list(products),
                automation.topic_source,
                n_batch,
                brand.voice_examples or "",
                learnings["prompt"] if automation.learn_from_results else "",
                week=True,
                days=chunk,
                recent_pillars=[i["pillar"] for i in reversed(ideas) if i.get("pillar")][:8],
                # Same date rotation as the daily run, so the list comes round in turn.
                subjects=pick_subjects(
                    automation.subjects,
                    n_batch,
                    chunk[0].toordinal() * per_day,
                    selling_slots=len(allowed),
                    product_names=[p.name for p in products],
                    scores=learnings.get("subject_scores") if automation.learn_from_results else None,
                ),
                selling_days=allowed,
                goal_mix=mix_line,
            )
        except ContentAIError:
            if not ideas:
                raise  # nothing written at all — report the failure
            log.warning("weekly plan for brand %s: a batch failed, keeping %s ideas", brand_id, len(ideas))
            continue
        for k, idea in enumerate(batch):
            # The day the AI planned it for (so a holiday post lands on the
            # holiday), else spread evenly over this batch's days.
            idea["day"] = idea.get("day") or chunk[k * len(chunk) // len(batch)].isoformat()
        for idea in batch:
            g = goals.goal_of(idea.get("pillar") or "")
            if g:
                need[g] = need.get(g, 0) - 1
        ideas += batch
        if len(ideas) >= count:
            break
    videos = 0
    for idea in ideas:
        if idea.get("format") == "video":
            videos += 1
            if videos > MAX_VIDEOS:
                idea["format"] = "image"
    step(80, "Fact-checking against your products…")
    checks = fact_check([i["caption"] for i in ideas], list(products))
    slot_for, names_for = _plan_slots(db, automation, learnings)

    items = [
        {
            "key": uuid.uuid4().hex[:10],
            "day": idea["day"],
            "title": idea["title"],
            "caption": idea["caption"],
            "insight": idea["insight"],
            "fit_score": idea.get("fit_score"),
            "pillar": idea.get("pillar") or "",
            "subject": idea.get("subject") or "",
            "angle": idea.get("angle") or "",
            "goal": idea.get("goal") or "",
            "meme": idea.get("meme"),
            "poster": idea.get("poster"),
            "format": idea.get("format") or "image",
            "video": idea.get("format") == "video",
            "fact_issues": checks[n] if checks is not None else None,
            "content_goal": goals.goal_of(idea.get("pillar") or ""),
            "time": slot_for(date.fromisoformat(idea["day"])),
            "channels": names_for(idea.get("format") or "image"),
        }
        for n, idea in enumerate(ideas)
    ]
    items.sort(key=lambda i: i["day"])
    stopped = stopped or should_stop()
    # stopped: no storyboard is written — the card offers "Write the storyboard"
    to_film = [] if stopped else [i for i in items if i["format"] == "video"]
    for n, item in enumerate(to_film):
        step(85, f"Writing the video storyboard{'s' if len(to_film) > 1 else ''} ({n + 1} of {len(to_film)})…")
        item["story_id"] = _storyboard(db, brand, item, list(products))
        if item["story_id"] is None:
            item.update(format="image", video=False, channels=names_for("image"))
    if not (stopped or should_stop()):
        step(86, "Making the pictures…")
        _make_plan_images(db, db.get(Brand, brand_id), automation, items, step, should_stop)
    stopped = stopped or should_stop()
    if stopped:
        report["stopped"] = True  # the page says so; no summary is written
    else:
        step(90, "Writing your weekly summary…")
        report["advisor"] = advisor_summary(brand, report, items)
    for old in db.scalars(
        select(WeeklyPlan).where(WeeklyPlan.brand_id == brand_id, WeeklyPlan.status == "ready")
    ):
        if any(i.get("state") == "approved" for i in old.items or []):
            old.status = "approved"  # its approved posts stay on the calendar
        else:
            db.delete(old)
        _drop_storyboards(db, old.items or [])
    plan = WeeklyPlan(
        brand_id=brand_id,
        starts_on=days[0],
        ends_on=start + timedelta(days=plan_span - 1),
        status="ready",
        report=report,
        items=items,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _notify_ready(brand: Brand, plan: WeeklyPlan) -> None:
    from app.push import notify_workspace

    this = plan.report.get("this_week", {})
    notify_workspace(
        brand.workspace_id,
        "review",
        f"{'Tomorrow' if plan.starts_on == plan.ends_on else 'Next week'}'s plan is ready — {brand.name}",
        f"{len(plan.items)} posts planned. Last 7 days: {this.get('posts', 0)} posts, "
        f"{this.get('engagement', 0)} engagement. Review and approve in one tap.",
        "/weekly",
        f"weekly-{brand.id}",
    )


# ── background jobs (write a plan / make images on approve) ───────────────
# Keyed by brand id; process memory like content_scheduler's runs. A finished
# job is remembered briefly so the page can still show how it ended.
_JOB_MEMORY = timedelta(minutes=15)
_jobs: dict[int, dict] = {}
_jobs_lock = threading.Lock()


def job_status(brand_id: int) -> dict | None:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j is None:
            return None
        if j["status"] != "running" and datetime.now(UTC) - j["_finished"] > _JOB_MEMORY:
            _jobs.pop(brand_id, None)
            return None
        return {k: v for k, v in j.items() if not k.startswith("_")}


def _set_job(brand_id: int, **fields) -> None:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j is None:
            return
        j.update(fields)
        if fields.get("status") in ("done", "failed"):
            j["_finished"] = datetime.now(UTC)


def _start_job(brand_id: int, kind: str, target, *args) -> dict:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j is not None and j["status"] == "running":
            raise HTTPException(409, "Already working on this brand's plan — give it a moment.")
        _jobs[brand_id] = {
            "brand_id": brand_id,
            "kind": kind,
            "status": "running",
            "progress": 2,
            "step": "Starting…",
            "error": "",
        }
    threading.Thread(target=target, args=(brand_id, *args), daemon=True, name=f"weekly-{kind}-{brand_id}").start()
    return job_status(brand_id)


def _stop_requested(brand_id: int) -> bool:
    with _jobs_lock:
        j = _jobs.get(brand_id)
        return bool(j and j.get("stop"))


def _build_job(brand_id: int, starts_on: date | None = None) -> None:
    db = SessionLocal()
    stop = lambda: _stop_requested(brand_id)  # noqa: E731
    try:
        plan = build_plan(
            db,
            brand_id,
            starts_on,
            step=lambda p, s: _set_job(brand_id, progress=p, **({} if stop() else {"step": s})),
            should_stop=stop,
        )
        if (plan.report or {}).get("stopped"):
            n = len(plan.items or [])
            _set_job(brand_id, status="done", progress=100, step=f"Stopped — kept the {n} post{'s' if n != 1 else ''} written so far")
        else:
            _set_job(brand_id, status="done", progress=100, step="Done")
            _notify_ready(db.get(Brand, brand_id), plan)
    except ContentAIError as exc:
        db.rollback()
        _set_job(brand_id, status="failed", step="Failed", error=str(exc))
    except Exception:  # noqa: BLE001 - surface any crash to the page, not just the log
        db.rollback()
        log.exception("weekly plan crashed for brand %s", brand_id)
        _set_job(brand_id, status="failed", step="Failed", error="Unexpected error — check the server log.")
    finally:
        db.close()


# Waits before each retry: most failures are the image service's per-minute
# limit (HTTP 429, "retry after 9 seconds") — trying again at once just fails again.
_IMAGE_RETRY_WAITS = (10, 25)


def _media_with_retry(*args):
    """_generate_media_for, tried again after a pause if it fails — most
    failures are a busy or rate-limited image service, and a miss would leave
    that day with no picture."""
    video_id = _generate_media_for(*args)
    for wait in _IMAGE_RETRY_WAITS:
        if video_id is not None:
            break
        log.info("weekly plan: image failed for %r — trying again in %ss", args[1].get("title"), wait)
        time_module.sleep(wait)
        video_id = _generate_media_for(*args)
    return video_id


# Drafts approved while a media job is already running for the brand — the
# job picks them up before it finishes (posts approved one at a time).
_media_queue: dict[int, list[int]] = {}


def _queue_media(brand_id: int, draft_ids: list[int]) -> None:
    """Make media for these approved drafts: in the running media job if
    there is one, else in a new one."""
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j is not None and j["status"] == "running":
            if j["kind"] != "media":
                raise HTTPException(409, "Still writing a plan for this brand — try again in a moment.")
            _media_queue.setdefault(brand_id, []).extend(draft_ids)
            j["total"] = j.get("total", 0) + len(draft_ids)
            return
    _start_job(brand_id, "media", _media_job, draft_ids)


def _media_job(brand_id: int, draft_ids: list[int]) -> None:
    """Make an image for each approved plan draft, then schedule it on its
    day — and any drafts approved meanwhile (_media_queue)."""
    _set_job(brand_id, total=len(draft_ids))
    done = scheduled = 0
    while draft_ids:
        d, s, ok = _media_batch(brand_id, draft_ids, done)
        done += d
        scheduled += s
        if not ok:
            return
        with _jobs_lock:
            draft_ids = _media_queue.pop(brand_id, [])
            j = _jobs.get(brand_id)
            if not draft_ids and j is not None and j["status"] == "running":
                j.update(status="done", progress=100, step=f"{scheduled} of {done} posts scheduled", scheduled=scheduled)
                j["_finished"] = datetime.now(UTC)


def _media_batch(brand_id: int, draft_ids: list[int], done_before: int) -> tuple[int, int, bool]:
    """One round of _media_job: (made, scheduled, finished without a crash)."""
    billing.bind_brand(brand_id)
    db = SessionLocal()
    pool = ThreadPoolExecutor(max_workers=_MAX_PARALLEL_MEDIA, thread_name_prefix="weekly-media")
    done = scheduled = 0
    try:
        brand = db.get(Brand, brand_id)
        products = db.scalars(select(Product).where(Product.brand_id == brand_id)).all()
        drafts = db.scalars(select(Draft).where(Draft.id.in_(draft_ids)).order_by(Draft.planned_for)).all()
        brand_args = _brand_snapshot(brand)
        product_args = [_product_snapshot(p) for p in products]
        # Same brand kit as the daily run (Automation.poster_kit): template,
        # product photo and logo — gathered here so the image threads don't
        # need the DB.
        automation = db.scalar(select(Automation).where(Automation.brand_id == brand_id))
        ideas = [{"title": d.title, "caption": d.body, "meme": d.meme, "pillar": d.pillar, "poster": d.poster} for d in drafts]
        kits = [
            _poster_kit_for(db, automation, brand_id, idea, n, d.planned_for or _today()) if automation else ([], "")
            for n, (idea, d) in enumerate(zip(ideas, drafts))
        ]
        futures = {
            pool.submit(_media_with_retry, brand_args, ideas[n], product_args, kits[n]): d
            for n, d in enumerate(drafts)
        }
        for fut in as_completed(futures):
            d = futures[fut]
            d.video_id = fut.result()
            if d.video_id is not None:
                try:
                    schedule_draft_as_post(db, d, on_day=d.planned_for)
                    d.status = "scheduled"
                    scheduled += 1
                except ContentAIError as exc:
                    log.warning("weekly plan: could not schedule %r: %s", d.title, exc)
            db.commit()
            done += 1
            total = (job_status(brand_id) or {}).get("total") or len(drafts)
            _set_job(
                brand_id,
                progress=min(95, 5 + 90 * (done_before + done) // max(total, 1)),
                step=f"Making image {done_before + done} of {total}…",
            )
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("weekly plan media crashed for brand %s", brand_id)
        with _jobs_lock:
            _media_queue.pop(brand_id, None)
        _set_job(brand_id, status="failed", step="Failed", error="Some images failed — check the Calendar.")
        return done, scheduled, False
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        db.close()
    return done, scheduled, True


# ── automatic plans (Sunday for weekly brands, every evening for daily) ───
_auto_tried: set[tuple[int, date]] = set()  # one attempt per brand per plan start


def auto_tick(db: Session, now: datetime) -> int:
    """Called every minute by app/content_scheduler.py. Starts each due plan
    as a background job (pictures take minutes — the minute loop mustn't wait)
    and returns how many it started; the job notifies when its plan is ready."""
    if now.time() < AUTO_AT:
        return 0
    start = now.date() + timedelta(days=1)
    written = 0
    for a in db.scalars(select(Automation).where(Automation.enabled.is_(True))).all():
        if a.plan_every != "day" and now.weekday() != AUTO_WEEKDAY:
            continue
        key = (a.brand_id, start)
        if key in _auto_tried:
            continue
        _auto_tried.add(key)
        has_channel = db.scalar(
            select(Channel.id).where(Channel.brand_id == a.brand_id, Channel.status == "live").limit(1)
        )
        exists = db.scalar(
            select(WeeklyPlan.id).where(WeeklyPlan.brand_id == a.brand_id, WeeklyPlan.starts_on >= start).limit(1)
        )
        if not has_channel or exists or not _free_days(db, a.brand_id, start, plan_days(a)):
            continue
        try:
            _start_job(a.brand_id, "plan", _build_job, start)
            written += 1
        except HTTPException:
            log.info("plan for brand %s: a job is already running — skipped", a.brand_id)
    return written


# ── API ───────────────────────────────────────────────────────────────────
def _plan_out(db: Session, plan: WeeklyPlan | None) -> dict | None:
    from app.views import _media_running  # drafts given media from Calendar / this page

    if plan is None:
        return None
    drafts = []
    if plan.status == "approved":
        drafts = db.scalars(
            select(Draft)
            .where(
                Draft.brand_id == plan.brand_id,
                Draft.source == "ai-weekly",
                Draft.planned_for >= plan.starts_on,
                Draft.planned_for <= plan.ends_on,
            )
            .order_by(Draft.planned_for)
        ).all()
    item_drafts = {
        d.id: d
        for d in db.scalars(
            select(Draft).where(Draft.id.in_([i["draft_id"] for i in plan.items or [] if i.get("draft_id")] or [0]))
        )
    }
    item_by_draft = {i["draft_id"]: i for i in plan.items or [] if i.get("draft_id")}
    media = {
        v.id: v
        for v in db.scalars(select(Video).where(Video.id.in_([d.video_id for d in drafts if d.video_id] or [0])))
    }
    items = []
    for i in plan.items or []:
        d = item_drafts.get(i.get("draft_id"))
        items.append(
            {
                **i,
                "draft": {
                    "id": d.id,
                    "status": d.status,
                    "has_media": d.video_id is not None,
                    "media_pending": d.id in _media_running,
                }
                if d
                else None,
            }
        )
    return {
        "id": plan.id,
        "brand_id": plan.brand_id,
        "starts_on": plan.starts_on,
        "ends_on": plan.ends_on,
        "status": plan.status,
        "report": plan.report,
        "items": items,
        "created_at": plan.created_at,
        "approved_at": plan.approved_at,
        "drafts": [{**_draft_out(d, _media_running), **_going_out(db, d, item_by_draft.get(d.id), media)} for d in drafts],
    }


def _draft_out(d: Draft, media_running) -> dict:
    return {
        "id": d.id,
        "day": d.planned_for,
        "title": d.title,
        "caption": d.body,
        "status": d.status,
        "has_media": d.video_id is not None,
        "media_pending": d.id in media_running,
    }


def _going_out(db: Session, d: Draft, item: dict | None, media: dict[int, Video]) -> dict:
    """What an approved plan post looks like now: its picture / video, the
    format and goal it was planned with, and — once scheduled — where and when
    it really goes out (its post's targets; the plan's time and channels until
    then). schedule_draft_as_post doesn't link the post back to the draft: it's
    the brand's post with this draft's media and title."""
    from app.media import kind_for

    v = media.get(d.video_id) if d.video_id else None
    out = {
        "media": {"url": v.url, "kind": kind_for(v.url or "", None)} if v and v.url else None,
        "format": item_format(item) if item else ("image" if d.video_id else "text"),
        "goal": (item or {}).get("content_goal") or "",
        "time": (item or {}).get("time") or d.planned_time,
        "channels": (item or {}).get("channels") or [],
        "posted": False,
    }
    if d.status not in ("scheduled", "posted"):
        return out
    post_id = db.scalar(
        select(Post.id)
        .where(Post.brand_id == d.brand_id, Post.video_id == d.video_id, Post.title == d.title)
        .order_by(Post.id.desc())
        .limit(1)
    )
    if post_id is None:
        return out
    rows = db.execute(
        select(PostTarget.scheduled_for, PostTarget.published_at, PostTarget.status, Platform.name)
        .join(Channel, Channel.id == PostTarget.channel_id)
        .join(Platform, Platform.id == Channel.platform_id)
        .where(PostTarget.post_id == post_id)
    ).all()
    if rows:
        first = min((r.published_at or r.scheduled_for for r in rows if r.published_at or r.scheduled_for), default=None)
        out.update(
            channels=sorted({r.name for r in rows}),
            at=first,  # exact moment (UTC) — the page shows it on the Phnom Penh clock
            posted=all(r.status == "posted" for r in rows),
            failed=any(r.status == "failed" for r in rows),
        )
    return out


@router.get("")
def weekly_view(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The brand's current plan (waiting for approval, else the latest
    approved one), a live report, and any job in progress."""
    owned(db, Brand, brand_id, ws)
    plan = db.scalar(
        select(WeeklyPlan)
        .where(WeeklyPlan.brand_id == brand_id, WeeklyPlan.status.in_(("ready", "approved")))
        .order_by(WeeklyPlan.status.desc(), WeeklyPlan.created_at.desc())  # "ready" first
        .limit(1)
    )
    automation = db.scalar(select(Automation).where(Automation.brand_id == brand_id))
    return {
        "plan": _plan_out(db, plan),
        "report": build_report(db, brand_id) if plan is None or plan.status != "ready" else None,
        "job": job_status(brand_id),
        "auto_media": bool(automation and automation.auto_media),
        "auto_enabled": bool(automation and automation.enabled),
        "free_days": len(_free_days(db, brand_id, _today() + timedelta(days=1), plan_days(automation))),
        "plan_every": automation.plan_every if automation else "week",
        "automation_id": automation.id if automation else None,
        "mix": (automation.goal_mix if automation else None) or goals.DEFAULT_MIX,
        "mix_custom": bool(automation and automation.goal_mix),
        "per_month": (max(1, min(automation.videos_per_day, 2)) if automation else 1) * 30,
        "best_time": best_time(db, brand_id),
    }


class MixIn(BaseModel):
    mix: dict[str, int] | None = None  # None = back to the AI's default


@router.put("/mix")
def weekly_mix(brand_id: int, payload: MixIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Save the brand's content-goal mix (percent per goal) — the next plan
    is written to match it."""
    owned(db, Brand, brand_id, ws)
    automation = db.scalar(select(Automation).where(Automation.brand_id == brand_id))
    if automation is None:
        raise HTTPException(404, "Turn this brand on in Auto-generate first.")
    automation.goal_mix = goals.clean_mix(payload.mix)
    db.commit()
    return {"mix": automation.goal_mix or goals.DEFAULT_MIX, "mix_custom": bool(automation.goal_mix)}


@router.post("/plan", status_code=202)
def weekly_plan_now(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Write (or rewrite) the plan for the next 7 days (or tomorrow, for a
    brand that plans daily), in the background."""
    owned(db, Brand, brand_id, ws)
    return _start_job(brand_id, "plan", _build_job)


@router.post("/job/stop")
def weekly_job_stop(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Stop writing the plan: it ends at the next step and keeps the posts
    written so far (pictures already being made finish; the rest are made on
    approve). Nothing more is spent on this plan."""
    owned(db, Brand, brand_id, ws)
    with _jobs_lock:
        j = _jobs.get(brand_id)
        if j is None or j["status"] != "running" or j["kind"] != "plan":
            raise HTTPException(409, "No plan is being written right now.")
        j["stop"] = True
        j["step"] = "Stopping — keeping what’s written so far…"
    return job_status(brand_id)


@router.get("/job")
def weekly_job(brand_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    owned(db, Brand, brand_id, ws)
    return job_status(brand_id) or {"brand_id": brand_id, "status": "idle"}


def _ready_plan(db: Session, plan_id: int, ws: int, lock: bool = False) -> WeeklyPlan:
    owned(db, WeeklyPlan, plan_id, ws, "Plan")
    q = select(WeeklyPlan).where(WeeklyPlan.id == plan_id)
    plan = db.scalar(q.with_for_update() if lock else q)
    if plan.status != "ready":
        raise HTTPException(409, "This plan was already approved or dismissed.")
    return plan


class ItemEdit(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    caption: str | None = Field(default=None, max_length=5000)


@router.patch("/{plan_id}/items/{key}")
def weekly_edit_item(
    plan_id: int, key: str, payload: ItemEdit, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    plan = _ready_plan(db, plan_id, ws, lock=True)
    items = [dict(i) for i in plan.items]
    item = next((i for i in items if i["key"] == key), None)
    if item is None:
        raise HTTPException(404, "Idea not found.")
    if item.get("state") == "approved":
        raise HTTPException(409, "This post is already approved — edit it in Calendar.")
    for field in ("title", "caption"):
        value = getattr(payload, field)
        if value is not None and value.strip():
            item[field] = value.strip()
            item["edited"] = True  # the page asks before a Rewrite throws this away
    plan.items = items
    db.commit()
    return item


@router.delete("/{plan_id}/items/{key}", status_code=204)
def weekly_remove_item(plan_id: int, key: str, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    plan = _ready_plan(db, plan_id, ws, lock=True)
    kept = [i for i in plan.items if i["key"] != key]
    if len(kept) < len(plan.items):
        # counted so the page can warn before a Rewrite brings them back
        report = dict(plan.report or {})
        report["removed"] = report.get("removed", 0) + 1
        plan.report = report
    plan.items = kept
    db.commit()


@router.post("/{plan_id}/dismiss")
def weekly_dismiss(plan_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    plan = _ready_plan(db, plan_id, ws, lock=True)
    # Posts already approved stay on the calendar — keep showing them.
    plan.status = "approved" if any(i.get("state") == "approved" for i in plan.items) else "dismissed"
    db.commit()
    return {"id": plan.id, "status": plan.status}


@router.post("/{plan_id}/regenerate")
def weekly_regenerate(plan_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Throw away an approved plan's posts from tomorrow on — their queued
    posts are cancelled and the drafts rejected, which frees those days — then
    write a fresh plan for them (a new "ready" plan to review and approve).
    Anything already out, or going out within the edit lock, is kept."""
    from app.views import _editable

    owned(db, WeeklyPlan, plan_id, ws, "Plan")
    plan = db.get(WeeklyPlan, plan_id)
    if plan.status != "approved":
        raise HTTPException(409, "Only an approved plan can be regenerated — use Rewrite on a waiting one.")
    running = job_status(plan.brand_id)
    if running and running["status"] == "running":
        raise HTTPException(409, "Still working on this brand — try again in a moment.")

    now = datetime.now(UTC)
    first = max(plan.starts_on, _today() + timedelta(days=1))
    drafts = db.scalars(
        select(Draft)
        .where(
            Draft.brand_id == plan.brand_id,
            Draft.source == "ai-weekly",
            Draft.status != "rejected",
            Draft.planned_for >= first,
            Draft.planned_for <= plan.ends_on,
        )
        .with_for_update()
    ).all()
    freed = kept = 0
    for d in drafts:
        # schedule_draft_as_post doesn't link back to the draft: its post is
        # the brand's scheduled one with this draft's media (none for a text
        # post — IS NULL) and title.
        posts = (
            db.scalars(
                select(Post).where(
                    Post.brand_id == d.brand_id,
                    Post.video_id == d.video_id,
                    Post.title == d.title,
                    Post.status == "scheduled",
                )
            ).all()
            if d.status == "scheduled"
            else []
        )
        targets = [t for p in posts for t in db.scalars(select(PostTarget).where(PostTarget.post_id == p.id).with_for_update())]
        if any(not _editable(t, now) for t in targets):
            kept += 1  # already out (or about to go) on some channel — leave it
            continue
        for t in targets:
            db.delete(t)
        db.flush()
        for p in posts:
            db.delete(p)
        d.status = "rejected"
        freed += 1
    db.commit()
    if not freed:
        raise HTTPException(409, "Nothing left to regenerate — these posts have already gone out.")
    job = _start_job(plan.brand_id, "plan", _build_job)
    return {"freed": freed, "kept": kept, "job": job}


class ApproveIn(BaseModel):
    keys: list[str] | None = None  # None = every post still waiting
    unflagged_only: bool = False  # leave posts with a fact-check flag for a person


def _set_item(plan: WeeklyPlan, key: str, **fields) -> dict:
    items = [dict(i) for i in plan.items]
    item = next((i for i in items if i["key"] == key), None)
    if item is None:
        raise HTTPException(404, "Idea not found.")
    item.update(fields)
    for k in [k for k, v in fields.items() if v is None]:
        item.pop(k, None)
    plan.items = items
    return item


def _close_if_done(plan: WeeklyPlan, user: TeamMember) -> None:
    """Every post decided (approved or skipped) → the plan is approved."""
    if all(i.get("state") for i in plan.items) and any(i.get("state") == "approved" for i in plan.items):
        plan.status = "approved"
        plan.approved_at = datetime.now(UTC)
        plan.approved_by = user.id


@router.post("/{plan_id}/approve")
def weekly_approve(
    plan_id: int,
    payload: ApproveIn | None = None,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Approve & schedule the plan's waiting posts — all of them, only the
    unflagged ones, or the ``keys`` given (one post's button). Each becomes a
    Draft on its day at its time and is scheduled: a text post, or an image
    post with the picture made with the plan, right away; an image post
    without one once its picture is made in the background (poll ``GET
    /weekly/job``); a video post with its finished video. Approving many at
    once leaves video posts — each is approved on its own, once its video is
    done."""
    payload = payload or ApproveIn()
    plan = _ready_plan(db, plan_id, ws, lock=True)
    today = _today()
    waiting = [i for i in plan.items if not i.get("state")]
    chosen = [
        i
        for i in waiting
        if (payload.keys is None or i["key"] in payload.keys)
        and not (payload.unflagged_only and i.get("fact_issues"))
        and not (payload.keys is None and item_format(i) == "video")
        and date.fromisoformat(i["day"]) >= today
    ]
    if not chosen:
        raise HTTPException(
            422,
            "Nothing to approve — every post here is flagged, decided, a video still to finish or for a day that has passed."
            if waiting
            else "Every post in this plan is already decided.",
        )
    busy = [i for i in chosen if _picture_busy(i)]
    if busy and payload.keys is not None:
        raise HTTPException(409, "A new picture is still being made for this post — approve it once it’s there.")
    chosen = [i for i in chosen if not _picture_busy(i)]  # approving many: leave those for later
    films: dict[str, int] = {}  # video post → its finished video
    for i in chosen:
        if item_format(i) == "video":
            story = db.get(VideoStory, i["story_id"]) if i.get("story_id") else None
            if story is None or story.status != "done" or not story.final_video_id:
                raise HTTPException(409, "Approve the storyboard and wait for the video to finish first.")
            films[i["key"]] = story.final_video_id

    drafts = {}
    for i in chosen:
        d = Draft(
            brand_id=plan.brand_id,
            # the finished video, or the picture made with the plan
            video_id=films.get(i["key"]) or (i.get("video_id") if item_format(i) == "image" else None),
            title=i["title"][:200],
            body=i["caption"],
            insight=i.get("insight") or "",
            planned_for=date.fromisoformat(i["day"]),
            planned_time=i.get("time"),
            source="ai-weekly",
            status="approved",
            fit_score=i.get("fit_score"),
            pillar=i.get("pillar") or "",
            subject=i.get("subject") or "",
            meme=i.get("meme"),
            poster=i.get("poster"),
            angle=i.get("angle") or "",
            goal=i.get("goal") or "",
            fact_issues=i.get("fact_issues"),
        )
        db.add(d)
        drafts[i["key"]] = d
    db.flush()
    formats = {i["key"]: item_format(i) for i in chosen}
    images, scheduled, problems = [], 0, []
    for key, d in drafts.items():
        _set_item(plan, key, state="approved", draft_id=d.id)
        if formats[key] == "image" and d.video_id is None:
            images.append(d.id)  # no picture yet: scheduled once it's made
            continue
        try:
            schedule_draft_as_post(db, d, on_day=d.planned_for)
            d.status = "scheduled"
            scheduled += 1
        except ContentAIError as exc:
            problems.append(str(exc))  # stays approved, on the Calendar
    _close_if_done(plan, user)
    db.commit()

    if images:
        _queue_media(plan.brand_id, images)
    return {
        "id": plan.id,
        "status": plan.status,
        "drafts": len(drafts),
        "left": sum(1 for i in plan.items if not i.get("state")),
        "making_media": bool(images),
        "scheduled": scheduled,
        "not_scheduled": problems[:1],
    }


# ── "New picture": remake one image post's picture, in the background ─────
PICTURE_STALE = timedelta(minutes=5)  # a remake older than this was lost (restart) — allow another


def _picture_busy(item: dict) -> bool:
    started = item.get("picture_started")
    return bool(started) and datetime.now(UTC) - datetime.fromisoformat(started) < PICTURE_STALE


@router.post("/{plan_id}/items/{key}/picture", status_code=202)
def weekly_item_picture(plan_id: int, key: str, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """Make a new picture for a waiting image post (same brand kit and
    poster style). Takes 30-90 s, so it runs in the background — the item
    says picture_started until it's done; poll ``GET /weekly``. The old
    picture stays in the Library."""
    plan = _ready_plan(db, plan_id, ws, lock=True)
    item = next((i for i in plan.items if i["key"] == key), None)
    if item is None:
        raise HTTPException(404, "Idea not found.")
    if item.get("state"):
        raise HTTPException(409, "This post is already decided.")
    if item_format(item) != "image":
        raise HTTPException(409, "Only image posts have a picture.")
    if _picture_busy(item):
        raise HTTPException(409, "A new picture is already being made for this post.")
    item = _set_item(plan, key, picture_started=datetime.now(UTC).isoformat(), picture_error=None)
    db.commit()
    threading.Thread(target=_new_picture, args=(plan.id, key, plan.brand_id), daemon=True, name=f"plan-picture-{plan.id}").start()
    return item


def _new_picture(plan_id: int, key: str, brand_id: int) -> None:
    db = SessionLocal()
    fields: dict = {"picture_started": None}
    try:
        billing.bind_brand(brand_id)
        brand = db.get(Brand, brand_id)
        automation = db.scalar(select(Automation).where(Automation.brand_id == brand_id))
        item = next(i for i in db.get(WeeklyPlan, plan_id).items if i["key"] == key)
        products = db.scalars(select(Product).where(Product.brand_id == brand_id)).all()
        idea = {"title": item["title"], "caption": item["caption"], "meme": item.get("meme"), "pillar": item.get("pillar"), "poster": item.get("poster")}
        tries = item.get("picture_tries", 0) + 1
        # n = tries: brand-kit templates take turns, so a retry can look different too
        kit = _poster_kit_for(db, automation, brand_id, idea, tries, date.fromisoformat(item["day"])) if automation else ([], "")
        db.rollback()  # no transaction held open while the picture is made
        video_id = _media_with_retry(_brand_snapshot(brand), idea, [_product_snapshot(p) for p in products], kit)
        if video_id:
            fields.update(video_id=video_id, media_url=db.scalar(select(Video.url).where(Video.id == video_id)), picture_tries=tries)
        else:
            fields["picture_error"] = "Couldn’t make a new picture (the image service may be busy, or AI credit ran out) — try again."
    except Exception:  # noqa: BLE001 - the card must stop waiting either way
        db.rollback()
        log.exception("new picture for plan %s item %s crashed", plan_id, key)
        fields["picture_error"] = "Couldn’t make a new picture — try again."
    try:
        plan = db.scalar(select(WeeklyPlan).where(WeeklyPlan.id == plan_id).with_for_update())
        if plan is not None and any(i["key"] == key for i in plan.items or []):
            _set_item(plan, key, **fields)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("saving the new picture for plan %s item %s failed", plan_id, key)
    finally:
        db.close()


class FormatIn(BaseModel):
    format: Literal["image", "text", "video"]


@router.post("/{plan_id}/items/{key}/format")
def weekly_item_format(
    plan_id: int, key: str, payload: FormatIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Change a waiting post's format. Switching to video writes its
    storyboard (one AI call); switching away drops a storyboard nobody
    started rendering."""
    plan = _ready_plan(db, plan_id, ws)
    item = next((i for i in plan.items if i["key"] == key), None)
    if item is None:
        raise HTTPException(404, "Idea not found.")
    if item.get("state"):
        raise HTTPException(409, "This post is already decided.")
    fmt = payload.format
    if fmt == item_format(item) and (fmt != "video" or item.get("story_id")):
        return item  # (a video from an older plan may still need its storyboard)
    story_id = item.get("story_id") if fmt == "video" else None
    if fmt == "video" and not story_id:
        brand = db.get(Brand, plan.brand_id)
        products = db.scalars(select(Product).where(Product.brand_id == plan.brand_id).order_by(Product.name)).all()
        story_id = _storyboard(db, brand, item, list(products))  # commits
        if story_id is None:
            raise HTTPException(503, "Couldn’t write the storyboard — try again.")
    elif fmt != "video":
        _drop_storyboards(db, [item])

    plan = _ready_plan(db, plan_id, ws, lock=True)
    automation = db.scalar(select(Automation).where(Automation.brand_id == plan.brand_id))
    _, names_for = _plan_slots(db, automation, {})
    picture = {} if fmt == "image" else {"video_id": None, "media_url": None}  # stays in the Library
    item = _set_item(plan, key, format=fmt, video=fmt == "video", story_id=story_id, channels=names_for(fmt), **picture)
    db.commit()
    return item


@router.post("/{plan_id}/items/{key}/skip")
def weekly_skip_item(
    plan_id: int,
    key: str,
    db: Session = Depends(get_db),
    ws: int = Depends(current_workspace_id),
    user: TeamMember = Depends(get_current_user),
):
    """Leave one post out of the plan (it can be brought back until the plan closes)."""
    plan = _ready_plan(db, plan_id, ws, lock=True)
    item = next((i for i in plan.items if i["key"] == key), None)
    if item is not None and item.get("state") == "approved":
        raise HTTPException(409, "This post is already approved — remove it in Calendar.")
    _set_item(plan, key, state="skipped")
    _close_if_done(plan, user)
    db.commit()
    return {"key": key, "state": "skipped", "plan_status": plan.status}


@router.post("/{plan_id}/items/{key}/unskip")
def weekly_unskip_item(plan_id: int, key: str, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    plan = _ready_plan(db, plan_id, ws, lock=True)
    item = next((i for i in plan.items if i["key"] == key), None)
    if item is None or item.get("state") != "skipped":
        raise HTTPException(409, "This post isn't skipped.")
    _set_item(plan, key, state=None)
    db.commit()
    return {"key": key, "state": None}
