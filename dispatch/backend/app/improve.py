"""'Improve with AI' — rewrite a post that underperformed, and repost it.

``POST /ai/improve/{target_id}`` looks at one published post next to the
brand's other posts on the same platform (latest saved readings, as in
app/learning.py) and the rules learned from its results, and asks the model
why it likely underperformed and for a better version. Every reason must come
from that data — the model is told not to guess at reach, the algorithm or
anything it wasn't shown.

``POST /ai/improve/{target_id}/schedule`` puts the (possibly edited) new
version back on the same channel, with the same media, at the brand's best
time for that platform — a real queued post plus a Draft so it shows on the
Calendar (source "ai-improve").
"""

from __future__ import annotations

from datetime import datetime
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.advisor import _take_quota
from app.config import get_settings
from app.content_ai import (
    KHMER_GUIDE,
    ContentAIError,
    _chat,
    _fix_khmer_punctuation,
    _is_khmer,
    _product_facts,
    fact_check,
)
from app.content_scheduler import PHNOM_PENH, _next_slot
from app.database import get_db
from app.learning import _engagement, _posts, brand_learnings, learned_time
from app.models import Automation, Brand, Channel, Draft, MetricSnapshot, Post, PostTarget, Product
from app.tenancy import current_workspace_id, owned

router = APIRouter(prefix="/ai/improve", tags=["AI"])

SYSTEM_PROMPT = """You are a senior social media editor. A post didn't do as well as it could have.
You get the post (platform, caption, media type, time it went out, its numbers), the brand's usual
numbers on that platform, what has measurably worked for this brand, its voice and its products.

1. diagnosis: 2-4 short, specific reasons it likely underperformed. Each must point at something in
   the DATA (its caption, hook, length, question/no question, hashtags, posting time vs. the brand's
   best time, format) — compare with what works for this brand. Never blame the algorithm, reach,
   luck, or anything you weren't shown. If the numbers are actually fine, say so honestly.
2. A better version for the SAME platform and the same image/video: a stronger first line, the
   brand's voice, what works for this brand applied, a light call to action. Keep every product fact,
   price and claim exactly as in the product info or the original — never invent new ones.
3. changes: 2-4 short bullets naming what you changed and why.

Write the caption and title in the same language as the original caption. The diagnosis and
changes are for the marketing team: write them in English unless the original is in Khmer, then
in simple Khmer.

Reply as JSON: {"diagnosis": ["..."], "title": "<short working title>", "caption": "<new caption>",
"changes": ["..."]}"""


def _latest_metrics(db: Session, target_id: int) -> dict:
    snap = db.scalar(
        select(MetricSnapshot)
        .where(MetricSnapshot.target_id == target_id)
        .order_by(MetricSnapshot.taken_at.desc())
        .limit(1)
    )
    return dict(snap.metrics) if snap else {}


def _context(db: Session, target: PostTarget) -> dict:
    channel = db.get(Channel, target.channel_id)
    post = db.get(Post, target.post_id)
    brand = db.get(Brand, post.brand_id)
    slug = channel.platform.slug if channel and channel.platform else ""
    metrics = _latest_metrics(db, target.id)
    engagement = _engagement(metrics) if metrics else None

    peers = [
        p
        for p in _posts(db, brand.id)
        if p["platform"] == slug and p["target_id"] != target.id
    ]
    usual = mean(p["engagement"] for p in peers) if peers else None

    kind = "text"
    if post.video_id:
        from app.media import kind_for
        from app.models import Video

        video = db.get(Video, post.video_id)
        kind = (kind_for(video.url, None) if video and video.url else None) or "text"
    return {
        "brand": brand,
        "post": post,
        "channel": channel,
        "slug": slug,
        "metrics": metrics,
        "engagement": engagement,
        "usual": usual,
        "peers": len(peers),
        "kind": kind,
    }


def _best_slot(db: Session, brand_id: int, slug: str) -> datetime:
    automation = db.scalar(select(Automation).where(Automation.brand_id == brand_id))
    at = automation.post_at if automation else None
    if at is None and (automation is None or automation.learn_from_results):
        at = learned_time(brand_learnings(db, brand_id), slug)
    return _next_slot(slug, datetime.now(PHNOM_PENH), at)


def _usable(db: Session, target_id: int, ws: int) -> PostTarget:
    target = owned(db, PostTarget, target_id, ws, "Post")
    if target.status != "posted":
        raise HTTPException(422, "Only published posts can be improved.")
    return target


