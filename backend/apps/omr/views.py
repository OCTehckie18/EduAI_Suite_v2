"""OMR: print a sheet, scan the filled sheets, review, and grade.

A teacher owns their jobs. Scans are read by `reader.py`; anything the reader is
not sure about is flagged for the teacher to settle before it counts.
"""
import csv

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom, Enrollment
from apps.core.access import can_manage_course, is_master_admin, managed_students
from apps.core.models import StudentActivity
from apps.core.permissions import IsTeacher
from apps.core.services import record_student_activity
from apps.core.utils.file_uploads import save_optional_upload

from . import layout as L
from .models import OMRJob, OMRSubmission
from .reader import SheetError, decode_image, read_sheet
from .template import build_template_pdf

User = get_user_model()

SCAN_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
MAX_SCANS_PER_REQUEST = 30
MAX_SCAN_BYTES = 12 * 1024 * 1024


def _bad(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _owned_job(user, job_id):
    job = get_object_or_404(OMRJob.objects.select_related("classroom"), pk=job_id)
    if not (is_master_admin(user) or job.owner_id == user.pk):
        return None
    return job


def _not_found():
    return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)


# ---- scoring -------------------------------------------------------------------

def clean_key(raw, n_questions):
    """({"1": "A", ...}, error). The key must answer every question with A to D."""
    if not isinstance(raw, dict):
        return None, "The answer key must list an answer for every question."
    key = {}
    for q in range(1, n_questions + 1):
        value = raw.get(str(q))
        value = value.strip().upper() if isinstance(value, str) else ""
        if len(value) != 1 or value not in L.OPTIONS:
            return None, f"Question {q} needs a correct answer from {', '.join(L.OPTIONS)}."
        key[str(q)] = value
    extra = set(raw) - set(key)
    if extra:
        return None, "The answer key has answers for questions that do not exist."
    return key, None


def percent_correct(key, answers):
    if not key:
        return 0.0
    right = sum(1 for q, correct in key.items() if (answers or {}).get(q) == correct)
    return round(100 * right / len(key), 1)


def sync_activity(sub):
    """Keep the student's record in step with a verified sheet, and clear it when it stops counting."""
    source = f"omr:{sub.job_id}"
    if sub.student_id and sub.status == OMRSubmission.Status.VERIFIED:
        record_student_activity(
            student_id=sub.student_id, activity_type="exam", source_id=source,
            title=sub.job.title or "OMR exam", score=sub.score, status="graded",
        )


def clear_activity(student_id, job_id):
    if student_id:
        StudentActivity.objects.filter(student_id=student_id, activity_type="exam", source_id=f"omr:{job_id}").delete()


def find_student(job, register):
    """The enrolled student whose register number is `register`, or None."""
    if not register:
        return None
    student = User.objects.filter(register_no=register, role=User.Role.STUDENT, is_active=True).first()
    if student is None:
        return None
    if job.classroom_id and not Enrollment.objects.filter(classroom_id=job.classroom_id, student=student, is_active=True).exists():
        return None
    return student


def sub_json(sub):
    return {
        "id": sub.pk,
        "job_id": sub.job_id,
        "student_id": sub.student_id,
        "student_name": (sub.student.full_name or sub.student.email) if sub.student else None,
        "register_read": sub.register_read,
        "image_url": sub.image_url,
        "detected_answers": sub.detected_answers or {},
        "issues": sub.issues or {},
        "score": sub.score,
        "status": sub.status,
        "created_at": sub.created_at.isoformat(),
    }


def job_json(job, with_counts=True):
    data = {
        "id": job.pk,
        "title": job.title,
        "num_questions": job.num_questions,
        "answer_key": job.answer_key or {},
        "classroom_id": job.classroom_id,
        "classroom_name": job.classroom.name if job.classroom_id else None,
        "created_at": job.created_at.isoformat(),
    }
    if with_counts:
        subs = list(job.submissions.values_list("status", flat=True))
        data["sheet_count"] = len(subs)
        data["needs_review"] = sum(1 for s in subs if s == OMRSubmission.Status.NEEDS_REVIEW)
    return data


# ---- jobs ----------------------------------------------------------------------

