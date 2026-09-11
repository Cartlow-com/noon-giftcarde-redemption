# Tasks: Auto-connect extension

- [x] Spec written

## auth-extension.js
- [ ] Add `RETRY_FLAG` constant `"noon_retry_connect"`
- [ ] Add `autoConnect()` — silent version: calls `connectExtension()` internally, swallows all errors, no UI toasts
- [ ] Add `connectWithReload()` — ping first; if not installed show error + return; if installed try connect; on failure set `sessionStorage` flag + `window.location.reload()`
- [ ] Export `autoConnect` and `connectWithReload` from the `attach()` return value

## auth.js
- [ ] Destructure `autoConnect` and `connectWithReload` from `extension`
- [ ] In `loadSession()`: after `hideLogin()` + `renderSession()`, check `sessionStorage` for retry flag — if set, remove it and call `connectExtension()` (full, with feedback); else call `autoConnect()` (silent)
- [ ] Button click handler: replace `connectExtension()` call with `connectWithReload()`

## index.html
- [ ] Bump `auth-extension.js` version string → `20260910-auto-connect`
- [ ] Bump `auth.js` version string → `20260910-auto-connect`
