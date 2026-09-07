from sqlalchemy.orm import Session

from app.modules.login.helpers.passwords import hash_password
from app.modules.login.models.db_models import VALID_ROLES, User
from app.modules.users.helpers.guards import assert_not_last_super_admin
from app.modules.users.models.request_models import UpdateUserRequest, UserResponse


def update_user(user_id: str, payload: UpdateUserRequest, db: Session) -> UserResponse:
    user = db.get(User, user_id)
    if not user:
        raise ValueError("User not found")

    next_role = payload.role if payload.role is not None else None
    if next_role is not None:
        next_role = next_role.strip()
        if next_role not in VALID_ROLES:
            raise ValueError("Invalid role")

    assert_not_last_super_admin(
        db,
        user,
        next_role=next_role,
        next_active=payload.is_active,
    )

    if payload.password is not None:
        user.hashed_password = hash_password(payload.password)
    if next_role is not None:
        user.role = next_role
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)
