"""Extra videos / images the team gives a workspace for its month (the admin portal's
"Give extra videos & images") — on the grant's own credit entry (app/usage.py extra)."""

import sqlalchemy as sa
from alembic import op

revision = "d4e5f6a7b8c1"
down_revision = "c3d4e5f6a7b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("credit_entries", sa.Column("videos", sa.Integer(), server_default="0", nullable=False))
    op.add_column("credit_entries", sa.Column("images", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("credit_entries", "images")
    op.drop_column("credit_entries", "videos")
