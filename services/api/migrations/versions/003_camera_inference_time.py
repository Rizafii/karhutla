"""Distinguish capture timestamps from completed inference timestamps."""
from alembic import op
import sqlalchemy as sa

revision='003'
down_revision='002'


def upgrade():
    op.add_column('cameras',sa.Column('last_inference_at',sa.DateTime(timezone=True),nullable=True))


def downgrade():
    op.drop_column('cameras','last_inference_at')