class OMRJobListCreateView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        jobs = OMRJob.objects.select_related("classroom")
        if not is_master_admin(request.user):
            jobs = jobs.filter(owner=request.user)
        return Response([job_json(j) for j in jobs])

    def post(self, request):
        data = request.data
        title = data.get("title")
        title = title.strip() if isinstance(title, str) else ""
        if not title or len(title) > 255:
            return _bad("Give the exam a title of up to 255 characters.")
        try:
            n = int(data.get("num_questions"))
        except (TypeError, ValueError):
            return _bad("Say how many questions the exam has.")
        if not 1 <= n <= L.MAX_QUESTIONS:
            return _bad(f"An exam can have 1 to {L.MAX_QUESTIONS} questions.")
        key, error = clean_key(data.get("answer_key"), n)
        if error:
            return _bad(error)
        classroom = None
        if data.get("classroom_id") not in (None, ""):
            classroom = Classroom.objects.filter(pk=data.get("classroom_id")).first() if str(data.get("classroom_id")).isdigit() else None
            if classroom is None or not can_manage_course(request.user, classroom):
                return _bad("Choose one of your own classrooms, or leave it empty.")
        job = OMRJob.objects.create(owner=request.user, classroom=classroom, title=title, num_questions=n, answer_key=key)
        return Response(job_json(job), status=status.HTTP_201_CREATED)


class OMRJobDetailView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, job_id):
        job = _owned_job(request.user, job_id)
        return Response(job_json(job)) if job else _not_found()

    def patch(self, request, job_id):
        job = _owned_job(request.user, job_id)
        if job is None:
            return _not_found()
        data = request.data
        if "title" in data:
            title = data.get("title")
            title = title.strip() if isinstance(title, str) else ""
            if not title or len(title) > 255:
                return _bad("Give the exam a title of up to 255 characters.")
            job.title = title
        key = None
        if "answer_key" in data:
            key, error = clean_key(data.get("answer_key"), job.num_questions)
            if error:
                return _bad(error)
        with transaction.atomic():
            if key is not None:
                job.answer_key = key
            job.save()
            if key is not None or "title" in data:
                # A changed key re-grades every sheet already scanned.
                for sub in job.submissions.select_related("job", "student"):
                    sub.score = percent_correct(job.answer_key, sub.detected_answers)
                    sub.save(update_fields=["score"])
                    sync_activity(sub)
        return Response(job_json(job))

    def delete(self, request, job_id):
        job = _owned_job(request.user, job_id)
        if job is None:
            return _not_found()
        with transaction.atomic():
            for sub in job.submissions.all():
                clear_activity(sub.student_id, job.pk)
            job.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OMRTemplateView(APIView):
    """The printable answer sheet for this exam."""

    permission_classes = [IsTeacher]

    def get(self, request, job_id):
        job = _owned_job(request.user, job_id)
        if job is None:
            return _not_found()
        response = HttpResponse(build_template_pdf(job.title or "Answer sheet", job.num_questions), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="omr_sheet_{job.pk}.pdf"'
        return response


# ---- sheets --------------------------------------------------------------------

class OMRSubmissionListCreateView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, job_id):
        job = _owned_job(request.user, job_id)
        if job is None:
            return _not_found()
        subs = list(job.submissions.select_related("student", "job"))
        if request.query_params.get("export") == "csv":
            return self._csv(job, subs)
        return Response([sub_json(s) for s in subs])

    @staticmethod
    def _csv(job, subs):
        def safe(value):  # stop spreadsheet apps from running a cell that starts like a formula
            text = "" if value is None else str(value)
            return "'" + text if text[:1] in ("=", "+", "-", "@") else text

        out = HttpResponse(content_type="text/csv")
        out["Content-Disposition"] = f'attachment; filename="omr_results_{job.pk}.csv"'
        writer = csv.writer(out)
        writer.writerow(["Student", "Email", "Register read", "Score %", "Status", *[f"Q{q}" for q in range(1, job.num_questions + 1)]])
        for s in subs:
            answers = s.detected_answers or {}
            writer.writerow([
                safe(s.student.full_name if s.student else ""), safe(s.student.email if s.student else ""), safe(s.register_read),
                s.score, s.status, *[answers.get(str(q)) or "" for q in range(1, job.num_questions + 1)],
            ])
        return out

    def post(self, request, job_id):
        job = _owned_job(request.user, job_id)
        if job is None:
            return _not_found()
        files = request.FILES.getlist("files") or request.FILES.getlist("file") or request.FILES.getlist("image")
        if not files:
            return _bad("Attach at least one scanned sheet (JPG, PNG or PDF).")
        if len(files) > MAX_SCANS_PER_REQUEST:
            return _bad(f"Upload at most {MAX_SCANS_PER_REQUEST} sheets at a time.")

        results = []
        taken = set(job.submissions.exclude(student=None).values_list("student_id", flat=True))
        for f in files:
            name = f.name
            try:
                if f.size > MAX_SCAN_BYTES:
                    raise SheetError("That file is too large (12 MB at most).")
                image = decode_image(f.read(), name)
                reading = read_sheet(image, job.num_questions)
                f.seek(0)
                path = save_optional_upload(f, "omr", allowed_extensions=SCAN_EXTENSIONS)
            except SheetError as exc:
                results.append({"filename": name, "error": str(exc)})
                continue
            except Exception:  # unsupported extension, unreadable data: never a 500 for one bad file
                results.append({"filename": name, "error": "That file could not be used. Send a JPG, PNG or PDF of one sheet."})
                continue

            answers = {str(q): r.answer for q, r in reading.questions.items()}
            problems = {str(q): r.state for q, r in reading.questions.items() if r.state != "ok"}
            notes = []
            student = find_student(job, reading.register) if reading.register_ok else None
            if not reading.register_ok:
                notes.append("The register number could not be read. Choose the student yourself.")
            elif student is None:
                notes.append(f"No student in this exam's classroom has register number {reading.register}. Choose the student yourself.")
            elif student.pk in taken:
                notes.append(f"{student.full_name or student.email} already has a sheet for this exam. Check which one is right.")
                student = None
            if student:
                taken.add(student.pk)
            sub = OMRSubmission.objects.create(
                job=job, student=student, register_read=reading.register, image_url=path, detected_answers=answers,
                issues={"questions": problems, "notes": notes},
                score=percent_correct(job.answer_key, answers),
                status=OMRSubmission.Status.VERIFIED if not problems and not notes else OMRSubmission.Status.NEEDS_REVIEW,
            )
            sync_activity(sub)
            results.append({"filename": name, "submission": sub_json(sub)})
        made = any("submission" in r for r in results)
        return Response({"results": results}, status=status.HTTP_201_CREATED if made else status.HTTP_400_BAD_REQUEST)


