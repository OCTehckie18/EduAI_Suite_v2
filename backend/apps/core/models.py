from django.db import models
from django.utils import timezone

class SoftDeleteQuerySet(models.QuerySet):
    def delete(self):
        """Bulk soft delete: mark active records as inactive."""
        return self.update(is_active=False, deleted_at=timezone.now())

    def hard_delete(self):
        """Permanent deletion strictly for testing/cleanup."""
        return super().delete()

    def active(self):
        return self.filter(is_active=True)

    def inactive(self):
        return self.filter(is_active=False)

class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        """Default manager returns only active records."""
        return SoftDeleteQuerySet(self.model, using=self._db).filter(is_active=True)

class AllObjectsManager(models.Manager):
    """Manager that includes all records (both active and soft-deleted)."""
    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db)

class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class SoftDeleteModel(TimeStampedModel):
    """
    Base model implementing Dr. Alwin Joseph CU's requirement:
    No database rows are dropped. Delete sets is_active=False and records deleted_at.
    """
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Soft-delete status flag: False indicates deleted/inactive"
    )
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # Managers
    objects = SoftDeleteManager()        # Default manager (active only)
    all_objects = AllObjectsManager()    # Administrative manager (all records)

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False):
        """Soft delete: update status flag and timestamp instead of database drop."""
        self.is_active = False
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_active', 'deleted_at', 'updated_at'])

    def hard_delete(self, using=None, keep_parents=False):
        """Permanent removal from database (for tests)."""
        super().delete(using=using, keep_parents=keep_parents)

    def restore(self):
        """Re-activate a soft-deleted item."""
        self.is_active = True
        self.deleted_at = None
        self.save(update_fields=['is_active', 'deleted_at', 'updated_at'])


class ActionHistory(models.Model):
    feature = models.CharField(max_length=100, blank=True, null=True)
    action = models.CharField(max_length=100, blank=True, null=True)
    reaction = models.CharField(max_length=100, blank=True, null=True)
    result = models.CharField(max_length=100, blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    user_id = models.CharField(max_length=100, blank=True, null=True)
    metadata_json = models.JSONField(blank=True, null=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.feature}] {self.action} ({self.result})"

