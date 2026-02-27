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

### fail2ban (SSH и HTTP)

На хосте (с root или sudo) установить fail2ban и защитить SSH и логин/регистрацию API:

```bash
apt install -y fail2ban
```

Скопировать конфиги из репозитория (из каталога приложения на сервере):

```bash
cp deploy/fail2ban/jail.local.example /etc/fail2ban/jail.local
cp deploy/fail2ban/caddy-auth.conf.example /etc/fail2ban/filter.d/caddy-auth.conf
```

Для jail `caddy-auth` нужны логи Caddy в файле. Если Caddy в Docker пишет только в stdout, прокинуть том с доступом к логу на хост или настроить Caddy на запись access.log в файл; иначе jail `caddy-auth` не будет срабатывать (можно отключить в `jail.local`: `enabled = false`).

Перезапуск и проверка:

```bash
systemctl restart fail2ban
fail2ban-client status
fail2ban-client status sshd
fail2ban-client status caddy-auth   # если включён
```

Разбан IP при необходимости: `fail2ban-client set sshd unbanip <IP>` (или `caddy-auth` вместо `sshd`).

## 2. Файлы для production (в репозитории)

Уже есть:

- `docker-compose.prod.yml` — Caddy (HTTPS), без проброса портов frontend/backend наружу.
- `deploy/Caddyfile` — обратный прокси на frontend:80 (домен из переменной `DOMAIN`).
- `.env.production.example` — шаблон `.env` для сервера.
- `docker-compose.staging.yml` и `.env.staging.example` — для staging-окружения (см. раздел Staging ниже).

## 3. Деплой на сервере (по git)

```bash
git clone <url> smart_trainer
cd smart_trainer
cp .env.production.example .env
# Отредактировать .env: POSTGRES_PASSWORD, SECRET_KEY, ENCRYPTION_KEY,
# APP_ENV=production, GOOGLE_GEMINI_API_KEY, STRAVA_*, STRAVA_REDIRECT_URI=https://<домен>/api/v1/strava/callback,
# DEBUG=false, DOMAIN=<ваш-домен>. Опционально: JWT_PRIVATE_KEY и JWT_PUBLIC_KEY для RS256 (см. раздел про JWT ниже).
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend alembic upgrade head
```

## 4. Strava и проверка

- В [Strava API settings](https://www.strava.com/settings/api): Authorization Callback Domain и Callback URL: `https://<ваш-домен>/api/v1/strava/callback`.
- Открыть `https://<ваш-домен>`, проверить логин и API.

## 5. Prometheus и Grafana (мониторинг)

В production compose поднимаются Prometheus и Grafana. Метрики backend доступны по `GET /metrics`.

- **Prometheus** скрапит `backend:8000/metrics` каждые 15s (конфиг: `deploy/prometheus.yml`).
- **Grafana** доступна на `http://127.0.0.1:3000` (только с хоста; снаружи не открыта). Пароль админа: переменная `GRAFANA_PASSWORD` в `.env` (по умолчанию `admin`).

**Первый вход в Grafana:** откройте порт через SSH-туннель: `ssh -L 3000:127.0.0.1:3000 user@167.71.74.220`, затем в браузере `http://localhost:3000`. Логин `admin`, пароль из `GRAFANA_PASSWORD`. Добавьте Data source → Prometheus, URL: `http://prometheus:9090`, Save & Test.

## 6. Обновления

Вручную:

```bash
cd smart_trainer
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend alembic upgrade head  # при необходимости
```

Автоматически (при push в `main`): GitHub Actions workflow `.github/workflows/deploy.yml` подключается по SSH и выполняет те же команды. Нужны секреты в Settings → Secrets and variables → Actions: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`. На сервере репозиторий должен быть в `/root/smart_trainer` (или изменить путь в workflow).

### Версионирование образов и rollback

При каждом деплое образы backend и frontend помечаются тегом версии: `git describe --tags --always` (например, `v0.1.0` или короткий хеш коммита). Имена образов: `st2-backend:<version>`, `st2-frontend:<version>`.

**Rollback на предыдущую версию:** на сервере выполнить:
```bash
cd /root/smart_trainer
git log -1 --format=%h   # текущий коммит
git checkout <previous-commit-hash>
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend alembic upgrade head || true
```

## 7. JWT RS256 (опционально, для multi-instance / rollback)

Для нескольких реплик API за load balancer рекомендуется RS256: реплики проверяют токены по публичному ключу без доступа к секрету подписи.

**Генерация ключей:**
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

В `.env` задать `JWT_PRIVATE_KEY` и `JWT_PUBLIC_KEY` — содержимое PEM-файлов. В одной строке переносы заменить на `\n`. В production при задании одного ключа обязательно задать оба (иначе старт упадёт с ошибкой).

**Ротация ключей:** выдать новые ключи, задеплоить backend с новыми `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`. Старые выданные access-токены перестанут валидироваться; пользователям нужно перелогиниться или обновить токен через refresh. Refresh-токены хранятся в БД и не зависят от алгоритма JWT.

**Rollback:** при откате деплоя на предыдущую версию образа сохраняйте те же ключи в `.env` (или откатывайте `.env` вместе с образом), иначе старые токены не будут приниматься.

## 8. Staging

Отдельный сервер или тот же сервер с другим каталогом/namespace для тестирования перед production.

1. Клонировать репозиторий в отдельный каталог (например `/root/smart_trainer_staging`) или использовать другой compose project.
2. Скопировать `.env.staging.example` в `.env`, задать `DOMAIN=staging.yourdomain.com`, отдельные `POSTGRES_PASSWORD` и `POSTGRES_DB` (например `smart_trainer_staging`), чтобы не смешивать с production.
3. DNS: A-запись для `staging.yourdomain.com` на IP сервера (или тот же сервер с другим виртуальным хостом в Caddy).
4. Запуск:
   ```bash
   cd smart_trainer
   cp .env.staging.example .env
   # редактировать .env: DOMAIN, POSTGRES_*, SECRET_KEY, ENCRYPTION_KEY
   docker compose -f docker-compose.yml -f docker-compose.staging.yml -f docker-compose.prod.yml build
   docker compose -f docker-compose.yml -f docker-compose.staging.yml -f docker-compose.prod.yml up -d
   docker compose -f docker-compose.yml -f docker-compose.staging.yml -f docker-compose.prod.yml exec backend alembic upgrade head
   ```
   Если Caddy один на сервере, добавляют в `Caddyfile` второй виртуальный хост для `staging.yourdomain.com`, проксирующий на staging-frontend.
5. Различия с production: `APP_ENV=staging`, `DEBUG=true` по умолчанию, отдельная БД и секреты.
