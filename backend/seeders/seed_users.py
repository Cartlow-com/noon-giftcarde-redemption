import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.login.helpers.passwords import hash_password
from app.modules.login.models.db_models import User

DEFAULT_USER_EMAIL = "user@example.com"
DEFAULT_USER_PASSWORD = "password123"


def seed_users(db: Session) -> None:
    existing = db.scalar(select(User).where(User.email == DEFAULT_USER_EMAIL))
    if existing:
        return

    db.add(
        User(
            id=str(uuid.uuid4()),
            email=DEFAULT_USER_EMAIL,
            hashed_password=hash_password(DEFAULT_USER_PASSWORD),
            is_active=True,
        )
    )
    db.commit()
