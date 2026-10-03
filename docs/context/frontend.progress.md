# Frontend Progress — Noon Chrome Extension

## Active Tasks

| Slot | Agent | Trigger | Spec | Task | Status |
|---|---|---|---|---|---|
| FE-1 | — | — | — | — | idle |

## Recent Changes
- 2026-10-03 — Add to Cart: prefer `[data-qa="pdp-add-to-cart-revamp"]` (buy-box first), text match fallback
- 2026-10-02 — Cart: type `coupon_code` → APPLY → then Checkout (before place-order)
- 2026-10-02 — BatchRow type includes optional `coupon_code`
- 2026-10-01 — On offline / too many requests: rotate random proxy (max 3), hard-refresh, retry login; clear PAC after row
- 2026-10-01 — Extension uses email-body OTP when present; opens Click Here page only as fallback
- 2026-09-30 — Live `https://redeem.innovidio.com` always connectable; API base follows connected dashboard origin
- 2026-09-16 — OTP scrape reads inline `const otp` script + `.otp-input` values first (Noon get-otp page)
- 2026-09-16 — OTP scrape uses allFrames executeScript; get-otp excluded from mouse/login scripts; main frame preferred
- 2026-09-16 — Removed OTP backend handoff; extension opens link, scrapes OTP locally, pastes on Noon
- 2026-09-16 — OTP login always opens email link tab and scrapes visible code (no server-side wrong OTP shortcut)
- 2026-09-12 — Gmail OTP lookup now sends an attempt timestamp and skips stale OTP emails from prior runs
- 2026-09-12 — Gmail OTP link endpoint now server-fetches the Noon OTP page and returns a parsed 6-digit OTP before browser copy fallback
- 2026-09-12 — OTP page Copy now fires main-world pointer/mouse events; added local Chrome OTP handoff and split OTP helper file
- 2026-09-12 — OTP parsing now accepts only 6-digit codes and verifies all six Noon boxes before submit
- 2026-09-12 — OTP Copy fallback can return to Noon and read the browser clipboard when code text cannot be scraped
- 2026-09-12 — Added authenticated backend OTP handoff so extension saves OTP then Noon tab reads it back before paste
- 2026-09-12 — OTP extraction now prefers the visible Copy-button ancestor text and OTP modal fills boxes with direct input events
- 2026-09-12 — OTP tab handoff now refocuses Noon before pasting; scraper handles visible spaced digits before Copy text
- 2026-09-12 — Noon OTP fallback clicks the OTP page Copy button and reads clipboard when text scraping fails
- 2026-09-11 — Dashboard pings extension service worker auth status before showing connected; cache-busted auth assets
- 2026-09-11 — Extension connect now verifies service-worker token storage, heartbeats backend, remembers dashboard origin, and immediately polls pending runs
- 2026-09-11 — Extension reuses any existing Noon tab; opens a new tab only when no Noon tab exists
- 2026-09-11 — Added Gmail OTP fallback for Noon OTP-only login screens
- 2026-09-11 — Added localhost API fallback while keeping Innovidio as primary extension backend
- 2026-09-11 — Removed old live domain from extension config; Innovidio is the only live dashboard/backend domain
- 2026-09-07 — Topbar shows green “Extension connected” when linked; API online pill removed
- 2026-09-07 — Profile icon menu: Connect extension + Sign out; removed API/Sign out topbar clutter
- 2026-09-07 — Edit row: Login/Redeem/Order/Overall status selectors
- 2026-09-07 — Uploaded batches shown as selectable cards (batch rail)
- 2026-09-07 — Row Edit/Delete actions + custom confirm for delete batch/row
- 2026-09-07 — User dashboard: single-column layout; batch dropdown; removed ext status pill
- 2026-09-07 — Custom themed Sign out confirm modal (replaces browser alert)
- 2026-09-07 — Sign out asks confirm before clearing session (all roles)
- 2026-09-07 — Row runs modal: dropdown to switch runs (replaces confusing run card list)
- 2026-09-07 — Row View btn opens runs modal; super-admin hides side Row detail panel
- 2026-09-07 — Super-admin: Users-only sidebar; View data opens batches modal
- 2026-09-07 — Super-admin: hide API/extension/run controls; simple Batches+Users oversight UI
- 2026-09-07 — Super-admin dashboard: left sidebar; Users full page; click user → filtered batches
- 2026-09-04 — Dashboard/extension: screenshots scoped to selected run (`attempt_id`); no cross-run image bleed
- 2026-09-04 — Deleted dead `src/features/batches/` React tree; renamed content `02b` → `03a-login-password.js`
- 2026-09-04 — Too many failed attempts: stop on first hit; no profile reload / second Log In+email try
- 2026-09-04 — Stop instantly on Noon “Too many failed attempts”; no Continue/login retry
- 2026-09-04 — Dashboard Run history is selectable; clicking Run #1/#2 shows that run’s stages and errors
- 2026-09-04 — Wrong account vs row: Sign out → wait 1s → profile → Log In → email → Continue
- 2026-09-03 — Redeem screenshots wait for Available Balance + Redeem Giftcards (no skeleton/spinner); skip capture if still loading
- 2026-09-03 — Never click Log In until profile email or login-required is visible; after sign-out wait then reopen profile
- 2026-09-03 — Login always starts on profile; mismatch → sign out, wait, reopen profile; Log In click retried once if popup stays closed
- 2026-09-03 — Noon opens in a dedicated browser window (not dashboard); one window reused for all rows
- 2026-09-03 — Redeem screenshots wait for Available Balance (no spinner); refuse capture if not on Noon credits tab
- 2026-09-03 — Add to Cart clicks once only (phase guard + single native click); no double-add
- 2026-09-03 — Row run history in detail panel; always verify session email before redeem/order; skip complete redeem+order rows; partial re-runs order
- 2026-09-03 — Dashboard screenshots load via authenticated fetch (bare img src was 401 under AUTH_REQUIRED)
- 2026-09-03 — on_failure screenshot: 1 attempt only (no retry after terminal errors like too many login attempts)
- 2026-09-03 — Element-driven speed: waitFor polls 50ms; mouse defaults fast; removed fixed 0.6–1s pauses / 900ms post-nav delays
- 2026-09-03 — Fixed Noon refresh loop: hardRefresh no longer re-enters recover; narrower error detection; less aggressive tab reloads
- 2026-09-03 — Runs reuse an existing Noon tab (or open one tab); no new browser window
- 2026-09-03 — Login: OTP+password same screen → password flow; OTP-only → stop; `preferPasswordLogin` in `02b-login-password.js`
- 2026-09-03 — Login sped up: scan-driven (no fixed waits); paste email/password; profile detects logged-out immediately
- 2026-09-03 — After login, user must click Connect extension to push JWT and onboard this Chrome (no auto-sync)
- 2026-09-03 — Dashboard login now syncs auth tokens to extension storage and the extension adds bearer auth to API calls
- 2026-09-03 — Live dashboard assets now use cache-busting query strings and `/` serves no-store to load fresh status JS
- 2026-09-03 — Live dashboard status: no-store extension status/heartbeat responses and admin fetches to avoid stale offline badge
- 2026-09-03 — Live dashboard API calls now use credentialed fetch so Cloudflare/browser cookies can pass
- 2026-09-03 — Live heartbeat follow-up: scoped active API pin with dashboard-start lock and cleanup on claim/run exit
- 2026-09-03 — Extension heartbeat pings local and live dashboard domain; dashboard run routing clears after completion
- 2026-09-03 — Login fix: batch opens/resets to profile, detects Noon email-link lockout as manual login required, and reduces login waits
- 2026-09-03 — Extension popup simplified to dashboard-only notice; removed all popup inputs/actions
- 2026-09-03 — Dashboard UI: removed Login only (test) control; runs now send login_only=false
- 2026-09-03 — Redeem fix: preserved accountVerified into batch redeem/resume and wait for Redeem Giftcards before failing
- 2026-09-03 — Batch redeem: removed duplicate profile checks after row login; fixed credits screenshot prep to stay on credits page
- 2026-09-03 — Logout: click Hi menu → Sign out only (no cookie wipe fallback)
- 2026-09-03 — CRITICAL: logout keyed on profile email (not Hi,); cookie wipe fallback; previousEmail kept across rows; single ensure/login per row
- 2026-09-03 — Fix: CLEAR_BATCH_FLOW no longer aborts flow (was false "Login cancelled"); hard account switch + verify before login success
- 2026-09-03 — OTP screen: if "Log in with password" exists → use it; only OTP-only → manual login error
- 2026-09-03 — After Continue: if no password field (OTP-only) → error "OTP is required — manual login required"
- 2026-09-03 — Navbar Log In click: resolve real control + elementFromPoint/PointerEvent so click registers
- 2026-09-03 — Account required: click navbar Log In (not LOGIN/SIGNUP); before_redeem only after session email verified
- 2026-09-03 — CRITICAL: always verify live Noon profile email == row email before redeem/order; refuse mismatch
- 2026-09-03 — Account switch: handle Account required gate + in-place login; harden on_failure screenshots
- 2026-09-03 — Dashboard "Login only (test)" toggle; capture On failure screenshot on stage fail
- 2026-09-03 — Dashboard "Hide Noon window" toggle; extension minimizes and briefly restores for screenshots
- 2026-09-03 — Redeem screenshots: wait for credits/balance load; after redeem refresh then capture (success or already redeemed)
- 2026-09-03 — MV3: chrome.alarms wake poller (setInterval dies when SW sleeps); `<all_urls>` for screenshots
- 2026-09-03 — Stop: clear activeRun pill immediately; skip late row patches when cancelled
- 2026-09-03 — Dashboard controls: upload, sample CSV, row select/run/stop, place-order + email toggles, delete; extension polls `/runs`
- 2026-09-03 — Dashboard moved to `http://127.0.0.1:8000/` (assets `/assets`)
- 2026-09-03 — Read-only admin UI at `/admin` (extension palette; batches/rows/emails/screenshots)
- 2026-09-03 — Email checkboxes (default off) + screenshot capture/upload + order_id from URL
- 2026-09-02 — Checkout: detect "Select Payment Method" → `payment_issue` status, skip row, retry on re-run
- 2026-09-02 — Backend URL moved from extension UI to `noon-extension/.env` (`VITE_API_BASE_URL`)
| FE-2 | — | — | — | — | idle |
| FE-3 | — | — | — | — | idle |

