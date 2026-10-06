"""Chatbot lead intake: a hashed secret key per workspace, and the chatbot's
conversation id on each lead (so a bot re-sending a chat updates that lead)."""

import sqlalchemy as sa
from alembic import op

revision = "e6f7a8b9c0d2"
down_revision = "d5e6f7a8b9c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("lead_intake_key_hash", sa.String(length=64), nullable=True))
    op.add_column("workspaces", sa.Column("lead_intake_key_hint", sa.String(length=8), nullable=False, server_default=""))
    op.add_column("workspaces", sa.Column("lead_intake_last_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_workspaces_lead_intake_key_hash", "workspaces", ["lead_intake_key_hash"])
    op.add_column("leads", sa.Column("external_id", sa.String(length=120), nullable=False, server_default=""))
    op.create_index("ix_leads_brand_external", "leads", ["brand_id", "external_id"])


def downgrade() -> None:
    op.drop_index("ix_leads_brand_external", table_name="leads")
    op.drop_column("leads", "external_id")
    op.drop_constraint("uq_workspaces_lead_intake_key_hash", "workspaces", type_="unique")
    op.drop_column("workspaces", "lead_intake_last_at")
    op.drop_column("workspaces", "lead_intake_key_hint")
    op.drop_column("workspaces", "lead_intake_key_hash")
