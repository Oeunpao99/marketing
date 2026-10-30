"""The brand's logo in the corner of its videos (2026-10-30): "auto" (a see-through PNG on a
light template floats on the video, else a white card), "card" (always the white card) or
"none" (never a card)."""

import sqlalchemy as sa
from alembic import op

revision = "f6a7b8c9d0e3"
down_revision = "e5f6a7b8c9d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brands", sa.Column("logo_chip", sa.String(length=8), nullable=False, server_default="auto"))


def downgrade() -> None:
    op.drop_column("brands", "logo_chip")
