# Отчёт по анализу и оптимизации производительности Smart Trainer

**Дата:** 25 февраля 2026  
**Проект:** Smart Trainer — AI-тренер (FastAPI + React Native/Expo + PostgreSQL)

---

## 1. Обзор проекта

Smart Trainer — кроссплатформенное MVP-приложение AI-тренера для спортсменов. Стек:

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy (async), asyncpg, PostgreSQL
- **Frontend:** React Native / Expo (TypeScript), React Navigation
- **AI:** Google Gemini (анализ фото еды, парсинг сна, оркестратор решений)
- **Интеграции:** Intervals.icu (тренировки, wellness), Strava (активности)
- **Инфра:** Docker Compose, Nginx, APScheduler

---

## 2. Методология анализа

Был проведён ручной аудит всех файлов backend и frontend с фокусом на:

1. **Запросы к БД** — N+1 проблемы, последовательные запросы, отсутствие индексов
2. **Асинхронность** — блокировка event loop, неиспользование concurrency
3. **Сеть** — сжатие ответов, переиспользование HTTP-клиентов
4. **CPU-операции** — обработка изображений в основном потоке
5. **Конфигурация** — пул соединений, повторная инициализация сервисов
6. **Frontend** — лишние ре-рендеры, мемоизация

---

## 3. Обнаруженные проблемы и реализованные оптимизации

### 3.1. N+1 проблема при синхронизации Intervals.icu

**Файл:** `backend/app/services/intervals_sync.py`

**Проблема:**  
При синхронизации wellness-данных из Intervals.icu (до 90 дней) для каждого дня выполнялся отдельный цикл:
1. `SELECT` — найти существующую запись
2. `UPDATE` или `INSERT` — обновить или создать

При 90 днях wellness и ~500 тренировках это давало **~1180 отдельных SQL-запросов**.

**Было (псевдокод):**
```python
for w in wellness_days:  # ~90 итераций
    existing = await session.execute(SELECT ...)  # запрос 1
    if existing:
        existing.ctl = w.ctl  # ORM update → ещё запрос при flush
    else:
        session.add(WellnessCache(...))  # INSERT

for a in activities:  # ~500 итераций
    stmt = pg_insert(Workout).values(...).on_conflict_do_update(...)
    await session.execute(stmt)  # 1 запрос на каждую тренировку
```

**Стало:**
```python
# Один batch INSERT ... ON CONFLICT DO UPDATE на все 90 дней
wellness_rows = [{ ... } for w in wellness_days if w.date]
stmt = pg_insert(WellnessCache).values(wellness_rows).on_conflict_do_update(
    index_elements=["user_id", "date"],
    set_={
        "ctl": excluded.ctl,
        "sleep_hours": func.coalesce(WellnessCache.sleep_hours, excluded.sleep_hours),
        ...
    }
)
await session.execute(stmt)  # 1 запрос вместо ~180
```

**Использован `COALESCE`** для сохранения семантики «обновлять sleep/rhr/hrv только если текущее значение NULL» (Variant A) без дополнительных SELECT.

**Эффект:** ~590 запросов → 2 запроса (батчи по 500). Ускорение синхронизации **в ~100 раз** по количеству round-trip к БД.

---

### 3.2. N+1 проблема при синхронизации Strava

**Файл:** `backend/app/services/strava_sync.py`

**Проблема:**  
Каждая активность (до 365 дней, сотни записей) обрабатывалась индивидуально:

```python
for item in activities:
    existing = await session.execute(SELECT StravaActivity WHERE user_id=... AND strava_id=...)
    if existing:
        row.start_date = ...  # ORM update по полю
        row.name = ...
        # ... 27 полей
    else:
        session.add(StravaActivity(...))
```

**Стало:**
```python
upsert_rows = [{ 27 полей... } for item in activities]
stmt = pg_insert(StravaActivity).values(batch)
stmt = stmt.on_conflict_do_update(
    constraint="uq_strava_activities_user_strava_id",
    set_={col: stmt.excluded[col] for col in update_cols}
)
await session.execute(stmt)
```

