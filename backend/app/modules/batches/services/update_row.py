from pathlib import Path

from sqlalchemy.orm import Session

from app.config.settings import settings

from app.modules.batches.helpers.batch_stats import refresh_batch_counts
from app.modules.batches.helpers.ownership import get_owned_row
from app.modules.batches.helpers.status import compute_row_status
from app.modules.batches.models.db_models import STAGE_ALREADY_REDEEMED, STAGE_SUCCESS
from app.modules.batches.models.request_models import UpdateRowRequest
from app.modules.batches.models.response_models import BatchRowResponse

STAGE_FIELDS = frozenset({"login_status", "redeem_status", "purchase_status"})
SCREENSHOT_FIELDS = (
    "screenshot_before_redeem",
    "screenshot_after_redeem",
    "screenshot_after_order",
    "screenshot_on_failure",
)


def _drop_foreign_screenshot_paths(row, data: dict) -> None:
    """Screenshots are set by the upload endpoint. A PATCH may only point at this
    row's own folder — never another batch's/tenant's file (served + emailed)."""
    own = (Path(settings.SCREENSHOT_STORAGE_DIR) / row.batch_id / str(row.row_number)).resolve()
    for field in SCREENSHOT_FIELDS:
        if field not in data or data[field] is None:
            continue
        try:
            Path(str(data[field])).resolve().relative_to(own)
        except ValueError:
            data.pop(field)
VALUE_TOLERANCE = 0.011


def _reconcile_face_value(row) -> None:
    if row.face_value is None or row.balance_delta is None:
        return
    if row.redeem_status not in (STAGE_SUCCESS, STAGE_ALREADY_REDEEMED):
        return
    matched = abs(float(row.balance_delta) - float(row.face_value)) <= VALUE_TOLERANCE
    row.value_match = 1 if matched else 0
    if matched:
        return
    note = (
        f"Value mismatch: face_value={row.face_value}, balance_delta={row.balance_delta}"
    )
    if row.redeem_error:
        if "Value mismatch" not in row.redeem_error:
            row.redeem_error = f"{row.redeem_error}; {note}"
    else:
        row.redeem_error = note


def update_batch_row(
    row_id: str,
    payload: UpdateRowRequest,
    db: Session,
    user_id: str | None = None,
) -> BatchRowResponse:
    row = get_owned_row(db, row_id, user_id)

    data = payload.model_dump(exclude_unset=True)
    _drop_foreign_screenshot_paths(row, data)
    explicit_status = data.pop("status", None)
    touches_stages = bool(STAGE_FIELDS & data.keys())

    if "email" in data and data["email"] is not None:
        data["email"] = str(data["email"]).strip()
        if not data["email"]:
            raise ValueError("email is required")
    if "password" in data:
        password = data["password"]
        if password is None or str(password).strip() == "":
            data.pop("password")
        else:
            data["password"] = str(password)
    if "gift_card_pin" in data:
        pin = data["gift_card_pin"]
        if pin is None or str(pin).strip() == "":
            data.pop("gift_card_pin")
        else:
            data["gift_card_pin"] = str(pin).strip()
    if "gift_card_number" in data and data["gift_card_number"] is not None:
        data["gift_card_number"] = str(data["gift_card_number"]).strip()
        if not data["gift_card_number"]:
            raise ValueError("gift_card_number is required")
    if "product_url" in data and data["product_url"] is not None:
        data["product_url"] = str(data["product_url"]).strip()
        if not data["product_url"]:
            raise ValueError("product_url is required")
    if "quantity" in data and data["quantity"] is not None and int(data["quantity"]) < 1:
        raise ValueError("quantity must be >= 1")
    if "coupon_code" in data:
        coupon = data["coupon_code"]
        if coupon is None or str(coupon).strip() == "":
            data["coupon_code"] = None
        else:
            data["coupon_code"] = str(coupon).strip()

    for field, value in data.items():
        setattr(row, field, value)

    if explicit_status is not None:
        row.status = explicit_status
    elif touches_stages:
        row.status = compute_row_status(
            row.login_status,
            row.redeem_status,
            row.purchase_status,
            current=row.status,
        )

    _reconcile_face_value(row)

    db.commit()
    db.refresh(row)
    refresh_batch_counts(db, row.batch_id)
    return BatchRowResponse.model_validate(row)
