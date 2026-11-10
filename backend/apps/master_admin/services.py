from django.apps import apps as django_apps
from django.contrib.contenttypes.models import ContentType

from apps.core.models import SoftDeleteModel


def soft_delete_models():
    """All non-abstract models implementing the universal soft-delete contract."""
    return [
        model for model in django_apps.get_models()
        if issubclass(model, SoftDeleteModel) and not model._meta.abstract
        and ".tests" not in model.__module__
    ]


def content_type_key(model):
    return f"{model._meta.app_label}.{model._meta.model_name}"


def model_for_key(key):
    """Resolve a 'app_label.model_name' key to its model class, or None."""
    if not key or "." not in key:
        return None
    app_label, model_name = key.split(".", 1)
    try:
        model = ContentType.objects.get_by_natural_key(
            app_label, model_name).model_class()
    except ContentType.DoesNotExist:
        return None
    if model is None or not issubclass(model, SoftDeleteModel):
        return None
    return model


# ---------------------------------------------------------------------------
# Restoring with edits
# ---------------------------------------------------------------------------

# The fields a master admin may change while restoring (or on a record that is in the way).
# Anything not listed here is ignored, so a request can never touch other columns.
RESTORE_EDITABLE = {
    "accounts.user": ["email", "first_name", "last_name", "register_no", "emp_no"],
    "institution.campus": ["name", "code", "city", "state", "address"],
    "institution.school": ["name", "code"],
    "institution.department": ["name", "code"],
    "institution.program": ["name", "code"],
    "institution.batch": ["name"],
    "institution.section": ["name"],
    "classrooms.classroom": ["name", "subject_code"],
}


class RestoreConflict(Exception):
    """Restoring would collide with another record; carries the conflict list for the response."""

    def __init__(self, conflicts):
        super().__init__("conflict")
        self.conflicts = conflicts


class RestoreInvalid(Exception):
    def __init__(self, errors):
        super().__init__("invalid")
        self.errors = errors


def _label(name):
    return name.replace("_", " ").capitalize()


def editable_fields(instance):
    """Editable fields of a record with current values, for the restore dialog."""
    from django.db import models

    out = []
    for name in RESTORE_EDITABLE.get(content_type_key(type(instance)), []):
        field = type(instance)._meta.get_field(name)
        kind = "email" if isinstance(field, models.EmailField) else "textarea" if isinstance(field, models.TextField) else "text"
        value = getattr(instance, name)
        out.append({"name": name, "label": _label(name), "type": kind, "value": "" if value is None else value,
                    "max_length": field.max_length, "required": not (field.blank or field.null)})
    return out


def unique_sets(model):
    """Field-name tuples that must be unique, as the database enforces them (deleted rows count)."""
    from django.db import models

    sets = []
    for field in model._meta.concrete_fields:
        if field.unique and not field.primary_key:
            sets.append((field.name,))
    for group in model._meta.unique_together:
        sets.append(tuple(group))
    for constraint in model._meta.constraints:
        if isinstance(constraint, models.UniqueConstraint) and not constraint.condition and constraint.fields:
            sets.append(tuple(constraint.fields))
    return sets


def _record(other):
    return {
        "content_type": content_type_key(type(other)), "id": other.pk, "label": str(other),
        "is_active": other.is_active, "fields": editable_fields(other),
    }


def find_conflicts(instance):
    """Other records (active or deleted) holding the same unique values as ``instance``."""
    model = type(instance)
    seen, conflicts = set(), []
    for names in unique_sets(model):
        values = {}
        for name in names:
            field = model._meta.get_field(name)
            key = field.attname if field.many_to_one else name
            # Text is compared ignoring case: "cse" and "CSE" would confuse people and sign-in.
            if field.get_internal_type() in ("CharField", "TextField"):
                key += "__iexact"
            values[key] = getattr(instance, field.attname)
        if any(v is None or v == "" for v in values.values()):
            continue
        for other in model.all_objects.filter(**values).exclude(pk=instance.pk):
            if other.pk in seen:
                continue
            seen.add(other.pk)
            conflicts.append({"fields": list(names), "record": _record(other)})
    return conflicts


def apply_changes(instance, changes):
    """Set allow-listed fields, validate them, return {field: {"from":, "to":}} (does not save)."""
    allowed = RESTORE_EDITABLE.get(content_type_key(type(instance)), [])
    changed, errors = {}, {}
    for name, raw in (changes or {}).items():
        if name not in allowed:
            continue
        field = type(instance)._meta.get_field(name)
        value = str(raw if raw is not None else "").strip()
        if name == "email":
            value = value.lower()
        if value == "" and field.null:
            value = None
        before = getattr(instance, name)
        if value != before and not (value is None and not before):
            changed[name] = {"from": before, "to": value}
            setattr(instance, name, value)
    if changed:
        try:
            instance.clean_fields(exclude=[f.name for f in type(instance)._meta.concrete_fields if f.name not in changed])
        except Exception as exc:  # django ValidationError
            messages = getattr(exc, "message_dict", None) or {"__all__": list(getattr(exc, "messages", [str(exc)]))}
            errors = {k: " ".join(v) for k, v in messages.items()}
    if errors:
        raise RestoreInvalid(errors)
    return changed


def save_edited(instance, changed):
    """Save only the edited columns, keeping a student's roster entry in step with their account."""
    if not changed:
        return
    instance.save(update_fields=[*changed, "updated_at"])
    if content_type_key(type(instance)) == "accounts.user":
        from apps.accounts.models import AdmittedStudent

        entry = AdmittedStudent.objects.filter(user=instance).first()
        if entry is not None:
            if "email" in changed:
                entry.email = instance.email
            if "register_no" in changed and instance.register_no:
                entry.register_no = instance.register_no
            entry.save()
