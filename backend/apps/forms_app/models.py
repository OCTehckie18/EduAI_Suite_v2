from django.conf import settings
from django.db import models

from apps.classrooms.models import Classroom


class Form(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        CLOSED = "CLOSED", "Closed"

    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="forms")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="forms_owned")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.title


class FormQuestion(models.Model):
    class Kind(models.TextChoices):
        SHORT = "short_text", "Short answer"
        PARAGRAPH = "paragraph", "Paragraph"
        CHOICE = "choice", "Multiple choice (one answer)"
        CHECKBOX = "checkbox", "Checkboxes (several answers)"

    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="questions")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    prompt = models.CharField(max_length=500)
    required = models.BooleanField(default=False)
    options = models.JSONField(default=list, blank=True)  # the choices, for choice and checkbox kinds
    sequence = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sequence", "id"]


class FormResponse(models.Model):
    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="responses")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="form_responses")
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["submitted_at", "id"]
        constraints = [models.UniqueConstraint(fields=["form", "student"], name="one_response_per_student")]


class FormAnswer(models.Model):
    response = models.ForeignKey(FormResponse, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(FormQuestion, on_delete=models.CASCADE, related_name="answers")
    text = models.TextField(blank=True)
    selected = models.JSONField(default=list, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["response", "question"], name="one_answer_per_question")]
