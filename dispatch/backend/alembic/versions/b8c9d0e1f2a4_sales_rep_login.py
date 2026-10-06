"""Sales reps can have a portal login: sales_reps.member_id, and the invite
that links a new login to its rep (workspace_invites.sales_rep_id)."""

import sqlalchemy as sa
from alembic import op

revision = "b8c9d0e1f2a4"
down_revision = "a7b8c9d0e1f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_reps", sa.Column("member_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_sales_reps_member_id", "sales_reps", "team_members", ["member_id"], ["id"], ondelete="SET NULL")
    op.create_unique_constraint("uq_sales_reps_member_id", "sales_reps", ["member_id"])
    op.add_column("workspace_invites", sa.Column("sales_rep_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_workspace_invites_sales_rep_id", "workspace_invites", "sales_reps", ["sales_rep_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_workspace_invites_sales_rep_id", "workspace_invites", type_="foreignkey")
    op.drop_column("workspace_invites", "sales_rep_id")
    op.drop_constraint("uq_sales_reps_member_id", "sales_reps", type_="unique")
    op.drop_constraint("fk_sales_reps_member_id", "sales_reps", type_="foreignkey")
    op.drop_column("sales_reps", "member_id")
