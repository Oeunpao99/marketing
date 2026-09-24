"""agent_chats — saved AI Agent conversations (History panel)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_chats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False, server_default="New chat"),
        sa.Column("turns", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_agent_chats_workspace_id", "agent_chats", ["workspace_id"])
    op.create_index("ix_agent_chats_user_id", "agent_chats", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_chats_user_id", table_name="agent_chats")
    op.drop_index("ix_agent_chats_workspace_id", table_name="agent_chats")
    op.drop_table("agent_chats")
