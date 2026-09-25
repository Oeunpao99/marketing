"""AI credit: workspaces.plan + credit_entries ledger (app/billing.py)."""

import sqlalchemy as sa
from alembic import op

revision = "b5c6d7e8f9a0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("plan", sa.String(20), nullable=False, server_default="pro"))
    op.create_table(
        "credit_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("amount_usd", sa.Numeric(12, 6), nullable=False),
        sa.Column("model", sa.String(80), nullable=False, server_default=""),
        sa.Column("tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.String(300), nullable=False, server_default=""),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("generation_jobs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_credit_entries_workspace_id", "credit_entries", ["workspace_id"])
    op.create_index("ix_credit_entries_created_at", "credit_entries", ["created_at"])


def downgrade() -> None:
    op.drop_table("credit_entries")
    op.drop_column("workspaces", "plan")
