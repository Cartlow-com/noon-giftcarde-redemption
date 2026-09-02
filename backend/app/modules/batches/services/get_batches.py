from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch
from app.modules.batches.models.response_models import BatchListResponse, BatchSummaryResponse


def list_batches(db: Session, limit: int = 50, offset: int = 0) -> BatchListResponse:
    total = db.scalar(select(func.count()).select_from(Batch)) or 0
    batches = db.scalars(
        select(Batch).order_by(desc(Batch.created_at)).limit(limit).offset(offset)
    ).all()
    return BatchListResponse(
        batches=[BatchSummaryResponse.model_validate(batch) for batch in batches],
        total=total,
    )
