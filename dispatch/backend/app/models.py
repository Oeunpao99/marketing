"""SQLAlchemy models.

Every model here is registered in ``app/registry.py`` and therefore gets its own
REST resource and its own entry in the portal sidebar.
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    Time,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Workspace(Base, TimestampMixin):
    """One customer account (a company / agency) — the tenant boundary.

    Every brand, uploaded or generated asset, and login belongs to exactly one
    workspace; everything else (channels, posts, drafts, products,
    automations) is scoped through its brand. See app/tenancy.py for the
    checks every endpoint runs against this."""

    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # Billing plan (app/billing.py): "pro" gets PLAN_CREDIT["pro"] of AI credit
    # a month. Not editable through any API yet — there's no payment system.
    plan: Mapped[str] = mapped_column(String(20), default="pro", server_default="pro")


class CreditEntry(Base):
    """One line of a workspace's AI-credit ledger (app/billing.py): a spend
    (negative ``amount_usd``, estimated from the provider's tokens / seconds)
    or a grant (positive). The balance is the plan's monthly credit plus the
    sum of this month's entries, so it refills on the 1st with no cron job.
    Deliberately not in app/registry.py — nobody edits credit over the API."""

    __tablename__ = "credit_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True
    )
    # "text" | "image" | "video" | "grant"
    kind: Mapped[str] = mapped_column(String(12))
    amount_usd: Mapped[float] = mapped_column(Numeric(12, 6))
    model: Mapped[str] = mapped_column(String(80), default="", server_default="")
    tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    note: Mapped[str] = mapped_column(String(300), default="", server_default="")
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("generation_jobs.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class Brand(Base, TimestampMixin):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    lang: Mapped[str] = mapped_column(String(60), default="")
    note: Mapped[str] = mapped_column(String(200), default="")
    # A few real captions in this brand's voice — content_ai.py shows them to
    # the model as a style reference (style only, never a source of facts).
    voice_examples: Mapped[str] = mapped_column(Text, default="", server_default="")

    channels: Mapped[list[Channel]] = relationship(
        back_populates="brand", cascade="all, delete-orphan"
    )


class Platform(Base, TimestampMixin):
    __tablename__ = "platforms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(60))
    char_limit: Mapped[int] = mapped_column(Integer, default=2200)
    supports_title: Mapped[bool] = mapped_column(Boolean, default=False)
    post_as: Mapped[str] = mapped_column(String(80), default="")


class Channel(Base, TimestampMixin):
    __tablename__ = "channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(
        ForeignKey("brands.id", ondelete="CASCADE"), index=True
    )
    platform_id: Mapped[int] = mapped_column(
        ForeignKey("platforms.id", ondelete="RESTRICT"), index=True
    )
    handle: Mapped[str] = mapped_column(String(120), default="")
    # live | soon | off
    status: Mapped[str] = mapped_column(String(12), default="off")
    token_note: Mapped[str] = mapped_column(String(160), default="")
    last_post_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Per-platform delivery credentials / settings, e.g. for Telegram:
    #   {"bot_token": "123:ABC", "chat_id": "@my_channel", "parse_mode": "HTML"}
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )

    brand: Mapped[Brand] = relationship(back_populates="channels")
    platform: Mapped[Platform] = relationship()


class Video(Base, TimestampMixin):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    brand_id: Mapped[int | None] = mapped_column(
        ForeignKey("brands.id", ondelete="SET NULL"), nullable=True, index=True
    )
    filename: Mapped[str] = mapped_column(String(200))
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    resolution: Mapped[str] = mapped_column(String(20), default="1080x1920")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(120), default="")
    tag: Mapped[str] = mapped_column(String(80), default="")
    # Publicly reachable URL — when set, Telegram posts send the video itself.
    url: Mapped[str] = mapped_column(String(500), default="", server_default="")


class MediaBlob(Base, TimestampMixin):
    """The raw bytes behind a ``/media/<name>`` url.

    Kept in the database so uploaded and AI-generated assets survive a redeploy
    or a wiped disk. Written by ``app/media.py`` and ``app/video.py``; served by
    ``GET /media/<name>``.
    """

    __tablename__ = "media_blobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    content_type: Mapped[str] = mapped_column(
        String(120), default="application/octet-stream",
        server_default="application/octet-stream",
    )
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class Post(Base, TimestampMixin):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True)
    video_id: Mapped[int | None] = mapped_column(
        ForeignKey("videos.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), default="")
    # draft | scheduled | posted
    status: Mapped[str] = mapped_column(String(12), default="draft")

    targets: Mapped[list[PostTarget]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )


class PostTarget(Base, TimestampMixin):
    __tablename__ = "post_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), index=True
    )
    channel_id: Mapped[int] = mapped_column(
        ForeignKey("channels.id", ondelete="CASCADE"), index=True
    )
    caption: Mapped[str] = mapped_column(Text, default="")
    title: Mapped[str] = mapped_column(String(200), default="")
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # queued | posted | failed
    status: Mapped[str] = mapped_column(String(12), default="queued")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Provider message id on success, or the failure reason.
    external_id: Mapped[str] = mapped_column(String(120), default="", server_default="")
    error: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Per-platform posting choices that don't fit the generic fields above —
    # currently just TikTok Direct Post's required privacy/interaction/
    # disclosure settings, e.g. {"tiktok": {"privacy_level": "SELF_ONLY",
    # "disable_duet": false, "disable_comment": false, "disable_stitch": false,
    # "brand_content_toggle": false, "brand_organic_toggle": false}}. Ignored
    # entirely by every platform except TikTok's Direct Post path
    # (app/publishers.py); harmless if absent (Upload-flow TikTok, and every
    # other platform, don't read it).
    platform_options: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )

    post: Mapped[Post] = relationship(back_populates="targets")
    channel: Mapped[Channel] = relationship()


class Draft(Base, TimestampMixin):
    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    # Why this angle — the AI's reasoning, shown alongside the caption on review.
    insight: Mapped[str] = mapped_column(Text, default="", server_default="")
    # The calendar day this idea is slotted for (app/content_scheduler.py sets
    # this to the Phnom Penh day it was written for; null for hand-made drafts).
    planned_for: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    length_seconds: Mapped[int] = mapped_column(Integer, default=0)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    source: Mapped[str] = mapped_column(String(120), default="")
    # waiting | approved | rejected | scheduled ("scheduled" = auto-media
    # turned this idea into a real Post automatically — see content_scheduler.py)
    status: Mapped[str] = mapped_column(String(12), default="waiting")
    # Set when Automation.auto_media generated an image/video for this idea.
    video_id: Mapped[int | None] = mapped_column(
        ForeignKey("videos.id", ondelete="SET NULL"), nullable=True
    )
    # The AI's own 0-100 self-check of how well this idea is grounded in the
    # brand's real product facts — null for hand-made drafts.
    fit_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Claims the automatic fact-check couldn't find in the brand's product
    # info (content_ai.fact_check). Empty list = checked, nothing flagged;
    # null = not checked (hand-made draft, or the check itself failed).
    fact_issues: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)


class GenerationJob(Base, TimestampMixin):
    """An AI-agent request to render a video from a prompt.

    Created when the user hits "Generate video"; polled until the provider
    (Azure Sora by default) finishes, then linked to the resulting ``Video``.
    """

    __tablename__ = "generation_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    brand_id: Mapped[int | None] = mapped_column(
        ForeignKey("brands.id", ondelete="SET NULL"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(12), default="video")
    # Who asked for it — they get the "your image/video is ready" push.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    prompt: Mapped[str] = mapped_column(Text, default="")
    aspect_ratio: Mapped[str] = mapped_column(String(8), default="9:16")
    seconds: Mapped[int] = mapped_column(Integer, default=8)
    # Provider token usage for this render (0 when the provider doesn't report it).
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    provider: Mapped[str] = mapped_column(String(40), default="", server_default="")
    provider_job_id: Mapped[str] = mapped_column(String(120), default="", server_default="")
    # queued | running | succeeded | failed
    status: Mapped[str] = mapped_column(String(12), default="queued")
    error: Mapped[str] = mapped_column(Text, default="", server_default="")
    video_id: Mapped[int | None] = mapped_column(
        ForeignKey("videos.id", ondelete="SET NULL"), nullable=True
    )

    video: Mapped[Video | None] = relationship()


class Automation(Base, TimestampMixin):
    __tablename__ = "automations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(
        ForeignKey("brands.id", ondelete="CASCADE"), unique=True, index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    run_at: Mapped[time] = mapped_column(Time, default=time(5, 0))
    videos_per_day: Mapped[int] = mapped_column(Integer, default=1)
    topic_source: Mapped[str] = mapped_column(String(120), default="")
    require_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    # Phnom Penh calendar day this automation last generated its batch —
    # app/content_scheduler.py's guard against writing the same day twice.
    last_run_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Opt-in: also auto-generate media for each idea that passes its fit-score
    # check, and (once approved) schedule it as a real post automatically.
    auto_media: Mapped[bool] = mapped_column(Boolean, default=False)
    # Which of this brand's connected channels auto-scheduling is allowed to
    # post to — a list of Channel ids. Null/empty = every connected channel
    # (today's default). Set once the person curates it on the Auto-generate
    # page; a channel connected *after* that stays excluded until added by hand.
    auto_channel_ids: Mapped[list[int] | None] = mapped_column(JSONB, nullable=True)
    # Custom time auto-scheduled posts go out at, overriding the built-in
    # per-platform defaults (19:30 Facebook / 20:00 TikTok / 20:30 else — see
    # content_scheduler.py's _default_time_for). Null = keep those defaults.
    post_at: Mapped[time | None] = mapped_column(Time, nullable=True)
    # Learn from results (app/learning.py): feed what has worked for this
    # brand into the idea brief, and auto-schedule at its best-performing
    # hour when post_at isn't set. On by default; the page has a switch.
    learn_from_results: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)


@event.listens_for(Brand, "after_insert")
def _create_automation_for_new_brand(mapper, connection, target: Brand) -> None:
    """Every brand needs exactly one Automation row (the Auto-generate page
    reads Automation rows directly, with no fallback) — this keeps that true
    no matter how the Brand got created (the generic /brands POST endpoint,
    app/seed.py, a script, ...), instead of relying on every call site to
    remember it. Starts disabled — someone still has to opt in and set a
    schedule on the Auto-generate page."""
    connection.execute(
        Automation.__table__.insert().values(brand_id=target.id, enabled=False)
    )


class Product(Base, TimestampMixin):
    """A product/service/offer for a brand — what the daily content AI reads to
    write on-topic ideas (app/content_ai.py)."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    # Freeform bullet points — selling points, pricing, offers, audience notes.
    highlights: Mapped[str] = mapped_column(Text, default="")


class AgentChat(Base, TimestampMixin):
    """One saved AI Agent conversation (app/chats.py) — private to the person
    who had it. ``turns`` is the page's own thread (questions + answers,
    prompts + the generated media refs) stored as-is, so reopening it from
    History restores exactly what they saw."""

    __tablename__ = "agent_chats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("team_members.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200), default="New chat")
    turns: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]", nullable=False
    )


