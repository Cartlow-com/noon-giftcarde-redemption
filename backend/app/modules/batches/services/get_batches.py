from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch
from app.modules.batches.models.response_models import BatchListResponse, BatchSummaryResponse


def list_batches(
    db: Session,
    user_id: str,
    limit: int = 50,
    offset: int = 0,
) -> BatchListResponse:
    if not user_id:
        raise ValueError("Batch not found")

    filters = [Batch.user_id == user_id]
    count_q = select(func.count()).select_from(Batch).where(*filters)
    list_q = select(Batch).where(*filters).order_by(desc(Batch.created_at))

    total = db.scalar(count_q) or 0
    batches = db.scalars(list_q.limit(limit).offset(offset)).all()
    return BatchListResponse(
        batches=[BatchSummaryResponse.model_validate(batch) for batch in batches],
        total=total,
    )
