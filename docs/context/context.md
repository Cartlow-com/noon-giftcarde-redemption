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
│   │   ├── features/batches/BatchesPanel.tsx
│   │   ├── lib/api.ts         # Backend batch API client
│   │   ├── lib/config.ts      # API base URL storage
│   │   └── types.ts
│   └── dist/                # Load this in chrome://extensions
├── backend/
│   ├── app/modules/batches/   # CSV batch upload + row tracking APIs
│   ├── app/modules/login/     # JWT auth
│   └── seeders/users.example.csv
└── docs/context/            # Agent context (this folder)
```

## Module Status

| Module | Status | Notes |
|---|---|---|
| Login automation | ✅ Done | Skips if `Hi,` greeting detected |
| Ghost cursor | ✅ Done | Arrow default, I-beam on inputs; re-attaches after nav |
| Gift card redemption | ✅ Done | Direct credits URL flow |
| Cart checkout flow | 🟡 New | Add to cart → checkout → credits → confirm Place Order |
| Side panel UI | ✅ Done | Email, password, gift card #, PIN, Run/Cancel/Save |
| Cross-page resume | ✅ Done | `chrome.storage.local` flow state |
| Backend API | ✅ Done | FastAPI — login + batches |
| Batch upload/history UI | ✅ Done | Extension Batches tab |
| Batch runner (pull-next) | ✅ Done | Extension automation loop |
| Admin dashboard (read-only) | ✅ Done | FastAPI `/` — status, emails, screenshots |

## Gift Card Flow (current)

1. Login (or skip if already logged in)
2. **Direct nav** → `https://account.noon.com/uae-en/credits/`
3. Click **Redeem Giftcards** bar
4. In **Add Credits** popup → click **Giftcards & Vouchers**
5. Fill gift card number + PIN → click **REDEEM**

## Cart Flow (current)

1. Login (or skip)
2. Open product URL → **Add to Cart**
3. **View Cart** → **Checkout**
4. If noon One popup → **Continue to Checkout**
5. Toggle **Use my credits**
6. **Pause** — side panel asks user to confirm **Place Order**
7. If confirmed → click **Place Order** (polls until button appears)

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
cd backend && uv sync --extra dev && uv run python run.py
cd noon-extension && npm install && npm run build
# chrome://extensions → Load unpacked → select dist/
```
