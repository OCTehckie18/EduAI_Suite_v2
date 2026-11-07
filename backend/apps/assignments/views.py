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
from apps.core.services import notify, record_student_activity
from apps.core.permissions import IsTeacher
from apps.announcements.models import Announcement
from rest_framework.exceptions import ValidationError

from apps.core.utils.file_uploads import save_optional_upload, validate_upload
from .models import Assignment, Submission
from .serializers import AssignmentSerializer, SubmissionSerializer

# Students hand in PDF or Word files only, so teachers can always preview them (as in Google Classroom).
SUBMISSION_EXTENSIONS = {".pdf", ".docx"}
_SIGNATURES = {".pdf": b"%PDF", ".docx": b"PK\x03\x04"}


def _check_submission_file(file):
    try:
        extension = validate_upload(file, SUBMISSION_EXTENSIONS)
    except ValidationError:
        raise ValidationError({"detail": "Only PDF or Word (.docx) files can be submitted."})
    head = file.read(4)
    file.seek(0)
    if head != _SIGNATURES[extension]:
        raise ValidationError({"detail": f"'{file.name}' is not a valid {extension[1:].upper()} file."})


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


class SubmissionListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, assignment_id):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        if not can_view_course(request.user, assignment.course):
            return DENIED
        submissions = Submission.objects.filter(assignment=assignment)
        if not can_manage_course(request.user, assignment.course):
            submissions = submissions.filter(student=request.user)  # students never see classmates' work
        return Response(SubmissionSerializer(submissions, many=True).data)

    def post(self, request, assignment_id):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        user = request.user
        if getattr(user, "role", "") != "STUDENT" or not can_view_course(user, assignment.course):
            return Response({"detail": "Only students enrolled in this course can submit work."}, status=status.HTTP_403_FORBIDDEN)
        # The submitter is the signed-in student, never a name typed by the client.
        student_name = user.full_name

        files = request.FILES.getlist("files") or request.FILES.getlist("file")
        # Check every file before saving any, so a bad one doesn't leave a half-saved submission.
        for f in files:
            _check_submission_file(f)
        paths = []
        for f in files:
            p = save_optional_upload(f, "submissions", allowed_extensions=SUBMISSION_EXTENSIONS)
            if p:
                paths.append(p)

        now_str = datetime.now().strftime("%I:%M %p, %b %d")
        existing = Submission.objects.filter(assignment=assignment, student=user).order_by("-id").first()
        if existing:
            # Handing in again replaces the earlier attempt; the new work has not been graded yet.
            existing.student_name = student_name
            existing.file_path = ",".join(paths) if paths else existing.file_path
            existing.submitted_at = now_str
            existing.grade = None
            existing.save()
            return Response(SubmissionSerializer(existing).data, status=status.HTTP_200_OK)
        submission = Submission.objects.create(
            assignment=assignment,
            student=user,
            student_name=student_name,
            file_path=",".join(paths) if paths else None,
            submitted_at=now_str,
        )

        return Response(SubmissionSerializer(submission).data, status=status.HTTP_201_CREATED)


class SubmissionDetailView(APIView):

    def delete(self, request, submission_id):
        sub = get_object_or_404(Submission.objects.select_related("assignment__course"), pk=submission_id)
        owns = sub.student_id == request.user.pk
        if not (can_manage_course(request.user, sub.assignment.course) or owns):
            return DENIED
        sub.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnsubmitAssignmentView(APIView):

    def delete(self, request, assignment_id, student_name):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        user = request.user
        if can_manage_course(user, assignment.course):
            Submission.objects.filter(assignment=assignment, student_name=student_name).delete()
        elif can_view_course(user, assignment.course):
            # Students can only withdraw their own work, whatever name is in the URL, and not once graded.
            own = Submission.objects.filter(assignment=assignment, student=user)
            if own.filter(grade__isnull=False).exists():
                return Response({"detail": "Graded work cannot be withdrawn."}, status=status.HTTP_409_CONFLICT)
            own.delete()
        else:
            return DENIED
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
        if sub.student_id:
            record_student_activity(
                student_id=sub.student_id,
                activity_type="assignment",
                source_id=sub.assignment_id,
                title=sub.assignment.title or "Assignment",
                score=round(100 * value / sub.assignment.max_points, 1) if sub.assignment.max_points else None,
                status="graded",
            )
            notify([sub.student_id], "grade", f"{sub.assignment.title or 'Assignment'} was graded", f"{value:g} of {sub.assignment.max_points}", "/classroom")
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


