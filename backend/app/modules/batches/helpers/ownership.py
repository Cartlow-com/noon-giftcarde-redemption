from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch, BatchRow, BatchRun


def _require_scope(user_id: str | None) -> str:
    """Ownership is default-closed: missing scope denies (same as not found)."""
    if not user_id:
        raise ValueError("Batch not found")
    return user_id


def get_owned_batch(db: Session, batch_id: str, user_id: str | None) -> Batch:
    scope = _require_scope(user_id)
    batch = db.get(Batch, batch_id)
    if not batch or batch.user_id != scope:
        raise ValueError("Batch not found")
    return batch


def get_owned_row(db: Session, row_id: str, user_id: str | None) -> BatchRow:
    scope = _require_scope(user_id)
    row = db.get(BatchRow, row_id)
    if not row:
        raise ValueError("Row not found")
    batch = db.get(Batch, row.batch_id)
    if not batch or batch.user_id != scope:
        raise ValueError("Row not found")
    return row


def get_owned_run(db: Session, run_id: str, user_id: str | None) -> BatchRun:
    scope = _require_scope(user_id)
    run = db.get(BatchRun, run_id)
    if not run or run.user_id != scope:
        raise ValueError("Run not found")
    return run
