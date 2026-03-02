from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/smart_trainer"
    google_gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_request_timeout_seconds: int = 90
    intervals_icu_base_url: str = "https://intervals.icu/api/v1"
    intervals_sync_timeout_seconds: int = 120
    s3_endpoint_url: str = "http://minio:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "smart-trainer"
    encryption_key: str = ""
    secret_key: str = "change-me-in-production"
    app_env: str = "development"  # "production" enables strict checks (ENCRYPTION_KEY, etc.)
    # JWT: use RS256 when JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are set; otherwise HS256 with SECRET_KEY
    jwt_algorithm: str = "HS256"
    jwt_private_key: str = ""  # PEM string for RS256 (multi-line in .env: use \n)
    jwt_public_key: str = ""    # PEM string for RS256
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    refresh_token_expire_days: int = 7
    cors_origins: str = "http://localhost:8081,http://localhost:19006,http://localhost:19000"
    enable_hsts: bool = False  # Set True in production behind HTTPS
    debug: bool = False
    # Orchestrator run schedule: comma-separated hours (0-23), e.g. "7,16" for 07:00 and 16:00
    orchestrator_cron_hours: str = "7,16"

    # Retention: recovery reminder after heavy workout (TSS > threshold yesterday, no chat today)
    retention_recovery_reminder_hour: int = 18  # run at 18:00
    retention_tss_threshold: float = 100.0  # sum TSS yesterday above this triggers reminder

    # Stripe billing
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_monthly: str = ""  # Stripe Price ID for monthly plan
    stripe_price_annual: str = ""   # Stripe Price ID for annual plan
    free_daily_photo_limit: int = 3
    free_daily_chat_limit: int = 10

    @property
    def sync_database_url(self) -> str:
        """PostgreSQL URL for sync drivers (Alembic)."""
        return self.database_url.replace("+asyncpg", "", 1)

    @property
    def use_rs256(self) -> bool:
        """True if RSA keys are set and RS256 should be used."""
        return bool(self.jwt_private_key.strip() and self.jwt_public_key.strip())

    def validate_jwt_config(self) -> None:
        """Raise if production config is inconsistent (e.g. only one RSA key set)."""
        if self.app_env != "production":
            return
        has_private = bool(self.jwt_private_key.strip())
        has_public = bool(self.jwt_public_key.strip())
        if has_private and not has_public:
            raise RuntimeError("JWT_PRIVATE_KEY is set but JWT_PUBLIC_KEY is missing in production")
        if has_public and not has_private:
            raise RuntimeError("JWT_PUBLIC_KEY is set but JWT_PRIVATE_KEY is missing in production")


settings = Settings()
