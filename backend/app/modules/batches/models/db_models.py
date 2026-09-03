from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config.database import Base

STAGE_PENDING = "pending"
STAGE_RUNNING = "running"
STAGE_SUCCESS = "success"
STAGE_FAILED = "failed"
STAGE_SKIPPED = "skipped"
STAGE_ALREADY_REDEEMED = "already_redeemed"
STAGE_PAYMENT_ISSUE = "payment_issue"

ROW_PENDING = "pending"
ROW_IN_PROGRESS = "in_progress"
ROW_COMPLETED = "completed"
ROW_PARTIAL = "partial"
ROW_FAILED = "failed"


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True, default="")
    filename: Mapped[str] = mapped_column(String(255))
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    pending_count: Mapped[int] = mapped_column(Integer, default=0)
    in_progress_count: Mapped[int] = mapped_column(Integer, default=0)
    completed_count: Mapped[int] = mapped_column(Integer, default=0)
    partial_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="uploaded")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    rows: Mapped[list["BatchRow"]] = relationship(
        "BatchRow", back_populates="batch", cascade="all, delete-orphan"
    )


class BatchRow(Base):
    __tablename__ = "batch_rows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(36), ForeignKey("batches.id"), index=True)
    row_number: Mapped[int] = mapped_column(Integer)

    email: Mapped[str] = mapped_column(String(255))
    password: Mapped[str] = mapped_column(String(255))
    gift_card_number: Mapped[str] = mapped_column(String(64))
    gift_card_pin: Mapped[str] = mapped_column(String(16))
    product_url: Mapped[str] = mapped_column(Text)
    quantity: Mapped[int] = mapped_column(Integer, default=1)

    login_status: Mapped[str] = mapped_column(String(16), default=STAGE_PENDING)
    login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    login_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    redeem_status: Mapped[str] = mapped_column(String(16), default=STAGE_PENDING)
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    redeem_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    balance_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    balance_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    balance_delta: Mapped[float | None] = mapped_column(Float, nullable=True)

    purchase_status: Mapped[str] = mapped_column(String(16), default=STAGE_PENDING)
    purchased_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    purchase_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    screenshot_before_redeem: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshot_after_redeem: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshot_after_order: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshot_on_failure: Mapped[str | None] = mapped_column(Text, nullable=True)

    run_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    run_finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[str] = mapped_column(String(16), default=ROW_PENDING, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    batch: Mapped["Batch"] = relationship("Batch", back_populates="rows")


class BatchRun(Base):
    __tablename__ = "batch_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True, default="")
    batch_id: Mapped[str] = mapped_column(String(36), ForeignKey("batches.id"), index=True)
    row_ids_json: Mapped[str] = mapped_column(Text)
    place_order: Mapped[int] = mapped_column(Integer, default=0)
    send_redeem_emails: Mapped[int] = mapped_column(Integer, default=0)
    send_order_emails: Mapped[int] = mapped_column(Integer, default=0)
    hide_window: Mapped[int] = mapped_column(Integer, default=0)
    login_only: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    stop_requested: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )


class ExtensionPresence(Base):
    __tablename__ = "extension_presence"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))


class BatchRowAttempt(Base):
    """Immutable snapshot of a row after each automation pass (1st run, 2nd run, …)."""

    __tablename__ = "batch_row_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    row_id: Mapped[str] = mapped_column(String(36), ForeignKey("batch_rows.id"), index=True)
    batch_id: Mapped[str] = mapped_column(String(36), ForeignKey("batches.id"), index=True)
    batch_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    attempt_number: Mapped[int] = mapped_column(Integer)

    login_status: Mapped[str] = mapped_column(String(32), default=STAGE_PENDING)
    redeem_status: Mapped[str] = mapped_column(String(32), default=STAGE_PENDING)
    purchase_status: Mapped[str] = mapped_column(String(32), default=STAGE_PENDING)
    status: Mapped[str] = mapped_column(String(32), default=ROW_PENDING)
    outcome: Mapped[str] = mapped_column(String(64), default="unknown")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    login_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    redeem_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    purchase_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

