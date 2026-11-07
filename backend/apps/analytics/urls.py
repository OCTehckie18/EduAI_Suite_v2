from django.urls import path
from .views import (
    DashboardSummaryView,
    StudentDashboardSummaryView,
    GlobalRiskView,
    CourseAnalyticsView,
)

from .risk_views import MyProgressView, RiskDashboardView, WatchDetailView, WatchListView

urlpatterns = [
    path("risk", RiskDashboardView.as_view(), name="analytics-risk"),
    path("my-progress", MyProgressView.as_view(), name="analytics-my-progress"),
    path("watchlist", WatchListView.as_view(), name="analytics-watchlist"),
    path("watchlist/<int:watch_id>", WatchDetailView.as_view(), name="analytics-watch-detail"),
    path("summary", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("summary/", DashboardSummaryView.as_view(), name="dashboard-summary-slash"),
    path("student-summary", StudentDashboardSummaryView.as_view(), name="dashboard-student-summary"),
    path("student-summary/", StudentDashboardSummaryView.as_view(), name="dashboard-student-summary-slash"),
    path("risk-global", GlobalRiskView.as_view(), name="analytics-risk-global"),
    path("risk-global/", GlobalRiskView.as_view(), name="analytics-risk-global-slash"),
    path("course/<int:course_id>", CourseAnalyticsView.as_view(), name="analytics-course"),
    path("course/<int:course_id>/", CourseAnalyticsView.as_view(), name="analytics-course-slash"),
]
