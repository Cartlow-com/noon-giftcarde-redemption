from datetime import UTC, datetime, timedelta

from jose import jwt

from app.config.settings import settings

ALGORITHM = "HS256"


def create_access_token(
    user_id: str,
    email: str,
    role: str = "user",
    token_version: int = 0,
) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "tv": int(token_version),
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    expire = datetime.now(UTC) + timedelta(days=7)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "tv": int(token_version),
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
