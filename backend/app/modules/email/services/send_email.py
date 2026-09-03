import json
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.email.helpers.smtp_client import send_raw_email
from app.modules.email.helpers.templates import render_template
from app.modules.email.models.db_models import (
    EMAIL_STATUS_FAILED,
    EMAIL_STATUS_SENT,
    EmailSendHistory,
)
from app.modules.email.models.response_models import EmailHistoryResponse, SendEmailResponse


def send_templated_email(
    db: Session,
    *,
    template_key: str,
    to_email: str,
    context: dict[str, Any] | None = None,
    attachments: list[str | Path] | None = None,
    related_row_id: str | None = None,
    related_batch_id: str | None = None,
) -> SendEmailResponse:
    ctx = context or {}
    rendered = render_template(template_key, ctx)
    attachment_paths = [str(path) for path in (attachments or []) if path]

    history = EmailSendHistory(
        template_key=template_key,
        to_email=to_email,
        from_email=settings.FAILOVER_MAIL_FROM_ADDRESS,
        from_name=settings.FAILOVER_MAIL_FROM_NAME,
        subject=rendered.subject,
        body_text=rendered.body_text,
        body_html=rendered.body_html,
        attachment_paths=json.dumps(attachment_paths) if attachment_paths else None,
        context_json=json.dumps(ctx, default=str),
        related_row_id=related_row_id,
        related_batch_id=related_batch_id,
        status=EMAIL_STATUS_SENT,
        error=None,
    )

    try:
        send_raw_email(
            to_email=to_email,
            subject=rendered.subject,
            body_text=rendered.body_text,
            body_html=rendered.body_html,
            attachment_paths=attachment_paths,
        )
        history.status = EMAIL_STATUS_SENT
        message = "Email sent"
    except Exception as exc:  # noqa: BLE001 — record any SMTP/template failure
        history.status = EMAIL_STATUS_FAILED
        history.error = str(exc)
        message = f"Email failed: {exc}"

    db.add(history)
    db.commit()
    db.refresh(history)
    return SendEmailResponse(
        history=EmailHistoryResponse.model_validate(history),
        message=message,
    )
