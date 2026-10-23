"""Plan payments by KHQR (app/payments.py): the payments table, and
workspaces.plan_paid_until — when a paid plan goes back to Free."""

import sqlalchemy as sa
from alembic import op

revision = "b8d0f2a4c6e1"
down_revision = "a6c8e0f2b4d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("plan_paid_until", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("plan", sa.String(length=20), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("bill_number", sa.String(length=25), nullable=False, unique=True),
        sa.Column("qr", sa.Text(), nullable=False),
        sa.Column("md5", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bakong_hash", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("from_account", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_payments_workspace_id", "payments", ["workspace_id"])
    op.create_index("ix_payments_md5", "payments", ["md5"])
    op.create_index("ix_payments_status", "payments", ["status"])


def downgrade() -> None:
    op.drop_index("ix_payments_status", table_name="payments")
    op.drop_index("ix_payments_md5", table_name="payments")
    op.drop_index("ix_payments_workspace_id", table_name="payments")
    op.drop_table("payments")
    op.drop_column("workspaces", "plan_paid_until")
