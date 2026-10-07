from pathlib import Path

from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.batches.helpers.ownership import get_owned_attempt, get_owned_row
from app.modules.batches.models.db_models import BatchRowAttempt
from app.modules.batches.services.save_screenshot import SCREENSHOT_KINDS


def _owned_attempt(db: Session, attempt_id: str, user_id: str | None, row_id: str) -> BatchRowAttempt:
    return get_owned_attempt(db, attempt_id, user_id, row_id=row_id)


def resolve_row_screenshot_path(
    row_id: str,
    kind: str,
    db: Session,
    user_id: str | None = None,
    attempt_id: str | None = None,
) -> Path:
    if kind not in SCREENSHOT_KINDS:
        raise ValueError(f"Invalid screenshot kind: {kind}")

    row = get_owned_row(db, row_id, user_id)
    column = SCREENSHOT_KINDS[kind]

    stored = None
    if attempt_id:
        attempt = _owned_attempt(db, attempt_id, user_id, row_id)
        stored = getattr(attempt, column, None)
    else:
        stored = getattr(row, column, None)

    if not stored:
        raise ValueError("Screenshot not found")

    path = Path(stored).resolve()
    root = Path(settings.SCREENSHOT_STORAGE_DIR).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError("Screenshot not found") from exc

    if not path.is_file():
        raise ValueError("Screenshot not found")

    return path
