from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.login.models.db_models import ROLE_USER, User
from app.modules.login.models.response_models import SessionResponse

ALGORITHM = "HS256"


def get_session(access_token: str, db: Session | None = None) -> SessionResponse:
    try:
        payload = jwt.decode(access_token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid token") from exc

    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id or not email:
        raise ValueError("Invalid token payload")

    token_version = int(payload.get("tv") or 0)

    if db is not None:
        user = db.get(User, user_id)
        if not user or not user.is_active:
            raise ValueError("Invalid token")
        current_version = int(user.token_version or 0)
        if token_version != current_version:
            raise ValueError("Session expired — sign in again")
        return SessionResponse(
            user_id=user.id,
            email=user.email,
            role=user.role or ROLE_USER,
            is_active=user.is_active,
            must_change_password=bool(user.must_change_password),
        )

    return SessionResponse(
        user_id=user_id,
        email=email,
        role=payload.get("role") or ROLE_USER,
        is_active=True,
    )
