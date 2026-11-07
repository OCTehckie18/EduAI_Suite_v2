from django.conf import settings
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

    def restore_blockers(self):
        """Soft-deleted parents that must be restored before this record can be."""
        blockers = []
        for field in self._meta.concrete_fields:
            if not field.is_relation or not field.many_to_one:
                continue
            related_model = field.related_model
            if not hasattr(related_model, "all_objects") or related_model is type(self):
                continue
            parent = getattr(self, field.name, None)
            if parent is not None and parent.is_active is False:
                blockers.append(f"{related_model.__name__}: {parent}")
        return blockers

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


class StudentActivity(models.Model):
    """Compact, display-ready record of a student learning event."""

    ACTIVITY_TYPES = (
        ("assignment", "Assignment"),
        ("exam", "Exam"),
        ("game", "Game"),
        ("lesson", "Lesson"),
    )

    student_id = models.IntegerField(db_index=True)
    source_id = models.CharField(max_length=100)
    activity_type = models.CharField(max_length=30, choices=ACTIVITY_TYPES)
    title = models.CharField(max_length=255)
    score = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=50, blank=True)
    occurred_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ["-occurred_at"]
        indexes = [models.Index(fields=["student_id", "-occurred_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["student_id", "activity_type", "source_id"],
                name="unique_student_activity_source",
            ),
        ]

    def __str__(self):
        return f"{self.student_id}: {self.activity_type} - {self.title}"



class Notification(models.Model):
    """Something that happened that one person should know about. Shown under the bell."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=30)  # grade, announcement, form, exam, board
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500, blank=True)
    link = models.CharField(max_length=200, blank=True)  # a path inside the app
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "read_at"])]
