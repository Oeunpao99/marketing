"""Each browser's own id on its sessions (2026-11-03): "new device signed in" now
also catches another computer with the same browser and system (app/sessions.py)."""

import sqlalchemy as sa
from alembic import op

revision = "a7f1c3e5d9b2"
down_revision = "f6b7c8d9e0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_sessions", sa.Column("device_id", sa.String(64), server_default="", nullable=False))


def downgrade() -> None:
    op.drop_column("user_sessions", "device_id")
