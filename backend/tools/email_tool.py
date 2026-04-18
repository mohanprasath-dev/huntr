from __future__ import annotations

import os
import smtplib
from email.mime.text import MIMEText
from typing import Any


class BrevoEmailTool:
    """SMTP sender for Brevo with safe dry-run mode by default."""

    SMTP_HOST = "smtp-relay.brevo.com"
    SMTP_PORT = 587

    def __init__(
        self,
        smtp_key: str | None = None,
        sender_email: str | None = None,
        sender_name: str = "HuntR",
    ) -> None:
        self.smtp_key = smtp_key or os.getenv("BREVO_SMTP_KEY", "")
        self.sender_email = sender_email or os.getenv("BREVO_SENDER_EMAIL", "hello@huntr.ai")
        self.sender_name = sender_name

    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        dry_run: bool = True,
    ) -> dict[str, Any]:
        if dry_run or not self.smtp_key:
            return {
                "status": "dry_run",
                "provider": "brevo-smtp",
                "recipient": to_email,
                "detail": "No email sent. Enable by setting dry_run=False and BREVO_SMTP_KEY.",
            }

        message = MIMEText(body, "plain")
        message["Subject"] = subject
        message["From"] = f"{self.sender_name} <{self.sender_email}>"
        message["To"] = to_email

        try:
            with smtplib.SMTP(self.SMTP_HOST, self.SMTP_PORT, timeout=20) as smtp:
                smtp.starttls()
                smtp.login("apikey", self.smtp_key)
                smtp.sendmail(self.sender_email, [to_email], message.as_string())

            return {
                "status": "sent",
                "provider": "brevo-smtp",
                "recipient": to_email,
                "detail": "Message accepted by Brevo SMTP relay.",
            }
        except Exception as exc:
            return {
                "status": "failed",
                "provider": "brevo-smtp",
                "recipient": to_email,
                "detail": str(exc),
            }
