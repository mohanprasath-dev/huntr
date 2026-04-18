from __future__ import annotations

import os
from pathlib import Path
import smtplib
from email.mime.text import MIMEText
from typing import Any

from dotenv import load_dotenv


class BrevoEmailTool:
    """SMTP sender for Brevo."""

    SMTP_HOST = "smtp-relay.brevo.com"
    SMTP_PORT = 587

    def __init__(
        self,
        smtp_key: str | None = None,
        sender_email: str | None = None,
        sender_name: str = "HuntR",
    ) -> None:
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=False)
        else:
            load_dotenv(override=False)

        self.smtp_key = smtp_key or os.getenv("BREVO_SMTP_KEY", "")
        self.sender_email = sender_email or os.getenv("BREVO_SENDER_EMAIL", "hello@huntr.ai")
        self.sender_name = os.getenv("BREVO_SENDER_NAME", sender_name)

    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        from_name: str,
        from_email: str,
    ) -> dict[str, Any]:
        recipient = str(to).strip()
        chosen_from_name = str(from_name or self.sender_name).strip() or self.sender_name
        chosen_from_email = str(from_email or self.sender_email).strip() or self.sender_email

        if not recipient:
            return {
                "status": "failed",
                "delivery_status": "failed",
                "provider": "brevo-smtp",
                "recipient": recipient,
                "detail": "Recipient email is required.",
            }

        if not self.smtp_key:
            return {
                "status": "failed",
                "delivery_status": "failed",
                "provider": "brevo-smtp",
                "recipient": recipient,
                "detail": "Missing BREVO_SMTP_KEY in environment.",
            }

        message = MIMEText(body, "plain")
        message["Subject"] = subject
        message["From"] = f"{chosen_from_name} <{chosen_from_email}>"
        message["To"] = recipient

        try:
            with smtplib.SMTP(self.SMTP_HOST, self.SMTP_PORT, timeout=20) as smtp:
                smtp.starttls()
                smtp.login("apikey", self.smtp_key)
                smtp.sendmail(chosen_from_email, [recipient], message.as_string())

            return {
                "status": "sent",
                "delivery_status": "accepted",
                "provider": "brevo-smtp",
                "recipient": recipient,
                "detail": "Message accepted by Brevo SMTP relay.",
            }
        except Exception as exc:
            return {
                "status": "failed",
                "delivery_status": "failed",
                "provider": "brevo-smtp",
                "recipient": recipient,
                "detail": str(exc),
            }


def send_email(
    to: str,
    subject: str,
    body: str,
    from_name: str,
    from_email: str,
) -> dict[str, Any]:
    """Send a plain-text email via Brevo SMTP and return delivery status metadata."""

    tool = BrevoEmailTool()
    return tool.send_email(
        to=to,
        subject=subject,
        body=body,
        from_name=from_name,
        from_email=from_email,
    )
