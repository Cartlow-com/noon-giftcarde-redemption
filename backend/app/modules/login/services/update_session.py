from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.login.helpers.tokens import create_access_token, create_refresh_token
from app.modules.login.models.db_models import User
from app.modules.login.models.response_models import TokenResponse

ALGORITHM = "HS256"


def update_session(refresh_token: str, db: Session) -> TokenResponse:
    try:
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid refresh token") from exc

    if payload.get("type") != "refresh":
        raise ValueError("Invalid refresh token")

    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("Invalid refresh token payload")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise ValueError("Invalid refresh token")

    return TokenResponse(
        access_token=create_access_token(user.id, user.email, user.role),
        refresh_token=create_refresh_token(user.id),
    )
