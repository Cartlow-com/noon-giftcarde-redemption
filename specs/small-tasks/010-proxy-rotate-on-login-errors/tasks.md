# Tasks: 010 — Proxy rotate on login errors

## Backend
- [x] T1 Create `app/modules/proxies/` (models + services + routes + controller)
- [x] T2 Load `proxies.csv` from project root; filter `is_blocked=0`
- [x] T3 `GET /proxies/next` — return random unblocked proxy `{ id, proxy, host, port, scheme }`
- [x] T4 `POST /proxies/{id}/block` — set blocked in `backend/data/proxies_blocked.json`
- [x] T5 Unit tests for parse + next + block (+ deadlock regression)
- [x] T6 Wire router in `app.py`

## Extension
- [x] T7 Add `proxy` permission to `manifest.json`
- [x] T8 Background: apply PAC via `chrome.proxy.settings.set` for noon hosts only; `clear` helper
- [x] T9 Message: `ROTATE_NOON_PROXY` → call `/proxies/next` → apply; `CLEAR_NOON_PROXY`
- [x] T10 Detect “too many requests” + existing offline / fail-to-fetch helpers
- [x] T11 Login retry wrapper: direct first → on proxy-worthy error rotate + hard refresh + retry up to 3
- [x] T12 Clear proxy when batch row ends (success/fail)
- [x] T13 Build extension; smoke-check message wiring

## Docs
- [x] T14 Update `backend.progress.md` / `frontend.progress.md` + conventions