class OMRSubmissionDetailView(APIView):
    permission_classes = [IsTeacher]

    def _sub(self, request, submission_id):
        sub = get_object_or_404(OMRSubmission.objects.select_related("job__classroom", "student"), pk=submission_id)
        return sub if _owned_job(request.user, sub.job_id) else None

    def get(self, request, submission_id):
        sub = self._sub(request, submission_id)
        return Response(sub_json(sub)) if sub else _not_found()

    def patch(self, request, submission_id):
        sub = self._sub(request, submission_id)
        if sub is None:
            return _not_found()
        job, data = sub.job, request.data
        old_student = sub.student_id

        answers = dict(sub.detected_answers or {})
        edited = []
        if "answers" in data:
            given = data.get("answers")
            if not isinstance(given, dict):
                return _bad("answers must map question numbers to A to D.")
            for q, value in given.items():
                if not (str(q).isdigit() and 1 <= int(q) <= job.num_questions):
                    return _bad(f"Question {q} does not exist on this exam.")
                value = value.strip().upper() if isinstance(value, str) else None
                if value not in (None, "", *L.OPTIONS):
                    return _bad(f"Question {q}: the answer must be one of {', '.join(L.OPTIONS)} or empty.")
                answers[str(int(q))] = value or None
                edited.append(str(int(q)))

        student = sub.student
        if "student_id" in data:
            if data.get("student_id") in (None, ""):
                student = None
            else:
                allowed = managed_students(request.user)
                if job.classroom_id:
                    allowed = allowed.filter(enrollments__classroom_id=job.classroom_id, enrollments__is_active=True)
                student = allowed.filter(pk=data.get("student_id")).first() if str(data.get("student_id")).isdigit() else None
                if student is None:
                    return _bad("Choose a student from this exam's classroom.")
                if job.submissions.filter(student=student).exclude(pk=sub.pk).exists():
                    return _bad("That student already has a sheet for this exam.", status.HTTP_409_CONFLICT)

        with transaction.atomic():
            sub.detected_answers = answers
            issues = sub.issues or {"questions": {}, "notes": []}
            for q in edited:
                issues.get("questions", {}).pop(q, None)
            if "student_id" in data and student:
                issues["notes"] = []
            sub.issues = issues
            sub.student = student
            sub.score = percent_correct(job.answer_key, answers)
            if data.get("confirm") is True:
                if student is None:
                    return _bad("Choose the student before confirming this sheet.")
                sub.status = OMRSubmission.Status.VERIFIED
            elif edited or "student_id" in data:
                sub.status = OMRSubmission.Status.NEEDS_REVIEW if (issues.get("questions") or student is None) else OMRSubmission.Status.VERIFIED
            sub.save()
            if old_student and old_student != sub.student_id:
                clear_activity(old_student, job.pk)
            if sub.status == OMRSubmission.Status.VERIFIED:
                sync_activity(sub)
            else:
                clear_activity(sub.student_id, job.pk)
        return Response(sub_json(sub))

    def delete(self, request, submission_id):
        sub = self._sub(request, submission_id)
        if sub is None:
            return _not_found()
        clear_activity(sub.student_id, sub.job_id)
        sub.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
