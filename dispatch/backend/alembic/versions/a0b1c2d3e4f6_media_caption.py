"""videos.caption / caption_angle / caption_status — a ready-to-post caption
the AI writes for each generated image or video (app/media_caption.py)."""

import sqlalchemy as sa
from alembic import op

revision = "a0b1c2d3e4f6"
down_revision = "f9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("caption", sa.Text(), nullable=False, server_default=""))
    op.add_column("videos", sa.Column("caption_angle", sa.String(30), nullable=False, server_default=""))
    op.add_column("videos", sa.Column("caption_status", sa.String(12), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("videos", "caption_status")
    op.drop_column("videos", "caption_angle")
    op.drop_column("videos", "caption")
