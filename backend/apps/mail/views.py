import io
import json
import logging
import re
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.html import escape
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser

from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework.exceptions import ValidationError

from apps.core.access import is_master_admin
from apps.core.permissions import IsTeacher
from apps.core.utils.file_uploads import MAX_SPREADSHEET_BYTES, validate_upload

from apps.accounts.models import User
from apps.core.models import ActionHistory
from apps.core.utils.email_utils import email_configured, send_email, smtp_connection
from services.groq_service import GroqService, DEFAULT_MODEL
from .models import MailDraft, MailHistory
from .serializers import MailDraftSerializer, MailHistorySerializer

logger = logging.getLogger(__name__)


def _sheet_rows(content, filename):
    """The rows of an uploaded .xlsx or .csv as dicts keyed by the lower-cased header. Blank cells are None."""
    if filename.endswith(".xlsx"):
        from openpyxl import load_workbook

        sheet = load_workbook(io.BytesIO(content), read_only=True, data_only=True).worksheets[0]
        table = list(sheet.iter_rows(values_only=True))
    else:
        import csv

        table = list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))
    if not table:
        return []
    headers = [str(c or "").lower().strip() for c in table[0]]
    rows = []
    for values in table[1:]:
        if not any(str(v or "").strip() for v in values):
            continue  # an empty row
        rows.append({h: (values[i] if i < len(values) and str(values[i] or "").strip() != "" else None) for i, h in enumerate(headers) if h})
    return rows


def _optional_number(value):
    """A number from a spreadsheet cell, or None when it is empty or not a number."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if number != number else number  # NaN (an empty cell) is not a value


class MailGenerateView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request):
        students = request.data.get("students", [])
        conditions = request.data.get("conditions", [])

        if not students:
            return Response({"detail": "No students provided to generate context."}, status=status.HTTP_400_BAD_REQUEST)

        cond_desc = []
        for c in conditions:
            cond_desc.append(f"{c.get('field')} {c.get('operator')} {c.get('value')}")
        conditions_str = ", ".join(cond_desc) if cond_desc else "General performance check"

        sample_students = students[:3]
        sample_str = ", ".join([s.get("name", "Student") for s in sample_students])

        prompt = f"""You are an automated academic mailing assistant for university teachers.
Generate a concise, professional, yet supportive email draft targeting students matching criteria: [{conditions_str}].
Examples of targeted students: {sample_str}.

You MUST return a JSON object with strictly two keys:
"subject": A clear, professional subject line.
"body": The body of the email. You may use placeholders like {{name}} if appropriate, but keep it directly usable as a broad notification or personal check-in. Keep it encouraging and actionable.

