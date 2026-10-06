"""What a post is about, in a few comparable labels — so Insights can say which
kind of content brings leads, not only which post got likes.

The AI reads a published post's caption once and stores ``Post.content_tags``:
topic, audience, pain_point and cta (plus a one-line summary). The labels stay
comparable because each call is shown the brand's existing labels and told to
reuse one when it means the same thing. ``what_works`` then joins the tags to
the leads linked to those posts (``Lead.post_id``).

Every call goes through content_ai._chat, so it is charged to the workspace's AI
credit and refused at $0 like any other AI call.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import billing, content_ai
from app.config import get_settings
from app.models import Brand, CreditEntry, Lead, Post, PostTarget

log = logging.getLogger(__name__)

CTAS = ("message_us", "visit_site", "call", "buy_now", "comment", "none")
TAG_FIELDS = ("audience", "topic", "pain_point", "cta")
FIELD_NAMES = {"audience": "audience", "topic": "topic", "pain_point": "problem it speaks to", "cta": "call to action"}
BATCH = 10  # posts tagged per click — keeps one request's AI bill small

SYSTEM = (
    "You label one social media post for a marketing team. Reply with a JSON object with these keys:\n"
    '- "summary": one short English sentence saying what the post says.\n'
    '- "topic": the subject in 2-4 English words, lowercase.\n'
    '- "audience": who it speaks to, 1-3 English words, lowercase (e.g. "shop owners", "banks"); "general" if nobody in particular.\n'
    '- "pain_point": the problem it addresses, 2-5 English words, lowercase; "" if it names none.\n'
    f'- "cta": what it asks the reader to do, exactly one of {", ".join(CTAS)}.\n'
    "The caption may be in Khmer or English; the labels are always English. "
    "You are given the labels already used for this brand: reuse one exactly when it means the same thing, "
    "and only invent a new label when none fits."
)


def _clean(value, limit: int = 40) -> str:
    return " ".join(str(value or "").lower().split())[:limit]


def _caption_of(db: Session, post: Post) -> str:
    return (
        db.scalar(
            select(PostTarget.caption)
            .where(PostTarget.post_id == post.id, PostTarget.status == "posted", PostTarget.caption != "")
            .order_by(PostTarget.published_at)
            .limit(1)
        )
        or ""
    )


def known_labels(posts) -> dict[str, list[str]]:
    """The labels this brand's tagged posts already use, most common first."""
    counts: dict[str, dict[str, int]] = {f: {} for f in ("audience", "topic", "pain_point")}
    for p in posts:
        for f, seen in counts.items():
            v = (p.content_tags or {}).get(f)
            if v:
                seen[v] = seen.get(v, 0) + 1
    return {f: [v for v, _ in sorted(seen.items(), key=lambda kv: -kv[1])[:25]] for f, seen in counts.items()}


def tag_post(db: Session, post: Post, labels: dict[str, list[str]]) -> dict | None:
    """Label one post. None when it has no caption to read."""
    caption = _caption_of(db, post).strip()
    if not caption:
        return None
    user = {
        "caption": caption[:1500],
        "title": post.title,
        "existing_labels": labels,
    }
    out = content_ai._chat(
        [{"role": "system", "content": SYSTEM}, {"role": "user", "content": json.dumps(user, ensure_ascii=False)}],
        get_settings().azure_openai_deployment,
        max_tokens=1500,
        effort="low",
    )
    cta = _clean(out.get("cta"), 20).replace(" ", "_")
    tags = {
        "summary": " ".join(str(out.get("summary") or "").split())[:200],
        "topic": _clean(out.get("topic")),
        "audience": _clean(out.get("audience")),
        "pain_point": _clean(out.get("pain_point")),
        "cta": cta if cta in CTAS else "none",
    }
    if not tags["topic"]:
        return None
    post.content_tags = tags
    for f in ("audience", "topic", "pain_point"):  # later posts in this batch reuse these
        if tags[f] and tags[f] not in labels[f]:
            labels[f].append(tags[f])
    return tags


