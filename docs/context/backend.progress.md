# Backend Progress

## Active Tasks

| Slot | Agent | Trigger | Spec | Task | Status |
|---|---|---|---|---|---|
| BE-1 | — | — | — | — | idle |
| BE-2 | — | — | — | — | idle |
| BE-3 | — | — | — | — | idle |

## Status

FastAPI backend with login + batch modules. Extension connects to backend for CSV batch upload/history.

| Item | Status | Notes |
|---|---|---|
| FastAPI backend | ✅ Done | SQLite, login + batches modules |
| Batch CSV upload API | ✅ Done | POST `/batches/upload` |
| Batch list/detail/rows API | ✅ Done | GET + PATCH + pull-next |
| `AUTH_REQUIRED` env flag | ✅ Done | Default `false` |
| User seed CSV | ✅ Done | `seeders/users.example.csv` → copy to `users.csv` |
| Extension batch UI | ✅ Done | Upload + history in Batches tab |
| Batch automation runner | ✅ Done | Upload → DB save → auto-start pull-next loop |
| Admin dashboard | ✅ Done | Read-only `/` + screenshot GET |
| Redeem verification | ⬜ Deferred | Balance/transaction check — later |

## Recent Changes

- 2026-09-03 — Dashboard served at `/` (port 8000 root); assets under `/assets`
- 2026-09-03 — Read-only `/admin` dashboard + `GET` screenshot files for row images
- 2026-09-03 — Email module + screenshot APIs + history table; batch notify redeem/order
- 2026-09-01 — Batch upload flow: save CSV to DB first, then auto-start row processing
- 2026-09-01 — Batch module: backend APIs + extension Batches tab (upload/history, no verification)
- 2026-09-01 — Documented backend as reference-only; extension is primary deliverable
- 2026-09-01 — Created docs/context/ with full project documentation
