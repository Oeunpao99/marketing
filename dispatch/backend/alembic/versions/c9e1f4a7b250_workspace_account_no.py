"""workspaces.account_no — Billing → Transfer credits: each account's 10-digit
number (random, unique), given to every existing workspace here."""

import secrets

import sqlalchemy as sa
from alembic import op

revision = "c9e1f4a7b250"
down_revision = "b4d8e2f6a913"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("account_no", sa.String(10), nullable=True))
    op.create_unique_constraint("uq_workspaces_account_no", "workspaces", ["account_no"])
    conn = op.get_bind()
    used: set[str] = set()
    for (ws_id,) in conn.execute(sa.text("SELECT id FROM workspaces WHERE account_no IS NULL")).all():
        no = ""
        while not no or no in used:
            no = str(secrets.randbelow(9 * 10**9) + 10**9)  # 10 digits, never a leading 0
        used.add(no)
        conn.execute(sa.text("UPDATE workspaces SET account_no = :no WHERE id = :id"), {"no": no, "id": ws_id})


def downgrade() -> None:
    op.drop_constraint("uq_workspaces_account_no", "workspaces", type_="unique")
    op.drop_column("workspaces", "account_no")
