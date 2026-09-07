# Task: Super-admin user management + global batch visibility

## Goal

Add a `super_admin` role. Seed **only** `cartlow@admin.com` as super_admin. Super-admins can manage users and **see (and operate on) every user’s batches, rows, runs, emails, screenshots, and live dashboard stats**.

## Requirements

1. **Role on User**
   - Add `role` column: `user` | `super_admin` (default `user`).
   - SQLite column ensure/backfill; existing rows → `user`.
   - JWT access token + `GET /login/me` include `role`.

2. **Seeded accounts**
   - **`cartlow@admin.com` / `admin@123`** → create/update as **`super_admin`** (only seeded super_admin).
   - `admin@example.com` / `admin123` → remains **`user`** (not super_admin).
   - `user@example.com` → **`user`**.
   - Re-seed must force `cartlow@admin.com` role+password; must **not** elevate `admin@example.com`.

3. **User management APIs** (super_admin only)
   - `GET /users` — list (`id`, `email`, `role`, `is_active`, `created_at`).
   - `POST /users` — create (`email`, `password`, optional `role` default `user`).
   - `PATCH /users/{id}` — password / `is_active` / `role` (with guards).
   - `DELETE /users/{id}` — soft-deactivate (`is_active=false`).

4. **Guards**
   - `/users*` → auth + `super_admin` else 403.
   - Cannot deactivate/demote the last active `super_admin`.
   - Regular users: unchanged own-data tenancy.

5. **Cross-user batch / stats access (super_admin)**
   - When caller is `super_admin`, ownership checks allow **any** batch/row/run (read + operate).
   - List/detail/rows/attempts/emails/screenshots/runs return **all users’** data.
   - Responses include **owner** identity where useful (`user_id`, `owner_email`).
   - Optional filter `user_id` (or `owner_email`) on batch list + dashboard SSE to focus one user.
   - `GET /admin/events` for super_admin: global snapshot/deltas (all tenants), not scoped to self.
   - Regular users remain strictly scoped to own `user_id`.

6. **Dashboard UI**
   - **Users** panel — super_admin only (list / create / deactivate / reset password).
   - **Batches** for super_admin: show **all** batches with owner email; filter by user; full row detail, run history, emails, screenshots, live stats (same panels, global data).
   - Non–super-admin: no Users panel; batches stay own-only.

## Flow (Mermaid)

```mermaid
flowchart TD
  login[Login] --> me["GET /login/me + role"]
  me --> check{role == super_admin?}
  check -->|no| own[Own batches only]
  check -->|yes| adminUI[Users + global Batches]
  adminUI --> usersAPI[/users CRUD]
  adminUI --> global[All users batches / rows / runs / SSE]
  global --> filter[Optional filter by user]
```

## Acceptance Criteria

- [ ] Only `cartlow@admin.com` is seeded as `super_admin`; `admin@example.com` is `user`.
- [ ] `cartlow@admin.com` / `admin@123` logs in with `role=super_admin`.
- [ ] Super-admin Users panel + `/users` CRUD; soft-deactivate; last-admin guards.
- [ ] Regular user: 403 on `/users`; no Users UI; only own batches.
- [ ] Super-admin sees every user’s batches, rows, attempts, emails, screenshots, run pills, SSE stats.
- [ ] Super-admin can filter batches/dashboard by user; each batch shows owner email.
- [ ] Super-admin can open detail / run / stop / delete for any user’s batch (ops).

## Files to Change

- `backend/app/modules/login/models/db_models.py` — `role`
- `backend/app/config/database.py` — SQLite `users.role`
- `backend/seeders/seed_users.py` + `users.example.csv`
- Login tokens/session/`/me` — include `role`
- New `backend/app/modules/users/`
- `backend/app/modules/batches/helpers/ownership.py` + auth — super_admin bypass + optional `user_id` filter
- `backend/app/modules/batches/services/dashboard_events.py` + list services — global scope + `owner_email`
- Batch/run response models — expose owner fields
- `backend/app/app.py` — users router
- `backend/app/static/admin/*` — Users panel + owner column + user filter
- Tests: roles seed, users CRUD, isolation for user, global visibility for super_admin
