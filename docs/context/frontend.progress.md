# Frontend Progress — Noon Chrome Extension

## Active Tasks

| Slot | Agent | Trigger | Spec | Task | Status |
|---|---|---|---|---|---|
| FE-1 | — | — | — | — | idle |

## Recent Changes
- 2026-10-08 — Add to cart fixes: Noon keeps a collapsed quick-cart drawer ("Added to cart" + VIEW CART) on every product page → bot thought items were added; now VIEW CART must be on screen and the add is confirmed by `[data-qa=btn_cart_count]` rising (one safe re-click if unchanged); first click is a full pointer click (bare click() ignored on some products); cart empty uses `[data-qa=cart-remove_item]` only (cart page has no <main>); ghost-cursor moves can't freeze in a background tab (rAF) — cause of the intermittent 4-min hangs
- 2026-10-09 — **Dry run** (renamed from Cart test; still `cart_test` on runs): adds a redeem-form step — background verifies session email, opens Credits, `RUN_BATCH_REDEEM_DRYRUN` → `runRedeemFormDryRun` (Redeem Giftcards → Giftcards & Vouchers → type number + PIN → verify values + Redeem enabled → close modal, **never clicks Redeem**, never persists resume state). Then cart → checkout → stop → empty cart. Row note "Dry run OK — redeem form filled (not submitted)…"; a form failure marks purchase_status `failed`
- 2026-10-08 — **Cart test** run mode (dashboard checkbox; `cart_test` on runs): login → add to cart → coupon → checkout → stop before Place order → empty cart (`cartTest.js`, `content/13a-cart-empty.js`); no redeem, no order; row purchase_status `cart_ok`. Live: rows 16 (pen) & 17 (water) — added, checkout reached, stopped before Place order, cart emptied, nothing redeemed/ordered
- 2026-10-07 — 12s pause between rows (ROW_PACING_MS): full 20-row login-only run **20/20** in 12.1 min, no "Too many requests" (was 18/20 unpaced)
- 2026-10-07 — Full 20-row login-only run: 18/20 OK in ~6 min (~18s/row); rows 9 & 20 blocked by Noon "Too many requests" (client/IP-level limit after ~18–20 logins). Added: dashboard wakes extension on Run (start delay ~30s → 0s); resume tolerates post-logout redirect; resume point saved before post-login profile nav; one same-OTP retry after 30s; rate-limited rows re-queued once after 2-min cooldown; 4-min login-step watchdog; live row trace in NOON_EXT_PING
- 2026-10-07 — Run ends with a best-effort sign-out (`RUN_BATCH_LOGOUT`, in run teardown, 30s cap); OTP screen detected right after Continue (was fixed ~8s wait) → logins ~13–18s instead of ~20–26s. Kept the 1s post-sign-out pause (Noon redirect race)
- 2026-10-07 — Account switch: a clearly logged-out profile page is trusted over the remembered previous email (rows after a sign-out failed with "Account menu not found"); sign-out is a no-op when already logged out; runner drops the stale session email when a login fails. Live: rows 12–16 login-only all succeeded, 1 OTP each
- 2026-10-07 — Server lock + selector: side panel "Server" card (Production / Local / Custom, Pin) via `serverSettings.js`; dashboards can't switch the extension's server during an active run or away from a pinned server; switching server clears the token (reconnect from that dashboard)
- 2026-10-06 — **First successful live login (row 17, login-only)**: 1 Continue → 1 OTP → read from Gmail feed in ~2s → logged in at +16s
- 2026-10-06 — Account menu is a toggle: click once, re-click only if not open (old code relied on odd total click count; broke after single-click fix)
- 2026-10-06 — Unlock: wait for an unlock email newer than the lockout (feed) before searching; rate-limited login not retried from profile
- 2026-10-06 — Regression-review fixes: OTP freshness measured from the Continue click (5s grace; backend `grace_ms`, default 30s unchanged); resumed login re-arms resume before profile navigation + runFlowStep re-sends a lost step once; account check clears stale flow-done marker; dashboard legacy-status fallback + `unconfirmed` badge style
- 2026-10-05 — Review fixes: session-email assert fails closed; order without confirmation → `unconfirmed` (never auto re-ordered); waitForTabComplete bounded/rejects on closed tab; OTP link must be noon.com; auth bridge trusts sender origin only; runPoller busy flag can't stick; dashboard badge class sanitised
- 2026-10-05 — Per-row step trace (timestamped LOGIN_PROGRESS/BATCH_PROGRESS) saved into the attempt `message` for diagnosis
- 2026-10-05 — **Ghost-mouse click fired twice** (synthetic click + target.click()) → every Continue sent 2 OTPs (root cause of "Too many requests"/lockouts), submits doubled; now exactly one click
- 2026-10-05 — Duplicate step guard: background never re-sends RUN_BATCH_* while a flow state is active (returns pending); content ignores RUN_BATCH_* while flow running
- 2026-10-05 — OTP: polls every 2s (first check 1.5s) instead of fixed 10s wait; backend Gmail API first, else Gmail unread Atom feed (`/mail/u/<base>/feed/atom`, exact timestamps, no tab). Unlock link fallback: Gmail search tab opened directly on results (`gmailTab.js`)
- 2026-10-05 — Rotation switched off → login stops with Noon's real error ("… — proxy rotation is switched off, not retrying") instead of cycling proxies
- 2026-10-05 — Proxy-error handler: claims synchronously (burst = one rotation), stays claimed until reloaded tab settles, re-arms `noon_flow_state.resumeOnLoad`; unexpected row throw → row failed + attempt closed, run continues
- 2026-10-05 — `chrome.proxy.onProxyError` (ERR_TUNNEL_CONNECTION_FAILED etc.): block dead proxy, rotate (max 3/row) or go DIRECT, reload Noon tab; proxy cleared on SW start, after every row (finally) and at run teardown (finally)
- 2026-10-05 — Fixed PAC syntax error (proxy rotation was a silent no-op); no DIRECT fallback for Noon; SOCKS5 support; `tests/noonProxyUnlock.test.cjs`
- 2026-10-05 — Noon lockout ("Too many failed attempts"): fetch unlock link via Gmail API, open in background tab (`unlockTab.js`), retry login once
- 2026-10-05 — Full project review on branch `fix/project-review`; findings in `claude-docs/project-review-2026-10-05.md`
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
