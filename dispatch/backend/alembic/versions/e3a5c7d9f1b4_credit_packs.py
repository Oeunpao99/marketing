"""Credit packs customers buy with KHQR (app/payments.py) — set in the admin portal —
and payments.credits (how many credits a top-up payment buys). Starts with the
website's three packs (500 / 2,000 / 5,000)."""

import sqlalchemy as sa
from alembic import op

revision = "e3a5c7d9f1b4"
down_revision = "d2f4a6c8e0b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    packs = op.create_table(
        "credit_packs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column("usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("khr", sa.Numeric(12, 0), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.bulk_insert(
        packs,
        [
            {"credits": 500, "usd": 6, "khr": 25000, "active": True},
            {"credits": 2000, "usd": 20, "khr": 82000, "active": True},
            {"credits": 5000, "usd": 45, "khr": 185000, "active": True},
        ],
    )
    op.add_column("payments", sa.Column("credits", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "credits")
    op.drop_table("credit_packs")
