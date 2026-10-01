"""brands.note 200 → 2000 characters — the Create brand form's Description is a
multi-line box, and a longer description made the insert fail (a 500)."""

import sqlalchemy as sa
from alembic import op

revision = "d9e0f1a2b3c5"
down_revision = "c8d9e0f1a2b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("brands", "note", type_=sa.String(2000), existing_type=sa.String(200))


def downgrade() -> None:
    op.alter_column("brands", "note", type_=sa.String(200), existing_type=sa.String(2000))
