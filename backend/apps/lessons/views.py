import logging
import uuid
from datetime import datetime
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.core.access import can_manage_course, can_view_course, managed_courses, visible_courses
from apps.core.permissions import IsTeacher
from apps.announcements.models import Announcement
from apps.core.utils.plan_parser import CoursePlanParser
from services.groq_service import GroqService
from apps.games.models import ChainAnswerGame, GamePlayer, GameQuestion
from apps.games.serializers import ChainAnswerGameSerializer
from .models import Lesson
from .serializers import LessonSerializer

logger = logging.getLogger(__name__)


class LessonGenerateView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request):
        topic = request.data.get("topic", "")
        syllabus_context = request.data.get("syllabus_context", "")
        if not topic:
            return Response({"detail": "Topic is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = GroqService.generate_lesson_plan(topic=topic, syllabus_context=syllabus_context)
            return Response(result)
        except Exception as e:
            logger.error("Error generating lesson plan: %s", e)
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class LessonParsePlanView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        filename = file_obj.name.lower()
        content = file_obj.read()

        if filename.endswith(".pdf"):
            text = CoursePlanParser.extract_text_from_pdf(content)
        elif filename.endswith(".docx"):
            text = CoursePlanParser.extract_text_from_docx(content)
        elif filename.endswith((".txt", ".md")):
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                text = content.decode("latin-1", errors="replace")
        else:
            return Response(
                {"detail": "Unsupported file format. Please upload PDF, DOCX, TXT, or MD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not text.strip():
            return Response({"detail": "The file appears to be empty or unreadable."}, status=status.HTTP_400_BAD_REQUEST)

        result = CoursePlanParser.parse_content(text)
        return Response(result)


def _own_lesson(request, lesson_id):
    """(lesson, error): the lesson, only if the caller manages its course."""
    lesson = get_object_or_404(Lesson.objects.select_related("course"), pk=lesson_id)
    if not can_manage_course(request.user, lesson.course):
        return None, Response({"detail": "You do not have permission to do that for this lesson."}, status=status.HTTP_403_FORBIDDEN)
    return lesson, None


class LessonListCreateView(APIView):

    def get_permissions(self):
        return [IsTeacher()] if self.request.method == "POST" else super().get_permissions()

    def get(self, request):
        course_id = request.query_params.get("course_id")
        status_param = request.query_params.get("status")
        if request.query_params.get("posted_only") == "true":
            status_param = "posted"

        user = request.user
        qs = Lesson.objects.filter(course__in=visible_courses(user))
        if course_id:
            qs = qs.filter(course_id=course_id)
        if getattr(user, "role", "") == "STUDENT":
            qs = qs.filter(posted_at__isnull=False)  # drafts are the teacher's private work
        elif status_param == "posted":
            qs = qs.filter(posted_at__isnull=False)
        elif status_param == "draft":
            qs = qs.filter(posted_at__isnull=True)

        return Response(LessonSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data
        course_id = data.get("course_id")
        if not course_id:
            return Response({"detail": "Choose the course this lesson is for."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            classroom = managed_courses(request.user).filter(pk=int(course_id)).first()
        except (TypeError, ValueError):
            classroom = None
        if classroom is None:
            return Response({"detail": "You can only add lessons to your own courses."}, status=status.HTTP_403_FORBIDDEN)

        topic = data.get("topic", "")
        title = data.get("title") or topic or "Untitled Lesson"

        lesson = Lesson.objects.create(
            course=classroom,
            title=title,
            topic=topic,
            syllabus_context=data.get("syllabus_context"),
            lecture_flow=data.get("lecture_flow"),
            examples=data.get("examples"),
            activities=data.get("activities"),
            quiz_questions=data.get("quiz_questions"),
            created_by=request.user.pk,  # the author is the signed-in teacher, not a client-supplied id
        )

        return Response(LessonSerializer(lesson).data, status=status.HTTP_201_CREATED)


class LessonDetailView(APIView):

    def get_permissions(self):
        return [IsTeacher()] if self.request.method in ("PUT", "DELETE") else super().get_permissions()

    def get(self, request, lesson_id):
        lesson = get_object_or_404(Lesson.objects.select_related("course"), pk=lesson_id)
        if can_manage_course(request.user, lesson.course):
            return Response(LessonSerializer(lesson).data)
        if lesson.posted_at is not None and can_view_course(request.user, lesson.course):
            return Response(LessonSerializer(lesson).data)
        return Response({"detail": "You do not have permission to do that for this lesson."}, status=status.HTTP_403_FORBIDDEN)

    def put(self, request, lesson_id):
        lesson, error = _own_lesson(request, lesson_id)
        if error:
            return error
        data = request.data

        for field in ["title", "topic", "syllabus_context", "lecture_flow", "examples", "activities", "quiz_questions"]:
            if field in data:
                setattr(lesson, field, data[field])

        lesson.save()
        return Response(LessonSerializer(lesson).data)

    def delete(self, request, lesson_id):
        lesson, error = _own_lesson(request, lesson_id)
        if error:
            return error
        lesson.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LessonPostView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request, lesson_id):
        lesson, error = _own_lesson(request, lesson_id)
        if error:
            return error
        if lesson.posted_at is not None:
            return Response(LessonSerializer(lesson).data)  # already posted: do not repeat the announcement
        lesson.posted_at = timezone.now()
        lesson.save()

        now_str = datetime.now().strftime("%I:%M %p, %b %d")
        Announcement.objects.create(
            course=lesson.course,
            title=f"Lesson: {lesson.title or lesson.topic}",
            body=f"New lesson on '{lesson.topic}' has been posted.",
            time=now_str,
            pinned=False,
        )

        return Response(LessonSerializer(lesson).data)


class LessonEduGamesView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request, lesson_id):
        lesson, error = _own_lesson(request, lesson_id)
        if error:
            return error
        if lesson.posted_at is None:
            return Response(
                {"detail": "Post the lesson before sending it to EduGames."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        questions = [
            line.strip().lstrip("- ").split(". ", 1)[-1].strip()
            for line in (lesson.quiz_questions or "").splitlines()
            if line.strip()
        ]
        if not questions:
            return Response(
                {"detail": "The lesson has no quiz questions to send to EduGames."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        players = list(
            lesson.course.enrollments.select_related("student").all()
        )
        if len(players) < 2:
            return Response(
                {"detail": "The classroom needs at least two enrolled students."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        game = ChainAnswerGame.objects.create(
            session_id=f"game_{uuid.uuid4().hex[:8]}",
            teacher_id=request.user.pk,
            name=f"{lesson.title or lesson.topic} Quiz",
            subject=lesson.topic,
            starting_word=lesson.topic or "Lesson",
            status="setup",
        )
        for index, enrollment in enumerate(players, start=1):
            student = enrollment.student
            student_name = " ".join(
                part for part in [student.first_name, student.last_name] if part
            ).strip() or student.email
            GamePlayer.objects.create(
                game=game,
                student_id=student.id,
                name=student_name,
                join_order=index,
            )
        for index, question in enumerate(questions):
            GameQuestion.objects.create(
                game=game,
                question_text=question,
                order=index,
            )

        return Response(
            ChainAnswerGameSerializer(game).data,
            status=status.HTTP_201_CREATED,
        )
