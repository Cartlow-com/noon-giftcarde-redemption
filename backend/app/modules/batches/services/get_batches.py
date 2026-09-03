from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch
from app.modules.batches.models.response_models import BatchListResponse, BatchSummaryResponse


def list_batches(
    db: Session,
    user_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> BatchListResponse:
    filters = []
    if user_id:
        filters.append(Batch.user_id == user_id)

    count_q = select(func.count()).select_from(Batch)
    list_q = select(Batch).order_by(desc(Batch.created_at))
    if filters:
        count_q = count_q.where(*filters)
        list_q = list_q.where(*filters)

    total = db.scalar(count_q) or 0
    batches = db.scalars(list_q.limit(limit).offset(offset)).all()
    return BatchListResponse(
        batches=[BatchSummaryResponse.model_validate(batch) for batch in batches],
        total=total,
    )
