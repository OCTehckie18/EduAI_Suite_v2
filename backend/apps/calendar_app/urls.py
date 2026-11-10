from django.urls import path
from .views import (
    CalendarEventListCreateView,
    CalendarEventDetailView,
    CalendarNotificationsView,
    GoogleCalendarCallbackView,
    GoogleCalendarConnectView,
    GoogleCalendarDisconnectView,
    GoogleCalendarStatusView,
    GoogleCalendarSyncNowView,
)

urlpatterns = [
    path("events", CalendarEventListCreateView.as_view(), name="calendar-events-list-create"),
    path("events/<int:event_id>", CalendarEventDetailView.as_view(), name="calendar-event-detail"),
    path("notifications", CalendarNotificationsView.as_view(), name="calendar-notifications"),
    path("google-status", GoogleCalendarStatusView.as_view(), name="calendar-google-status"),
    path("google/connect", GoogleCalendarConnectView.as_view(), name="calendar-google-connect"),
    path("google/callback", GoogleCalendarCallbackView.as_view(), name="calendar-google-callback"),
    path("google/sync-now", GoogleCalendarSyncNowView.as_view(), name="calendar-google-sync-now"),
    path("google", GoogleCalendarDisconnectView.as_view(), name="calendar-google-disconnect"),
]
