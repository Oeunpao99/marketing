"""automations.plan_every — the AI plans the next week ("week") or just
tomorrow ("day"), app/weekly.py — and video_stories.auto_join (a plan's
video joins its clips by itself, app/story.py)."""

import sqlalchemy as sa
from alembic import op

revision = "d0e1f2a3b4c6"
down_revision = "c9d0e1f2a3b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "automations",
        sa.Column("plan_every", sa.String(length=8), nullable=False, server_default="week"),
    )
    op.add_column(
        "video_stories",
        sa.Column("auto_join", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("video_stories", "auto_join")
    op.drop_column("automations", "plan_every")
