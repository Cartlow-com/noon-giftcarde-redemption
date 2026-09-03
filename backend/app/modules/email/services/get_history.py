from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.batches.models.db_models import Batch, BatchRow
from app.modules.email.models.db_models import EmailSendHistory
from app.modules.email.models.response_models import EmailHistoryListResponse, EmailHistoryResponse


def list_email_history(
    db: Session,
    *,
    user_id: str | None = None,
    row_id: str | None = None,
    to_email: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> EmailHistoryListResponse:
    query = select(EmailSendHistory)
    count_query = select(func.count()).select_from(EmailSendHistory)

    if user_id:
        owned_batch_ids = select(Batch.id).where(Batch.user_id == user_id)
        owned_row_ids = (
            select(BatchRow.id).join(Batch, Batch.id == BatchRow.batch_id).where(Batch.user_id == user_id)
        )
        owner_filter = (
            EmailSendHistory.related_batch_id.in_(owned_batch_ids)
            | EmailSendHistory.related_row_id.in_(owned_row_ids)
        )
        query = query.where(owner_filter)
        count_query = count_query.where(owner_filter)

    if row_id:
        query = query.where(EmailSendHistory.related_row_id == row_id)
        count_query = count_query.where(EmailSendHistory.related_row_id == row_id)
    if to_email:
        query = query.where(EmailSendHistory.to_email == to_email)
        count_query = count_query.where(EmailSendHistory.to_email == to_email)

    total = db.scalar(count_query) or 0
    rows = db.scalars(
        query.order_by(EmailSendHistory.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return EmailHistoryListResponse(
        items=[EmailHistoryResponse.model_validate(row) for row in rows],
        total=total,
    )