class PushSubscription(Base, TimestampMixin):
    """One browser / installed app that turned on push notifications
    (app/push.py). ``endpoint`` is the push service URL the browser gave us."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("team_members.id", ondelete="CASCADE"), index=True
    )
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    user_agent: Mapped[str] = mapped_column(String(300), default="", server_default="")


class UserSession(Base):
    """One signed-in device (app/sessions.py) — Settings → Security → Active
    sessions. Keyed by a SHA-256 of the session token (never the token
    itself); a row with ``revoked_at`` set turns that token away, which is how
    "Sign out" on another device works. Not in app/registry.py."""

    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256(token) hex
    user_id: Mapped[int] = mapped_column(
        ForeignKey("team_members.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ip: Mapped[str] = mapped_column(String(64), default="", server_default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="", server_default="")
    # "Phnom Penh, Phnom Penh, KH" — looked up once from the IP (ipwho.is).
    location: Mapped[str] = mapped_column(String(160), default="", server_default="")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class LoginEvent(Base):
    """One sign-in attempt (app/auth.py) — the Settings → Security login
    history. Never stores the password, right or wrong. ``workspace_id`` /
    ``user_id`` are set only when the typed email belongs to an account, so an
    attempt on an unknown email is recorded but shown to no workspace.
    Deliberately not in app/registry.py: no generic CRUD endpoint."""

    __tablename__ = "login_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    workspace_id: Mapped[int | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(160), index=True)  # as typed, lowercased
    # success | signup | wrong_password | unknown_email | disabled | blocked
    status: Mapped[str] = mapped_column(String(20))
    ip: Mapped[str] = mapped_column(String(64), default="", server_default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="", server_default="")


class MetricSnapshot(Base):
    """A post's (or a channel's) numbers at one moment — platforms only report
    "now", so saving readings over time is what lets Analytics chart how a post
    grew. ``target_id`` set = one post's metrics (likes/comments/shares/views/
    clicks); ``target_id`` null = channel-wide numbers (Telegram's member
    count). Written by app/views.py's record_snapshots (when Analytics loads,
    and every few hours by the background collector in app/scheduler.py).
    Not in app/registry.py: no generic CRUD endpoint."""

    __tablename__ = "metric_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    target_id: Mapped[int | None] = mapped_column(
        ForeignKey("post_targets.id", ondelete="CASCADE"), nullable=True, index=True
    )
    taken_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)


class WeeklyPlan(Base, TimestampMixin):
    """One brand's AI weekly report + plan (app/weekly.py) — last week's
    numbers vs the week before, and a day-by-day set of post ideas for the
    coming week that the person approves in one tap. ``report`` and ``items``
    are written by app/weekly.py and read as-is by the Weekly plan page.
    Not in app/registry.py: no generic CRUD endpoint."""

    __tablename__ = "weekly_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True)
    # First and last Phnom Penh day the plan's posts are spread over.
    starts_on: Mapped[date] = mapped_column(Date, index=True)
    ends_on: Mapped[date] = mapped_column(Date)
    # ready | approved | dismissed
    status: Mapped[str] = mapped_column(String(12), default="ready")
    report: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    # [{"key", "day": "YYYY-MM-DD", "title", "caption", "insight", "fit_score", "fact_issues"}]
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]", nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[int | None] = mapped_column(
        ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True
    )


class VideoStory(Base, TimestampMixin):
    """A longer video (15-60s) made scene by scene (app/story.py): the AI
    writes a storyboard, each scene renders as its own short clip (a
    GenerationJob of kind "scene" — the video model only makes 4-12s), and
    the clips are joined into one MP4 once the person approves.

    ``scenes``: [{"key", "seconds", "visual", "voiceover", "on_screen",
    "job_id": int | null, "state": "draft" | "pending" | "rendering" |
    "done" | "failed", "error"}]. Not in app/registry.py."""

    __tablename__ = "video_stories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    brand_id: Mapped[int | None] = mapped_column(
        ForeignKey("brands.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), default="")
    idea: Mapped[str] = mapped_column(Text, default="")
    # The shared look every scene's prompt starts with, so the clips match.
    style: Mapped[str] = mapped_column(Text, default="")
    aspect_ratio: Mapped[str] = mapped_column(String(8), default="9:16")
    # Voiceover language ("" = no voiceover, music and sound only).
    language: Mapped[str] = mapped_column(String(40), default="English")
    # draft | rendering | ready | combining | done | failed
    status: Mapped[str] = mapped_column(String(12), default="draft")
    scenes: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]", nullable=False)
    final_video_id: Mapped[int | None] = mapped_column(
        ForeignKey("videos.id", ondelete="SET NULL"), nullable=True
    )
    error: Mapped[str] = mapped_column(Text, default="", server_default="")


class TeamMember(Base, TimestampMixin):
    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    initials: Mapped[str] = mapped_column(String(4), default="")
    email: Mapped[str] = mapped_column(String(160), default="", index=True)
    location: Mapped[str] = mapped_column(String(120), default="")
    timezone: Mapped[str] = mapped_column(String(40), default="UTC+7")
    role: Mapped[str] = mapped_column(String(60), default="editor")
    # Per-person UI settings from Settings → Appearance / Notifications, e.g.
    # {"accent": "#1A6FC4", "reduce_motion": false, "notify": {"failed": true, ...},
    #  "desktop_alerts": true}. Free-form; the frontend owns the keys.
    preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )
    # Auth: this table doubles as the login principal.
    password_hash: Mapped[str] = mapped_column(String(255), default="", server_default="")
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
