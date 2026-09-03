from typing import Any

from pydantic import BaseModel, EmailStr, Field


class SendTemplatedEmailRequest(BaseModel):
    template_key: str
    to_email: EmailStr
    context: dict[str, Any] = Field(default_factory=dict)
    related_row_id: str | None = None
    related_batch_id: str | None = None
