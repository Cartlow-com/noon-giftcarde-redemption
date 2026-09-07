from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.modules.batches.helpers.batch_stats import refresh_batch_counts
from app.modules.batches.helpers.ownership import get_owned_row
from app.modules.batches.models.db_models import BatchRowAttempt


def delete_batch_row(row_id: str, db: Session, user_id: str | None = None) -> None:
    row = get_owned_row(db, row_id, user_id)
    batch_id = row.batch_id
    db.execute(delete(BatchRowAttempt).where(BatchRowAttempt.row_id == row_id))
    db.delete(row)
    db.commit()
    refresh_batch_counts(db, batch_id)
