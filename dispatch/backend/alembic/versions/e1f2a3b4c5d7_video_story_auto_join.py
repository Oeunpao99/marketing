"""video_stories.auto_join — a weekly plan's video joins its clips by itself
once every scene is done (app/story.py, app/weekly.py).

IF NOT EXISTS: an earlier version of d0e1f2a3b4c6 added this column too, and
some databases (production) ran that version — this must work on both."""

from alembic import op

revision = "e1f2a3b4c5d7"
down_revision = "d0e1f2a3b4c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE video_stories ADD COLUMN IF NOT EXISTS auto_join BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE video_stories DROP COLUMN IF EXISTS auto_join")
