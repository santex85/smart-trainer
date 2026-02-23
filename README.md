# Smart Trainer (ИИ-Тренер) MVP

Cross-platform AI sports coach: nutrition from plate photos (Gemini), Intervals.icu integration (wellness, CTL/ATL, events), and an AI orchestrator that suggests Go/Modify/Skip for daily training.

## Structure

- **backend/** — FastAPI, PostgreSQL, Gemini (nutrition + orchestrator), Intervals.icu client, sync job, chat API
- **frontend/** — Expo (React Native): dashboard, camera FAB, AI coach chat

## Quick start

### Run with Docker (recommended)

1. Copy env and set secrets:
   ```bash
   cp .env.example .env
   # Edit .env: set POSTGRES_PASSWORD, GOOGLE_GEMINI_API_KEY (and optionally ENCRYPTION_KEY, SECRET_KEY)
   ```
2. Build and start:
   ```bash
   make build
   make up
   make migrate
   ```
3. Open http://localhost (frontend). API is at http://localhost/api/v1/ (proxied via nginx).
4. Optional: create a user in the DB (see backend/README.md) so the app has a user for nutrition and chat.

Make targets: `make build`, `make up`, `make down`, `make logs`, `make migrate`, `make shell-backend`, `make ps`, `make logs-backend`, `make logs-frontend`, `make logs-db`.

### Backend (local)

```bash
cd backend
cp .env.example .env   # set DATABASE_URL, GOOGLE_GEMINI_API_KEY
pip install -r requirements.txt   # or uv sync
alembic upgrade head
# Create a user (see backend/README.md)
uvicorn app.main:app --reload
```

### Frontend (local)

```bash
cd frontend
npm install
# Set EXPO_PUBLIC_API_URL in .env (e.g. http://localhost:8000)
npx expo start
```

## API overview

- `POST /api/v1/nutrition/analyze` — upload meal photo → Gemini → JSON (name, calories, macros), saved to `food_log`
- `POST /api/v1/intervals/link` — store Intervals.icu athlete_id + API key (encrypted)
- `POST /api/v1/intervals/sync` — fetch wellness/activities, cache CTL/ATL/TSB
- `GET /api/v1/intervals/wellness`, `GET /api/v1/intervals/events` — cached wellness and planned events
- `GET /api/v1/chat/history`, `POST /api/v1/chat/send` — chat with AI coach
- `POST /api/v1/chat/orchestrator/run` — run daily decision (Go/Modify/Skip), optionally update Intervals and add chat message

## Roadmap (done in this repo)

- Sprint 1: Backend + Gemini nutrition
- Sprint 2: Intervals.icu client, sync, wellness cache
- Sprint 3: AI Orchestrator (3-level hierarchy, structured output)
- Sprint 4: Frontend (dashboard, camera, chat)
