"""
Intervals sync: wellness is now independent (user-entered via wellness API).
This module is kept for potential future Intervals-only sync (e.g. events).
"""

from sqlalchemy.ext.asyncio import AsyncSession


async def sync_user_wellness(session: AsyncSession, user_id: int) -> None:
    """No-op: wellness is no longer synced from Intervals."""
    pass


async def sync_all_users_wellness(session: AsyncSession) -> None:
    """No-op: wellness is no longer synced from Intervals."""
    pass
