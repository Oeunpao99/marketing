"""A phone number per person (2026-11-03): asked at sign-up so our team can call
to help them get started (app/auth.py)."""

import sqlalchemy as sa
from alembic import op

revision = "e5a6b7c8d9f0"
down_revision = "d4f5a6b7c8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("team_members", sa.Column("phone", sa.String(32), server_default="", nullable=False))


def downgrade() -> None:
    op.drop_column("team_members", "phone")
