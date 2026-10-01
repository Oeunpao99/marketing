"""drafts.subject + posts.subject — which of the person's "Subjects to write
about" (Automation.subjects) an AI idea was written on, so learning.py can
tell which subjects get engagement and content_ai.pick_subjects can favour them.
Plus drafts.poster — the text for an idea's topic poster (app/poster.py)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c8d9e0f1a2b4"
down_revision = "b7c8d9e0f1a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("drafts", sa.Column("subject", sa.String(80), nullable=False, server_default=""))
    op.add_column("posts", sa.Column("subject", sa.String(80), nullable=False, server_default=""))
    op.add_column("drafts", sa.Column("poster", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("drafts", "poster")
    op.drop_column("posts", "subject")
    op.drop_column("drafts", "subject")
