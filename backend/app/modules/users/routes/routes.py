from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.modules.batches.helpers.auth import require_super_admin
from app.modules.users.controllers import controller as users_controller
from app.modules.users.models.request_models import (
    CreateUserRequest,
    UpdateUserRequest,
    UserListResponse,
    UserResponse,
)

router = APIRouter(prefix="/users", tags=["users"])


def _bad_request(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


def _not_found(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("", response_model=UserListResponse)
def list_users_route(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: str = Depends(require_super_admin),
) -> UserListResponse:
    return users_controller.list_users(db, limit=limit, offset=offset)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user_route(
    payload: CreateUserRequest,
    db: Session = Depends(get_db),
    _: str = Depends(require_super_admin),
) -> UserResponse:
    try:
        return users_controller.create_user(payload, db)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.patch("/{user_id}", response_model=UserResponse)
def update_user_route(
    user_id: str,
    payload: UpdateUserRequest,
    db: Session = Depends(get_db),
    _: str = Depends(require_super_admin),
) -> UserResponse:
    try:
        return users_controller.update_user(user_id, payload, db)
    except ValueError as exc:
        detail = str(exc)
        if detail == "User not found":
            raise _not_found(exc) from exc
        raise _bad_request(exc) from exc


@router.delete("/{user_id}", response_model=UserResponse)
def delete_user_route(
    user_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_super_admin),
) -> UserResponse:
    try:
        return users_controller.delete_user(user_id, db)
    except ValueError as exc:
        detail = str(exc)
        if detail == "User not found":
            raise _not_found(exc) from exc
        raise _bad_request(exc) from exc
