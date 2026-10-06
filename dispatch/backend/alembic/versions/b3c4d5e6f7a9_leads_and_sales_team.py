"""leads and hand-off (app/leads.py): sales_reps, lead_accounts, leads."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b3c4d5e6f7a9"
down_revision = "a2b3c4d5e6f8"
branch_labels = None
depends_on = None


def _stamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "sales_reps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(200), nullable=False, server_default=""),
        sa.Column("phone", sa.String(40), nullable=False, server_default=""),
        sa.Column("industries", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("senior", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="12"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_stamps(),
    )
    op.create_index("ix_sales_reps_workspace_id", "sales_reps", ["workspace_id"])

    op.create_table(
        "lead_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(40), nullable=False, server_default=""),
        sa.Column("email", sa.String(200), nullable=False, server_default=""),
        sa.Column("owner_rep_id", sa.Integer(), sa.ForeignKey("sales_reps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.String(400), nullable=False, server_default=""),
        *_stamps(),
    )
    op.create_index("ix_lead_accounts_workspace_id", "lead_accounts", ["workspace_id"])

    op.create_table(
        "leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("industry", sa.String(120), nullable=False, server_default=""),
        sa.Column("source", sa.String(120), nullable=False, server_default=""),
        sa.Column("contact_name", sa.String(120), nullable=False, server_default=""),
        sa.Column("phone", sa.String(40), nullable=False, server_default=""),
        sa.Column("email", sa.String(200), nullable=False, server_default=""),
        sa.Column("summary", sa.String(300), nullable=False, server_default=""),
        sa.Column("need", sa.Text(), nullable=False, server_default=""),
        sa.Column("volume", sa.String(120), nullable=False, server_default=""),
        sa.Column("timeline", sa.String(120), nullable=False, server_default=""),
        sa.Column("score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(14), nullable=False, server_default="qualifying"),
        sa.Column("messages", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("lead_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rep_id", sa.Integer(), sa.ForeignKey("sales_reps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("route", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("handed_off_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("handed_off_by", sa.Integer(), sa.ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("first_contact_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(8), nullable=False, server_default=""),
        sa.Column("value_usd", sa.Numeric(12, 2), nullable=True),
        *_stamps(),
    )
    op.create_index("ix_leads_brand_id", "leads", ["brand_id"])
    op.create_index("ix_leads_rep_id", "leads", ["rep_id"])
    op.create_index("ix_leads_brand_status", "leads", ["brand_id", "status"])


def downgrade() -> None:
    op.drop_table("leads")
    op.drop_table("lead_accounts")
    op.drop_table("sales_reps")
