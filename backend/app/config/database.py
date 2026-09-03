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
    if "batch_rows" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("batch_rows")}
    alters = {
        "screenshot_before_redeem": "ALTER TABLE batch_rows ADD COLUMN screenshot_before_redeem TEXT",
        "screenshot_after_redeem": "ALTER TABLE batch_rows ADD COLUMN screenshot_after_redeem TEXT",
        "screenshot_after_order": "ALTER TABLE batch_rows ADD COLUMN screenshot_after_order TEXT",
        "run_started_at": "ALTER TABLE batch_rows ADD COLUMN run_started_at DATETIME",
        "run_finished_at": "ALTER TABLE batch_rows ADD COLUMN run_finished_at DATETIME",
        "duration_ms": "ALTER TABLE batch_rows ADD COLUMN duration_ms INTEGER",
    }
    with engine.begin() as conn:
        for name, sql in alters.items():
            if name not in existing:
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
