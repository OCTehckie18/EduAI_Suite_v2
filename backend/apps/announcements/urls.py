from django.urls import path
from .views import AnnouncementListCreateView, AnnouncementDetailView

urlpatterns = [
    path("<int:course_id>", AnnouncementListCreateView.as_view(), name="announcement-list-create"),
    path("detail/<int:announcement_id>", AnnouncementDetailView.as_view(), name="announcement-detail"),
    path("<int:announcement_id>/delete", AnnouncementDetailView.as_view(), name="announcement-delete"),
]
