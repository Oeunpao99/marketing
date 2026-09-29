"""drafts.meme — a relatable idea's meme text + photo brief, so its image is
made as a meme poster (app/meme.py) whenever the draft gets its media."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a6b7c8d9e0f2"
down_revision = "f5a6b7c8d9e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("drafts", sa.Column("meme", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("drafts", "meme")
