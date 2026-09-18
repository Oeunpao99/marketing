"""Add Instagram and complete the five-platform brand matrix."""

from alembic import op

revision = "8c0f2a1d4b6e"
down_revision = "76d195c5525f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO platforms (slug, name, char_limit, supports_title, post_as)
        VALUES ('instagram', 'Instagram', 2200, false, 'Posts as a Reel')
        ON CONFLICT (slug) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO channels (brand_id, platform_id, handle, status, token_note, config)
        SELECT b.id, p.id, '', 'off', 'Not connected', '{}'::jsonb
        FROM brands b CROSS JOIN platforms p
        WHERE p.slug = 'instagram'
          AND NOT EXISTS (
              SELECT 1 FROM channels c
              WHERE c.brand_id = b.id AND c.platform_id = p.id
          )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM channels
        WHERE platform_id = (SELECT id FROM platforms WHERE slug = 'instagram')
        """
    )
    op.execute("DELETE FROM platforms WHERE slug = 'instagram'")
