from fastapi import Header, HTTPException, status

from app.config.settings import settings
from app.modules.login.services.get_session import get_session


def require_auth(authorization: str | None = Header(default=None)) -> str | None:
    if not settings.AUTH_REQUIRED:
        return None

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    token = authorization.removeprefix("Bearer ")
    try:
        session = get_session(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    return session.user_id
