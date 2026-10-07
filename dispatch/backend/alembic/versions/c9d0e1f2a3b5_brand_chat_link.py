"""brands.chat_telegram / chat_messenger / chat_label — the chat link added
to every post when it is published, with the post's code (?start=P123)."""

import sqlalchemy as sa
from alembic import op

revision = "c9d0e1f2a3b5"
down_revision = "b8c9d0e1f2a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brands", sa.Column("chat_telegram", sa.String(length=64), nullable=False, server_default=""))
    op.add_column("brands", sa.Column("chat_messenger", sa.String(length=100), nullable=False, server_default=""))
    op.add_column("brands", sa.Column("chat_label", sa.String(length=80), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("brands", "chat_label")
    op.drop_column("brands", "chat_messenger")
    op.drop_column("brands", "chat_telegram")
