# Tasks: 004 SSE delta + watermark

- [x] T1 — Add watermark helper + `updated_since` queries (batches/rows/run/presence) in dashboard events layer
- [x] T2 — Change `_dashboard_event_stream`: first yield full `dashboard`; then loop watermark → `ping` or `dashboard_delta`
- [x] T3 — Redact `password` / `gift_card_pin` from SSE row serialization
- [x] T4 — Client: handle `dashboard_delta` merge + ignore `ping` (`sse.js`, `snapshot.js`); cache-bust assets
- [x] T5 — Tests for bootstrap snapshot, idle ping (no full lists), and delta after row change
- [x] T6 — Update `docs/context/conventions.md` + `backend.progress.md`
