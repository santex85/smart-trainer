"""Add external_id to workouts for Intervals.icu sync.

Revision ID: 009
Revises: 008
Create Date: 2025-02-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("workouts", sa.Column("external_id", sa.String(64), nullable=True))
    op.create_index("ix_workouts_external_id", "workouts", ["external_id"], unique=False)
    op.create_index(
        "ix_workouts_user_id_external_id",
        "workouts",
        ["user_id", "external_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_workouts_user_id_external_id", table_name="workouts")
    op.drop_index("ix_workouts_external_id", table_name="workouts")
    op.drop_column("workouts", "external_id")
