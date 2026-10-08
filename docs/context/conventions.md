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
| Passwords | Admin-set passwords are temporary (`must_change_password`): every API except `/login/*` returns 403 until the user changes it; self-change bumps `token_version` and re-hands the new token to the extension | Admin never knows a user's real password |
| Tenancy | Ownership default-closed; stale presence auto-stops runs; `super_admin` can list/operate across users (+ optional `user_id` filter) | Ops visibility without weakening normal users |
| Row API secrets | List/SSE omit password+PIN; work payload only on get-row + pull-next | Listing is not a credential dump |
| Face value | Optional CSV `face_value`; `value_match` vs `balance_delta` | Stored-value reconciliation |
| Extension auth | Token bridged from dashboard → `chrome.storage.local`; API base follows connected dashboard origin — **except** during an active run or when pinned in the side panel (`noon_api_base_pinned`) | Live + local both connectable; open prod+local dashboards used to steal the extension mid-run |
| Dashboard origins | Always allow `https://redeem.innovidio.com` + localhost in `externally_connectable` + `dashboardBridge` | Build used to wipe live when `.env` was localhost |
| Gmail OTP | Poll every 2s: backend Gmail API, else this Chrome's Gmail Atom feed (base address, newest Noon OTP issued ≥ request−20s); Click Here link only via API | Fixed waits were slow; Gmail DOM reading showed stale views |
| Noon emails | Sent to the account's **base** address (`+tag` stripped) | Seen live 2026-10-05 |
| Add to cart confirmation | Header `[data-qa=btn_cart_count]` must rise (or cart page reached); never trust "Added to cart"/VIEW CART text unless on screen | Hidden quick-cart drawer is always in the DOM |
| Dry run mode (`cart_test`) | Fills gift card + PIN on Credits but never clicks Redeem (`content/07a-redeem-dryrun.js`: no `fillAndRedeemGiftCard`, no `persistFlow`, no navigation); never orders; stops before Place order; empties the cart; purchase_status `cart_ok` (redeem/order stay pending for a real run) | Exercise every step without spending |
| Order confirmation | Not seen within 45s → purchase `unconfirmed`, row `partial`, treated as done (no auto re-order); human resets to pending | Click already happened — retry could double-order |
| End of run | Always sign out the last account (best effort, never fails the run) | No Noon session left logged in |
| Ghost mouse | Exactly one click per press | Double click sent 2 OTPs / double submits |
| Noon lockout | On "Too many failed attempts": `/gmail/unlock-link?email=` (To-header must equal row email) → open link in inactive tab → retry login once | Lockout is per account; never use another alias's link |
| Noon proxy | **Off by default** (`PROXY_ROTATION_ENABLED`); when on: Direct first; rotate on offline/too many requests; PAC has no DIRECT fallback for Noon hosts (dead proxy → `onProxyError` → rotate/clear + reload); proxies validated by CONNECT tunnel + verified TLS handshake to account.noon.com:443 (TCP-connect is not enough — CDN IPs; HTTP-level checks impossible: Noon bot protection rejects non-browser clients); pool uses `proxies.ok.csv` whenever it exists (empty = none) else `proxies.csv` | Filter dead free-list entries |

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
