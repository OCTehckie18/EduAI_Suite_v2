import csv
import io
import random
import re
import string

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q
from openpyxl import Workbook, load_workbook
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import roster
from apps.core.access import visible_courses
from apps.accounts.models import User
from apps.institution.models import Batch, Department, Program, Section
from apps.core.models import ActionHistory
from apps.core.permissions import IsTeacher
from apps.core.utils.file_uploads import safe_upload_name, validate_upload
from apps.assignments.models import Submission

from .models import Classroom, Enrollment, Resource


ADMIN_ROLES = {User.Role.MASTER_ADMIN}


def _is_admin(user):
    return getattr(user, "role", None) in ADMIN_ROLES or getattr(user, "is_superuser", False)


def _forbidden():
    return Response({"detail": "You do not have permission to perform this action."}, status=status.HTTP_403_FORBIDDEN)


def _manages(user, classroom):
    return _is_admin(user) or classroom.teacher_id == user.pk


def _manages_student(user, student):
    if student.role != User.Role.STUDENT:
        return False
    return _is_admin(user) or Enrollment.objects.filter(
        student=student, is_active=True, classroom__teacher=user
    ).exists()


def _is_enrolled(user, classroom):
    return Enrollment.objects.filter(classroom=classroom, student=user, is_active=True).exists()


def _visible_classroom(user, course_id):
    try:
        return Classroom.objects.select_related(
            "teacher", "department", "program", "batch", "section"
        ).get(pk=course_id)
    except Classroom.DoesNotExist:
        return None


def _progress(classroom, viewer):
    """For a student, the share of this course's assignments they have handed in.
    For the teacher, the share of handed-in work that has been marked. None when there is nothing to count."""
    from apps.assignments.models import Assignment, Submission

    if viewer is not None and getattr(viewer, "role", None) == User.Role.STUDENT:
        total = Assignment.objects.filter(course=classroom).count()
        if not total:
            return None
        done = Submission.objects.filter(assignment__course=classroom, student=viewer).values("assignment_id").distinct().count()
        return round(100 * done / total, 1)
    handed_in = Submission.objects.filter(assignment__course=classroom)
    count = handed_in.count()
    if not count:
        return None
    return round(100 * handed_in.filter(grade__isnull=False).count() / count)


def _course_stats(classrooms, viewer):
    """{course_id: {"students": n, "progress": p}} for many courses at once (a few queries, not several per course)."""
    from django.db.models import Count, Q

    from apps.assignments.models import Assignment, Submission

    ids = [c.pk for c in classrooms]
    students = dict(
        Enrollment.objects.filter(classroom_id__in=ids, is_active=True, student__role=User.Role.STUDENT)
        .values_list("classroom_id").annotate(n=Count("id"))
    )
    stats = {pk: {"students": students.get(pk, 0), "progress": None} for pk in ids}
    if viewer is not None and getattr(viewer, "role", None) == User.Role.STUDENT:
        totals = dict(Assignment.objects.filter(course_id__in=ids).values_list("course_id").annotate(n=Count("id")))
        done = dict(
            Submission.objects.filter(assignment__course_id__in=ids, student=viewer)
            .values_list("assignment__course_id").annotate(n=Count("assignment_id", distinct=True))
        )
        for pk in ids:
            if totals.get(pk):
                stats[pk]["progress"] = round(100 * done.get(pk, 0) / totals[pk], 1)
    else:
        rows = (
            Submission.objects.filter(assignment__course_id__in=ids)
            .values("assignment__course_id").annotate(total=Count("id"), marked=Count("id", filter=Q(grade__isnull=False)))
        )
        for row in rows:
            if row["total"]:
                stats[row["assignment__course_id"]]["progress"] = round(100 * row["marked"] / row["total"])
    return stats


