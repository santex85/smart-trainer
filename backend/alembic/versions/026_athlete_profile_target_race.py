"""Add target_race_date and target_race_name to athlete_profiles.

Revision ID: 026
Revises: 025
Create Date: 2025-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("athlete_profiles", sa.Column("target_race_date", sa.Date(), nullable=True))
    op.add_column("athlete_profiles", sa.Column("target_race_name", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("athlete_profiles", "target_race_name")
    op.drop_column("athlete_profiles", "target_race_date")
