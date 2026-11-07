import random
import string

from django.db import IntegrityError, transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.core.access import can_manage_course, is_master_admin, visible_courses
from apps.core.utils.file_uploads import save_optional_upload
from services.supabase_storage_service import SupabaseStorageService
from .models import (
    PresentationAssignment,
    PresentationSubmission,
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

# Every endpoint needs a signed-in account (the project default). Who is acting always
# comes from that account, never from an id or name in the request body.


def _generate_pin() -> str:
    return "".join(random.choices(string.digits, k=6))


def _role(user):
    return getattr(user, "role", "")


def _forbidden(message):
    return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)


def _bad(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _owns(user, teacher_id):
    return is_master_admin(user) or teacher_id == user.pk


def _can_see_assignment(user, asgn):
    if _owns(user, asgn.teacher_id):
        return True
    return asgn.course_id is not None and visible_courses(user).filter(pk=asgn.course_id).exists()


class PresentationAssignmentListCreateView(APIView):

    def get(self, request):
        user = request.user
        if _role(user) == "TEACHER":
            qs = PresentationAssignment.objects.filter(teacher_id=user.pk)
        elif is_master_admin(user):
            qs = PresentationAssignment.objects.all()
        else:
            qs = PresentationAssignment.objects.filter(course_id__in=visible_courses(user).values_list("pk", flat=True))
        return Response(PresentationAssignmentSerializer(qs, many=True).data)

    def post(self, request):
        user, data = request.user, request.data
        if _role(user) != "TEACHER":
            return _forbidden("Only teachers can create presentation assignments.")
        course_id = data.get("course_id")
        if course_id not in (None, ""):
            course = Classroom.objects.filter(pk=course_id).first() if str(course_id).isdigit() else None
            if course is None or not can_manage_course(user, course):
                return _bad("Choose one of your own classrooms.")
        else:
            course_id = None
        asgn = PresentationAssignment.objects.create(
            teacher_id=user.pk,
            course_id=course_id,
            title=str(data.get("title") or "Presentation Assignment")[:255],
            description=data.get("description", ""),
            deadline=data.get("deadline"),
        )
        return Response(PresentationAssignmentSerializer(asgn).data, status=status.HTTP_201_CREATED)


class PresentationAssignmentDetailView(APIView):

    def get(self, request, assignment_id):
        asgn = get_object_or_404(PresentationAssignment, pk=assignment_id)
        if not _can_see_assignment(request.user, asgn):
            return _forbidden("You do not have access to this assignment.")
        return Response(PresentationAssignmentSerializer(asgn).data)


class PresentationSubmissionListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, assignment_id):
        asgn = get_object_or_404(PresentationAssignment, pk=assignment_id)
        user = request.user
        if _owns(user, asgn.teacher_id):
            subs = PresentationSubmission.objects.filter(assignment=asgn)
        elif _can_see_assignment(user, asgn):
            subs = PresentationSubmission.objects.filter(assignment=asgn, student_id=user.pk)  # never classmates' work
        else:
            return _forbidden("You do not have access to this assignment.")
        return Response(PresentationSubmissionSerializer(subs, many=True).data)

    def post(self, request, assignment_id):
        user = request.user
        asgn = get_object_or_404(PresentationAssignment, pk=assignment_id)
        if _role(user) != "STUDENT" or not _can_see_assignment(user, asgn):
            return _forbidden("Only students in this classroom can submit.")
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
                file_obj.seek(0)
                file_url = save_optional_upload(file_obj, "presentations")

        sub = PresentationSubmission.objects.create(
            assignment=asgn,
            student_id=user.pk,
            file_url=file_url,
            file_name=file_name,
            status="submitted",
        )
        return Response(PresentationSubmissionSerializer(sub).data, status=status.HTTP_201_CREATED)


