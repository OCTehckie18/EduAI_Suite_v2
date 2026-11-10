from django.conf import settings
from django.db import models


class CalendarEvent(models.Model):
    title = models.CharField(max_length=255, default="")
    description = models.TextField(blank=True, null=True)
    start_time = models.DateTimeField(blank=True, null=True)
    end_time = models.DateTimeField(blank=True, null=True)
    event_type = models.CharField(max_length=50, default="custom")
    color = models.CharField(max_length=50, default="#0b4a87")
    location = models.CharField(max_length=255, blank=True, null=True)
    is_all_day = models.BooleanField(default=False)
    recurrence = models.CharField(max_length=100, blank=True, null=True)
    teacher_name = models.CharField(max_length=255, blank=True, null=True)
    student_email = models.CharField(max_length=255, blank=True, null=True)
    course_id = models.IntegerField(blank=True, null=True)
    google_event_id = models.CharField(max_length=255, blank=True, null=True)
    google_calendar_id = models.CharField(max_length=255, blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="calendar_events",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["start_time", "-id"]

    def __str__(self):
        return f"{self.title} ({self.event_type})"


class GoogleCalendarLink(models.Model):
    """A user's connection to their Google account, used to keep a separate EduAI calendar up to date."""

    class Status(models.TextChoices):
        CONNECTED = "connected", "Connected"
        ERROR = "error", "Error"
        REVOKED = "revoked", "Revoked"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="google_calendar_link")
    # Encrypted with the CALENDAR_TOKEN_KEY; never sent to a browser or written to a log.
    refresh_token = models.TextField()
    calendar_id = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CONNECTED)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Google Calendar link of {self.user_id} ({self.status})"


class GoogleCalendarItem(models.Model):
    """Which calendar item (by its stable feed id) is which Google event, and what was last sent."""

    link = models.ForeignKey(GoogleCalendarLink, on_delete=models.CASCADE, related_name="items")
    uid = models.CharField(max_length=100)
    google_event_id = models.CharField(max_length=255)
    content_hash = models.CharField(max_length=64)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["link", "uid"], name="unique_google_item_per_link")]


class CalendarSyncRequest(models.Model):
    """The outbox: a user whose calendar changed and must be sent to Google. One row per user."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="calendar_sync_request")
    requested_at = models.DateTimeField(auto_now=True)
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["requested_at"]
