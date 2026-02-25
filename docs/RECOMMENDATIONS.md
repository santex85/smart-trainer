# Рекомендации по промптам и ускорению приложения (Smart Trainer)

Документ собран по результатам обзора репозитория: `backend/` (FastAPI + PostgreSQL + Gemini + Strava/Intervals) и `frontend/` (Expo/React Native).

## TL;DR (что даст самый быстрый эффект)

1. **Убрать блокировку event loop из-за Gemini (HIGH)**: сейчас Gemini вызывается синхронно через `model.generate_content(...)` внутри async‑эндпоинтов. Это может “замораживать” весь backend при 2+ одновременных запросах.
2. **Сжать/сделать адаптивным контекст для чата и orchestrator (HIGH)**: меньше SQL + меньше токенов → ниже latency/стоимость и меньше ошибок JSON.
3. **Добавить ключевые индексы в БД (MED/HIGH)**: запросы “по пользователю + по дате/времени” должны быть быстрыми с ростом данных.
4. **Разделить sleep extraction на режимы lite/full (MED)**: текущий промпт “вытащи всё” делает ответы длинными и медленными.

---

## 1) Где сейчас формируются промпты и вызывается LLM

### Backend (Gemini)

- **Чат**: `backend/app/api/v1/chat.py`
  - `CHAT_SYSTEM` и формирование промпта: контекст + сообщение пользователя.
  - Вызов: `model.generate_content(prompt)`
- **Orchestrator**: `backend/app/services/orchestrator.py`
  - `SYSTEM_PROMPT` (строгий JSON) + сбор контекста из БД/Intervals/Strava
  - Вызов: `model.generate_content([SYSTEM_PROMPT, "Context..."])`
- **Питание**: `backend/app/services/gemini_nutrition.py`
  - `SYSTEM_PROMPT` (строгий JSON)
  - Вызов: `model.generate_content([SYSTEM_PROMPT, image_part])`
- **Сон**: `backend/app/services/gemini_sleep_parser.py`
  - `SLEEP_EXTRACT_PROMPT` (очень “широкий”)
  - Вызов: `model.generate_content([SLEEP_EXTRACT_PROMPT, image_part])`
- **Единый вызов фото (food|sleep)**: `backend/app/services/gemini_photo_analyzer.py`
  - `SYSTEM_PROMPT` (длинный; просит и классификацию, и извлечение)
  - Вызов: `model.generate_content([SYSTEM_PROMPT, image_part])`

---

## 2) Ускорение backend: критические узкие места

### 2.1. Блокирующие Gemini‑вызовы в async коде (HIGH)

**Проблема**: `google-generativeai` вызывается синхронно (`generate_content`) в async‑эндпоинтах и сервисах. Это блокирует event loop и ухудшает конкурентность.

**Где**:
- `backend/app/api/v1/chat.py`
- `backend/app/services/orchestrator.py`
- `backend/app/services/gemini_*`

**Решение** (выбрать один вариант):
- **Вариант A (быстрый и безопасный)**: выносить `generate_content(...)` в threadpool (`anyio.to_thread.run_sync` / `starlette.concurrency.run_in_threadpool`).
- **Вариант B (лучший)**: перейти на асинхронный метод/клиент Gemini (если доступно в используемой версии SDK) или вынести AI‑задачи в отдельный worker (очередь/процесс).

**Критично**: то же относится к планировщику в `backend/app/main.py` (APScheduler работает в том же процессе).

### 2.2. Слишком большой контекст в чат/оркестратор (HIGH)

**Проблема**: контекст строится из множества таблиц (еда/сон/велнес/Strava/Intervals) и превращается в большой текст. Это:
- увеличивает latency (БД + токены),
- повышает стоимость,
- повышает вероятность “плохого” JSON (особенно в orchestrator).

**Решение**:
- сделать **адаптивную сборку контекста**: под “сон” не тащить питание/Strava целиком и наоборот;
- добавлять **сжатую сводку** (например, “today summary + last 7 days” вместо сырых массивов);
- ограничивать количество элементов (например, 10 последних тренировок вместо 50, 7 дней вместо 14/30, и т.д.).

### 2.3. Индексы/уникальность в БД (MED/HIGH)

Рекомендуемые индексы (ориентир — частые запросы в коде):
- `food_log (user_id, timestamp)` — используется фильтрация по пользователю и диапазону времени (`/nutrition/day`, контекст чата/оркестратора).
- `chat_messages (user_id, timestamp)` — история чата сортируется по времени.
- `sleep_extractions (user_id, created_at)` — выборки по пользователю и диапазону.
- `strava_activities (user_id, start_date)` — выборки по пользователю и диапазону дат.
- `wellness_cache`: **UniqueConstraint(user_id, date)** + индекс `(user_id, date)` (дедупликация и быстрый доступ).

### 2.4. Пул соединений SQLAlchemy (MED)

Сейчас engine создаётся без явных параметров (`backend/app/db/session.py`).

