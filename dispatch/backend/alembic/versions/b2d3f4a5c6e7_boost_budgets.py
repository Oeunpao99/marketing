"""A monthly boost budget per brand (2026-10-31): the amount a workspace owner / admin approves for a
brand's Facebook boosts each month; every new boost counts against it (app/boosts.py)."""

import sqlalchemy as sa
from alembic import op

revision = "b2d3f4a5c6e7"
down_revision = "a1c2e3f4b5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "boost_budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("monthly_usd", sa.Numeric(10, 2), nullable=False),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("brand_id", name="uq_boost_budgets_brand"),
    )
    op.create_index("ix_boost_budgets_workspace_id", "boost_budgets", ["workspace_id"])


def downgrade() -> None:
    op.drop_table("boost_budgets")
