from django.urls import path
from .views import (
    ExamStatsView,
    ExamListCreateView,
    ExamDetailView,
    ExamAttemptStartView,
    ExamAttemptSubmitView,
    ExamAttemptDetailView,
    ExamAttemptListView,
)

urlpatterns = [
    path("", ExamListCreateView.as_view(), name="exam-list-create"),
    path("stats", ExamStatsView.as_view(), name="exam-stats"),
    path("<int:exam_id>", ExamDetailView.as_view(), name="exam-detail"),
    path("<int:exam_id>/attempts", ExamAttemptListView.as_view(), name="exam-attempts-list"),
    path("<int:exam_id>/attempts/start", ExamAttemptStartView.as_view(), name="exam-attempt-start"),
    path("<int:exam_id>/attempts/<int:attempt_id>", ExamAttemptDetailView.as_view(), name="exam-attempt-detail"),
    path("<int:exam_id>/attempts/<int:attempt_id>/submit", ExamAttemptSubmitView.as_view(), name="exam-attempt-submit"),
]
