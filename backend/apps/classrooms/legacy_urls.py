from django.urls import path

from .legacy_views import (
    LegacyActiveStudentsView,
    LegacyBulkEnrollView,
    LegacyCourseDetailView,
    LegacyCourseExtractDetailsView,
    LegacyCourseListCreateView,
    LegacyCourseStudentsView,
    LegacyEnrollByCodeView,
    LegacyStudentListView,
)


urlpatterns = [
    path("", LegacyCourseListCreateView.as_view(), name="legacy-course-list"),
    path("extract_details", LegacyCourseExtractDetailsView.as_view(), name="legacy-course-extract-details"),
    path("<int:course_id>", LegacyCourseDetailView.as_view(), name="legacy-course-detail"),
]


student_urlpatterns = [
    path("", LegacyStudentListView.as_view(), name="legacy-student-list"),
    path("bulk_upload/<int:course_id>", LegacyBulkEnrollView.as_view(), name="legacy-student-bulk-upload"),
    path("enroll/code", LegacyEnrollByCodeView.as_view(), name="legacy-student-enroll-code"),
    path("<int:course_id>/active", LegacyActiveStudentsView.as_view(), name="legacy-active-students"),
    path("<int:course_id>", LegacyCourseStudentsView.as_view(), name="legacy-course-students"),
]
