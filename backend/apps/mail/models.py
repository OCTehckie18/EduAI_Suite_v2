from django.conf import settings
from django.db import models


class MailDraft(models.Model):
    # The teacher who wrote it. Drafts from before ownership existed have no owner and are visible to admins only.
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="mail_drafts")
    subject = models.CharField(max_length=255, blank=True, null=True)
    body = models.TextField(blank=True, null=True)
    student_ids = models.JSONField(blank=True, null=True)
    conditions = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Draft: {self.subject}"


class MailHistory(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="mail_history")
    subject = models.CharField(max_length=255, blank=True, null=True)
    body = models.TextField(blank=True, null=True)
    sent_at = models.DateTimeField(auto_now_add=True, db_index=True)
    recipients = models.JSONField(blank=True, null=True)
    recipient_count = models.IntegerField(default=0)

    class Meta:
        ordering = ["-sent_at"]

    def __str__(self):
        return f"Sent: {self.subject} ({self.recipient_count} recipients)"
