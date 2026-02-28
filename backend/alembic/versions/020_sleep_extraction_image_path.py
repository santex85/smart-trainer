"""Add image_storage_path to sleep_extractions for re-analyze.

Revision ID: 020
Revises: 019
Create Date: 2025-02-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sleep_extractions",
        sa.Column("image_storage_path", sa.String(1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sleep_extractions", "image_storage_path")
