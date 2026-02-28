import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.food_log import FoodLog, MealType
from app.models.user import User
from app.models.wellness_cache import WellnessCache
from app.schemas.nutrition import NutritionAnalyzeResponse
from app.schemas.photo import PhotoAnalyzeResponse, PhotoFoodResponse, PhotoSleepResponse, PhotoWellnessResponse, WellnessPhotoResult
from app.schemas.sleep_extraction import SleepExtractionResponse
from app.models.sleep_extraction import SleepExtraction
from app.schemas.sleep_extraction import SleepExtractionResult
from app.services.gemini_nutrition import analyze_food_from_image
from app.services.gemini_photo_analyzer import classify_and_analyze_image
from app.services.image_resize import resize_image_for_ai_async
from app.services.sleep_analysis import analyze_and_save_sleep, save_sleep_result
from app.services.audit import log_action
from app.services.storage import upload_image
from sqlalchemy import select
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


@router.post(
    "/analyze",
    response_model=PhotoAnalyzeResponse,
    summary="Analyze photo (food or sleep)",
    responses={
        400: {"description": "Invalid image"},
        401: {"description": "Not authenticated"},
        422: {"description": "AI could not analyze"},
        502: {"description": "AI service unavailable"},
    },
)
async def analyze_photo(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File(description="Photo: food or sleep data")],
    meal_type: Annotated[str | None, Form()] = None,
    save: Annotated[bool, Query(description="If false, analyze only and do not save")] = True,
) -> PhotoAnalyzeResponse:
    """
    Upload any photo. AI classifies as food or sleep data; then analyzes and optionally saves.
    If save=False, returns preview data without writing to DB.
    Returns either { type: "food", food: {...} } or { type: "sleep", sleep: {...} }.
    """
    image_bytes = await file.read()
    _validate_image(file, image_bytes)
    image_storage_path: str | None = None
    try:
        image_storage_path = await upload_image(image_bytes, user.id, category="food")
    except Exception:
        logging.exception("Failed to store photo upload for user_id=%s", user.id)
    image_bytes = await resize_image_for_ai_async(image_bytes)

    try:
        kind, result = await classify_and_analyze_image(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logging.exception("Photo classify+analyze failed")
        raise HTTPException(status_code=502, detail="AI analysis failed. Please try again.")

    if kind == "food":
        food_result = result
        extended_nutrients: dict | None = None
        try:
            food_result, extended_nutrients = await analyze_food_from_image(
                image_bytes, extended=True
            )
        except (ValueError, Exception):
            pass  # keep classifier result if extended analysis fails
        if save:
            meal = (meal_type or MealType.other.value).lower()
            if meal not in [e.value for e in MealType]:
                meal = MealType.other.value
            log = FoodLog(
                user_id=user.id,
                timestamp=datetime.utcnow(),
                meal_type=meal,
                name=food_result.name,
                portion_grams=food_result.portion_grams,
                calories=food_result.calories,
                protein_g=food_result.protein_g,
                fat_g=food_result.fat_g,
                carbs_g=food_result.carbs_g,
                image_storage_path=image_storage_path,
                extended_nutrients=extended_nutrients,
            )
            session.add(log)
            await session.flush()
            await log_action(
                session,
                user_id=user.id,
                action="create",
                resource="food_log",
                resource_id=str(log.id),
                details={"source": "photo.analyze", "image_storage_path": image_storage_path},
            )
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
                    extended_nutrients=log.extended_nutrients,
                ),
            )
        return PhotoFoodResponse(
            type="food",
            food=NutritionAnalyzeResponse(
                id=0,
                name=food_result.name,
                portion_grams=food_result.portion_grams,
                calories=food_result.calories,
                protein_g=food_result.protein_g,
                fat_g=food_result.fat_g,
                carbs_g=food_result.carbs_g,
                extended_nutrients=extended_nutrients,
            ),
        )

    if kind == "wellness":
        result_wellness: WellnessPhotoResult = result
        today = date.today()
        if save and (result_wellness.rhr is not None or result_wellness.hrv is not None):
            r = await session.execute(
                select(WellnessCache).where(
                    WellnessCache.user_id == user.id,
                    WellnessCache.date == today,
                )
            )
            row = r.scalar_one_or_none()
            if row:
                if result_wellness.rhr is not None:
                    row.rhr = float(result_wellness.rhr)
                if result_wellness.hrv is not None:
                    row.hrv = float(result_wellness.hrv)
            else:
                session.add(
                    WellnessCache(
                        user_id=user.id,
                        date=today,
                        rhr=float(result_wellness.rhr) if result_wellness.rhr is not None else None,
                        hrv=float(result_wellness.hrv) if result_wellness.hrv is not None else None,
                    )
                )
            await session.commit()
        return PhotoWellnessResponse(
            type="wellness",
            wellness=WellnessPhotoResult(rhr=result_wellness.rhr, hrv=result_wellness.hrv),
        )

    # kind == "sleep"
    if save:
        try:
            record, data = await save_sleep_result(session, user.id, result)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception:
            logging.exception("Sleep save failed")
            raise HTTPException(status_code=502, detail="Sleep data save failed. Please try again.")
        return PhotoSleepResponse(
            type="sleep",
            sleep=SleepExtractionResponse(
                id=record.id,
                extracted_data=data,
                created_at=record.created_at.isoformat() if record.created_at else "",
            ),
        )
    data = result.model_dump(mode="json")
    return PhotoSleepResponse(
        type="sleep",
        sleep=SleepExtractionResponse(
            id=0,
            extracted_data=data,
            created_at="",
        ),
    )


