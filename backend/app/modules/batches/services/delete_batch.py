from sqlalchemy.orm import Session

from app.modules.batches.helpers.ownership import get_owned_batch


def delete_batch(batch_id: str, db: Session, user_id: str | None = None) -> None:
    batch = get_owned_batch(db, batch_id, user_id)
    db.delete(batch)
    db.commit()
