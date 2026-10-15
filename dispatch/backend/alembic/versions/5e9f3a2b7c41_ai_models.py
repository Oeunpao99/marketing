"""Multi-model writing: ai_models (what each model costs us and its markup,
on/off), workspaces.ai_model / ai_models_allowed, and credit_entries split
into input / output tokens with the provider cost — app/ai_models.py."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "5e9f3a2b7c41"
down_revision = "4d8e2b1c6f37"
branch_labels = None
depends_on = None


def upgrade() -> None:
    models = op.create_table(
        "ai_models",
        sa.Column("key", sa.String(40), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("price_in", sa.Numeric(10, 4), nullable=False, server_default="0"),
        sa.Column("price_out", sa.Numeric(10, 4), nullable=False, server_default="0"),
        sa.Column("markup", sa.Numeric(6, 3), nullable=False, server_default="1.3"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # list prices per 1M tokens (input, output); Gemini 4 Argon starts off until
    # the admin enters its price
    op.bulk_insert(
        models,
        [
            {"key": "gpt-5", "enabled": True, "price_in": 1.25, "price_out": 10.0, "markup": 1.3},
            {"key": "gpt-5-mini", "enabled": True, "price_in": 0.25, "price_out": 2.0, "markup": 1.3},
            {"key": "claude-opus-5-5", "enabled": True, "price_in": 4.0, "price_out": 20.0, "markup": 1.3},
            {"key": "gemini-4-argon", "enabled": False, "price_in": 0, "price_out": 0, "markup": 1.3},
        ],
    )
    op.add_column("workspaces", sa.Column("ai_model", sa.String(40), nullable=False, server_default=""))
    op.add_column("workspaces", sa.Column("ai_models_allowed", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("credit_entries", sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("credit_entries", sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("credit_entries", sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("credit_entries", "cost_usd")
    op.drop_column("credit_entries", "output_tokens")
    op.drop_column("credit_entries", "input_tokens")
    op.drop_column("workspaces", "ai_models_allowed")
    op.drop_column("workspaces", "ai_model")
    op.drop_table("ai_models")
