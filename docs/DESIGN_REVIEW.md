# Smart Trainer — Комплексный аудит дизайна и рекомендации

**Дата:** 2026-02-21
**Версия проекта:** 0.1.0 (MVP)
**Методология:** Оценка по 9 направлениям — Security, Architecture, API Design, Database, Performance, Error Handling, UX/UI, DevOps/Infra, Code Quality.

---

## Сводка

| Направление | Оценка | Критические проблемы | Рекомендации |
|---|---|---|---|
| Security | **2/10** | 5 | 8 |
| Architecture | **6/10** | 1 | 5 |
| API Design | **5/10** | 2 | 6 |
| Database | **5/10** | 1 | 5 |
| Performance | **5/10** | 0 | 6 |
| Error Handling | **4/10** | 2 | 4 |
| UX/UI | **6/10** | 0 | 7 |
| DevOps/Infra | **6/10** | 1 | 5 |
| Code Quality | **6/10** | 0 | 5 |

**Общая оценка: 5.0/10** — функциональный MVP с серьёзными проблемами безопасности и рядом архитектурных недоработок, которые необходимо устранить до выхода в production.

---

## 1. Security — КРИТИЧНО (2/10)

### 1.1. Полное отсутствие аутентификации (CRITICAL)

**Проблема:** Ни один endpoint не требует аутентификации. Все API доступны без токена/сессии. Функция `get_current_user_id()` просто берёт первого пользователя из БД.

```python
# backend/app/api/v1/nutrition.py
async def get_current_user_id(session: AsyncSession) -> int:
    r = await session.execute(select(User).limit(1))
    user = r.scalar_one_or_none()
    ...
    return user.id
```

**Последствия:**
- Любой пользователь интернета может читать чужие данные, менять учётные данные Intervals.icu, удалять привязки.
- Подтверждено тестом: `POST /api/v1/intervals/link` без токена успешно перезаписал credentials пользователя.

**Рекомендация:** Реализовать JWT-based аутентификацию (библиотека `python-jose` уже в `requirements.txt`, но не используется). Минимальный вариант:
1. `POST /api/v1/auth/register` и `POST /api/v1/auth/login` → выдача JWT.
2. Dependency `get_current_user` проверяет `Authorization: Bearer <token>` через `python-jose`.
3. Все endpoint-ы используют `Depends(get_current_user)`.

### 1.2. IDOR — передача `user_id` через query/form (CRITICAL)

**Проблема:** Почти каждый endpoint принимает `user_id` как опциональный параметр, позволяя обращаться к данным произвольного пользователя.

```python
# GET /api/v1/nutrition/day?user_id=999  → данные другого пользователя
# POST /api/v1/intervals/link?user_id=1  → перезапись чужих credentials
```

**Рекомендация:** Удалить `user_id` из всех публичных endpoint-ов. Идентификатор пользователя должен извлекаться **только** из JWT-токена.

### 1.3. CORS allow_origins=["*"] (HIGH)

**Проблема:**

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    ...
)
```

`allow_origins=["*"]` + `allow_credentials=True` — потенциальный вектор для CSRF-атак.

**Рекомендация:** Ограничить origins конкретными доменами фронтенда (`http://localhost`, production URL). Использовать переменную окружения `ALLOWED_ORIGINS`.

### 1.4. API-ключ Gemini в .env, ENCRYPTION_KEY пуст (HIGH)

**Проблема:**
- В `.env` лежит настоящий API-ключ Google Gemini в открытом виде.
- `ENCRYPTION_KEY` пуст — данные Intervals.icu хранятся в БД как **plaintext**.

```python
# backend/app/services/crypto.py
def encrypt_value(value: str) -> str:
    f = get_fernet()
    if f is None:
        return value  # dev: no key → store plaintext
```

**Рекомендация:**
1. Сгенерировать ENCRYPTION_KEY (уже есть инструкция в `.env`).
2. Использовать secrets manager (AWS Secrets Manager, HashiCorp Vault) для production.
3. Добавить `.env` в `.gitignore` (если не добавлен) и проверить историю git.

### 1.5. Нет rate limiting (MEDIUM)

**Проблема:** Нет ограничения на количество запросов. Endpoint `/api/v1/nutrition/analyze` вызывает Gemini API — один злоумышленник может истощить quota.

**Рекомендация:** Добавить `slowapi` или middleware для rate limiting (e.g., 10 req/min на analyze, 60 req/min на GET).

### 1.6. Нет валидации Content-Type в chat endpoint (LOW)

