"""Add extended_nutrients to food_log.

Revision ID: 018
Revises: 017
Create Date: 2026-02-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "food_log",
        sa.Column("extended_nutrients", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("food_log", "extended_nutrients")
