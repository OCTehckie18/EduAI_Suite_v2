from django.urls import path

from .views import (
    CampusDetailView,
    CampusSummaryView,
    MasterAdminOverviewView,
    RecycleBinListView,
    RecycleBinRestoreView,
    TeacherApprovalDecisionView,
    TeacherApprovalListView,
    UserDirectoryDetailView,
    UserDirectoryView,
)

urlpatterns = [
    path("campuses/", CampusSummaryView.as_view(), name="master-admin-campuses"),
    path("campuses/<int:pk>/", CampusDetailView.as_view(), name="master-admin-campus-detail"),
    path("users/", UserDirectoryView.as_view(), name="master-admin-users"),
    path("users/<int:pk>/", UserDirectoryDetailView.as_view(), name="master-admin-user-detail"),
    path("teacher-approvals/", TeacherApprovalListView.as_view(), name="master-admin-teacher-approvals"),
    path("teacher-approvals/<int:pk>/approve/", TeacherApprovalDecisionView.as_view(decision="approve"),
         name="master-admin-teacher-approve"),
    path("teacher-approvals/<int:pk>/reject/", TeacherApprovalDecisionView.as_view(decision="reject"),
         name="master-admin-teacher-reject"),
    path("overview/", MasterAdminOverviewView.as_view(),
         name="master-admin-overview"),
    path("recycle-bin/", RecycleBinListView.as_view(),
         name="master-admin-recycle-bin"),
    path("recycle-bin/<str:content_type>/<int:pk>/restore/",
         RecycleBinRestoreView.as_view(), name="master-admin-recycle-bin-restore"),
]
