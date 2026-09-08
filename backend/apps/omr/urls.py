from django.urls import path
from .views import (
    OMRJobListCreateView,
    OMRJobDetailView,
    OMRSubmissionListCreateView,
    OMRSubmissionDetailView,
)

urlpatterns = [
    path("jobs", OMRJobListCreateView.as_view(), name="omr-jobs-list-create"),
    path("jobs/<int:job_id>", OMRJobDetailView.as_view(), name="omr-job-detail"),
    path("jobs/<int:job_id>/submissions", OMRSubmissionListCreateView.as_view(), name="omr-job-submissions"),
    path("submissions/<int:submission_id>", OMRSubmissionDetailView.as_view(), name="omr-submission-detail"),
]
