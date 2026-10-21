"""workspaces.activity_hidden_before — Settings → Billing → "Clear older
history": credit activity before this moment is hidden from the workspace's
list (the ledger rows themselves stay, for the admin portal)."""

import sqlalchemy as sa
from alembic import op

revision = "b4d8e2f6a913"
down_revision = "a7c3e9d21b54"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("activity_hidden_before", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("workspaces", "activity_hidden_before")
