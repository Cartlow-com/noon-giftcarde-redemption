# Tasks: Super-admin user management + global visibility

- [x] T1 — Add `User.role` (`user` | `super_admin`) + SQLite column ensure/backfill
- [x] T2 — Extend JWT + `SessionResponse` / `GET /login/me` with `role`
- [x] T3 — Seed **only** configured Innovidio admin / `admin@123` as `super_admin`; keep `admin@example.com` + `user@example.com` as `user`
- [x] T4 — `require_super_admin` + last-super-admin guards
- [x] T5 — `/users` module: list / create / patch / soft-delete
- [x] T6 — Ownership + list/SSE/detail: super_admin sees/operates on all tenants; optional `user_id` filter; expose `owner_email`
- [x] T7 — Wire users router in `app.py`
- [x] T8 — Dashboard: Users panel; global batches with owner + user filter for super_admin
- [x] T9 — Tests: seed role, users CRUD/403, user isolation, super_admin global batches/SSE
