"""automations.goal_mix (the brand's content-goal mix, app/goals.py) and
drafts.planned_time (the time a weekly plan item was shown for)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a2b3c4d5e6f8"
down_revision = "f1a2b3c4d5e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("automations", sa.Column("goal_mix", postgresql.JSONB(), nullable=True))
    op.add_column("drafts", sa.Column("planned_time", sa.String(length=5), nullable=True))


def downgrade() -> None:
    op.drop_column("drafts", "planned_time")
    op.drop_column("automations", "goal_mix")
