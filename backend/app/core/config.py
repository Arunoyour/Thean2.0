from functools import lru_cache

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_env: str = "development"
    app_secret_key: str = Field(min_length=32)
    super_admin_token: str = Field(min_length=32)
    database_url: str
    pharmacy_database_url: str
    delivery_database_url: str = ""   # defaults to pharmacy DB if not set
    haircut_database_url: str          # required — dedicated thean_haircut DB
    core_database_schema: str = "T"
    pharmacy_database_schema: str = "PH"
    delivery_database_schema: str = "D"
    haircut_database_schema: str = "HC"
    database_pool_size: int = 20
    database_max_overflow: int = 40
    access_token_expire_minutes: int = 60
    mock_otp_enabled: bool = True
    mock_otp_code: str = "123456"
    cors_origins: list[AnyHttpUrl] | list[str] = ["http://localhost:5173"]
    media_root: str = "storage"
    media_url: str = "/media"
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_mailto: str = "mailto:admin@thean.app"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