## Extension Journey (Complete History)

### Phase 1 — Scaffold & Login (initial build)

- Created `noon-extension/` mirroring `postsiva-extension` structure
- Stack: React + Vite + Tailwind side panel, MV3 manifest
- `public/content.js` — login flow ported from `backend/scripts/noon_login_flow.py`
- `public/mouse.js` — visible ghost cursor (move, click, type character-by-character)
- `public/background.js` — tab open/focus, message relay to content script
- `src/popup/App.tsx` — email + password form, Run/Cancel/Save, activity log
- Host permissions: `www.noon.com`, `account.noon.com`
- Build: `npm run build` → load `dist/` in chrome://extensions

### Phase 2 — Ghost Cursor UX

- Added human-like cursor movement with easing + random delays
- Click pulse animation + yellow ring on click
- Cursor modes experimented: arrow, hand on clickables, I-beam on inputs
- **User preference settled:** arrow pointer only (no hand icon); I-beam kept for text inputs
- Cancel button aborts flow mid-run via `CANCEL_LOGIN` message

### Phase 3 — Login Improvements

- Skip login when already logged in — detects `Hi,` greeting in header
- Skip login when already on `account.noon.com`
- Fixed password tab selectors (`Email address`, `Please enter your password` placeholders)
- Reduced unnecessary startup waits
- Network error handling with page refresh retry

