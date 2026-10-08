from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.modules.batches.helpers.ownership import is_super_admin
from app.modules.login.models.db_models import ROLE_SUPER_ADMIN
from app.modules.login.services.get_session import get_session

PASSWORD_CHANGE_REQUIRED = "Password change required"


def _reject_pending_password_change(session) -> None:
    """Admin-set passwords must be replaced before anything else is allowed."""
    if session.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PASSWORD_CHANGE_REQUIRED,
        )


def require_auth(
    authorization: str | None = Header(default=None),
    x_extension_token: str | None = Header(default=None, alias="X-Extension-Token"),
    db: Session = Depends(get_db),
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
        session = get_session(token, db)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    _reject_pending_password_change(session)
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


def resolve_batch_list_scope(
    user_id: str | None,
    db: Session,
    filter_user_id: str | None = None,
) -> tuple[str | None, bool]:
    """
    Returns (owner_filter, list_all).
    list_all=True only for super_admin; owner_filter None means every user.
    """
    if user_id and is_super_admin(db, user_id):
        return filter_user_id, True
    return resolve_owner_user_id(user_id, db), False


def require_super_admin(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    """Return user_id for a super_admin caller, else 401/403."""
    if not settings.AUTH_REQUIRED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin required",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    try:
        session = get_session(authorization.removeprefix("Bearer "), db)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    _reject_pending_password_change(session)
    if session.role != ROLE_SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin required",
        )
    return session.user_id
