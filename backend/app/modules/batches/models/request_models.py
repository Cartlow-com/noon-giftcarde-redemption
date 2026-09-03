from datetime import datetime

from pydantic import BaseModel, Field


class UpdateRowRequest(BaseModel):
    login_status: str | None = None
    login_at: datetime | None = None
    login_error: str | None = None

    redeem_status: str | None = None
    redeemed_at: datetime | None = None
    redeem_error: str | None = None
    balance_before: float | None = None
    balance_after: float | None = None
    balance_delta: float | None = None

    purchase_status: str | None = None
    purchased_at: datetime | None = None
    purchase_error: str | None = None
    order_id: str | None = None

    screenshot_before_redeem: str | None = None
    screenshot_after_redeem: str | None = None
    screenshot_after_order: str | None = None
    screenshot_on_failure: str | None = None

    run_started_at: datetime | None = None
    run_finished_at: datetime | None = None
    duration_ms: int | None = None

    status: str | None = Field(default=None, description="Override auto-computed overall status")


class CreateRunRequest(BaseModel):
    batch_id: str
    row_ids: list[str] = Field(min_length=1)
    place_order: bool = False
    send_redeem_emails: bool = False
    send_order_emails: bool = False
    hide_window: bool = False
    login_only: bool = False


class UpdateRunRequest(BaseModel):
    status: str | None = None
    message: str | None = None


class CreateRowAttemptRequest(BaseModel):
    batch_run_id: str | None = None
    outcome: str = "unknown"
    message: str | None = None
    login_status: str = "pending"
    redeem_status: str = "pending"
    purchase_status: str = "pending"
    status: str = "pending"
    login_error: str | None = None
    redeem_error: str | None = None
    purchase_error: str | None = None
    order_id: str | None = None
    duration_ms: int | None = None
