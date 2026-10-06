"""Sales alerts on Telegram: the workspace's sales group (+ its one-time link
code) and each sales rep's Telegram @username."""

import sqlalchemy as sa
from alembic import op

revision = "a7b8c9d0e1f3"
down_revision = "e6f7a8b9c0d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("sales_tg_chat_id", sa.String(length=40), nullable=True))
    op.add_column("workspaces", sa.Column("sales_tg_title", sa.String(length=200), nullable=False, server_default=""))
    op.add_column("workspaces", sa.Column("sales_tg_code", sa.String(length=12), nullable=True))
    op.add_column("sales_reps", sa.Column("telegram", sa.String(length=64), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("sales_reps", "telegram")
    op.drop_column("workspaces", "sales_tg_code")
    op.drop_column("workspaces", "sales_tg_title")
    op.drop_column("workspaces", "sales_tg_chat_id")
