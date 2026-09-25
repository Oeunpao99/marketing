"""video_stories — longer videos made scene by scene and joined (app/story.py)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a4b5c6d7e8f9"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "video_stories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False, server_default=""),
        sa.Column("idea", sa.Text(), nullable=False, server_default=""),
        sa.Column("style", sa.Text(), nullable=False, server_default=""),
        sa.Column("aspect_ratio", sa.String(8), nullable=False, server_default="9:16"),
        sa.Column("language", sa.String(40), nullable=False, server_default="English"),
        sa.Column("status", sa.String(12), nullable=False, server_default="draft"),
        sa.Column("scenes", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("final_video_id", sa.Integer(), sa.ForeignKey("videos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_video_stories_workspace_id", "video_stories", ["workspace_id"])
    op.create_index("ix_video_stories_brand_id", "video_stories", ["brand_id"])


def downgrade() -> None:
    op.drop_table("video_stories")
