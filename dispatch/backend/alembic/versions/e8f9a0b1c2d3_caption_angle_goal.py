"""drafts.angle/goal + posts.angle — the marketing angle an AI caption was
written with, so learning.py can tell which angles work for a brand."""

import sqlalchemy as sa
from alembic import op

revision = "e8f9a0b1c2d3"
down_revision = "d7e8f9a0b1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("drafts", sa.Column("angle", sa.String(30), nullable=False, server_default=""))
    op.add_column("drafts", sa.Column("goal", sa.String(20), nullable=False, server_default=""))
    op.add_column("posts", sa.Column("angle", sa.String(30), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("posts", "angle")
    op.drop_column("drafts", "goal")
    op.drop_column("drafts", "angle")
