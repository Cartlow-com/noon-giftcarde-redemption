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

- 2026-10-08 — Reset password is now a dialog (`reset-password.js`): 16-char CSPRNG password (no look-alikes), Regenerate/Show/Copy, auto-copy on success, "Require change at next sign-in" (default on; hidden for own account); `PATCH /users/{id}` honours explicit `must_change_password` alongside `password`
- 2026-10-08 — Admin **Force password change** / **Cancel forced change** on Users page: `PATCH /users/{id}` `must_change_password` (true signs the user out; not allowed on own account); reset password still forces a change
- 2026-10-08 — **Self-service password**: `POST /login/password` (current + new, min 8; returns fresh tokens, revokes other sessions); `users.must_change_password` set on admin create/reset (not own reset) → `require_auth`/`require_super_admin` 403 `Password change required` until changed; dashboard forced dialog + profile menu **Change password** (`password.js`), users list badge
- 2026-10-05 — Review fixes: SSE batch ownership; status/stage/outcome regex (blocks XSS); PATCH can't point screenshots outside own row; pw change revokes sessions; user pw min 8; case-insensitive login; super_admin attempt access (`get_owned_attempt`); seeder never resets super admin; SECRET_KEY warning; signed Gmail OAuth state; `/emails/send` super_admin only; tests use temp DB; `unconfirmed` purchase stage
- 2026-10-05 — Unlock email lookup matches the **base** address (Noon mails `x@` for `x+tag@` rows)
- 2026-10-05 — **Proxy rotation switched off**: `PROXY_ROTATION_ENABLED=false` (default) → `/proxies/next` 409; `/runs/config.proxy_rotation_enabled`. Real-Chrome test: direct loads Noon, all 7 probe-passing proxies 403/timeout/reset; `proxies.ok.csv` emptied
- 2026-10-05 — `proxies.ok.csv` regenerated: 7 of ~40k pass (CONNECT + verified TLS handshake); old list was Cloudflare IPs
- 2026-10-05 — Unlock link: exact To-address match (no substring), strict noon.com host check, email validated; `/proxies/next` returns on first working probe
- 2026-10-05 — Proxy probe = real CONNECT/SOCKS5 tunnel + verified TLS handshake to account.noon.com:443 (`proxies/services/probe.py`); `/proxies/next` never returns a proxy that failed its probe; empty `proxies.ok.csv` no longer falls back to raw list; `filter_ok_proxies.py` uses the tunnel probe
- 2026-10-05 — `GET /gmail/unlock-link?email=` returns Noon "Verify my account" link from the lockout email addressed to that row email (+ tests)
- 2026-10-05 — Full project review on branch `fix/project-review`; findings in `claude-docs/project-review-2026-10-05.md`
- 2026-10-02 — `/batches/sample.csv` is public (no JWT) so dashboard Download sample CSV link works
- 2026-10-02 — Filled `couponcode` in `login_test.csv` + `orders.example.csv` (ONE, FIRST20, FIRST15, RAK50, FAB10, STAPLES15)
- 2026-10-02 — Optional CSV `couponcode` / `coupon_code` stored as `batch_rows.coupon_code`; sample + orders.example updated
- 2026-10-01 — Added `proxies.ok.csv` (TCP-live only) + `scripts/filter_ok_proxies.py`; pool prefers OK file
- 2026-10-01 — Proxy rotate on offline / too many requests: `/proxies/next` + `/proxies/{id}/block` from `proxies.csv`
- 2026-10-01 — Click Here OTP emails: stop inventing OTP from HTML digit noise; open get-otp link instead
- 2026-10-01 — Login bumps `users.token_version`; JWTs carry `tv`; mismatch → 401 (revokes prior sessions)
- 2026-10-01 — `/gmail/otp-link` prefers inline email OTP (`OTP is 123456` / subject) then Click Here URL
- 2026-09-16 — Removed `/gmail/otp-handoff` API; OTP is never sent to/from backend
- 2026-09-16 — `/gmail/otp-link` returns URL only; removed unreliable server HTML OTP scrape
- 2026-09-10 — Auto-connect extension on dashboard load; connectWithReload() on button click (auth-extension.js + auth.js)
- 2026-09-07 — Super-admin seed email `admin@innovidio.com` / `admin@123` (legacy admin demoted)
- 2026-09-07 — Super-admin role + `/users` CRUD + global batch visibility/owner filter/Users panel
- 2026-09-04 — Screenshots stored per attempt (`…/{attempt_number}/{kind}.png`); GET/POST accept `attempt_id`; row keeps latest for emails
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
