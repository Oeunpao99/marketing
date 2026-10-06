"""posts.content_tags — what a published post is about, read by the AI (app/post_tags.py)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "d5e6f7a8b9c1"
down_revision = "c4d5e6f7a8b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("content_tags", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("posts", "content_tags")