Рекомендация:
- настроить `pool_size`, `max_overflow`, `pool_pre_ping`;
- в production отдельно подумать о `statement_timeout` на стороне Postgres.

### 2.5. HTTP клиенты (LOW/MED)

В `Intervals/Strava` создаётся новый `httpx.AsyncClient` на каждый запрос. Это упрощает код, но:
- дороже по TCP/TLS,
- увеличивает latency.

Рекомендация: переиспользовать `AsyncClient` (глобальный/lifespan‑scope) или иметь thin‑wrapper, который держит клиент живым.

---

## 3) Рекомендации по промптам (качество + скорость)

### 3.1. Chat coach (`backend/app/api/v1/chat.py`)

**Сейчас**: один системный текст + огромный “Context:” + сообщение пользователя.

Рекомендации:
- **Сделать ответы короче по умолчанию**: 3–6 буллетов и 1 вопрос, если данных не хватает.
- **Запретить галлюцинации цифр**: “если числа отсутствуют — скажи, что данных нет”.
- **Адаптивный контекст**: включать только нужные секции (например, по intent: nutrition/sleep/training plan).
- Если нужно удерживать диалог — хранить/передавать **сводку** последних N сообщений, а не растить контекст бесконечно.

### 3.2. Orchestrator (`backend/app/services/orchestrator.py`)

Сильная сторона: строгий JSON и явная иерархия.

Рекомендации:
- Добавить правило “**insufficient data** → Modify/Skip” (с безопасной формулировкой).
- Добавить 1–2 **few‑shot примера** строго в JSON (уменьшает parse errors).
- Уменьшить `max_output_tokens`: ответ короткий, 2048 обычно избыточно.
- Фолбэк на ошибку парсинга сейчас **default Go** — для safety лучше “Modify” или “Skip”.

### 3.3. Nutrition (`backend/app/services/gemini_nutrition.py`)

Рекомендации:
- Явно описать поведение при плохом фото: “верни ошибку/unknown” вместо случайных чисел.
- Чётче закрепить единицы и допустимые диапазоны (например, ограничить порцию сверху, если это важно для UX).
- При необходимости добавить поле “confidence” (если вы готовы менять API/схему).

### 3.4. Sleep extraction (`backend/app/services/gemini_sleep_parser.py`)

**Проблема**: промпт просит “EVERY number, label, and graph” + таймлайн фаз → длинные ответы и медленнее.

Рекомендации:
- Сделать **2 режима**:
  - **lite** (по умолчанию): `date`, `sleep_hours`, `actual_sleep_hours`, `quality_score`, `bedtime`, `wake_time`, опционально `deep/rem/light/awake`.
  - **full**: как сейчас (факторы, таймлайн, заметки).
- Явно сказать модели: “лучше `null`, чем угадывать”.

### 3.5. Single-call фото анализ (`backend/app/services/gemini_photo_analyzer.py`)

Плюс: 1 round‑trip.
Минус: очень длинный системный промпт → latency.

Рекомендации:
- Сократить промпт и/или сделать поля опциональными (для speed‑path).
- Альтернатива: 2‑шаговая схема (классификация → специализированный промпт) может быть быстрее/надёжнее, если классификатор очень лёгкий и быстрый.

---

## 4) Улучшения UX/архитектуры для “ощущения скорости”

- **Job‑модель для AI**: `POST /photo/analyze` возвращает `job_id`, UI опрашивает `GET /jobs/{id}`. Это снимает давление на таймауты и делает прогресс понятным.
- **Показывать стадии**: upload → analyze → parse → save.
- **Кэш/TTL для некоторых GET**:
  - wellness (обновляется редко) — `Cache-Control` и/или ETag,
  - events — TTL 1–5 минут.

---

## 5) План внедрения (приоритеты)

### P0 (1–2 дня, максимальный выигрыш)
- Перевести Gemini вызовы на неблокирующие (threadpool/async/worker).
- Добавить таймауты/ретраи/circuit breaker.
- Сжать контекст orchestrator и чата.

### P1 (2–4 дня)
- Индексы и уникальность в БД.
- Разделить sleep extraction на lite/full.
- Few-shot для orchestrator JSON + безопасный фолбэк (не “Go”).

### P2 (неделя+)
- Вынести AI/синк в фоновые воркеры (очередь).
- Инструментировать метрики (p95 latency по эндпоинтам, время БД, время LLM, размер контекста/токены).

---

## 6) Что и как измерять (чтобы оптимизация была управляемой)

- **Backend метрики**:
  - p50/p95 latency по `/api/v1/photo/analyze`, `/api/v1/nutrition/analyze`, `/api/v1/chat/send`, `/api/v1/chat/orchestrator/run`
  - время сборки контекста (SQL) отдельно от времени LLM
  - размеры payload: байты изображения после `resize_image_for_ai`, длина контекста (символы)
- **LLM метрики**:
  - доля JSON parse errors
  - доля пустых ответов/таймаутов
  - среднее/перцентиль время ответа
- **DB метрики**:
  - top slow queries (pg_stat_statements)
  - использование индексов

