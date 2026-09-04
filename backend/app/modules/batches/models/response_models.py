from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BatchRowResponse(BaseModel):
    """Public row shape — never includes password / gift_card_pin."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    batch_id: str
    row_number: int
    email: str
    gift_card_number: str
    product_url: str
    quantity: int
    face_value: float | None = None
    login_status: str
    login_at: datetime | None
    login_error: str | None
    redeem_status: str
    redeemed_at: datetime | None
    redeem_error: str | None
    balance_before: float | None
    balance_after: float | None
    balance_delta: float | None
    value_match: bool | None = None
    purchase_status: str
    purchased_at: datetime | None
    purchase_error: str | None
    order_id: str | None
    screenshot_before_redeem: str | None = None
    screenshot_after_redeem: str | None = None
    screenshot_after_order: str | None = None
    screenshot_on_failure: str | None = None
    run_started_at: datetime | None = None
    run_finished_at: datetime | None = None
    duration_ms: int | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    @field_validator("value_match", mode="before")
    @classmethod
    def _coerce_value_match(cls, value: object) -> bool | None:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        return bool(int(value))


class BatchRowWorkResponse(BatchRowResponse):
    """Row payload for automation (get row / pull-next) — includes credentials."""

    password: str
    gift_card_pin: str


class BatchSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    total_rows: int
    pending_count: int
    in_progress_count: int
    completed_count: int
    partial_count: int
    failed_count: int
    status: str
    created_at: datetime
    updated_at: datetime


class BatchDetailResponse(BatchSummaryResponse):
    rows: list[BatchRowResponse] = []


class BatchListResponse(BaseModel):
    batches: list[BatchSummaryResponse]
    total: int


class BatchRowListResponse(BaseModel):
    rows: list[BatchRowResponse]
    total: int


class UploadBatchResponse(BaseModel):
    batch: BatchSummaryResponse
    message: str


class BatchRunResponse(BaseModel):
    id: str
    batch_id: str
    row_ids: list[str]
    place_order: bool
    send_redeem_emails: bool
    send_order_emails: bool
    hide_window: bool = False
    login_only: bool = False
    status: str
    message: str | None
    stop_requested: bool
    created_at: datetime
    updated_at: datetime


class AppConfigResponse(BaseModel):
    expected_row_seconds: int = Field(description="Expected seconds per row")
    auth_required: bool = False


class ExtensionStatusResponse(BaseModel):
    online: bool
    last_seen_at: datetime | None = None
    ttl_seconds: int


class RowAttemptResponse(BaseModel):
    id: str
    row_id: str
    batch_id: str
    batch_run_id: str | None = None
    attempt_number: int
    login_status: str
    redeem_status: str
    purchase_status: str
    status: str
    outcome: str
    message: str | None = None
    login_error: str | None = None
    redeem_error: str | None = None
    purchase_error: str | None = None
    order_id: str | None = None
    duration_ms: int | None = None
    screenshot_before_redeem: str | None = None
    screenshot_after_redeem: str | None = None
    screenshot_after_order: str | None = None
    screenshot_on_failure: str | None = None
    created_at: datetime


class RowAttemptListResponse(BaseModel):
    attempts: list[RowAttemptResponse]
    total: int
