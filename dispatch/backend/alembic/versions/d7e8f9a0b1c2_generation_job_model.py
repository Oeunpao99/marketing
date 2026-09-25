"""generation_jobs.model — the model a render used, so billing prices it right."""

import sqlalchemy as sa
from alembic import op

revision = "d7e8f9a0b1c2"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("generation_jobs", sa.Column("model", sa.String(80), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("generation_jobs", "model")
