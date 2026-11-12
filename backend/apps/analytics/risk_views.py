"""The Risk Intelligence dashboard: scores with reasons, class comparison, a watchlist and a CSV export."""
import csv

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.core.access import is_master_admin, managed_courses
from apps.core.permissions import IsTeacher

from . import risk as engine
from .models import RiskWatch

LEVEL_ORDER = {"high": 0, "moderate": 1, "low": 2, "no_data": 3}


def _bad(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _scope(request):
    """The classrooms in view: all of the teacher's, or one of them. Returns (classrooms, error)."""
    classrooms = managed_courses(request.user)
    course_id = request.query_params.get("course_id")
    if course_id not in (None, "", "all"):
        if not str(course_id).isdigit() or not classrooms.filter(pk=course_id).exists():
            return None, _bad("Choose one of your own classrooms.", status.HTTP_404_NOT_FOUND)
        classrooms = classrooms.filter(pk=course_id)
    return list(classrooms), None


def _safe(value):
    """Stop spreadsheet apps from running a cell that starts like a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


class RiskDashboardView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        classrooms, error = _scope(request)
        if error:
            return error
        risks = engine.analyse(classrooms)
        summary = engine.summary(risks)
        students = [r.as_dict(summary["class_average"], summary["class_sd"]) for r in risks.values()]
        students.sort(key=lambda s: (LEVEL_ORDER[s["level"]], -(s["score"] or 0), s["name"]))

        watches = {w.student_id: w for w in RiskWatch.objects.filter(teacher=request.user, status=RiskWatch.Status.OPEN)}
        for s in students:
            w = watches.get(s["student_id"])
            s["watch"] = {"id": w.pk, "note": w.note, "score_at_start": w.score_at_start, "since": w.created_at.isoformat()} if w else None

        if request.query_params.get("export") == "csv":
            out = HttpResponse(content_type="text/csv")
            out["Content-Disposition"] = 'attachment; filename="risk_report.csv"'
            writer = csv.writer(out)
            writer.writerow(["Student", "Register no.", "Email", "Risk score", "Level", "Average %", "Graded results",
                             "Missing", "Past due", "Late", "Trend (points per result)", "Exam flags", "Reasons", "Suggested next step", "On watchlist"])
            for s in students:
                writer.writerow([_safe(s["name"]), _safe(s["register_no"]), s["email"], s["score"], s["level"], s["average"], s["results_count"],
                                 s["missing_count"], s["past_due_count"], s["late_count"], s["trend_slope"], s["integrity_flags"],
                                 _safe(" ".join(r["text"] for r in s["reasons"])), _safe(s["next_step"]), "yes" if s["watch"] else ""])
            return out

        # Class comparison: the same numbers per classroom, for the whole-teacher view.
        courses = []
        if len(classrooms) > 1:
            for c in classrooms:
                part = engine.summary(engine.analyse([c]))
                courses.append({"id": c.pk, "name": c.name, "code": c.subject_code, "students": part["students"],
                                "high": part["levels"]["high"], "moderate": part["levels"]["moderate"],
                                "average": part["class_average"]})
        return Response({
            "generated_at": timezone.now().isoformat(),
            "scope": {"course_id": classrooms[0].pk if len(classrooms) == 1 and request.query_params.get("course_id") else None,
                      "classrooms": [{"id": c.pk, "name": c.name, "code": c.subject_code} for c in managed_courses(request.user)]},
            "summary": summary,
            "courses": courses,
            "students": students,
            "method": {
                "max_points": {"marks": engine.MARKS_POINTS, "missing_and_late": engine.MISSING_POINTS + engine.LATE_POINTS,
                               "trend": engine.TREND_POINTS, "integrity": engine.FLAG_POINTS},
                "levels": {"high": engine.HIGH, "moderate": engine.MODERATE},
                "marks_safe_from": engine.MARKS_SAFE,
                "marks_full_at": engine.MARKS_FLOOR,
                "not_counted": ["attendance (not recorded)", "live quizzes (not linked to a classroom)"],
            },
        })


def _my_student(teacher, student_id):
    students = User.objects.filter(role=User.Role.STUDENT, is_active=True)
    if not is_master_admin(teacher):
        students = students.filter(enrollments__classroom__in=managed_courses(teacher), enrollments__is_active=True)
    return students.filter(pk=student_id).first() if str(student_id).isdigit() else None


def _watch_json(w, current=None):
    return {"id": w.pk, "student_id": w.student_id, "student_name": w.student.full_name or w.student.email, "note": w.note,
            "status": w.status, "score_at_start": w.score_at_start, "score_now": current,
            "created_at": w.created_at.isoformat(), "resolved_at": w.resolved_at.isoformat() if w.resolved_at else None}


class WatchListView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        watches = list(RiskWatch.objects.filter(teacher=request.user).select_related("student"))
        risks = engine.analyse(list(managed_courses(request.user))) if watches else {}
        return Response([_watch_json(w, risks[w.student_id].score if w.student_id in risks else None) for w in watches])

    def post(self, request):
        student = _my_student(request.user, request.data.get("student_id"))
        if student is None:
            return _bad("Choose a student from your own classrooms.")
        note = request.data.get("note", "")
        if not isinstance(note, str) or len(note) > 2000:
            return _bad("The note must be text of at most 2000 characters.")
        if RiskWatch.objects.filter(teacher=request.user, student=student, status=RiskWatch.Status.OPEN).exists():
            return _bad("This student is already on your watchlist.", status.HTTP_409_CONFLICT)
        risks = engine.analyse(list(managed_courses(request.user)))
        current = risks[student.pk].score if student.pk in risks else None
        w = RiskWatch.objects.create(teacher=request.user, student=student, note=note.strip(), score_at_start=current)
        return Response(_watch_json(w, current), status=status.HTTP_201_CREATED)


class WatchDetailView(APIView):
    permission_classes = [IsTeacher]

    def patch(self, request, watch_id):
        w = get_object_or_404(RiskWatch.objects.select_related("student"), pk=watch_id, teacher=request.user)
        if "note" in request.data:
            note = request.data.get("note")
            if not isinstance(note, str) or len(note) > 2000:
                return _bad("The note must be text of at most 2000 characters.")
            w.note = note.strip()
        if "status" in request.data:
            new = request.data.get("status")
            if new not in RiskWatch.Status.values:
                return _bad("Status must be open or resolved.")
            if new == RiskWatch.Status.OPEN and w.status != new and RiskWatch.objects.filter(
                    teacher=request.user, student=w.student, status=RiskWatch.Status.OPEN).exclude(pk=w.pk).exists():
                return _bad("This student is already on your watchlist.", status.HTTP_409_CONFLICT)
            w.status = new
            w.resolved_at = timezone.now() if new == RiskWatch.Status.RESOLVED else None
        w.save()
        return Response(_watch_json(w))

    def delete(self, request, watch_id):
        get_object_or_404(RiskWatch, pk=watch_id, teacher=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyProgressView(APIView):
    """A student's own progress, from the same signals as the teacher's risk dashboard.

    It shows where the student stands and what to do next, but never the numeric risk score:
    that is a tool for teachers, not a grade."""

    def get(self, request):
        from apps.core.access import visible_courses

        student = request.user
        if getattr(student, "role", "") != User.Role.STUDENT:
            return _bad("This page is for students.", status.HTTP_403_FORBIDDEN)
        courses = list(visible_courses(student))
        overall = engine.analyse(courses, only_student=student.pk).get(student.pk) if courses else None
        per_course = []
        for c in courses:
            mine = engine.analyse([c], only_student=student.pk).get(student.pk)
            if mine:
                per_course.append(engine.student_view(mine, c))
        order = {"act_now": 0, "needs_attention": 1, "on_track": 2, "getting_started": 3}
        per_course.sort(key=lambda x: order[x["status"]])
        return Response({
            "overall": engine.student_view(overall) if overall else None,
            "courses": per_course,
        })
