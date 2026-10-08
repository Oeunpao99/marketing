"""workspaces.suspended_at / suspended_reason — the platform admin portal
(/admin-mkt, app/admin.py) can suspend an account."""

import sqlalchemy as sa
from alembic import op

revision = "f2a3b4c5d6e8"
down_revision = "e1f2a3b4c5d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("workspaces", sa.Column("suspended_reason", sa.String(length=300), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("workspaces", "suspended_reason")
    op.drop_column("workspaces", "suspended_at")
