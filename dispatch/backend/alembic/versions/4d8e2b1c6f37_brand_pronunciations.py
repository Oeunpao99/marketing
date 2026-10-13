"""brands.pronunciations — how the voice-over says words a Khmer voice gets
wrong (brand and English names): [{"word", "say"}], app/khmer_speech.py."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "4d8e2b1c6f37"
down_revision = "3c7e1a9b5d24"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "brands",
        sa.Column("pronunciations", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("brands", "pronunciations")
