from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.email.models.db_models import EmailSendHistory
from app.modules.email.models.response_models import EmailHistoryListResponse, EmailHistoryResponse


def list_email_history(
    db: Session,
    *,
    row_id: str | None = None,
    to_email: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> EmailHistoryListResponse:
    query = select(EmailSendHistory)
    count_query = select(func.count()).select_from(EmailSendHistory)

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
