from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.config.database import Base

ROLE_USER = "user"
ROLE_SUPER_ADMIN = "super_admin"
VALID_ROLES = frozenset({ROLE_USER, ROLE_SUPER_ADMIN})


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default=ROLE_USER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Bumped on each login — JWTs with an older version are rejected.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
