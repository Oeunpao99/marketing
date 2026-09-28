"""drafts.pillar + posts.pillar — the content pillar (content_ai.PILLARS) an
AI idea was written for, so learning.py can tell which topics work for a brand."""

import sqlalchemy as sa
from alembic import op

revision = "d3e4f5a6b7c9"
down_revision = "c2d3e4f5a6b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("drafts", sa.Column("pillar", sa.String(30), nullable=False, server_default=""))
    op.add_column("posts", sa.Column("pillar", sa.String(30), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("posts", "pillar")
    op.drop_column("drafts", "pillar")
