"""Automation.auto_channel_ids + Automation.post_at (curated auto-posting)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b3c4d5e6f7a8"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "automations", sa.Column("auto_channel_ids", postgresql.JSONB(), nullable=True)
    )
    op.add_column("automations", sa.Column("post_at", sa.Time(), nullable=True))


def downgrade() -> None:
    op.drop_column("automations", "post_at")
    op.drop_column("automations", "auto_channel_ids")
