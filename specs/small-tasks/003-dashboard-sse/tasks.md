# Tasks: Admin dashboard SSE

- [x] T1 Create `services/dashboard_events.py` — build per-user snapshot (health, extension, active_run, batches, optional rows for `batch_id`)
- [x] T2 Add `GET /admin/events` SSE route (StreamingResponse); auth via `require_auth`; stream snapshot every ~2s until disconnect
- [x] T3 Wire route into app (`app.py` or batches/run routes); set no-store / no buffering headers
- [x] T4 Admin client: SSE consumer (fetch + Bearer + reconnect); apply snapshot to UI state
- [x] T5 Remove `setInterval` pollers in `app.js` and `controls.js`; keep Refresh + mutation REST
- [x] T6 Cache-bust `index.html` asset query strings
- [x] T7 Tests: 401 without auth; authenticated stream yields `dashboard` event with required keys
- [x] T8 Update `docs/context/backend.progress.md` + conventions if new pattern
