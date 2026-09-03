from pathlib import Path

from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.batches.models.db_models import BatchRow
from app.modules.batches.services.save_screenshot import SCREENSHOT_KINDS


def resolve_row_screenshot_path(row_id: str, kind: str, db: Session) -> Path:
    if kind not in SCREENSHOT_KINDS:
        raise ValueError(f"Invalid screenshot kind: {kind}")

    row = db.get(BatchRow, row_id)
    if not row:
        raise ValueError("Row not found")

    column = SCREENSHOT_KINDS[kind]
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
