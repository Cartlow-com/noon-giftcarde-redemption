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


def test_click_here_email_has_no_inline_otp() -> None:
    assert (
        extract_otp_code(
            "Account verification To view your one time password (OTP) Click Here. "
            "Please note this is a temporary password"
        )
        is None
    )


def test_click_here_html_does_not_invent_otp_from_years_or_sizes() -> None:
    """Regression: loose digit scrape returned junk like 202320 and skipped the link."""
    html = """
    <!DOCTYPE html><html><body>
    <p>Account verification</p>
    <p>To view your one time password (OTP)
      <a href="https://account.noon.com/_svc/mp-identity-api/auth/get-otp?token=abc">Click Here</a>.
    </p>
    <img width="101" height="010" src="x.jpg"/>
    <p>Copyright 2023-2024 noon</p>
    </body></html>
    """
    assert extract_otp_code(html) is None


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


def test_tight_grace_rejects_previous_attempts_otp() -> None:
    """Extension sends grace_ms≈5000 (Continue-click time): an OTP from 20s before is stale."""
    after = 1_000_000
    items = [(after - 20_000, "111111", ""), (after + 2_000, "222222", "")]
    assert _pick_newest_eligible(items, after_ms=after, grace_ms=5_000) == ("222222", "")
    only_old = [(after - 20_000, "111111", "")]
    assert _pick_newest_eligible(only_old, after_ms=after, grace_ms=5_000) is None
    # default (30s) behaviour unchanged for other callers
    assert _pick_newest_eligible(only_old, after_ms=after) == ("111111", "")