**Проблема:** `POST /api/v1/chat/send` принимает произвольный текст без ограничения длины помимо Pydantic.

**Рекомендация:** Добавить `max_length` к `message` полю в `SendMessageBody`.

### 1.7. `SECRET_KEY` по умолчанию (MEDIUM)

Значение `"change_me_in_production"` в `docker-compose.yml` — если забудут поменять, JWT (когда будет реализован) станет предсказуемым.

**Рекомендация:** Убрать default, сделать обязательным (как `POSTGRES_PASSWORD`).

### 1.8. Нет HTTPS (MEDIUM)

Nginx слушает только порт 80 (HTTP). Для production необходим TLS.

**Рекомендация:** Добавить конфигурацию для Let's Encrypt (certbot) или reverse proxy с TLS termination.

---

## 2. Architecture (6/10)

### 2.1. Дублирование `get_current_user_id()` (MEDIUM)

Функция `get_current_user_id()` скопирована в 3 файла (`nutrition.py`, `intervals.py`, `chat.py`) с идентичной логикой.

**Рекомендация:** Вынести в `app/api/deps.py` как общий dependency:

```python
# app/api/deps.py
async def get_current_user(session: AsyncSession = Depends(get_db)) -> User:
    ...
```

### 2.2. Synchronous Gemini call в `analyze_food_from_image()` (HIGH)

**Проблема:** `model.generate_content()` — блокирующий вызов. Он блокирует event loop FastAPI.

```python
# services/gemini_nutrition.py
response = model.generate_content(contents)  # sync, blocks event loop
```

**Рекомендация:** Использовать `model.generate_content_async()` или обернуть в `asyncio.to_thread()`.

### 2.3. Inline import и конфигурация Gemini при каждом вызове (MEDIUM)

`genai.configure()` вызывается на каждый запрос. В `chat.py` — inline import `google.generativeai`.

**Рекомендация:** Инициализировать Gemini-клиент один раз в `lifespan` и использовать как singleton/dependency.

### 2.4. Нет слоя абстракции для AI-провайдера (LOW)

Прямые вызовы `google.generativeai` разбросаны по 3 файлам. Смена LLM-провайдера потребует правки каждого файла.

**Рекомендация:** Создать `app/services/llm.py` с единым интерфейсом (`generate_text()`, `generate_json()`, `analyze_image()`).

### 2.5. Scheduled jobs тесно связаны с `main.py` (LOW)

Логика расписания (scheduler) находится прямо в `main.py` вместе с бизнес-логикой.

**Рекомендация:** Вынести в `app/scheduler.py` — улучшит тестируемость и читаемость.

### 2.6. Отсутствие dependency injection для сервисов (LOW)

Сервисы импортируются напрямую, что затрудняет моки и тестирование.

**Рекомендация:** Для тестируемости — передавать сервисы через DI (FastAPI Depends).

---

## 3. API Design (5/10)

### 3.1. Нет версионирования на уровне инфраструктуры (LOW)

Prefix `/api/v1` задан вручную. При появлении v2 потребуется дублирование.

**Рекомендация:** Использовать `APIRouter` с автоматическим версионированием или `app.include_router(v2_router, prefix="/api/v2")`.

### 3.2. Inconsistent response models (MEDIUM)

- `GET /intervals/wellness` возвращает `list[dict]` вместо Pydantic-модели.
- `GET /chat/history` возвращает `list[dict]`.
- `POST /chat/send` возвращает `dict`.

**Рекомендация:** Определить Pydantic response models для всех endpoint-ов. Это улучшит документацию OpenAPI и валидацию.

### 3.3. Нет pagination (MEDIUM)

`GET /nutrition/day` возвращает все записи за день без лимита. `GET /chat/history` имеет лимит, но без offset/cursor.

**Рекомендация:** Реализовать cursor-based или offset-based pagination:

```python
@router.get("/history")
async def get_history(limit: int = 50, before_id: int | None = None):
```

### 3.4. Метод POST для idempotent-операции `/intervals/sync` (LOW)

Синхронизация — idempotent операция, но использует POST.

**Рекомендация:** Допустимо для MVP, но документировать idempotency.

### 3.5. Отсутствие DELETE endpoint для food_log (MEDIUM)

Нет возможности удалить ошибочную запись о еде.

**Рекомендация:** Добавить `DELETE /api/v1/nutrition/{entry_id}`.

### 3.6. Нет стандартизированного формата ошибок (MEDIUM)

