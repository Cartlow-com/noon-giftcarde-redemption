from sqlalchemy.orm import Session

from app.modules.login.helpers.passwords import hash_password, verify_password
from app.modules.login.helpers.tokens import create_access_token, create_refresh_token
from app.modules.login.models.db_models import User
from app.modules.login.models.request_models import ChangePasswordRequest
from app.modules.login.models.response_models import TokenResponse


def change_password(user_id: str, payload: ChangePasswordRequest, db: Session) -> TokenResponse:
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise PermissionError("Invalid token")
    if not verify_password(payload.current_password, user.hashed_password):
        raise ValueError("Current password is incorrect")
    if payload.new_password == payload.current_password:
        raise ValueError("New password must be different from the current one")

    user.hashed_password = hash_password(payload.new_password)
    user.must_change_password = False
    # Revoke every other session; the caller gets fresh tokens below.
    user.token_version = int(user.token_version or 0) + 1
    db.commit()
    db.refresh(user)

    version = int(user.token_version or 0)
    return TokenResponse(
        access_token=create_access_token(user.id, user.email, user.role, version),
        refresh_token=create_refresh_token(user.id, version),
    )
