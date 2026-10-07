import csv
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.login.helpers.passwords import hash_password
from app.modules.login.models.db_models import ROLE_SUPER_ADMIN, ROLE_USER, User

DEFAULT_USER_EMAIL = "user@example.com"
DEFAULT_USER_PASSWORD = "password123"
DEFAULT_ADMIN_EMAIL = "admin@example.com"
DEFAULT_ADMIN_PASSWORD = "admin123"
SUPER_ADMIN_EMAIL = "admin@innovidio.com"
SUPER_ADMIN_PASSWORD = "admin@123"
LEGACY_SUPER_ADMIN_EMAIL = "legacy-admin@example.com"
USERS_CSV = Path(__file__).resolve().parent / "users.csv"


def _ensure_user(db: Session, email: str, password: str, role: str = ROLE_USER) -> User:
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        # Never reset an existing account's password or re-activate it on boot:
        # a rotated/deactivated super admin must stay that way across restarts.
        existing.role = role
        return existing
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        hashed_password=hash_password(password),
        role=role,
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
                role = (row.get("role") or ROLE_USER).strip() or ROLE_USER
                if email == SUPER_ADMIN_EMAIL:
                    role = ROLE_SUPER_ADMIN
                elif email in (DEFAULT_ADMIN_EMAIL, DEFAULT_USER_EMAIL, LEGACY_SUPER_ADMIN_EMAIL):
                    role = ROLE_USER
                if email and password:
                    _ensure_user(db, email, password, role=role)
    else:
        _ensure_user(db, DEFAULT_USER_EMAIL, DEFAULT_USER_PASSWORD, role=ROLE_USER)
        _ensure_user(db, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, role=ROLE_USER)

    _ensure_user(db, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, role=ROLE_USER)
    _ensure_user(db, DEFAULT_USER_EMAIL, DEFAULT_USER_PASSWORD, role=ROLE_USER)
    legacy = db.scalar(select(User).where(User.email == LEGACY_SUPER_ADMIN_EMAIL))
    if legacy:
        legacy.role = ROLE_USER
    # Initial password only (used when the account is first created).
    _ensure_user(
        db,
        SUPER_ADMIN_EMAIL,
        settings.SUPER_ADMIN_INITIAL_PASSWORD or SUPER_ADMIN_PASSWORD,
        role=ROLE_SUPER_ADMIN,
    )
    db.commit()


def get_admin_user_id(db: Session) -> str | None:
    """Primary seed account used to own legacy (pre-tenant) rows."""
    admin = db.scalar(select(User).where(User.email == DEFAULT_ADMIN_EMAIL))
    if admin:
        return admin.id
    any_user = db.scalar(select(User).order_by(User.created_at.asc()))
    return any_user.id if any_user else None
