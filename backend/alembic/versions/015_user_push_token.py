"""Add push_token and push_platform to users for Expo push notifications.

Revision ID: 015
Revises: 014
Create Date: 2026-02-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("push_token", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("push_platform", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "push_platform")
    op.drop_column("users", "push_token")
