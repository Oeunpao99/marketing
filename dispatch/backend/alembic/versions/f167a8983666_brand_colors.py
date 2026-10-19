"""brands.colors — the brand's own colours (main first), read from its logo and
editable in the Brand kit; videos and posters use them."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f167a8983666"
down_revision = "9d4e5f6a7b8c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "brands",
        sa.Column("colors", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("brands", "colors")
