"""generation_jobs.making — a Remotion video's "How it was made" (JSON): the
template, voice and each scene's words, spoken line, start and voice clip."""

import sqlalchemy as sa
from alembic import op

revision = "7b2c3d4e5f6a"
down_revision = "6a1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("generation_jobs", sa.Column("making", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("generation_jobs", "making")
