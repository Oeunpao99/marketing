"""generation_jobs.user_id — who asked, for the "ready" push notification."""

import sqlalchemy as sa
from alembic import op

revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generation_jobs",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_generation_jobs_user_id", "generation_jobs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_generation_jobs_user_id", table_name="generation_jobs")
    op.drop_column("generation_jobs", "user_id")
