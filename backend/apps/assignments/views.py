from datetime import datetime
from django.shortcuts import get_object_or_404
from django.db.models import Q
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.core.access import can_manage_course, can_view_course
from apps.core.permissions import IsTeacher
from apps.announcements.models import Announcement
from apps.core.utils.file_uploads import save_optional_upload
from .models import Assignment, Submission
from .serializers import AssignmentSerializer, SubmissionSerializer


DENIED = Response({"detail": "You do not have permission to do that for this course."}, status=status.HTTP_403_FORBIDDEN)


def _bad_number(message):
    return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)


class AssignmentListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        return [IsTeacher()] if self.request.method == "POST" else super().get_permissions()

    def get(self, request, course_id):
        classroom = get_object_or_404(Classroom, pk=course_id)
        if not can_view_course(request.user, classroom):
            return DENIED
        assignments = Assignment.objects.filter(course_id=course_id)
        return Response(AssignmentSerializer(assignments, many=True).data)

    def post(self, request, course_id):
        classroom = get_object_or_404(Classroom, pk=course_id)
        if not can_manage_course(request.user, classroom):
            return DENIED
        data = request.data

        title = data.get("title", "")
        description = data.get("description", "")
        due_date = data.get("due_date", "")
        try:
            max_points = int(data.get("max_points", 100))
        except (TypeError, ValueError):
            return _bad_number("Maximum points must be a whole number.")
        if max_points < 0:
            return _bad_number("Maximum points cannot be negative.")

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
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [IsTeacher]

    def put(self, request, assignment_id):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        if not can_manage_course(request.user, assignment.course):
            return DENIED
        data = request.data

        if "title" in data and data["title"] is not None:
            assignment.title = data["title"]
        if "description" in data and data["description"] is not None:
            assignment.description = data["description"]
        if "due_date" in data and data["due_date"] is not None:
            assignment.due_date = data["due_date"]
        if "max_points" in data and data["max_points"] is not None:
            try:
                new_max = int(data["max_points"])
            except (TypeError, ValueError):
                return _bad_number("Maximum points must be a whole number.")
            if new_max < 0:
                return _bad_number("Maximum points cannot be negative.")
            assignment.max_points = new_max

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
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        if not can_manage_course(request.user, assignment.course):
            return DENIED
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


def _own_submissions(user):
    """Submissions are still keyed by name; a student's own are the ones filed under their name or email."""
    return Q(student_name__iexact=user.full_name) | Q(student_name__iexact=user.email)


class SubmissionListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, assignment_id):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        if not can_view_course(request.user, assignment.course):
            return DENIED
        submissions = Submission.objects.filter(assignment=assignment)
        if not can_manage_course(request.user, assignment.course):
            submissions = submissions.filter(_own_submissions(request.user))  # students never see classmates' work
        return Response(SubmissionSerializer(submissions, many=True).data)

    def post(self, request, assignment_id):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        user = request.user
        if getattr(user, "role", "") != "STUDENT" or not can_view_course(user, assignment.course):
            return Response({"detail": "Only students enrolled in this course can submit work."}, status=status.HTTP_403_FORBIDDEN)
        # The submitter is the signed-in student, never a name typed by the client.
        student_name = user.full_name

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

    def delete(self, request, submission_id):
        sub = get_object_or_404(Submission.objects.select_related("assignment__course"), pk=submission_id)
        owns = Submission.objects.filter(pk=sub.pk).filter(_own_submissions(request.user)).exists()
        if not (can_manage_course(request.user, sub.assignment.course) or owns):
            return DENIED
        sub.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnsubmitAssignmentView(APIView):

    def delete(self, request, assignment_id, student_name):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        user = request.user
        if not can_manage_course(user, assignment.course):
            own_names = {user.full_name.casefold(), user.email.casefold()}
            if not can_view_course(user, assignment.course) or student_name.casefold() not in own_names:
                return DENIED
        Submission.objects.filter(assignment=assignment, student_name=student_name).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GradeSubmissionView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [IsTeacher]

    def put(self, request, submission_id):
        sub = get_object_or_404(Submission.objects.select_related("assignment__course"), pk=submission_id)
        if not can_manage_course(request.user, sub.assignment.course):
            return DENIED
        grade = request.data.get("grade")
        if grade is None or grade == "":
            return Response(SubmissionSerializer(sub).data)
        try:
            value = float(grade)
        except (TypeError, ValueError):
            return _bad_number("The grade must be a number.")
        if value != value or value in (float("inf"), float("-inf")):
            return _bad_number("The grade must be a number.")
        if value < 0 or value > sub.assignment.max_points:
            return _bad_number(f"The grade must be between 0 and {sub.assignment.max_points}.")
        sub.grade = value
        sub.save()
        return Response(SubmissionSerializer(sub).data)


class RubricCriteriaListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import RubricCriterion
        rows = RubricCriterion.objects.filter(is_active=True).values(
            "id", "key", "label", "description", "weight", "max_score")
        return Response({"results": list(rows)})


class FeedbackTemplateListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import FeedbackTemplate
        rows = FeedbackTemplate.objects.filter(is_active=True).values("id", "mark", "text")
        return Response({"results": list(rows)})
