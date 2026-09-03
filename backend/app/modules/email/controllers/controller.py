from sqlalchemy.orm import Session

from app.modules.email.models.request_models import SendTemplatedEmailRequest
from app.modules.email.models.response_models import EmailHistoryListResponse, SendEmailResponse
from app.modules.email.services.get_history import list_email_history
from app.modules.email.services.send_email import send_templated_email


def send_email(payload: SendTemplatedEmailRequest, db: Session) -> SendEmailResponse:
    return send_templated_email(
        db,
        template_key=payload.template_key,
        to_email=str(payload.to_email),
        context=payload.context,
        attachments=None,
        related_row_id=payload.related_row_id,
        related_batch_id=payload.related_batch_id,
    )


def get_history(
    db: Session,
    row_id: str | None,
    to_email: str | None,
    limit: int,
    offset: int,
) -> EmailHistoryListResponse:
    return list_email_history(
        db,
        row_id=row_id,
        to_email=to_email,
        limit=limit,
        offset=offset,
    )
