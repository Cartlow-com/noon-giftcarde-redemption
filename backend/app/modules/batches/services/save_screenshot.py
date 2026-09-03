from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.batches.helpers.ownership import get_owned_row
from app.modules.batches.models.response_models import BatchRowResponse

SCREENSHOT_KINDS = {
    "before_redeem": "screenshot_before_redeem",
    "after_redeem": "screenshot_after_redeem",
    "after_order": "screenshot_after_order",
    "on_failure": "screenshot_on_failure",
}


def save_row_screenshot(
    row_id: str,
    kind: str,
    file: UploadFile,
    db: Session,
    user_id: str | None = None,
) -> BatchRowResponse:
    if kind not in SCREENSHOT_KINDS:
        raise ValueError(f"Invalid screenshot kind: {kind}")

    row = get_owned_row(db, row_id, user_id)

    folder = Path(settings.SCREENSHOT_STORAGE_DIR) / row.batch_id / str(row.row_number)
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{kind}.png"
    content = file.file.read()
    if not content:
        raise ValueError("Empty screenshot upload")
    dest.write_bytes(content)

    path_str = str(dest)
    setattr(row, SCREENSHOT_KINDS[kind], path_str)
    db.commit()
    db.refresh(row)
    return BatchRowResponse.model_validate(row)
