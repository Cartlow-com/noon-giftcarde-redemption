from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.modules.login.controllers.controller import (
    current_session,
    login,
    logout,
    refresh_session,
)
from app.modules.login.models.request_models import LoginRequest, RefreshSessionRequest
from app.modules.login.models.response_models import SessionResponse, TokenResponse

router = APIRouter(prefix="/login", tags=["login"])


def _auth_error(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))


@router.post("", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def login_route(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        return login(payload, db)
    except ValueError as exc:
        raise _auth_error(exc) from exc


@router.post("/refresh", response_model=TokenResponse)
def refresh_route(payload: RefreshSessionRequest) -> TokenResponse:
    try:
        return refresh_session(payload)
    except ValueError as exc:
        raise _auth_error(exc) from exc


@router.get("/me", response_model=SessionResponse)
def me_route(authorization: str | None = Header(default=None)) -> SessionResponse:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        return current_session(authorization.removeprefix("Bearer "))
    except ValueError as exc:
        raise _auth_error(exc) from exc


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
def logout_route(refresh_token: str) -> None:
    try:
        logout(refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
