import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1 import auth, athlete_profile, chat, intervals, nutrition, photo, users, wellness, workouts

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logging.getLogger("app").setLevel(logging.DEBUG)
from app.config import settings
from app.db.session import init_db
from app.services.http_client import close_http_client, init_http_client

scheduler = AsyncIOScheduler()

ORCHESTRATOR_CONCURRENCY = 5

logger = logging.getLogger(__name__)


async def _run_for_user(user_id: int, today, semaphore: asyncio.Semaphore):
    from app.db.session import async_session_maker
    from app.services.orchestrator import run_daily_decision
    async with semaphore:
        try:
            async with async_session_maker() as session:
                await run_daily_decision(session, user_id, today)
                await session.commit()
        except Exception:
            logger.exception("Orchestrator failed for user_id=%s", user_id)


async def scheduled_orchestrator_run():
    """Run orchestrator (daily decision) for every user concurrently (bounded)."""
    from datetime import date
    from sqlalchemy import select
    from app.db.session import async_session_maker
    from app.models.user import User
    async with async_session_maker() as session:
        r = await session.execute(select(User.id))
        user_ids = [row[0] for row in r.all()]
    if not user_ids:
        return
    today = date.today()
    sem = asyncio.Semaphore(ORCHESTRATOR_CONCURRENCY)
    await asyncio.gather(*[_run_for_user(uid, today, sem) for uid in user_ids])


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    init_http_client(timeout=30.0)

    if settings.google_gemini_api_key:
        import google.generativeai as genai
        genai.configure(api_key=settings.google_gemini_api_key)

    # Orchestrator: run at configured hours (e.g. 07:00 and 16:00)
    try:
        hours = [int(h.strip()) for h in settings.orchestrator_cron_hours.split(",") if h.strip()]
    except ValueError:
        hours = [7, 16]
    for hour in hours:
        if 0 <= hour <= 23:
            scheduler.add_job(scheduled_orchestrator_run, "cron", hour=hour, minute=0)

    scheduler.start()
    yield
    scheduler.shutdown()
    await close_http_client()


app = FastAPI(
    title="Smart Trainer API",
    description="AI Trainer backend: nutrition, Intervals.icu, orchestrator",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(nutrition.router, prefix="/api/v1")
app.include_router(photo.router, prefix="/api/v1")
app.include_router(intervals.router, prefix="/api/v1")
app.include_router(athlete_profile.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(wellness.router, prefix="/api/v1")
app.include_router(workouts.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
