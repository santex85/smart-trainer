"""Athlete profile: GET/PATCH profile (manual fields only)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete_profile import AthleteProfile
from app.models.user import User

router = APIRouter(prefix="/athlete-profile", tags=["athlete-profile"])


def _effective_weight(profile: AthleteProfile | None) -> float | None:
    if not profile:
        return None
    return profile.weight_kg if profile.weight_kg is not None else profile.strava_weight_kg


def _effective_ftp(profile: AthleteProfile | None) -> int | None:
    if not profile:
        return None
    return profile.ftp if profile.ftp is not None else profile.strava_ftp


def _profile_response(profile: AthleteProfile | None, user: User) -> dict:
    """Build GET response: effective values + source flags."""
    if not profile:
        return {
            "weight_kg": None,
            "weight_source": None,
            "ftp": None,
            "ftp_source": None,
            "height_cm": None,
            "birth_year": None,
            "strava_firstname": None,
            "strava_lastname": None,
            "strava_profile_url": None,
            "strava_sex": None,
            "strava_updated_at": None,
            "display_name": user.email,
        }
    weight = profile.weight_kg if profile.weight_kg is not None else profile.strava_weight_kg
    ftp = profile.ftp if profile.ftp is not None else profile.strava_ftp
    display = None
    if profile.strava_firstname or profile.strava_lastname:
        display = " ".join(filter(None, [profile.strava_firstname, profile.strava_lastname])).strip() or None
    if not display:
        display = user.email
    return {
        "weight_kg": weight,
        "weight_source": "manual" if profile.weight_kg is not None else ("strava" if profile.strava_weight_kg is not None else None),
        "ftp": ftp,
        "ftp_source": "manual" if profile.ftp is not None else ("strava" if profile.strava_ftp is not None else None),
        "height_cm": profile.height_cm,
        "birth_year": profile.birth_year,
        "strava_firstname": profile.strava_firstname,
        "strava_lastname": profile.strava_lastname,
        "strava_profile_url": profile.strava_profile_url,
        "strava_sex": profile.strava_sex,
        "strava_updated_at": profile.strava_updated_at.isoformat() if profile.strava_updated_at else None,
        "display_name": display,
    }


class AthleteProfileUpdate(BaseModel):
    weight_kg: float | None = Field(None, description="Weight in kg")
    height_cm: float | None = Field(None, description="Height in cm")
    birth_year: int | None = Field(None, ge=1900, le=2100, description="Birth year")
    ftp: int | None = Field(None, ge=1, le=999, description="Functional threshold power (watts)")


@router.get("")
async def get_athlete_profile(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Return athlete profile (manual fields; legacy strava_* fields kept for existing data)."""
    uid = user.id
    r = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == uid))
    profile = r.scalar_one_or_none()
    return _profile_response(profile, user)


@router.patch("")
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
