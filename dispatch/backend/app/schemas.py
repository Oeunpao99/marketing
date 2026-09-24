"""Pydantic v2 schemas: one Read / Create / Update trio per model."""

from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

SECRET_CONFIG_KEYS = {
    "bot_token", "token", "secret", "password", "api_key", "access_token", "client_secret",
    "refresh_token",
}


def redact_config(cfg: dict | None) -> dict:
    """Mask secret-looking values so tokens never leave the API in read responses."""
    return {
        k: ("***" if k.lower() in SECRET_CONFIG_KEYS and v else v)
        for k, v in (cfg or {}).items()
    }

ChannelStatus = Literal["live", "soon", "off"]
PostStatus = Literal["draft", "scheduled", "posted"]
TargetStatus = Literal["queued", "posted", "failed"]
DraftStatus = Literal["waiting", "approved", "rejected", "scheduled"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TimestampsOut(ORMModel):
    id: int
    created_at: datetime
    updated_at: datetime


# ── Brand ────────────────────────────────────────────────────────────────
class BrandBase(BaseModel):
    slug: str
    name: str
    lang: str = ""
    note: str = ""
    # A few real captions in this brand's voice — the AI matches their style.
    voice_examples: str = ""


class BrandCreate(BrandBase):
    pass


class BrandUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    lang: str | None = None
    note: str | None = None
    voice_examples: str | None = None


class BrandOut(TimestampsOut, BrandBase):
    pass


# ── Platform ─────────────────────────────────────────────────────────────
class PlatformBase(BaseModel):
    slug: str
    name: str
    char_limit: int = 2200
    supports_title: bool = False
    post_as: str = ""


class PlatformCreate(PlatformBase):
    pass


class PlatformUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    char_limit: int | None = None
    supports_title: bool | None = None
    post_as: str | None = None


class PlatformOut(TimestampsOut, PlatformBase):
    pass


# ── Channel ──────────────────────────────────────────────────────────────
class ChannelBase(BaseModel):
    brand_id: int
    platform_id: int
    handle: str = ""
    status: ChannelStatus = "off"
    token_note: str = ""
    last_post_at: datetime | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class ChannelCreate(ChannelBase):
    pass


class ChannelUpdate(BaseModel):
    brand_id: int | None = None
    platform_id: int | None = None
    handle: str | None = None
    status: ChannelStatus | None = None
    token_note: str | None = None
    last_post_at: datetime | None = None
    config: dict[str, Any] | None = None


class ChannelOut(TimestampsOut, ChannelBase):
    @field_serializer("config")
    def _redact_config(self, cfg: dict[str, Any]) -> dict[str, Any]:
        return redact_config(cfg)


# ── Video ────────────────────────────────────────────────────────────────
class VideoBase(BaseModel):
    brand_id: int | None = None
    filename: str
    duration_seconds: int = 0
    resolution: str = "1080x1920"
    size_bytes: int = 0
    source: str = ""
    tag: str = ""
    url: str = ""


class VideoCreate(VideoBase):
    pass


class VideoUpdate(BaseModel):
    brand_id: int | None = None
    filename: str | None = None
    duration_seconds: int | None = None
    resolution: str | None = None
    size_bytes: int | None = None
    source: str | None = None
    tag: str | None = None
    url: str | None = None


class VideoOut(TimestampsOut, VideoBase):
    pass


# ── GenerationJob ────────────────────────────────────────────────────────
GenerationStatus = Literal["queued", "running", "succeeded", "failed"]


class GenerationJobBase(BaseModel):
    brand_id: int | None = None
    kind: str = "video"
    prompt: str = ""
    aspect_ratio: str = "9:16"
    seconds: int = 8
    provider: str = ""
    provider_job_id: str = ""
    status: GenerationStatus = "queued"
    error: str = ""
    video_id: int | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class GenerationJobCreate(GenerationJobBase):
    pass


class GenerationJobUpdate(BaseModel):
    status: GenerationStatus | None = None
    error: str | None = None
    video_id: int | None = None


class GenerationJobOut(TimestampsOut, GenerationJobBase):
    pass


# ── Post ─────────────────────────────────────────────────────────────────
class PostBase(BaseModel):
    brand_id: int
    video_id: int | None = None
    title: str = ""
    status: PostStatus = "draft"


class PostCreate(PostBase):
    pass


class PostUpdate(BaseModel):
    brand_id: int | None = None
    video_id: int | None = None
    title: str | None = None
    status: PostStatus | None = None


class PostOut(TimestampsOut, PostBase):
    pass


# ── PostTarget ───────────────────────────────────────────────────────────
class PostTargetBase(BaseModel):
    post_id: int
    channel_id: int
    caption: str = ""
    title: str = ""
    scheduled_for: datetime | None = None
    status: TargetStatus = "queued"
    # Per-platform posting choices — currently only TikTok Direct Post reads
    # this, e.g. {"tiktok": {"privacy_level": "SELF_ONLY", ...}}.
    platform_options: dict[str, Any] = Field(default_factory=dict)


class PostTargetCreate(PostTargetBase):
    pass


class PostTargetUpdate(BaseModel):
    post_id: int | None = None
    channel_id: int | None = None
    caption: str | None = None
    title: str | None = None
    scheduled_for: datetime | None = None
    status: TargetStatus | None = None
    platform_options: dict[str, Any] | None = None


class PostTargetOut(TimestampsOut, PostTargetBase):
    published_at: datetime | None = None
    external_id: str = ""
    error: str = ""


# ── Draft ────────────────────────────────────────────────────────────────
class DraftBase(BaseModel):
    brand_id: int
    title: str
    body: str = ""
    insight: str = ""
    planned_for: date | None = None
    length_seconds: int = 0
    source: str = ""
    status: DraftStatus = "waiting"
    # Set when auto-generated media (Automation.auto_media) attached an image/
    # video to this idea — approving a draft with one schedules it as a real
    # post instead of just flipping its status. Null for a text-only draft.
    video_id: int | None = None
    # The AI's own 0-100 self-check of how well this idea is grounded in the
    # brand's real product facts (app/content_ai.py) — null for hand-made drafts.
    fit_score: int | None = None
    # Claims in the caption the fact-check couldn't find in the product info.
    fact_issues: list[str] | None = None


class DraftCreate(DraftBase):
    generated_at: datetime | None = None


class DraftUpdate(BaseModel):
    brand_id: int | None = None
    title: str | None = None
    body: str | None = None
    insight: str | None = None
    planned_for: date | None = None
    length_seconds: int | None = None
    source: str | None = None
    status: DraftStatus | None = None
    video_id: int | None = None
    fit_score: int | None = None


class DraftOut(TimestampsOut, DraftBase):
    generated_at: datetime


# ── Automation ───────────────────────────────────────────────────────────
class AutomationBase(BaseModel):
    brand_id: int
    enabled: bool = False
    run_at: time = Field(default=time(5, 0))
    videos_per_day: int = 1
    topic_source: str = ""
    require_approval: bool = True
    # Opt-in: after an idea passes its own fit-score check, also generate an
    # image for it and (once approved, or immediately if require_approval is
    # off) schedule it as a real post on the brand's connected channels —
    # see app/content_scheduler.py. Off by default since it spends real image
    # generation budget every run.
    auto_media: bool = False
    # Channel ids auto-scheduling may post to. None/empty = every connected
    # channel.
    auto_channel_ids: list[int] | None = None
    # Custom time auto-scheduled posts go out at. None = the built-in
    # per-platform defaults.
    post_at: time | None = None


class AutomationCreate(AutomationBase):
    pass


class AutomationUpdate(BaseModel):
    brand_id: int | None = None
    enabled: bool | None = None
    run_at: time | None = None
    videos_per_day: int | None = None
    topic_source: str | None = None
    require_approval: bool | None = None
    auto_media: bool | None = None
    auto_channel_ids: list[int] | None = None
    post_at: time | None = None


class AutomationOut(TimestampsOut, AutomationBase):
    last_run_on: date | None = None


# ── Product ──────────────────────────────────────────────────────────────
class ProductBase(BaseModel):
    brand_id: int
    name: str
    description: str = ""
    highlights: str = ""


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    brand_id: int | None = None
    name: str | None = None
    description: str | None = None
    highlights: str | None = None


class ProductOut(TimestampsOut, ProductBase):
    pass


# ── TeamMember ───────────────────────────────────────────────────────────
class TeamMemberBase(BaseModel):
    name: str
    initials: str = ""
    email: str = ""
    location: str = ""
    timezone: str = "UTC+7"
    role: str = "editor"


class TeamMemberCreate(TeamMemberBase):
    pass


class TeamMemberUpdate(BaseModel):
    name: str | None = None
    initials: str | None = None
    email: str | None = None
    location: str | None = None
    timezone: str | None = None
    role: str | None = None


class TeamMemberOut(TimestampsOut, TeamMemberBase):
    is_active: bool = True


# ── Auth ─────────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    # The new account's workspace (company / agency) name — defaults to
    # "<name>'s workspace" when left blank.
    workspace_name: str = Field(default="", max_length=120)
    email: str = Field(min_length=3, max_length=160)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(ORMModel):
    id: int
    workspace_id: int
    workspace_name: str = ""
    name: str
    email: str
    initials: str = ""
    location: str = ""
    timezone: str = "UTC+7"
    role: str = "editor"
    is_active: bool = True
    preferences: dict[str, Any] = Field(default_factory=dict)


class WorkspaceUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class AuthOut(BaseModel):
    token: str
    user: UserOut
