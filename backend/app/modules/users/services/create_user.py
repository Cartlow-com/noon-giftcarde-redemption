import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.login.helpers.passwords import hash_password
from app.modules.login.models.db_models import ROLE_USER, VALID_ROLES, User
from app.modules.users.models.request_models import CreateUserRequest, UserResponse


def create_user(payload: CreateUserRequest, db: Session) -> UserResponse:
    role = (payload.role or ROLE_USER).strip() or ROLE_USER
    if role not in VALID_ROLES:
        raise ValueError("Invalid role")
    existing = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if existing:
        raise ValueError("Email already registered")
    user = User(
        id=str(uuid.uuid4()),
        email=str(payload.email).lower(),
        hashed_password=hash_password(payload.password),
        role=role,
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)
