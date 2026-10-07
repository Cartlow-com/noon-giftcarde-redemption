from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    APP_NAME: str = "Noon Automation API"
    DEBUG: bool = True
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    DATABASE_URL: str = "sqlite:///./app.db"
    SECRET_KEY: str = "change-me-in-production"
    # Used only when the super admin account is first created (never resets it).
    SUPER_ADMIN_INITIAL_PASSWORD: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days (unattended batches)
    AUTH_REQUIRED: bool = True
    EXTENSION_API_TOKEN: str = ""
    EXTENSION_HEARTBEAT_TTL_SECONDS: int = 90

    EXPECTED_ROW_SECONDS: int = 180

    # Off by default: every free proxy tested 2026-10-05 was blocked by Noon (403 /
    # timeouts) while direct worked. Turn on only with a proxy source that loads Noon.
    PROXY_ROTATION_ENABLED: bool = False

    SCREENSHOT_STORAGE_DIR: str = "storage/screenshots"

    FAILOVER_MAIL_PROVIDER: str = "amazon-ses"
    FAILOVER_MAIL_HOST: str = ""
    FAILOVER_MAIL_PORT: int = 587
    FAILOVER_MAIL_USERNAME: str = ""
    FAILOVER_MAIL_PASSWORD: str = ""
    FAILOVER_MAIL_ENCRYPTION: str = "tls"
    FAILOVER_MAIL_FROM_ADDRESS: str = "notification@innovidio.com"
    FAILOVER_MAIL_FROM_NAME: str = "Innovidio"

    GMAIL_CLIENT_ID: str = ""
    GMAIL_CLIENT_SECRET: str = ""
    GMAIL_REDIRECT_URL: str = "http://localhost:8000/gmail/oauth/callback"


settings = Settings()
