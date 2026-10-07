from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# Status/stage values are short snake_case words (pending, in_progress, success, …).
# Anything else (e.g. HTML) is rejected — it is rendered in the dashboard.
_STATUS_PATTERN = r"^[a-z][a-z_]{0,31}$"
_STATUS_FIELDS = ("status", "login_status", "redeem_status", "purchase_status", "outcome")


def _check_status(value):
    import re

    if value is not None and not re.match(_STATUS_PATTERN, str(value)):
        raise ValueError("must be a lowercase snake_case status")
    return value


class _StatusFieldsMixin:
    @field_validator(*_STATUS_FIELDS, mode="after", check_fields=False)
    @classmethod
    def _valid_status(cls, value):
        return _check_status(value)


class UpdateRowRequest(_StatusFieldsMixin, BaseModel):
    email: str | None = None
    password: str | None = None
    gift_card_number: str | None = None
    gift_card_pin: str | None = None
    product_url: str | None = None
    quantity: int | None = Field(default=None, ge=1)
    face_value: float | None = None
    coupon_code: str | None = None

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
    cart_test: bool = False


class UpdateRunRequest(_StatusFieldsMixin, BaseModel):
    status: str | None = None
    message: str | None = None


class CreateRowAttemptRequest(_StatusFieldsMixin, BaseModel):
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


class UpdateRowAttemptRequest(_StatusFieldsMixin, BaseModel):
    outcome: str | None = None
    message: str | None = None
    login_status: str | None = None
    redeem_status: str | None = None
    purchase_status: str | None = None
    status: str | None = None
    login_error: str | None = None
    redeem_error: str | None = None
    purchase_error: str | None = None
    order_id: str | None = None
    duration_ms: int | None = None
