from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.login.models.db_models import ROLE_SUPER_ADMIN, User


def count_active_super_admins(db: Session, *, exclude_user_id: str | None = None) -> int:
    q = select(func.count()).select_from(User).where(
        User.role == ROLE_SUPER_ADMIN,
        User.is_active.is_(True),
    )
    if exclude_user_id:
        q = q.where(User.id != exclude_user_id)
    return db.scalar(q) or 0


def assert_not_last_super_admin(
    db: Session,
    user: User,
    *,
    next_role: str | None = None,
    next_active: bool | None = None,
) -> None:
    """Block demote/deactivate when this is the last active super_admin."""
    role = next_role if next_role is not None else user.role
    active = next_active if next_active is not None else user.is_active
    would_lose = user.role == ROLE_SUPER_ADMIN and user.is_active and (
        role != ROLE_SUPER_ADMIN or not active
    )
    if not would_lose:
        return
    remaining = count_active_super_admins(db, exclude_user_id=user.id)
    if remaining < 1:
        raise ValueError("Cannot remove the last active super admin")
