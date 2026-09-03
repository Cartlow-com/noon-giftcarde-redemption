# Contracts: auth & tenancy API deltas

## Auth (existing, enforced)

### POST /login
Request: `{ "email", "password" }`  
Response 201: `{ access_token, refresh_token, token_type }`

### GET /login/me
Header: `Authorization: Bearer <access>`  
Response: session including `user_id`, `email`, and **`role`** (add to response)

## Users (new — admin)

### POST /users
Auth: admin  
Body: `{ "email", "password", "role?": "operator" }`  
201: `{ id, email, role, is_active, created_at }`

### GET /users
Auth: admin  
200: `{ users: [ ... ] }`

## Runs (behavior change)

### POST /runs
- Requires auth
- Sets `user_id` from token
- Rejects if **this user** already has an active run
- Requires **this user** extension online

### GET /runs/pending
- Returns oldest queued run for **this user** only
- Touches **this user** presence

### POST /runs/extension/heartbeat
- Upserts presence for **this user**

### GET /runs/extension/status
- `online` for **this user** only (auth required)

### claim / stop / patch / get
- 404 if run not owned by caller

## Batches (behavior change)

All upload/list/get/rows/patch/delete/screenshots/notify:
- Require auth
- Filter or ownership-check by `user_id`
- Upload sets `user_id` from token

## Public

- `GET /health`
- `GET /` dashboard HTML/assets (JS handles login gate)
- `POST /login`, `POST /login/refresh`
