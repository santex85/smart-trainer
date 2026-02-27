# Smart Trainer — Аудит проекта и рекомендации

**Дата:** 27 февраля 2026  
**Ветка:** `main` (коммит `918e2b6`)  
**Метод:** Построчная проверка каждого файла на ветке `origin/main`

---

## 1. Текущее состояние проекта

### Оценка готовности к продакшену: 7.8 / 10

| Аспект | Оценка | Комментарий |
|--------|--------|-------------|
| Функциональность | 9/10 | Все ключевые фичи работают, SSE-стриминг, background jobs |
| Безопасность | 8/10 | Brute-force защита, валидация, rate limits, token rotation |
| Тестирование | 6/10 | 9 backend test-файлов, 1 frontend, CI есть. Coverage не измеряется |
| Observability | 8/10 | Sentry, structlog, Prometheus, request_id, health/ready |
| UI/UX | 7.5/10 | Onboarding, i18n, графики, аккордеон. A11y — частичная |
| DevOps | 6.5/10 | CI есть, CD нет. Бэкапы документированы |
| **Среднее** | **7.8/10** | Готово для закрытого бета-запуска |

---

## 2. Полная ведомость: что реализовано

### 2.1 Безопасность — 12 из 14 пунктов

| # | Пункт | Статус | Где реализовано |
|---|-------|--------|-----------------|
| 1 | Валидация email (EmailStr) | ✅ | `auth.py`: `RegisterBody`, `LoginBody`, `ForgotPasswordBody` — Pydantic `EmailStr` |
| 2 | Мин. длина пароля ≥ 8 | ✅ | `auth.py`: `field_validator` на `RegisterBody.password` и `ChangePasswordBody.new_password` |
| 3 | Блокировка аккаунта (brute-force) | ✅ | `User.failed_login_count` + `locked_until`, 5 попыток / 15 мин, миграция 015 |
| 4 | Rate limit на register / login | ✅ | `@limiter.limit("3/minute")` register, `"5/minute"` login |
| 5 | Access token TTL = 30 мин | ✅ | `config.py`: `access_token_expire_minutes: int = 30` |
| 6 | SECRET_KEY проверка в production | ✅ | `main.py` lifespan: `RuntimeError` если дефолтный при `app_env=production` |
| 7 | CORS_ORIGINS проверка в production | ✅ | `main.py` lifespan: `RuntimeError` при `*` или пустом значении |
| 8 | Logout (инвалидация refresh token) | ✅ | `POST /auth/logout` — удаляет refresh token из БД |
| 9 | Смена пароля | ✅ | `POST /auth/change-password` — проверяет текущий, хеширует новый, сбрасывает lockout |
| 10 | Лимит длины сообщения чата | ✅ | `chat.py`: `CHAT_MESSAGE_MAX_LENGTH = 4000`, Pydantic `Field(max_length=...)` + runtime check |
| 11 | Восстановление пароля | ⚠️ Stub | `POST /auth/forgot-password` — endpoint есть, но email не отправляется (TODO) |
| 12 | ENCRYPTION_KEY проверка в prod | ❌ | Не проверяется в lifespan. Без ключа токены Intervals хранятся plaintext |
| 13 | CSP заголовки | ❌ | Нет Content-Security-Policy ни в middleware, ни в nginx.conf, ни в Caddyfile |
| 14 | Security headers | ✅ | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS (опц.) |

### 2.2 Архитектура — 6 из 6 пунктов

| # | Пункт | Статус | Где реализовано |
|---|-------|--------|-----------------|
| 1 | Redis + ARQ очередь | ✅ | `core/queue.py` — init/close/enqueue; `worker/worker.py` — 4 задачи, `WorkerSettings` |
| 2 | Redis кэш | ✅ | `core/cache.py` — get/set/invalidate, TTL 300с, graceful degradation |
| 3 | Оркестратор в worker | ✅ | Удалён из `main.py`, cron в ARQ worker с distributed lock |
| 4 | Background jobs API | ✅ | Модель `BackgroundJob`, `GET /jobs/{id}`, миграция 017 |
| 5 | SSE streaming чата | ✅ | `POST /chat/send-stream` — `StreamingResponse`, `text/event-stream` |
| 6 | Health checks (liveness + readiness) | ✅ | `GET /health` (без БД) + `GET /health/ready` (SELECT 1) |

### 2.3 Observability — 4 из 4 пунктов

