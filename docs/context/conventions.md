# Conventions

## Tech Decisions

| Decision | Choice | Reason |
|---|---|---|
| Extension pattern | MV3 side panel + content scripts | Matches postsiva-extension |
| Content script order | `mouse.js` then numbered `content/*.js` (`03a` before `03b`) | Manifest array is load order; filenames must match |
| Input typing | React native value setter + InputEvent | Noon uses React-controlled inputs |
| Navigation resume | `chrome.storage.local` keys | Content script reinjects on full page nav |
| Credits entry | Direct URL nav | Faster, fewer flaky UI clicks |
| Admin UI | Static pages on FastAPI `/` | Same port as API; extension palette |
| Admin live updates | SSE `GET /admin/events` — bootstrap full `dashboard` snapshot + watermark; idle `ping`; changes as `dashboard_delta` (partial) | Replaces blind 2s full-JSON dumps; JWT via fetch stream |
| Element finding | `findClickableByText(text, scope)` | Sidebar-scoped search misses main content/modals |
| Navbar Log In | Click once; if popup closed, click once more (no refresh) | Extra clicks were toggling the modal shut |
| Row re-runs | Attempt at start + PATCH finish (`batch_row_attempts`) | Covers mid-row crashes, not only completions |
| Screenshots | Per attempt `{batch}/{row}/{attempt}/{kind}.png`; row keeps latest | Selecting a run shows that run’s shots |
| Skip rules | Redeem done + order success → skip row; always email-match before redeem/order | Safe multi-run of same CSV |
| Auth | `AUTH_REQUIRED=true` JWT; access token TTL 7 days; dashboard login only; `/me` + protected routes re-check DB `is_active`+`role`; `token_version` bumped on each login to revoke prior JWTs | Per-user isolation; deactivate/demote revoke mid-token; new login kills old sessions |
| Tenancy | Ownership default-closed; stale presence auto-stops runs; `super_admin` can list/operate across users (+ optional `user_id` filter) | Ops visibility without weakening normal users |
| Row API secrets | List/SSE omit password+PIN; work payload only on get-row + pull-next | Listing is not a credential dump |
| Face value | Optional CSV `face_value`; `value_match` vs `balance_delta` | Stored-value reconciliation |
| Extension auth | Token bridged from dashboard → `chrome.storage.local`; API base follows connected dashboard origin | Live + local both connectable |
| Dashboard origins | Always allow `https://redeem.innovidio.com` + localhost in `externally_connectable` + `dashboardBridge` | Build used to wipe live when `.env` was localhost |
| Gmail OTP | Prefer 6-digit code from email subject/body; else open Click Here / get-otp link and scrape | Noon now sends OTP inline in many emails |
| Noon proxy | Direct first; rotate on offline/too many requests; pool prefers `proxies.ok.csv` if present else `proxies.csv` | Filter dead free-list entries |

## Code Patterns

### Ghost cursor API (`window.__noonGhostMouse`)

```js
await mouse().show();
await mouse().click(element);
await mouse().type(input, text, { masked: true });
await mouse().hide();
```

### Flow abort check

Every wait loop calls `flow().check()` — throws `LoginCancelledError` if user cancelled.

### Page-aware state machine

`detectPageState()` → `runGiftCardRedemption()` loop — only performs the next step for current page.

### Modal detection

Search `[role="dialog"]`, `[aria-modal="true"]`, modal class patterns — **not** sidebar nav.

### Storage keys

- `noon_flow_state` — resume payload after navigation
- `noon_flow_done` — background polls for completion across tab reloads

### Admin dashboard SSE

- Server: `GET /admin/events` — first event `dashboard` (full snapshot + `watermark`); then ~2s loop: unchanged → `ping`; changed → `dashboard_delta` (only updated batches/rows/run/presence)
- SSE row payloads omit `password` / `gift_card_pin` (detail still via REST)
- Client: `sse.js` uses `fetch` + `Authorization: Bearer` (not `EventSource`); `snapshot.js` applies snapshot replace or delta merge
- Extension run claim still uses HTTP poll + `chrome.alarms` (MV3)

## File Size

- Hard cap 350 lines per source file — `content.js` is over (~1000 lines); candidate for split if it grows further

## Host Permissions

- `https://www.noon.com/*`
- `https://account.noon.com/*`
