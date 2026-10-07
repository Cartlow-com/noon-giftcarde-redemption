from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch, BatchRow, BatchRowAttempt, BatchRun
from app.modules.login.models.db_models import ROLE_SUPER_ADMIN, User


def is_super_admin(db: Session, user_id: str | None) -> bool:
    if not user_id:
        return False
    user = db.get(User, user_id)
    return bool(user and user.role == ROLE_SUPER_ADMIN)


def _require_scope(user_id: str | None) -> str:
    """Ownership is default-closed: missing scope denies (same as not found)."""
    if not user_id:
        raise ValueError("Batch not found")
    return user_id


def get_owned_batch(db: Session, batch_id: str, user_id: str | None) -> Batch:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise ValueError("Batch not found")
    if is_super_admin(db, user_id):
        return batch
    scope = _require_scope(user_id)
    if batch.user_id != scope:
        raise ValueError("Batch not found")
    return batch


def get_owned_row(db: Session, row_id: str, user_id: str | None) -> BatchRow:
    row = db.get(BatchRow, row_id)
    if not row:
        raise ValueError("Row not found")
    batch = db.get(Batch, row.batch_id)
    if not batch:
        raise ValueError("Row not found")
    if is_super_admin(db, user_id):
        return row
    scope = _require_scope(user_id)
    if batch.user_id != scope:
        raise ValueError("Row not found")
    return row


def get_owned_run(db: Session, run_id: str, user_id: str | None) -> BatchRun:
    run = db.get(BatchRun, run_id)
    if not run:
        raise ValueError("Run not found")
    if is_super_admin(db, user_id):
        return run
    scope = _require_scope(user_id)
    if run.user_id != scope:
        raise ValueError("Run not found")
    return run


def get_owned_attempt(
    db: Session,
    attempt_id: str,
    user_id: str | None,
    row_id: str | None = None,
) -> BatchRowAttempt:
    """Attempt of a batch the caller owns (super_admin: any). Default-closed."""
    attempt = db.get(BatchRowAttempt, attempt_id)
    if not attempt or (row_id is not None and attempt.row_id != row_id):
        raise ValueError("Attempt not found")
    batch = db.get(Batch, attempt.batch_id)
    if not batch:
        raise ValueError("Attempt not found")
    if is_super_admin(db, user_id):
        return attempt
    scope = _require_scope(user_id)
    if batch.user_id != scope:
        raise ValueError("Attempt not found")
    return attempt
