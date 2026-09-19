"""Auto-generate: Automation.auto_media, Draft.video_id + fit_score."""

import sqlalchemy as sa
from alembic import op

revision = "a7b8c9d0e1f2"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "automations",
        sa.Column("auto_media", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("drafts", sa.Column("video_id", sa.Integer(), nullable=True))
    op.add_column("drafts", sa.Column("fit_score", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_drafts_video_id_videos", "drafts", "videos", ["video_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_drafts_video_id_videos", "drafts", type_="foreignkey")
    op.drop_column("drafts", "fit_score")
    op.drop_column("drafts", "video_id")
    op.drop_column("automations", "auto_media")
