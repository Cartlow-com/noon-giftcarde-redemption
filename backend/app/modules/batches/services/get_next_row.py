from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.batches.helpers.batch_stats import refresh_batch_counts
from app.modules.batches.models.db_models import ROW_IN_PROGRESS, ROW_PENDING, Batch, BatchRow
from app.modules.batches.models.response_models import BatchRowResponse


def get_next_pending_row(batch_id: str | None, db: Session) -> BatchRowResponse:
    query = (
        select(BatchRow)
        .where(BatchRow.status.in_([ROW_PENDING, ROW_IN_PROGRESS]))
        .order_by(BatchRow.batch_id, BatchRow.row_number)
    )
    if batch_id:
        query = query.where(BatchRow.batch_id == batch_id)

    row = db.scalars(query.limit(1)).first()
    if not row:
        raise ValueError("No pending rows available")

    if row.status == ROW_PENDING:
        row.status = ROW_IN_PROGRESS
        db.commit()
        db.refresh(row)
        refresh_batch_counts(db, row.batch_id)

    return BatchRowResponse.model_validate(row)
