"""video_stories.auto_join — a weekly plan's video joins its clips by itself
once every scene is done (app/story.py, app/weekly.py)."""

import sqlalchemy as sa
from alembic import op

revision = "e1f2a3b4c5d7"
down_revision = "d0e1f2a3b4c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "video_stories",
        sa.Column("auto_join", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("video_stories", "auto_join")
