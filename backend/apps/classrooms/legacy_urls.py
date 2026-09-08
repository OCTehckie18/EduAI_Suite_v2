from django.urls import path

from .legacy_views import (
    LegacyActiveStudentsView,
    LegacyBulkEnrollView,
    LegacyCourseDetailView,
    LegacyCourseExtractDetailsView,
    LegacyCourseListCreateView,
    LegacyCourseStudentsView,
    LegacyEnrollByCodeView,
    LegacyResourceListView,
    LegacyStudentDetailView,
    LegacyStudentListView,
    LegacyStudentDeleteView,
)


urlpatterns = [
    path("", LegacyCourseListCreateView.as_view(), name="legacy-course-list"),
    path("extract_details", LegacyCourseExtractDetailsView.as_view(), name="legacy-course-extract-details"),
    path("extract_details/", LegacyCourseExtractDetailsView.as_view(), name="legacy-course-extract-details-slash"),
    path("<int:course_id>", LegacyCourseDetailView.as_view(), name="legacy-course-detail"),
    path("<int:course_id>/", LegacyCourseDetailView.as_view(), name="legacy-course-detail-slash"),
]


student_urlpatterns = [
    path("", LegacyStudentListView.as_view(), name="legacy-student-list"),
    path("bulk_upload/<int:course_id>", LegacyBulkEnrollView.as_view(), name="legacy-student-bulk-upload"),
    path("bulk_upload/<int:course_id>/", LegacyBulkEnrollView.as_view(), name="legacy-student-bulk-upload-slash"),
    path("enroll/code", LegacyEnrollByCodeView.as_view(), name="legacy-student-enroll-code"),
    path("enroll/code/", LegacyEnrollByCodeView.as_view(), name="legacy-student-enroll-code-slash"),
    path("<int:course_id>/active", LegacyActiveStudentsView.as_view(), name="legacy-active-students"),
    path("<int:course_id>/active/", LegacyActiveStudentsView.as_view(), name="legacy-active-students-slash"),
    path("detail/<int:student_id>", LegacyStudentDetailView.as_view(), name="legacy-student-detail"),
    path("detail/<int:student_id>/", LegacyStudentDetailView.as_view(), name="legacy-student-detail-slash"),
    path("<int:course_id>", LegacyCourseStudentsView.as_view(), name="legacy-course-students"),
    path("<int:course_id>/", LegacyCourseStudentsView.as_view(), name="legacy-course-students-slash"),
]

resource_urlpatterns = [
    path("<int:course_id>", LegacyResourceListView.as_view(), name="legacy-resource-list"),
    path("<int:course_id>/", LegacyResourceListView.as_view(), name="legacy-resource-list-slash"),
]
