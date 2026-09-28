"""team_members.access (per-editor feature access) and workspace_invites
(join links) — app/access.py, app/auth.py."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c2d3e4f5a6b8"
down_revision = "b1c2d3e4f5a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("team_members", sa.Column("access", postgresql.JSONB(), nullable=True))
    op.create_table(
        "workspace_invites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="editor"),
        sa.Column("access", postgresql.JSONB(), nullable=True),
        sa.Column("label", sa.String(120), nullable=False, server_default=""),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("uses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_workspace_invites_workspace_id", "workspace_invites", ["workspace_id"])
    op.create_index("ix_workspace_invites_token_hash", "workspace_invites", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_workspace_invites_token_hash", table_name="workspace_invites")
    op.drop_index("ix_workspace_invites_workspace_id", table_name="workspace_invites")
    op.drop_table("workspace_invites")
    op.drop_column("team_members", "access")
