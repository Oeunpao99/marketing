"""Add LinkedIn and complete the six-platform brand matrix."""

from alembic import op

revision = "f1a2b3c4d5e6"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO platforms (slug, name, char_limit, supports_title, post_as)
        VALUES ('linkedin', 'LinkedIn', 3000, false, 'Posts to feed')
        ON CONFLICT (slug) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO channels (brand_id, platform_id, handle, status, token_note, config)
        SELECT b.id, p.id, '', 'off', 'Not connected', '{}'::jsonb
        FROM brands b CROSS JOIN platforms p
        WHERE p.slug = 'linkedin'
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
        WHERE platform_id = (SELECT id FROM platforms WHERE slug = 'linkedin')
        """
    )
    op.execute("DELETE FROM platforms WHERE slug = 'linkedin'")
