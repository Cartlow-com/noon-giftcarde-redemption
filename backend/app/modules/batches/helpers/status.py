from app.modules.batches.models.db_models import (
    ROW_COMPLETED,
    ROW_FAILED,
    ROW_IN_PROGRESS,
    ROW_PARTIAL,
    ROW_PENDING,
    STAGE_ALREADY_REDEEMED,
    STAGE_FAILED,
    STAGE_RUNNING,
    STAGE_SKIPPED,
    STAGE_SUCCESS,
)


def compute_row_status(
    login_status: str,
    redeem_status: str,
    purchase_status: str,
    current: str = ROW_PENDING,
) -> str:
    stages = (login_status, redeem_status, purchase_status)

    if login_status == STAGE_FAILED:
        return ROW_FAILED

    if redeem_status == STAGE_ALREADY_REDEEMED:
        if purchase_status == STAGE_SUCCESS:
            return ROW_COMPLETED
        if purchase_status == STAGE_FAILED:
            return ROW_PARTIAL
        return ROW_IN_PROGRESS

    if redeem_status == STAGE_FAILED:
        if purchase_status == STAGE_SUCCESS:
            return ROW_PARTIAL
        return ROW_FAILED

    if purchase_status == STAGE_FAILED:
        return ROW_PARTIAL

    if purchase_status == STAGE_SKIPPED:
        if redeem_status in (STAGE_SUCCESS, STAGE_ALREADY_REDEEMED) and login_status == STAGE_SUCCESS:
            return ROW_PARTIAL
        return ROW_IN_PROGRESS

    if all(stage == STAGE_SUCCESS for stage in stages):
        return ROW_COMPLETED

    if any(stage == STAGE_RUNNING for stage in stages):
        return ROW_IN_PROGRESS

    if current == ROW_IN_PROGRESS:
        return ROW_IN_PROGRESS

    if login_status == STAGE_SUCCESS or redeem_status == STAGE_SUCCESS:
        return ROW_IN_PROGRESS

    return ROW_PENDING


def compute_batch_status(
    total_rows: int,
    pending: int,
    in_progress: int,
    completed: int,
    partial: int,
    failed: int,
) -> str:
    if total_rows == 0:
        return "empty"
    if in_progress > 0 or pending > 0:
        if completed > 0 or partial > 0 or failed > 0:
            return "processing"
        return "processing" if in_progress > 0 else "uploaded"
    if completed == total_rows:
        return "completed"
    if failed == total_rows:
        return "failed"
    return "completed_with_errors"
