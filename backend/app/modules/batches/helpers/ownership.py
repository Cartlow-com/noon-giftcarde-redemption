from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch, BatchRow, BatchRun


def get_owned_batch(db: Session, batch_id: str, user_id: str | None) -> Batch:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise ValueError("Batch not found")
    if user_id and batch.user_id != user_id:
        raise ValueError("Batch not found")
    return batch


def get_owned_row(db: Session, row_id: str, user_id: str | None) -> BatchRow:
    row = db.get(BatchRow, row_id)
    if not row:
        raise ValueError("Row not found")
    batch = db.get(Batch, row.batch_id)
    if not batch:
        raise ValueError("Row not found")
    if user_id and batch.user_id != user_id:
        raise ValueError("Row not found")
    return row


def get_owned_run(db: Session, run_id: str, user_id: str | None) -> BatchRun:
    run = db.get(BatchRun, run_id)
    if not run:
        raise ValueError("Run not found")
    if user_id and run.user_id != user_id:
        raise ValueError("Run not found")
    return run
