"""team_members.transfer_pin_hash / _fails / _locked_until — the security PIN
asked for on every credit transfer (app/billing.py)."""

import sqlalchemy as sa
from alembic import op

revision = "d2f8a6c4e1b7"
down_revision = "c9e1f4a7b250"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("team_members", sa.Column("transfer_pin_hash", sa.String(255), nullable=True))
    op.add_column("team_members", sa.Column("transfer_pin_fails", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("team_members", sa.Column("transfer_pin_locked_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("team_members", "transfer_pin_locked_until")
    op.drop_column("team_members", "transfer_pin_fails")
    op.drop_column("team_members", "transfer_pin_hash")
