"""Share for approval (2026-11-05): approval_links — a finished video / picture sent to
the boss as an unguessable link (no account, no download); approve or ask for changes."""

import sqlalchemy as sa
from alembic import op

revision = "d5f7a9b1c3e5"
down_revision = "c4e6a8b0d2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "approval_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="SET NULL"), nullable=True),
        sa.Column("video_id", sa.Integer(), sa.ForeignKey("videos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("token", sa.String(48), nullable=False),
        sa.Column("caption", sa.Text(), nullable=False, server_default=""),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(12), nullable=False, server_default="pending"),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_approval_links_workspace_id", "approval_links", ["workspace_id"])
    op.create_index("ix_approval_links_video_id", "approval_links", ["video_id"])
    op.create_index("ix_approval_links_token", "approval_links", ["token"], unique=True)


def downgrade() -> None:
    op.drop_table("approval_links")
