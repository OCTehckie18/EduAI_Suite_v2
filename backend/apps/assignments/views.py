from datetime import datetime
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.announcements.models import Announcement
from apps.core.utils.file_uploads import save_optional_upload
from .models import Assignment, Submission
from .serializers import AssignmentSerializer, SubmissionSerializer


class AssignmentListCreateView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, course_id):
        assignments = Assignment.objects.filter(course_id=course_id)
        return Response(AssignmentSerializer(assignments, many=True).data)

    def post(self, request, course_id):
        classroom = get_object_or_404(Classroom, pk=course_id)
        data = request.data

        title = data.get("title", "")
        description = data.get("description", "")
        due_date = data.get("due_date", "")
        max_points = int(data.get("max_points", 100))

        file_obj = request.FILES.get("file")
        media_path = save_optional_upload(file_obj, "assignments") if file_obj else None

        assignment = Assignment.objects.create(
            course=classroom,
            title=title,
            description=description,
            due_date=due_date,
            max_points=max_points,
            media_path=media_path,
        )

        now_str = datetime.now().strftime("%I:%M %p, %b %d")
        due_formatted = due_date.replace("T", " at ") if due_date else "TBD"
        Announcement.objects.create(
            course=classroom,
            title=f"New Assignment: {title}",
            body=f"Assignment '{title}' has been scheduled for {due_formatted}.",
            time=now_str,
            pinned=False,
        )

        return Response(AssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)


class AssignmentDetailView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def put(self, request, assignment_id):
        assignment = get_object_or_404(Assignment, pk=assignment_id)
        data = request.data

        if "title" in data and data["title"] is not None:
            assignment.title = data["title"]
        if "description" in data and data["description"] is not None:
            assignment.description = data["description"]
        if "due_date" in data and data["due_date"] is not None:
            assignment.due_date = data["due_date"]
        if "max_points" in data and data["max_points"] is not None:
            assignment.max_points = int(data["max_points"])

        file_obj = request.FILES.get("file")
        if file_obj:
            assignment.media_path = save_optional_upload(file_obj, "assignments")

        assignment.save()

        now_str = datetime.now().strftime("%I:%M %p, %b %d")
        Announcement.objects.create(
            course=assignment.course,
            title=f"Assignment Updated: {assignment.title}",
            body=f"Details or attachments for assignment '{assignment.title}' have been modified.",
            time=now_str,
            pinned=False,
        )

        return Response(AssignmentSerializer(assignment).data)

    def delete(self, request, assignment_id):
        assignment = get_object_or_404(Assignment, pk=assignment_id)
        now_str = datetime.now().strftime("%I:%M %p, %b %d")
        Announcement.objects.create(
            course=assignment.course,
            title="Assignment Cancelled",
            body=f"Assignment '{assignment.title}' has been removed.",
            time=now_str,
            pinned=False,
        )
        assignment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SubmissionListCreateView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, assignment_id):
        submissions = Submission.objects.filter(assignment_id=assignment_id)
        return Response(SubmissionSerializer(submissions, many=True).data)

    def post(self, request, assignment_id):
        assignment = get_object_or_404(Assignment, pk=assignment_id)
        student_name = request.data.get("student_name", "")

        files = request.FILES.getlist("files") or request.FILES.getlist("file")
        paths = []
        for f in files:
            p = save_optional_upload(f, "submissions")
            if p:
                paths.append(p)

        now_str = datetime.now().strftime("%I:%M %p, %b %d")
        submission = Submission.objects.create(
            assignment=assignment,
            student_name=student_name,
            file_path=",".join(paths) if paths else None,
            submitted_at=now_str,
        )

        return Response(SubmissionSerializer(submission).data, status=status.HTTP_201_CREATED)


class SubmissionDetailView(APIView):
    permission_classes = [AllowAny]

    def delete(self, request, submission_id):
        sub = get_object_or_404(Submission, pk=submission_id)
        sub.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnsubmitAssignmentView(APIView):
    permission_classes = [AllowAny]

    def delete(self, request, assignment_id, student_name):
        subs = Submission.objects.filter(assignment_id=assignment_id, student_name=student_name)
        subs.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GradeSubmissionView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def put(self, request, submission_id):
        sub = get_object_or_404(Submission, pk=submission_id)
        grade = request.data.get("grade")
        if grade is not None:
            sub.grade = float(grade)
            sub.save()
        return Response(SubmissionSerializer(sub).data)
