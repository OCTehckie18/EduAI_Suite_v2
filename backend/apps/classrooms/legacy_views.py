import csv
import io
import random
import re
import string

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.http import HttpResponse
from openpyxl import Workbook, load_workbook
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.institution.models import Batch, Department, Program, Section

from .models import Classroom, Enrollment


ADMIN_ROLES = {User.Role.MASTER_ADMIN, User.Role.CAMPUS_ADMIN}


def _is_admin(user):
    return user.role in ADMIN_ROLES or user.is_superuser


def _visible_classrooms(user):
    if _is_admin(user):
        return Classroom.objects.all()
    if user.role == User.Role.TEACHER:
        return Classroom.objects.filter(teacher=user)
    if user.role == User.Role.STUDENT:
        return Classroom.objects.filter(
            enrollments__student=user,
            enrollments__is_active=True,
        ).distinct()
    return Classroom.objects.none()


def _visible_classroom(user, course_id):
    try:
        return _visible_classrooms(user).select_related(
            "teacher", "department", "program", "batch", "section"
        ).get(pk=course_id)
    except Classroom.DoesNotExist:
        return None


def _course_payload(classroom):
    students = list(
        User.objects.filter(
            enrollments__classroom=classroom,
            enrollments__is_active=True,
            role=User.Role.STUDENT,
        ).distinct()
    )
    return {
        "id": classroom.pk,
        "code": classroom.subject_code,
        "name": classroom.name,
        "batch": classroom.batch.name,
        "students": len(students),
        "progress": 0.0,
        "color": classroom.color or "#264796",
        "description": classroom.description or "",
        "enrollment_code": classroom.enrollment_code,
        "teacher_name": classroom.teacher.full_name,
        "course_plan_path": classroom.course_plan_path or None,
        "department_id": classroom.department_id,
        "program_id": classroom.program_id,
        "batch_id": classroom.batch_id,
        "section_id": classroom.section_id,
    }


