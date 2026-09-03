# Tasks: Screenshots + dedicated email module

## Backend
- [x] T1 — Add SMTP settings to `settings.py` from `FAILOVER_MAIL_*` env
- [x] T2 — Create `app/modules/email/` models: `EmailSendHistory` table + request/response models
- [x] T3 — Implement template registry + `render_template(template_key, context)`
- [x] T4 — Implement `smtp_client.send_raw(...)` + `send_templated_email(...)` (always write history)
- [x] T5 — Email routes: `GET /emails/history`; wire router in `app.py`
- [x] T6 — Batch row: add screenshot path columns + SQLite ALTER migrate helper
- [x] T7 — `POST /batches/rows/{id}/screenshots` save file + path on row
- [x] T8 — `POST /batches/rows/{id}/notify/redeem` and `/notify/order` calling email module
- [x] T9 — Tests: template render, history on send/fail, screenshot path, notify uses templates

## Extension
- [x] T10 — Two checkboxes (redeem emails / order emails), default off, persist storage
- [x] T11 — Pass flags on `START_BATCH_RUN` through batchRunner
- [x] T12 — `chrome.tabs.captureVisibleTab` helper → upload screenshot kinds
- [x] T13 — Hook captures: before redeem, after redeem, after order
- [x] T14 — On redeem success/already_redeemed + flag → call notify/redeem
- [x] T15 — On order success: parse order # from URL → patch `order_id`; capture SS; notify/order if flag
- [x] T16 — Show screenshot paths + order_id in row detail; build extension