class SlidoSessionListCreateView(APIView):

    def post(self, request):
        user, data = request.user, request.data
        if _role(user) != "TEACHER":
            return _forbidden("Only teachers can host a session.")
        assignment_id = data.get("assignment_id")
        if assignment_id not in (None, ""):
            owned = (
                PresentationAssignment.objects.filter(pk=assignment_id, teacher_id=user.pk).exists()
                if str(assignment_id).isdigit() else False
            )
            if not owned:
                return _bad("Choose one of your own presentation assignments.")
        else:
            assignment_id = None
        pin = _generate_pin()
        while SlidoSession.objects.filter(pin=pin, status="active").exists():
            pin = _generate_pin()

        session = SlidoSession.objects.create(
            teacher_id=user.pk,
            assignment_id=assignment_id,
            submission_id=None,
            pin=pin,
            status="active",
        )
        return Response(SlidoSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class SlidoSessionDetailView(APIView):

    def get(self, request, pin):
        session = get_object_or_404(SlidoSession, pin=pin)
        return Response(SlidoSessionSerializer(session).data)


class SlidoPollListCreateView(APIView):

    def get(self, request, pin):
        session = get_object_or_404(SlidoSession, pin=pin)
        polls = session.polls.all()
        return Response(SlidoPollSerializer(polls, many=True).data)

    def post(self, request, pin):
        session = get_object_or_404(SlidoSession, pin=pin)
        if not _owns(request.user, session.teacher_id):
            return _forbidden("Only the host of this session can add polls.")
        data = request.data
        question = str(data.get("question") or "").strip()
        if not question:
            return _bad("A poll needs a question.")

        poll = SlidoPoll.objects.create(
            session=session,
            teacher_id=session.teacher_id,
            question=question,
            poll_type=str(data.get("poll_type") or "multiple_choice")[:50],
        )
        return Response(SlidoPollSerializer(poll).data, status=status.HTTP_201_CREATED)


class SlidoPollVoteView(APIView):

    def post(self, request, pin, poll_id):
        user = request.user
        if _role(user) != "STUDENT":
            return _forbidden("Only students can vote.")
        poll = get_object_or_404(SlidoPoll, pk=poll_id, session__pin=pin)
        if not poll.is_active:
            return _bad("This poll is closed.", status.HTTP_409_CONFLICT)
        data = request.data
        text = data.get("response_text")
        option = data.get("option_text")
        value = data.get("response_value")
        if value is not None:
            try:
                value = int(value)
            except (TypeError, ValueError):
                return _bad("response_value must be a whole number.")
        if not (option or text or value is not None):
            return _bad("Send an answer to vote.")
        with transaction.atomic():
            if PollResponse.objects.filter(poll=poll, student_id=user.pk).exists():
                return _bad("You have already answered this poll.", status.HTTP_409_CONFLICT)
            PollResponse.objects.create(
                poll=poll,
                student_id=user.pk,
                option_text=str(option)[:255] if option else None,
                response_text=str(text)[:2000] if text else None,
                response_value=value,
            )
            SlidoPoll.objects.filter(pk=poll.pk).update(total_responses=F("total_responses") + 1)
        poll.refresh_from_db(fields=["total_responses"])
        return Response({"message": "Vote recorded", "total_responses": poll.total_responses})


class SlidoQnAListCreateView(APIView):

    def get(self, request, pin):
        session = get_object_or_404(SlidoSession, pin=pin)
        qnas = session.questions.all()
        return Response(SlidoQnASerializer(qnas, many=True).data)

    def post(self, request, pin):
        user = request.user
        if _role(user) != "STUDENT":
            return _forbidden("Only students can ask questions.")
        session = get_object_or_404(SlidoSession, pin=pin)
        text = str(request.data.get("question_text") or "").strip()
        if not text or len(text) > 1000:
            return _bad("Write a question of up to 1000 characters.")
        qna = SlidoQnA.objects.create(
            session=session,
            student_id=user.pk,
            question_text=text,
            is_anonymous=bool(request.data.get("is_anonymous", False)),
        )
        return Response(SlidoQnASerializer(qna).data, status=status.HTTP_201_CREATED)


class SlidoQnAUpvoteView(APIView):

    def post(self, request, pin, question_id):
        user = request.user
        if _role(user) != "STUDENT":
            return _forbidden("Only students can upvote.")
        qna = get_object_or_404(SlidoQnA, pk=question_id, session__pin=pin)
        _, created = QnAUpvote.objects.get_or_create(question=qna, student_id=user.pk)
        if created:
            SlidoQnA.objects.filter(pk=qna.pk).update(upvotes=F("upvotes") + 1)
        qna.refresh_from_db(fields=["upvotes"])
        return Response({"upvotes": qna.upvotes})
