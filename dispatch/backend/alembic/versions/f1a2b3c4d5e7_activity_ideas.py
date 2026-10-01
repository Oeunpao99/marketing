"""activity_plans.ideas — the week's product content ideas (app/activity.py):
the plan is built around making the brand's products spread."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f1a2b3c4d5e7"
down_revision = "e0f1a2b3c4d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activity_plans", sa.Column("ideas", postgresql.JSONB(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("activity_plans", "ideas")
