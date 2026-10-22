"""user_sessions.new_device / confirmed_at — the "new device signed in, was
this you?" alert (app/sessions.py)."""

import sqlalchemy as sa
from alembic import op

revision = "f4b0d6e8a2c3"
down_revision = "e3a9c5d7f1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_sessions", sa.Column("new_device", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("user_sessions", sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user_sessions", "confirmed_at")
    op.drop_column("user_sessions", "new_device")