Ошибки возвращаются в разных форматах: FastAPI `HTTPException`, plain text, Pydantic `ValidationError`.

**Рекомендация:** Стандартизировать:

```json
{"error": {"code": "VALIDATION_ERROR", "message": "...", "details": [...]}}
```

---

## 4. Database (5/10)

### 4.1. Дубликат колонки `rhr` в миграции (BUG)

```python
# alembic/versions/001_initial.py — таблица wellness_cache
sa.Column("rhr", sa.Float(), nullable=True),
sa.Column("rhr", sa.Float(), nullable=True),  # дубликат!
```

**Последствие:** При выполнении Alembic миграции может быть создана таблица с двумя колонками `rhr` (поведение зависит от БД) или ошибка.

**Рекомендация:** Удалить дубликат, создать новую миграцию-фиксацию.

### 4.2. Нет составного уникального индекса `(user_id, date)` на `wellness_cache` (MEDIUM)

Текущие индексы — отдельно по `user_id` и `date`. При повторной синхронизации возможны дубликаты записей (код проверяет вручную через SELECT, но без unique constraint).

**Рекомендация:** Добавить `UniqueConstraint("user_id", "date")` на `wellness_cache`.

### 4.3. `datetime.utcnow` deprecated (LOW)

В моделях используется `default=datetime.utcnow` — deprecated начиная с Python 3.12.

**Рекомендация:** Использовать `default=lambda: datetime.now(timezone.utc)` или `server_default=func.now()`.

### 4.4. Нет soft delete (LOW)

Удаление пользователя каскадно уничтожает все связанные данные.

**Рекомендация:** Для production — добавить `is_deleted` / `deleted_at` поля.

### 4.5. Нет индекса по `food_log.timestamp` (MEDIUM)

Запрос `GET /nutrition/day` фильтрует по `timestamp`, но индекс есть только по `user_id`.

**Рекомендация:** Добавить составной индекс `(user_id, timestamp)` для ускорения запросов.

---

## 5. Performance (5/10)

### 5.1. Блокирующий вызов Gemini API (HIGH)

Как описано в 2.2 — `generate_content()` блокирует event loop. При 2+ одновременных запросах на анализ фото — backend «замрёт».

**Рекомендация:** `generate_content_async()` или `run_in_executor()`.

### 5.2. N+1 запросы в `sync_user_wellness()` (MEDIUM)

Для каждого дня wellness — отдельный SELECT для проверки существования записи:

```python
for w in wellness_days:
    r = await session.execute(
        select(WellnessCache).where(...)
    )
```

При 60 днях = 60 отдельных запросов.

**Рекомендация:** Загрузить все существующие записи одним запросом, построить `dict`, затем batch upsert:

```python
existing = {row.date: row for row in existing_rows}
```

### 5.3. Нет кэширования на уровне API (LOW)

`GET /wellness`, `GET /events` каждый раз обращаются к БД.

**Рекомендация:** Для wellness — HTTP `Cache-Control` header (данные обновляются раз в день). Для events — TTL-кэш (5 мин).

### 5.4. Frontend не оптимизирован для web (LOW)

React Native Web bundle не использует code splitting, lazy loading, или Service Workers.

**Рекомендация:** Для web — рассмотреть Next.js/Remix для SSR или минимум React.lazy для экранов.

### 5.5. Отсутствие connection pooling настройки (LOW)

SQLAlchemy `create_async_engine` создаётся с defaults. Для production — настроить `pool_size`, `max_overflow`.

**Рекомендация:**

```python
engine = create_async_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)
```

### 5.6. Повторная инициализация Gemini на каждый запрос (LOW)

`genai.configure()` вызывается при каждом вызове `analyze_food_from_image()` и `run_daily_decision()`.

**Рекомендация:** Один раз в startup lifespan.

---

## 6. Error Handling (4/10)

### 6.1. Молчаливое проглатывание ошибок в orchestrator (HIGH)

```python
# services/orchestrator.py
try:
    evs = await get_events(...)
except Exception:
    pass  # SWALLOWED — no log, no indication
```

```python
try:
    await create_event(...)
except Exception:
    pass  # log and leave plan unchanged — but no actual log
```

**Последствие:** Ошибки Intervals.icu API никогда не станут видимыми. Пользователь не узнает, что модифицированный план не был отправлен.

**Рекомендация:** Логировать все exceptions, возвращать предупреждение в response.

### 6.2. Default fallback на `Decision.GO` при ошибках AI (MEDIUM)

