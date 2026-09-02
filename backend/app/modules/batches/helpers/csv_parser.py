import csv
import io
from dataclasses import dataclass

REQUIRED_COLUMNS = (
    "email",
    "password",
    "gift_card_number",
    "gift_card_pin",
    "product_url",
    "quantity",
)


@dataclass
class ParsedCsvRow:
    row_number: int
    email: str
    password: str
    gift_card_number: str
    gift_card_pin: str
    product_url: str
    quantity: int


def parse_orders_csv(content: bytes) -> list[ParsedCsvRow]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")

    normalized_headers = {name.strip().lower(): name for name in reader.fieldnames}
    missing = [col for col in REQUIRED_COLUMNS if col not in normalized_headers]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    rows: list[ParsedCsvRow] = []
    for index, raw in enumerate(reader, start=1):
        if not any((value or "").strip() for value in raw.values()):
            continue

        email = (raw.get(normalized_headers["email"]) or "").strip()
        password = (raw.get(normalized_headers["password"]) or "").strip()
        gift_card_number = (raw.get(normalized_headers["gift_card_number"]) or "").strip()
        gift_card_pin = (raw.get(normalized_headers["gift_card_pin"]) or "").strip()
        product_url = (raw.get(normalized_headers["product_url"]) or "").strip()
        quantity_raw = (raw.get(normalized_headers["quantity"]) or "1").strip()

        if not email or not password:
            raise ValueError(f"Row {index}: email and password are required")
        if not gift_card_number or not gift_card_pin:
            raise ValueError(f"Row {index}: gift card number and PIN are required")
        if not product_url:
            raise ValueError(f"Row {index}: product_url is required")

        try:
            quantity = int(quantity_raw)
        except ValueError as exc:
            raise ValueError(f"Row {index}: quantity must be an integer") from exc
        if quantity < 1:
            raise ValueError(f"Row {index}: quantity must be at least 1")

        rows.append(
            ParsedCsvRow(
                row_number=index,
                email=email,
                password=password,
                gift_card_number=gift_card_number,
                gift_card_pin=gift_card_pin,
                product_url=product_url,
                quantity=quantity,
            )
        )

    if not rows:
        raise ValueError("CSV contains no data rows")

    return rows
