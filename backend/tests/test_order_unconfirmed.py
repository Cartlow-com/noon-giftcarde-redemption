from app.modules.batches.helpers.status import compute_row_status
from app.modules.batches.models.request_models import UpdateRowRequest


def test_unconfirmed_order_marks_row_partial() -> None:
    assert compute_row_status("success", "success", "unconfirmed") == "partial"
    assert compute_row_status("success", "already_redeemed", "unconfirmed") == "partial"


def test_unconfirmed_is_an_accepted_stage_value() -> None:
    assert UpdateRowRequest(purchase_status="unconfirmed").purchase_status == "unconfirmed"
