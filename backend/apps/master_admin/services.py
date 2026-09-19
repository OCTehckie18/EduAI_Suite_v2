from django.apps import apps as django_apps
from django.contrib.contenttypes.models import ContentType

from apps.core.models import SoftDeleteModel


def soft_delete_models():
    """All non-abstract models implementing the universal soft-delete contract."""
    return [
        model for model in django_apps.get_models()
        if issubclass(model, SoftDeleteModel) and not model._meta.abstract
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
