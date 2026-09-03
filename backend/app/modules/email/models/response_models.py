from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EmailHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_key: str
    to_email: str
    from_email: str
    from_name: str
    subject: str
    body_text: str
    body_html: str | None
    status: str
    error: str | None
    attachment_paths: str | None
    context_json: str | None
    related_row_id: str | None
    related_batch_id: str | None
    created_at: datetime


class EmailHistoryListResponse(BaseModel):
    items: list[EmailHistoryResponse]
    total: int


class SendEmailResponse(BaseModel):
    history: EmailHistoryResponse
    message: str
