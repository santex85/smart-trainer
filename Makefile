# IP компьютера в Wi‑Fi: авто (en0 на Mac, иначе .wifi_ip или 192.168.1.157). Переопределить: make use-wifi WIFI_IP=192.168.1.200
WIFI_IP ?= $(shell (ipconfig getifaddr en0 2>/dev/null) || (hostname -I 2>/dev/null | awk '{print $$1}') || (cat .wifi_ip 2>/dev/null) || echo "192.168.1.157")

.PHONY: build up down run logs logs-backend logs-frontend logs-db ps migrate shell-backend use-localhost use-wifi set-wifi

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down --remove-orphans

# Полный цикл: остановить контейнеры и тома, пересобрать, запустить, миграции (проект st2 — обходит залипший container ID в старом проекте smart_trainer)
run:
	docker compose down -v --remove-orphans
	docker compose build
	docker compose up -d
	@echo "Ожидание запуска backend..."
	@sleep 20
	docker compose exec backend alembic upgrade head
	@echo "Готово. Фронт: http://localhost"

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

logs-db:
	docker compose logs -f postgres

ps:
	docker compose ps

migrate:
	docker compose exec backend alembic upgrade head

shell-backend:
	docker compose exec backend sh

# Переключить конфиг на localhost (браузер на этом же компе)
use-localhost:
	@echo "EXPO_PUBLIC_API_URL=http://localhost:8000" > frontend/.env
	@echo "Готово: API = localhost:8000"

# Переключить конфиг на Wi‑Fi (доступ с телефона). IP авто (en0 / hostname -I / .wifi_ip) или: make use-wifi WIFI_IP=192.168.1.200
use-wifi:
	@echo "IP: $(WIFI_IP)"
	@echo "EXPO_PUBLIC_API_URL=http://$(WIFI_IP):8000" > frontend/.env
	@echo "Готово: API = $(WIFI_IP):8000 (открой с телефона http://$(WIFI_IP))"

# Сохранить IP Wi‑Fi и переключить конфиг. Пример: make set-wifi IP=192.168.1.157
set-wifi:
	@if [ -z "$(IP)" ]; then echo "Укажи IP: make set-wifi IP=192.168.1.157"; exit 1; fi
	@echo "$(IP)" > .wifi_ip
	@$(MAKE) use-wifi WIFI_IP=$(IP)
