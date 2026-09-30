from datetime import datetime

from pydantic import BaseModel


class GmailStatusResponse(BaseModel):
    connected: bool
    gmail_email: str = ""


class GmailEmailItem(BaseModel):
    message_id: str
    subject: str
    from_email: str
    date: str
    snippet: str


class GmailEmailsResponse(BaseModel):
    emails: list[GmailEmailItem]