```python
except (json.JSONDecodeError, Exception):
    return OrchestratorResponse(decision=Decision.GO, reason="Parse error; defaulting to Go.")
```

**Последствие:** Если AI недоступен или вернул некорректный ответ — атлет получит рекомендацию «тренироваться». Безопаснее — Skip.

**Рекомендация:** При ошибках возвращать `Decision.SKIP` с пометкой об ошибке AI.

### 6.3. Нет global exception handler (MEDIUM)

Необработанные exceptions возвращают 500 со stacktrace (в debug=true).

**Рекомендация:** Добавить глобальный обработчик:

```python
@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.exception("Unhandled")
    return JSONResponse(status_code=500, content={"error": "Internal server error"})
```

### 6.4. Нет structured logging (MEDIUM)

Используется стандартный `logging.exception()` в одном месте. Остальные ошибки — либо `print`, либо ничего.

**Рекомендация:** Настроить `structlog` или `python-json-logger` для JSON-логов, совместимых с ELK/Datadog.

---

## 7. UX/UI (6/10)

### 7.1. Нет визуальной обратной связи о прогрессе к целям (MEDIUM)

Dashboard показывает числа, но нет progress bars или визуальных индикаторов. Текст «Remainder: 0 kcal» не информативен визуально.

**Рекомендация:** Добавить прогресс-бары для калорий/макросов:

```
Calories: ███████████████░░░ 7390/2200 kcal (336%)
```

### 7.2. Нет возможности удалить запись о еде (MEDIUM)

При ошибочном сканировании — нет способа убрать запись.

**Рекомендация:** Добавить swipe-to-delete или кнопку удаления для каждой записи.

### 7.3. Hardcoded nutrition goals (MEDIUM)

```typescript
const CALORIE_GOAL = 2200;
const CARBS_GOAL = 250;
```

Цели питания зашиты в код фронтенда. Невозможно настроить под пользователя.

**Рекомендация:** Хранить цели в профиле пользователя (backend), отдавать через API.

### 7.4. Нет истории по дням (LOW)

Dashboard показывает только «Today». Невозможно посмотреть вчерашние данные.

**Рекомендация:** Добавить выбор даты (date picker) или свайп между днями.

### 7.5. Recovery card показывает "—" без контекста (LOW)

Когда Intervals.icu не подключён или нет данных — карточка Recovery пустая ("—").

**Рекомендация:** Показать подсказку: «Connect Intervals.icu to see recovery data» или onboarding flow.

### 7.6. Нет onboarding / first-run experience (MEDIUM)

Новый пользователь видит пустой dashboard без объяснений, что делать.

**Рекомендация:** Добавить onboarding-экран с шагами: 1) Подключить Intervals 2) Сфотографировать еду 3) Запустить анализ.

### 7.7. Chat UI не показывает timestamps (LOW)

Сообщения в чате без временных меток — непонятно, когда был дан совет.

**Рекомендация:** Показывать время под каждым сообщением или группировать по дням.

---

## 8. DevOps/Infrastructure (6/10)

### 8.1. Нет health check для frontend контейнера (LOW)

PostgreSQL и backend имеют healthcheck. Frontend (nginx) — нет.

**Рекомендация:**

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:80/"]
  interval: 10s
