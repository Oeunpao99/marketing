"""Command center — the home screen's one read: what the AI is doing and the
few things that need a person (src/pages/CommandPage.jsx).

Everything here is read from data other features already keep — the weekly
report's numbers (app/weekly.py), drafts, post targets, media, metric
snapshots, plans and AI credit — so it costs no AI and no platform calls.
Read-only and open to everyone in the workspace, like the Dashboard; each
"Needs you" row links to the page (and its access rule) that acts on it.
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import billing
from app.content_scheduler import PHNOM_PENH
from app.database import get_db
from app.models import (
    ActivityPlan,
    Automation,
    Brand,
    Channel,
    Draft,
    Lead,
    MetricSnapshot,
    Platform,
    Post,
    PostTarget,
    Video,
    WeeklyPlan,
)
from app.leads import HOT, SLA_MINUTES, temperature
from app.tenancy import current_workspace_id, owned, scope
from app.weekly import _period

router = APIRouter(prefix="/command", tags=["Command center"])

# A queued post this long past its time has stuck (the worker posts within a minute).
STUCK_AFTER = timedelta(minutes=15)
# Failed deliveries this recent still need a person; older ones are history.
FAILED_WINDOW = timedelta(days=3)
# AI credit at or under this share of the month's credit gets a warning.
LOW_CREDIT_SHARE = 0.15


def _pp(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=UTC)).astimezone(PHNOM_PENH)


def _clock(dt: datetime | None) -> str:
    local = _pp(dt)
    return local.strftime("%H:%M") if local else ""


def _sum_periods(db: Session, brand_ids: list[int], since: datetime, until: datetime) -> dict:
    out = {"posts": 0, "measured": 0, "engagement": 0, "views": None}
    for b in brand_ids:
        p = _period(db, b, since, until)
        out["posts"] += p["posts"]
        out["measured"] += p["measured"]
        out["engagement"] += p["engagement"]
        if p["views"] is not None:
            out["views"] = (out["views"] or 0) + p["views"]
    return out


@router.get("/counts")
def command_counts(db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    """The sidebar's badge: weekly-plan posts still waiting for a decision,
    across the workspace's brands. Two cheap queries — polled every minute."""
    ids = [b for (b,) in db.execute(select(Brand.id).where(scope(Brand, ws))).all()]
    plans = db.scalars(select(WeeklyPlan).where(WeeklyPlan.brand_id.in_(ids), WeeklyPlan.status == "ready")).all() if ids else []
    leads = db.scalars(select(Lead.id).where(Lead.brand_id.in_(ids), Lead.status == "ready")).all() if ids else []
    return {"plan": sum(1 for p in plans for i in (p.items or []) if not i.get("state")), "leads": len(leads)}