Return ONLY the raw JSON string."""

        client = GroqService.get_client()
        if client:
            try:
                response = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=DEFAULT_MODEL,
                    temperature=0.5,
                    response_format={"type": "json_object"},
                )
                content = response.choices[0].message.content
                return Response({**json.loads(content), "source": "ai"})
            except Exception as e:
                logger.warning("Groq mail generation failed: %s", e)

        return Response({
            "subject": f"Notice Regarding Academic Performance - {conditions_str}",
            "body": f"Dear Student,\n\nThis is a notification regarding your recent standing ({conditions_str}). Please reach out during office hours to discuss how we can improve your progress.\n\nBest regards,\nFaculty",
            "source": "template",  # the AI was not available, so this is a plain template to edit
        })


class MailFilterView(APIView):
    """Pick the teacher's own students by their real marks. Attendance is not recorded, so a student
    never matches an attendance condition and the field is returned as ``None``."""
    permission_classes = [IsTeacher]

    NUMBER_FIELDS = {"avg_score", "score", "attendance"}
    TEXT_FIELDS = {"name", "registration_number", "email"}
    OPERATORS = {
        "<": lambda a, b: a < b, "<=": lambda a, b: a <= b, ">": lambda a, b: a > b,
        ">=": lambda a, b: a >= b, "==": lambda a, b: a == b, "!=": lambda a, b: a != b,
        "contains": lambda a, b: str(b) in str(a),
    }

    def post(self, request):
        from apps.assignments.stats import average_by_student
        from apps.core.access import managed_courses

        conditions = request.data.get("conditions", [])
        if not isinstance(conditions, list):
            return Response({"detail": "conditions must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        cleaned = []
        for c in conditions:
            if not isinstance(c, dict):
                return Response({"detail": "A condition is not valid."}, status=status.HTTP_400_BAD_REQUEST)
            field, operator, value = c.get("field", ""), c.get("operator", ""), c.get("value", "")
            if operator not in self.OPERATORS:
                return Response({"detail": f"Unknown operator '{operator}'."}, status=status.HTTP_400_BAD_REQUEST)
            if field in self.NUMBER_FIELDS:
                if operator == "contains":
                    return Response({"detail": "Use a comparison, not 'contains', for marks."}, status=status.HTTP_400_BAD_REQUEST)
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    return Response({"detail": "Marks conditions need a number."}, status=status.HTTP_400_BAD_REQUEST)
            elif field in self.TEXT_FIELDS:
                if operator not in ("==", "!=", "contains"):
                    return Response({"detail": "Text can only be matched with equals, not equal to or contains."}, status=status.HTTP_400_BAD_REQUEST)
                value = str(value or "").strip().casefold()
            else:
                return Response({"detail": f"Unknown column '{field}'."}, status=status.HTTP_400_BAD_REQUEST)
            cleaned.append((field, self.OPERATORS[operator], value))

        courses = managed_courses(request.user)
        course_ids = list(courses.values_list("id", flat=True))
        students = User.objects.filter(
            enrollments__classroom__in=courses, enrollments__is_active=True, role=User.Role.STUDENT
        ).distinct()
        averages = average_by_student(list(students.values_list("id", flat=True)), course_ids)
        results = []

        for s in students:
            values = {
                "avg_score": averages.get(s.id), "score": averages.get(s.id), "attendance": None,
                "name": (s.full_name or "").casefold(), "registration_number": (s.register_no or "").casefold(),
                "email": (s.email or "").casefold(),
            }
            match = True
            for field, compare, wanted in cleaned:
                current = values.get(field)
                # Attendance is not recorded and an ungraded student has no average: neither matches a number.
                if current is None or not compare(current, wanted):
                    match = False
                    break

            if match:
                results.append({
                    "id": s.id,
                    "name": s.full_name,
                    "email": s.email,
                    "registration_number": s.register_no or f"REG-{s.id}",
                    "attendance": None,
                    "avg_score": averages.get(s.id),
                })

        return Response(results)


class MailParseExcelView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_upload(file_obj, {".xlsx", ".xls", ".csv"}, MAX_SPREADSHEET_BYTES)
        except ValidationError as exc:
            return Response({"detail": exc.detail[0]}, status=status.HTTP_400_BAD_REQUEST)
        filename = file_obj.name.lower()
        content = file_obj.read()

        try:
            if filename.endswith(".xls"):
                return Response({"detail": "Old .xls files are not supported. Save the sheet as .xlsx or CSV and upload that."}, status=status.HTTP_400_BAD_REQUEST)
            if not filename.endswith((".xlsx", ".csv")):
                return Response({"detail": "File must be Excel or CSV"}, status=status.HTTP_400_BAD_REQUEST)

            students = []
            for idx, row in enumerate(_sheet_rows(content, filename)):
                students.append({
                    "id": idx + 1,
                    "name": str(row.get("name") or row.get("student_name") or f"Student {idx + 1}"),
                    "email": str(row.get("email") or ""),
                    "registration_number": str(row.get("registration_number") or row.get("reg_no") or f"R-{idx+1}"),
                    "attendance": _optional_number(row.get("attendance")),
                    "avg_score": _optional_number(row.get("avg_score", row.get("score"))),
                })

            return Response(students)
        except Exception as e:
            return Response({"detail": f"Failed to parse file: {e}"}, status=status.HTTP_400_BAD_REQUEST)


MAX_RECIPIENTS = 200
MAX_DRAFT_SUBJECT = 255


def _bad(message, code=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({"detail": message, **extra}, status=code)


def _own(model, user):
    """A teacher's own drafts or history; a master admin sees everyone's."""
    return model.objects.all() if is_master_admin(user) else model.objects.filter(owner=user)


def _clean_draft(data):
    subject = str(data.get("subject") or "")[:MAX_DRAFT_SUBJECT]
    body = str(data.get("body") or "")
    student_ids = data.get("student_ids") or []
    conditions = data.get("conditions") or []
    if not isinstance(student_ids, list) or not isinstance(conditions, list):
        return None, "student_ids and conditions must be lists."
    return {"subject": subject, "body": body, "student_ids": student_ids, "conditions": conditions}, None


class MailDraftListCreateView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        return Response(MailDraftSerializer(_own(MailDraft, request.user), many=True).data)

    def post(self, request):
        cleaned, error = _clean_draft(request.data)
        if error:
            return _bad(error)
        draft = MailDraft.objects.create(owner=request.user, **cleaned)
        return Response(MailDraftSerializer(draft).data, status=status.HTTP_201_CREATED)


class MailDraftDetailView(APIView):
    permission_classes = [IsTeacher]

    def _draft(self, request, draft_id):
        return get_object_or_404(_own(MailDraft, request.user), pk=draft_id)

    def get(self, request, draft_id):
        return Response(MailDraftSerializer(self._draft(request, draft_id)).data)

    def put(self, request, draft_id):
        draft = self._draft(request, draft_id)
        cleaned, error = _clean_draft(request.data)
        if error:
            return _bad(error)
        for field, value in cleaned.items():
            setattr(draft, field, value)
        draft.save()
        return Response(MailDraftSerializer(draft).data)

    def delete(self, request, draft_id):
        self._draft(request, draft_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


_PLACEHOLDERS = {
    "name": re.compile(r"\{\{?\s*name\s*\}?\}", re.I),
    "reg": re.compile(r"\{\{?\s*reg(?:istration)?(?:_num|_number| number|_no)?\s*\}?\}", re.I),
    "attendance": re.compile(r"\{\{?\s*attendance\s*\}?\}", re.I),
    "marks": re.compile(r"\{\{?\s*(?:marks|avg_score)\s*\}?\}", re.I),
}


def personalise(text, person):
    """Fill {{name}}, {{reg}}, {{marks}} and {{attendance}}. Values that are not recorded say so."""
    def percent(value):
        return f"{value}%" if value is not None else "Not recorded"

    values = {
        "name": person.get("name") or "",
        "reg": person.get("registration_number") or "",
        "attendance": percent(person.get("attendance")),
        "marks": percent(person.get("avg_score")),
    }
    for key, pattern in _PLACEHOLDERS.items():
        text = pattern.sub(lambda _m, v=values[key]: v, text)
    return text


def _recipients_from(request):
    """Build the recipient list from the teacher's own students plus any uploaded (temporary) ones."""
    from apps.assignments.stats import average_by_student
    from apps.core.access import managed_courses, managed_students

    data = request.data
    student_ids = data.get("student_ids") or []
    temp_students = data.get("temporary_students") or []
    if not isinstance(student_ids, list) or not isinstance(temp_students, list):
        return None, "student_ids and temporary_students must be lists."

    people = []
    if student_ids:
        try:
            wanted = {int(i) for i in student_ids}
        except (TypeError, ValueError):
            return None, "student_ids must be account ids."
        found = {u.pk: u for u in managed_students(request.user).filter(pk__in=wanted)}
        if len(found) != len(wanted):
            return None, "Some of the selected students are not in your classes."
        averages = average_by_student(list(found), list(managed_courses(request.user).values_list("id", flat=True)))
        for user in found.values():
            if user.email:
                people.append({"name": user.full_name, "email": user.email, "registration_number": user.register_no,
                               "avg_score": averages.get(user.pk), "attendance": None})
    for entry in temp_students:
        if not isinstance(entry, dict):
            return None, "Each uploaded student must be an object."
        email = str(entry.get("email") or "").strip()
        if not email:
            continue
        try:
            validate_email(email)
        except DjangoValidationError:
            return None, f"'{email}' is not a valid email address."
        people.append({"name": str(entry.get("name") or "")[:150], "email": email,
                       "registration_number": str(entry.get("registration_number") or "")[:50],
                       "avg_score": entry.get("avg_score") if isinstance(entry.get("avg_score"), (int, float)) else None,
                       "attendance": entry.get("attendance") if isinstance(entry.get("attendance"), (int, float)) else None})

    unique = {}
    for person in people:
        unique.setdefault(person["email"].lower(), person)
    return list(unique.values()), None


