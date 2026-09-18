"""products table + draft insight/planned_for + automation last_run_on

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-09-18 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'products',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('brand_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), server_default='', nullable=False),
        sa.Column('highlights', sa.Text(), server_default='', nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_products_brand_id'), 'products', ['brand_id'], unique=False)

    op.add_column('drafts', sa.Column('insight', sa.Text(), server_default='', nullable=False))
    op.add_column('drafts', sa.Column('planned_for', sa.Date(), nullable=True))
    op.create_index(op.f('ix_drafts_planned_for'), 'drafts', ['planned_for'], unique=False)

    op.add_column('automations', sa.Column('last_run_on', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('automations', 'last_run_on')

    op.drop_index(op.f('ix_drafts_planned_for'), table_name='drafts')
    op.drop_column('drafts', 'planned_for')
    op.drop_column('drafts', 'insight')

    op.drop_index(op.f('ix_products_brand_id'), table_name='products')
    op.drop_table('products')
