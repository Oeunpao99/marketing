"""edit_projects — the video editor's saved timelines (app/editor.py)."""

import sqlalchemy as sa
from alembic import op

revision = "e3a9c5d7f1b2"
down_revision = "d2f8a6c4e1b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "edit_projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("ratio", sa.String(length=8), nullable=False),
        sa.Column("data", sa.Text(), nullable=False, server_default=""),
        sa.Column("seconds", sa.Numeric(8, 2), nullable=False),
        sa.Column("cover", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("video_id", sa.Integer(), sa.ForeignKey("videos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_edit_projects_workspace_id", "edit_projects", ["workspace_id"])
    op.create_index("ix_edit_projects_brand_id", "edit_projects", ["brand_id"])


def downgrade() -> None:
    op.drop_index("ix_edit_projects_brand_id", table_name="edit_projects")
    op.drop_index("ix_edit_projects_workspace_id", table_name="edit_projects")
    op.drop_table("edit_projects")