def _course_payload(classroom, viewer=None, stats=None):
    students_count = stats["students"] if stats else Enrollment.objects.filter(
        classroom=classroom,
        is_active=True,
        student__role=User.Role.STUDENT,
    ).count()

    teacher_name = classroom.teacher.full_name if classroom.teacher else "Faculty"
    batch_name = classroom.batch.name if classroom.batch else ""

    return {
        "id": classroom.pk,
        "code": classroom.subject_code,
        "name": classroom.name,
        "batch": batch_name,
        "students": students_count,
        "progress": stats["progress"] if stats else _progress(classroom, viewer),
        "color": classroom.color or "#0b4a87",
        "description": classroom.description or "",
        # The join code is for the course's teacher; classmates have no use for it.
        "enrollment_code": classroom.enrollment_code if viewer is None or _manages(viewer, classroom) else None,
        "teacher_name": teacher_name,
        "course_plan_path": classroom.course_plan_path or None,
        "department_id": classroom.department_id,
        "program_id": classroom.program_id,
        "batch_id": classroom.batch_id,
        "section_id": classroom.section_id,
    }


def _student_list_payload(students, course_id):
    """The payload for a class list: the averages come from one query for the whole class."""
    from apps.assignments.stats import average_by_student

    students = list(students)
    averages = average_by_student([s.pk for s in students], [course_id])
    return [_student_payload(student, course_id, average=averages.get(student.pk)) for student in students]


_UNSET = object()


def _student_payload(student, course_id, average=_UNSET):
    from apps.assignments.stats import average_for

    # Marks-based average for this course, or None when nothing has been graded. Attendance is not recorded.
    avg_score = average_for(student.pk, [course_id]) if average is _UNSET else average
    attendance = None

    return {
        "id": student.pk,
        "student_id": student.pk,
        "course_id": course_id,
        "name": student.full_name,
        "email": student.email,
        "registration_number": student.register_no or f"REG-{student.id}",
        "student_class": student.section.name if student.section_id else (student.batch.name if student.batch_id else "General"),
        "department": student.department.name if student.department_id else "General",
        "attendance": attendance,
        "avg_score": avg_score,
    }


def _unique_enrollment_code(preferred=None, current=None):
    if preferred:
        preferred = str(preferred).strip()
        if preferred and (preferred == current or not Classroom.objects.filter(enrollment_code=preferred).exists()):
            return preferred
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if not Classroom.objects.filter(enrollment_code=code).exists():
            return code


def _as_id(value):
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _resolve_batch(data, teacher, acting_user):
    """Department, program, class and optional section for a course, taken from the real structure.

    The class comes from ``batch_id`` (or, for older clients, a class name inside the teacher's own
    department). Department and program are always derived from the class, never guessed.
    """
    is_master = _is_admin(acting_user)
    batch = None
    batch_id = _as_id(data.get("batch_id"))
    if batch_id:
        batch = Batch.objects.select_related("program__department").filter(pk=batch_id).first()
    elif str(data.get("batch") or "").strip() and teacher.department_id:
        batch = Batch.objects.select_related("program__department").filter(
            program__department_id=teacher.department_id, name__iexact=str(data.get("batch")).strip()
        ).first()
    if batch is None:
        raise ValueError(
            "Choose the class this course is for. If your class is not listed, ask the master admin to add it under Institution Structure."
        )
    program = batch.program
    department = program.department
    if not is_master:
        if not teacher.department_id:
            raise ValueError("Complete your profile (department) before creating courses.")
        if teacher.department_id != department.pk:
            raise ValueError("You can only create courses for classes in your own department.")

    section = None
    section_id = _as_id(data.get("section_id"))
    section_name = str(data.get("section") or "").strip()
    if section_id:
        section = Section.objects.filter(pk=section_id, batch=batch).first()
        if section is None:
            raise ValueError("That section does not belong to the selected class.")
    elif section_name:
        section = Section.objects.filter(batch=batch, name__iexact=section_name).first()
        if section is None:
            raise ValueError(f"Section '{section_name}' does not exist in the selected class.")
    return department, program, batch, section


def _resolve_classroom_context(data, current_user):
    teacher = None
    if _is_admin(current_user):
        teacher = User.objects.filter(pk=_as_id(data.get("teacher")), role=User.Role.TEACHER).first()
        if teacher is None:
            raise ValueError("Choose the teacher who will run this course.")
    elif getattr(current_user, "role", None) == User.Role.TEACHER:
        teacher = current_user
    if teacher is None:
        raise ValueError("Only teachers can create courses.")
    department, program, batch, section = _resolve_batch(data, teacher, current_user)
    return teacher, department, program, batch, section


