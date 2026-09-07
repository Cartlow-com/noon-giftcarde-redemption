from sqlalchemy.orm import Session

from app.modules.batches.helpers.ownership import get_owned_batch
from app.modules.batches.models.response_models import BatchDetailResponse, BatchRowResponse
from app.modules.login.models.db_models import User


def get_batch_detail(
    batch_id: str,
    db: Session,
    user_id: str | None = None,
    include_rows: bool = False,
) -> BatchDetailResponse:
    batch = get_owned_batch(db, batch_id, user_id)
    detail = BatchDetailResponse.model_validate(batch)
    owner_email = None
    if batch.user_id:
        owner = db.get(User, batch.user_id)
        owner_email = owner.email if owner else None
    detail = detail.model_copy(
        update={"user_id": batch.user_id or None, "owner_email": owner_email}
    )
    if include_rows:
        detail.rows = [BatchRowResponse.model_validate(row) for row in batch.rows]
    return detail
