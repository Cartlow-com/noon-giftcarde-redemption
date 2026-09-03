import csv
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.login.helpers.passwords import hash_password
from app.modules.login.models.db_models import User

DEFAULT_USER_EMAIL = "user@example.com"
DEFAULT_USER_PASSWORD = "password123"
DEFAULT_ADMIN_EMAIL = "admin@example.com"
DEFAULT_ADMIN_PASSWORD = "admin123"
USERS_CSV = Path(__file__).resolve().parent / "users.csv"


def _ensure_user(db: Session, email: str, password: str) -> User:
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        return existing
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        hashed_password=hash_password(password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def seed_users(db: Session) -> None:
    if USERS_CSV.exists():
        with USERS_CSV.open(encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                email = (row.get("email") or "").strip()
                password = (row.get("password") or "").strip()
                if email and password:
                    _ensure_user(db, email, password)
    else:
        _ensure_user(db, DEFAULT_USER_EMAIL, DEFAULT_USER_PASSWORD)
        _ensure_user(db, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)

    # Guarantee both seeded accounts exist even if CSV omits one.
    _ensure_user(db, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
    _ensure_user(db, DEFAULT_USER_EMAIL, DEFAULT_USER_PASSWORD)
    db.commit()


def get_admin_user_id(db: Session) -> str | None:
    """Primary seed account used to own legacy (pre-tenant) rows."""
    admin = db.scalar(select(User).where(User.email == DEFAULT_ADMIN_EMAIL))
    if admin:
        return admin.id
    any_user = db.scalar(select(User).order_by(User.created_at.asc()))
    return any_user.id if any_user else None