def _save_course_plan(uploaded_file):
    if not uploaded_file:
        return ""
    validate_upload(uploaded_file, {".pdf", ".docx", ".pptx", ".txt", ".md"})
    name = safe_upload_name(uploaded_file.name)
    return default_storage.save(f"courses/{name}", ContentFile(uploaded_file.read()))


class LegacyCourseListCreateView(APIView):
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        # Teachers see their own courses, students the ones they are enrolled in, master admins all.
        classrooms = visible_courses(request.user).select_related(
            "teacher", "department", "program", "batch", "section"
        )
        classrooms = list(classrooms)
        stats = _course_stats(classrooms, request.user)
        return Response([_course_payload(classroom, request.user, stats[classroom.pk]) for classroom in classrooms])

    @transaction.atomic
    def post(self, request):
        if not (_is_admin(request.user) or request.user.role == User.Role.TEACHER):
            return _forbidden()
        try:
            teacher, department, program, batch, section = _resolve_classroom_context(request.data, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if not _is_admin(request.user):
            teacher = request.user

        code = str(request.data.get("code") or request.data.get("subject_code") or "").strip()
        name = str(request.data.get("name") or "").strip()
        if not code or not name:
            return Response({"detail": "Course code and name are required."}, status=status.HTTP_400_BAD_REQUEST)

        classroom = Classroom.objects.create(
            name=name,
            subject_code=code,
            teacher=teacher,
            department=department,
            program=program,
            batch=batch,
            section=section,
            enrollment_code=_unique_enrollment_code(request.data.get("enrollment_code")),
            color=str(request.data.get("color") or "#0b4a87"),
            description=str(request.data.get("description") or ""),
            course_plan_path=_save_course_plan(request.FILES.get("file")),
        )
        return Response(_course_payload(classroom), status=status.HTTP_201_CREATED)


class LegacyCourseOptionsView(APIView):
    """The classes a teacher can create a course for: programs > classes > sections of their department."""

    def get(self, request):
        user = request.user
        if not (_is_admin(user) or getattr(user, "role", None) == User.Role.TEACHER):
            return _forbidden()
        departments = Department.objects.all() if _is_admin(user) else Department.objects.filter(pk=user.department_id)
        programs = Program.objects.filter(department__in=departments).select_related("department").order_by("name")
        payload = []
        for program in programs:
            batches = []
            for batch in Batch.objects.filter(program=program).order_by("-start_year", "name"):
                batches.append({
                    "id": batch.pk,
                    "name": batch.name,
                    "academic_year": batch.academic_year,
                    "sections": [
                        {"id": section.pk, "name": section.name}
                        for section in Section.objects.filter(batch=batch).order_by("name")
                    ],
                })
            payload.append({
                "id": program.pk, "name": program.name, "code": program.code,
                "department": program.department.name, "batches": batches,
            })
        department = user.department if not _is_admin(user) and user.department_id else None
        return Response({
            "department": {"id": department.pk, "name": department.name} if department else None,
            "programs": payload,
        })


class LegacyCourseDetailView(APIView):
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _get(self, request, course_id, write=False):
        classroom = _visible_classroom(request.user, course_id)
        if classroom is None:
            return None, Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        allowed = _manages(request.user, classroom) or (not write and _is_enrolled(request.user, classroom))
        if not allowed:
            return None, _forbidden()
        return classroom, None

    def get(self, request, course_id):
        classroom, error = self._get(request, course_id)
        return error or Response(_course_payload(classroom, request.user))

    @transaction.atomic
    def put(self, request, course_id):
        classroom, error = self._get(request, course_id, write=True)
        if error:
            return error
        data = request.data
        if "code" in data or "subject_code" in data:
            classroom.subject_code = str(data.get("code") or data.get("subject_code") or "").strip()
        if "name" in data:
            classroom.name = str(data.get("name") or "").strip()
        if "description" in data:
            classroom.description = str(data.get("description") or "")
        if "color" in data:
            classroom.color = str(data.get("color") or "#0b4a87")
        if "enrollment_code" in data:
            classroom.enrollment_code = _unique_enrollment_code(data.get("enrollment_code"), classroom.enrollment_code)
        if "batch" in data or "batch_id" in data:
            try:
                department, program, batch, section = _resolve_batch(data, classroom.teacher, request.user)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            classroom.department, classroom.program, classroom.batch, classroom.section = department, program, batch, section
        if request.FILES.get("file"):
            classroom.course_plan_path = _save_course_plan(request.FILES["file"])
        classroom.save()
        return Response(_course_payload(classroom, request.user))

    def patch(self, request, course_id):
        return self.put(request, course_id)

    def delete(self, request, course_id):
        classroom, error = self._get(request, course_id, write=True)
        if error:
            return error
        classroom.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LegacyCourseExtractDetailsView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "A PDF or DOCX file is required."}, status=status.HTTP_400_BAD_REQUEST)
        filename = uploaded_file.name.lower()
        contents = uploaded_file.read()
        try:
            if filename.endswith(".pdf"):
                from PyPDF2 import PdfReader
                text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(contents)).pages)
            elif filename.endswith(".docx"):
                from docx import Document
                document = Document(io.BytesIO(contents))
                text = "\n".join(paragraph.text for paragraph in document.paragraphs)
                text += "\n" + "\n".join(cell.text for table in document.tables for row in table.rows for cell in row.cells)
            else:
                raise ValueError("Unsupported file format. Please upload PDF or DOCX.")
        except Exception as exc:
            return Response({"detail": f"Could not parse file: {str(exc)}"}, status=status.HTTP_400_BAD_REQUEST)

        code_match = re.search(r"(?i)(?:course|subject)?\s*code\s*[:\-]?\s*([A-Z0-9_-]+)", text)
        name_match = re.search(r"(?i)(?:course|subject)?\s*(?:title|name)\s*[:\-]?\s*([^\n\r]+)", text)
        instructor_match = re.search(r"(?i)(?:instructor|faculty|teacher|professor)\s*[:\-]?\s*([^\n\r]+)", text)

        description_lines = []
        capture = False
        for line in text.splitlines():
            normalized = line.strip().lower()
            if "offered programme" in normalized:
                capture = True
                continue
            if any(marker in normalized for marker in ("course learning outcome", "outcome reference", "course credit", "unit", "syllabus")):
                break
            if capture and line.strip():
                description_lines.append(line.strip())
        return Response({
            "code": code_match.group(1).strip() if code_match else "",
            "name": name_match.group(1).strip() if name_match else "",
            "teacher_name": instructor_match.group(1).strip() if instructor_match else "",
            "programmes": " ".join(description_lines).strip(),
            "description": " ".join(description_lines).strip(),
        })


