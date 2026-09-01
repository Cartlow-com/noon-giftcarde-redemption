# Noon Automation — Project Context

## Overview

Chrome extension + Python backend for automating Noon.com login and gift card redemption on UAE storefront (`uae-en`).

## Stack

| Layer | Tech |
|---|---|
| Extension UI | React 18, Vite, Tailwind, TypeScript |
| Extension runtime | Chrome MV3 — side panel, content scripts, service worker |
| Backend reference | Python + Playwright (`backend/scripts/noon_login_flow.py`) |
| Reference extension | `~/Documents/postsiva/postsiva-extension` |

## Folder Structure

```
noon_automation/
├── noon-extension/          # Chrome extension (primary deliverable)
│   ├── public/              # MV3 assets copied to dist/
│   │   ├── manifest.json
│   │   ├── content.js       # Login + gift card automation (~1000 lines)
│   │   ├── mouse.js         # Visible ghost cursor
│   │   └── background.js    # Tab mgmt, message relay, flow resume
│   ├── src/
│   │   ├── popup/App.tsx    # Side panel UI
│   │   ├── lib/storage.ts   # chrome.storage.local
│   │   └── types.ts
│   └── dist/                # Load this in chrome://extensions
├── backend/
│   └── scripts/noon_login_flow.py   # Original Playwright reference flow
└── docs/context/            # Agent context (this folder)
```

## Module Status

| Module | Status | Notes |
|---|---|---|
| Login automation | ✅ Done | Skips if `Hi,` greeting detected |
| Ghost cursor | ✅ Done | Arrow default, I-beam on inputs; re-attaches after nav |
| Gift card redemption | 🟡 In progress | Flow built; needs live E2E verification |
| Side panel UI | ✅ Done | Email, password, gift card #, PIN, Run/Cancel/Save |
| Cross-page resume | ✅ Done | `chrome.storage.local` flow state |
| Post-redeem handling | ⬜ Not started | Success/error UI feedback TBD |

## Gift Card Flow (current)

1. Login (or skip if already logged in)
2. **Direct nav** → `https://account.noon.com/uae-en/credits/`
3. Click **Redeem Giftcards** bar
4. In **Add Credits** popup → click **Giftcards & Vouchers**
5. Fill gift card number + PIN → click **REDEEM**

## Page State Machine

| State | Detection | Action |
|---|---|---|
| `NOT_LOGGED_IN` | No `Hi,` greeting | Error — must login first |
| `LOGGED_IN` | `Hi,` on homepage | Navigate to credits URL |
| `CREDITS_PAGE` | URL contains `/credits` | Click Redeem Giftcards |
| `ADD_CREDITS_MODAL` | Dialog with "Add Credits" | Click Giftcards & Vouchers |
| `REDEEM_FORM` | Gift card number input visible | Type card + PIN, submit |

## Key URLs

- Homepage: `https://www.noon.com/uae-en/`
- Credits: `https://account.noon.com/uae-en/credits/`

## Build & Load

```bash
cd noon-extension && npm install && npm run build
# chrome://extensions → Load unpacked → select dist/
```
