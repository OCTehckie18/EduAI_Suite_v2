from django.urls import path
from .views import (
    DashboardSummaryView,
    DiscoverableClassroomsView,
    StudentDashboardSummaryView,
    GlobalRiskView,
    CourseAnalyticsView,
)

urlpatterns = [
    path("summary", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("summary/", DashboardSummaryView.as_view(), name="dashboard-summary-slash"),
    path("discoverable-classrooms", DiscoverableClassroomsView.as_view(), name="dashboard-discoverable-classrooms"),
    path("discoverable-classrooms/", DiscoverableClassroomsView.as_view(), name="dashboard-discoverable-classrooms-slash"),
    path("student-summary", StudentDashboardSummaryView.as_view(), name="dashboard-student-summary"),
    path("student-summary/", StudentDashboardSummaryView.as_view(), name="dashboard-student-summary-slash"),
    path("risk-global", GlobalRiskView.as_view(), name="analytics-risk-global"),
    path("risk-global/", GlobalRiskView.as_view(), name="analytics-risk-global-slash"),
    path("course/<int:course_id>", CourseAnalyticsView.as_view(), name="analytics-course"),
    path("course/<int:course_id>/", CourseAnalyticsView.as_view(), name="analytics-course-slash"),
]