def what_works(posts: list[dict]) -> list[dict]:
    """posts: [{"tags": {...}, "leads": int, "won": int}] for tagged posts.
    For every label shared by 2+ posts, how many leads per post it brought —
    best first, labels with no leads left out."""
    total_leads = sum(p["leads"] for p in posts)
    if not posts or total_leads == 0:
        return []
    baseline = total_leads / len(posts)
    groups: dict[tuple[str, str], dict] = {}
    for p in posts:
        for f in TAG_FIELDS:
            v = (p["tags"] or {}).get(f)
            if not v or v == "none":
                continue
            g = groups.setdefault((f, v), {"field": f, "label": FIELD_NAMES[f], "value": v, "posts": 0, "leads": 0, "won": 0})
            g["posts"] += 1
            g["leads"] += p["leads"]
            g["won"] += p["won"]
    out = []
    for g in groups.values():
        per_post = g["leads"] / g["posts"]
        if g["posts"] >= 2 and g["leads"] > 0 and per_post > baseline:
            out.append({**g, "per_post": round(per_post, 1), "vs_average": round(per_post / baseline, 1)})
    out.sort(key=lambda g: (-g["per_post"], -g["posts"]))
    return out[:6]


def brand_what_works(db: Session, brand_id: int, days: int = 90) -> list[dict]:
    """what_works for one brand's tagged posts of the last ``days`` days."""
    since = datetime.now(UTC) - timedelta(days=days)
    posted = select(PostTarget.post_id).where(PostTarget.status == "posted", PostTarget.published_at >= since)
    posts = db.scalars(
        select(Post).where(Post.brand_id == brand_id, Post.content_tags.is_not(None), Post.id.in_(posted))
    ).all()
    if not posts:
        return []
    leads: dict[int, int] = {}
    won: dict[int, int] = {}
    for pid, outcome in db.execute(select(Lead.post_id, Lead.outcome).where(Lead.brand_id == brand_id, Lead.post_id.is_not(None))):
        leads[pid] = leads.get(pid, 0) + 1
        if outcome == "won":
            won[pid] = won.get(pid, 0) + 1
    return what_works([{"tags": p.content_tags, "leads": leads.get(p.id, 0), "won": won.get(p.id, 0)} for p in posts])


# ── reading new posts automatically ───────────────────────────────────────
AUTO_PER_RUN = 5  # posts per workspace per pass (the collector runs every 3 hours)
AUTO_MONTHLY_CAP = 150  # posts per workspace per month — a few cents of AI credit at most
_LEDGER_NOTE = "AI writing: You label one social media post%"


def _read_this_month(db: Session, ws: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(CreditEntry)
            .where(CreditEntry.workspace_id == ws, CreditEntry.created_at >= billing.month_start(), CreditEntry.note.like(_LEDGER_NOTE))
        )
        or 0
    )


def auto_tag_all(db: Session) -> int:
    """Read the newest untagged posts of every workspace, within each one's
    monthly cap. Stops quietly for a workspace when AI is off or out of credit —
    posting and metrics never depend on this."""
    now = datetime.now(UTC)
    posted = (
        select(PostTarget.post_id)
        .where(
            PostTarget.status == "posted",
            PostTarget.caption != "",
            PostTarget.published_at >= now - timedelta(days=14),
            PostTarget.published_at <= now - timedelta(hours=4),
        )
        .group_by(PostTarget.post_id)
    )
    workspaces = db.scalars(
        select(Brand.workspace_id)
        .join(Post, Post.brand_id == Brand.id)
        .where(Post.content_tags.is_(None), Post.id.in_(posted))
        .distinct()
    ).all()
    total = 0
    for ws in workspaces:
        room = min(AUTO_PER_RUN, AUTO_MONTHLY_CAP - _read_this_month(db, ws))
        if room <= 0:
            continue
        billing.bind(ws)  # background thread: charge the right workspace
        todo = db.scalars(
            select(Post)
            .where(Post.brand_id.in_(select(Brand.id).where(Brand.workspace_id == ws)), Post.content_tags.is_(None), Post.id.in_(posted))
            .order_by(Post.id.desc())
            .limit(room)
        ).all()
        labels: dict[int, dict] = {}
        try:
            for post in todo:
                if post.brand_id not in labels:
                    known = db.scalars(
                        select(Post).where(Post.brand_id == post.brand_id, Post.content_tags.is_not(None)).limit(200)
                    ).all()
                    labels[post.brand_id] = known_labels(known)
                if tag_post(db, post, labels[post.brand_id]):
                    total += 1
                    db.commit()
        except content_ai.ContentAIError as exc:
            db.rollback()
            log.info("auto-tagging paused for workspace %s: %s", ws, exc)
    return total
