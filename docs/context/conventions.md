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
| Element finding | `findClickableByText(text, scope)` | Sidebar-scoped search misses main content/modals |

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

## File Size

- Hard cap 350 lines per source file — `content.js` is over (~1000 lines); candidate for split if it grows further

## Host Permissions

- `https://www.noon.com/*`
- `https://account.noon.com/*`