| # | Пункт | Статус | Где реализовано |
|---|-------|--------|-----------------|
| 1 | Sentry | ✅ | `sentry-sdk[fastapi]`, init с DSN, `SentryUserMiddleware` (user_id без PII) |
| 2 | Structured logging | ✅ | `structlog` JSONRenderer, `_iso_utc_timestamper`, `configure_structlog()` в `main.py` |
| 3 | Prometheus | ✅ | `prometheus-fastapi-instrumentator`, endpoint `/metrics` |
| 4 | Request ID | ✅ | `RequestIdMiddleware` — UUID, structlog binding, `X-Request-ID` в response |

### 2.4 Тестирование — CI есть, coverage не измеряется

| # | Пункт | Статус | Детали |
|---|-------|--------|--------|
| 1 | Backend test-файлы | ✅ | 9 файлов: auth, chat, crypto, fit, image_resize, load_metrics, nutrition, orchestrator, wellness |
| 2 | GitHub Actions CI | ✅ | `ci.yml`: pytest + ruff на Python 3.11 / SQLite |
| 3 | Frontend Jest | ✅ | `client.test.ts` — mock fetch, 3 теста API-клиента |
| 4 | pytest-cov установлен | ✅ | В `requirements.txt` |
| 5 | --cov в CI | ❌ | Не используется, coverage не измеряется и не enforcement |
| 6 | Frontend component тесты | ❌ | Нет тестов экранов (DashboardScreen, ChatScreen и др.) |
| 7 | E2E тесты | ❌ | Нет |

### 2.5 UI/UX — 12 из 14 пунктов

| # | Пункт | Статус | Детали |
|---|-------|--------|--------|
| 1 | i18n (полная русификация) | ✅ | ~217 ключей, все 10 экранов используют `t()`, нет хардкод-строк |
| 2 | Onboarding | ✅ | 3 слайда, пагинация, dots, сохранение в AsyncStorage |
| 3 | Аккордеон Dashboard | ✅ | 5 коллапсируемых секций с +/− |
| 4 | Графики CTL/ATL/TSB | ✅ | `FitnessChart.tsx`, `react-native-chart-kit`, 30 дней, 3 линии |
| 5 | Индикатор силы пароля | ✅ | 3 уровня (weak/medium/strong), цветные полоски |
| 6 | «Забыли пароль?» | ✅ | Модалка на фронте, endpoint-stub на бэке |
| 7 | Typing indicator в чате | ✅ | 3 точки с разной прозрачностью в пузыре assistant |
| 8 | Long-press копирование | ✅ | `expo-clipboard` (native) + `navigator.clipboard` (web) |
| 9 | Цели питания в профиле | ✅ | Модель + миграция 016 + UI в AthleteProfileScreen |
| 10 | Брендинг на Login | ✅ | Название + описание приложения |
| 11 | keyExtractor по ID | ✅ | `String(item.id ?? item.timestamp ?? i)` вместо индекса |
| 12 | HelpScreen | ✅ | Экран помощи |
| 13 | Accessibility (a11y) | ⚠️ Частично | 12 `accessibilityLabel` в 6 из 10 экранов. 4 экрана без labels |
| 14 | Контраст подсказок | ✅ | hint-текст → `#b8c5d6` |

### 2.6 Инфраструктура

