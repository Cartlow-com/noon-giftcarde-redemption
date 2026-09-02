from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.batches.helpers.status import compute_batch_status
from app.modules.batches.models.db_models import (
    ROW_COMPLETED,
    ROW_FAILED,
    ROW_IN_PROGRESS,
    ROW_PARTIAL,
    ROW_PENDING,
    Batch,
    BatchRow,
)


def refresh_batch_counts(db: Session, batch_id: str) -> Batch:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise ValueError("Batch not found")

    counts = db.execute(
        select(BatchRow.status, func.count())
        .where(BatchRow.batch_id == batch_id)
        .group_by(BatchRow.status)
    ).all()
    tally = {status: count for status, count in counts}

    batch.pending_count = tally.get(ROW_PENDING, 0)
    batch.in_progress_count = tally.get(ROW_IN_PROGRESS, 0)
    batch.completed_count = tally.get(ROW_COMPLETED, 0)
    batch.partial_count = tally.get(ROW_PARTIAL, 0)
    batch.failed_count = tally.get(ROW_FAILED, 0)
    batch.total_rows = sum(tally.values())
    batch.status = compute_batch_status(
        batch.total_rows,
        batch.pending_count,
        batch.in_progress_count,
        batch.completed_count,
        batch.partial_count,
        batch.failed_count,
    )
    db.commit()
    db.refresh(batch)
    return batch
