"""Dev-only seed endpoint (when debug=True). Production uses /auth/register."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.auth import hash_password
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])

DEV_SEED_EMAIL = "default@smarttrainer.local"
DEV_SEED_PASSWORD = "dev"


@router.post("/seed")
async def seed_default_user(session: Annotated[AsyncSession, Depends(get_db)]):
    """Create default@smarttrainer.local with password 'dev' only when debug=True and DB has no users."""
    if not settings.debug:
        raise HTTPException(status_code=404, detail="Not found")
    r = await session.execute(select(User).where(User.email == DEV_SEED_EMAIL))
    if r.scalar_one_or_none() is not None:
        return {"message": "User already exists", "status": "ok"}
    session.add(
        User(email=DEV_SEED_EMAIL, password_hash=hash_password(DEV_SEED_PASSWORD))
    )
    return {
        "message": "Default user created",
        "email": DEV_SEED_EMAIL,
        "password": DEV_SEED_PASSWORD,
    }
