"""Marketing advisor — the "ask" half of the AI Agent chat.

``POST /api/ai/advisor`` answers questions like "how is my engagement?" or
"what should I post next week?" from the caller's *own* workspace data only:
brands + voice, products, connected channels, automation settings, the
queue, and recent published posts with their live platform numbers (the same
numbers the Analytics page shows). The model is told to cite those numbers,
say plainly when the data can't answer something (e.g. reach isn't
collected), and end with up to three ready-to-generate post ideas the page
turns into "✦ Generate this" buttons.
"""

from __future__ import annotations

import base64
import threading
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.content_ai import ContentAIError, _chat
from app.database import get_db
from app.imaging import ImageError, shrink
from app.media import read_media
from app.models import Automation, Brand, Channel, Draft, Platform, PostTarget, Product
from app.tenancy import current_workspace_id, owned, scope

router = APIRouter(prefix="/ai", tags=["AI"])

SYSTEM_PROMPT = """You are ContentFlow's marketing advisor — a senior social media strategist for small and
medium businesses (many in Cambodia). You are talking to the business owner or their marketer.

You get a DATA snapshot of their workspace: brands, products, connected channels, automation
settings, what's queued, and their recent published posts with live platform numbers.

Rules:
- Ground every claim in the DATA. Quote real numbers, post titles, platforms and dates.
- Never invent metrics, followers, reach, sales, competitors or trends that aren't in the DATA.
  If the question needs data we don't have (e.g. reach/impressions, sales, competitor data,
  LinkedIn stats), say so briefly and give the best advice possible from what IS there.
- If there are few or no published posts, say the sample is small and lean on the products and
  brand voice for advice instead of pretending to see patterns.
- Engagement = likes + comments + shares (and views where given). Compare posts, platforms,
  formats (image vs video), topics/products and posting times when the data allows.
- Be practical and specific: what to do next, on which platform, when, with which product/angle.
- Keep it tight: a one-line headline answer, then at most 3 short sections of bullets —
  roughly 200 words unless the user asks for detail. No filler, no repeating the data back.
  Use **bold** for key numbers. Plain markdown only (headings with ##, bullets with -).
- Settings, people and places in ideas should fit the brand's own market (Cambodia unless the
  DATA says otherwise) — don't invent other countries or details.
- Reply in the language the user wrote in (Khmer → natural Khmer; English → English).

Also propose up to 3 concrete next posts as "suggestions", each with a ready-to-use,
detailed image or video generation prompt (subject, setting, lighting, composition, style — no
text/logos in the image) grounded in a real product from the DATA. Return [] if suggestions
don't fit the question.

Reply as JSON: {"answer": "<markdown>", "suggestions": [{"label": "<short title>",
"type": "image" | "video", "prompt": "<generation prompt>"}]}"""


class HistoryItem(BaseModel):
    role: str  # user | assistant
    content: str = Field(max_length=6000)


class AdvisorIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[HistoryItem] = Field(default_factory=list)
    brand_id: int | None = None
    # A "/media/..." image the user attached — the advisor looks at it.
    image_url: str = ""


# ── per-workspace daily question cap (AI calls cost money) ───────────────
_usage: dict[tuple[int, date], int] = {}
_usage_lock = threading.Lock()


def _take_quota(ws: int) -> int:
    limit = get_settings().advisor_daily_limit
    today = datetime.now(UTC).date()
    with _usage_lock:
        for key in [k for k in _usage if k[1] != today]:
            _usage.pop(key, None)
        used = _usage.get((ws, today), 0)
        if used >= limit:
            raise HTTPException(
                429, f"Daily advisor limit reached ({limit} questions). Try again tomorrow."
            )
        _usage[(ws, today)] = used + 1
        return limit - used - 1


