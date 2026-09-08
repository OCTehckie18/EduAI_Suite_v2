from django.urls import path
from .engagement_views import (
    CourseEngagementSummaryView,
    StudentEngagementProfileView,
)

urlpatterns = [
    path("<int:course_id>/summary", CourseEngagementSummaryView.as_view(), name="course-engagement-summary"),
    path("<int:course_id>/summary/", CourseEngagementSummaryView.as_view(), name="course-engagement-summary-slash"),
    path("student/<int:student_id>", StudentEngagementProfileView.as_view(), name="student-engagement-profile"),
    path("student/<int:student_id>/", StudentEngagementProfileView.as_view(), name="student-engagement-profile-slash"),
]
