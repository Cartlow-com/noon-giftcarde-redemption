from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    APP_NAME: str = "Noon Automation API"
    DEBUG: bool = True
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    DATABASE_URL: str = "sqlite:///./app.db"
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    AUTH_REQUIRED: bool = False
    EXTENSION_API_TOKEN: str = ""
    EXTENSION_HEARTBEAT_TTL_SECONDS: int = 90

    EXPECTED_ROW_SECONDS: int = 180

    SCREENSHOT_STORAGE_DIR: str = "storage/screenshots"

    FAILOVER_MAIL_PROVIDER: str = "amazon-ses"
    FAILOVER_MAIL_HOST: str = ""
    FAILOVER_MAIL_PORT: int = 587
    FAILOVER_MAIL_USERNAME: str = ""
    FAILOVER_MAIL_PASSWORD: str = ""
    FAILOVER_MAIL_ENCRYPTION: str = "tls"
    FAILOVER_MAIL_FROM_ADDRESS: str = "notification@cartlow.com"
    FAILOVER_MAIL_FROM_NAME: str = "Cartlow"


settings = Settings()
