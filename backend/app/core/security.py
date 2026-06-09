from datetime import UTC, datetime, timedelta
from secrets import randbelow

import bcrypt
from jose import jwt

from app.core.config import get_settings

ALGORITHM = "HS256"


def generate_otp() -> str:
    return f"{randbelow(1_000_000):06d}"


def hash_secret(value: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(value.encode("utf-8"), salt).decode("utf-8")


def verify_secret(value: str, hashed_value: str) -> bool:
    return bcrypt.checkpw(value.encode("utf-8"), hashed_value.encode("utf-8"))


def create_access_token(subject: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "iat": int(now.timestamp()), "exp": int(expires_at.timestamp())}
    return jwt.encode(payload, settings.app_secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.app_secret_key, algorithms=[ALGORITHM])
