# Tasks: Per-attempt screenshots

- [x] T1. Add screenshot columns to `BatchRowAttempt` + SQLite `_ensure` + `RowAttemptResponse`
- [x] T2. Save/get screenshot by optional `attempt_id` (path `…/{attempt_number}/{kind}.png`; mirror latest on row)
- [x] T3. Wire routes/controller query param `attempt_id`
- [x] T4. Extension: pass `activeAttemptId` on screenshot upload
- [x] T5. Dashboard: selected run uses attempt screenshot URLs / paths
- [x] T6. Tests for per-attempt upload + get isolation
- [x] T7. Rebuild extension + bump admin asset `?v=`
