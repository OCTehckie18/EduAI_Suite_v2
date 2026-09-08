"""
Role Detection Utility
Determines user role based on email domain patterns.
"""
import os


def detect_role_from_email(email: str) -> str:
    """
    Detect intended role from an email address.
    """
    email = email.strip().lower()
    teacher_domain = os.getenv("TEACHER_EMAIL_DOMAIN", "university.in")
    admin_emails = set(
        e.strip().lower()
        for e in os.getenv("ADMIN_EMAILS", "admin@eduai.suite").split(",")
        if e.strip()
    )

    if email in admin_emails:
        return "admin"

    parts = email.split("@")
    if len(parts) != 2:
        return "student"

    domain = parts[1]

    if domain == teacher_domain:
        return "teacher"

    if domain.endswith(f".{teacher_domain}"):
        return "student"

    return "student"