### Phase 4 — Gift Card Redemption Flow

- Extended side panel: gift card number + PIN fields
- Extended `storage.ts` for all 4 credential fields
- Page-aware state machine via `detectPageState()`:
  - Only performs next step based on current page/popup
- Cross-page resume via `chrome.storage.local` (`noon_flow_state`, `noon_flow_done`)
- Background polls for flow completion across navigation

**Original navigation path (later removed):**
Homepage → click Orders in header → account dashboard → click noon Credits → credits page

**Issues fixed on this path:**
- noon Credits click stuck in loop — was clicking wrong element (`li` not `<a>`)
- Fixed with `findNoonCreditsLink()` + `clickNavLink()` + direct nav fallback
- After Orders click: 30ms wait + poll until dashboard sidebar ready

### Phase 5 — Credits Page & Modal Fixes

- **Redeem Giftcards not found** — `findMenuItemByText` only searched sidebar nav; bar is in main content
- Added `findClickableByText(text, scope)` — searches scoped DOM including `main`
- Added `findRedeemGiftcardsBar()` scoped to main content area
- **Popup loop bug** — modal open but kept clicking Redeem Giftcards again
- Added `findAddCreditsModal()` — detects `[role="dialog"]` with "Add Credits"
- Fixed `findGiftcardsVouchersOption()` to search inside modal, not sidebar
- `detectPageState()` checks modal **before** credits page state
- CREDITS_PAGE guard: skip Redeem click if modal already open
- After Redeem click: wait for Add Credits popup before next iteration

### Phase 6 — Direct Credits Navigation (latest)

- Removed Orders → noon Credits click path entirely
- Added `NOON_CREDITS = https://account.noon.com/uae-en/credits/`
- Added `goToCreditsPage()` — direct URL navigation after login
- Simplified states: removed `HOMEPAGE`, `ACCOUNT_PAGE` nav branches
- Flow: login (or skip) → direct credits URL → Redeem Giftcards → Giftcards & Vouchers → fill form

### Phase 7 — Ghost Cursor Visibility Fix

- Cursor disappeared after page navigation (orphaned DOM node)
- `ensureCursor()` now re-attaches to `document.body` if detached
- `show()` positions cursor at viewport center with forced opacity

## Known Issues / Next Steps

- [ ] Live E2E verification of full gift card flow after latest fixes
- [ ] Handle post-redeem success/error UI on Noon
- [ ] Split `content.js` if it keeps growing (currently ~1000 lines, over 350 cap)
- [ ] Tune wait timings if still flaky (30ms pauses + poll up to 12s)

## Recent Changes

- 2026-09-01 — Session detection: checkout/cart/product pages count as logged in; redeem navigates to credits from checkout
- 2026-09-01 — Fixed Add Credits modal detection + Giftcards & Vouchers click
- 2026-09-01 — Fixed Redeem Giftcards finder (main content scope)
- 2026-09-01 — Ghost cursor: pointer-only (no hand), re-attach after nav
- 2026-09-01 — 30ms wait + dashboard/credits page ready polling
- 2026-09-01 — Initial extension scaffold: login + ghost cursor + side panel
- 2026-09-01 — Gift card flow, page-aware state machine, cross-page resume
- 2026-09-01 — Ghost cursor visible entire flow (login, gift card, cart); persists across page reloads; larger yellow arrow
