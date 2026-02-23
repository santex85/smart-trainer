"""Athlete profile table (Strava + manual overrides)

Revision ID: 005
Revises: 004
Create Date: 2025-02-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    if not sa.inspect(conn).has_table("athlete_profiles"):
        op.create_table(
            "athlete_profiles",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("strava_weight_kg", sa.Float(), nullable=True),
            sa.Column("strava_ftp", sa.Integer(), nullable=True),
            sa.Column("strava_firstname", sa.String(128), nullable=True),
            sa.Column("strava_lastname", sa.String(128), nullable=True),
            sa.Column("strava_profile_url", sa.String(512), nullable=True),
            sa.Column("strava_sex", sa.String(8), nullable=True),
            sa.Column("strava_updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("weight_kg", sa.Float(), nullable=True),
            sa.Column("height_cm", sa.Float(), nullable=True),
            sa.Column("birth_year", sa.Integer(), nullable=True),
            sa.Column("ftp", sa.Integer(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_athlete_profiles_user_id"),
        )
        op.create_index(op.f("ix_athlete_profiles_user_id"), "athlete_profiles", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_athlete_profiles_user_id"), table_name="athlete_profiles")
    op.drop_table("athlete_profiles")
