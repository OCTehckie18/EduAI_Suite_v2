from django.urls import path
from .views import (
    ExamStatsView,
    ExamListCreateView,
    ExamDetailView,
    ExamAttemptStartView,
    ExamAttemptSubmitView,
    ExamAttemptDetailView,
    ExamAttemptListView,
    ExamAttemptViolationView,
)
from .import_views import ExamExtractView, ExamImportExcelView, ExamTemplateView

urlpatterns = [
    path("", ExamListCreateView.as_view(), name="exam-list-create"),
    path("stats", ExamStatsView.as_view(), name="exam-stats"),
    path("extract", ExamExtractView.as_view(), name="exam-extract"),
    path("template", ExamTemplateView.as_view(), name="exam-template"),
    path("import-excel", ExamImportExcelView.as_view(), name="exam-import-excel"),
    path("<int:exam_id>", ExamDetailView.as_view(), name="exam-detail"),
    path("<int:exam_id>/attempts", ExamAttemptListView.as_view(), name="exam-attempts-list"),
    path("<int:exam_id>/attempts/start", ExamAttemptStartView.as_view(), name="exam-attempt-start"),
    path("<int:exam_id>/attempts/<int:attempt_id>", ExamAttemptDetailView.as_view(), name="exam-attempt-detail"),
    path("<int:exam_id>/attempts/<int:attempt_id>/violation", ExamAttemptViolationView.as_view(), name="exam-attempt-violation"),
    path("<int:exam_id>/attempts/<int:attempt_id>/submit", ExamAttemptSubmitView.as_view(), name="exam-attempt-submit"),
]
