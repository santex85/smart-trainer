"""Athlete profile: GET/PATCH profile (manual fields only)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.db.session import get_db
from app.models.athlete_profile import AthleteProfile
from app.models.user import User

router = APIRouter(prefix="/athlete-profile", tags=["athlete-profile"])


def _profile_response(profile: AthleteProfile | None, user: User) -> dict:
    """Build GET response: manual profile fields."""
    base = {
        "is_premium": user.is_premium,
        "dev_can_toggle_premium": settings.app_env != "production",
    }
    if not profile:
        return {
            **base,
            "weight_kg": None,
            "weight_source": None,
            "ftp": None,
            "ftp_source": None,
            "height_cm": None,
            "birth_year": None,
            "display_name": user.email,
        }
    return {
        **base,
        "weight_kg": profile.weight_kg,
        "weight_source": "manual" if profile.weight_kg is not None else None,
        "ftp": profile.ftp,
        "ftp_source": "manual" if profile.ftp is not None else None,
        "height_cm": profile.height_cm,
        "birth_year": profile.birth_year,
        "display_name": user.email,
    }


class AthleteProfileUpdate(BaseModel):
    weight_kg: float | None = Field(None, description="Weight in kg")
    height_cm: float | None = Field(None, description="Height in cm")
    birth_year: int | None = Field(None, ge=1900, le=2100, description="Birth year")
    ftp: int | None = Field(None, ge=1, le=999, description="Functional threshold power (watts)")


@router.get(
    "",
    summary="Get athlete profile",
    responses={401: {"description": "Not authenticated"}},
)
async def get_athlete_profile(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Return athlete profile (manual fields only)."""
    uid = user.id
    r = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == uid))
    profile = r.scalar_one_or_none()
    return _profile_response(profile, user)


@router.patch(
    "",
    summary="Update athlete profile",
    responses={401: {"description": "Not authenticated"}},
)
async def update_athlete_profile(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    body: AthleteProfileUpdate,
) -> dict:
    """Update manual profile fields (weight_kg, height_cm, birth_year, ftp)."""
    uid = user.id
    r = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == uid))
    profile = r.scalar_one_or_none()
    if not profile:
        profile = AthleteProfile(user_id=uid)
        session.add(profile)
        await session.flush()
    if body.weight_kg is not None:
        profile.weight_kg = body.weight_kg
    if body.height_cm is not None:
        profile.height_cm = body.height_cm
    if body.birth_year is not None:
        profile.birth_year = body.birth_year
    if body.ftp is not None:
        profile.ftp = body.ftp
    await session.commit()
    await session.refresh(profile)
    r = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == uid))
    return _profile_response(r.scalar_one_or_none(), user)
