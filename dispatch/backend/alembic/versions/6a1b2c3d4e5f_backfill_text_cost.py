"""credit_entries.cost_usd for AI text charged before 5e9f3a2b7c41: back then
a workspace was charged exactly the provider cost (no markup), so the cost is
the amount charged. Tokens in / out weren't split then and stay 0 (the total
is in `tokens`)."""

from alembic import op

revision = "6a1b2c3d4e5f"
down_revision = "5e9f3a2b7c41"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE credit_entries SET cost_usd = -amount_usd "
        "WHERE kind = 'text' AND cost_usd = 0 AND amount_usd < 0 AND input_tokens = 0 AND output_tokens = 0"
    )


def downgrade() -> None:
    pass  # the backfilled costs are correct either way