@router.get("")
def command_center(brand_id: int | None = None, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    if brand_id is not None:
        owned(db, Brand, brand_id, ws)
        brands = [db.get(Brand, brand_id)]
    else:
        brands = db.scalars(select(Brand).where(scope(Brand, ws)).order_by(Brand.name)).all()
    ids = [b.id for b in brands]
    names = {b.id: b.name for b in brands}
    slugs = {b.id: b.slug for b in brands}

    now = datetime.now(UTC)
    local_now = now.astimezone(PHNOM_PENH)
    today = local_now.date()
    day_start = datetime.combine(today, time(0), PHNOM_PENH)
    day_end = day_start + timedelta(days=1)
    week = timedelta(days=7)

    # ── the numbers: last 7 days vs the 7 before (same reading as Weekly plan)
    this_week = _sum_periods(db, ids, now - week, now)
    last_week = _sum_periods(db, ids, now - 2 * week, now - week)

    channels = db.scalars(select(Channel).where(Channel.brand_id.in_(ids))).all() if ids else []
    plat = dict(db.execute(select(Platform.id, Platform.name)).all())
    live = [c for c in channels if c.status != "off"]

    # Channel-wide audience (Telegram members today): latest vs a week ago.
    audience = None
    for c in live:
        snaps = db.execute(
            select(MetricSnapshot.taken_at, MetricSnapshot.metrics)
            .where(MetricSnapshot.channel_id == c.id, MetricSnapshot.target_id.is_(None))
            .order_by(MetricSnapshot.taken_at.desc())
            .limit(60)
        ).all()
        if not snaps:
            continue
        count = lambda m: m.get("members") or m.get("followers") or m.get("fans")  # noqa: E731
        latest = count(snaps[0][1])
        old = next((count(m) for t, m in snaps if t <= now - week and count(m)), None)
        if latest:
            audience = audience or {"now": 0, "before": 0, "has_before": False}
            audience["now"] += latest
            if old:
                audience["before"] += old
                audience["has_before"] = True

    credit = billing.balance(db, ws)

    # ── needs you, most urgent first ─────────────────────────────────────
    needs: list[dict] = []

    targets_q = (
        select(PostTarget, Post.brand_id)
        .join(Post, Post.id == PostTarget.post_id)
        .where(Post.brand_id.in_(ids))
    )
    failed = db.execute(
        targets_q.where(PostTarget.status == "failed", PostTarget.updated_at >= now - FAILED_WINDOW)
    ).all() if ids else []
    if failed:
        first = failed[0][0]
        needs.append(
            {
                "key": "failed",
                "tone": "critical",
                "count": len(failed),
                "title": f"Post{'s' if len(failed) > 1 else ''} failed to publish",
                "detail": (first.error or "The platform refused it")[:140],
                "to": "/",
                "brands": sorted({names[b] for _, b in failed}),
            }
        )
    stuck = db.execute(
        targets_q.where(PostTarget.status == "queued", PostTarget.scheduled_for < now - STUCK_AFTER)
    ).all() if ids else []
    if stuck:
        needs.append(
            {
                "key": "stuck",
                "tone": "critical",
                "count": len(stuck),
                "title": "Posts past their time but not sent",
                "detail": "Usually a disconnected channel — check Platforms",
                "to": "/channels",
                "brands": sorted({names[b] for _, b in stuck}),
            }
        )

    # Leads: hand-offs past their first-contact time are urgent; leads waiting for a rep are next.
    lead_rows = db.scalars(select(Lead).where(Lead.brand_id.in_(ids), Lead.status.in_(("ready", "handed_off")))).all() if ids else []
    late = [
        l for l in lead_rows
        if l.status == "handed_off" and l.handed_off_at and not l.first_contact_at
        and SLA_MINUTES.get(temperature(l.score))
        and now > l.handed_off_at + timedelta(minutes=SLA_MINUTES[temperature(l.score)])
    ]
    if late:
        needs.append(
            {
                "key": "leads_late",
                "tone": "critical",
                "count": len(late),
                "title": f"Lead{'s' if len(late) > 1 else ''} not contacted in time",
                "detail": f"{late[0].name} is waiting for its first call",
                "to": "/leads",
                "brands": sorted({names[l.brand_id] for l in late}),
            }
        )
    ready_leads = [l for l in lead_rows if l.status == "ready"]
    if ready_leads:
        hot = sum(1 for l in ready_leads if l.score >= HOT)
        needs.append(
            {
                "key": "leads_ready",
                "tone": "warning" if hot else "normal",
                "count": len(ready_leads),
                "title": "Qualified leads waiting for hand-off",
                "detail": f"{hot} hot · routed by industry and rep load" if hot else "Routed by industry and rep load",
                "to": "/leads",
                "brands": sorted({names[l.brand_id] for l in ready_leads}),
            }
        )

    no_channel = [b for b in brands if not any(c.brand_id == b.id and c.status != "off" for c in channels)]
    if no_channel:
        needs.append(
            {
                "key": "channels",
                "tone": "critical",
                "count": len(no_channel),
                "title": "No connected channel" if len(no_channel) == 1 else "Brands with no connected channel",
                "detail": "Nothing can post until a Page or account is connected",
                "to": "/channels",
                "brands": [b.name for b in no_channel],
            }
        )

    # Approved posts from today on with no image: they won't go out.
    no_media = db.scalars(
        select(Draft).where(
            Draft.brand_id.in_(ids),
            Draft.status == "approved",
            Draft.video_id.is_(None),
            Draft.planned_for >= today,
        )
    ).all() if ids else []
    if no_media:
        soonest = min(d.planned_for for d in no_media)
        needs.append(
            {
                "key": "no_media",
                "tone": "warning",
                "count": len(no_media),
                "title": "Approved posts with no image",
                "detail": f"They won’t post until they have one — first on {soonest:%a} {soonest.day} {soonest:%b}",
                "to": "/weekly",
                "brands": sorted({names[d.brand_id] for d in no_media}),
            }
        )

    ready = db.scalars(select(WeeklyPlan).where(WeeklyPlan.brand_id.in_(ids), WeeklyPlan.status == "ready")).all() if ids else []
    if ready:
        items = [i for p in ready for i in (p.items or []) if not i.get("state")]  # approved / skipped are decided
        flagged = [i for i in items if i.get("fact_issues")]
        needs.append(
            {
                "key": "weekly",
                "tone": "normal",
                "count": len(items),
                "title": "Posts to approve for next week",
                "detail": (
                    f"{len(flagged)} flagged: {(flagged[0]['fact_issues'][0])[:80]}"
                    if flagged
                    else "Nothing flagged — review and approve in one tap"
                ),
                "to": "/weekly",
                "brands": sorted({names[p.brand_id] for p in ready}),
            }
        )

    waiting = db.scalars(select(Draft).where(Draft.brand_id.in_(ids), Draft.status == "waiting")).all() if ids else []
    if waiting:
        flagged = [d for d in waiting if d.fact_issues]
        needs.append(
            {
                "key": "review",
                "tone": "normal",
                "count": len(waiting),
                "title": "AI ideas waiting for your OK",
                "detail": f"{len(flagged)} with a claim to check" if flagged else "Daily ideas held for approval",
                "to": "/review",
                "brands": sorted({names[d.brand_id] for d in waiting}),
            }
        )

    # Today's open team tasks (Activity plan).
    open_tasks = []
    week_start = today - timedelta(days=today.weekday())
    for ap in db.scalars(select(ActivityPlan).where(ActivityPlan.brand_id.in_(ids), ActivityPlan.week_start == week_start)).all() if ids else []:
        open_tasks += [(ap.brand_id, t) for t in ap.tasks or [] if t.get("day") == today.isoformat() and not t.get("done")]
    if open_tasks:
        needs.append(
            {
                "key": "tasks",
                "tone": "normal",
                "count": len(open_tasks),
                "title": "Team tasks for today",
                "detail": open_tasks[0][1].get("title", "")[:120],
                "to": "/activity",
                "brands": sorted({names[b] for b, _ in open_tasks}),
            }
        )

    if credit["monthly_credit"] and credit["available"] <= credit["monthly_credit"] * LOW_CREDIT_SHARE:
        needs.append(
            {
                "key": "credit",
                "tone": "critical" if credit["available"] <= 0 else "warning",
                "count": None,
                "title": "AI credit is running low" if credit["available"] > 0 else "AI credit used up",
                "detail": f"${max(credit['available'], 0):.2f} left this month — AI stops at $0",
                "to": None,
                "brands": [],
            }
        )

    # ── today across channels ────────────────────────────────────────────
    today_rows: dict[int, dict] = {}
    if ids:
        for t, b in db.execute(
            targets_q.where(
                ((PostTarget.scheduled_for >= day_start) & (PostTarget.scheduled_for < day_end))
                | ((PostTarget.published_at >= day_start) & (PostTarget.published_at < day_end))
            )
        ).all():
            row = today_rows.setdefault(
                t.post_id,
                {
                    "kind": "post",
                    "id": t.post_id,
                    "at": (t.published_at or t.scheduled_for),
                    "title": t.title,
                    "brand": names[b],
                    "brand_slug": slugs[b],
                    "channels": [],
                    "statuses": [],
                    "views": None,
                    "engagement": None,
                    "target_id": t.id,
                },
            )
            row["at"] = min(filter(None, [row["at"], t.published_at or t.scheduled_for]))
            ch = next((c for c in channels if c.id == t.channel_id), None)
            if ch:
                row["channels"].append(plat.get(ch.platform_id, "?"))
            row["statuses"].append(t.status)

        posted_ids = [r["target_id"] for r in today_rows.values()]
        if posted_ids:
            all_targets = [
                tid
                for (tid,) in db.execute(
                    select(PostTarget.id).where(PostTarget.post_id.in_(list(today_rows)), PostTarget.status == "posted")
                ).all()
            ]
            latest = dict(
                db.execute(
                    select(MetricSnapshot.target_id, MetricSnapshot.metrics)
                    .where(MetricSnapshot.target_id.in_(all_targets))
                    .order_by(MetricSnapshot.target_id, MetricSnapshot.taken_at.desc())
                    .distinct(MetricSnapshot.target_id)
                ).all()
            ) if all_targets else {}
            owner = dict(
                db.execute(select(PostTarget.id, PostTarget.post_id).where(PostTarget.id.in_(all_targets))).all()
            ) if all_targets else {}
            for tid, m in latest.items():
                row = today_rows[owner[tid]]
                if m.get("views") is not None:
                    row["views"] = (row["views"] or 0) + m["views"]
                eng = sum(m.get(k) or 0 for k in ("likes", "comments", "shares"))
                row["engagement"] = (row["engagement"] or 0) + eng

    rows = []
    for r in today_rows.values():
        st = r.pop("statuses")
        r["status"] = (
            "failed" if "failed" in st else "posted" if all(s == "posted" for s in st) else "posting" if "posting" in st else "scheduled"
        )
        r["channels"] = sorted(set(r["channels"]))
        r["time"] = _clock(r.pop("at"))
        r.pop("target_id")
        rows.append(r)

    # Today's ideas that aren't a post yet: waiting for approval, or approved without media.
    for d in db.scalars(
        select(Draft).where(
            Draft.brand_id.in_(ids),
            Draft.planned_for == today,
            Draft.status.in_(("waiting", "approved")),
        )
    ).all() if ids else []:
        rows.append(
            {
                "kind": "draft",
                "id": d.id,
                "time": "",
                "title": d.title,
                "brand": names[d.brand_id],
                "brand_slug": slugs[d.brand_id],
                "channels": [],
                "status": "needs_approval" if d.status == "waiting" else "no_media",
                "flagged": bool(d.fact_issues),
                "has_media": d.video_id is not None,
                "views": None,
                "engagement": None,
            }
        )
    rows.sort(key=lambda r: (r["time"] == "", r["time"]))

    # ── what the AI did today (from timestamps other features already keep)
    log: list[dict] = []

    plans_today = db.scalars(
        select(WeeklyPlan).where(WeeklyPlan.brand_id.in_(ids), WeeklyPlan.created_at >= day_start)
    ).all() if ids else []
    for p in plans_today:
        log.append({"at": _clock(p.created_at), "kind": "Plan", "text": f"Wrote a plan of {len(p.items or [])} posts for {names[p.brand_id]}, from last week’s results"})

    for ap in db.scalars(
        select(ActivityPlan).where(ActivityPlan.brand_id.in_(ids), ActivityPlan.created_at >= day_start)
    ).all() if ids else []:
        log.append({"at": _clock(ap.created_at), "kind": "Plan", "text": f"Set this week’s team goals and {len(ap.tasks or [])} tasks for {names[ap.brand_id]}"})

    drafts_today = db.scalars(
        select(Draft).where(Draft.brand_id.in_(ids), Draft.created_at >= day_start, Draft.source == "ai-auto")
    ).all() if ids else []
    if drafts_today:
        pillars = Counter(d.pillar for d in drafts_today if d.pillar)
        first = min(d.created_at for d in drafts_today)
        log.append(
            {
                "at": _clock(first),
                "kind": "Write",
                "text": f"Wrote {len(drafts_today)} post{'s' if len(drafts_today) > 1 else ''} for today"
                + (f" — {len(pillars)} different topic{'s' if len(pillars) > 1 else ''}" if pillars else ""),
            }
        )

    media_today = db.scalars(
        select(Video).where(scope(Video, ws), Video.created_at >= day_start, Video.tag.like("ai-auto%"))
    ).all()
    if brand_id is not None:
        media_today = [v for v in media_today if v.brand_id == brand_id]
    if media_today:
        kinds = Counter(v.tag for v in media_today)
        parts = [
            f"{n} {label}{'s' if n > 1 else ''}"
            for tag, label in (("ai-auto-poster", "poster"), ("ai-auto-meme", "meme"))
            if (n := kinds.get(tag))
        ]
        other = len(media_today) - sum(kinds.get(t, 0) for t in ("ai-auto-poster", "ai-auto-meme"))
        if other:
            parts.append(f"{other} photo{'s' if other > 1 else ''} or video{'s' if other > 1 else ''}")
        log.append({"at": _clock(min(v.created_at for v in media_today)), "kind": "Studio", "text": "Made " + ", ".join(parts)})

    published = db.execute(
        targets_q.where(PostTarget.status == "posted", PostTarget.published_at >= day_start)
    ).all() if ids else []
    if published:
        where = sorted({plat.get(next((c.platform_id for c in channels if c.id == t.channel_id), 0), "?") for t, _ in published})
        log.append(
            {
                "at": _clock(min(t.published_at for t, _ in published)),
                "kind": "Publish",
                "text": f"Published {len(published)} post{'s' if len(published) > 1 else ''} to {', '.join(where)}",
            }
        )

    learned = db.execute(
        select(func.count(func.distinct(MetricSnapshot.target_id)), func.max(MetricSnapshot.taken_at)).where(
            MetricSnapshot.channel_id.in_([c.id for c in channels] or [0]),
            MetricSnapshot.target_id.is_not(None),
            MetricSnapshot.taken_at >= day_start,
        )
    ).one()
    if learned[0]:
        log.append({"at": _clock(learned[1]), "kind": "Learn", "text": f"Collected fresh results for {learned[0]} post{'s' if learned[0] > 1 else ''}"})

    log.sort(key=lambda e: e["at"])

    # ── autopilot rules, in one line each ───────────────────────────────
    autos = db.scalars(select(Automation).where(Automation.brand_id.in_(ids))).all() if ids else []
    on = [a for a in autos if a.enabled]
    autopilot = {
        "enabled": len(on),
        "brands": len(brands),
        "approval": any(a.require_approval for a in on),
        "auto_media": any(a.auto_media for a in on),
    }

    return {
        "now": local_now.isoformat(),
        "brands": [{"id": b.id, "name": b.name, "slug": b.slug} for b in brands],
        "kpis": {
            "reach": {"now": this_week["views"], "before": last_week["views"]},
            "reactions": {
                "now": this_week["engagement"] if this_week["measured"] or not this_week["posts"] else None,
                "before": last_week["engagement"],
            },
            "posts": {"now": this_week["posts"], "before": last_week["posts"]},
            "audience": audience,
            "channels": {"live": len(live), "total": len(channels)},
            "credit": {"available": credit["available"], "monthly": credit["monthly_credit"]},
        },
        "needs": needs,
        "today": rows,
        "log": log,
        "autopilot": autopilot,
    }
