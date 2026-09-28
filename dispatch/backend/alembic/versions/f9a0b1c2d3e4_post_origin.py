"""posts.origin — "contentflow" for posts made here, "native" for posts
imported from a connected Page (made directly on Facebook / Instagram)."""

import sqlalchemy as sa
from alembic import op

revision = "f9a0b1c2d3e4"
down_revision = "e8f9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("origin", sa.String(20), nullable=False, server_default="contentflow"))


def downgrade() -> None:
    op.drop_column("posts", "origin")
