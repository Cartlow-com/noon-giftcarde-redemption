from app.modules.gmail.services.get_otp_link import _pick_newest_eligible_link, extract_otp_code


def test_extract_otp_code_from_noon_copy_page_text() -> None:
    assert extract_otp_code("Use this OTP to login to your noon account\n5 7 8 4 8 5 Copy") == "578485"


def test_pick_newest_eligible_link_skips_old_otp_messages() -> None:
    assert _pick_newest_eligible_link(
        [(1_000_000, "old"), (2_000_000, "new")],
        after_ms=1_500_000,
    ) == "new"
    assert _pick_newest_eligible_link([(1_000_000, "old")], after_ms=1_500_000) is None
