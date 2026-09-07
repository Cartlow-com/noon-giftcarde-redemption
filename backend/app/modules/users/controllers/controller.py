from sqlalchemy.orm import Session

from app.modules.users.models.request_models import (
    CreateUserRequest,
    UpdateUserRequest,
    UserListResponse,
    UserResponse,
)
from app.modules.users.services.create_user import create_user as create_user_svc
from app.modules.users.services.delete_user import soft_delete_user
from app.modules.users.services.list_users import list_users as list_users_svc
from app.modules.users.services.update_user import update_user as update_user_svc


def list_users(db: Session, limit: int, offset: int) -> UserListResponse:
    return list_users_svc(db, limit=limit, offset=offset)


def create_user(payload: CreateUserRequest, db: Session) -> UserResponse:
    return create_user_svc(payload, db)


def update_user(user_id: str, payload: UpdateUserRequest, db: Session) -> UserResponse:
    return update_user_svc(user_id, payload, db)


def delete_user(user_id: str, db: Session) -> UserResponse:
    return soft_delete_user(user_id, db)
