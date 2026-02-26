# Единая схема сна

## Источник истины

**«Сон на дату D»** — одна запись на `(user_id, date)` в таблице **wellness_cache** (поле `sleep_hours`). Чтение сна для дашборда, чата и оркестратора выполняется только из wellness_cache.

## Запись

- **Ручной ввод** (PUT /wellness): создаётся/обновляется строка wellness_cache на выбранную дату.
- **Синк Intervals.icu**: в wellness_cache подставляются только те значения sleep_hours/rhr/hrv, которых ещё нет (coalesce).
- **Сохранение сна с фото**: при записи в `sleep_extractions` дополнительно выполняется upsert в wellness_cache:
  - дата: `extraction.date` из результата парсера (при отсутствии — дата «сегодня»);
  - значение: `sleep_hours = actual_sleep_hours ?? sleep_hours` из extraction;
  - существующие в wellness_cache значения не перетираются (coalesce).

Таблица `sleep_extractions` остаётся хранилищем «сырых» данных с фото; дублирование в wellness_cache делается в сервисе `sleep_analysis` при каждом сохранении (save_sleep_result, analyze_and_save_sleep).

## Чтение

- Дашборд «Сегодня» — только GET /wellness, отображается `wellnessToday.sleep_hours`.
- Чат и оркестратор — только wellness_cache на сегодня; fallback на sleep_extractions не используется.

## Конвенция дат

- **wellness_cache.date** — календарная дата дня.
- При сохранении из фото в wellness_cache записывается дата из поля `date` результата парсера (дата сна). Если в UI нужен «сон прошлой ночи» на экране «Сегодня», это можно решать отдельно (например, показ wellness за вчера).
