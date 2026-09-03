# Quickstart: Multi-user auth

## 1. Seed users

```bash
cd backend
cp seeders/users.example.csv seeders/users.csv   # optional edits
# Ensure AUTH_REQUIRED=true in .env
echo 'AUTH_REQUIRED=true' >> .env
uv run python run.py
```

## 2. Default credentials

| Email | Password | Role |
|---|---|---|
| admin@example.com | admin123 | admin |
| user@example.com | password123 | operator |

## 3. Login (API)

```bash
curl -s -X POST http://127.0.0.1:8000/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

Use `access_token` as `Authorization: Bearer …` on `/batches` and `/runs`.

## 4. Dashboard

Open `http://127.0.0.1:8000/` (or live URL) → login form → work as usual.

## 5. Extension

No separate login. Open the dashboard **in the Chrome that has the extension**, sign in once — the page syncs the token into the extension. Heartbeats and run claims then use that user.

## 6. Two-operator smoke

1. Login as admin → create user B  
2. PC1: login A, upload CSV, run  
3. PC2: login B, upload CSV, run  
4. Confirm both runs active and lists are disjoint
