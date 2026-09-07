import io

from conftest import login, login_super_admin

SAMPLE_CSV = """email,password,gift_card_number,gift_card_pin,product_url,quantity
a@b.com,secret,1111222233334444,1234,https://www.noon.com/uae-en/product/N1/p/,1
"""


def test_super_admin_sees_all_batches(client) -> None:
    user_headers = login(client)
    super_headers = login_super_admin(client)

    upload = client.post(
        "/batches/upload",
        headers=user_headers,
        files={"file": ("orders.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
    )
    assert upload.status_code == 201
    batch_id = upload.json()["batch"]["id"]

    listed = client.get("/batches", headers=super_headers)
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1
    ids = {b["id"] for b in listed.json()["batches"]}
    assert batch_id in ids
    match = next(b for b in listed.json()["batches"] if b["id"] == batch_id)
    assert match.get("owner_email") == "user@example.com"

    detail = client.get(f"/batches/{batch_id}", headers=super_headers)
    assert detail.status_code == 200
    assert detail.json()["owner_email"] == "user@example.com"
