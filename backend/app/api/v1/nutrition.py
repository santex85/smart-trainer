import logging
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.food_log import FoodLog, MealType
from app.models.user import User
from app.schemas.nutrition import (
    CreateFoodEntryRequest,
    NutritionAnalyzeResponse,
    NutritionDayEntry,
    NutritionDayResponse,
    NutritionDayTotals,
    NutritionEntryUpdate,
)
from app.services.gemini_nutrition import analyze_food_from_image

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


@router.post("/analyze", response_model=NutritionAnalyzeResponse)
async def analyze_nutrition(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File(description="Photo of the plate")],
    meal_type: Annotated[str | None, Form()] = None,
) -> NutritionAnalyzeResponse:
    """
    Upload a photo of food; Gemini returns structured JSON (name, portion_grams, calories, protein_g, fat_g, carbs_g).
    Result is validated with Pydantic and saved to food_log.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="File is empty or invalid.")
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")
    # Check image magic bytes (JPEG, PNG, GIF, WebP)
    magic = image_bytes[:12] if len(image_bytes) >= 12 else image_bytes
    if not (
        magic.startswith(b"\xff\xd8\xff")
        or magic.startswith(b"\x89PNG\r\n\x1a\n")
        or magic.startswith(b"GIF87a")
        or magic.startswith(b"GIF89a")
        or (magic[:4] == b"RIFF" and magic[8:12] == b"WEBP")
    ):
        raise HTTPException(status_code=400, detail="File must be a valid image (JPEG, PNG, GIF or WebP).")
    try:
        result = analyze_food_from_image(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logging.exception("Nutrition image analysis failed")
        raise HTTPException(status_code=502, detail="AI analysis failed. Please try again.")

    uid = user.id
    meal = (meal_type or MealType.other.value).lower()
    if meal not in [e.value for e in MealType]:
        meal = MealType.other.value

    log = FoodLog(
        user_id=uid,
        timestamp=datetime.utcnow(),
        meal_type=meal,
        name=result.name,
        portion_grams=result.portion_grams,
        calories=result.calories,
        protein_g=result.protein_g,
        fat_g=result.fat_g,
        carbs_g=result.carbs_g,
    )
    session.add(log)
    await session.flush()
    return NutritionAnalyzeResponse(
        id=log.id,
        name=log.name,
        portion_grams=log.portion_grams,
        calories=log.calories,
        protein_g=log.protein_g,
        fat_g=log.fat_g,
        carbs_g=log.carbs_g,
    )


@router.post("/entries", response_model=NutritionDayEntry)
async def create_nutrition_entry(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    body: CreateFoodEntryRequest,
) -> NutritionDayEntry:
    """Create a single food log entry (e.g. from photo preview). Optional meal_type and date (YYYY-MM-DD; default today)."""
    meal = (body.meal_type or MealType.other.value).lower()
    if meal not in [e.value for e in MealType]:
        meal = MealType.other.value
    day_str = body.date or datetime.utcnow().date().isoformat()
    try:
        day_date = date.fromisoformat(day_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    ts = datetime.combine(day_date, datetime.min.time(), tzinfo=timezone.utc)
    log = FoodLog(
        user_id=user.id,
        timestamp=ts,
        meal_type=meal,
        name=body.name,
        portion_grams=body.portion_grams,
        calories=body.calories,
        protein_g=body.protein_g,
        fat_g=body.fat_g,
        carbs_g=body.carbs_g,
    )
    session.add(log)
    await session.flush()
    await session.refresh(log)
    return NutritionDayEntry(
        id=log.id,
        name=log.name,
        portion_grams=log.portion_grams,
        calories=log.calories,
        protein_g=log.protein_g,
        fat_g=log.fat_g,
        carbs_g=log.carbs_g,
        meal_type=log.meal_type,
        timestamp=log.timestamp.isoformat() if log.timestamp else "",
    )


@router.get("/day", response_model=NutritionDayResponse)
async def get_nutrition_day(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    date_param: Annotated[str | None, Query(alias="date", description="YYYY-MM-DD")] = None,
) -> NutritionDayResponse:
    """Get food log entries and totals for a single day (default: today)."""
    uid = user.id
    day = date_param or datetime.utcnow().date().isoformat()
    try:
        day_date = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    # Use UTC day boundaries so stored UTC timestamps match the requested calendar day
    day_start = datetime.combine(day_date, datetime.min.time(), tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    stmt = (
        select(FoodLog)
        .where(FoodLog.user_id == uid)
        .where(FoodLog.timestamp >= day_start)
        .where(FoodLog.timestamp < day_end)
        .order_by(FoodLog.timestamp)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    entries = [
        NutritionDayEntry(
            id=r.id,
            name=r.name,
            portion_grams=r.portion_grams,
            calories=r.calories,
            protein_g=r.protein_g,
            fat_g=r.fat_g,
            carbs_g=r.carbs_g,
            meal_type=r.meal_type,
            timestamp=r.timestamp.isoformat() if r.timestamp else "",
        )
        for r in rows
    ]
    totals = NutritionDayTotals(
        calories=sum(r.calories for r in rows),
        protein_g=sum(r.protein_g for r in rows),
        fat_g=sum(r.fat_g for r in rows),
        carbs_g=sum(r.carbs_g for r in rows),
    )
    return NutritionDayResponse(date=day, entries=entries, totals=totals)


@router.patch("/entries/{entry_id}", response_model=NutritionDayEntry)
async def update_nutrition_entry(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    entry_id: Annotated[int, Path(description="Food log entry ID")],
    body: NutritionEntryUpdate,
) -> NutritionDayEntry:
    """Update a food log entry; only provided fields are updated. Returns 404 if not found or not owned."""
    result = await session.execute(select(FoodLog).where(FoodLog.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Entry not found.")
    payload = body.model_dump(exclude_unset=True)
    if "meal_type" in payload and payload["meal_type"] is not None:
        meal = payload["meal_type"].lower()
        if meal not in [e.value for e in MealType]:
            payload["meal_type"] = MealType.other.value
        else:
            payload["meal_type"] = meal
    for k, v in payload.items():
        setattr(entry, k, v)
    await session.flush()
    await session.refresh(entry)
    return NutritionDayEntry(
        id=entry.id,
        name=entry.name,
        portion_grams=entry.portion_grams,
        calories=entry.calories,
        protein_g=entry.protein_g,
        fat_g=entry.fat_g,
        carbs_g=entry.carbs_g,
        meal_type=entry.meal_type,
        timestamp=entry.timestamp.isoformat() if entry.timestamp else "",
    )


@router.delete("/entries/{entry_id}")
async def delete_nutrition_entry(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    entry_id: Annotated[int, Path(description="Food log entry ID")],
) -> dict:
    """Delete a food log entry. Returns 404 if not found or not owned."""
    result = await session.execute(select(FoodLog).where(FoodLog.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Entry not found.")
    await session.delete(entry)
    await session.flush()
    return {"status": "deleted"}
