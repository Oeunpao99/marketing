"""automations.plan_every — the AI plans the next week ("week") or just
tomorrow ("day"), app/weekly.py."""

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


def downgrade() -> None:
    op.drop_column("automations", "plan_every")
