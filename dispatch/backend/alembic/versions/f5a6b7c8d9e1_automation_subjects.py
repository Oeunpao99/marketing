"""automations.subjects — the subjects the AI rotates through when it writes
ideas (Auto-generate settings → "Subjects to write about")."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f5a6b7c8d9e1"
down_revision = "e4f5a6b7c8d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("automations", sa.Column("subjects", postgresql.JSONB(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("automations", "subjects")
