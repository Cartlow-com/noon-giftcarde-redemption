from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.modules.login.models.db_models import User
from app.modules.users.models.request_models import UserListResponse, UserResponse


def list_users(db: Session, limit: int = 100, offset: int = 0) -> UserListResponse:
    total = db.scalar(select(func.count()).select_from(User)) or 0
    rows = db.scalars(
        select(User).order_by(desc(User.created_at)).limit(limit).offset(offset)
    ).all()
    return UserListResponse(
        users=[UserResponse.model_validate(u) for u in rows],
        total=total,
    )
