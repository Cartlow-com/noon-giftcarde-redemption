# Plan: Multi-user auth & tenant isolation

**Feature**: `specs/002-multi-user-auth`  
**Date**: 2026-09-03

## Technical Context

| Area | Choice |
|---|---|
| Backend | FastAPI + SQLAlchemy + SQLite (existing) |
| Auth | Existing JWT login module (`/login`); enforce `AUTH_REQUIRED=true` |
| Roles | Add `role` column on `users`: `operator` \| `admin` |
| Tenancy | `user_id` FK on `batches`, `batch_runs`; presence keyed by `user_id` |
| Dashboard | Only login UI; Bearer in `localStorage`; after login push tokens to extension |
| Extension | No login form; receive tokens via bridge; store in `chrome.storage.local`; Authorization on fetches |
| Tests | pytest API tests for isolation + concurrent per-user runs |

## Constitution / project gates

- File size ≤ 350 lines — split auth helpers / presence if needed
- No new libraries without ask — reuse bcrypt + existing JWT
- Do not auto-commit

## Phase 0 — Research

See `research.md`.

## Phase 1 — Design

- `data-model.md` — schema changes
- `contracts/` — API deltas
- `quickstart.md` — how to enable and login

## Phase 2 — Implementation order (summary)

1. Schema + migration/seed roles + AUTH_REQUIRED default true
2. Ownership columns + presence per user
3. Enforce auth + scoping on all batch/run/email routes
4. Per-user active-run lock
5. Admin user create/list endpoints
6. Dashboard login UI + token bridge into extension (no extension login)
7. Extension Bearer from storage + 401 handling
8. Tests for isolation + dual-user concurrent runs

## Risks

| Risk | Mitigation |
|---|---|
| SQLite claim race for same user | Status check on claim; unique active-run query per user |
| Orphan pre-migration data | Assign to admin |
| Extension forgets token | 401 → dashboard “sign in on this Chrome”; re-login pushes token again |
| Shared heartbeat file today | Replace with per-user store (DB table or `presence/{user_id}.txt`) |