def _split_name(name):
    parts = str(name or "Student").strip().split()
    return (parts[0] if parts else "Student", " ".join(parts[1:]))


@transaction.atomic
def _enroll_student(classroom, data):
    email = str(data.get("email") or "").strip().lower()
    register_no = str(data.get("registration_number") or data.get("register_no") or "").strip()
    if not email and not register_no:
        raise ValueError("Student email or registration number is required.")

    student = User.objects.filter(email__iexact=email).first() if email else None
    student = student or (User.objects.filter(register_no__iexact=register_no).first() if register_no else None)
    if student and student.role != User.Role.STUDENT:
        raise ValueError("The matched account is not a student.")

    dept = classroom.department
    prog = classroom.program
    batch = classroom.batch
    sec = classroom.section
    school = getattr(dept, "school", None) if dept else None
    campus = getattr(school, "campus", None) if school else None

    if student is None:
        entry = roster.entry_for_identifiers(email, register_no)
        if entry is None:
            raise ValueError("This student is not on the admitted-students list. Ask the master admin to add them first.")
        student = roster.provision_student(entry)
    else:
        changed = []
        if register_no and not student.register_no:
            student.register_no = register_no
            changed.append("register_no")
        if not student.department_id and dept:
            student.department = dept
            changed.append("department")
        if not student.program_id and prog:
            student.program = prog
            changed.append("program")
        if not student.batch_id and batch:
            student.batch = batch
            changed.append("batch")
        if not student.section_id and sec:
            student.section = sec
            changed.append("section")
        if changed:
            student.save(update_fields=changed + ["updated_at"])

    existing = Enrollment.all_objects.filter(classroom=classroom, student=student).first()
    if existing and existing.is_active:
        raise ValueError("Student with this email is already enrolled in this course")
    if existing:
        existing.restore()
    else:
        Enrollment.objects.create(classroom=classroom, student=student)

    ActionHistory.objects.create(
        feature="student",
        action="create",
        result=f"Enrolled {student.full_name} in {classroom.name}",
        metadata_json={"student_id": student.id, "classroom_id": classroom.id},
    )
    return student


