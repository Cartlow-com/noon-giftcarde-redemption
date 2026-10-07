import base64

from fastapi.testclient import TestClient

from app.modules.gmail.services import get_unlock_link as unlock
from app.modules.gmail.services.get_unlock_link import _addressed_to, extract_unlock_link
from conftest import login

TRACKER = "http://url5712.noon.com/ls/click?upn=abc123"

# Shape of Noon's "Unlock more sign in attempts" email (button + footer links).
UNLOCK_HTML = f"""
<html><body>
<h1>Verify account for more login attempts</h1>
<p>You have reached the maximum amount of tries for the OTP request.</p>
<a href="http://url5712.noon.com/ls/click?upn=logo"><img src="logo.png"/></a>
<a href="{TRACKER}&amp;x=1" style="background:#feee00"><span>Verify my account</span></a>
<a href="https://help.noon.com/portal/en/home">Help Centre</a>
<a href="http://url5712.noon.com/ls/click?upn=terms">Terms of Use</a>
</body></html>
"""


def test_extract_unlock_link_picks_verify_button() -> None:
    assert extract_unlock_link(UNLOCK_HTML) == TRACKER + "&x=1"


def test_extract_unlock_link_ignores_footer_and_non_noon_links() -> None:
    html = """
    <a href="https://evil.example.com/verify">Verify my account</a>
    <a href="http://url5712.noon.com/ls/click?upn=t">Terms of Use</a>
    <a href="mailto:support@noon.com">support@noon.com</a>
    """
    assert extract_unlock_link(html) is None


def test_extract_unlock_link_empty() -> None:
    assert extract_unlock_link("") is None


def test_addressed_to_matches_base_address_noon_actually_uses() -> None:
    """Seen live 2026-10-05: lockout for y.w.aly808+shopping@ is mailed To: y.w.aly808@."""
    payload = {"headers": [{"name": "To", "value": "y.w.aly808@gmail.com"}]}
    assert _addressed_to(payload, "Y.W.Aly808+Shopping@gmail.com")
    assert _addressed_to(payload, "y.w.aly808@gmail.com")
    assert not _addressed_to(payload, "y.waly808@gmail.com")


def test_addressed_to_rejects_suffix_of_another_address() -> None:
    payload = {"headers": [{"name": "To", "value": '"Y W" <y.w.aly808+shopping@gmail.com>'}]}
    assert not _addressed_to(payload, "w.aly808+shopping@gmail.com")
    assert _addressed_to(payload, "y.w.aly808+shopping@gmail.com")


def test_extract_unlock_link_rejects_lookalike_hosts() -> None:
    html = """
    <a href="https://noon.com.evil.tld/x">Verify my account</a>
    <a href="https://evil.tld/?r=noon.com">Verify my account</a>
    """
    assert extract_unlock_link(html) is None


def test_unlock_link_route_rejects_quote_injection(client: TestClient) -> None:
    headers = login(client)
    resp = client.get('/gmail/unlock-link?email=a@example.com" OR from:x', headers=headers)
    assert resp.status_code == 400


def test_unlock_link_route_requires_gmail(client: TestClient) -> None:
    headers = login(client)
    resp = client.get("/gmail/unlock-link?email=a@example.com", headers=headers)
    assert resp.status_code == 400
    assert "Gmail not connected" in resp.json()["detail"]


def test_unlock_link_route_requires_auth(client: TestClient) -> None:
    resp = client.get("/gmail/unlock-link?email=a@example.com")
    assert resp.status_code == 401


def test_unlock_link_route_requires_email(client: TestClient) -> None:
    headers = login(client)
    assert client.get("/gmail/unlock-link", headers=headers).status_code == 422


def _gmail_message(to: str, html: str, internal_date: int) -> dict:
    data = base64.urlsafe_b64encode(html.encode()).decode().rstrip("=")
    return {
        "internalDate": str(internal_date),
        "payload": {
            "mimeType": "multipart/alternative",
            "headers": [{"name": "To", "value": to}, {"name": "Subject", "value": "Unlock more sign in attempts"}],
            "parts": [{"mimeType": "text/html", "body": {"data": data}}],
        },
    }


def test_fetch_returns_newest_link_for_row_email_only(monkeypatch, db_session) -> None:
    """Another account's unlock email (different base address) must never be used."""
    messages = {
        "m1": _gmail_message("w.aly808@gmail.com", UNLOCK_HTML.replace("abc123", "OTHER"), 3000),
        "m2": _gmail_message("y.w.aly808+shopping@gmail.com", UNLOCK_HTML.replace("abc123", "OLD"), 1000),
        "m3": _gmail_message("y.w.aly808+shopping@gmail.com", UNLOCK_HTML.replace("abc123", "NEW"), 2000),
    }
    seen_queries: list[str] = []

    class FakeResp:
        def __init__(self, body: dict) -> None:
            self._body, self.status_code, self.is_success, self.text = body, 200, True, ""

        def json(self) -> dict:
            return self._body

    class FakeClient:
        def __init__(self, *a, **kw) -> None: ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False

        async def get(self, url: str, headers=None, params=None):
            if url.endswith("/messages"):
                seen_queries.append(params["q"])
                return FakeResp({"messages": [{"id": k} for k in messages]})
            return FakeResp(messages[url.rsplit("/", 1)[1]])

    class FakeToken:
        refresh_token = "r"

    async def fake_access_token(token, db):
        return "t"

    monkeypatch.setattr(unlock.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(unlock, "_get_valid_access_token", fake_access_token)
    monkeypatch.setattr(db_session, "get", lambda model, key: FakeToken())

    import asyncio

    url = asyncio.run(
        unlock.fetch_unlock_link_from_email("u1", db_session, "y.w.aly808+shopping@gmail.com")
    )
    assert "upn=NEW" in url
    assert 'to:"y.w.aly808@gmail.com"' in seen_queries[0]
