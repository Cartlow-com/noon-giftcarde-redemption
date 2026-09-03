# Research: Multi-user auth & tenant isolation

## Decision 1 — Keep JWT, force AUTH_REQUIRED

**Choice**: Default `AUTH_REQUIRED=true`; use existing `/login` tokens.  
**Why**: Login module already issues access/refresh tokens; batches already call `require_auth` when flag is on.  
**Rejected**: Shared `EXTENSION_API_TOKEN` only — not user-specific.

## Decision 2 — Row-level ownership via `user_id` on batch + run

**Choice**: Add `user_id` to `batches` and `batch_runs`. Rows/emails/screenshots inherit via batch.  
**Why**: Minimal schema change; one filter on list/get paths.  
**Rejected**: Separate DB per user — too heavy for SQLite deploy.

## Decision 3 — Per-user run lock + per-user presence

**Choice**: Active run uniqueness and heartbeat keyed by `user_id`.  
**Why**: Enables multi-PC concurrent operators without cross-claim.  
**Rejected**: Global single-run lock (current) — blocks concurrency.  
**Rejected**: Same-tab-only messaging for v1 — conflicts with multi-PC concurrent requirement; can add later as UX improvement.

## Decision 4 — Admin role without cross-tenant batch view (v1)

**Choice**: Admin can create/list users; automation data remains self-scoped.  
**Why**: Fastest safe multi-tenant; avoids leaking gift-card CSVs across operators.  
**Rejected**: Super-admin sees all batches in v1 — privacy risk; defer.

## Decision 5 — Presence storage

**Choice**: DB table `extension_presence(user_id PK, last_seen_at)` preferred over flat files.  
**Why**: Natural per-user key; no filesystem races; easy to query in status endpoint.  
**Fallback**: `storage/presence/{user_id}.txt` if table migration is awkward for SQLite create_all.

## Decision 6 — Migration of existing data

**Choice**: On startup/migration, set null `user_id` batches/runs to seeded admin.  
**Why**: Preserves history under a known owner; operators start clean.

## Decision 7 — Seed credentials

**Choice**: Always ensure:

| Email | Password | Role |
|---|---|---|
| admin@example.com | admin123 | admin |
| user@example.com | password123 | operator |

Also honor `seeders/users.csv` when present (add optional `role` column).  
**Why**: User asked for admin credentials; matches `users.example.csv`.

## Decision 8 — Dashboard-only login (no extension login UI)

**Choice**: Operators log in only on the dashboard. After login, the page pushes JWT into the extension (`externally_connectable` / content script → `chrome.storage.local`). Extension never shows its own email/password form.  
**Why**: User preference; one auth surface. Extension still **must** hold a token because the service worker calls `/runs`, `/batches`, screenshots independently of the page.  
**Rejected**: Extension popup login — duplicate UX.  
**Rejected**: Dashboard token only in `localStorage` with no bridge — service worker cannot read page storage; all extension API calls would 401.
