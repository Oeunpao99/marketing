"""media_blobs.stored + data nullable — a file can live in Azure Blob Storage
(stored = "azure", data emptied) instead of the database (app/blobstore.py)."""

import sqlalchemy as sa
from alembic import op

revision = "a6c8e0f2b4d1"
down_revision = "f4b0d6e8a2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("media_blobs", sa.Column("stored", sa.String(length=8), nullable=False, server_default=""))
    op.alter_column("media_blobs", "data", existing_type=sa.LargeBinary(), nullable=True)


def downgrade() -> None:
    # files moved to Blob Storage have no bytes here — bring them back first (python -m app.move_media --back)
    op.alter_column("media_blobs", "data", existing_type=sa.LargeBinary(), nullable=False)
    op.drop_column("media_blobs", "stored")
