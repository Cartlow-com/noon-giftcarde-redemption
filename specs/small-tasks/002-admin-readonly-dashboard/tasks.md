# Tasks: View-only admin dashboard

## Setup
- [x] T1 Create `backend/app/static/admin/` with `index.html`, `styles.css`, `app.js` scaffold

## Backend
- [x] T2 Add `get_row_screenshot(row_id, kind, db)` service — resolve path from row columns, return file path or raise
- [x] T3 Add `GET /batches/rows/{row_id}/screenshots/{kind}` route returning `FileResponse` (image/png); 404 if missing
- [x] T4 Wire static files: mount `/admin` static dir; `GET /admin` → `index.html`
- [x] T5 Tests: screenshot GET 200 when file exists, 404 when missing / bad kind

## Dashboard UI
- [x] T6 Batches list + counts + auto-refresh (fetch existing `/batches`)
- [x] T7 Batch rows table + status filter (fetch `/batches/{id}/rows`)
- [x] T8 Row detail: stages, errors, balances, order_id; screenshots via img URLs; emails via `/emails/history?row_id=`
- [x] T9 Style with extension palette only (bg / surface / border / noon); dense ops layout

## Close
- [x] T10 Run tests + update progress files
