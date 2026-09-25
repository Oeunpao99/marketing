"""metric_snapshots — post/channel numbers over time for the Analytics charts."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "d1e2f3a4b5c6"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "metric_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel_id", sa.Integer(), sa.ForeignKey("channels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_id", sa.Integer(), sa.ForeignKey("post_targets.id", ondelete="CASCADE"), nullable=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("metrics", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_metric_snapshots_workspace_id", "metric_snapshots", ["workspace_id"])
    op.create_index("ix_metric_snapshots_channel_id", "metric_snapshots", ["channel_id"])
    op.create_index("ix_metric_snapshots_target_id", "metric_snapshots", ["target_id"])
    op.create_index("ix_metric_snapshots_taken_at", "metric_snapshots", ["taken_at"])


def downgrade() -> None:
    op.drop_table("metric_snapshots")
