from sqlalchemy.orm import Session

from app.modules.login.helpers.passwords import hash_password
from app.modules.login.models.db_models import VALID_ROLES, User
from app.modules.users.helpers.guards import assert_not_last_super_admin
from app.modules.users.models.request_models import UpdateUserRequest, UserResponse


def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    db: Session,
    *,
    actor_id: str | None = None,
) -> UserResponse:
    user = db.get(User, user_id)
    if not user:
        raise ValueError("User not found")

    next_role = payload.role if payload.role is not None else None
    if next_role is not None:
        next_role = next_role.strip()
        if next_role not in VALID_ROLES:
            raise ValueError("Invalid role")

    if payload.must_change_password and user.id == actor_id:
        raise ValueError("Use Change password in the profile menu for your own account")

    assert_not_last_super_admin(
        db,
        user,
        next_role=next_role,
        next_active=payload.is_active,
    )

    if payload.password is not None:
        user.hashed_password = hash_password(payload.password)
        # Revoke sessions issued under the old password (JWTs carry token_version).
        user.token_version = int(user.token_version or 0) + 1
        # An admin-chosen password is temporary by default; resetting your own is not.
        if payload.must_change_password is None:
            user.must_change_password = user.id != actor_id
        else:
            user.must_change_password = payload.must_change_password
    if payload.must_change_password is not None and payload.password is None:
        if payload.must_change_password and not user.must_change_password:
            # Sign them out now so the next sign-in lands on the change-password screen.
            user.token_version = int(user.token_version or 0) + 1
        user.must_change_password = payload.must_change_password
    if next_role is not None:
        user.role = next_role
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)
