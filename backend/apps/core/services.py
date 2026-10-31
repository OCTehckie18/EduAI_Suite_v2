from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.core.models import StudentActivity


def student_key(user) -> str:
    """Canonical identifier stored on game/quiz players: the register number."""
    return (user.register_no or "").strip() or str(user.pk)


def student_keys(user) -> list:
    """Every value a player row may carry for this student (new and legacy)."""
    keys = {str(user.pk)}
    if user.register_no:
        keys.add(user.register_no.strip())
    return list(keys)


def resolve_student(identifier):
    """Map a stored player identifier (register number, or legacy account id) to a user."""
    value = str(identifier or "").strip()
    if not value:
        return None
    User = get_user_model()
    user = User.objects.filter(register_no__iexact=value).first()
    if user is None and value.isdigit():
        user = User.objects.filter(pk=int(value)).first()
    return user


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
