from django.db import models


class PromptSuggestion(models.Model):
    class Audience(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        TEACHER = "TEACHER", "Teacher"

    audience = models.CharField(max_length=20, choices=Audience.choices, db_index=True)
    text = models.CharField(max_length=255)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["audience", "sort_order", "id"]

    def __str__(self):
        return f"{self.audience}: {self.text}"
