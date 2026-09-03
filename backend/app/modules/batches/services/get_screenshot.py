from pathlib import Path

from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.batches.helpers.ownership import get_owned_row
from app.modules.batches.services.save_screenshot import SCREENSHOT_KINDS


def resolve_row_screenshot_path(
    row_id: str,
    kind: str,
    db: Session,
    user_id: str | None = None,
) -> Path:
    if kind not in SCREENSHOT_KINDS:
        raise ValueError(f"Invalid screenshot kind: {kind}")

    row = get_owned_row(db, row_id, user_id)

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
