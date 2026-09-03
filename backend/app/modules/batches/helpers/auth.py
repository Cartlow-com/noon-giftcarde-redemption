from fastapi import Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.login.services.get_session import get_session


def require_auth(
    authorization: str | None = Header(default=None),
    x_extension_token: str | None = Header(default=None, alias="X-Extension-Token"),
) -> str | None:
    """Return authenticated user_id, or None when AUTH_REQUIRED is false."""
    if not settings.AUTH_REQUIRED:
        return None

    token_value = (settings.EXTENSION_API_TOKEN or "").strip()
    if token_value:
        if x_extension_token and x_extension_token == token_value:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Shared extension token is disabled — sign in on the dashboard",
            )
        if authorization == f"Bearer {token_value}":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Shared extension token is disabled — sign in on the dashboard",
            )

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


def resolve_owner_user_id(user_id: str | None, db: Session) -> str:
    """When auth is off, fall back to seeded admin for ownership writes."""
    if user_id:
        return user_id
    from seeders.seed_users import get_admin_user_id

    admin_id = get_admin_user_id(db)
    if not admin_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No owner user available",
        )
    return admin_id
