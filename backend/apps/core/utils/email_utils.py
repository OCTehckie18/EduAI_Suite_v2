import logging
import os
import smtplib
from contextlib import contextmanager
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    """True when real SMTP credentials are set (otherwise send_email only pretends to send)."""
    return bool(os.getenv("SMTP_USER") and os.getenv("SMTP_PASSWORD"))


def _settings():
    return (
        os.getenv("SMTP_SERVER", "smtp.gmail.com"),
        int(os.getenv("SMTP_PORT", 587)),
        os.getenv("SMTP_USER"),
        os.getenv("SMTP_PASSWORD"),
    )


def _open():
    host, port, user, password = _settings()
    server = smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT)
    server.starttls()
    server.login(user, password)
    return server


SMTP_TIMEOUT = 20  # seconds; a stuck mail server must not hold a request forever


@contextmanager
def smtp_connection():
    """One signed-in SMTP connection for a batch of mails (None when email is not configured or cannot connect).

    Sending a class mail used to open, sign in and close a new connection for every student.
    """
    if not email_configured():
        yield None
        return
    try:
        server = _open()
    except Exception as e:  # noqa: BLE001
        logger.error("Could not connect to the mail server: %s", e)
        yield None
        return
    try:
        yield server
    finally:
        try:
            server.quit()
        except Exception:  # noqa: BLE001
            pass


def send_email(to_email: str, subject: str, body: str, connection=None) -> bool:
    """Send one HTML email. With ``connection`` (from ``smtp_connection``) it reuses that connection,
    and if the shared connection fails it retries once on a fresh one."""
    _host, _port, smtp_user, smtp_password = _settings()

    if not smtp_user or not smtp_password:
        logger.warning("SMTP credentials not set. Mocking email to %s", to_email)
        logger.info("Subject: %s", subject)
        logger.info("Body preview: %s", body[:50])
        return True

    msg = MIMEMultipart()
    msg['From'] = smtp_user
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'html'))

    if connection is not None:
        try:
            connection.send_message(msg)
            return True
        except Exception as e:  # noqa: BLE001 - fall through to a fresh connection
            logger.warning("Shared mail connection failed for %s (%s); retrying on a new one", to_email, e)
    try:
        server = _open()
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, e)
        return False