**Эффект:** При 200 активностях: 400 запросов (SELECT + UPDATE) → 1 batch INSERT. Ускорение **в ~200 раз** по количеству запросов.

---

### 3.3. Последовательные запросы к БД в оркестраторе

**Файл:** `backend/app/services/orchestrator.py`

**Проблема:**  
Функция `run_daily_decision()` выполняла **9 последовательных** и полностью независимых запросов к БД:

```
[запрос food_sum]       → 50ms
[запрос wellness]       → 50ms  
[запрос sleep]          → 50ms
[запрос user email]     → 50ms
[запрос athlete profile]→ 50ms
[запрос food entries]   → 50ms
[запрос wellness hist]  → 50ms
[запрос workouts]       → 50ms
[запрос intervals creds]→ 50ms
─────────────────────────────
Итого последовательно:    ~450ms
```

**Стало (asyncio.gather):**
```python
(r_food_sum, r_wellness, r_sleep, r_user, r_prof,
 r_food_entries, r_wellness_hist, r_workouts, r_creds
) = await asyncio.gather(
    session.execute(SELECT food_sum ...),
    session.execute(SELECT wellness ...),
    session.execute(SELECT sleep ...),
    session.execute(SELECT user email ...),
    session.execute(SELECT profile ...),
    session.execute(SELECT food entries ...),
    session.execute(SELECT wellness history ...),
    session.execute(SELECT workouts ...),
    session.execute(SELECT creds ...),
)
```

**Эффект:** 9 запросов выполняются параллельно. При среднем времени запроса 50мс: **~450мс → ~50–80мс** (ограничено самым медленным запросом). Ускорение **в 5–9 раз**.

---

### 3.4. Последовательные запросы в контексте чата

**Файл:** `backend/app/api/v1/chat.py`

**Проблема:**  
Функция `_build_athlete_context()` аналогично оркестратору выполняла **8 последовательных** независимых запросов для сборки контекста (профиль, еда, wellness, сон, тренировки).

**Стало:** Все 8 запросов обёрнуты в `asyncio.gather()`.

**Эффект:** Ускорение формирования контекста для AI-чата **в 4–8 раз**.

---

### 3.5. Последовательная обработка пользователей в планировщике

**Файл:** `backend/app/main.py`

**Проблема:**  
Функция `scheduled_orchestrator_run()` (вызывается по cron в 7:00 и 16:00) обрабатывала всех пользователей **последовательно в одной сессии**:

```python
async with async_session_maker() as session:
    users = await session.execute(select(User))
    for user in users.scalars().all():
        await run_daily_decision(session, user.id, date.today())  # ~2-5 сек на юзера (Gemini)
    await session.commit()
```

При 100 пользователях: **~200–500 секунд** (5–8 минут).

**Стало:**
```python
async def _run_for_user(user_id, today, semaphore):
    async with semaphore:
        async with async_session_maker() as session:
            await run_daily_decision(session, user_id, today)
            await session.commit()

sem = asyncio.Semaphore(5)  # макс 5 параллельно
await asyncio.gather(*[_run_for_user(uid, today, sem) for uid in user_ids])
```

**Эффект:** Каждый пользователь получает свою сессию. Семафор ограничивает параллелизм (5), чтобы не перегрузить Gemini API. Ускорение **в ~5 раз** при >5 пользователях. Изоляция ошибок: сбой одного пользователя не блокирует остальных.

---

### 3.6. Отсутствие сжатия HTTP-ответов

**Файл:** `backend/app/main.py`

**Проблема:**  
FastAPI возвращал JSON-ответы без сжатия. Ответы `/wellness` (30 дней), `/workouts` (14 дней), `/chat/history` (50 сообщений) могут достигать 20–100 КБ.

**Стало:**
```python
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=500)
```

**Эффект:** JSON сжимается GZip на лету для ответов >500 байт. Типичное сжатие JSON: **60–80%**. Ответ 50 КБ → ~10–15 КБ. Ускоряет передачу по мобильной сети.

