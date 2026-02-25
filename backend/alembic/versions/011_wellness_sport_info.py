"""Add sport_info (JSON) to wellness_cache for eFTP/pMax from Intervals.

Revision ID: 011
Revises: 010
Create Date: 2025-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("wellness_cache", sa.Column("sport_info", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("wellness_cache", "sport_info")
