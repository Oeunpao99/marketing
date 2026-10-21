"""workspaces.credit_notice_month — the month ("2026-11") the "your monthly
credits are ready to claim" push last went to this workspace, so it goes once
a month (app/billing.py remind_claims)."""

import sqlalchemy as sa
from alembic import op

revision = "a7c3e9d21b54"
down_revision = "f167a8983666"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("credit_notice_month", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("workspaces", "credit_notice_month")
