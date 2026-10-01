from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config.settings import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False}
    if settings.DATABASE_URL.startswith("sqlite")
    else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_columns() -> None:
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    if "batch_rows" in tables:
        existing = {col["name"] for col in inspector.get_columns("batch_rows")}
        alters = {
            "screenshot_before_redeem": "ALTER TABLE batch_rows ADD COLUMN screenshot_before_redeem TEXT",
            "screenshot_after_redeem": "ALTER TABLE batch_rows ADD COLUMN screenshot_after_redeem TEXT",
            "screenshot_after_order": "ALTER TABLE batch_rows ADD COLUMN screenshot_after_order TEXT",
            "run_started_at": "ALTER TABLE batch_rows ADD COLUMN run_started_at DATETIME",
            "run_finished_at": "ALTER TABLE batch_rows ADD COLUMN run_finished_at DATETIME",
            "duration_ms": "ALTER TABLE batch_rows ADD COLUMN duration_ms INTEGER",
            "screenshot_on_failure": "ALTER TABLE batch_rows ADD COLUMN screenshot_on_failure TEXT",
            "face_value": "ALTER TABLE batch_rows ADD COLUMN face_value FLOAT",
            "value_match": "ALTER TABLE batch_rows ADD COLUMN value_match INTEGER",
        }
        with engine.begin() as conn:
            for name, sql in alters.items():
                if name not in existing:
                    conn.execute(text(sql))

    if "batches" in tables:
        batch_cols = {col["name"] for col in inspector.get_columns("batches")}
        if "user_id" not in batch_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE batches ADD COLUMN user_id VARCHAR(36) DEFAULT ''"))

    if "batch_runs" in tables:
        run_cols = {col["name"] for col in inspector.get_columns("batch_runs")}
        run_alters = {
            "hide_window": "ALTER TABLE batch_runs ADD COLUMN hide_window INTEGER DEFAULT 0",
            "login_only": "ALTER TABLE batch_runs ADD COLUMN login_only INTEGER DEFAULT 0",
            "user_id": "ALTER TABLE batch_runs ADD COLUMN user_id VARCHAR(36) DEFAULT ''",
        }
        with engine.begin() as conn:
            for name, sql in run_alters.items():
                if name not in run_cols:
                    conn.execute(text(sql))

    if "batch_row_attempts" in tables:
        attempt_cols = {col["name"] for col in inspector.get_columns("batch_row_attempts")}
        attempt_alters = {
            "screenshot_before_redeem": "ALTER TABLE batch_row_attempts ADD COLUMN screenshot_before_redeem TEXT",
            "screenshot_after_redeem": "ALTER TABLE batch_row_attempts ADD COLUMN screenshot_after_redeem TEXT",
            "screenshot_after_order": "ALTER TABLE batch_row_attempts ADD COLUMN screenshot_after_order TEXT",
            "screenshot_on_failure": "ALTER TABLE batch_row_attempts ADD COLUMN screenshot_on_failure TEXT",
        }
        with engine.begin() as conn:
            for name, sql in attempt_alters.items():
                if name not in attempt_cols:
                    conn.execute(text(sql))

    if "users" in tables:
        user_cols = {col["name"] for col in inspector.get_columns("users")}
        if "role" not in user_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(32) DEFAULT 'user'"))
                conn.execute(text("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''"))
        if "token_version" not in user_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0"))
                conn.execute(
                    text("UPDATE users SET token_version = 0 WHERE token_version IS NULL")
                )

    if "gmail_tokens" in tables:
        gmail_cols = {col["name"] for col in inspector.get_columns("gmail_tokens")}
        gmail_alters = {
            "gmail_email": "ALTER TABLE gmail_tokens ADD COLUMN gmail_email VARCHAR(255) DEFAULT ''",
            "access_token": "ALTER TABLE gmail_tokens ADD COLUMN access_token TEXT DEFAULT ''",
            "refresh_token": "ALTER TABLE gmail_tokens ADD COLUMN refresh_token TEXT DEFAULT ''",
            "token_expiry": "ALTER TABLE gmail_tokens ADD COLUMN token_expiry DATETIME",
            "created_at": "ALTER TABLE gmail_tokens ADD COLUMN created_at DATETIME",
            "updated_at": "ALTER TABLE gmail_tokens ADD COLUMN updated_at DATETIME",
        }
        with engine.begin() as conn:
            for name, sql in gmail_alters.items():
                if name not in gmail_cols:
                    conn.execute(text(sql))


def _backfill_owner_user_ids() -> None:
    """Assign legacy rows with empty user_id to the seeded admin account."""
    from seeders.seed_users import get_admin_user_id

    db = SessionLocal()
    try:
        admin_id = get_admin_user_id(db)
        if not admin_id:
            return
        db.execute(
            text("UPDATE batches SET user_id = :uid WHERE user_id IS NULL OR user_id = ''"),
            {"uid": admin_id},
        )
        db.execute(
            text("UPDATE batch_runs SET user_id = :uid WHERE user_id IS NULL OR user_id = ''"),
            {"uid": admin_id},
        )
        db.commit()
    finally:
        db.close()


def init_db() -> None:
    from app.modules.batches.models import db_models as batches_db_models  # noqa: F401
    from app.modules.email.models import db_models as email_db_models  # noqa: F401
    from app.modules.gmail.models import db_models as gmail_db_models  # noqa: F401
    from app.modules.login.models import db_models as login_db_models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()


def backfill_tenancy_after_seed() -> None:
    _backfill_owner_user_ids()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
