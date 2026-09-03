# Data model: Multi-user auth & tenant isolation

## User (extend)

| Column | Type | Notes |
|---|---|---|
| id | string PK | existing |
| email | string unique | existing |
| hashed_password | string | existing |
| is_active | bool | existing |
| role | string | **new** — `operator` \| `admin`, default `operator` |
| created_at | datetime | existing |

## Batch (extend)

| Column | Type | Notes |
|---|---|---|
| user_id | string FK → users.id | **new**, indexed, required after migration |

## BatchRun (extend)

| Column | Type | Notes |
|---|---|---|
| user_id | string FK → users.id | **new**, indexed, required after migration |

## ExtensionPresence (new)

| Column | Type | Notes |
|---|---|---|
| user_id | string PK FK → users.id | |
| last_seen_at | datetime | UTC |

## Unchanged (access via ownership)

- `batch_rows` — via `batch.user_id`
- `email_send_histories` — via `related_batch_id` → batch owner
- screenshot files — path under row; API checks batch owner

## Invariants

1. `batch_runs.user_id` must equal owning `batches.user_id`
2. At most one `batch_runs` row per `user_id` in statuses `queued|claimed|running|stopping`
3. Heartbeat upsert only updates the authenticated user’s presence row
4. Inactive users (`is_active=false`) cannot create sessions

## Migration steps

1. Add columns / table via SQLAlchemy `create_all` + startup alter helpers (project has no Alembic today — match existing pattern)
2. Seed admin + operator with roles
3. `UPDATE batches SET user_id = <admin_id> WHERE user_id IS NULL`
4. `UPDATE batch_runs SET user_id = <admin_id> WHERE user_id IS NULL`
5. Backfill not required for presence
