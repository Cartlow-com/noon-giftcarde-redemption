# Frontend Progress — Noon Chrome Extension

## Active Tasks

| Slot | Agent | Trigger | Spec | Task | Status |
|---|---|---|---|---|---|
| FE-1 | — | — | — | — | idle |

## Recent Changes
- 2026-09-03 — Live dashboard assets now use cache-busting query strings and `/` serves no-store to load fresh status JS
- 2026-09-03 — Live dashboard status: no-store extension status/heartbeat responses and admin fetches to avoid stale offline badge
- 2026-09-03 — Live dashboard API calls now use credentialed fetch so Cloudflare/browser cookies can pass
- 2026-09-03 — Live heartbeat follow-up: scoped active API pin with dashboard-start lock and cleanup on claim/run exit
- 2026-09-03 — Extension heartbeat now pings local and live `redeem.cartlow.com`; dashboard run routing clears after completion
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