class LegacyCourseStudentsView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [JSONParser, FormParser]

    def get(self, request, course_id):
        classroom = Classroom.objects.filter(pk=course_id).first()
        if classroom:
            if not _manages(request.user, classroom):
                return _forbidden()
            students = User.objects.filter(
                enrollments__classroom=classroom,
                enrollments__is_active=True,
                role=User.Role.STUDENT,
            ).distinct().select_related("section", "batch", "department")
            return Response(_student_list_payload(students, classroom.pk))

        # If not a course, check if course_id is actually a student ID
        student = User.objects.filter(pk=course_id, role=User.Role.STUDENT).first()
        if student:
            if not _manages_student(request.user, student):
                return _forbidden()
            enrollment = Enrollment.objects.filter(student=student, is_active=True).first()
            return Response([_student_payload(student, enrollment.classroom_id if enrollment else 0)])

        return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)

    def post(self, request, course_id):
        classroom = Classroom.objects.filter(pk=course_id).first()
        if classroom is None:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _manages(request.user, classroom):
            return _forbidden()
        try:
            student = _enroll_student(classroom, request.data)
        except ValueError as exc:
            code = status.HTTP_409_CONFLICT if "already enrolled" in str(exc) else status.HTTP_400_BAD_REQUEST
            return Response({"detail": str(exc)}, status=code)
        return Response(_student_payload(student, classroom.pk), status=status.HTTP_201_CREATED)

    def put(self, request, course_id):
        return LegacyStudentDetailView().put(request, course_id)

    def patch(self, request, course_id):
        return LegacyStudentDetailView().patch(request, course_id)

    def delete(self, request, course_id):
        return LegacyStudentDeleteView().delete(request, course_id)


