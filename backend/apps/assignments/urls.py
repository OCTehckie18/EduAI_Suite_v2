from django.urls import path
from .views import (
    AssignmentListCreateView,
    AssignmentDetailView,
    SubmissionListCreateView,
    SubmissionDetailView,
    UnsubmitAssignmentView,
    GradeSubmissionView,
    RubricCriteriaListView,
    FeedbackTemplateListView,
)

assignment_urlpatterns = [
    path("rubric-criteria", RubricCriteriaListView.as_view(), name="rubric-criteria"),
    path("feedback-templates", FeedbackTemplateListView.as_view(), name="feedback-templates"),
    path("<int:course_id>", AssignmentListCreateView.as_view(), name="assignment-list-create"),
    path("detail/<int:assignment_id>", AssignmentDetailView.as_view(), name="assignment-detail"),
    path("<int:assignment_id>/delete", AssignmentDetailView.as_view(), name="assignment-delete"),
]

submission_urlpatterns = [
    path("<int:assignment_id>", SubmissionListCreateView.as_view(), name="submission-list-create"),
    path("assignment/<int:assignment_id>", SubmissionListCreateView.as_view(), name="submission-by-assignment"),
    path("detail/<int:submission_id>", SubmissionDetailView.as_view(), name="submission-detail"),
    path("grade/<int:submission_id>", GradeSubmissionView.as_view(), name="submission-grade"),
    path("assignment/<int:assignment_id>/student/<str:student_name>", UnsubmitAssignmentView.as_view(), name="submission-unsubmit"),
]

urlpatterns = assignment_urlpatterns
