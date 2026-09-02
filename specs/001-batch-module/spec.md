# Feature: Batch orders module

## Goal
Upload CSV batches via API; extension uploads files and views batch/row progress. No redeem verification yet.

## CSV columns
email, password, gift_card_number, gift_card_pin, product_url, quantity + optional status fields

## APIs
- POST /batches/upload
- GET /batches
- GET /batches/{id}
- GET /batches/{id}/rows
- GET /batches/rows/next?batch_id=
- PATCH /batches/rows/{row_id}
- DELETE /batches/{id}

## Per-row stages
login_status, redeem_status, purchase_status + overall status
