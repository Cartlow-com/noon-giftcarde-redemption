from datetime import UTC, datetime
import uuid

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.config.database import Base

EMAIL_STATUS_SENT = "sent"
EMAIL_STATUS_FAILED = "failed"


def _uuid() -> str:
    return str(uuid.uuid4())


class EmailSendHistory(Base):
    __tablename__ = "email_send_histories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    template_key: Mapped[str] = mapped_column(String(64), index=True)
    to_email: Mapped[str] = mapped_column(String(255), index=True)
    from_email: Mapped[str] = mapped_column(String(255))
    from_name: Mapped[str] = mapped_column(String(255), default="")
    subject: Mapped[str] = mapped_column(String(512))
    body_text: Mapped[str] = mapped_column(Text, default="")
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=EMAIL_STATUS_SENT, index=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachment_paths: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    related_row_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    related_batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
