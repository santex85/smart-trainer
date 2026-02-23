import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.food_log import FoodLog, MealType
from app.models.user import User
from app.schemas.nutrition import NutritionAnalyzeResponse
from app.schemas.photo import PhotoAnalyzeResponse, PhotoFoodResponse, PhotoSleepResponse
from app.schemas.sleep_extraction import SleepExtractionResponse
from app.services.gemini_nutrition import analyze_food_from_image
from app.services.gemini_photo_classifier import classify_image
from app.services.sleep_analysis import analyze_and_save_sleep
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/photo", tags=["photo"])


def _validate_image(file: UploadFile, image_bytes: bytes) -> None:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="File is empty or invalid.")
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")
    magic = image_bytes[:12] if len(image_bytes) >= 12 else image_bytes
    if not (
        magic.startswith(b"\xff\xd8\xff")
        or magic.startswith(b"\x89PNG\r\n\x1a\n")
        or magic.startswith(b"GIF87a")
        or magic.startswith(b"GIF89a")
        or (magic[:4] == b"RIFF" and magic[8:12] == b"WEBP")
    ):
        raise HTTPException(status_code=400, detail="File must be a valid image (JPEG, PNG, GIF or WebP).")


@router.post("/analyze", response_model=PhotoAnalyzeResponse)
async def analyze_photo(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File(description="Photo: food or sleep data")],
    meal_type: Annotated[str | None, Form()] = None,
) -> PhotoAnalyzeResponse:
    """
    Upload any photo. AI classifies as food or sleep data; then analyzes and saves accordingly.
    Returns either { type: "food", food: {...} } or { type: "sleep", sleep: {...} }.
    """
    image_bytes = await file.read()
    _validate_image(file, image_bytes)

    try:
        kind = classify_image(image_bytes)
    except Exception:
        logging.exception("Photo classification failed")
        raise HTTPException(status_code=502, detail="Classification failed. Please try again.")

    if kind == "food":
        try:
            result = analyze_food_from_image(image_bytes)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception:
            logging.exception("Food image analysis failed")
            raise HTTPException(status_code=502, detail="AI analysis failed. Please try again.")
        meal = (meal_type or MealType.other.value).lower()
        if meal not in [e.value for e in MealType]:
            meal = MealType.other.value
        log = FoodLog(
            user_id=user.id,
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
        return PhotoFoodResponse(
            type="food",
            food=NutritionAnalyzeResponse(
                id=log.id,
                name=log.name,
                portion_grams=log.portion_grams,
                calories=log.calories,
                protein_g=log.protein_g,
                fat_g=log.fat_g,
                carbs_g=log.carbs_g,
            ),
        )

    # kind == "sleep"
    try:
        record, data = await analyze_and_save_sleep(session, user.id, image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logging.exception("Sleep image extraction failed")
        raise HTTPException(status_code=502, detail="Sleep data extraction failed. Please try again.")

    return PhotoSleepResponse(
        type="sleep",
        sleep=SleepExtractionResponse(
            id=record.id,
            extracted_data=data,
            created_at=record.created_at.isoformat() if record.created_at else "",
        ),
    )
