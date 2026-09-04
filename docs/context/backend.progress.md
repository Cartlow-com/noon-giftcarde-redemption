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
| `AUTH_REQUIRED` env flag | ✅ Done | Default **true** |
| User seed CSV | ✅ Done | `admin@example.com` / `admin123`, `user@example.com` / `password123` |
| Per-user tenancy | ✅ Done | Batches/runs/presence scoped by `user_id`; multi-user concurrent runs |
| Extension batch UI | ✅ Done | Upload + history in Batches tab |
| Batch automation runner | ✅ Done | Upload → DB save → auto-start pull-next loop |
| Admin dashboard | ✅ Done | `/` + SSE live updates (`/admin/events`) |
| Dashboard run jobs | ✅ Done | `/runs` queue; extension poll + Noon window |
| Redeem verification | ⬜ Deferred | Balance/transaction check — later |

## Recent Changes

- 2026-09-04 — Critique remaining: ownership default-closed; attempt start+PATCH; secrets off list/SSE; face_value+value_match; purge live CSVs; 03a content script; delete dead React batches
- 2026-09-04 — Reclaim active runs when extension heartbeat expires (auto-stop + finalize in_progress rows)
- 2026-09-04 — Access token TTL 60m → 7 days (unattended batches; no refresh wiring)
- 2026-09-04 — SSE: watermark + delta events (idle `ping`; no full JSON every 2s); redact password/PIN from SSE rows
- 2026-09-03 — Per-row run attempt history API + dashboard; skip complete when redeem+order done; always email-verify before redeem/order; partial re-runs order
- 2026-09-03 — Admin dashboard live updates via SSE (`GET /admin/events`); removed GET poll intervals
- 2026-09-03 — Multi-user auth (no roles): AUTH_REQUIRED=true; per-user batches/runs/presence; dashboard login bridges JWT to extension
- 2026-09-03 — Dashboard auth overlay now stores Noon JWTs, syncs them into the extension bridge, and clears both on sign-out
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
