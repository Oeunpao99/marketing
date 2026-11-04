"""A brand keeps several logos (2026-11-04): brands.main_logo_id is the main one — posters,
memes and videos use it unless a video picks another. Existing brands: null = their one logo."""

import sqlalchemy as sa
from alembic import op

revision = "c4e6a8b0d2f3"
down_revision = "b3d5f7a9c1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brands", sa.Column("main_logo_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("brands", "main_logo_id")
