from sqlalchemy.orm import Session

from app.modules.login.models.db_models import User
from app.modules.users.helpers.guards import assert_not_last_super_admin
from app.modules.users.models.request_models import UserResponse


def soft_delete_user(user_id: str, db: Session) -> UserResponse:
    user = db.get(User, user_id)
    if not user:
        raise ValueError("User not found")
    assert_not_last_super_admin(db, user, next_active=False)
    user.is_active = False
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)
