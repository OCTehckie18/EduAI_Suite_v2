from django.db import models
from apps.classrooms.models import Classroom


class Announcement(models.Model):
    course = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="announcements")
    title = models.CharField(max_length=255, blank=True, null=True)
    body = models.TextField(blank=True, null=True)
    time = models.CharField(max_length=100, blank=True, null=True)
    pinned = models.BooleanField(default=False)
    attachment_path = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-pinned", "-created_at"]

    def __str__(self):
        return f"{self.title or 'Announcement'} ({self.course})"
