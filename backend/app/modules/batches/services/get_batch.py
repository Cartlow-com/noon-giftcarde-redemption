from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch
from app.modules.batches.models.response_models import BatchDetailResponse, BatchRowResponse


def get_batch_detail(batch_id: str, db: Session, include_rows: bool = False) -> BatchDetailResponse:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise ValueError("Batch not found")

    detail = BatchDetailResponse.model_validate(batch)
    if include_rows:
        detail.rows = [BatchRowResponse.model_validate(row) for row in batch.rows]
    return detail
