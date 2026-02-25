# Анализ производительности и рекомендации по оптимизации

## Содержание
1. [Обзор архитектуры](#обзор-архитектуры)
2. [Анализ промтов (AI)](#анализ-промтов-ai)
3. [Выявленные узкие места](#выявленные-узкие-места)
4. [Рекомендации по ускорению](#рекомендации-по-ускорению)
5. [Приоритеты реализации](#приоритеты-реализации)

---

## Обзор архитектуры

**Smart Trainer** — AI-тренер для спортсменов с интеграциями:
- **Gemini AI**: анализ фото еды, данных сна, оркестратор тренировок, чат
- **Intervals.icu**: wellness, CTL/ATL/TSB, планы тренировок
- **Strava**: активности, профиль атлета
- **PostgreSQL**: хранение данных

### Основные AI-сервисы

| Сервис | Файл | Модель | Задача |
|--------|------|--------|--------|
| Анализ питания | `gemini_nutrition.py` | gemini-2.0-flash | Анализ фото еды → JSON |
| Классификация фото | `gemini_photo_analyzer.py` | gemini-2.0-flash | Еда/Сон + анализ |
| Извлечение сна | `gemini_sleep_parser.py` | gemini-2.0-flash | Скриншот трекера → JSON |
| Оркестратор | `orchestrator.py` | gemini-2.0-flash | Go/Modify/Skip решение |
| Чат с тренером | `chat.py` | gemini-2.0-flash | Консультации |

---

## Анализ промтов (AI)

### 1. Промт анализа питания (`gemini_nutrition.py`)

```
Размер: ~450 символов
max_output_tokens: 1024
temperature: 0.2
```

**Оценка:** ✅ Оптимальный
- Короткий, чёткий промт
- Строгий JSON-формат
- Нет избыточных инструкций

### 2. Промт классификатора/анализатора (`gemini_photo_analyzer.py`)

```
Размер: ~2000 символов
max_output_tokens: 4096
temperature: 0.2
```

**Оценка:** ⚠️ Требует оптимизации
- Объединённый промт (классификация + анализ) — хорошо для latency
- Слишком детальные инструкции для sleep (50+ полей)
- Высокий `max_output_tokens` (4096) при типичном ответе ~500-1000 токенов

**Рекомендация:**
```python
# Было
"max_output_tokens": 4096

# Рекомендуется
"max_output_tokens": 2048  # Достаточно для всех случаев
```

### 3. Промт извлечения сна (`gemini_sleep_parser.py`)

```
Размер: ~2200 символов
max_output_tokens: 4096
temperature: 0.2
```

**Оценка:** ⚠️ Избыточность
- Очень детальный (нужен для точности)
- Дублирует функционал `gemini_photo_analyzer.py`
- Используется только для legacy-эндпоинта

**Рекомендация:** Унифицировать с `gemini_photo_analyzer.py`, удалить дублирование.

### 4. Промт оркестратора (`orchestrator.py`)

```
Размер промта: ~800 символов
Размер контекста: ~3000-10000 символов (зависит от данных)
max_output_tokens: 2048
temperature: 0.3
```

**Оценка:** ⚠️ Основной bottleneck

**Проблемы:**
1. **Большой контекст** — передаётся много данных:
   - Athlete profile
   - Food today (sum + entries)
   - Wellness today + history (7 дней)
   - CTL/ATL/TSB
   - Strava activities (14 дней, до 50 записей)
   - Events today

2. **Много DB-запросов** (8+ запросов перед вызовом AI):
   - FoodLog (сумма)
   - FoodLog (entries)
   - WellnessCache (today)
   - SleepExtraction (latest)
   - User email
   - AthleteProfile
   - WellnessCache (history 7 days)
   - StravaActivity (14 days)
   - IntervalsCredentials + API call

### 5. Промт чата (`chat.py`)

```
Размер промта: ~150 символов
Размер контекста: ~5000-15000 символов
```

**Оценка:** ⚠️ Похожие проблемы как у оркестратора

**Проблемы:**
1. Дублирование кода `_build_athlete_context()` ≈ `_build_context()` в оркестраторе
2. Ещё больше данных (30 дней сна, 14 дней wellness)
3. Нет стриминга — пользователь ждёт полный ответ

---

## Выявленные узкие места

### 🔴 Критические (High Impact)

#### 1. Последовательные DB-запросы
**Проблема:** 8-10 запросов выполняются последовательно перед AI-вызовом.

**Текущий код (orchestrator.py):**
```python
# Запрос 1
r = await session.execute(select(FoodLog.calories...).where(...))
# Запрос 2
r = await session.execute(select(WellnessCache).where(...))
# Запрос 3
r = await session.execute(select(SleepExtraction...).where(...))
# ... и так далее
```

**Влияние:** +200-500ms к каждому вызову оркестратора/чата.

#### 2. Синхронный AI-вызов
**Проблема:** `model.generate_content()` блокирует event loop.

**Влияние:** При высокой нагрузке — деградация производительности.

#### 3. Избыточный контекст для AI
**Проблема:** В контекст передаётся больше данных, чем нужно.

**Пример:** 50 Strava-активностей за 14 дней с полными деталями (~5000 токенов), когда достаточно 7-10 последних (~500 токенов).

### 🟡 Средние (Medium Impact)

#### 4. Отсутствие кэширования
- Wellness history запрашивается при каждом вызове
- Athlete profile не кэшируется
- Strava activities перезапрашиваются

#### 5. Дублирование кода
- `_build_context()` в `orchestrator.py`
- `_build_athlete_context()` в `chat.py`
- Почти идентичная логика, разные реализации

#### 6. Image resize — CPU-bound операция
**Проблема:** `resize_image_for_ai()` выполняется синхронно в async endpoint.

### 🟢 Низкие (Low Impact)

#### 7. JSON-парсинг с fallback
**Проблема:** `_parse_sleep_json()` пробует несколько вариантов парсинга.

**Влияние:** Минимальное (~1-5ms).

---

## Рекомендации по ускорению

### 1. Параллельные DB-запросы

**Приоритет:** 🔴 Высокий  
**Ожидаемое ускорение:** 200-400ms  
**Сложность:** Низкая

```python
# Было (последовательно)
food_sum = await session.execute(...)
wellness = await session.execute(...)
profile = await session.execute(...)

# Рекомендуется (параллельно)
import asyncio

async def run_daily_decision(...):
    # Параллельные запросы
    food_task = session.execute(select(FoodLog...).where(...))
    wellness_task = session.execute(select(WellnessCache).where(...))
    profile_task = session.execute(select(AthleteProfile).where(...))
    strava_task = session.execute(select(StravaActivity...).where(...))
    
    food_r, wellness_r, profile_r, strava_r = await asyncio.gather(
        food_task, wellness_task, profile_task, strava_task
    )
```

### 2. Оптимизация контекста AI

**Приоритет:** 🔴 Высокий  
**Ожидаемое ускорение:** 100-300ms (меньше токенов = быстрее)  
**Сложность:** Средняя

#### 2.1 Ограничить Strava activities

```python
# Было
.limit(50)  # 50 активностей за 14 дней

# Рекомендуется
.limit(10)  # Последние 10 достаточно для решения

# Или компактный формат
strava_activities = [
    {
        "date": d.isoformat(),
        "type": act_type,
        "tss": tss,
        "duration_min": moving_sec // 60 if moving_sec else None,
    }
    for row in r_strava.all()
]
```

#### 2.2 Агрегировать wellness history

```python
# Было: полный JSON всех 7 дней
wellness_history = [{"date": ..., "sleep_hours": ..., "rhr": ..., ...}, ...]

# Рекомендуется: агрегаты
wellness_summary = {
    "avg_sleep_7d": 7.2,
    "avg_hrv_7d": 45,
    "trend_sleep": "stable",  # improving/stable/declining
    "min_sleep_7d": 5.5,
}
```

#### 2.3 Убрать дублирование food_sum и food_entries

```python
# Было: и сумма, и список
"## Food today (sum)", json.dumps(food_sum),
"## Food today (entries)", json.dumps(food_entries),

# Рекомендуется: только сумма (или краткий список)
"## Food today",
f"Total: {food_sum['calories']:.0f} kcal, {food_sum['protein_g']:.0f}g protein"
```

### 3. Кэширование данных

**Приоритет:** 🟡 Средний  
**Ожидаемое ускорение:** 50-200ms  
**Сложность:** Средняя

#### 3.1 In-memory cache для wellness history

```python
from functools import lru_cache
from datetime import date, timedelta
import asyncio

# Redis или in-memory cache
_wellness_cache: dict[tuple[int, date], dict] = {}

async def get_cached_wellness_summary(session, user_id: int, today: date) -> dict:
    cache_key = (user_id, today)
    if cache_key in _wellness_cache:
        return _wellness_cache[cache_key]
    
    # Fetch and compute
    summary = await _compute_wellness_summary(session, user_id, today)
    _wellness_cache[cache_key] = summary
    return summary
```

#### 3.2 Предварительный расчёт (background job)

```python
# В scheduler (main.py)
async def precompute_daily_context():
    """Run at 06:00 before orchestrator runs at 07:00"""
    async with async_session_maker() as session:
        for user in await get_all_users(session):
            await precompute_user_context(session, user.id)

scheduler.add_job(precompute_daily_context, "cron", hour=6, minute=0)
```

### 4. Асинхронный Gemini-вызов

**Приоритет:** 🟡 Средний  
**Ожидаемое ускорение:** Улучшение throughput при нагрузке  
**Сложность:** Низкая

```python
# Было (sync в async функции)
response = model.generate_content(contents)

# Рекомендуется (async)
response = await asyncio.to_thread(model.generate_content, contents)

# Или использовать async API (если доступно в google-generativeai)
response = await model.generate_content_async(contents)
```

### 5. Image resize в thread pool

**Приоритет:** 🟢 Низкий  
**Ожидаемое ускорение:** 50-100ms  
**Сложность:** Низкая

```python
# Было
image_bytes = resize_image_for_ai(image_bytes)

# Рекомендуется
import asyncio
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=4)

async def resize_image_async(image_bytes: bytes) -> bytes:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, resize_image_for_ai, image_bytes)

# В endpoint
image_bytes = await resize_image_async(image_bytes)
```

### 6. Стриминг ответов чата

**Приоритет:** 🟡 Средний  
**Ожидаемое улучшение:** UX (perceived latency)  
**Сложность:** Средняя

```python
from fastapi.responses import StreamingResponse

@router.post("/send-stream")
async def send_message_stream(...):
    async def generate():
        response = model.generate_content(prompt, stream=True)
        for chunk in response:
            yield f"data: {json.dumps({'text': chunk.text})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

### 7. Объединение context builders

**Приоритет:** 🟢 Низкий  
**Ожидаемое улучшение:** Maintainability  
**Сложность:** Низкая

```python
# Новый файл: app/services/context_builder.py

async def build_athlete_context(
    session: AsyncSession,
    user_id: int,
    today: date,
    include_food_entries: bool = True,
    include_strava: bool = True,
    strava_limit: int = 10,
    wellness_days: int = 7,
    sleep_days: int = 30,
) -> dict:
    """Единый builder контекста для оркестратора и чата."""
    # Параллельные запросы
    results = await asyncio.gather(
        _fetch_food_data(session, user_id, today, include_food_entries),
        _fetch_wellness_data(session, user_id, today, wellness_days),
        _fetch_athlete_profile(session, user_id),
        _fetch_strava_activities(session, user_id, today, strava_limit) if include_strava else None,
    )
    return {
        "food": results[0],
        "wellness": results[1],
        "profile": results[2],
        "strava": results[3],
    }
```

### 8. Оптимизация промтов

**Приоритет:** 🟡 Средний  
**Ожидаемое ускорение:** 50-150ms  

#### 8.1 Сократить max_output_tokens

```python
# gemini_photo_analyzer.py
GENERATION_CONFIG = {
    "max_output_tokens": 2048,  # было 4096
}

# orchestrator.py  
GENERATION_CONFIG = {
    "max_output_tokens": 1024,  # было 2048, ответ обычно ~200-400 токенов
}
```

#### 8.2 Сократить system prompt оркестратора

```python
# Было (~800 символов, много повторений)
SYSTEM_PROMPT = """You are a sports physiologist coach..."""

# Рекомендуется (~400 символов)
SYSTEM_PROMPT = """Sports coach. Task: decide Go/Modify/Skip for today's workout.

Rules:
- Level 1 (blocks hard training): poor sleep/HRV/RHR, calorie deficit
- Level 2 (adjusts intensity): TSS, CTL, ATL
- Level 3 (diagnostic): prefer polarised, avoid Zone 3

Output JSON only:
{"decision":"Go|Modify|Skip","reason":"...","modified_plan":null|{...},"suggestions_next_days":null|"..."}"""
```

---

## Приоритеты реализации

### Фаза 1: Quick Wins (1-2 дня)

| # | Задача | Ускорение | Сложность |
|---|--------|-----------|-----------|
| 1 | Параллельные DB-запросы в orchestrator | 200-400ms | Низкая |
| 2 | Уменьшить strava_limit до 10 | 50-100ms | Тривиальная |
| 3 | Уменьшить max_output_tokens | 50-100ms | Тривиальная |
| 4 | Image resize в thread pool | 50-100ms | Низкая |

**Итого Фаза 1:** ~350-700ms ускорение

### Фаза 2: Оптимизация (3-5 дней)

| # | Задача | Ускорение | Сложность |
|---|--------|-----------|-----------|
| 5 | Агрегация wellness/strava в контексте | 100-200ms | Средняя |
| 6 | Единый context builder | Maintainability | Средняя |
| 7 | Кэширование wellness summary | 50-100ms | Средняя |
| 8 | Async Gemini calls | Throughput | Низкая |

### Фаза 3: UX улучшения (опционально)

| # | Задача | Улучшение | Сложность |
|---|--------|-----------|-----------|
| 9 | Стриминг ответов чата | Perceived latency | Средняя |
| 10 | Background precompute | -200ms в пике | Высокая |

---

## Метрики для отслеживания

```python
# Добавить в app/middleware/timing.py
import time
import logging

logger = logging.getLogger("performance")

async def log_endpoint_timing(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "endpoint=%s method=%s duration_ms=%.1f",
        request.url.path, request.method, duration_ms
    )
    return response
```

**Ключевые эндпоинты для мониторинга:**
- `POST /api/v1/photo/analyze` — целевое время: <3s
- `POST /api/v1/chat/send` — целевое время: <2s
- `POST /api/v1/chat/orchestrator/run` — целевое время: <2s

---

## Заключение

Основные bottlenecks в приложении:

1. **Последовательные DB-запросы** — решается параллелизацией (asyncio.gather)
2. **Избыточный контекст AI** — решается агрегацией и лимитами
3. **Отсутствие кэширования** — решается in-memory или Redis cache

Ожидаемое суммарное ускорение после Фазы 1+2: **500-1000ms** (30-50% быстрее).

Модель `gemini-2.0-flash` — оптимальный выбор для баланса скорости и качества. Переход на более быструю модель (если появится) даст дополнительный прирост.
