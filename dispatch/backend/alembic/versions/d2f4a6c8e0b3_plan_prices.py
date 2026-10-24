"""Plan prices set in the admin portal (app/payments.py prices) — one row per plan,
USD and KHR a month. Empty table = the built-in / .env prices, as before."""

import sqlalchemy as sa
from alembic import op

revision = "d2f4a6c8e0b3"
down_revision = "c9e1a3b5d7f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_prices",
        sa.Column("plan", sa.String(length=20), primary_key=True),
        sa.Column("usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("khr", sa.Numeric(12, 0), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("plan_prices")
