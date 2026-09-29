"""websites — a brand's website and its latest health / SEO report
(app/website.py)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b7c8d9e0f1a3"
down_revision = "a6b7c8d9e0f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "websites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("domain", sa.String(253), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("history", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("alerted", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_websites_workspace_id", "websites", ["workspace_id"])
    op.create_index("ix_websites_brand_id", "websites", ["brand_id"], unique=True)
    op.create_index("ix_websites_checked_at", "websites", ["checked_at"])


def downgrade() -> None:
    op.drop_index("ix_websites_checked_at", table_name="websites")
    op.drop_index("ix_websites_brand_id", table_name="websites")
    op.drop_index("ix_websites_workspace_id", table_name="websites")
    op.drop_table("websites")
