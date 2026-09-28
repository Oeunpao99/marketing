"""brand_assets (logo / product photos / poster templates) and
automations.poster_kit — the brand kit the image AI builds on (app/brand_kit.py)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b1c2d3e4f5a7"
down_revision = "a0b1c2d3e4f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "brand_assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_brand_assets_brand_id", "brand_assets", ["brand_id"])
    op.create_index("ix_brand_assets_product_id", "brand_assets", ["product_id"])
    op.add_column(
        "automations",
        sa.Column("poster_kit", postgresql.JSONB(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("automations", "poster_kit")
    op.drop_index("ix_brand_assets_product_id", table_name="brand_assets")
    op.drop_index("ix_brand_assets_brand_id", table_name="brand_assets")
    op.drop_table("brand_assets")
