"""Plan limits (videos / images / longest video a month), each job's units, and the
videos / images a pack adds (app/usage.py)."""

import sqlalchemy as sa
from alembic import op

revision = "c3d4e5f6a7b9"
down_revision = "b2c3d4e5f6a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_limits",
        sa.Column("plan", sa.String(20), primary_key=True),
        sa.Column("videos", sa.Integer(), nullable=False),
        sa.Column("images", sa.Integer(), nullable=False),
        sa.Column("longest_seconds", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    # jobs made before counting began use none of the month's videos / images
    op.add_column("generation_jobs", sa.Column("units", sa.Integer(), server_default="0", nullable=False))
    # packs sell videos / images (the credits stay underneath); a paid one adds them for its month
    for table in ("credit_packs", "payments"):
        op.add_column(table, sa.Column("videos", sa.Integer(), server_default="0", nullable=False))
        op.add_column(table, sa.Column("images", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    for table in ("credit_packs", "payments"):
        op.drop_column(table, "images")
        op.drop_column(table, "videos")
    op.drop_column("generation_jobs", "units")
    op.drop_table("plan_limits")
