from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch
from app.modules.batches.models.response_models import BatchListResponse, BatchSummaryResponse
from app.modules.login.models.db_models import User


def _summaries(db: Session, batches: list[Batch]) -> list[BatchSummaryResponse]:
    owner_ids = {b.user_id for b in batches if b.user_id}
    emails: dict[str, str] = {}
    if owner_ids:
        users = db.scalars(select(User).where(User.id.in_(owner_ids))).all()
        emails = {u.id: u.email for u in users}
    out: list[BatchSummaryResponse] = []
    for batch in batches:
        base = BatchSummaryResponse.model_validate(batch)
        out.append(
            base.model_copy(
                update={
                    "user_id": batch.user_id or None,
                    "owner_email": emails.get(batch.user_id),
                }
            )
        )
    return out


def list_batches(
    db: Session,
    user_id: str | None,
    limit: int = 50,
    offset: int = 0,
    *,
    list_all: bool = False,
) -> BatchListResponse:
    filters = []
    if list_all:
        if user_id:
            filters.append(Batch.user_id == user_id)
    else:
        if not user_id:
            raise ValueError("Batch not found")
        filters.append(Batch.user_id == user_id)

    count_q = select(func.count()).select_from(Batch)
    list_q = select(Batch).order_by(desc(Batch.created_at))
    if filters:
        count_q = count_q.where(*filters)
        list_q = list_q.where(*filters)

    total = db.scalar(count_q) or 0
    batches = list(db.scalars(list_q.limit(limit).offset(offset)).all())
    return BatchListResponse(batches=_summaries(db, batches), total=total)
