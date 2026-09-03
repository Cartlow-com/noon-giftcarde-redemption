import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

from app.config.settings import settings


def send_raw_email(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    attachment_paths: list[str] | None = None,
) -> None:
    if not settings.FAILOVER_MAIL_HOST:
        raise ValueError("SMTP host is not configured (FAILOVER_MAIL_HOST)")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{settings.FAILOVER_MAIL_FROM_NAME} <{settings.FAILOVER_MAIL_FROM_ADDRESS}>"
    msg["To"] = to_email
    msg.set_content(body_text or "")
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    for path_str in attachment_paths or []:
        path = Path(path_str)
        if not path.is_file():
            continue
        data = path.read_bytes()
        maintype, subtype = "application", "octet-stream"
        if path.suffix.lower() == ".png":
            maintype, subtype = "image", "png"
        elif path.suffix.lower() in {".jpg", ".jpeg"}:
            maintype, subtype = "image", "jpeg"
        msg.add_attachment(
            data,
            maintype=maintype,
            subtype=subtype,
            filename=path.name,
        )

    host = settings.FAILOVER_MAIL_HOST
    port = settings.FAILOVER_MAIL_PORT
    username = settings.FAILOVER_MAIL_USERNAME
    password = settings.FAILOVER_MAIL_PASSWORD.strip('"')
    encryption = (settings.FAILOVER_MAIL_ENCRYPTION or "tls").lower()

    if encryption == "ssl":
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=context) as server:
            if username:
                server.login(username, password)
            server.send_message(msg)
        return

    with smtplib.SMTP(host, port, timeout=30) as server:
        server.ehlo()
        if encryption == "tls":
            context = ssl.create_default_context()
            server.starttls(context=context)
            server.ehlo()
        if username:
            server.login(username, password)
        server.send_message(msg)
