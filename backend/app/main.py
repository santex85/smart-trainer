import logging
import sys
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, athlete_profile, chat, intervals, nutrition, photo, strava, users, wellness

# Ensure app loggers (Intervals, sync, etc.) print to stdout so you see them in the terminal
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logging.getLogger("app").setLevel(logging.DEBUG)
from app.config import settings
from app.db.session import init_db
from app.services.http_client import close_http_client, init_http_client
from app.services.strava_sync import process_sync_queue_one

scheduler = AsyncIOScheduler()


async def scheduled_orchestrator_run():
    """Run orchestrator (daily decision) for every user at configured hours."""
    from datetime import date
    from sqlalchemy import select
    from app.db.session import async_session_maker
    from app.models.user import User
    from app.services.orchestrator import run_daily_decision
    async with async_session_maker() as session:
        r = await session.execute(select(User))
        for user in r.scalars().all():
            await run_daily_decision(session, user.id, date.today())
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    init_http_client(timeout=30.0)

    async def strava_queue_worker():
        from app.db.session import async_session_maker
        async with async_session_maker() as session:
            await process_sync_queue_one(session)
            await session.commit()
    scheduler.add_job(strava_queue_worker, "interval", minutes=1)

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
app.include_router(strava.router, prefix="/api/v1")
app.include_router(athlete_profile.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(wellness.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
