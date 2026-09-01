# User Preferences

## Extension UX

- **Visible ghost cursor** during automation (Claude-style) — user wants to see what the bot is doing
- **Pointer only** — arrow cursor, no hand icon on clickables; I-beam OK on text inputs
- **Cancel button** — user can abort mid-flow
- **Skip login** when already logged in (`Hi,` in header)
- **Direct navigation** to credits page — no clicking Orders → noon Credits manually

## Credentials

- Stored in `chrome.storage.local` on device only (never committed)
- Fields: email, password, gift card number, PIN

## Workflow

- Follow Agent Workflow V6 triggers (`-q`, `-s`, `-l`, etc.)
- Do not auto-commit or auto-push git unless user asks

## Communication

- Short replies, bullet reports
- Code citations for existing code references