@router.post("/{target_id}")
def improve(target_id: int, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)):
    target = _usable(db, target_id, ws)
    ctx = _context(db, target)
    brand, slug = ctx["brand"], ctx["slug"]
    if not (target.caption or target.title or "").strip():
        raise HTTPException(422, "This post has no caption to improve.")
    _take_quota(ws)

    learnings = brand_learnings(db, brand.id)
    products = db.scalars(select(Product).where(Product.brand_id == brand.id).order_by(Product.name)).all()
    when = target.published_at.astimezone(PHNOM_PENH).strftime("%a %d %b %H:%M") if target.published_at else "?"
    numbers = ", ".join(f"{k} {v}" for k, v in ctx["metrics"].items() if isinstance(v, (int, float))) or "none measured"
    lines = [
        f"Brand: {brand.name} (audience language: {brand.lang or 'unset'})",
        f"Platform: {slug}",
        f"Media: {ctx['kind']}",
        f"Went out: {when} (Phnom Penh time)",
        f"Its numbers: {numbers}",
        (
            f"Engagement (likes+comments+shares): {ctx['engagement']:.0f} vs this brand's usual "
            f"{ctx['usual']:.1f} on {slug} (average of {ctx['peers']} other posts)"
            if ctx["engagement"] is not None and ctx["usual"] is not None
            else "Not enough other posts on this platform to compare with."
        ),
        f"\nOriginal caption:\n---\n{target.caption or target.title}\n---",
    ]
    if learnings["rules"]:
        lines.append("\nWhat has measurably worked for this brand:")
        lines += [f"- {r['text']} ({r['evidence']})" for r in learnings["rules"]]
    if learnings["post_hours"].get(slug):
        lines.append(f"Best posting time on {slug} for this brand: {learnings['post_hours'][slug]}")
    if learnings["top_captions"]:
        lines.append(
            "\nIts best-performing captions (style reference only):\n---\n" + "\n---\n".join(learnings["top_captions"]) + "\n---"
        )
    if brand.voice_examples:
        lines.append(f"\nBrand voice examples (style only):\n---\n{brand.voice_examples.strip()[:2000]}\n---")
    lines.append(f"\nProduct info:\n{_product_facts(list(products))}")

    cfg = get_settings()
    khmer = _is_khmer(brand.lang) or any("ក" <= ch <= "៿" for ch in target.caption or "")
    model = (cfg.azure_openai_khmer_deployment if khmer else "") or cfg.azure_openai_deployment
    try:
        out = _chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT + (KHMER_GUIDE if khmer else "")},
                {"role": "user", "content": "\n".join(lines)},
            ],
            model,
            max_tokens=4000,
        )
    except ContentAIError as exc:
        raise HTTPException(503, str(exc)) from exc

    caption = str(out.get("caption") or "").strip()
    if not caption:
        raise HTTPException(502, "The AI returned no caption — try again.")
    if khmer:
        caption = _fix_khmer_punctuation(caption)
    checks = fact_check([caption], list(products))
    slot = _best_slot(db, brand.id, slug)

    def strings(key: str) -> list[str]:
        return [str(x).strip() for x in (out.get(key) or []) if str(x).strip()][:4]

    return {
        "diagnosis": strings("diagnosis"),
        "changes": strings("changes"),
        "title": str(out.get("title") or ctx["post"].title or "Improved post").strip()[:200],
        "caption": caption,
        "fact_issues": checks[0] if checks else None,
        "engagement": ctx["engagement"],
        "usual": round(ctx["usual"], 1) if ctx["usual"] is not None else None,
        "compared_with": ctx["peers"],
        "platform": slug,
        "channel_handle": ctx["channel"].handle if ctx["channel"] else "",
        "has_media": ctx["post"].video_id is not None,
        "slot": slot.isoformat(),
    }


class ScheduleIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    caption: str = Field(min_length=1, max_length=5000)


@router.post("/{target_id}/schedule")
def schedule_improved(
    target_id: int, payload: ScheduleIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    """Queue the new version on the same channel, same media, at the best time."""
    target = _usable(db, target_id, ws)
    ctx = _context(db, target)
    if ctx["channel"] is None or ctx["channel"].status != "live":
        raise HTTPException(422, "That channel isn't connected any more — reconnect it first.")
    slot = _best_slot(db, ctx["brand"].id, ctx["slug"])

    post = Post(brand_id=ctx["brand"].id, video_id=ctx["post"].video_id, title=payload.title.strip(), status="scheduled")
    db.add(post)
    db.flush()
    db.add(
        PostTarget(
            post_id=post.id,
            channel_id=target.channel_id,
            caption=payload.caption.strip(),
            title=payload.title.strip(),
            scheduled_for=slot,
            status="queued",
            platform_options=target.platform_options or {},
        )
    )
    db.add(
        Draft(
            brand_id=ctx["brand"].id,
            title=payload.title.strip(),
            body=payload.caption.strip(),
            insight=f"Improved version of a post from {target.published_at.astimezone(PHNOM_PENH):%d %b}"
            if target.published_at
            else "Improved version of an earlier post",
            planned_for=slot.date(),
            source="ai-improve",
            status="scheduled",
            video_id=ctx["post"].video_id,
        )
    )
    db.commit()
    return {"post_id": post.id, "scheduled_for": slot.isoformat(), "platform": ctx["slug"]}
