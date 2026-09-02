from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BatchRowResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    batch_id: str
    row_number: int
    email: str
    password: str
    gift_card_number: str
    gift_card_pin: str
    product_url: str
    quantity: int
    login_status: str
    login_at: datetime | None
    login_error: str | None
    redeem_status: str
    redeemed_at: datetime | None
    redeem_error: str | None
    balance_before: float | None
    balance_after: float | None
    balance_delta: float | None
    purchase_status: str
    purchased_at: datetime | None
    purchase_error: str | None
    order_id: str | None
    status: str
    created_at: datetime
    updated_at: datetime


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
