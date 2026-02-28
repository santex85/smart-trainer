"""Add nutrition goals to athlete_profiles.

Revision ID: 021
Revises: 020
Create Date: 2025-02-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("athlete_profiles", sa.Column("calorie_goal", sa.Float(), nullable=True))
    op.add_column("athlete_profiles", sa.Column("protein_goal", sa.Float(), nullable=True))
    op.add_column("athlete_profiles", sa.Column("fat_goal", sa.Float(), nullable=True))
    op.add_column("athlete_profiles", sa.Column("carbs_goal", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("athlete_profiles", "carbs_goal")
    op.drop_column("athlete_profiles", "fat_goal")
    op.drop_column("athlete_profiles", "protein_goal")
    op.drop_column("athlete_profiles", "calorie_goal")
