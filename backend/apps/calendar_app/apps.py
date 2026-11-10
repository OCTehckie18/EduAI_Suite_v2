from django.apps import AppConfig


class CalendarAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.calendar_app'

    def ready(self):
        from . import signals  # noqa: F401  (registers the Google Calendar sync triggers)
