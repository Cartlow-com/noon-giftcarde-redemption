from app.modules.gmail.services.get_otp_link import (
    _pick_newest_eligible,
    extract_otp_code,
)


def test_extract_otp_from_inline_email_body() -> None:
    assert extract_otp_code(
        "Account verification Your one time password (OTP) is 845989 Please note"
    ) == "845989"


def test_extract_otp_from_email_subject() -> None:
    assert extract_otp_code("845989 is the OTP for your noon account verification") == "845989"


def test_extract_otp_code_from_noon_copy_page_text() -> None:
    assert extract_otp_code("Use this OTP to login to your noon account\n5 7 8 4 8 5 Copy") == "578485"


def test_click_here_email_has_no_inline_otp() -> None:
    assert (
        extract_otp_code(
            "Account verification To view your one time password (OTP) Click Here. "
            "Please note this is a temporary password"
        )
        is None
    )


def test_pick_newest_eligible_prefers_fresh_inline_otp() -> None:
    assert _pick_newest_eligible(
        [(1_000_000, "111111", ""), (2_000_000, "222222", "")],
        after_ms=1_500_000,
    ) == ("222222", "")
    assert _pick_newest_eligible(
        [(1_000_000, "", "https://old"), (2_000_000, "", "https://new")],
        after_ms=1_500_000,
    ) == ("", "https://new")
    assert _pick_newest_eligible([(1_000_000, "111111", "")], after_ms=1_500_000) is None
