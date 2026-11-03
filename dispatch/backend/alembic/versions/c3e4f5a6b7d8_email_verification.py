"""Email confirmation and "Forgot password" (2026-11-03): a new account confirms its email
with a 6-digit code, and a forgotten password is reset with another one (app/mailer.py,
app/auth.py). Everyone who already has an account counts as confirmed."""

import sqlalchemy as sa
from alembic import op

revision = "c3e4f5a6b7d8"
down_revision = "b2d3f4a5c6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("team_members", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("team_members", sa.Column("email_code_hash", sa.String(128), nullable=True))
    op.add_column("team_members", sa.Column("email_code_expires", sa.DateTime(timezone=True), nullable=True))
    op.add_column("team_members", sa.Column("email_code_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("team_members", sa.Column("email_code_tries", sa.Integer(), server_default="0", nullable=False))
    op.add_column("team_members", sa.Column("reset_code_hash", sa.String(128), nullable=True))
    op.add_column("team_members", sa.Column("reset_code_expires", sa.DateTime(timezone=True), nullable=True))
    op.add_column("team_members", sa.Column("reset_code_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("team_members", sa.Column("reset_code_tries", sa.Integer(), server_default="0", nullable=False))
    op.execute("UPDATE team_members SET email_verified_at = created_at")


def downgrade() -> None:
    for col in ("reset_code_tries", "reset_code_sent_at", "reset_code_expires", "reset_code_hash", "email_code_tries", "email_code_sent_at", "email_code_expires", "email_code_hash", "email_verified_at"):
        op.drop_column("team_members", col)
