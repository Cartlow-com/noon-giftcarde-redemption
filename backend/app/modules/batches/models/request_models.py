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

    status: str | None = Field(default=None, description="Override auto-computed overall status")