class MailSendView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request):
        data = request.data

        # What to send: the chosen drafts' own content, or the subject and body typed in the composer.
        draft_ids = data.get("draft_ids") or []
        if draft_ids:
            if not isinstance(draft_ids, list):
                return _bad("draft_ids must be a list.")
            drafts = list(_own(MailDraft, request.user).filter(pk__in=draft_ids))
            if len(drafts) != len(set(draft_ids)):
                return _bad("One of the chosen drafts was not found.", status.HTTP_404_NOT_FOUND)
            messages = [(d.subject or "", d.body or "") for d in drafts]
        else:
            messages = [(str(data.get("subject") or ""), str(data.get("body") or ""))]
        if any(not subject.strip() or not body.strip() for subject, body in messages):
            return _bad("Every mail needs a subject and a message.")

        people, error = _recipients_from(request)
        if error:
            return _bad(error)
        if not people:
            return _bad("There is nobody to send to. Select students who have an email address.")
        if len(people) > MAX_RECIPIENTS:
            return _bad(f"You can send to at most {MAX_RECIPIENTS} people at a time.")
        if not email_configured():
            return _bad("Email is not set up on this server, so nothing was sent. Use the Gmail option instead.", status.HTTP_503_SERVICE_UNAVAILABLE)

        sent, failed = [], []
        histories = []
        with transaction.atomic(), smtp_connection() as connection:
            for subject, body in messages:
                reached = []
                for person in people:
                    text = personalise(body, person)
                    html = escape(text).replace("\n", "<br>")
                    if send_email(to_email=person["email"], subject=personalise(subject, person), body=html, connection=connection):
                        reached.append(person["email"])
                    else:
                        failed.append(person["email"])
                if reached:
                    histories.append(MailHistory.objects.create(
                        owner=request.user, subject=subject, body=body, recipients=reached, recipient_count=len(reached)
                    ))
                sent.extend(reached)
            ActionHistory.objects.create(
                feature="mail", action="send_mail", reaction="teacher_triggered",
                result="success" if sent else "failed",
                metadata_json={"mails": len(messages), "sent": len(sent), "failed": len(set(failed)), "user_id": request.user.pk},
            )

        if not sent:
            return _bad("The emails could not be sent. Check the mail server settings and try again.", status.HTTP_502_BAD_GATEWAY, failed=sorted(set(failed)))
        failed = sorted(set(failed))
        note = f" {len(failed)} could not be delivered." if failed else ""
        return Response({
            "message": f"Sent {len(sent)} email{'s' if len(sent) != 1 else ''}.{note}",
            "sent": len(sent), "failed": failed,
            "history": MailHistorySerializer(histories, many=True).data,
        }, status=status.HTTP_201_CREATED)


class MailGmailLogView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request):
        data = request.data
        subject = data.get("subject", "")
        body = data.get("body", "")
        recipients = data.get("recipients", [])

        if not isinstance(recipients, list) or len(recipients) > MAX_RECIPIENTS or not all(isinstance(r, str) for r in recipients):
            return _bad("recipients must be a list of email addresses.")
        history = MailHistory.objects.create(
            owner=request.user,
            subject=str(subject)[:MAX_DRAFT_SUBJECT],
            body=body,
            recipients=recipients,
            recipient_count=len(recipients),
        )

        ActionHistory.objects.create(
            feature="mail",
            action="send_via_gmail",
            reaction="teacher_triggered",
            result="success",
            metadata_json={
                "subject": subject,
                "recipient_count": len(recipients),
            },
        )

        return Response(MailHistorySerializer(history).data, status=status.HTTP_201_CREATED)


class MailHistoryListView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        return Response(MailHistorySerializer(_own(MailHistory, request.user), many=True).data)


class MailHistoryDetailView(APIView):
    permission_classes = [IsTeacher]

    def delete(self, request, history_id):
        history = get_object_or_404(_own(MailHistory, request.user), pk=history_id)
        history.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