def _clip(text: str, n: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _snapshot(db: Session, ws: int, focus_brand_id: int | None) -> str:
    """Everything the advisor may know, as compact text."""
    from app.views import insights_view  # local import: views imports a lot

    brands = db.scalars(select(Brand).where(scope(Brand, ws)).order_by(Brand.name)).all()
    if not brands:
        return "No brands yet — the workspace is empty."
    plats = {p.id: p.slug for p in db.scalars(select(Platform)).all()}
    lines: list[str] = [f"Today: {datetime.now(UTC).date().isoformat()}"]
    if focus_brand_id:
        lines.append(f"The user is currently looking at brand id {focus_brand_id}.")

    for b in brands:
        lines.append(
            f"\n## Brand: {b.name} (id {b.id}) — language: {b.lang or 'unset'}; note: {_clip(b.note, 120)}"
        )
        if b.voice_examples:
            lines.append(f"Voice examples: {_clip(b.voice_examples, 400)}")
        products = db.scalars(
            select(Product).where(Product.brand_id == b.id).order_by(Product.name)
        ).all()
        if products:
            lines.append("Products:")
            for p in products[:15]:
                lines.append(
                    f"- {p.name}: {_clip(p.description, 180)} | highlights: {_clip(p.highlights, 180)}"
                )
        else:
            lines.append("Products: none added yet.")
        chans = db.scalars(select(Channel).where(Channel.brand_id == b.id)).all()
        live = [
            f"{plats.get(c.platform_id, '?')} ({c.handle or 'no handle'})"
            for c in chans
            if c.status != "off"
        ]
        lines.append(f"Connected channels: {', '.join(live) if live else 'none'}")
        a = db.scalar(select(Automation).where(Automation.brand_id == b.id))
        if a:
            lines.append(
                f"Auto-generate: {'ON' if a.enabled else 'off'}, {a.videos_per_day}/day at {a.run_at:%H:%M}, "
                f"topics: {a.topic_source or '-'}, review first: {a.require_approval}, auto images: {a.auto_media}"
            )

    queued = db.scalar(
        select(func.count())
        .select_from(PostTarget)
        .where(scope(PostTarget, ws), PostTarget.status == "queued")
    )
    waiting = db.scalar(
        select(func.count()).select_from(Draft).where(scope(Draft, ws), Draft.status == "waiting")
    )
    since = datetime.now(UTC) - timedelta(days=30)
    posted_30 = db.scalar(
        select(func.count())
        .select_from(PostTarget)
        .where(
            scope(PostTarget, ws), PostTarget.status == "posted", PostTarget.published_at >= since
        )
    )
    failed_30 = db.scalar(
        select(func.count())
        .select_from(PostTarget)
        .where(scope(PostTarget, ws), PostTarget.status == "failed", PostTarget.updated_at >= since)
    )
    lines.append(
        f"\n## Pipeline: {queued or 0} posts queued, {waiting or 0} AI ideas waiting for review, "
        f"{posted_30 or 0} deliveries published and {failed_30 or 0} failed in the last 30 days."
    )

    rows = insights_view(brand_id=None, limit=25, db=db, ws=ws)
    if not rows:
        lines.append("\n## Recent published posts: none with trackable numbers yet.")
    else:
        lines.append("\n## Recent published posts (newest first, live numbers):")
        for r in rows:
            m = r.get("metrics") or {}
            nums = (
                ", ".join(f"{k} {v}" for k, v in m.items() if isinstance(v, (int, float)))
                or "no numbers"
            )
            when = r.get("published_at")
            when = (
                when.strftime("%Y-%m-%d %a %H:%M UTC")
                if hasattr(when, "strftime")
                else str(when or "?")
            )
            lines.append(
                f"- [{r.get('brand_name')}] {r.get('platform_slug')} · {when} · {r.get('media_kind') or 'text'} · "
                f'"{_clip(r.get("title") or "", 60)}" — {nums}'
                + (
                    f" ({_clip(r.get('note') or '', 80)})"
                    if r.get("status") != "ok" and r.get("note")
                    else ""
                )
                + f" | caption: {_clip(r.get('caption') or '', 140)}"
            )
    lines.append(
        "\nNot available in this data: reach/impressions, follower growth, sales, website clicks, "
        "competitor data, LinkedIn post stats, Telegram per-post views."
    )
    return "\n".join(lines)


@router.post("/advisor")
def advisor(
    payload: AdvisorIn, db: Session = Depends(get_db), ws: int = Depends(current_workspace_id)
):
    if payload.brand_id is not None:
        owned(db, Brand, payload.brand_id, ws)
    remaining = _take_quota(ws)

    snapshot = _snapshot(db, ws, payload.brand_id)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"DATA:\n{snapshot}"},
    ]
    for h in payload.history[-8:]:
        if h.role in ("user", "assistant") and h.content.strip():
            messages.append({"role": h.role, "content": h.content})
    model = get_settings().azure_openai_deployment
    if payload.image_url:
        image = read_media(payload.image_url)
        if image is None:
            raise HTTPException(400, "The attached image wasn't found — attach it again.")
        try:
            image = shrink(image)
        except ImageError as exc:
            raise HTTPException(400, str(exc)) from exc
        data_url = "data:image/jpeg;base64," + base64.b64encode(image).decode()
        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": payload.message},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        )
        model = get_settings().azure_openai_vision_deployment or model
    else:
        messages.append({"role": "user", "content": payload.message})

    try:
        out = _chat(messages, model, max_tokens=6000)
    except ContentAIError as exc:
        raise HTTPException(503, str(exc)) from exc

    suggestions = []
    for s in (out.get("suggestions") or [])[:3]:
        if isinstance(s, dict) and s.get("prompt"):
            suggestions.append(
                {
                    "label": _clip(str(s.get("label") or "Post idea"), 80),
                    "type": "video" if s.get("type") == "video" else "image",
                    "prompt": str(s["prompt"]).strip(),
                }
            )
    answer = str(out.get("answer") or "").strip()
    if not answer:
        raise HTTPException(502, "The advisor returned an empty answer — try asking again.")
    return {"answer": answer, "suggestions": suggestions, "remaining_today": remaining}
