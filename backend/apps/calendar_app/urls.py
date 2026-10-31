from django.urls import path
from .views import (
    CalendarEventListCreateView,
    CalendarEventDetailView,
    CalendarNotificationsView,
    GoogleCalendarStatusView,
)

urlpatterns = [
    path("events", CalendarEventListCreateView.as_view(), name="calendar-events-list-create"),
    path("events/<int:event_id>", CalendarEventDetailView.as_view(), name="calendar-event-detail"),
    path("notifications", CalendarNotificationsView.as_view(), name="calendar-notifications"),
    path("google-status", GoogleCalendarStatusView.as_view(), name="calendar-google-status"),
]
