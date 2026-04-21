from __future__ import annotations

import logging
import os
import smtplib
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

logger = logging.getLogger(__name__)


class BrevoEmailTool:
    """SMTP sender for Brevo (smtp-relay.brevo.com).

    Required env vars:
        BREVO_SMTP_KEY      — Brevo SMTP password/key (from Brevo dashboard)
        BREVO_SENDER_EMAIL  — Verified sender email address (used as SMTP username)
        BREVO_SENDER_NAME   — Display name for the From header (optional)
    """

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
        # Brevo SMTP username MUST be the verified sender email address, not "apikey"
        self.sender_email = sender_email or os.getenv("BREVO_SENDER_EMAIL", "")
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

        if not recipient or "@" not in recipient:
            return {
                "status": "failed",
                "delivery_status": "failed",
                "provider": "brevo-smtp",
                "recipient": recipient,
                "detail": "Recipient email is required and must be a valid address.",
            }

        if not self.smtp_key:
            logger.error("[BrevoEmailTool] BREVO_SMTP_KEY not configured")
            return {
                "status": "failed",
                "delivery_status": "failed",
                "provider": "brevo-smtp",
                "recipient": recipient,
                "detail": "Missing BREVO_SMTP_KEY in environment.",
            }

        if not chosen_from_email or "@" not in chosen_from_email:
            logger.error("[BrevoEmailTool] BREVO_SENDER_EMAIL not configured or invalid")
            return {
                "status": "failed",
                "delivery_status": "failed",
                "provider": "brevo-smtp",
                "recipient": recipient,
                "detail": "Missing or invalid BREVO_SENDER_EMAIL in environment.",
            }

        message = MIMEText(body, "plain")
        message["Subject"] = subject
        message["From"] = f"{chosen_from_name} <{chosen_from_email}>"
        message["To"] = recipient

        try:
            with smtplib.SMTP(self.SMTP_HOST, self.SMTP_PORT, timeout=20) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                # Brevo SMTP: username = sender email address, password = SMTP key
                smtp.login(chosen_from_email, self.smtp_key)
                smtp.sendmail(chosen_from_email, [recipient], message.as_string())

            logger.info("[BrevoEmailTool] Email sent to %s (subject: %r)", recipient, subject)
            return {
                "status": "sent",
                "delivery_status": "accepted",
                "provider": "brevo-smtp",
                "recipient": recipient,
                "detail": "Message accepted by Brevo SMTP relay.",
            }
        except smtplib.SMTPAuthenticationError as exc:
            logger.error(
                "[BrevoEmailTool] SMTP authentication failed — check BREVO_SMTP_KEY and BREVO_SENDER_EMAIL: %s", exc
            )
            return {
                "status": "failed",
                "delivery_status": "failed",
                "provider": "brevo-smtp",
                "recipient": recipient,
                "detail": f"SMTP auth failed: {exc}",
            }
        except Exception as exc:
            logger.error("[BrevoEmailTool] Failed to send email to %s: %s", recipient, exc)
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
