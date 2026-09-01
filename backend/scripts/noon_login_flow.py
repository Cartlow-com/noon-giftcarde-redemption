#!/usr/bin/env python3
"""Noon.com login automation — slow step-by-step, password only."""

from __future__ import annotations

import argparse
import getpass
import os
import sys

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeout, sync_playwright

NOON_HOME = "https://www.noon.com/uae-en/"
NETWORK_ERROR = "Looks like you're offline"
WAIT = 1_500  # ms pause between steps


def pause(page: Page, seconds: float = 1.5) -> None:
    page.wait_for_timeout(int(seconds * 1000))


def wait_for_page_ready(page: Page) -> None:
    page.wait_for_load_state("load", timeout=60_000)
    try:
        page.wait_for_load_state("networkidle", timeout=15_000)
    except PlaywrightTimeout:
        pass  # noon keeps background requests; load event is enough

    page.get_by_role("button", name="Log in").first.wait_for(state="visible", timeout=20_000)
    pause(page, 2)
    print("✓ Page fully loaded")


def load_noon_home(page: Page) -> None:
    print(f"→ Opening {NOON_HOME}")
    page.goto(NOON_HOME, wait_until="load", timeout=60_000)
    wait_for_page_ready(page)


def accept_cookies(page: Page) -> None:
    btn = page.get_by_role("button", name="Accept All")
    if btn.is_visible(timeout=3_000):
        btn.click()
        print("✓ Cookies accepted")
        pause(page)


def click_login(page: Page) -> None:
    for locator in (
        page.get_by_role("banner").get_by_role("button", name="Log in"),
        page.get_by_role("button", name="Log in").first,
        page.get_by_role("button", name="account"),
    ):
        if locator.is_visible(timeout=2_000):
            locator.click()
            pause(page)
            print("✓ Clicked Log in")
            return
    raise RuntimeError("Log in button not found")


def hard_refresh(page: Page) -> None:
    try:
        page.reload(wait_until="load", timeout=30_000)
    except Exception:
        page.goto(NOON_HOME, wait_until="load", timeout=60_000)
    wait_for_page_ready(page)


def open_login_modal(page: Page) -> None:
    for attempt in range(2):
        click_login(page)
        pause(page, 2)

        if page.get_by_text(NETWORK_ERROR).is_visible(timeout=1_000):
            print("⚠ Network error — hard refresh")
            hard_refresh(page)
            accept_cookies(page)
            continue

        email_input = page.get_by_placeholder("Please enter email or mobile number")
        if email_input.is_visible(timeout=8_000):
            print("✓ Login modal open")
            return

        if attempt == 0:
            print("⚠ Modal not open — hard refresh and retry")
            hard_refresh(page)
            accept_cookies(page)

    raise RuntimeError("Login modal did not open after retry")


def enter_email_and_continue(page: Page, email: str) -> None:
    email_input = page.get_by_placeholder("Please enter email or mobile number")
    email_input.click()
    pause(page, 0.5)
    email_input.fill(email)
    print(f"✓ Email entered: {email}")
    pause(page)

    continue_btn = page.get_by_role("button", name="Continue")
    if continue_btn.is_disabled():
        pause(page, 2)
    continue_btn.click()
    print("✓ Clicked Continue")
    pause(page, 2)


def login_with_password(page: Page, password: str) -> None:
    page.get_by_role("button", name="Log in with password").click()
    print("✓ Switched to password tab")
    pause(page)

    password_input = page.get_by_role("textbox", name="Password")
    password_input.click()
    pause(page, 0.5)
    password_input.fill(password)
    print("✓ Password entered")
    pause(page)

    login_btn = page.get_by_role("button", name="Log in", exact=True)
    if login_btn.is_disabled():
        pause(page, 1)
    login_btn.click()
    print("✓ Clicked Log in")

    page.get_by_text("Hi,").wait_for(state="visible", timeout=30_000)
    print("✓ Logged in successfully")


def run(email: str, password: str, *, headless: bool) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            slow_mo=300,
            args=["--disable-http2"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        try:
            load_noon_home(page)
            accept_cookies(page)
            open_login_modal(page)
            enter_email_and_continue(page, email)
            login_with_password(page, password)

            print("\n✅ Login complete")
            if sys.stdin.isatty():
                input("\nPress Enter to close browser...")
        except (PlaywrightTimeout, RuntimeError) as exc:
            print(f"\n❌ Failed: {exc}", file=sys.stderr)
            if sys.stdin.isatty():
                input("\nPress Enter to close browser...")
            raise SystemExit(1) from exc
        finally:
            browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Noon login automation")
    parser.add_argument(
        "--email",
        default=os.environ.get("NOON_EMAIL", "msajjadawan@hotmail.com"),
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("NOON_PASSWORD"),
    )
    parser.add_argument("--headless", action="store_true")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Noon password: ")
    run(args.email, password, headless=args.headless)


if __name__ == "__main__":
    main()
