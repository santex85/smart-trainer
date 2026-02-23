"""
Глубокий анализ сна: извлечение метрик из фото и сохранение в БД.
Объединяет парсинг (Gemini) и запись в sleep_extractions.
"""
import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sleep_extraction import SleepExtraction
from app.schemas.sleep_extraction import SleepExtractionResult
from app.services.gemini_sleep_parser import extract_sleep_data


def _payload_for_storage(result: SleepExtractionResult) -> dict[str, Any]:
    """Словарь для сохранения в БД: только поля схемы, в том числе null."""
    raw = result.model_dump(mode="json")
    return {k: raw.get(k) for k in SleepExtractionResult.model_fields}


async def analyze_and_save_sleep(
    session: AsyncSession,
    user_id: int,
    image_bytes: bytes,
) -> tuple[SleepExtraction, dict]:
    """
    Глубокий анализ фото сна: извлечение метрик (Gemini), сохранение в sleep_extractions,
    возврат записи и extracted_data для ответа API.
    """
    result = extract_sleep_data(image_bytes)
    stored = _payload_for_storage(result)

    record = SleepExtraction(
        user_id=user_id,
        extracted_data=json.dumps(stored, ensure_ascii=False),
    )
    session.add(record)
    await session.flush()

    data = json.loads(record.extracted_data)
    return record, data
