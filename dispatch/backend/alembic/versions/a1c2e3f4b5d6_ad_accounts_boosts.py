"""Real Facebook boosts (2026-10-31): a brand's ad account (its encrypted
ads_management token) and each boost sent from the Insights page, with the
spend / reach read back from Facebook."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "a1c2e3f4b5d6"
down_revision = "f6a7b8c9d0e3"
branch_labels = None
depends_on = None


def _stamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "ad_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(length=12), nullable=False, server_default="meta"),
        sa.Column("account_id", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="USD"),
        sa.Column("token_enc", sa.Text(), nullable=False, server_default=""),
        sa.Column("connected_by", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
        *_stamps(),
    )
    op.create_index("ix_ad_accounts_workspace_id", "ad_accounts", ["workspace_id"])
    op.create_index("ix_ad_accounts_brand_id", "ad_accounts", ["brand_id"])
    op.create_table(
        "boosts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_id", sa.Integer(), sa.ForeignKey("post_targets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ad_account_id", sa.Integer(), sa.ForeignKey("ad_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("platform", sa.String(length=12), nullable=False, server_default="facebook"),
        sa.Column("budget_usd", sa.Numeric(10, 2), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="in_review"),
        sa.Column("campaign_id", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("adset_id", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("ad_id", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("spend_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("reach", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("engaged", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("daily", JSONB(), nullable=False, server_default="[]"),
        sa.Column("refreshed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
        *_stamps(),
    )
    op.create_index("ix_boosts_workspace_id", "boosts", ["workspace_id"])
    op.create_index("ix_boosts_brand_id", "boosts", ["brand_id"])
    op.create_index("ix_boosts_post_id", "boosts", ["post_id"])


def downgrade() -> None:
    op.drop_table("boosts")
    op.drop_table("ad_accounts")
