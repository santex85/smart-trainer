# Деплой smart_trainer на production (167.71.74.220)

## Phase 0: Анализ сервера и очистка (сделать первым)

На сервере уже есть два приложения: **одно в бэкапе (бэкап оставить)**, **второе — удалить**.

1. Подключиться по SSH: `ssh user@167.71.74.220`.
2. Скопировать и запустить скрипт анализа (или выполнить команды из него вручную):
   ```bash
   # Если репозиторий уже клонирован:
   chmod +x deploy/analyze-server.sh
   ./deploy/analyze-server.sh
   ```
   Скрипт выведет: контейнеры, compose-проекты, каталоги приложений, бэкапы, cron.
3. Определить:
   - **Приложение A** — чей бэкап **оставляем** (путь к бэкапу не трогать).
   - **Приложение B** — которое **удаляем** (контейнеры + тома + каталог).
4. Удалить приложение B:
   ```bash
   cd /path/to/app_b
   docker compose down -v
   cd ..
   rm -rf /path/to/app_b
   ```
   Или запустить скрипт с путём: `./deploy/analyze-server.sh /path/to/app_b` (скрипт предложит удалить каталог).
5. Зафиксировать: путь к бэкапу A (не перезаписывать при деплое smart_trainer).

---

## 1. Подготовка сервера

- Установить Docker и Docker Compose, git (если ещё нет).
- Фаервол: открыть 80 (HTTP, для ACME), 443 (HTTPS), 22 (SSH).
- DNS: A-запись домена должна указывать на 167.71.74.220.

## 2. Файлы для production (в репозитории)

Уже есть:

- `docker-compose.prod.yml` — Caddy (HTTPS), без проброса портов frontend/backend наружу.
- `deploy/Caddyfile` — обратный прокси на frontend:80 (домен из переменной `DOMAIN`).
- `.env.production.example` — шаблон `.env` для сервера.

## 3. Деплой на сервере (по git)

```bash
git clone <url> smart_trainer
cd smart_trainer
cp .env.production.example .env
# Отредактировать .env: POSTGRES_PASSWORD, SECRET_KEY, ENCRYPTION_KEY,
# GOOGLE_GEMINI_API_KEY, STRAVA_*, STRAVA_REDIRECT_URI=https://<домен>/api/v1/strava/callback,
# DEBUG=false, DOMAIN=<ваш-домен>
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend alembic upgrade head
```

## 4. Strava и проверка

- В [Strava API settings](https://www.strava.com/settings/api): Authorization Callback Domain и Callback URL: `https://<ваш-домен>/api/v1/strava/callback`.
- Открыть `https://<ваш-домен>`, проверить логин и API.

## 5. Обновления

```bash
cd smart_trainer
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend alembic upgrade head  # при необходимости
```
