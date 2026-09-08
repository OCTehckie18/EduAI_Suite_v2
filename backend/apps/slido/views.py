import random
import string
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.utils.file_uploads import save_optional_upload
from services.supabase_storage_service import SupabaseStorageService
from .models import (
    PresentationAssignment,
    PresentationSubmission,
    SubmissionInteraction,
    SlidoSession,
    SlidoPoll,
    PollResponse,
    SlidoQnA,
    QnAUpvote,
)
from .serializers import (
    PresentationAssignmentSerializer,
    PresentationSubmissionSerializer,
    SlidoSessionSerializer,
    SlidoPollSerializer,
    SlidoQnASerializer,
)


def _generate_pin() -> str:
    return "".join(random.choices(string.digits, k=6))


class PresentationAssignmentListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = PresentationAssignment.objects.all()
        return Response(PresentationAssignmentSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data
        asgn = PresentationAssignment.objects.create(
            teacher_id=data.get("teacher_id", 0),
            course_id=data.get("course_id"),
            title=data.get("title", "Presentation Assignment"),
            description=data.get("description", ""),
            deadline=data.get("deadline"),
        )
        return Response(PresentationAssignmentSerializer(asgn).data, status=status.HTTP_201_CREATED)


class PresentationAssignmentDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, assignment_id):
        asgn = get_object_or_404(PresentationAssignment, pk=assignment_id)
        return Response(PresentationAssignmentSerializer(asgn).data)


class PresentationSubmissionListCreateView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, assignment_id):
        subs = PresentationSubmission.objects.filter(assignment_id=assignment_id)
        return Response(PresentationSubmissionSerializer(subs, many=True).data)

    def post(self, request, assignment_id):
        asgn = get_object_or_404(PresentationAssignment, pk=assignment_id)
        file_obj = request.FILES.get("file")
        file_url = None
        file_name = getattr(file_obj, "name", "presentation.pptx") if file_obj else None

        if file_obj:
            # Try Supabase Storage, fallback to local uploads
            try:
                storage = SupabaseStorageService()
                content = file_obj.read()
                object_key = storage.upload_file(content, file_name, folder="presentations")
                file_url = storage.get_file_url(object_key)
            except Exception:
                file_url = save_optional_upload(file_obj, "presentations")

        sub = PresentationSubmission.objects.create(
            assignment=asgn,
            student_id=request.data.get("student_id", 0),
            file_url=file_url,
            file_name=file_name,
            status="submitted",
        )
        return Response(PresentationSubmissionSerializer(sub).data, status=status.HTTP_201_CREATED)


class SlidoSessionListCreateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        pin = _generate_pin()
        while SlidoSession.objects.filter(pin=pin, status="active").exists():
            pin = _generate_pin()

        session = SlidoSession.objects.create(
            teacher_id=data.get("teacher_id", 0),
            assignment_id=data.get("assignment_id"),
            submission_id=data.get("submission_id"),
            pin=pin,
            status="active",
        )
        return Response(SlidoSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class SlidoSessionDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pin):
        session = get_object_or_404(SlidoSession, pin=pin)
        return Response(SlidoSessionSerializer(session).data)


class SlidoPollListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pin):
        session = get_object_or_404(SlidoSession, pin=pin)
        polls = session.polls.all()
        return Response(SlidoPollSerializer(polls, many=True).data)

    def post(self, request, pin):
        session = get_object_or_404(SlidoSession, pin=pin)
        data = request.data

        poll = SlidoPoll.objects.create(
            session=session,
            teacher_id=data.get("teacher_id", 0),
            question=data.get("question", ""),
            poll_type=data.get("poll_type", "multiple_choice"),
        )
        return Response(SlidoPollSerializer(poll).data, status=status.HTTP_201_CREATED)


class SlidoPollVoteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pin, poll_id):
        poll = get_object_or_404(SlidoPoll, pk=poll_id, session__pin=pin)
        data = request.data

        PollResponse.objects.create(
            poll=poll,
            student_id=data.get("student_id", 0),
            option_text=data.get("option_text"),
            response_text=data.get("response_text"),
            response_value=data.get("response_value"),
        )
        poll.total_responses += 1
        poll.save()

        return Response({"message": "Vote recorded", "total_responses": poll.total_responses})


class SlidoQnAListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pin):
        session = get_object_or_404(SlidoSession, pin=pin)
        qnas = session.questions.all()
        return Response(SlidoQnASerializer(qnas, many=True).data)

    def post(self, request, pin):
        session = get_object_or_404(SlidoSession, pin=pin)
        data = request.data

        qna = SlidoQnA.objects.create(
            session=session,
            student_id=data.get("student_id", 0),
            question_text=data.get("question_text", ""),
            is_anonymous=bool(data.get("is_anonymous", False)),
        )
        return Response(SlidoQnASerializer(qna).data, status=status.HTTP_201_CREATED)


class SlidoQnAUpvoteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pin, question_id):
        qna = get_object_or_404(SlidoQnA, pk=question_id, session__pin=pin)
        student_id = request.data.get("student_id", 0)

        record, created = QnAUpvote.objects.get_or_create(question=qna, student_id=student_id)
        if created:
            qna.upvotes += 1
            qna.save()

        return Response({"upvotes": qna.upvotes})
