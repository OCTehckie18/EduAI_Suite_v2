from django.db import models
from apps.classrooms.models import Classroom


class Lesson(models.Model):
    course = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="lessons")
    title = models.CharField(max_length=255, blank=True, null=True)
    topic = models.CharField(max_length=255, blank=True, default="")
    syllabus_context = models.TextField(blank=True, null=True)
    lecture_flow = models.TextField(blank=True, null=True)
    examples = models.TextField(blank=True, null=True)
    activities = models.TextField(blank=True, null=True)
    quiz_questions = models.TextField(blank=True, null=True)
    created_by = models.IntegerField(default=0)
    posted_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title or self.topic} ({self.course})"
