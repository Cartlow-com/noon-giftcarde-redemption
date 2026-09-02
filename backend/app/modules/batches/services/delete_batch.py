from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch


def delete_batch(batch_id: str, db: Session) -> None:
    batch = db.get(Batch, batch_id)
    if not batch:
        raise ValueError("Batch not found")
    db.delete(batch)
    db.commit()
