"""Payments outlive a deleted account (2026-11-03): the admin portal can delete an
account for good, but its KHQR payment records stay for the books — the link to the
account goes empty and account_label keeps whose it was."""

import sqlalchemy as sa
from alembic import op

revision = "f6b7c8d9e0a1"
down_revision = "e5a6b7c8d9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("account_label", sa.String(200), server_default="", nullable=False))
    # whatever the old CASCADE link is called, it goes (else it would still delete the payments)
    op.execute(
        """
        DO $$
        DECLARE c text;
        BEGIN
          FOR c IN
            SELECT con.conname FROM pg_constraint con
            JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
            WHERE con.conrelid = 'payments'::regclass AND con.contype = 'f' AND att.attname = 'workspace_id'
          LOOP
            EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', c);
          END LOOP;
        END $$;
        """
    )
    op.alter_column("payments", "workspace_id", existing_type=sa.Integer(), nullable=True)
    op.create_foreign_key("payments_workspace_id_fkey", "payments", "workspaces", ["workspace_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.execute("DELETE FROM payments WHERE workspace_id IS NULL")
    op.drop_constraint("payments_workspace_id_fkey", "payments", type_="foreignkey")
    op.alter_column("payments", "workspace_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key("payments_workspace_id_fkey", "payments", "workspaces", ["workspace_id"], ["id"], ondelete="CASCADE")
    op.drop_column("payments", "account_label")