```

### 8.2. Sleep 20s вместо wait-for-it (MEDIUM)

```makefile
@sleep 20
docker compose exec backend alembic upgrade head
```

Фиксированная задержка вместо ожидания готовности backend.

**Рекомендация:** Использовать `depends_on: backend: condition: service_healthy` или wait-for-it скрипт.

### 8.3. Нет multi-stage build для backend (LOW)

Backend Dockerfile копирует все файлы. Нет разделения на build и runtime стадии.

**Рекомендация:** Для production — multi-stage build с минимальным runtime image.

### 8.4. Нет `.dockerignore` оптимизации (LOW)

Проверить, что `__pycache__`, `.git`, `node_modules` исключены из контекста сборки.

**Рекомендация:** Убедиться в полноте `.dockerignore` файлов.

### 8.5. Нет CI/CD конфигурации (MEDIUM)

Отсутствуют GitHub Actions, GitLab CI, или аналогичные пайплайны.

**Рекомендация:** Добавить минимальный CI:
1. Lint (ruff/flake8, eslint)
2. Type check (mypy, tsc)
3. Tests (pytest, jest)
4. Docker build test

---

## 9. Code Quality (6/10)

### 9.1. Нет тестов (HIGH)

Отсутствуют unit-тесты, integration-тесты, e2e-тесты. Нет `pytest`, `jest`, или аналогов.

**Рекомендация:** Приоритеты:
1. Unit-тесты для `orchestrator.py` (критическая бизнес-логика).
2. Integration-тесты для API endpoints (httpx + pytest-asyncio).
3. Frontend: snapshot-тесты для компонентов.

### 9.2. Баг в CTL EMA вычислении (BUG)

```python
# services/intervals_sync.py
ctl = ctl + (tss - ctl) * (1 - 2 / (ctl_tau + 1))
ctl = ctl + (tss - ctl) * (1 - 2 / (ctl_tau + 1))  # дубликат!
```

CTL обновляется **дважды** за итерацию. Формула EMA применяется дважды подряд, что даёт некорректное значение хронической нагрузки.

**Рекомендация:** Удалить дублирующую строку. Корректная EMA формула:

```python
decay_ctl = 2 / (ctl_tau + 1)
ctl = ctl + (tss - ctl) * decay_ctl
```

### 9.3. Нет type checking (mypy) (LOW)

`pyproject.toml` не содержит настроек mypy. Типизация используется, но не проверяется.

**Рекомендация:** Добавить `mypy` в dev-зависимости и конфигурацию.

### 9.4. Нет линтера/форматтера (LOW)

Нет конфигурации ruff, black, isort, flake8.

**Рекомендация:** Добавить `ruff` (замена flake8+isort+black) с конфигурацией в `pyproject.toml`.

### 9.5. `datetime.utcnow()` без timezone (MEDIUM)

```python
timestamp=datetime.utcnow()  # naive datetime, no timezone info
```

Используется в `FoodLog`, `ChatMessage`, `User`. Результат — naive datetime без timezone info.

**Рекомендация:** Использовать `datetime.now(timezone.utc)` — aware datetime.

---

## Приоритизированный план действий

### Phase 1 — Критические исправления (1-2 дня)

| # | Задача | Приоритет |
|---|--------|-----------|
| 1 | Реализовать JWT-аутентификацию | CRITICAL |
| 2 | Удалить `user_id` из query params | CRITICAL |
| 3 | Исправить дубликат CTL в `intervals_sync.py` | CRITICAL |
| 4 | Исправить дубликат `rhr` в миграции `001_initial.py` | CRITICAL |
| 5 | Сгенерировать и установить `ENCRYPTION_KEY` | HIGH |
| 6 | Ограничить CORS origins | HIGH |

### Phase 2 — Архитектурные улучшения (3-5 дней)

| # | Задача | Приоритет |
|---|--------|-----------|
| 7 | Сделать Gemini вызовы асинхронными | HIGH |
| 8 | Вынести `get_current_user` в общий deps | MEDIUM |
| 9 | Добавить structured logging | MEDIUM |
| 10 | Исправить error handling в orchestrator | MEDIUM |
| 11 | Добавить Pydantic response models для всех endpoints | MEDIUM |
| 12 | Добавить rate limiting | MEDIUM |

### Phase 3 — Качество и UX (5-10 дней)

| # | Задача | Приоритет |
|---|--------|-----------|
| 13 | Написать unit-тесты для orchestrator | HIGH |
| 14 | Написать integration-тесты для API | MEDIUM |
| 15 | Добавить progress bars на dashboard | MEDIUM |
| 16 | Добавить CRUD для food_log (удаление) | MEDIUM |
| 17 | Настраиваемые nutrition goals | MEDIUM |
| 18 | Добавить CI/CD pipeline | MEDIUM |

### Phase 4 — Production readiness (дополнительно)

| # | Задача | Приоритет |
|---|--------|-----------|
| 19 | HTTPS / TLS через Let's Encrypt | HIGH |
| 20 | Secrets management | MEDIUM |
| 21 | Database connection pooling | LOW |
| 22 | Onboarding flow | LOW |
| 23 | Date picker для навигации по дням | LOW |

---

## Заключение

Проект представляет собой функциональный MVP с работающей интеграцией Gemini AI для анализа питания, подключением к Intervals.icu, и AI-оркестратором для принятия тренировочных решений. Архитектура (FastAPI + Expo + PostgreSQL + Docker) выбрана разумно для стартапа.

**Главная угроза — полное отсутствие аутентификации.** Это делает приложение непригодным для развёртывания за пределами локальной сети. Phase 1 должна быть выполнена до любого внешнего использования.

Помимо безопасности, два подтверждённых бага (двойной расчёт CTL и дубликат колонки в миграции) могут приводить к некорректным данным и требуют немедленного исправления.
