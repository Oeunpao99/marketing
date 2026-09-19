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


class Brand(Base, TimestampMixin):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    lang: Mapped[str] = mapped_column(String(60), default="")
    note: Mapped[str] = mapped_column(String(200), default="")

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
    # waiting | approved | rejected
    status: Mapped[str] = mapped_column(String(12), default="waiting")


class GenerationJob(Base, TimestampMixin):
    """An AI-agent request to render a video from a prompt.

    Created when the user hits "Generate video"; polled until the provider
    (Azure Sora by default) finishes, then linked to the resulting ``Video``.
    """

    __tablename__ = "generation_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int | None] = mapped_column(
        ForeignKey("brands.id", ondelete="SET NULL"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(12), default="video")
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


class TeamMember(Base, TimestampMixin):
    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    initials: Mapped[str] = mapped_column(String(4), default="")
    email: Mapped[str] = mapped_column(String(160), default="", index=True)
    location: Mapped[str] = mapped_column(String(120), default="")
    timezone: Mapped[str] = mapped_column(String(40), default="UTC+7")
    role: Mapped[str] = mapped_column(String(60), default="editor")
    # Auth: this table doubles as the login principal.
    password_hash: Mapped[str] = mapped_column(String(255), default="", server_default="")
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
