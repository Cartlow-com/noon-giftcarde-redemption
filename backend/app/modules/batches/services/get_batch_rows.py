from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.batches.helpers.ownership import get_owned_batch
from app.modules.batches.models.db_models import BatchRow
from app.modules.batches.models.response_models import BatchRowListResponse, BatchRowResponse


def list_batch_rows(
    batch_id: str,
    db: Session,
    user_id: str | None = None,
    status: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> BatchRowListResponse:
    get_owned_batch(db, batch_id, user_id)

    query = select(BatchRow).where(BatchRow.batch_id == batch_id).order_by(BatchRow.row_number)
    if status:
        query = query.where(BatchRow.status == status)

    rows = db.scalars(query.limit(limit).offset(offset)).all()
    count_query = select(BatchRow.id).where(BatchRow.batch_id == batch_id)
    if status:
        count_query = count_query.where(BatchRow.status == status)
    total = len(db.scalars(count_query).all())

    return BatchRowListResponse(
        rows=[BatchRowResponse.model_validate(row) for row in rows],
        total=total,
    )
