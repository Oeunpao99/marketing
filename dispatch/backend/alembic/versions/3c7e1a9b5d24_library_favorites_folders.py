"""Library favorites + folders: videos.favorite, videos.folder_id and the
library_folders table (app/views.py library endpoints)."""

import sqlalchemy as sa
from alembic import op

revision = "3c7e1a9b5d24"
down_revision = "f2a3b4c5d6e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "library_folders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_library_folders_workspace_id", "library_folders", ["workspace_id"])
    op.add_column("videos", sa.Column("favorite", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column(
        "videos",
        sa.Column("folder_id", sa.Integer(), sa.ForeignKey("library_folders.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_videos_folder_id", "videos", ["folder_id"])


def downgrade() -> None:
    op.drop_index("ix_videos_folder_id", table_name="videos")
    op.drop_column("videos", "folder_id")
    op.drop_column("videos", "favorite")
    op.drop_index("ix_library_folders_workspace_id", table_name="library_folders")
    op.drop_table("library_folders")
