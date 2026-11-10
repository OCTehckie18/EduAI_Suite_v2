from django.urls import path

from .university_views import UniversityDetailView, UniversityLogoUploadView
from .roster_views import RosterDetailView, RosterImportView, RosterListView, RosterTemplateView
from .views import (
    CampusDetailView,
    CampusSummaryView,
    MasterAdminOverviewView,
    PlacementOptionsView,
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
    path("users/placement-options/", PlacementOptionsView.as_view(), name="master-admin-placement-options"),
    path("users/", UserDirectoryView.as_view(), name="master-admin-users"),
    path("users/<int:pk>/", UserDirectoryDetailView.as_view(), name="master-admin-user-detail"),
    path("teacher-approvals/", TeacherApprovalListView.as_view(), name="master-admin-teacher-approvals"),
    path("teacher-approvals/<int:pk>/approve/", TeacherApprovalDecisionView.as_view(decision="approve"),
         name="master-admin-teacher-approve"),
    path("teacher-approvals/<int:pk>/reject/", TeacherApprovalDecisionView.as_view(decision="reject"),
         name="master-admin-teacher-reject"),
    path("roster/", RosterListView.as_view(), name="master-admin-roster"),
    path("roster/import/", RosterImportView.as_view(), name="master-admin-roster-import"),
    path("roster/template/", RosterTemplateView.as_view(), name="master-admin-roster-template"),
    path("roster/<int:pk>/", RosterDetailView.as_view(), name="master-admin-roster-detail"),
    path("university/", UniversityDetailView.as_view(), name="master-admin-university"),
    path("university/logo/", UniversityLogoUploadView.as_view(), name="master-admin-university-logo"),
    path("overview/", MasterAdminOverviewView.as_view(),
         name="master-admin-overview"),
    path("recycle-bin/", RecycleBinListView.as_view(),
         name="master-admin-recycle-bin"),
    path("recycle-bin/<str:content_type>/<int:pk>/restore/",
         RecycleBinRestoreView.as_view(), name="master-admin-recycle-bin-restore"),
]
