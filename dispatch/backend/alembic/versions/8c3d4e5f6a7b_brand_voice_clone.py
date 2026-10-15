"""brands.voice_clone — the brand's own voice for its videos (app/voice_clone.py):
its recording, voice fingerprint and status, as JSON."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "8c3d4e5f6a7b"
down_revision = "7b2c3d4e5f6a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "brands",
        sa.Column("voice_clone", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("brands", "voice_clone")
