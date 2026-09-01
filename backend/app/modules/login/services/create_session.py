from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.login.helpers.passwords import verify_password
from app.modules.login.helpers.tokens import create_access_token, create_refresh_token
from app.modules.login.models.db_models import User
from app.modules.login.models.request_models import LoginRequest
from app.modules.login.models.response_models import TokenResponse


def create_session(payload: LoginRequest, db: Session) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not user.is_active:
        raise ValueError("Invalid credentials")
    if not verify_password(payload.password, user.hashed_password):
        raise ValueError("Invalid credentials")

    return TokenResponse(
        access_token=create_access_token(user.id, user.email),
        refresh_token=create_refresh_token(user.id),
    )
