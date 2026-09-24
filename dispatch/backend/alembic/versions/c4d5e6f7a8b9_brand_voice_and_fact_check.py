"""Brand.voice_examples + Draft.fact_issues (Khmer voice + automatic fact-check)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c4d5e6f7a8b9"
down_revision = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brands", sa.Column("voice_examples", sa.Text(), nullable=False, server_default=""))
    op.add_column("drafts", sa.Column("fact_issues", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("drafts", "fact_issues")
    op.drop_column("brands", "voice_examples")