class LegacyStudentDetailView(APIView):
    parser_classes = [JSONParser, FormParser]

    def get(self, request, student_id):
        student = User.objects.filter(pk=student_id).first()
        if not student:
            return Response({"detail": "Student not found"}, status=status.HTTP_404_NOT_FOUND)
        if student.pk != request.user.pk and not _manages_student(request.user, student):
            return _forbidden()
        enrollment = Enrollment.objects.filter(student=student, is_active=True).first()
        course_id = enrollment.classroom_id if enrollment else 0
        return Response(_student_payload(student, course_id))

    def put(self, request, student_id):
        student = User.objects.filter(pk=student_id).first()
        if not student:
            return Response({"detail": "Student not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _manages_student(request.user, student):
            return _forbidden()
        data = request.data
        if "name" in data:
            fn, ln = _split_name(data["name"])
            student.first_name = fn
            student.last_name = ln
        if "email" in data and data["email"]:
            student.email = str(data["email"]).strip().lower()
        if "registration_number" in data or "register_no" in data:
            student.register_no = data.get("registration_number") or data.get("register_no")
        student.save()
        enrollment = Enrollment.objects.filter(student=student, is_active=True).first()
        course_id = enrollment.classroom_id if enrollment else 0
        ActionHistory.objects.create(
            feature="student",
            action="update",
            result=f"Updated student {student.full_name}",
            metadata_json={"student_id": student.id},
        )
        return Response(_student_payload(student, course_id))

    def patch(self, request, student_id):
        return self.put(request, student_id)

    def delete(self, request, student_id):
        return LegacyStudentDeleteView().delete(request, student_id)


class LegacyStudentListView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [JSONParser, FormParser]

    def get(self, request):
        course_id = request.query_params.get("course_id")
        if course_id:
            classroom = Classroom.objects.filter(pk=course_id).first()
            if classroom:
                if not _manages(request.user, classroom):
                    return _forbidden()
                students = User.objects.filter(
                    enrollments__classroom=classroom,
                    enrollments__is_active=True,
                    role=User.Role.STUDENT,
                ).distinct().select_related("section", "batch", "department")
                return Response(_student_list_payload(students, classroom.pk))

        enrollments = Enrollment.objects.filter(
            is_active=True,
            student__role=User.Role.STUDENT,
        ).select_related("student", "classroom")
        if not _is_admin(request.user):
            enrollments = enrollments.filter(classroom__teacher=request.user)

        payload = []
        seen = set()
        for enrollment in enrollments:
            if enrollment.student_id in seen:
                continue
            seen.add(enrollment.student_id)
            payload.append(_student_payload(enrollment.student, enrollment.classroom_id))

        if not payload and _is_admin(request.user):
            for s in User.objects.filter(role=User.Role.STUDENT):
                payload.append(_student_payload(s, 0))

        return Response(payload)

    def post(self, request):
        course_id = request.data.get("course_id") or request.query_params.get("course_id")
        if not course_id:
            return Response({"detail": "course_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        classroom = Classroom.objects.filter(pk=course_id).first()
        if not classroom:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _manages(request.user, classroom):
            return _forbidden()

        try:
            student = _enroll_student(classroom, request.data)
        except ValueError as exc:
            code = status.HTTP_409_CONFLICT if "already enrolled" in str(exc) else status.HTTP_400_BAD_REQUEST
            return Response({"detail": str(exc)}, status=code)
        return Response(_student_payload(student, classroom.pk), status=status.HTTP_201_CREATED)


def _legacy_rows(uploaded_file):
    filename = uploaded_file.name.lower()
    contents = uploaded_file.read()
    if filename.endswith(".xlsx"):
        workbook = load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
        rows = workbook.active.iter_rows(values_only=True)
        values = list(rows)
        if not values:
            return []
        headers = [str(value or "").strip() for value in values[0]]
        return [dict(zip(headers, row)) for row in values[1:]]
    if filename.endswith(".csv") or filename.endswith(".txt"):
        text = contents.decode("utf-8", errors="ignore")
        return list(csv.DictReader(io.StringIO(text))) if filename.endswith(".csv") else text.splitlines()
    raise ValueError("Unsupported file format")


def _legacy_line_data(line):
    line = str(line).strip()
    email_match = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", line)
    if not email_match:
        return None
    email = email_match.group(0)
    reg_match = re.search(r"(?i)(?:reg(?:ister)?|roll|id)?[\s#:\.-]*\b([A-Z0-9]*\d[A-Z0-9]*)\b", line)
    class_match = re.search(r"(?i)(?:class|batch|section)[\s:\.-]*([a-zA-Z0-9\s-]+)(?:,|;|$)", line)
    name_match = re.search(r"(?i)(?:name|student)[\s:\.-]*([a-zA-Z\s]+)(?:,|;|$)", line)
    prefix = line.split(email)[0]
    words = re.findall(r"[a-zA-Z]+", prefix)
    return {
        "email": email,
        "registration_number": reg_match.group(1).replace('"', '').strip() if reg_match else "",
        "name": name_match.group(1).replace('"', '').strip() if name_match else (" ".join(words[-2:]) if words else "Student"),
        "student_class": class_match.group(1).replace('"', '').strip() if class_match else "General",
        "department": "General",
    }


def _legacy_dict_data(row):
    email = ""
    for k in row:
        if "email" in str(k).lower() and row[k]:
            email = str(row[k]).strip()
            break
    if not email:
        return None

    name = ""
    for k in row:
        if "name" in str(k).lower() and row[k]:
            name = str(row[k]).strip()
            break

    reg = ""
    for k in row:
        if any(w in str(k).lower() for w in ("reg", "roll", "id")) and row[k]:
            reg = str(row[k]).strip()
            break

    sec = ""
    for k in row:
        if any(w in str(k).lower() for w in ("class", "section", "batch")) and row[k]:
            sec = str(row[k]).strip()
            break

    dept = ""
    for k in row:
        if "dept" in str(k).lower() and row[k]:
            dept = str(row[k]).strip()
            break

    return {
        "email": email,
        "name": name or "Student",
        "registration_number": reg,
        "student_class": sec or "General",
        "department": dept or "General",
    }


class LegacyBulkEnrollView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, course_id):
        classroom = Classroom.objects.filter(pk=course_id).first()
        if classroom is None:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _manages(request.user, classroom):
            return _forbidden()

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "File is required for bulk enrollment."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rows = _legacy_rows(uploaded_file)
        except Exception as exc:
            return Response({"detail": f"Error reading file: {str(exc)}"}, status=status.HTTP_400_BAD_REQUEST)

        enrolled = 0
        already = 0
        skipped = []
        seen = set()
        for row in rows:
            payload = _legacy_dict_data(row) if isinstance(row, dict) else _legacy_line_data(row)
            if not payload or not payload.get("email"):
                label = str(row if not isinstance(row, dict) else next((v for v in row.values() if v), ""))[:40]
                if label.strip():
                    skipped.append({"who": label, "reason": "no email found"})
                continue
            key = str(payload["email"]).lower()
            if key in seen:
                continue
            seen.add(key)
            try:
                _enroll_student(classroom, payload)
                enrolled += 1
            except ValueError as exc:
                if "already enrolled" in str(exc):
                    already += 1
                else:
                    skipped.append({"who": payload["email"], "reason": str(exc).rstrip(".")})

        if not enrolled and not already:
            reasons = "; ".join(f"{x['who']} ({x['reason']})" for x in skipped[:3])
            detail = "No student could be enrolled from this file."
            if reasons:
                detail += f" {reasons}."
            detail += " Use one student per row with an Email column."
            return Response({"detail": detail, "skipped": skipped}, status=status.HTTP_400_BAD_REQUEST)

        if enrolled:
            ActionHistory.objects.create(
                feature="student",
                action="bulk_upload",
                result=f"Bulk enrolled {enrolled} students into {classroom.name}",
                metadata_json={"course_id": course_id, "enrolled_count": enrolled},
            )
        return Response(
            {
                "message": f"Successfully enrolled {enrolled} students",
                "enrolled": enrolled,
                "already_enrolled": already,
                "skipped": skipped,
            },
            status=status.HTTP_201_CREATED if enrolled else status.HTTP_200_OK,
        )


class LegacyEnrollByCodeView(APIView):
    parser_classes = [JSONParser, FormParser]

    def post(self, request):
        code = str(request.query_params.get("enrollment_code") or request.data.get("enrollment_code") or "").strip()
        classroom = Classroom.objects.filter(enrollment_code__iexact=code).first() if code else None
        if classroom is None:
            return Response({"detail": "Invalid enrollment code"}, status=status.HTTP_404_NOT_FOUND)

        payload = request.data.copy()
        if request.user and not getattr(request.user, "is_anonymous", True) and request.user.role == User.Role.STUDENT:
            payload["email"] = request.user.email
            payload["name"] = request.user.full_name
            payload["registration_number"] = request.user.register_no or payload.get("registration_number")

        try:
            student = _enroll_student(classroom, payload)
        except ValueError as exc:
            code_status = status.HTTP_409_CONFLICT if "already enrolled" in str(exc) else status.HTTP_400_BAD_REQUEST
            return Response({"detail": str(exc)}, status=code_status)

        return Response(_student_payload(student, classroom.pk), status=status.HTTP_201_CREATED)


class LegacyActiveStudentsView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, course_id):
        classroom = Classroom.objects.filter(pk=course_id).first()
        if classroom is None:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _manages(request.user, classroom):
            return _forbidden()
        students = User.objects.filter(
            enrollments__classroom=classroom,
            enrollments__is_active=True,
            role=User.Role.STUDENT,
        ).distinct().select_related("section", "batch", "department")
        return Response(_student_list_payload(students, classroom.pk))


class LegacyStudentDeleteView(APIView):
    permission_classes = [IsTeacher]

    def delete(self, request, student_id):
        enrollments = Enrollment.objects.filter(student_id=student_id)
        user = User.objects.filter(pk=student_id).first()
        if not enrollments.exists() and not user:
            return Response({"detail": "Student not found"}, status=status.HTTP_404_NOT_FOUND)
        if user is None or not _manages_student(request.user, user):
            return _forbidden()
        if not _is_admin(request.user):
            enrollments = enrollments.filter(classroom__teacher=request.user)
        if enrollments.exists():
            enrollments.delete()
        ActionHistory.objects.create(
            feature="student",
            action="delete",
            result=f"Deleted student #{student_id}",
            metadata_json={"student_id": student_id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class LegacyResourceListView(APIView):

    def get(self, request, course_id):
        resources = Resource.objects.filter(course_id=course_id)
        return Response([
            {
                "id": r.id,
                "course_id": r.course_id,
                "name": r.name,
                "type": r.type,
                "size": r.size,
                "date": r.date,
            }
            for r in resources
        ])
