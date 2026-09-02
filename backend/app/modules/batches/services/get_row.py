from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import BatchRow
from app.modules.batches.models.response_models import BatchRowResponse


def get_row(row_id: str, db: Session) -> BatchRowResponse:
    row = db.get(BatchRow, row_id)
    if not row:
        raise ValueError("Row not found")
    return BatchRowResponse.model_validate(row)
