"""Strava: strava_credentials, strava_activities, strava_sync_queue

Revision ID: 002
Revises: 001
Create Date: 2025-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, name: str) -> bool:
    from sqlalchemy import text
    r = conn.execute(text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
    ), {"t": name})
    return r.scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "strava_credentials"):
        op.create_table(
            "strava_credentials",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("encrypted_refresh_token", sa.Text(), nullable=False),
            sa.Column("access_token", sa.Text(), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("strava_athlete_id", sa.BigInteger(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_strava_credentials_user_id", "strava_credentials", ["user_id"], unique=True)

    if not _table_exists(conn, "strava_activities"):
        op.create_table(
            "strava_activities",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("strava_id", sa.BigInteger(), nullable=False),
            sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
            sa.Column("name", sa.String(512), nullable=True),
            sa.Column("moving_time_sec", sa.Integer(), nullable=True),
            sa.Column("distance_m", sa.Float(), nullable=True),
            sa.Column("suffer_score", sa.Float(), nullable=True),
            sa.Column("type", sa.String(64), nullable=True),
            sa.Column("raw", sa.JSON(), nullable=True),
            sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "strava_id", name="uq_strava_activities_user_strava_id"),
        )
        op.create_index("ix_strava_activities_user_id", "strava_activities", ["user_id"], unique=False)
        op.create_index("ix_strava_activities_strava_id", "strava_activities", ["strava_id"], unique=False)
        op.create_index("ix_strava_activities_start_date", "strava_activities", ["start_date"], unique=False)

    if not _table_exists(conn, "strava_sync_queue"):
        op.create_table(
            "strava_sync_queue",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_strava_sync_queue_user_id", "strava_sync_queue", ["user_id"], unique=False)
        op.create_index("ix_strava_sync_queue_status", "strava_sync_queue", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_strava_sync_queue_status", table_name="strava_sync_queue")
    op.drop_index("ix_strava_sync_queue_user_id", table_name="strava_sync_queue")
    op.drop_table("strava_sync_queue")
    op.drop_index("ix_strava_activities_start_date", table_name="strava_activities")
    op.drop_index("ix_strava_activities_strava_id", table_name="strava_activities")
    op.drop_index("ix_strava_activities_user_id", table_name="strava_activities")
    op.drop_table("strava_activities")
    op.drop_index("ix_strava_credentials_user_id", table_name="strava_credentials")
    op.drop_table("strava_credentials")
