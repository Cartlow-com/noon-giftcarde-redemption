from datetime import UTC, datetime
from pathlib import Path

from app.config.settings import settings

_HEARTBEAT_FILE = Path("storage/extension_heartbeat.txt")


def _path() -> Path:
    return Path(settings.SCREENSHOT_STORAGE_DIR).resolve().parent / "extension_heartbeat.txt"


def touch_extension_heartbeat() -> datetime:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(UTC)
    path.write_text(now.isoformat(), encoding="utf-8")
    return now


def get_extension_last_seen() -> datetime | None:
    path = _path()
    if not path.is_file():
        return None
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    try:
        value = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value


def is_extension_online(now: datetime | None = None) -> bool:
    last = get_extension_last_seen()
    if last is None:
        return False
    current = now or datetime.now(UTC)
    age = (current - last).total_seconds()
    return age <= settings.EXTENSION_HEARTBEAT_TTL_SECONDS
