"""Workouts table: manual and FIT-sourced training entries.

Revision ID: 008
Revises: 007
Create Date: 2025-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workouts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(512), nullable=True),
        sa.Column("type", sa.String(64), nullable=True),
        sa.Column("duration_sec", sa.Integer(), nullable=True),
        sa.Column("distance_m", sa.Float(), nullable=True),
        sa.Column("tss", sa.Float(), nullable=True),
        sa.Column("source", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("fit_checksum", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("raw", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workouts_user_id", "workouts", ["user_id"], unique=False)
    op.create_index("ix_workouts_start_date", "workouts", ["start_date"], unique=False)
    op.create_index("ix_workouts_fit_checksum", "workouts", ["fit_checksum"], unique=False)
    op.create_index("ix_workouts_user_id_start_date", "workouts", ["user_id", "start_date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_workouts_user_id_start_date", table_name="workouts")
    op.drop_index("ix_workouts_fit_checksum", table_name="workouts")
    op.drop_index("ix_workouts_start_date", table_name="workouts")
    op.drop_index("ix_workouts_user_id", table_name="workouts")
    op.drop_table("workouts")