def _student_payload(student, course_id):
    return {
        "id": student.pk,
        "course_id": course_id,
        "name": student.full_name,
        "email": student.email,
        "registration_number": student.register_no or "",
        "student_class": student.section.name if student.section_id else (student.batch.name if student.batch_id else "General"),
        "department": student.department.name if student.department_id else "General",
        "attendance": 0,
        "avg_score": 0,
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


def _resolve_classroom_context(data, current_user):
    teacher = current_user if current_user.role == User.Role.TEACHER else None
    teacher_id = _as_id(data.get("teacher"))
    if teacher_id:
        teacher = User.objects.filter(pk=teacher_id, role=User.Role.TEACHER).first()
    if teacher is None and _is_admin(current_user):
        teacher_name = str(data.get("teacher_name") or "").strip().casefold()
        if teacher_name:
            teacher = User.objects.filter(role=User.Role.TEACHER).filter(
                first_name__icontains=teacher_name.split(" ", 1)[0]
            ).first()
        teacher = teacher or current_user
    if teacher is None:
        raise ValueError("Only teachers or administrators can create classrooms.")

    department = Department.objects.filter(pk=_as_id(data.get("department"))).first()
    department = department or teacher.department

    program = Program.objects.filter(pk=_as_id(data.get("program"))).first()
    program = program or teacher.program
    if program is None and department:
        program = teacher.teaching_programs.filter(department=department).first()
    if program is None and department:
        program = Program.objects.filter(department=department).first()

    batch_value = data.get("batch_id") or data.get("batch")
    batch = Batch.objects.filter(pk=_as_id(batch_value)).first()
    if batch is None and batch_value:
        batch = Batch.objects.filter(name__iexact=str(batch_value).strip()).first()
    batch = batch or teacher.batch
    if batch is None:
        batch = teacher.teaching_batches.filter(program=program).first() if program else None
    if batch is None and program:
        batch = Batch.objects.filter(program=program).first()
    if batch is not None:
        program = program or batch.program
        department = department or batch.program.department

    section_value = data.get("section_id") or data.get("section")
    section = Section.objects.filter(pk=_as_id(section_value)).first()
    if section is None and section_value and batch:
        section = Section.objects.filter(batch=batch, name__iexact=str(section_value).strip()).first()

    if not department or not program or not batch:
        raise ValueError("Provide department, program, and batch IDs or complete the teacher hierarchy first.")
    if program.department_id != department.pk or batch.program_id != program.pk:
        raise ValueError("The classroom hierarchy is inconsistent.")
    if section and section.batch_id != batch.pk:
        raise ValueError("The section does not belong to the selected batch.")
    return teacher, department, program, batch, section


def _save_course_plan(uploaded_file):
    if not uploaded_file:
        return ""
    path = default_storage.save(f"courses/{uploaded_file.name}", ContentFile(uploaded_file.read()))
    return path


def _same_classroom_access(user, classroom):
    return _visible_classrooms(user).filter(pk=classroom.pk).exists()


class LegacyCourseListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        classrooms = _visible_classrooms(request.user).select_related(
            "teacher", "department", "program", "batch", "section"
        )
        return Response([_course_payload(classroom) for classroom in classrooms])

    @transaction.atomic
    def post(self, request):
        if request.user.role not in {User.Role.TEACHER, *ADMIN_ROLES} and not request.user.is_superuser:
            return Response({"detail": "Only teachers can create classrooms"}, status=status.HTTP_403_FORBIDDEN)
        try:
            teacher, department, program, batch, section = _resolve_classroom_context(request.data, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

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
            color=str(request.data.get("color") or "#264796"),
            description=str(request.data.get("description") or ""),
            course_plan_path=_save_course_plan(request.FILES.get("file")),
        )
        return Response(_course_payload(classroom), status=status.HTTP_201_CREATED)


class LegacyCourseDetailView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _get(self, request, course_id):
        classroom = _visible_classroom(request.user, course_id)
        if classroom is None:
            return None, Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        return classroom, None

    def get(self, request, course_id):
        classroom, error = self._get(request, course_id)
        return error or Response(_course_payload(classroom))

    @transaction.atomic
    def put(self, request, course_id):
        classroom, error = self._get(request, course_id)
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
            classroom.color = str(data.get("color") or "#264796")
        if "enrollment_code" in data:
            classroom.enrollment_code = _unique_enrollment_code(data.get("enrollment_code"), classroom.enrollment_code)
        if "batch" in data or "batch_id" in data:
            batch_value = data.get("batch_id") or data.get("batch")
            batch = Batch.objects.filter(pk=_as_id(batch_value)).first()
            batch = batch or Batch.objects.filter(program=classroom.program, name__iexact=str(batch_value).strip()).first()
            if batch is None:
                return Response({"detail": "Batch not found for this classroom."}, status=status.HTTP_400_BAD_REQUEST)
            classroom.batch = batch
            if classroom.section_id and classroom.section.batch_id != batch.pk:
                classroom.section = None
        if request.FILES.get("file"):
            classroom.course_plan_path = _save_course_plan(request.FILES["file"])
        classroom.save()
        return Response(_course_payload(classroom))

    def delete(self, request, course_id):
        classroom, error = self._get(request, course_id)
        if error:
            return error
        classroom.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LegacyCourseExtractDetailsView(APIView):
    permission_classes = [AllowAny]
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
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        code_match = re.search(r"Course\s*Code\s*[:\-]?\s*([A-Z0-9\-]+)", text, re.IGNORECASE)
        name_match = re.search(r"Course Name[:\s]+([^:\n\r]+)", text, re.IGNORECASE)
        instructor_match = re.search(r"(?:Course\s+Instructor\(s\)\s+Name|Instructor)[:\s#]+(.+)", text, re.IGNORECASE)
        lines = text.splitlines()
        description_lines = []
        capture = False
        for line in lines:
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
    if student is None:
        if not email:
            raise ValueError("Student email is required for a new account.")
        first_name, last_name = _split_name(data.get("name"))
        student = User.objects.create_user(
            email=email,
            role=User.Role.STUDENT,
            register_no=register_no or None,
            first_name=first_name,
            last_name=last_name,
            campus=classroom.batch.program.department.school.campus,
            school=classroom.batch.program.department.school,
            department=classroom.department,
            program=classroom.program,
            batch=classroom.batch,
            section=classroom.section,
            is_profile_complete=False,
        )
    else:
        changed = []
        if register_no and not student.register_no:
            student.register_no = register_no
            changed.append("register_no")
        if not student.department_id:
            student.department = classroom.department
            changed.append("department")
        if not student.program_id:
            student.program = classroom.program
            changed.append("program")
        if not student.batch_id:
            student.batch = classroom.batch
            changed.append("batch")
        if not student.section_id and classroom.section_id:
            student.section = classroom.section
            changed.append("section")
        if changed:
            student.save(update_fields=changed + ["updated_at"])

    if classroom.section_id and student.section_id and student.section_id != classroom.section_id:
        raise ValueError("The student belongs to a different section.")
    existing = Enrollment.all_objects.filter(classroom=classroom, student=student).first()
    if existing and existing.is_active:
        raise ValueError("Student with this email is already enrolled in this course")
    if existing:
        existing.restore()
    else:
        Enrollment.objects.create(classroom=classroom, student=student)
    return student


class LegacyCourseStudentsView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser]

    def get(self, request, course_id):
        classroom = _visible_classroom(request.user, course_id)
        if classroom is None:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        students = User.objects.filter(
            enrollments__classroom=classroom,
            enrollments__is_active=True,
            role=User.Role.STUDENT,
        ).distinct()
        return Response([_student_payload(student, classroom.pk) for student in students])

    def post(self, request, course_id):
        classroom = _visible_classroom(request.user, course_id)
        if classroom is None:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role == User.Role.STUDENT:
            return Response({"detail": "Only teachers can enroll students."}, status=status.HTTP_403_FORBIDDEN)
        try:
            student = _enroll_student(classroom, request.data)
        except ValueError as exc:
            code = status.HTTP_409_CONFLICT if "already enrolled" in str(exc) else status.HTTP_400_BAD_REQUEST
            return Response({"detail": str(exc)}, status=code)
        return Response(_student_payload(student, classroom.pk), status=status.HTTP_201_CREATED)

    def delete(self, request, course_id):
        return LegacyStudentDeleteView().delete(request, course_id)


class LegacyStudentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        enrollments = Enrollment.objects.filter(
            classroom__in=_visible_classrooms(request.user),
            student__role=User.Role.STUDENT,
        ).select_related("student")
        payload = []
        seen = set()
        for enrollment in enrollments:
            if enrollment.student_id in seen:
                continue
            seen.add(enrollment.student_id)
            payload.append(_student_payload(enrollment.student, enrollment.classroom_id))
        return Response(payload)


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
        "name": name_match.group(1).replace('"', '').strip() if name_match else " ".join(words[-2:]) or "Student",
        "student_class": class_match.group(1).replace('"', '').strip() if class_match else "General",
        "department": "General",
    }


class LegacyBulkEnrollView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, course_id):
        classroom = _visible_classroom(request.user, course_id)
        if classroom is None:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "A CSV, TXT, or XLSX file is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rows = _legacy_rows(uploaded_file)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        enrolled = 0
        seen = set()
        for row in rows:
            data = row if isinstance(row, dict) else _legacy_line_data(row)
            if not data:
                continue
            normalized = {str(key).strip().lower(): value for key, value in data.items()}
            payload = {
                "email": normalized.get("student email") or normalized.get("email"),
                "registration_number": normalized.get("register no") or normalized.get("registration number") or normalized.get("registration_number"),
                "name": normalized.get("student name") or normalized.get("name"),
            }
            if not payload["email"] or str(payload["email"]).lower() in seen:
                continue
            seen.add(str(payload["email"]).lower())
            try:
                _enroll_student(classroom, payload)
                enrolled += 1
            except ValueError as exc:
                if "already enrolled" in str(exc):
                    continue
                continue
        if not enrolled:
            return Response({"detail": "Could not extract student details using the original import format."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": f"Successfully enrolled {enrolled} students"}, status=status.HTTP_201_CREATED)


class LegacyEnrollByCodeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser]

    def post(self, request):
        code = str(request.query_params.get("enrollment_code") or "").strip()
        classroom = Classroom.objects.filter(enrollment_code=code).first()
        if classroom is None:
            return Response({"detail": "Invalid enrollment code"}, status=status.HTTP_404_NOT_FOUND)
        payload = request.data.copy()
        if request.user.role == User.Role.STUDENT:
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
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id):
        classroom = _visible_classroom(request.user, course_id)
        if classroom is None:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        students = User.objects.filter(
            enrollments__classroom=classroom,
            enrollments__is_active=True,
            role=User.Role.STUDENT,
        ).distinct()
        return Response([_student_payload(student, classroom.pk) for student in students])


class LegacyStudentDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, student_id):
        if request.user.role == User.Role.STUDENT:
            return Response({"detail": "Only teachers can remove students."}, status=status.HTTP_403_FORBIDDEN)
        classrooms = _visible_classrooms(request.user)
        enrollments = Enrollment.objects.filter(classroom__in=classrooms, student_id=student_id)
        if not enrollments.exists():
            return Response({"detail": "Student not found"}, status=status.HTTP_404_NOT_FOUND)
        enrollments.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
