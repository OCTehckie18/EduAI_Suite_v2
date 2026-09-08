from django.urls import path
from .views import (
    PresentationAssignmentListCreateView,
    PresentationAssignmentDetailView,
    PresentationSubmissionListCreateView,
    SlidoSessionListCreateView,
    SlidoSessionDetailView,
    SlidoPollListCreateView,
    SlidoPollVoteView,
    SlidoQnAListCreateView,
    SlidoQnAUpvoteView,
)

urlpatterns = [
    path("assignments", PresentationAssignmentListCreateView.as_view(), name="slido-assignments"),
    path("assignments/", PresentationAssignmentListCreateView.as_view(), name="slido-assignments-slash"),
    path("assignments/<int:assignment_id>", PresentationAssignmentDetailView.as_view(), name="slido-assignment-detail"),
    path("assignments/<int:assignment_id>/", PresentationAssignmentDetailView.as_view(), name="slido-assignment-detail-slash"),
    path("assignments/<int:assignment_id>/submissions", PresentationSubmissionListCreateView.as_view(), name="slido-submissions"),
    path("assignments/<int:assignment_id>/submissions/", PresentationSubmissionListCreateView.as_view(), name="slido-submissions-slash"),
    path("sessions", SlidoSessionListCreateView.as_view(), name="slido-sessions"),
    path("sessions/", SlidoSessionListCreateView.as_view(), name="slido-sessions-slash"),
    path("sessions/<str:pin>", SlidoSessionDetailView.as_view(), name="slido-session-detail"),
    path("sessions/<str:pin>/", SlidoSessionDetailView.as_view(), name="slido-session-detail-slash"),
    path("sessions/<str:pin>/polls", SlidoPollListCreateView.as_view(), name="slido-session-polls"),
    path("sessions/<str:pin>/polls/", SlidoPollListCreateView.as_view(), name="slido-session-polls-slash"),
    path("sessions/<str:pin>/polls/<int:poll_id>/vote", SlidoPollVoteView.as_view(), name="slido-poll-vote"),
    path("sessions/<str:pin>/polls/<int:poll_id>/vote/", SlidoPollVoteView.as_view(), name="slido-poll-vote-slash"),
    path("sessions/<str:pin>/qna", SlidoQnAListCreateView.as_view(), name="slido-session-qna"),
    path("sessions/<str:pin>/qna/", SlidoQnAListCreateView.as_view(), name="slido-session-qna-slash"),
    path("sessions/<str:pin>/qna/<int:question_id>/upvote", SlidoQnAUpvoteView.as_view(), name="slido-qna-upvote"),
    path("sessions/<str:pin>/qna/<int:question_id>/upvote/", SlidoQnAUpvoteView.as_view(), name="slido-qna-upvote-slash"),
]
