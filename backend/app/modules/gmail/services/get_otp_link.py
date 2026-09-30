"""
Fetch the latest Noon OTP email via the Gmail API and return the OTP link URL.
No browser tab or UI interaction needed — purely API-based.
"""

import base64
import html
import re

import httpx
from sqlalchemy.orm import Session

from app.modules.gmail.models.db_models import GmailToken
from app.modules.gmail.services.get_gmail_email import _get_valid_access_token

GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

# Search for recent Noon OTP / verification emails (last 1 day)
NOON_OTP_QUERY = "from:noon.com newer_than:1d subject:(OTP OR verification OR login OR password)"

# Regex to find the OTP link in email body
# Matches href="..." or href='...' pointing to noon.com or mp-identity
_LINK_RE = re.compile(
    r'href=["\']?(https?://[^\s"\'<>]+(?:noon\.com|mp-identity)[^\s"\'<>]*)["\']?',
    re.IGNORECASE,
)

# OTP link keywords that indicate it is the "click here to get OTP" link
_OTP_LINK_KEYWORDS = re.compile(
    r"click.here|view.*otp|get.*otp|otp.*link|verify|verification",
    re.IGNORECASE,
)

_OTP_CODE_RE = re.compile(
    r"(?:otp|code|verification|login|account)[\s\S]{0,600}?((?:\d[^\dA-Za-z]*){6})",
    re.IGNORECASE,
)


def _decode_base64url(data: str) -> str:
    try:
        padded = data + "=" * (-len(data) % 4)
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_text_and_links(payload: dict, depth: int = 0) -> tuple[str, list[str]]:
    """Recursively extract all plain/html text and href links from a message payload."""
    if depth > 10:
        return "", []

    mime = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")
    text = ""
    links: list[str] = []

    if mime in ("text/plain", "text/html") and body_data:
        decoded = _decode_base64url(body_data)
        text = decoded
        links = [m.group(1) for m in _LINK_RE.finditer(decoded)]

    for part in payload.get("parts", []):
        sub_text, sub_links = _extract_text_and_links(part, depth + 1)
        if sub_text:
            text = text + "\n" + sub_text
        links.extend(sub_links)

    return text, links


def _pick_best_otp_link(links: list[str], body_text: str) -> str | None:
    """
    From a list of candidate hrefs, pick the one most likely to be the OTP link.
    Priority:
    1. Link whose surrounding anchor text matches OTP keywords
    2. Any noon.com / mp-identity link containing 'otp', 'verify', 'token' in the URL
    3. First noon.com link
    """
    noon_links = [
        l for l in links
        if re.search(r"noon\.com|mp-identity", l, re.IGNORECASE)
    ]

    # Check URL path for OTP signals
    for link in noon_links:
        if re.search(r"otp|verify|verif|token|one.time", link, re.IGNORECASE):
            return link

    # Fall back to first noon link
    return noon_links[0] if noon_links else None


def _pick_newest_eligible_link(
    items: list[tuple[int, str]],
    after_ms: int | None = None,
) -> str | None:
    min_internal_date = (after_ms or 0) - 30_000
    eligible = [
        (internal_date, link)
        for internal_date, link in items
        if min_internal_date <= 0 or internal_date >= min_internal_date
    ]
    if not eligible:
        return None
    eligible.sort(key=lambda item: item[0], reverse=True)
    return eligible[0][1]


def extract_otp_code(text: str) -> str | None:
    raw = html.unescape(str(text or ""))
    for match in _OTP_CODE_RE.finditer(raw):
        code = re.sub(r"\D", "", match.group(1))
        if len(code) == 6:
            return code
    copy_match = re.search(r"((?:\d[^\dA-Za-z]*){6})\s*copy\b", raw, re.IGNORECASE)
    if copy_match:
        code = re.sub(r"\D", "", copy_match.group(1))
        if len(code) == 6:
            return code
    return None


async def fetch_otp_link(user_id: str, db: Session, after_ms: int | None = None) -> str:
    """
    Fetch the latest Noon OTP email from Gmail API and return the OTP link URL.
    Raises ValueError if Gmail is not connected, no email found, or no link found.
    The extension must open this URL in a browser tab to read the visible OTP.
    """
    token = db.get(GmailToken, user_id)
    if not token or not token.refresh_token:
        raise ValueError("Gmail not connected — connect Gmail first")

    access_token = await _get_valid_access_token(token, db)
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=20) as client:
        # Search for latest Noon OTP email
        list_resp = await client.get(
            f"{GMAIL_API_BASE}/messages",
            headers=headers,
            params={"maxResults": 10, "q": NOON_OTP_QUERY},
        )
        if list_resp.status_code == 401:
            raise ValueError("Gmail access denied — reconnect Gmail")
        if not list_resp.is_success:
            raise ValueError(f"Gmail API error: {list_resp.text}")

        messages = list_resp.json().get("messages", [])
        if not messages:
            raise ValueError("No recent Noon OTP email found in Gmail inbox")

        min_internal_date = (after_ms or 0) - 30_000
        found: list[tuple[int, str]] = []

        for msg in messages:
            full_resp = await client.get(
                f"{GMAIL_API_BASE}/messages/{msg['id']}",
                headers=headers,
                params={"format": "full"},
            )
            if not full_resp.is_success:
                continue

            data = full_resp.json()
            internal_date = int(data.get("internalDate") or 0)
            if min_internal_date > 0 and internal_date < min_internal_date:
                continue
            payload = data.get("payload", {})
            body_text, links = _extract_text_and_links(payload)

            otp_link = _pick_best_otp_link(links, body_text)
            if otp_link:
                found.append((internal_date, otp_link))

        link = _pick_newest_eligible_link(found, after_ms=after_ms)
        if link:
            return link

    raise ValueError("No fresh OTP link found in recent Noon emails — check your Gmail inbox")
