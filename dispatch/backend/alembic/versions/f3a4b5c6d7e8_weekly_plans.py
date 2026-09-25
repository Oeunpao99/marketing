"""weekly_plans — the AI weekly report + one-tap-approve plan (app/weekly.py)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weekly_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="ready"),
        sa.Column("report", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("items", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "approved_by", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_weekly_plans_brand_id", "weekly_plans", ["brand_id"])
    op.create_index("ix_weekly_plans_starts_on", "weekly_plans", ["starts_on"])


def downgrade() -> None:
    op.drop_table("weekly_plans")
