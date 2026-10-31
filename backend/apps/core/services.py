from django.utils import timezone

from apps.core.models import StudentActivity


def record_student_activity(
    *, student_id: int, activity_type: str, source_id: str, title: str,
    score=None, status: str = "completed", occurred_at=None,
):
    """Store only the values required by classroom student views."""
    if not student_id:
        return None
    activity, _ = StudentActivity.objects.update_or_create(
        student_id=student_id,
        activity_type=activity_type,
        source_id=str(source_id),
        defaults={
            "title": title[:255],
            "score": score,
            "status": status[:50],
            "occurred_at": occurred_at or timezone.now(),
        },
    )
    return activity
