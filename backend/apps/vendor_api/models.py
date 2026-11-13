from django.db import models


class VendorActionLog(models.Model):
    """What EduAI support did on this installation through the locked channel. Read-only for the university."""

    action = models.CharField(max_length=40)
    target_email = models.EmailField(blank=True)
    result = models.CharField(max_length=20, default="ok")
    detail = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
