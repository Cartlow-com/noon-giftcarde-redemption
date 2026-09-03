from fastapi import Header, HTTPException, status

from app.config.settings import settings
from app.modules.login.services.get_session import get_session


def require_auth(
    authorization: str | None = Header(default=None),
    x_extension_token: str | None = Header(default=None, alias="X-Extension-Token"),
) -> str | None:
    if not settings.AUTH_REQUIRED:
        return None

    token_value = (settings.EXTENSION_API_TOKEN or "").strip()
    if token_value:
        if x_extension_token and x_extension_token == token_value:
            return "extension"
        if authorization == f"Bearer {token_value}":
            return "extension"

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
