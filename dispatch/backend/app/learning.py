"""What has worked for a brand — learned from its own published posts, so
Auto-generate writes and schedules the next ones accordingly.

Source: each post's latest saved reading (MetricSnapshot, see app/views.py
record_snapshots) — no platform calls here. A rule is only produced when both
sides of the comparison have MIN_POSTS posts and the gap is clear (RATIO), so
thin data never turns into confident-sounding advice. Posts from platforms
that report no engagement (LinkedIn personal, Telegram) are simply not used.

Used by app/content_scheduler.py: ``prompt`` goes into the idea-writing brief
(app/content_ai.py), ``post_hours`` sets the auto-schedule time per platform
when the person hasn't fixed one. Shown on the Auto-generate page via
/views/auto.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, time, timedelta, timezone
from statistics import mean, median

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Channel, MetricSnapshot, Platform, Post, PostTarget, Video

PHNOM_PENH = timezone(timedelta(hours=7))
LOOKBACK_DAYS = 90
MIN_POSTS = 2  # per side of any comparison
RATIO = 1.25  # how much better one side must be before it becomes a rule

_WINDOWS = [
    ("morning", "the morning (6–11 AM)", 6, 11),
    ("midday", "around lunch (11 AM–2 PM)", 11, 14),
    ("afternoon", "the afternoon (2–6 PM)", 14, 18),
    ("evening", "the evening (6–10 PM)", 18, 22),
    ("night", "late at night (10 PM–6 AM)", 22, 30),
]
_HASHTAG = re.compile(r"#[\w]+", re.UNICODE)
_SHORT = 150  # characters


def _engagement(m: dict) -> float | None:
    vals = [m.get(k) for k in ("likes", "comments", "shares")]
    return float(sum(v or 0 for v in vals)) if any(v is not None for v in vals) else None


def _window(hour: int):
    for w in _WINDOWS:
        if w[2] <= hour < w[3] or w[2] <= hour + 24 < w[3]:
            return w
    return _WINDOWS[-1]


def _x(r: float) -> str:
    return f"{r:.0f}×" if r >= 10 else f"{r:.1f}×"


def _compare(a: list[float], b: list[float]):
    """(ratio of a over b, avg a, avg b) when both sides have enough posts."""
    if len(a) < MIN_POSTS or len(b) < MIN_POSTS:
        return None
    ma, mb = mean(a), mean(b)
    if mb <= 0:
        return (float("inf") if ma > 0 else 1.0), ma, mb
    return ma / mb, ma, mb


def _posts(db: Session, brand_id: int) -> list[dict]:
    since = datetime.now(UTC) - timedelta(days=LOOKBACK_DAYS)
    targets = db.scalars(
        select(PostTarget)
        .join(Post, Post.id == PostTarget.post_id)
        .where(
            Post.brand_id == brand_id,
            PostTarget.status == "posted",
            PostTarget.published_at >= since,
        )
    ).all()
    if not targets:
        return []
    latest: dict[int, MetricSnapshot] = {}
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
    posts = {
        p.id: p for p in db.scalars(select(Post).where(Post.id.in_({t.post_id for t in targets})))
    }
    video_ids = {p.video_id for p in posts.values() if p.video_id}
    urls = (
        dict(db.execute(select(Video.id, Video.url).where(Video.id.in_(video_ids))).all())
        if video_ids
        else {}
    )

    from app.media import kind_for

    out = []
    for t in targets:
        snap = latest.get(t.id)
        eng = _engagement(snap.metrics) if snap else None
        if eng is None:
            continue
        post = posts.get(t.post_id)
        url = urls.get(post.video_id) if post and post.video_id else None
        out.append(
            {
                "target_id": t.id,
                "platform": slugs.get(t.channel_id, ""),
                "published_at": t.published_at,
                "caption": t.caption or "",
                "kind": (kind_for(url, None) if url else None) or "text",
                "engagement": eng,
                "comments": snap.metrics.get("comments"),
            }
        )
    return out


def brand_learnings(db: Session, brand_id: int) -> dict:
    """{"posts": n, "rules": [{"id","text","evidence"}], "post_hours": {slug: "HH:MM"},
    "top_captions": [...], "prompt": str} — empty rules when there's too little data."""
    posts = _posts(db, brand_id)
    rules: list[dict] = []
    post_hours: dict[str, str] = {}
    guidance: list[str] = []

    # Format
    by_kind: dict[str, list[float]] = {}
    for p in posts:
        by_kind.setdefault(p["kind"], []).append(p["engagement"])
    for kind in sorted(by_kind, key=lambda k: -mean(by_kind[k])):
        rest = [e for k, es in by_kind.items() if k != kind for e in es]
        c = _compare(by_kind[kind], rest)
        if c and c[0] >= RATIO:
            name = {"video": "Video", "image": "Image", "text": "Text-only"}.get(kind, kind)
            rules.append(
                {
                    "id": "format",
                    "text": f"{name} posts get {_x(c[0])} more engagement",
                    "evidence": f"{c[1]:.1f} vs {c[2]:.1f} per post ({len(by_kind[kind])} vs {len(rest)} posts)",
                }
            )
            guidance.append(
                {
                    "video": "Favour ideas that work as a short video — say so in each idea's insight.",
                    "image": "Favour ideas built around one strong, clear image.",
                    "text": "Plain text posts do well here — lead with a strong first line.",
                }.get(kind, "")
            )
        break  # only the top format is worth a rule

    # Timing, per platform (each platform's audience keeps its own hours)
    for slug in sorted({p["platform"] for p in posts if p["platform"]}):
        mine = [p for p in posts if p["platform"] == slug and p["published_at"]]
        groups: dict[tuple, list[dict]] = {}
        for p in mine:
            groups.setdefault(_window(p["published_at"].astimezone(PHNOM_PENH).hour), []).append(p)
        best = max(groups, key=lambda w: mean(p["engagement"] for p in groups[w]), default=None)
        if best is None:
            continue
        rest = [p["engagement"] for w, ps in groups.items() if w != best for p in ps]
        c = _compare([p["engagement"] for p in groups[best]], rest)
        if c and c[0] >= RATIO:
            hours = [p["published_at"].astimezone(PHNOM_PENH).hour for p in groups[best]]
            h = int(median(hours))
            post_hours[slug] = f"{h:02d}:00"
            rules.append(
                {
                    "id": f"timing-{slug}",
                    "text": f"On {slug.capitalize()}, posts in {best[1]} get {_x(c[0])} more engagement",
                    "evidence": f"{c[1]:.1f} vs {c[2]:.1f} per post — auto-posts go out at {h:02d}:00",
                }
            )

    # Questions → comments
    with_c = [p for p in posts if p["comments"] is not None]
    c = _compare(
        [p["comments"] for p in with_c if "?" in p["caption"]],
        [p["comments"] for p in with_c if "?" not in p["caption"]],
    )
    if c and c[1] > 0 and c[0] >= RATIO:
        rules.append(
            {
                "id": "questions",
                "text": "Posts that ask a question get "
                + ("the most comments" if c[0] == float("inf") else f"{_x(c[0])} more comments"),
                "evidence": f"{c[1]:.1f} vs {c[2]:.1f} comments per post",
            }
        )
        guidance.append("End most captions with a short, natural question to the reader.")

    # Hashtags
    tagged = [p["engagement"] for p in posts if _HASHTAG.search(p["caption"])]
    plain = [p["engagement"] for p in posts if not _HASHTAG.search(p["caption"])]
    for a, b, text, tip in (
        (tagged, plain, "Posts with hashtags do better", "Include 2–4 relevant hashtags."),
        (plain, tagged, "Posts without hashtags do better", "Use few or no hashtags."),
    ):
        c = _compare(a, b)
        if c and c[0] >= RATIO:
            rules.append(
                {
                    "id": "hashtags",
                    "text": f"{text} ({_x(c[0])})",
                    "evidence": f"{c[1]:.1f} vs {c[2]:.1f} per post",
                }
            )
            guidance.append(tip)
            break

    # Caption length
    short = [p["engagement"] for p in posts if len(p["caption"]) < _SHORT]
    long_ = [p["engagement"] for p in posts if len(p["caption"]) >= _SHORT]
    for a, b, text, tip in (
        (
            short,
            long_,
            f"Short captions (under {_SHORT} characters) do better",
            "Keep captions short — 1–3 sentences.",
        ),
        (
            long_,
            short,
            "Longer, detailed captions do better",
            "Write fuller captions with useful detail.",
        ),
    ):
        c = _compare(a, b)
        if c and c[0] >= RATIO:
            rules.append(
                {
                    "id": "length",
                    "text": f"{text} ({_x(c[0])})",
                    "evidence": f"{c[1]:.1f} vs {c[2]:.1f} per post",
                }
            )
            guidance.append(tip)
            break

    top = sorted((p for p in posts if p["caption"].strip()), key=lambda p: -p["engagement"])[:3]
    top_captions = [p["caption"].strip()[:500] for p in top] if len(posts) >= 4 else []

    prompt = ""
    if guidance or top_captions:
        parts = [
            "What has worked for this brand recently (measured from its own posts) — follow it:"
        ]
        parts += [f"- {g}" for g in guidance if g]
        if top_captions:
            parts.append(
                "Its best-performing recent captions (tone and structure reference only — "
                "never copy facts, prices or claims from them):\n---\n"
                + "\n---\n".join(top_captions)
                + "\n---"
            )
        prompt = "\n".join(parts)

    return {
        "posts": len(posts),
        "rules": rules,
        "post_hours": post_hours,
        "top_captions": top_captions,
        "prompt": prompt,
    }


def learned_time(learnings: dict, platform_slug: str) -> time | None:
    hhmm = (learnings or {}).get("post_hours", {}).get(platform_slug)
    if not hhmm:
        return None
    h, m = hhmm.split(":")
    return time(int(h), int(m))
