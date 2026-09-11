from django.urls import path

from .views import MasterAdminOverviewView, RecycleBinListView, RecycleBinRestoreView

urlpatterns = [
    path("overview/", MasterAdminOverviewView.as_view(), name="master-admin-overview"),
    path("recycle-bin/", RecycleBinListView.as_view(), name="master-admin-recycle-bin"),
    path("recycle-bin/<str:content_type>/<int:pk>/restore/", RecycleBinRestoreView.as_view(), name="master-admin-recycle-bin-restore"),
]
