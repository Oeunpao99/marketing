"""workspaces.gemini_key_enc / gemini_key_hint — a workspace's own Gemini key
(encrypted) for the Khmer voice when the platform's key is out."""

import sqlalchemy as sa
from alembic import op

revision = "9d4e5f6a7b8c"
down_revision = "8c3d4e5f6a7b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("gemini_key_enc", sa.Text(), nullable=True))
    op.add_column("workspaces", sa.Column("gemini_key_hint", sa.String(8), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("workspaces", "gemini_key_hint")
    op.drop_column("workspaces", "gemini_key_enc")
