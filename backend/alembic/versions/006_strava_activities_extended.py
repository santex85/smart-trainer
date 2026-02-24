"""Strava activities: extended fields from API (elevation, HR, speed, watts, etc.)

Revision ID: 006
Revises: 005
Create Date: 2025-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("strava_activities", sa.Column("elapsed_time_sec", sa.Integer(), nullable=True))
    op.add_column("strava_activities", sa.Column("total_elevation_gain_m", sa.Float(), nullable=True))
    op.add_column("strava_activities", sa.Column("elev_high_m", sa.Float(), nullable=True))
    op.add_column("strava_activities", sa.Column("elev_low_m", sa.Float(), nullable=True))
    op.add_column("strava_activities", sa.Column("average_speed_m_s", sa.Float(), nullable=True))
    op.add_column("strava_activities", sa.Column("max_speed_m_s", sa.Float(), nullable=True))
    op.add_column("strava_activities", sa.Column("average_heartrate", sa.Float(), nullable=True))
    op.add_column("strava_activities", sa.Column("max_heartrate", sa.Float(), nullable=True))
    op.add_column("strava_activities", sa.Column("average_watts", sa.Float(), nullable=True))
    op.add_column("strava_activities", sa.Column("kilojoules", sa.Float(), nullable=True))
    op.add_column("strava_activities", sa.Column("sport_type", sa.String(64), nullable=True))
    op.add_column("strava_activities", sa.Column("workout_type", sa.Integer(), nullable=True))
    op.add_column("strava_activities", sa.Column("start_date_local", sa.String(64), nullable=True))
    op.add_column("strava_activities", sa.Column("timezone", sa.String(128), nullable=True))
    op.add_column("strava_activities", sa.Column("trainer", sa.Boolean(), nullable=True))
    op.add_column("strava_activities", sa.Column("commute", sa.Boolean(), nullable=True))
    op.add_column("strava_activities", sa.Column("manual", sa.Boolean(), nullable=True))
    op.add_column("strava_activities", sa.Column("private", sa.Boolean(), nullable=True))
    op.add_column("strava_activities", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("strava_activities", "description")
    op.drop_column("strava_activities", "private")
    op.drop_column("strava_activities", "manual")
    op.drop_column("strava_activities", "commute")
    op.drop_column("strava_activities", "trainer")
    op.drop_column("strava_activities", "timezone")
    op.drop_column("strava_activities", "start_date_local")
    op.drop_column("strava_activities", "workout_type")
    op.drop_column("strava_activities", "sport_type")
    op.drop_column("strava_activities", "kilojoules")
    op.drop_column("strava_activities", "average_watts")
    op.drop_column("strava_activities", "max_heartrate")
    op.drop_column("strava_activities", "average_heartrate")
    op.drop_column("strava_activities", "max_speed_m_s")
    op.drop_column("strava_activities", "average_speed_m_s")
    op.drop_column("strava_activities", "elev_low_m")
    op.drop_column("strava_activities", "elev_high_m")
    op.drop_column("strava_activities", "total_elevation_gain_m")
    op.drop_column("strava_activities", "elapsed_time_sec")
