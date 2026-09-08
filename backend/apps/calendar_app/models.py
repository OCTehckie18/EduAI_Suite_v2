from django.db import models


class CalendarEvent(models.Model):
    title = models.CharField(max_length=255, default="")
    description = models.TextField(blank=True, null=True)
    start_time = models.DateTimeField(blank=True, null=True)
    end_time = models.DateTimeField(blank=True, null=True)
    event_type = models.CharField(max_length=50, default="custom")
    color = models.CharField(max_length=50, default="#264796")
    location = models.CharField(max_length=255, blank=True, null=True)
    is_all_day = models.BooleanField(default=False)
    recurrence = models.CharField(max_length=100, blank=True, null=True)
    teacher_name = models.CharField(max_length=255, blank=True, null=True)
    student_email = models.CharField(max_length=255, blank=True, null=True)
    course_id = models.IntegerField(blank=True, null=True)
    google_event_id = models.CharField(max_length=255, blank=True, null=True)
    google_calendar_id = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["start_time", "-id"]

    def __str__(self):
        return f"{self.title} ({self.event_type})"