@router.post(
    "/analyze-sleep",
    response_model=SleepExtractionResponse,
    summary="Extract sleep data from screenshot",
    responses={
        400: {"description": "Invalid image"},
        401: {"description": "Not authenticated"},
        422: {"description": "Could not extract sleep data"},
        502: {"description": "Sleep extraction failed"},
    },
)
async def analyze_sleep_photo(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File(description="Sleep tracker screenshot")],
    mode: Annotated[str, Query(description="Extraction mode: lite (default) or full")] = "lite",
) -> SleepExtractionResponse:
    """Extract sleep data from a screenshot using the sleep parser. mode=lite (fewer tokens) or full."""
    if mode not in ("lite", "full"):
        mode = "lite"
    image_bytes = await file.read()
    _validate_image(file, image_bytes)
    image_bytes = await resize_image_for_ai_async(image_bytes)
    try:
        record, data = await analyze_and_save_sleep(session, user.id, image_bytes, mode=mode)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logging.exception("Sleep extraction failed")
        raise HTTPException(status_code=502, detail="Sleep extraction failed. Please try again.")
    await session.commit()
    await session.refresh(record)
    return SleepExtractionResponse(
        id=record.id,
        extracted_data=data,
        created_at=record.created_at.isoformat() if record.created_at else "",
    )


@router.post(
    "/save-sleep",
    response_model=SleepExtractionResponse,
    summary="Save extracted sleep data from preview",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def save_sleep_from_preview(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    body: SleepExtractionResult,
) -> SleepExtractionResponse:
    """
    Save previously extracted sleep data (e.g. from analyze with save=false).
    """
    record, data = await save_sleep_result(session, user.id, body)
    await session.commit()
    await session.refresh(record)
    return SleepExtractionResponse(
        id=record.id,
        extracted_data=data,
        created_at=record.created_at.isoformat() if record.created_at else "",
    )


@router.get(
    "/sleep-extractions",
    response_model=list[dict],
    summary="List sleep extractions",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def list_sleep_extractions(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    from_date: date | None = Query(None, description="YYYY-MM-DD"),
    to_date: date | None = Query(None, description="YYYY-MM-DD"),
    limit: int = Query(60, ge=1, le=90),
) -> list[dict]:
    """List sleep extractions (from photos) for dashboard. Returns created_at, sleep_date, sleep_hours, actual_sleep_hours."""
    uid = user.id
    end_date = to_date or date.today()
    start_date = from_date or (end_date - timedelta(days=limit))
    from_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    to_dt = datetime.combine(end_date, datetime.max.time()).replace(tzinfo=timezone.utc)
    r = await session.execute(
        select(SleepExtraction.created_at, SleepExtraction.extracted_data).where(
            SleepExtraction.user_id == uid,
            SleepExtraction.created_at >= from_dt,
            SleepExtraction.created_at <= to_dt,
        ).order_by(SleepExtraction.created_at.desc()).limit(limit)
    )
    out = []
    for created_at, data_json in r.all():
        try:
            data = json.loads(data_json) if isinstance(data_json, str) else data_json
        except (json.JSONDecodeError, TypeError):
            continue
        sh = data.get("sleep_hours")
        ah = data.get("actual_sleep_hours")
        if sh is None and data.get("sleep_minutes") is not None:
            sh = round(data["sleep_minutes"] / 60.0, 2)
        if ah is None and data.get("actual_sleep_minutes") is not None:
            ah = round(data["actual_sleep_minutes"] / 60.0, 2)
        out.append({
            "created_at": created_at.isoformat() if created_at else "",
            "sleep_date": data.get("date"),
            "sleep_hours": sh,
            "actual_sleep_hours": ah,
        })
    return out