def _gradebook_rows(classroom):
    """(assignments, rows): one row per enrolled student with their result for every assignment."""
    from apps.accounts.models import User
    from apps.classrooms.models import Enrollment

    assignments = list(Assignment.objects.filter(course=classroom).order_by("created_at", "id"))
    students = [
        e.student
        for e in Enrollment.objects.filter(classroom=classroom, is_active=True, student__role=User.Role.STUDENT)
        .select_related("student").order_by("student__first_name", "student__last_name", "student__email")
    ]
    latest = {}
    for sub in Submission.objects.filter(assignment__in=assignments, student__in=students).order_by("id"):
        latest[(sub.student_id, sub.assignment_id)] = sub

    rows = []
    for student in students:
        cells, earned, possible = [], 0.0, 0
        for assignment in assignments:
            sub = latest.get((student.pk, assignment.pk))
            cells.append({
                "assignment_id": assignment.pk,
                "submission_id": sub.pk if sub else None,
                "submitted": sub is not None,
                "grade": sub.grade if sub else None,
            })
            if sub is not None and sub.grade is not None:
                earned += sub.grade
                possible += assignment.max_points
        rows.append({
            "student_id": student.pk,
            "name": student.full_name,
            "email": student.email,
            "register_no": student.register_no,
            "cells": cells,
            "earned": round(earned, 2),
            "possible": possible,
            "percentage": round(100 * earned / possible, 1) if possible else None,
        })
    return assignments, rows


class GradebookView(APIView):
    """Every enrolled student against every assignment of one course (teacher only), optionally as CSV."""
    permission_classes = [IsTeacher]

    def get(self, request, course_id):
        classroom = get_object_or_404(Classroom, pk=course_id)
        if not can_manage_course(request.user, classroom):
            return DENIED
        assignments, rows = _gradebook_rows(classroom)
        if request.query_params.get("export") == "csv":
            import csv

            from django.http import HttpResponse

            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="gradebook_{classroom.subject_code}.csv"'
            writer = csv.writer(response)

            def safe(value):  # stop spreadsheet apps from running a cell that starts like a formula
                text = "" if value is None else str(value)
                return "'" + text if text[:1] in ("=", "+", "-", "@") else text

            writer.writerow(["Register no", "Name", "Email"] + [safe(f"{a.title} (/{a.max_points})") for a in assignments] + ["Earned", "Possible", "Percentage"])
            for row in rows:
                writer.writerow(
                    [safe(row["register_no"]), safe(row["name"]), safe(row["email"])]
                    + [("" if not c["submitted"] else ("Submitted" if c["grade"] is None else c["grade"])) for c in row["cells"]]
                    + [row["earned"], row["possible"], "" if row["percentage"] is None else row["percentage"]]
                )
            return response
        return Response({
            "course": {"id": classroom.pk, "code": classroom.subject_code, "name": classroom.name},
            "assignments": [{"id": a.pk, "title": a.title, "max_points": a.max_points, "due_date": a.due_date} for a in assignments],
            "students": rows,
        })


class MyGradesView(APIView):
    """A student's own results in one course."""

    def get(self, request, course_id):
        classroom = get_object_or_404(Classroom, pk=course_id)
        user = request.user
        if getattr(user, "role", "") != "STUDENT" or not can_view_course(user, classroom):
            return DENIED
        assignments, rows = _gradebook_rows(classroom)
        mine = next((row for row in rows if row["student_id"] == user.pk), None)
        return Response({
            "course": {"id": classroom.pk, "code": classroom.subject_code, "name": classroom.name},
            "assignments": [{"id": a.pk, "title": a.title, "max_points": a.max_points, "due_date": a.due_date} for a in assignments],
            "result": mine,
        })
