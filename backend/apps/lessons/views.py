import logging
from datetime import datetime
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.announcements.models import Announcement
from apps.core.utils.plan_parser import CoursePlanParser
from services.groq_service import GroqService
from .models import Lesson
from .serializers import LessonSerializer

logger = logging.getLogger(__name__)


class LessonGenerateView(APIView):
    permission_classes = [AllowAny]

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
    permission_classes = [AllowAny]
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


class LessonListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        course_id = request.query_params.get("course_id")
        status_param = request.query_params.get("status")

        qs = Lesson.objects.all()
        if course_id:
            qs = qs.filter(course_id=course_id)
        if status_param == "posted":
            qs = qs.filter(posted_at__isnull=False)
        elif status_param == "draft":
            qs = qs.filter(posted_at__isnull=True)

        return Response(LessonSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data
        course_id = data.get("course_id")
        classroom = None
        if course_id:
            classroom = Classroom.objects.filter(pk=course_id).first()
        if not classroom:
            classroom = Classroom.objects.first()
        if not classroom:
            return Response({"detail": "No course available to attach lesson"}, status=status.HTTP_400_BAD_REQUEST)

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
            created_by=data.get("created_by", 0),
        )

        return Response(LessonSerializer(lesson).data, status=status.HTTP_201_CREATED)


class LessonDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        return Response(LessonSerializer(lesson).data)

    def put(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        data = request.data

        for field in ["title", "topic", "syllabus_context", "lecture_flow", "examples", "activities", "quiz_questions"]:
            if field in data:
                setattr(lesson, field, data[field])

        lesson.save()
        return Response(LessonSerializer(lesson).data)

    def delete(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        lesson.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LessonPostView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
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
