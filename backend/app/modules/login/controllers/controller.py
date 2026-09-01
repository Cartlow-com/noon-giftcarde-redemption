from sqlalchemy.orm import Session

from app.modules.login.models.request_models import LoginRequest, RefreshSessionRequest
from app.modules.login.models.response_models import SessionResponse, TokenResponse
from app.modules.login.services.create_session import create_session
from app.modules.login.services.delete_session import delete_session
from app.modules.login.services.get_session import get_session
from app.modules.login.services.update_session import update_session


def login(payload: LoginRequest, db: Session) -> TokenResponse:
    return create_session(payload, db)


def logout(refresh_token: str) -> dict[str, str]:
    return delete_session(refresh_token)


def current_session(access_token: str) -> SessionResponse:
    return get_session(access_token)


def refresh_session(payload: RefreshSessionRequest) -> TokenResponse:
    return update_session(payload.refresh_token)