---

### 3.7. Блокировка event loop при обработке изображений

**Файл:** `backend/app/services/image_resize.py`

**Проблема:**  
Ресайз изображений через Pillow — **CPU-bound операция**, которая выполнялась синхронно в основном async event loop:

```python
def resize_image_for_ai(image_bytes: bytes, ...) -> bytes:
    img = Image.open(io.BytesIO(image_bytes))
    img.load()       # CPU: декодирование JPEG
    img = img.resize(...)  # CPU: Lanczos ресемплинг
    img.save(buf, format="JPEG", ...)  # CPU: кодирование JPEG
```

Для изображения 4000x3000 это может занять **200–500 мс** блокировки event loop, задерживая все остальные запросы.

**Стало:**
```python
async def resize_image_for_ai_async(image_bytes, ...) -> bytes:
    return await run_in_threadpool(_resize_sync, image_bytes, ...)
```

Эндпоинты `/nutrition/analyze`, `/photo/analyze`, `/photo/analyze-sleep` обновлены на `await resize_image_for_ai_async(...)`.

**Эффект:** Event loop остаётся свободным во время ресайза. Другие запросы не блокируются. Sync-версия сохранена для обратной совместимости.

---

### 3.8. Настройка пула соединений БД

**Файл:** `backend/app/db/session.py`

**Проблема:**

| Параметр       | Было | Проблема                          |
|----------------|------|-----------------------------------|
| `pool_size`    | 5    | Мало для параллельных запросов    |
| `max_overflow` | 10   | Мало при пиковых нагрузках        |
| `pool_recycle` | —    | Не задан, «мёртвые» соединения   |

**Стало:**

| Параметр       | Стало | Обоснование                                    |
|----------------|-------|------------------------------------------------|
| `pool_size`    | 10    | Поддержка asyncio.gather (до 9 параллельных)   |
| `max_overflow` | 20    | Запас для пиковых нагрузок                     |
| `pool_recycle` | 1800  | Переподключение каждые 30 мин (stale conn)     |

**Эффект:** Устранение ошибок при параллельных запросах, предотвращение «мёртвых» соединений.

---

### 3.9. Многократная конфигурация Gemini API

**Файлы:** `gemini_nutrition.py`, `gemini_photo_analyzer.py`, `gemini_photo_classifier.py`, `gemini_sleep_parser.py`, `orchestrator.py`, `chat.py`

**Проблема:**  
На **каждый** запрос к Gemini API вызывался `genai.configure(api_key=...)` — это выполняет внутреннюю инициализацию SDK. При 4 типах запросов (еда, сон, классификация, оркестратор) × N пользователей это лишняя работа.

**Стало:**  
`genai.configure()` вызывается **один раз** при старте приложения (в `lifespan`):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    ...
    if settings.google_gemini_api_key:
        import google.generativeai as genai
        genai.configure(api_key=settings.google_gemini_api_key)
