# Оставшиеся рекомендации — Smart Trainer

**Дата:** 26 февраля 2026  
**Ветка анализа:** `main` (коммит `9f1203e`)  
**Обновлённая оценка готовности:** 7.8 / 10

> После повторной проверки main выявлено, что ряд задач из предыдущего статус-отчёта уже выполнен:
> logout endpoint, change-password, SSE streaming чата, лимит длины сообщений (4000 символов).
> В этом документе перечислены **только действительно оставшиеся** задачи с детальными инструкциями по реализации.

---

## Содержание

1. [Критические (до public production)](#1-критические)
2. [Высокий приоритет](#2-высокий-приоритет)
3. [Средний приоритет](#3-средний-приоритет)
4. [Низкий приоритет](#4-низкий-приоритет)
5. [Стратегические (Q3–Q4 2026)](#5-стратегические)

---

## 1. Критические

Блокируют полноценный public-релиз. Выполнить до открытия регистрации.

---

### 1.1 ENCRYPTION_KEY — runtime-проверка в production

**Проблема:** `lifespan()` проверяет `SECRET_KEY`, но не проверяет `ENCRYPTION_KEY`. Без него API-ключи Intervals.icu хранятся в plaintext.

**Где:** `backend/app/main.py`, блок `lifespan()`

**Решение:**

```python
if getattr(settings, "app_env", "development") == "production":
    if not settings.encryption_key or len(settings.encryption_key) < 32:
        raise RuntimeError(
            "ENCRYPTION_KEY must be set in production. "
            "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
```

**Трудоёмкость:** 15 минут

---

### 1.2 Docker healthcheck для frontend

**Проблема:** Нет healthcheck для frontend-контейнера. При падении nginx контейнер остаётся в статусе "running" — Docker не перезапустит его, Caddy не узнает о проблеме.

**Где:** `docker-compose.yml`, сервис `frontend`

**Решение:**

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

В `docker-compose.prod.yml` добавить `restart: unless-stopped` для frontend:

```yaml
frontend:
  ports: []
  restart: unless-stopped
```

**Трудоёмкость:** 15 минут

---

## 2. Высокий приоритет

Существенно влияют на стабильность, безопасность или developer experience. Рекомендуется выполнить до beta-launch.

---

### 2.1 CD pipeline — автоматический деплой

**Проблема:** CI выполняет тесты и lint, но деплой ручной (SSH → git pull → docker compose build → up). Это медленно и подвержено ошибкам.

**Решение:** GitHub Actions workflow для deploy при push в main.

**Файл:** `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    needs: []  # можно добавить зависимость от CI job
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /root/smart_trainer
            git pull origin main
            docker compose -f docker-compose.yml -f docker-compose.prod.yml build
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
            docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend alembic upgrade head
            echo "Deploy completed at $(date)"
```

**Секреты GitHub:** добавить `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` в Settings → Secrets → Actions.

**Альтернатива:** Watchtower (автоматически обновляет контейнеры при появлении нового образа). Проще, но менее контролируемо.

**Трудоёмкость:** 1–2 часа

---

### 2.2 Тестовое покрытие ≥ 50%

**Текущее состояние:** 11 test-файлов backend, но покрытие ~25–30%. Нет `--cov` в CI.

**Решение (3 шага):**

**Шаг 1:** Добавить `--cov` в CI (`ci.yml`):

```yaml
- name: Tests
  run: PYTHONPATH=. python -m pytest tests/ -v --tb=short --cov=app --cov-report=term-missing --cov-fail-under=50
```

**Шаг 2:** Добавить недостающие тесты:

| Файл | Что тестировать |
|------|----------------|
| `test_workouts.py` | CRUD, upload FIT (mock файл), fitness endpoint, дедупликация |
| `test_intervals.py` | link/unlink/status (mock Intervals API), sync |
| `test_athlete_profile.py` | GET/PATCH профиль, nutrition_goals |
| `test_photo.py` | Upload + classify (mock Gemini), save-sleep |
| `test_jobs.py` | GET /jobs/{id} для background_job |

**Шаг 3:** Каждый новый test-файл: конфигурировать mock для внешних API (Gemini, Intervals) через `unittest.mock.AsyncMock`:

```python
# tests/test_workouts.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_workout(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/workouts",
        json={
            "start_date": "2026-02-25T12:00:00Z",
            "name": "Easy Run",
            "type": "Run",
            "duration_sec": 1800,
            "tss": 40,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Easy Run"
    assert data["source"] == "manual"

@pytest.mark.asyncio
async def test_get_workouts(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/workouts?from_date=2026-01-01&to_date=2026-12-31",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

@pytest.mark.asyncio
async def test_fitness_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/workouts/fitness", headers=auth_headers)
    assert resp.status_code == 200
```

**Трудоёмкость:** 4–6 часов

---

### 2.3 Frontend-тесты компонентов

**Проблема:** Есть Jest + client.test.ts, но нет тестов UI-компонентов.

**Решение:**

**Шаг 1:** Установить React Native Testing Library:

```bash
cd frontend
npm install --save-dev @testing-library/react-native @testing-library/jest-native
```

**Шаг 2:** Создать тесты экранов:

```
frontend/src/screens/__tests__/
├── LoginScreen.test.tsx
├── DashboardScreen.test.tsx
└── ChatScreen.test.tsx
```

**Пример** `LoginScreen.test.tsx`:

```tsx
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { LoginScreen } from "../LoginScreen";

jest.mock("../../api/client", () => ({
  login: jest.fn().mockResolvedValue({
    access_token: "tok",
    refresh_token: "ref",
    user: { id: 1, email: "test@test.com" },
  }),
}));
jest.mock("../../storage/authStorage", () => ({
  setAccessToken: jest.fn(),
  setRefreshToken: jest.fn(),
}));

describe("LoginScreen", () => {
  it("renders email and password fields", () => {
    const { getByPlaceholderText } = render(
      <LoginScreen onSuccess={jest.fn()} onGoToRegister={jest.fn()} />,
    );
    expect(getByPlaceholderText("you@example.com")).toBeTruthy();
  });

  it("shows error on empty submit", () => {
    const { getByText } = render(
      <LoginScreen onSuccess={jest.fn()} onGoToRegister={jest.fn()} />,
    );
    fireEvent.press(getByText(/вход|login/i));
    // Error should appear
  });
});
```

**Шаг 3:** Добавить frontend тесты в CI:

```yaml
frontend:
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: frontend
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "20"
    - run: npm ci
    - run: npm test -- --ci --coverage
```

**Трудоёмкость:** 4–6 часов

---

### 2.4 S3/MinIO для хранения фотографий

**Проблема:** Фотографии еды отправляются в Gemini, но не сохраняются. Невозможно пересчитать анализ, показать историю с изображениями или обучить собственную модель.

**Решение:**

**Шаг 1:** Добавить MinIO в docker-compose (S3-совместимый, self-hosted):

```yaml
# docker-compose.yml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: ${MINIO_ACCESS_KEY:-minioadmin}
    MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY:-minioadmin}
  ports:
    - "9000:9000"   # API
    - "9001:9001"   # Console
  volumes:
    - minio_data:/data
  healthcheck:
    test: ["CMD", "mc", "ready", "local"]
    interval: 10s
    timeout: 5s
    retries: 3

volumes:
  minio_data:
```

**Шаг 2:** Создать `backend/app/services/storage.py`:

```python
import io
import uuid
import boto3
from botocore.config import Config
from app.config import settings

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(signature_version="s3v4"),
    )

async def upload_image(image_bytes: bytes, user_id: int, category: str = "food") -> str:
    """Upload image to S3, return object key."""
    key = f"{category}/{user_id}/{uuid.uuid4().hex}.jpg"
    client = get_s3_client()
    client.upload_fileobj(
        io.BytesIO(image_bytes),
        settings.s3_bucket,
        key,
        ExtraArgs={"ContentType": "image/jpeg"},
    )
    return key
```

**Шаг 3:** В `config.py` добавить:

```python
s3_endpoint_url: str = "http://minio:9000"
s3_access_key: str = "minioadmin"
s3_secret_key: str = "minioadmin"
s3_bucket: str = "smart-trainer"
```

**Шаг 4:** В nutrition `analyze` — сохранять фото перед AI-анализом, записывать ключ в `food_log.image_storage_path`.

**Трудоёмкость:** 3–4 часа

---

### 2.5 Audit log

**Проблема:** Нет журнала действий пользователей. При инцидентах (удалённые данные, несанкционированный доступ) невозможно восстановить хронологию.

**Решение:**

**Шаг 1:** Миграция — таблица `audit_log`:

```python
# backend/alembic/versions/019_audit_log.py
def upgrade():
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("action", sa.String(50), nullable=False, index=True),  # login, logout, create, update, delete
        sa.Column("resource", sa.String(50), nullable=False),  # workout, food_log, wellness, intervals, chat
        sa.Column("resource_id", sa.String(50), nullable=True),
        sa.Column("details", sa.JSON, nullable=True),  # diff или контекст
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
```

**Шаг 2:** Сервис `backend/app/services/audit.py`:

```python
from app.db.session import async_session_maker

async def log_action(
    user_id: int | None,
    action: str,
    resource: str,
    resource_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
):
    from app.models.audit_log import AuditLog
    async with async_session_maker() as session:
        session.add(AuditLog(
            user_id=user_id,
            action=action,
            resource=resource,
            resource_id=str(resource_id) if resource_id else None,
            details=details,
            ip_address=ip_address,
        ))
        await session.commit()
```

**Шаг 3:** Вызывать в ключевых точках:

```python
# auth.py — после логина
await log_action(user.id, "login", "auth", ip_address=request.client.host)

# nutrition.py — после удаления
await log_action(user.id, "delete", "food_log", resource_id=entry_id)
```

**Трудоёмкость:** 2–3 часа

---

## 3. Средний приоритет

Улучшают безопасность, производительность и UX. Рекомендуется для первых 3 месяцев после запуска.

---

### 3.1 CSP заголовки (Content-Security-Policy)

**Проблема:** Нет CSP — браузер не блокирует потенциально вредоносные скрипты или inline-стили, загруженные через XSS.

**Где:** `backend/app/main.py`, `SecurityHeadersMiddleware`

**Решение:**

```python
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "connect-src 'self' https://intervals.icu https://*.sentry.io; "
            "font-src 'self'; "
            "frame-ancestors 'none';"
        )
        if getattr(settings, "enable_hsts", False):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
```

**Внимание:** CSP применять только к HTML-ответам фронтенда (через nginx). Для API JSON-ответов CSP не критичен. Лучше добавить в `frontend/nginx.conf`:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://intervals.icu; frame-ancestors 'none';" always;
```

**Трудоёмкость:** 30 минут

---

### 3.2 Пагинация для list-endpoints

**Проблема:** Endpoints возвращают все записи без ограничения — при росте данных ответы станут тяжёлыми.

**Затронутые endpoints:**

| Endpoint | Текущее поведение |
|----------|------------------|
| GET /workouts | Все за диапазон дат |
| GET /wellness | Все за диапазон дат |
| GET /nutrition/day | Все записи за день (допустимо) |
| GET /chat/history | Лимит 50 (уже есть) |
| GET /chat/threads | Все потоки |

**Решение — cursor-based pagination:**

```python
# backend/app/schemas/pagination.py
from pydantic import BaseModel, Field

class PaginationParams(BaseModel):
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)

class PaginatedResponse(BaseModel):
    items: list
    total: int
    limit: int
    offset: int
    has_more: bool
```

**Пример для workouts:**

```python
@router.get("/", response_model=PaginatedResponse)
async def list_workouts(
    session: ...,
    user: ...,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    query = select(Workout).where(Workout.user_id == user.id)
    # ... date filters ...
    count_q = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_q)).scalar() or 0
    items = (await session.execute(query.offset(offset).limit(limit))).scalars().all()
    return PaginatedResponse(
        items=[...],
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + limit) < total,
    )
```

**Трудоёмкость:** 2–3 часа

---

### 3.3 Отдельные Docker networks

**Проблема:** Все сервисы в одной default-сети — frontend может напрямую обращаться к PostgreSQL.

**Где:** `docker-compose.yml`

**Решение:**

```yaml
services:
  postgres:
    networks:
      - backend-db

  backend:
    networks:
      - backend-db
      - frontend-backend

  frontend:
    networks:
      - frontend-backend

  caddy:
    networks:
      - frontend-backend

networks:
  backend-db:
    driver: bridge
  frontend-backend:
    driver: bridge
```

Так frontend и Caddy не имеют прямого доступа к PostgreSQL.

**Трудоёмкость:** 30 минут

---

### 3.4 Caddy rate limit

**Проблема:** Rate limiting работает только на уровне FastAPI (slowapi). Атакующий может отправлять тысячи запросов к frontend (static), расходуя ресурсы nginx и Caddy.

**Где:** `deploy/Caddyfile`

**Решение:**

```
{$DOMAIN} {
  rate_limit {
    zone dynamic_zone {
      key    {remote_host}
      events 100
      window 1m
    }
  }

  reverse_proxy frontend:80 {
    transport http {
      read_timeout 300s
      write_timeout 300s
    }
  }
}
```

**Примечание:** rate_limit — это Caddy plugin (`caddy-ratelimit`). Для установки нужно собрать Caddy с плагином:

```dockerfile
# deploy/Dockerfile.caddy
FROM caddy:builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit

FROM caddy:alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

**Альтернатива (проще):** добавить limit в nginx (frontend), который проксирует /api:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

location /api/ {
    limit_req zone=api burst=50 nodelay;
    # ... proxy_pass ...
}
```

**Трудоёмкость:** 1–2 часа

---

### 3.5 Push-уведомления

**Проблема:** Нет уведомлений — пользователь не знает, когда оркестратор принял решение или закончился анализ.

**Решение (Expo Push Notifications):**

**Шаг 1:** Зарегистрировать push token на устройстве:

```tsx
// frontend/src/utils/pushNotifications.ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return null;
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}
```

**Шаг 2:** Endpoint для сохранения push token:

```python
# backend/app/api/v1/users.py
@router.post("/push-token")
async def save_push_token(
    session: ...,
    user: ...,
    body: PushTokenBody,  # { token: str, platform: "ios" | "android" | "web" }
):
    user.push_token = body.token
    await session.flush()
    return {"ok": True}
```

**Шаг 3:** Отправлять push из worker при завершении задач:

```python
import httpx

async def send_push(token: str, title: str, body: str):
    await httpx.AsyncClient().post(
        "https://exp.host/--/api/v2/push/send",
        json={"to": token, "title": title, "body": body},
    )
```

**Зависимости frontend:** `expo-notifications`, `expo-device`

**Трудоёмкость:** 3–4 часа

---

### 3.6 Grafana дашборд

**Проблема:** Prometheus endpoint есть, но нет реального дашборда — метрики не визуализируются.

**Решение:** Добавить Prometheus + Grafana в docker-compose.prod.yml:

```yaml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./deploy/prometheus.yml:/etc/prometheus/prometheus.yml:ro
  networks:
    - backend-db
  restart: unless-stopped

grafana:
  image: grafana/grafana:latest
  ports:
    - "127.0.0.1:3000:3000"
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
  volumes:
    - grafana_data:/var/lib/grafana
  depends_on:
    - prometheus
  networks:
    - backend-db
  restart: unless-stopped
```

**Файл** `deploy/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "smart_trainer_backend"
    static_configs:
      - targets: ["backend:8000"]
    metrics_path: /metrics
```

**Grafana:** доступен на `localhost:3000` (закрыт от внешнего трафика через `127.0.0.1`). Добавить datasource Prometheus → URL `http://prometheus:9090`.

**Трудоёмкость:** 1–2 часа

---

### 3.7 Webhook Intervals.icu

**Проблема:** Синхронизация с Intervals.icu — только ручная (pull). Новые тренировки появляются с задержкой.

**Решение:** Intervals.icu поддерживает webhook-подписки. Endpoint для приёма webhook:

```python
# backend/app/api/v1/intervals.py
@router.post("/webhook")
async def intervals_webhook(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    """Receive webhook from Intervals.icu when activity/wellness changes."""
    body = await request.json()
    athlete_id = body.get("athlete_id")
    event_type = body.get("type")  # "activity", "wellness"
    # Find user by athlete_id, enqueue sync
    r = await session.execute(
        select(IntervalsCredentials).where(IntervalsCredentials.athlete_id == athlete_id)
    )
    creds = r.scalar_one_or_none()
    if creds:
        await enqueue_background_job("sync_intervals_job", str(uuid.uuid4()), creds.user_id)
    return {"ok": True}
```

**Регистрация webhook:** при link добавить вызов API Intervals для подписки на webhook `https://alexhosting.ru/api/v1/intervals/webhook`.

**Трудоёмкость:** 2–3 часа (зависит от API Intervals.icu)

---

### 3.8 fail2ban для SSH и HTTP

**Проблема:** Сервер открыт в интернет — атаки на SSH и HTTP без защиты.

**Решение:** Установить на хосте (167.71.74.220):

```bash
apt install -y fail2ban

# /etc/fail2ban/jail.local
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[caddy-auth]
enabled = true
port = http,https
filter = caddy-auth
logpath = /var/log/caddy/access.log
maxretry = 10
findtime = 60
bantime = 3600
EOF
```

**Фильтр для Caddy** (`/etc/fail2ban/filter.d/caddy-auth.conf`):

```ini
[Definition]
failregex = ^<HOST> .* "(POST /api/v1/auth/login|POST /api/v1/auth/register)" (401|429)
ignoreregex =
```

**Документировать** в `docs/DEPLOY.md` как часть процедуры настройки сервера.

**Трудоёмкость:** 1 час

---

## 4. Низкий приоритет

Улучшают опыт разработки и UX, но не блокируют релиз.

---

### 4.1 RS256 JWT (вместо HS256)

**Когда нужно:** При переходе на multi-instance backend (несколько реплик API за load balancer). RS256 позволяет валидировать токены без знания приватного ключа (только public key).

**Сейчас:** Одна реплика — HS256 достаточен.

**Трудоёмкость:** 2–3 часа (генерация RSA ключей, замена jwt.encode/decode, обновление config)

---

### 4.2 OpenAPI examples для endpoints

**Что:** Добавить `response_model`, `summary`, `responses`, `examples` для каждого endpoint. FastAPI автоматически включит их в Swagger UI (`/docs`).

**Пример:**

```python
@router.post(
    "/analyze",
    response_model=NutritionAnalyzeResponse,
    summary="Analyze food photo",
    responses={
        400: {"description": "Invalid image"},
        422: {"description": "AI could not analyze"},
        502: {"description": "AI service unavailable"},
    },
)
```

**Трудоёмкость:** 2 часа

---

### 4.3 Docker image semver tagging

**Что:** Тегировать образы версиями (v0.1.0, v0.2.0) для rollback.

**В CI:**

```yaml
- name: Build and tag
  run: |
    VERSION=$(git describe --tags --always)
    docker build -t smart-trainer-backend:$VERSION backend/
    docker build -t smart-trainer-frontend:$VERSION frontend/
```

**Трудоёмкость:** 1 час

---

### 4.4 Staging environment

**Что:** Отдельный сервер или namespace (Docker Compose с другим .env) для тестирования перед production.

**Минимальный вариант:** отдельный compose-profile:

```yaml
# docker-compose.staging.yml
services:
  backend:
    environment:
      APP_ENV: staging
      DOMAIN: staging.alexhosting.ru
```

**Трудоёмкость:** 2–3 часа (настройка DNS + compose + отдельный .env)

---

### 4.5 Offline mode (frontend)

**Что:** Кэшировать данные дашборда в AsyncStorage, ставить API-запросы в очередь при отсутствии сети.

**Библиотека:** `@tanstack/react-query` с `persistQueryClient` + `AsyncStorage`.

**Шаги:**
1. Установить `@tanstack/react-query`, `@tanstack/react-query-persist-client`
2. Заменить прямые `fetch` вызовы на `useQuery`/`useMutation`
3. Настроить persister на AsyncStorage

**Трудоёмкость:** 8–12 часов (масштабный рефакторинг)

---

### 4.6 Тёмная/светлая тема

**Что:** Theme toggle. Текущая тема — тёмная. Добавить светлую альтернативу.

**Шаги:**
1. Создать `src/theme/colors.ts` с двумя наборами (dark, light)
2. React Context `ThemeProvider` с toggle
3. Хранить выбор в AsyncStorage
4. Заменить хардкод цветов в StyleSheet на theme-переменные

**Трудоёмкость:** 4–6 часов

---

### 4.7 Haptic feedback

**Что:** Вибрация при нажатии кнопок, свайпе, успешном действии.

```bash
npx expo install expo-haptics
```

```tsx
import * as Haptics from "expo-haptics";

// При нажатии кнопки
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// При успешном сохранении
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
```

**Трудоёмкость:** 1 час

---

### 4.8 Swipe-to-delete для записей питания

**Что:** Свайп влево на записи → кнопка "Удалить".

**Библиотека:** `react-native-gesture-handler` + `react-native-reanimated` (уже в зависимостях Expo).

```tsx
import { Swipeable } from "react-native-gesture-handler";

const renderRightActions = () => (
  <TouchableOpacity style={styles.deleteAction} onPress={handleDelete}>
    <Text style={styles.deleteActionText}>Удалить</Text>
  </TouchableOpacity>
);

<Swipeable renderRightActions={renderRightActions}>
  <MealRow ... />
</Swipeable>
```

**Трудоёмкость:** 1–2 часа

---

### 4.9 Анимации переходов

**Что:** Плавные анимации при переходе между экранами (fade, slide).

React Navigation уже поддерживает:

```tsx
<Stack.Screen
  name="Dashboard"
  options={{
    animation: "fade_from_bottom",
    animationDuration: 200,
  }}
/>
```

Для карточек на Dashboard — `LayoutAnimation`:

```tsx
import { LayoutAnimation } from "react-native";

const toggleSection = (key: string) => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setSectionsExpanded(prev => ({ ...prev, [key]: !prev[key] }));
};
```

**Трудоёмкость:** 1–2 часа

---

### 4.10 E2E тесты

**Что:** Полные сценарии от регистрации до анализа.

**Инструмент:** Maestro (проще Detox для Expo):

```yaml
# e2e/register_and_analyze.yaml
appId: com.smarttrainer.app
---
- launchApp
- tapOn: "Создать аккаунт"
- inputText:
    id: "email-input"
    text: "test@example.com"
- inputText:
    id: "password-input"
    text: "testpassword123"
- tapOn: "Зарегистрироваться"
- assertVisible: "Smart Trainer"
- tapOn: "Фото"
```

**Альтернатива для web:** Playwright:

```typescript
test("register and view dashboard", async ({ page }) => {
  await page.goto("http://localhost");
  await page.click("text=Создать аккаунт");
  await page.fill("[placeholder='you@example.com']", "e2e@test.com");
  await page.fill("[placeholder='••••••••']", "password123");
  await page.click("text=Зарегистрироваться");
  await expect(page.locator("text=Smart Trainer")).toBeVisible();
});
```

**Трудоёмкость:** 4–8 часов

---

### 4.11 Event Sourcing для тренировок

**Когда нужно:** При необходимости полного аудита изменений данных, replay и analytics.

**Сейчас:** Обычный CRUD — достаточен для MVP. Audit log (рекомендация 2.5) покрывает основные потребности.

**Трудоёмкость:** 20+ часов (существенный рефакторинг)

---

## 5. Стратегические (Q3–Q4 2026)

Эти рекомендации относятся к масштабированию и монетизации. Детали — в `docs/FULL_ANALYSIS_AND_RECOMMENDATIONS.md`, раздел 11.

| # | Задача | Квартал | Зависимости |
|---|--------|---------|-------------|
| 1 | Stripe/Paddle интеграция | Q3 | — |
| 2 | Free/Pro/Team тарифы + middleware лимитов | Q3 | Stripe |
| 3 | App Store / Google Play (EAS Build) | Q3 | Push-уведомления |
| 4 | Wearables (Apple Health, Google Fit) | Q3 | — |
| 5 | Multi-instance deployment | Q4 | RS256, Redis, shared storage |
| 6 | B2B тариф для тренеров | Q4 | Тарифы |
| 7 | White-label | Q4 | B2B |
| 8 | Marketplace планов | Q4 | Тарифы, B2B |
| 9 | Международная локализация (EN, DE, ES) | Q4 | i18n готов |

---

## Сводная таблица трудоёмкости

| Приоритет | Задач | Суммарно часов | Рекомендуемый срок |
|-----------|-------|----------------|-------------------|
| Критические | 2 | 0.5 ч | 1 день |
| Высокие | 5 | 16–22 ч | 1–2 недели |
| Средние | 8 | 12–18 ч | 2–4 недели |
| Низкие | 11 | 45–65 ч | 1–3 месяца |
| **Всего** | **26** | **~75–105 ч** | — |

---

*Документ подготовлен на основе анализа ветки `main` (коммит `9f1203e`), 26 февраля 2026*
