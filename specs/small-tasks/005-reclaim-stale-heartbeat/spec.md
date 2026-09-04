# Task: Reclaim active runs when extension heartbeat expires

## Goal

When a user’s extension presence is stale (offline past TTL), automatically finalize that user’s active batch runs and stuck `in_progress` rows so the next run is not blocked until a human presses Stop.

## Requirements

1. If `is_extension_online(user)` is false and the user has runs in active statuses (`queued`/`claimed`/`running`/`stopping`), stop those runs and finalize interrupted rows (reuse stop/finalize logic).
2. Stage/row error message: `Extension heartbeat expired` (not “Stopped by user”).
3. Trigger reclaim on: `GET /runs/active`, `GET /runs/extension/status`, `POST /runs` (before “another run active” / online checks), and dashboard snapshot/revision build (so SSE reflects stop).
4. Online presence → no-op.
5. Tests: create run → age heartbeat past TTL → status/active/create path reclaims; in-progress row cleared; new run can start after reclaim + fresh heartbeat.

## Acceptance Criteria

- [ ] Stale presence + active run → run becomes `stopped` without manual Stop
- [ ] Stuck `in_progress` rows finalized
- [ ] Fresh heartbeat → no reclaim
- [ ] After reclaim + new heartbeat, a new run can be created

## Files to Change

- `backend/app/modules/batches/services/run_jobs.py`
- `backend/app/modules/batches/routes/run_routes.py` (status/active hooks if needed)
- `backend/app/modules/batches/services/dashboard_events.py` (optional reclaim on snapshot)
- `backend/app/modules/batches/tests/test_runs.py`
- `docs/context/backend.progress.md` / `conventions.md`
