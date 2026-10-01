"""activity_plans — a brand's weekly goals + the team's day-by-day to-do list
(app/activity.py)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e0f1a2b3c4d6"
down_revision = "d9e0f1a2b3c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activity_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("goals", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("focus", sa.String(400), nullable=False, server_default=""),
        sa.Column("tasks", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("brand_id", "week_start", name="uq_activity_plan_brand_week"),
    )
    op.create_index("ix_activity_plans_brand_id", "activity_plans", ["brand_id"])
    op.create_index("ix_activity_plans_week_start", "activity_plans", ["week_start"])


def downgrade() -> None:
    op.drop_index("ix_activity_plans_week_start", table_name="activity_plans")
    op.drop_index("ix_activity_plans_brand_id", table_name="activity_plans")
    op.drop_table("activity_plans")
