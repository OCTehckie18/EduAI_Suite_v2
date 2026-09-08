from django.db import models
from apps.classrooms.models import Classroom


class Assignment(models.Model):
    course = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    due_date = models.CharField(max_length=100, blank=True, null=True)
    max_points = models.IntegerField(default=100)
    media_path = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.course})"


class Submission(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="submissions")
    student_name = models.CharField(max_length=255, blank=True, null=True)
    file_path = models.TextField(blank=True, null=True)
    submitted_at = models.CharField(max_length=100, blank=True, null=True)
    grade = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Submission by {self.student_name} for {self.assignment}"
