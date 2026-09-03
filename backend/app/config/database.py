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
        }
        with engine.begin() as conn:
            for name, sql in alters.items():
                if name not in existing:
                    conn.execute(text(sql))

    if "batch_runs" in tables:
        run_cols = {col["name"] for col in inspector.get_columns("batch_runs")}
        run_alters = {
            "hide_window": "ALTER TABLE batch_runs ADD COLUMN hide_window INTEGER DEFAULT 0",
            "login_only": "ALTER TABLE batch_runs ADD COLUMN login_only INTEGER DEFAULT 0",
        }
        with engine.begin() as conn:
            for name, sql in run_alters.items():
                if name not in run_cols:
                    conn.execute(text(sql))


def init_db() -> None:
    from app.modules.batches.models import db_models as batches_db_models  # noqa: F401
    from app.modules.email.models import db_models as email_db_models  # noqa: F401
    from app.modules.login.models import db_models as login_db_models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
