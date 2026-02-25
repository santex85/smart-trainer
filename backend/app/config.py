from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/smart_trainer"
    google_gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_request_timeout_seconds: int = 90
    intervals_icu_base_url: str = "https://intervals.icu/api/v1"
    strava_client_id: str = ""
    strava_client_secret: str = ""
    strava_redirect_uri: str = ""
    encryption_key: str = ""
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    debug: bool = False
    # Orchestrator run schedule: comma-separated hours (0-23), e.g. "7,16" for 07:00 and 16:00
    orchestrator_cron_hours: str = "7,16"

    @property
    def sync_database_url(self) -> str:
        """PostgreSQL URL for sync drivers (Alembic)."""
        return self.database_url.replace("+asyncpg", "", 1)


settings = Settings()
