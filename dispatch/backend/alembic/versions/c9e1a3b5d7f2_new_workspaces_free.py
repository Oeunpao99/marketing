"""New workspaces start on the Free plan (was Pro) — paid plans are bought with
KHQR now (app/payments.py). Only the column's default changes: existing
workspaces keep the plan they have."""

import sqlalchemy as sa
from alembic import op

revision = "c9e1a3b5d7f2"
down_revision = "b8d0f2a4c6e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("workspaces", "plan", existing_type=sa.String(length=20), server_default="free")


def downgrade() -> None:
    op.alter_column("workspaces", "plan", existing_type=sa.String(length=20), server_default="pro")
