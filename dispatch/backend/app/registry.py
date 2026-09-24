"""Single source of truth for every model exposed by the API.

The frontend sidebar's "Data" section is built from ``/api/meta/models``, which
serializes this list -- so adding a model here makes it appear in the sidebar.
"""

from dataclasses import dataclass, field

from pydantic import BaseModel

from app import models, schemas
from app.database import Base


@dataclass(frozen=True)
class Resource:
    name: str            # URL slug (plural), e.g. "brands"
    label: str           # sidebar label, e.g. "Brands"
    singular: str        # e.g. "Brand"
    icon: str            # sidebar glyph
    group: str           # sidebar sub-heading
    model: type[Base]
    out_schema: type[BaseModel]
    create_schema: type[BaseModel]
    update_schema: type[BaseModel]
    order_by: str = "id"
    list_columns: list[str] = field(default_factory=list)
    # Shared, server-managed table (Platform): readable by everyone, no writes.
    read_only: bool = False
    # Only a workspace owner/admin may create/update/delete (team members).
    manager_only: bool = False


REGISTRY: list[Resource] = [
    Resource(
        name="brands", label="Brands", singular="Brand", icon="◆", group="Content",
        model=models.Brand, out_schema=schemas.BrandOut,
        create_schema=schemas.BrandCreate, update_schema=schemas.BrandUpdate,
        order_by="name", list_columns=["name", "slug", "lang", "note"],
    ),
    Resource(
        name="platforms", label="Platforms", singular="Platform", icon="⬗", group="Content",
        model=models.Platform, out_schema=schemas.PlatformOut,
        create_schema=schemas.PlatformCreate, update_schema=schemas.PlatformUpdate,
        order_by="name", list_columns=["name", "slug", "char_limit", "supports_title", "post_as"],
        read_only=True,
    ),
    Resource(
        name="channels", label="Channels", singular="Channel", icon="⇄", group="Content",
        model=models.Channel, out_schema=schemas.ChannelOut,
        create_schema=schemas.ChannelCreate, update_schema=schemas.ChannelUpdate,
        list_columns=["brand_id", "platform_id", "handle", "status", "token_note", "last_post_at"],
    ),
    Resource(
        name="videos", label="Videos", singular="Video", icon="▶", group="Content",
        model=models.Video, out_schema=schemas.VideoOut,
        create_schema=schemas.VideoCreate, update_schema=schemas.VideoUpdate,
        order_by="filename",
        list_columns=["filename", "brand_id", "duration_seconds", "size_bytes", "tag", "url"],
    ),
    Resource(
        name="generation-jobs", label="Generation jobs", singular="Generation job",
        icon="✦", group="Content",
        model=models.GenerationJob, out_schema=schemas.GenerationJobOut,
        create_schema=schemas.GenerationJobCreate, update_schema=schemas.GenerationJobUpdate,
        order_by="id",
        list_columns=["brand_id", "kind", "status", "aspect_ratio", "seconds",
                      "provider", "total_tokens", "video_id"],
    ),
    Resource(
        name="products", label="Products", singular="Product", icon="◇", group="Content",
        model=models.Product, out_schema=schemas.ProductOut,
        create_schema=schemas.ProductCreate, update_schema=schemas.ProductUpdate,
        order_by="name",
        list_columns=["brand_id", "name", "description", "highlights"],
    ),
    Resource(
        name="posts", label="Posts", singular="Post", icon="✎", group="Scheduling",
        model=models.Post, out_schema=schemas.PostOut,
        create_schema=schemas.PostCreate, update_schema=schemas.PostUpdate,
        list_columns=["title", "brand_id", "video_id", "status"],
    ),
    Resource(
        name="post-targets", label="Post targets", singular="Post target", icon="⊹",
        group="Scheduling",
        model=models.PostTarget, out_schema=schemas.PostTargetOut,
        create_schema=schemas.PostTargetCreate, update_schema=schemas.PostTargetUpdate,
        order_by="scheduled_for",
        list_columns=["post_id", "channel_id", "scheduled_for", "status", "published_at", "error"],
    ),
    Resource(
        name="drafts", label="Drafts", singular="Draft", icon="◈", group="Scheduling",
        model=models.Draft, out_schema=schemas.DraftOut,
        create_schema=schemas.DraftCreate, update_schema=schemas.DraftUpdate,
        order_by="generated_at",
        list_columns=["title", "brand_id", "length_seconds", "source", "status", "generated_at"],
    ),
    Resource(
        name="automations", label="Automations", singular="Automation", icon="⚙",
        group="Scheduling",
        model=models.Automation, out_schema=schemas.AutomationOut,
        create_schema=schemas.AutomationCreate, update_schema=schemas.AutomationUpdate,
        list_columns=["brand_id", "enabled", "run_at", "videos_per_day", "topic_source",
                      "require_approval"],
    ),
    Resource(
        name="team-members", label="Team members", singular="Team member", icon="◐", group="Team",
        model=models.TeamMember, out_schema=schemas.TeamMemberOut,
        create_schema=schemas.TeamMemberCreate, update_schema=schemas.TeamMemberUpdate,
        order_by="name",
        list_columns=["name", "initials", "email", "location", "timezone", "role"],
        manager_only=True,
    ),
]

BY_NAME: dict[str, Resource] = {r.name: r for r in REGISTRY}


def _field_type(annotation: object) -> str:
    text = str(annotation)
    if "datetime" in text:
        return "datetime"
    if "time" in text:
        return "time"
    if "bool" in text:
        return "boolean"
    if "int" in text:
        return "integer"
    return "string"


def resource_meta(r: Resource) -> dict:
    props = r.out_schema.model_json_schema().get("properties", {})
    fields = []
    for fname, finfo in r.out_schema.model_fields.items():
        fields.append(
            {
                "key": fname,
                "label": props.get(fname, {}).get("title") or fname.replace("_", " ").title(),
                "type": _field_type(finfo.annotation),
                "in_list": fname in r.list_columns,
            }
        )
    return {
        "name": r.name,
        "label": r.label,
        "singular": r.singular,
        "icon": r.icon,
        "group": r.group,
        "order_by": r.order_by,
        "list_columns": r.list_columns,
        "fields": fields,
    }


def registry_meta() -> list[dict]:
    return [resource_meta(r) for r in REGISTRY]