```

Из 6 сервисных файлов удалены `_configure_genai()` и `genai.configure()`.

**Эффект:** Устранена избыточная инициализация SDK на каждый запрос.

---

### 3.10. Frontend: лишние ре-рендеры компонентов

**Файл:** `frontend/src/screens/DashboardScreen.tsx`

**Проблема:**  
`DashboardScreen` — монолитный компонент (~1100 строк) с множеством вложенных компонентов (`NutritionProgressBar`, `EditFoodEntryModal`, `EditWellnessModal`, `AddWorkoutModal`). При любом изменении state все вложенные компоненты **пересоздавались**, т.к. не были обёрнуты в `React.memo`.

**Стало:**

```tsx
const NutritionProgressBar = memo(function NutritionProgressBar({ ... }) { ... });
const EditFoodEntryModal = memo(function EditFoodEntryModal({ ... }) { ... });
const EditWellnessModal = memo(function EditWellnessModal({ ... }) { ... });
const AddWorkoutModal = memo(function AddWorkoutModal({ ... }) { ... });
```

Дополнительно — `useMemo` для вычисляемых целей по питанию:

```tsx
const calorieGoal = useMemo(() => athleteProfile?.nutrition_goals?.calorie_goal ?? CALORIE_GOAL, [athleteProfile]);
```

**Эффект:** Модальные окна и прогресс-бары не ре-рендерятся при изменении несвязанного state (например, при обновлении списка тренировок не пересоздаётся NutritionProgressBar).

---

## 4. Что уже было сделано хорошо (не требует изменений)

| Компонент                  | Описание                                                     |
|----------------------------|--------------------------------------------------------------|
| **Shared HTTP Client**     | Один `httpx.AsyncClient` на весь app lifecycle               |
| **Async DB**               | SQLAlchemy async + asyncpg                                   |
| **Индексы БД**             | Composite indexes на часто запрашиваемые колонки              |
| **Gemini retry**           | Экспоненциальный backoff при 429/5xx (3 попытки)             |
| **Threadpool для Gemini**  | `run_in_threadpool()` для блокирующего `generate_content`    |
| **Wellness кэш**           | `WellnessCache` предотвращает лишние запросы к API           |
| **Strava rate limiter**    | In-memory трекинг 200/15мин + 2000/день                     |
| **Очередь синхронизации**  | `StravaSyncQueue` для отложенной обработки при rate limit    |

---

## 5. Сводная таблица оптимизаций

| # | Проблема | Файл | Было | Стало | Ожидаемый эффект |
|---|----------|------|------|-------|------------------|
| 1 | N+1 Intervals wellness | `intervals_sync.py` | ~180 SELECT+UPDATE | 1 batch INSERT | ~100x меньше запросов |
| 2 | N+1 Intervals workouts | `intervals_sync.py` | ~500 INSERT по одному | 1 batch INSERT | ~500x меньше запросов |
| 3 | N+1 Strava activities | `strava_sync.py` | ~400 SELECT+UPDATE | 1 batch INSERT | ~200x меньше запросов |
| 4 | Последовательные запросы оркестратора | `orchestrator.py` | 9 sequential | asyncio.gather | 5–9x быстрее |
| 5 | Последовательные запросы чата | `chat.py` | 8 sequential | asyncio.gather | 4–8x быстрее |
| 6 | Последовательная обработка юзеров | `main.py` | for user in users | gather + semaphore(5) | ~5x быстрее |
| 7 | Нет сжатия ответов | `main.py` | — | GZipMiddleware(500) | 60–80% меньше трафик |
| 8 | Блокировка event loop | `image_resize.py` | sync в main thread | run_in_threadpool | не блокирует |
| 9 | Малый пул БД | `session.py` | pool=5, overflow=10 | pool=10, overflow=20, recycle=1800 | стабильность |
| 10 | Повторная конфигурация Gemini | 6 файлов | genai.configure() × N | 1 раз при старте | устранена избыточность |
| 11 | Лишние ре-рендеры | `DashboardScreen.tsx` | без memo | React.memo + useMemo | плавнее UI |

---

## 7. Рекомендации на будущее

1. **Миграция с `google.generativeai` на `google.genai`** — текущий SDK deprecated (FutureWarning в тестах). Новый SDK поддерживает нативный async.

2. **Redis-кэш для горячих данных** — профиль атлета и wellness сегодня запрашиваются на каждый запрос чата/оркестратора. Кэширование на 5–10 минут снизит нагрузку на БД.

3. **Потоковый ответ AI чата** — вместо ожидания полного ответа Gemini, использовать `stream=True` и SSE для мгновенной обратной связи в UI.

4. **Пагинация тяжёлых списков** — эндпоинт `GET /workouts` возвращает все тренировки за период без лимита. Добавить `limit` + `offset` / cursor pagination.

5. **CDN для статики** — React Native web-билд раздаётся через Nginx. Подключение CDN (CloudFront/Cloudflare) ускорит загрузку.

6. **Мониторинг** — добавить `prometheus-fastapi-instrumentator` для метрик (latency p50/p95/p99, count, DB pool usage).

---