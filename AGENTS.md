# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Smart Trainer (ИИ-Тренер) is a two-service monorepo (FastAPI backend + Expo React Native Web frontend) with PostgreSQL, all orchestrated via Docker Compose. See `README.md` for full architecture and API overview.

### Services

| Service | Port | Notes |
|---------|------|-------|
| PostgreSQL 16 | 5432 | Database |
| Backend (FastAPI/uvicorn) | 8000 | API server; health at `/health`, Swagger at `/docs` |
| Frontend (nginx serving Expo web build) | 80 | SPA with `/api/` proxied to backend |

### Starting services

```bash
# From repo root:
sudo docker compose build && sudo docker compose up -d
```

Wait for the backend health check to pass (`healthy` status in `sudo docker compose ps`), then stamp migrations if starting fresh:

```bash
sudo docker compose exec backend alembic stamp head
```

The FastAPI `lifespan` handler calls `init_db()` which auto-creates all tables via SQLAlchemy `metadata.create_all`. This means Alembic migrations may fail with `DuplicateTable` on a fresh DB. Use `alembic stamp head` to sync the migration tracking after the first start.

### Gotchas

- **Docker-in-Docker**: This cloud VM requires `sudo` for all Docker commands. The Docker daemon is started manually via `sudo dockerd` (no systemd). After VM reboot, you must start dockerd before running compose.
- **`.env` file**: `docker-compose.yml` reads `.env` at the repo root for `POSTGRES_PASSWORD` and other secrets. This file is `.gitignore`d — copy from `.env.example` and set values.
- **Pre-existing lint issues**: The codebase has ~37 ruff warnings (backend) and ~11 TypeScript type errors (frontend). These are pre-existing and not blocking — the application runs fine.
- **AI features require `GOOGLE_GEMINI_API_KEY`**: Nutrition photo analysis, sleep parsing, AI coach chat, and the orchestrator all require a valid Gemini API key. A dummy key is used for dev; these features will return errors without a real key.
- **Strava/Intervals.icu**: Optional integrations; the app works without them.

### Lint / Type check commands

- **Backend**: `cd backend && python3 -m ruff check .`
- **Frontend**: `cd frontend && npx tsc --noEmit`

### Testing

No automated test suite exists yet. The `pyproject.toml` lists `pytest` and `pytest-asyncio` in `[project.optional-dependencies.dev]` but no test files are present. Manual testing is via the web UI and API endpoints (Swagger at `http://localhost:8000/docs`).
