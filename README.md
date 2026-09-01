# Noon Automation

Chrome extension that automates Noon.com login and gift card redemption with a visible ghost cursor.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (includes npm)
- Google Chrome

## Install

```bash
cd noon-extension
npm install
```

## Build

```bash
cd noon-extension
npm run build
```

This outputs the extension to `noon-extension/dist/`.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `noon-extension/dist` folder
5. Click the extension icon in the toolbar to open the **side panel**

## Develop (auto-rebuild on save)

```bash
cd noon-extension
npm run dev
```

After each rebuild, go to `chrome://extensions` and click **Reload** on the Noon Automation extension.

## Usage

1. Open the side panel
2. Enter your **email**, **password**, **gift card number**, and **PIN**
3. Click **Save settings** (optional — stores locally on this device)
4. Click **Run automation**

The extension will:

1. Log in to Noon (skips if already logged in)
2. Go directly to the noon Credits page
3. Click **Redeem Giftcards** → **Giftcards & Vouchers**
4. Fill in the gift card details and submit

Click **Cancel** at any time to stop the automation.

## Project structure

```
noon_automation/
├── noon-extension/     # Chrome extension (React + Vite)
│   ├── public/         # Content scripts, manifest, background worker
│   ├── src/            # Side panel React UI
│   └── dist/           # Built extension — load this in Chrome
├── backend/            # Python Playwright reference script
└── docs/context/       # Project docs for agents
```

## Related

- Extension details: [noon-extension/README.md](noon-extension/README.md)
- Python reference flow: `backend/scripts/noon_login_flow.py`
- Agent context: `docs/context/context.md`
