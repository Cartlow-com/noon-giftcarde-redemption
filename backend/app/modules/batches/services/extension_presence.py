from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.batches.models.db_models import ExtensionPresence


def touch_extension_heartbeat(db: Session, user_id: str) -> datetime:
    now = datetime.now(UTC)
    row = db.get(ExtensionPresence, user_id)
    if row is None:
        row = ExtensionPresence(user_id=user_id, last_seen_at=now)
        db.add(row)
    else:
        row.last_seen_at = now
    db.commit()
    db.refresh(row)
    return row.last_seen_at


def clear_extension_heartbeat(db: Session, user_id: str | None = None) -> None:
    if user_id:
        row = db.get(ExtensionPresence, user_id)
        if row:
            db.delete(row)
            db.commit()
        return
    db.execute(delete(ExtensionPresence))
    db.commit()


def get_extension_last_seen(db: Session, user_id: str) -> datetime | None:
    row = db.get(ExtensionPresence, user_id)
    if row is None:
        return None
    value = row.last_seen_at
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value


def is_extension_online(db: Session, user_id: str, now: datetime | None = None) -> bool:
    last = get_extension_last_seen(db, user_id)
    if last is None:
        return False
    current = now or datetime.now(UTC)
    age = (current - last).total_seconds()
    return age <= settings.EXTENSION_HEARTBEAT_TTL_SECONDS
