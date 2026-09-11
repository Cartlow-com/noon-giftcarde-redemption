# Task: Auto-connect extension on dashboard load

## Goal
Remove the manual "Connect extension" friction. The dashboard should attempt to connect
the extension automatically after sign-in. If that fails, the user clicks "Connect extension"
and the dashboard reloads itself (injecting the bridge script) then retries automatically.
One reload maximum — no infinite loop.

## Requirements
1. After every successful `loadSession()`, attempt a silent auto-connect (no error toasts on failure).
2. On boot, if `sessionStorage` has the key `noon_retry_connect`, remove it and immediately attempt connect (post-reload retry).
3. The "Connect extension" button calls `connectWithReload()`:
   - First tries a normal connect.
   - If the bridge is not detected (extension not installed in this Chrome), show a real "not found" error — do NOT reload.
   - If the bridge is detected but the token push fails, reload once with the retry flag set, then auto-connect on the reloaded page.
4. After reload + retry fails again, show the real error — no second reload.
5. Super-admin users are unaffected (no extension connect UI shown for them).

## Flow

```
Page loads
    ↓
loadSession() succeeds
    ├── sessionStorage has "noon_retry_connect"?
    │       YES → remove flag → connectExtension() → show result
    │       NO  → autoConnect() silent (no error toast on fail)
    │
    └── Either way: show "Not connected" + button if not connected

User clicks "Connect extension"
    ↓
connectWithReload()
    ├── ping extension → not found → show error, stop (no reload)
    └── found → try token push
            ├── ok → ✅ connected
            └── fail → set sessionStorage flag → window.location.reload()
                            ↓
                    Page reloads → bridge injected → boot detects flag
                            ↓
                    connectExtension() fires automatically
                            ├── ok → ✅ connected
                            └── fail → show real error, stop
```

## Acceptance Criteria
- [ ] Opening the dashboard when already signed in + extension loaded → connects with no click
- [ ] Opening after fresh sign-in → same silent auto-connect
- [ ] Clicking "Connect extension" when bridge not injected → page reloads once, auto-connects
- [ ] Clicking when extension not installed → error shown, no reload
- [ ] No infinite reload loop under any failure scenario
- [ ] Super-admin view unchanged

## Files to Change
- `backend/app/static/admin/auth-extension.js` — add `autoConnect()`, `connectWithReload()`; export both
- `backend/app/static/admin/auth.js` — call `autoConnect()` after `loadSession()`; handle retry flag on boot; button calls `connectWithReload()`
- `backend/app/static/admin/index.html` — bump cache-bust version on both script tags
