"""media_blobs table — store asset bytes in the DB

Revision ID: a1b2c3d4e5f6
Revises: 322821c28d7d
Create Date: 2026-09-09 15:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '322821c28d7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'media_blobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column(
            'content_type', sa.String(length=120),
            server_default='application/octet-stream', nullable=False,
        ),
        sa.Column('size_bytes', sa.Integer(), server_default='0', nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_media_blobs_name'), 'media_blobs', ['name'], unique=True
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_media_blobs_name'), table_name='media_blobs')
    op.drop_table('media_blobs')
