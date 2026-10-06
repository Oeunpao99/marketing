"""leads.post_id — the post that brought a lead in (Insights "content that sold")."""

import sqlalchemy as sa
from alembic import op

revision = "c4d5e6f7a8b0"
down_revision = "b3c4d5e6f7a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("post_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_leads_post_id", "leads", "posts", ["post_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_leads_post_id", "leads", ["post_id"])


def downgrade() -> None:
    op.drop_index("ix_leads_post_id", table_name="leads")
    op.drop_constraint("fk_leads_post_id", "leads", type_="foreignkey")
    op.drop_column("leads", "post_id")
