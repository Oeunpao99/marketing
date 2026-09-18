"""post_targets.platform_options — per-platform posting choices (TikTok Direct Post)

Revision ID: c3d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-09-18 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'post_targets',
        sa.Column(
            'platform_options', postgresql.JSONB(astext_type=sa.Text()),
            server_default='{}', nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('post_targets', 'platform_options')
