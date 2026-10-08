from sqlalchemy.orm import Session

from app.modules.login.models.request_models import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshSessionRequest,
)
from app.modules.login.models.response_models import SessionResponse, TokenResponse
from app.modules.login.services.change_password import change_password
from app.modules.login.services.create_session import create_session
from app.modules.login.services.delete_session import delete_session
from app.modules.login.services.get_session import get_session
from app.modules.login.services.update_session import update_session


def login(payload: LoginRequest, db: Session) -> TokenResponse:
    return create_session(payload, db)


def logout(refresh_token: str) -> dict[str, str]:
    return delete_session(refresh_token)


def current_session(access_token: str, db: Session) -> SessionResponse:
    return get_session(access_token, db)


def refresh_session(payload: RefreshSessionRequest, db: Session) -> TokenResponse:
    return update_session(payload.refresh_token, db)


def update_password(user_id: str, payload: ChangePasswordRequest, db: Session) -> TokenResponse:
    return change_password(user_id, payload, db)
