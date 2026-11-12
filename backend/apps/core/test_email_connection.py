from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.core.utils import email_utils

SMTP_ENV = {"SMTP_USER": "school@example.com", "SMTP_PASSWORD": "app-password"}


class SharedConnectionTests(SimpleTestCase):
    @patch.dict("os.environ", SMTP_ENV)
    @patch("apps.core.utils.email_utils.smtplib.SMTP")
    def test_a_batch_signs_in_once(self, smtp):
        with email_utils.smtp_connection() as connection:
            for n in range(5):
                self.assertTrue(email_utils.send_email(f"s{n}@example.com", "Hello", "Body", connection=connection))
        self.assertEqual(smtp.call_count, 1)
        self.assertEqual(smtp.return_value.login.call_count, 1)
        self.assertEqual(smtp.return_value.send_message.call_count, 5)
        smtp.return_value.quit.assert_called_once()

    @patch.dict("os.environ", SMTP_ENV)
    @patch("apps.core.utils.email_utils.smtplib.SMTP")
    def test_a_dropped_connection_retries_on_a_fresh_one(self, smtp):
        shared = MagicMock()
        shared.send_message.side_effect = OSError("connection closed")
        self.assertTrue(email_utils.send_email("s@example.com", "Hello", "Body", connection=shared))
        smtp.return_value.send_message.assert_called_once()

    @patch.dict("os.environ", {"SMTP_USER": "", "SMTP_PASSWORD": ""})
    def test_without_settings_nothing_connects(self):
        with email_utils.smtp_connection() as connection:
            self.assertIsNone(connection)
