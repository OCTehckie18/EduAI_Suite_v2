from django.urls import path

from .views import CampusSummaryView, MasterAdminOverviewView, RecycleBinListView, RecycleBinRestoreView

urlpatterns = [
    path("campuses/", CampusSummaryView.as_view(), name="master-admin-campuses"),
    path("overview/", MasterAdminOverviewView.as_view(),
         name="master-admin-overview"),
    path("recycle-bin/", RecycleBinListView.as_view(),
         name="master-admin-recycle-bin"),
    path("recycle-bin/<str:content_type>/<int:pk>/restore/",
         RecycleBinRestoreView.as_view(), name="master-admin-recycle-bin-restore"),
]
