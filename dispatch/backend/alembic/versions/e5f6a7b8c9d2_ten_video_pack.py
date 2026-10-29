"""The "Extra AI video pack" from the pricing sheet (2026-10-29): 10 videos for $30 (123,000 ៛),
on sale — added once, only when no 10-video pack exists yet (the admin portal can change or
remove it after). Its hidden allowance: 300 credits a video, like a pack made in the portal."""

import sqlalchemy as sa
from alembic import op

revision = "e5f6a7b8c9d2"
down_revision = "d4e5f6a7b8c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    have = conn.execute(sa.text("SELECT count(*) FROM credit_packs WHERE videos = 10")).scalar()
    if not have:
        conn.execute(
            sa.text(
                "INSERT INTO credit_packs (credits, videos, images, usd, khr, active, created_at, updated_at) "
                "VALUES (3000, 10, 0, 30, 123000, true, now(), now())"
            )
        )


def downgrade() -> None:
    op.get_bind().execute(sa.text("DELETE FROM credit_packs WHERE videos = 10 AND images = 0 AND usd = 30 AND credits = 3000"))
