"""Customers close their own account (2026-11-03): when the owner closed it — it's
deleted for good 14 days later unless they sign in again (app/account_close.py)."""

import sqlalchemy as sa
from alembic import op

revision = "b3d5f7a9c1e2"
down_revision = "a7f1c3e5d9b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("closing_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("workspaces", "closing_at")
