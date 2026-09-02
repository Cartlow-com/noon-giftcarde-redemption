# Noon Chrome Extension

React + Vite + Tailwind side panel for Noon.com automation.

## Install

```bash
npm install
```

## Build

Set backend URL in `.env` (copy from `.env.example`), then build:

```bash
cp .env.example .env
# edit .env — set VITE_API_BASE_URL to your deployed backend (not localhost)
npm run build
```

Output goes to `dist/` — load that folder in Chrome.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this **`dist`** folder

## Develop

```bash
npm run dev
```

Rebuilds on file changes. Reload the extension in `chrome://extensions` after each build.

## Usage

1. Open the side panel from the extension icon
2. Fill in email, password, gift card number, and PIN
3. Click **Run automation**

Credentials are stored in `chrome.storage.local` on this device only.

## Related

- Project README: [../README.md](../README.md)
- Python reference: `../backend/scripts/noon_login_flow.py`
