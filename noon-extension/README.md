# Noon Chrome Extension

React + Vite + Tailwind side panel for Noon.com automation. Mirrors the structure of `postsiva-extension`.

## Setup

```bash
cd noon-extension
npm install
npm run build
```

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the **`dist`** folder
5. Click the extension icon — the **side panel** opens on the left

## Usage (login flow)

1. Open the side panel
2. Enter your Noon email and password
3. Click **Login to Noon**
4. The extension opens Noon with a **visible ghost cursor** — it moves to each button, clicks, and types into inputs character-by-character (Claude-style)

Credentials are stored in `chrome.storage.local` on this device only.

## Develop

```bash
npm run dev   # watch + rebuild
```

Reload the extension in `chrome://extensions` after changes.

## Related

- Python reference flow: `backend/scripts/noon_login_flow.py`
- Reference extension: `~/Documents/postsiva/postsiva-extension`
