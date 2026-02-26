"""
Глубокий анализ сна: извлечение метрик из фото и сохранение в БД.
Объединяет парсинг (Gemini) и запись в sleep_extractions.
"""
from datetime import date as date_cls
import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func

from app.models.sleep_extraction import SleepExtraction
from app.models.wellness_cache import WellnessCache
from app.schemas.sleep_extraction import SleepExtractionResult
from app.services.gemini_sleep_parser import extract_sleep_data


def _payload_for_storage(result: SleepExtractionResult) -> dict[str, Any]:
    """Словарь для сохранения в БД: только поля схемы, в том числе null."""
    raw = result.model_dump(mode="json")
    return {k: raw.get(k) for k in SleepExtractionResult.model_fields}


def _sleep_date_from_result(result: SleepExtractionResult) -> date_cls:
    if result.date:
        try:
            return date_cls.fromisoformat(str(result.date)[:10])
        except ValueError:
            pass
    return date_cls.today()


def _sleep_hours_from_result(result: SleepExtractionResult) -> float | None:
    hours = result.actual_sleep_hours if result.actual_sleep_hours is not None else result.sleep_hours
    if hours is None:
        return None
    try:
        return float(hours)
    except (TypeError, ValueError):
        return None


async def _upsert_sleep_into_wellness_cache(
    session: AsyncSession,
    user_id: int,
    result: SleepExtractionResult,
) -> None:
    sleep_hours = _sleep_hours_from_result(result)
    if sleep_hours is None:
        return
    sleep_date = _sleep_date_from_result(result)
    stmt = pg_insert(WellnessCache).values(
        {
            "user_id": user_id,
            "date": sleep_date,
            "sleep_hours": sleep_hours,
        }
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_wellness_cache_user_id_date",
        set_={
            # Do not overwrite manual/Intervals values; only fill if missing.
            "sleep_hours": func.coalesce(WellnessCache.sleep_hours, stmt.excluded.sleep_hours),
        },
    )
    await session.execute(stmt)


async def save_sleep_result(
    session: AsyncSession,
    user_id: int,
    result: SleepExtractionResult,
) -> tuple[SleepExtraction, dict]:
    """
    Save already-extracted sleep result to DB (no Gemini call).
    Returns (record, extracted_data) for API response.
    """
    stored = _payload_for_storage(result)
    record = SleepExtraction(
        user_id=user_id,
        extracted_data=json.dumps(stored, ensure_ascii=False),
    )
    session.add(record)
    await _upsert_sleep_into_wellness_cache(session, user_id, result)
    await session.flush()
    data = json.loads(record.extracted_data)
    return record, data


async def analyze_and_save_sleep(
    session: AsyncSession,
    user_id: int,
    image_bytes: bytes,
    mode: str = "lite",
) -> tuple[SleepExtraction, dict]:
    """
    Глубокий анализ фото сна: извлечение метрик (Gemini), сохранение в sleep_extractions,
    возврат записи и extracted_data для ответа API. mode: 'lite' (default) or 'full'.
    """
    result = await extract_sleep_data(image_bytes, mode=mode)
    return await save_sleep_result(session, user_id, result)
