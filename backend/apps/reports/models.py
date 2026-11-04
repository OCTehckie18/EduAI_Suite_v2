from django.conf import settings
from django.db import models


class Report(models.Model):
    # The teacher who generated it. Reports from before ownership existed have no owner and are visible to admins only.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="reports"
    )
    report_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    type = models.CharField(max_length=100, blank=True, null=True)
    generated_at = models.DateTimeField(auto_now_add=True, db_index=True)
    status = models.CharField(max_length=50, default="ready")
    content = models.TextField(blank=True, null=True)
    target_id = models.IntegerField(blank=True, null=True)
    template_path = models.CharField(max_length=500, blank=True, null=True)
    docx_path = models.CharField(max_length=500, blank=True, null=True)

    class Meta:
        ordering = ["-generated_at"]

    def __str__(self):
        return f"{self.name or self.report_id} ({self.status})"