| # | Пункт | Статус | Детали |
|---|-------|--------|--------|
| 1 | Docker Compose (dev + prod) | ✅ | `docker-compose.yml` + `prod.yml` с Caddy |
| 2 | Caddy HTTPS (Let's Encrypt) | ✅ | Автоматический TLS |
| 3 | Backend healthcheck | ✅ | `/health` в Docker healthcheck |
| 4 | PostgreSQL healthcheck | ✅ | `pg_isready` |
| 5 | Бэкапы БД | ✅ | pg_dump скрипт + cron + процедура восстановления в DEPLOY.md |
| 6 | Backend restart | ✅ | `unless-stopped` в prod compose |
| 7 | Frontend healthcheck | ❌ | Нет healthcheck для frontend в compose |
| 8 | Отдельные Docker networks | ❌ | Все сервисы в default network |
| 9 | Caddy rate limit | ❌ | Не настроен |
| 10 | CD pipeline (автодеплой) | ❌ | CI есть, CD нет |
| 11 | Redis в docker-compose | ❌ | Redis не определён как сервис |

---

## 3. Оставшиеся задачи

### 3.1 Критические — до открытия регистрации

**Задача 1: ENCRYPTION_KEY — проверка в production**

Без `ENCRYPTION_KEY` API-ключи Intervals.icu хранятся в plaintext.

Файл: `backend/app/main.py`, блок `lifespan()`, после проверки `secret_key`:

```python
if not settings.encryption_key or len(settings.encryption_key) < 32:
    raise RuntimeError(
        "ENCRYPTION_KEY must be set in production. "
        "Generate: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    )
```

Трудоёмкость: 15 минут.

---

**Задача 2: Docker healthcheck для frontend**

При падении nginx контейнер остаётся «running», Caddy не узнаёт о проблеме.

Файл: `docker-compose.yml`, сервис `frontend`:

```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
  depends_on:
    - backend
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://localhost:80/ || exit 1"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 15s
```

В `docker-compose.prod.yml` добавить `restart: unless-stopped` для frontend.

Трудоёмкость: 15 минут.

---

**Задача 3: Redis в docker-compose**

ARQ worker и cache настроены, но Redis не определён как Docker-сервис.

Файл: `docker-compose.yml`:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
  ports:
    - "127.0.0.1:6379:6379"
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 3s
    retries: 3
  restart: unless-stopped
```

Добавить `redis_data` в `volumes:` и `REDIS_URL=redis://redis:6379/0` в environment backend и `.env.example`.

В `docker-compose.prod.yml`: убрать `ports` для Redis, оставить только internal network.

Трудоёмкость: 20 минут.

---

### 3.2 Высокий приоритет — первые 2 недели

**Задача 4: Coverage в CI**

pytest-cov установлен, но не используется. Добавить в `.github/workflows/ci.yml`:

```yaml
- name: Tests
  run: PYTHONPATH=. python -m pytest tests/ -v --tb=short --cov=app --cov-report=term-missing --cov-fail-under=40
```

Начать с порога 40%, поднимать на 5% ежемесячно.

Трудоёмкость: 15 минут.

---

**Задача 5: CD pipeline (автодеплой)**

Файл: `.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: [backend]  # ждать CI
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /root/smart_trainer
            git pull origin main
            docker compose -f docker-compose.yml -f docker-compose.prod.yml build
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
            docker compose exec -T backend alembic upgrade head
```

GitHub Secrets: `DEPLOY_HOST` (167.71.74.220), `DEPLOY_USER`, `DEPLOY_SSH_KEY`.

Трудоёмкость: 1 час.

---

**Задача 6: Дополнительные backend-тесты**

Не покрыто тестами: workouts CRUD, intervals link/sync, athlete_profile, photo upload, jobs API.

Создать 5 файлов:

| Файл | Тесты |
|------|-------|
| `test_workouts.py` | Создание, список, fitness, дедупликация |
| `test_intervals.py` | Link, status, unlink (mock Intervals API) |
| `test_athlete_profile.py` | GET, PATCH, nutrition_goals |
| `test_photo.py` | Upload photo (mock Gemini) |
| `test_jobs.py` | GET /jobs/{id}, статусы |

Трудоёмкость: 4–6 часов.

---

**Задача 7: Frontend component тесты**

Установить `@testing-library/react-native`. Создать тесты для LoginScreen, DashboardScreen.

Добавить frontend job в `ci.yml`:

```yaml
frontend:
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: frontend
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: "20" }
    - run: npm ci
    - run: npm test -- --ci
```

Трудоёмкость: 4–6 часов.

---

**Задача 8: CSP заголовки**

Добавить в `frontend/nginx.conf`:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none';" always;
add_header Permissions-Policy "camera=(self), microphone=()" always;
```

Трудоёмкость: 30 минут.

---

### 3.3 Средний приоритет — 1–2 месяца

**Задача 9: Accessibility (a11y)**

4 экрана без `accessibilityLabel`: AthleteProfileScreen, CameraScreen, IntervalsLinkScreen, WellnessScreen.

Добавить labels на все интерактивные элементы (кнопки, поля ввода). Использовать существующие ключи `a11y.*` из translations.

Трудоёмкость: 2 часа.

---

**Задача 10: Пагинация list-endpoints**

Создать `backend/app/schemas/pagination.py`:

```python
from pydantic import BaseModel, Field

class PaginatedResponse(BaseModel):
    items: list
    total: int
    limit: int
    offset: int
    has_more: bool
```

Применить к: GET /workouts, GET /wellness, GET /chat/threads.

Трудоёмкость: 2–3 часа.

---

**Задача 11: Отдельные Docker networks**

```yaml
# docker-compose.yml
networks:
  backend-db:
  frontend-api:

services:
  postgres:
    networks: [backend-db]
  redis:
    networks: [backend-db]
  backend:
    networks: [backend-db, frontend-api]
  frontend:
    networks: [frontend-api]
  caddy:
    networks: [frontend-api]
```

Frontend не получает прямого доступа к PostgreSQL и Redis.

Трудоёмкость: 30 минут.

---

**Задача 12: Forgot password — реализация**

Текущий stub отправляет только `{"message": "..."}`. Нужно:

1. Генерировать одноразовый токен (хранить хеш в БД с TTL 1 час)
2. Отправлять email через SMTP/Resend/Mailgun
3. Endpoint `POST /auth/reset-password` для применения нового пароля

Трудоёмкость: 4–6 часов.

---

**Задача 13: Audit log**

Таблица `audit_log` (user_id, action, resource, resource_id, details JSON, ip_address, created_at).

Логировать: login, logout, delete food_log, delete workout, link/unlink intervals.

Трудоёмкость: 2–3 часа.

---

**Задача 14: S3/MinIO для фотографий**

MinIO в docker-compose, `backend/app/services/storage.py` (boto3), сохранение фото перед AI-анализом, ключ в `food_log.image_storage_path`.

Трудоёмкость: 3–4 часа.

---

**Задача 15: Push-уведомления**

`expo-notifications` на фронте, `push_token` в модели User, отправка из worker при завершении задач через Expo Push API.

Трудоёмкость: 3–4 часа.

---

**Задача 16: Grafana дашборд**

Prometheus + Grafana в `docker-compose.prod.yml` (127.0.0.1:3000, закрыт от внешки), `deploy/prometheus.yml` с scrape backend:8000.

Трудоёмкость: 1–2 часа.

---

### 3.4 Низкий приоритет — 3+ месяца

| # | Задача | Трудоёмкость |
|---|--------|-------------|
| 17 | Caddy/nginx rate limit | 1–2 ч |
| 18 | fail2ban для SSH/HTTP | 1 ч |
| 19 | OpenAPI examples для endpoints | 2 ч |
| 20 | Docker image semver tagging | 1 ч |
| 21 | Staging environment | 2–3 ч |
| 22 | E2E тесты (Maestro/Playwright) | 4–8 ч |
| 23 | Offline mode (react-query + persist) | 8–12 ч |
| 24 | Тёмная/светлая тема (toggle) | 4–6 ч |
| 25 | Haptic feedback (expo-haptics) | 1 ч |
| 26 | Swipe-to-delete записей | 1–2 ч |
| 27 | Анимации переходов (LayoutAnimation) | 1–2 ч |
| 28 | RS256 JWT (для multi-instance) | 2–3 ч |
| 29 | Webhook Intervals.icu | 2–3 ч |

---

## 4. Монетизация — стратегия

### Рекомендуемая модель: Freemium

| Тариф | Цена | Возможности |
|-------|------|-------------|
| Free | $0 | 3 фото-анализа/день, 1 чат-поток, ручной ввод |
| Pro | $9.99/мес | Безлимит фото, AI-оркестратор, Intervals, FIT, чат, графики |
| Team | $29.99/мес | Pro + до 10 спортсменов, групповая аналитика |

### Реализация

1. Модель `Subscription` (plan, status, stripe_id, expires_at)
2. Middleware для проверки лимитов
3. Stripe Checkout + webhook
4. `background_jobs` уже считают AI-вызовы → легко добавить квоты

### Каналы привлечения

- SEO-блог (питание, тренировки)
- YouTube/Instagram демо AI-анализа
- Telegram-канал
- Reddit (r/cycling, r/running, r/triathlon)
- Реферальная программа: «Пригласи друга → 1 мес Pro»

### Unit economics (при 5000 MAU, 10% конверсия)

| Показатель | Значение |
|------------|----------|
| Платящих | 500 |
| MRR | $4 995 |
| Gemini API | ~$2 500 |
| Инфраструктура | ~$300 |
| Маржа | ~44% |

---

## 5. Сводка трудоёмкости

| Приоритет | Задач | Часов | Срок |
|-----------|-------|-------|------|
| Критические (1–3) | 3 | ~1 ч | 1 день |
| Высокие (4–8) | 5 | ~12 ч | 1–2 недели |
| Средние (9–16) | 8 | ~20 ч | 1–2 месяца |
| Низкие (17–29) | 13 | ~35 ч | 3+ месяцев |
| **Всего** | **29** | **~68 ч** | — |

---

*Аудит выполнен построчной проверкой каждого файла на ветке `main` (коммит `918e2b6`)*
