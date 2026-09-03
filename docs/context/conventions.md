# Conventions

## Tech Decisions

| Decision | Choice | Reason |
|---|---|---|
| Extension pattern | MV3 side panel + content scripts | Matches postsiva-extension |
| Content script order | `mouse.js` then `content.js` | Ghost cursor API must load first |
| Input typing | React native value setter + InputEvent | Noon uses React-controlled inputs |
| Navigation resume | `chrome.storage.local` keys | Content script reinjects on full page nav |
| Credits entry | Direct URL nav | Faster, fewer flaky UI clicks |
| Admin UI | Static pages on FastAPI `/` | Same port as API; extension palette |
| Admin live updates | SSE `GET /admin/events` (~2s snapshot) | Replaces dashboard GET polling; JWT via fetch stream |
| Element finding | `findClickableByText(text, scope)` | Sidebar-scoped search misses main content/modals |
| Navbar Log In | Click once; if popup closed, click once more (no refresh) | Extra clicks were toggling the modal shut |
| Row re-runs | Snapshot each pass to `batch_row_attempts` | Full history of 1st/2nd/… runs per row |
| Skip rules | Redeem done + order success → skip row; always email-match before redeem/order | Safe multi-run of same CSV |
| Auth | `AUTH_REQUIRED=true` JWT; dashboard login only | Per-user data isolation; no roles |
| Tenancy | `user_id` on batches/runs + per-user presence | Multi-PC concurrent operators |
| Extension auth | Token bridged from dashboard → `chrome.storage.local` | No extension login form |

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

- Server: `GET /admin/events` streams `event: dashboard` JSON snapshots (~2s)
- Client: `sse.js` uses `fetch` + `Authorization: Bearer` (not `EventSource`); `snapshot.js` applies updates
- Extension run claim still uses HTTP poll + `chrome.alarms` (MV3)

## File Size

- Hard cap 350 lines per source file — `content.js` is over (~1000 lines); candidate for split if it grows further

## Host Permissions

- `https://www.noon.com/*`
- `https://account.noon.com/*`
