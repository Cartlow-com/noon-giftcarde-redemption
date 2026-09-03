from pathlib import Path

from sqlalchemy.orm import Session

from app.config.settings import settings
from app.modules.batches.helpers.ownership import get_owned_row
from app.modules.batches.models.db_models import (
    STAGE_ALREADY_REDEEMED,
    STAGE_SUCCESS,
)
from app.modules.email.models.response_models import SendEmailResponse
from app.modules.email.services.send_email import send_templated_email


def _mask_card(value: str) -> str:
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if len(digits) <= 4:
        return digits or "****"
    return "****" + digits[-4:]


def _safe_screenshot_paths(*paths: str | None) -> list[str]:
    root = Path(settings.SCREENSHOT_STORAGE_DIR).resolve()
    result: list[str] = []
    for path in paths:
        if not path:
            continue
        candidate = Path(path).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            continue
        if candidate.is_file():
            result.append(str(candidate))
    return result


def notify_redeem_email(
    row_id: str,
    db: Session,
    user_id: str | None = None,
) -> SendEmailResponse:
    row = get_owned_row(db, row_id, user_id)
    if row.redeem_status not in (STAGE_SUCCESS, STAGE_ALREADY_REDEEMED):
        raise ValueError("Redeem email only allowed for success or already_redeemed")

    attachments = _safe_screenshot_paths(row.screenshot_before_redeem, row.screenshot_after_redeem)
    context = {
        "email": row.email,
        "row_number": row.row_number,
        "redeem_status": row.redeem_status,
        "redeemed_at": row.redeemed_at.isoformat() if row.redeemed_at else None,
        "balance_before": row.balance_before,
        "balance_after": row.balance_after,
        "balance_delta": row.balance_delta,
        "gift_card_masked": _mask_card(row.gift_card_number),
    }
    return send_templated_email(
        db,
        template_key="redeem_report",
        to_email=row.email,
        context=context,
        attachments=attachments,
        related_row_id=row.id,
        related_batch_id=row.batch_id,
    )


def notify_order_email(
    row_id: str,
    db: Session,
    user_id: str | None = None,
) -> SendEmailResponse:
    row = get_owned_row(db, row_id, user_id)
    if row.purchase_status != STAGE_SUCCESS:
        raise ValueError("Order email only allowed for purchase success")

    attachments = _safe_screenshot_paths(row.screenshot_after_order)
    context = {
        "email": row.email,
        "row_number": row.row_number,
        "order_id": row.order_id,
        "product_url": row.product_url,
        "purchased_at": row.purchased_at.isoformat() if row.purchased_at else None,
    }
    return send_templated_email(
        db,
        template_key="order_report",
        to_email=row.email,
        context=context,
        attachments=attachments,
        related_row_id=row.id,
        related_batch_id=row.batch_id,
    )
