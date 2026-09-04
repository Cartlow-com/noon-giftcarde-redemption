# Task: Critique v2 remaining fixes (-all)

## Scope

1. Ownership default-closed (`user_id` required on ownership + list/run queries)
2. Attempt at row start + PATCH finish; do not swallow attempt errors silently (log + rethrow soft warn)
3. `BatchRowResponse` without `password`/`gift_card_pin`; `BatchRowWorkResponse` for get-row + next only
4. Optional CSV `face_value`; store on row; warn/flag when `balance_delta` mismatches
5. Purge tracked live CSVs; replace `orders.example.csv` with fake sample
6. Rename `02b-login-password.js` → `03a-login-password.js` (sorts between 03 and 03b)
7. Delete dead `noon-extension/src/features/batches/`
