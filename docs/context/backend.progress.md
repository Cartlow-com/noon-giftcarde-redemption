# Backend Progress

## Active Tasks

| Slot | Agent | Trigger | Spec | Task | Status |
|---|---|---|---|---|---|
| BE-1 | — | — | — | — | idle |
| BE-2 | — | — | — | — | idle |
| BE-3 | — | — | — | — | idle |
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
| Admin dashboard | ✅ Done | `/` upload/run/stop/delete + screenshots/emails |
| Dashboard run jobs | ✅ Done | `/runs` queue; extension poll + Noon window |
| Redeem verification | ⬜ Deferred | Balance/transaction check — later |

## Recent Changes

- 2026-09-03 — Run flags `login_only` + `screenshot_on_failure` kind for stage failures
- 2026-09-03 — Run flag `hide_window` + SQLite column; dashboard/extension minimize Noon window
- 2026-09-03 — Heartbeat TTL 90s (matches MV3 alarm wake); already_redeemed+skipped→partial; timing PATCH keeps status
- 2026-09-03 — Stop API finalizes stuck in-progress rows immediately (status→stopped); reject late run PATCH
- 2026-09-03 — Dashboard: upload/sample CSV, select+run/stop, email/place-order toggles, delete batch; `/runs` job API + row timing
- 2026-09-03 — Dashboard served at `/` (port 8000 root); assets under `/assets`
- 2026-09-03 — Read-only `/admin` dashboard + `GET` screenshot files for row images
- 2026-09-03 — Email module + screenshot APIs + history table; batch notify redeem/order
- 2026-09-01 — Batch upload flow: save CSV to DB first, then auto-start row processing
- 2026-09-01 — Batch module: backend APIs + extension Batches tab (upload/history, no verification)
- 2026-09-01 — Documented backend as reference-only; extension is primary deliverable
- 2026-09-01 — Created docs/context/ with full project documentation
