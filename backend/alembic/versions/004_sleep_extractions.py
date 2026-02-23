"""Sleep extractions table for photo-analyzed sleep data

Revision ID: 004
Revises: 003
Create Date: 2025-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    if not sa.inspect(conn).has_table("sleep_extractions"):
        op.create_table(
            "sleep_extractions",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("extracted_data", sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_sleep_extractions_user_id", "sleep_extractions", ["user_id"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    if sa.inspect(conn).has_table("sleep_extractions"):
        op.drop_index("ix_sleep_extractions_user_id", table_name="sleep_extractions")
        op.drop_table("sleep_extractions")
