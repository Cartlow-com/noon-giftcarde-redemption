import csv
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.login.helpers.passwords import hash_password
from app.modules.login.models.db_models import User

DEFAULT_USER_EMAIL = "user@example.com"
DEFAULT_USER_PASSWORD = "password123"
USERS_CSV = Path(__file__).resolve().parent / "users.csv"


def _ensure_user(db: Session, email: str, password: str) -> None:
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        return
    db.add(
        User(
            id=str(uuid.uuid4()),
            email=email,
            hashed_password=hash_password(password),
            is_active=True,
        )
    )


def seed_users(db: Session) -> None:
    if USERS_CSV.exists():
        with USERS_CSV.open(encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                email = (row.get("email") or "").strip()
                password = (row.get("password") or "").strip()
                if email and password:
                    _ensure_user(db, email, password)
        db.commit()
        return

    _ensure_user(db, DEFAULT_USER_EMAIL, DEFAULT_USER_PASSWORD)
    db.commit()
