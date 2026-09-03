from dataclasses import dataclass
from html import escape
from typing import Any


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    body_text: str
    body_html: str


def _fmt(value: Any) -> str:
    if value is None:
        return "—"
    return str(value)


def _html(value: Any) -> str:
    return escape(_fmt(value))


def render_template(template_key: str, context: dict[str, Any]) -> RenderedEmail:
    if template_key == "redeem_report":
        return _redeem_report(context)
    if template_key == "order_report":
        return _order_report(context)
    raise ValueError(f"Unknown email template: {template_key}")


def _redeem_report(ctx: dict[str, Any]) -> RenderedEmail:
    status = _fmt(ctx.get("redeem_status"))
    subject = f"Noon redeem {status} — row {ctx.get('row_number', '?')}"
    lines = [
        "Noon gift card redeem report",
        "",
        f"Email: {_fmt(ctx.get('email'))}",
        f"Row: {_fmt(ctx.get('row_number'))}",
        f"Redeem status: {status}",
        f"Redeemed at: {_fmt(ctx.get('redeemed_at'))}",
        f"Balance before: {_fmt(ctx.get('balance_before'))}",
        f"Balance after: {_fmt(ctx.get('balance_after'))}",
        f"Balance delta: {_fmt(ctx.get('balance_delta'))}",
        f"Gift card: {_fmt(ctx.get('gift_card_masked'))}",
        "",
        "Before/after balance screenshots are attached when available.",
    ]
    body_text = "\n".join(lines)
    body_html = (
        "<h2>Noon gift card redeem report</h2>"
        f"<p><b>Email:</b> {_html(ctx.get('email'))}<br>"
        f"<b>Row:</b> {_html(ctx.get('row_number'))}<br>"
        f"<b>Redeem status:</b> {_html(status)}<br>"
        f"<b>Redeemed at:</b> {_html(ctx.get('redeemed_at'))}<br>"
        f"<b>Balance before:</b> {_html(ctx.get('balance_before'))}<br>"
        f"<b>Balance after:</b> {_html(ctx.get('balance_after'))}<br>"
        f"<b>Balance delta:</b> {_html(ctx.get('balance_delta'))}<br>"
        f"<b>Gift card:</b> {_html(ctx.get('gift_card_masked'))}</p>"
        "<p>Before/after balance screenshots are attached when available.</p>"
    )
    return RenderedEmail(subject=subject, body_text=body_text, body_html=body_html)


def _order_report(ctx: dict[str, Any]) -> RenderedEmail:
    order_id = _fmt(ctx.get("order_id"))
    subject = f"Noon order {order_id} — row {ctx.get('row_number', '?')}"
    lines = [
        "Noon order success report",
        "",
        f"Email: {_fmt(ctx.get('email'))}",
        f"Row: {_fmt(ctx.get('row_number'))}",
        f"Order number: {order_id}",
        f"Product URL: {_fmt(ctx.get('product_url'))}",
        f"Purchased at: {_fmt(ctx.get('purchased_at'))}",
        "",
        "Order confirmation screenshot is attached when available.",
    ]
    body_text = "\n".join(lines)
    body_html = (
        "<h2>Noon order success report</h2>"
        f"<p><b>Email:</b> {_html(ctx.get('email'))}<br>"
        f"<b>Row:</b> {_html(ctx.get('row_number'))}<br>"
        f"<b>Order number:</b> {_html(order_id)}<br>"
        f"<b>Product URL:</b> {_html(ctx.get('product_url'))}<br>"
        f"<b>Purchased at:</b> {_html(ctx.get('purchased_at'))}</p>"
        "<p>Order confirmation screenshot is attached when available.</p>"
    )
    return RenderedEmail(subject=subject, body_text=body_text, body_html=body_html)
