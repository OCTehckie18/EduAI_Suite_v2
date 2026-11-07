"""Forms: a teacher builds a form for a classroom, students answer it once.

Identity always comes from the signed-in account. A teacher only sees and edits
forms for classrooms they manage; a student only sees published forms of
classrooms they are enrolled in, and only their own response.
"""
import csv

from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.core.access import can_manage_course, can_view_course, visible_courses
from apps.core.permissions import IsTeacher
from apps.core.services import course_student_ids, notify

from .models import Form, FormAnswer, FormQuestion, FormResponse

MAX_QUESTIONS = 50
MAX_OPTIONS = 12
MAX_TEXT = 2000
KINDS = {k for k, _ in FormQuestion.Kind.choices}
CHOICE_KINDS = {FormQuestion.Kind.CHOICE, FormQuestion.Kind.CHECKBOX}


def _bad(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _denied():
    return Response({"detail": "You do not have permission to do that."}, status=status.HTTP_403_FORBIDDEN)


def _is_teacher(user):
    return getattr(user, "role", "") in ("TEACHER", "MASTER_ADMIN")


# ---- questions -----------------------------------------------------------------

def clean_questions(rows):
    """(questions, error). Each question is a plain dict ready to store."""
    if not isinstance(rows, list) or len(rows) > MAX_QUESTIONS:
        return None, f"Send a list of at most {MAX_QUESTIONS} questions."
    out = []
    for number, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            return None, f"Question {number} is not valid."
        prompt = row.get("prompt")
        prompt = prompt.strip() if isinstance(prompt, str) else ""
        if not prompt:
            return None, f"Question {number} has no text."
        if len(prompt) > 500:
            return None, f"Question {number} is too long (500 characters at most)."
        kind = row.get("kind")
        if kind not in KINDS:
            return None, f"Question {number} has an unknown type."
        options = []
        if kind in CHOICE_KINDS:
            raw = row.get("options")
            if not isinstance(raw, list):
                return None, f"Question {number} needs a list of choices."
            options = [o.strip() for o in raw if isinstance(o, str) and o.strip()]
            if len(options) != len(raw):
                return None, f"Question {number} has an empty or invalid choice."
            if not 2 <= len(options) <= MAX_OPTIONS:
                return None, f"Question {number} needs between 2 and {MAX_OPTIONS} choices."
            if len({o.casefold() for o in options}) != len(options):
                return None, f"Question {number} has two choices that are the same."
            if any(len(o) > 200 for o in options):
                return None, f"Question {number} has a choice that is too long."
        out.append({"kind": kind, "prompt": prompt, "required": bool(row.get("required", False)), "options": options})
    return out, None


def _question_json(q):
    return {"id": q.pk, "kind": q.kind, "prompt": q.prompt, "required": q.required, "options": q.options}


def _form_json(form, *, with_questions=True, submitted=None, response_count=None):
    data = {
        "id": form.pk,
        "classroom_id": form.classroom_id,
        "classroom_name": form.classroom.name,
        "title": form.title,
        "description": form.description,
        "status": form.status,
        "created_at": form.created_at.isoformat(),
    }
    if with_questions:
        data["questions"] = [_question_json(q) for q in form.questions.all()]
    if submitted is not None:
        data["submitted"] = submitted
    if response_count is not None:
        data["response_count"] = response_count
    return data


def _write_questions(form, questions):
    form.questions.all().delete()
    FormQuestion.objects.bulk_create([FormQuestion(form=form, sequence=i, **q) for i, q in enumerate(questions)])


# ---- list / create -------------------------------------------------------------

class FormListView(APIView):
    def get(self, request):
        user = request.user
        if _is_teacher(user):
            forms = Form.objects.filter(classroom__in=visible_courses(user)).select_related("classroom")
            if request.query_params.get("classroom"):
                forms = forms.filter(classroom_id=request.query_params["classroom"])
            forms = forms.filter(owner=user) if user.role == "TEACHER" else forms
            counts = {f.pk: f.responses.count() for f in forms}
            return Response([_form_json(f, with_questions=False, response_count=counts[f.pk]) for f in forms])
        # A student: published forms of enrolled classrooms, and whether they already answered.
        forms = Form.objects.filter(
            classroom__in=visible_courses(user), status=Form.Status.PUBLISHED
        ).select_related("classroom")
        done = set(FormResponse.objects.filter(student=user, form__in=forms).values_list("form_id", flat=True))
        return Response([_form_json(f, with_questions=False, submitted=f.pk in done) for f in forms])

    def post(self, request):
        if getattr(request.user, "role", "") != "TEACHER":
            return _denied()
        classroom = Classroom.objects.filter(pk=request.data.get("classroom_id")).first() if str(request.data.get("classroom_id", "")).isdigit() else None
        if classroom is None or not can_manage_course(request.user, classroom):
            return _bad("Choose one of your own classrooms.")
        title = request.data.get("title")
        title = title.strip() if isinstance(title, str) else ""
        if not title or len(title) > 255:
            return _bad("Give the form a title of up to 255 characters.")
        description = request.data.get("description", "")
        if not isinstance(description, str) or len(description) > 5000:
            return _bad("The description must be text of at most 5000 characters.")
        questions, error = clean_questions(request.data.get("questions", []))
        if error:
            return _bad(error)
        with transaction.atomic():
            form = Form.objects.create(classroom=classroom, owner=request.user, title=title, description=description.strip())
            _write_questions(form, questions)
        return Response(_form_json(form), status=status.HTTP_201_CREATED)


# ---- one form ------------------------------------------------------------------

def _load(form_id):
    return get_object_or_404(Form.objects.select_related("classroom").prefetch_related("questions"), pk=form_id)


class FormDetailView(APIView):
    def get(self, request, form_id):
        form = _load(form_id)
        user = request.user
        if can_manage_course(user, form.classroom):
            return Response(_form_json(form, response_count=form.responses.count()))
        if form.status == Form.Status.PUBLISHED and can_view_course(user, form.classroom):
            return Response(_form_json(form, submitted=form.responses.filter(student=user).exists()))
        return Response({"detail": "Form not found."}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, form_id):
        form = _load(form_id)
        if getattr(request.user, "role", "") != "TEACHER" or not can_manage_course(request.user, form.classroom):
            return _denied()
        data = request.data
        if "title" in data:
            title = data.get("title")
            title = title.strip() if isinstance(title, str) else ""
            if not title or len(title) > 255:
                return _bad("Give the form a title of up to 255 characters.")
            form.title = title
        if "description" in data:
            description = data.get("description")
            if not isinstance(description, str) or len(description) > 5000:
                return _bad("The description must be text of at most 5000 characters.")
            form.description = description.strip()
        questions = None
        if "questions" in data:
            if form.responses.exists():
                return _bad("Students have already answered, so the questions can no longer change.", status.HTTP_409_CONFLICT)
            questions, error = clean_questions(data.get("questions"))
            if error:
                return _bad(error)
        with transaction.atomic():
            form.save()
            if questions is not None:
                _write_questions(form, questions)
        return Response(_form_json(_load(form_id), response_count=form.responses.count()))

    def delete(self, request, form_id):
        form = _load(form_id)
        if getattr(request.user, "role", "") != "TEACHER" or not can_manage_course(request.user, form.classroom):
            return _denied()
        form.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FormStatusView(APIView):
    """Publish, close or return a form to draft."""

    def post(self, request, form_id):
        form = _load(form_id)
        if getattr(request.user, "role", "") != "TEACHER" or not can_manage_course(request.user, form.classroom):
            return _denied()
        target = request.data.get("status")
        if target not in {s for s, _ in Form.Status.choices}:
            return _bad("Status must be DRAFT, PUBLISHED or CLOSED.")
        if target == Form.Status.PUBLISHED and not form.questions.exists():
            return _bad("Add at least one question before publishing.")
        if target == Form.Status.DRAFT and form.responses.exists():
            return _bad("Students have already answered, so this form cannot go back to draft. Close it instead.", status.HTTP_409_CONFLICT)
        was_published = form.status == Form.Status.PUBLISHED
        form.status = target
        form.save(update_fields=["status", "updated_at"])
        if target == Form.Status.PUBLISHED and not was_published:
            notify(course_student_ids(form.classroom), "form", f"New form in {form.classroom.name}", form.title, "/forms")
        return Response(_form_json(form, response_count=form.responses.count()))


# ---- answering -----------------------------------------------------------------

def check_answers(form, raw):
    """({question_id: (text, selected)}, error) for a student's submission."""
    if not isinstance(raw, list):
        return None, "Send an answer list."
    questions = {q.pk: q for q in form.questions.all()}
    given = {}
    for row in raw:
        if not isinstance(row, dict):
            return None, "An answer is not valid."
        try:
            qid = int(row.get("question_id"))
        except (TypeError, ValueError):
            return None, "An answer names a question that does not exist."
        if qid not in questions:
            return None, "An answer names a question that is not on this form."
        if qid in given:
            return None, "A question was answered twice."
        q = questions[qid]
        text, selected = "", []
        if q.kind in (FormQuestion.Kind.SHORT, FormQuestion.Kind.PARAGRAPH):
            value = row.get("text", "")
            if not isinstance(value, str) or len(value) > MAX_TEXT or (q.kind == FormQuestion.Kind.SHORT and len(value) > 300):
                return None, f"Answer to '{q.prompt}' is not valid or is too long."
            text = value.strip()
        else:
            picked = row.get("selected", [])
            if not isinstance(picked, list) or not all(isinstance(p, str) for p in picked):
                return None, f"Answer to '{q.prompt}' is not valid."
            if any(p not in q.options for p in picked) or len(set(picked)) != len(picked):
                return None, f"'{q.prompt}' has an answer that is not one of its choices."
            if q.kind == FormQuestion.Kind.CHOICE and len(picked) > 1:
                return None, f"'{q.prompt}' takes one answer only."
            selected = picked
        given[qid] = (text, selected)
    for q in questions.values():
        text, selected = given.get(q.pk, ("", []))
        if q.required and not text and not selected:
            return None, f"'{q.prompt}' needs an answer."
    return given, None


class FormSubmitView(APIView):
    def post(self, request, form_id):
        form = _load(form_id)
        user = request.user
        if getattr(user, "role", "") != "STUDENT" or not can_view_course(user, form.classroom):
            return _denied()
        if form.status != Form.Status.PUBLISHED:
            return _bad("This form is not open for answers.", status.HTTP_409_CONFLICT)
        given, error = check_answers(form, request.data.get("answers"))
        if error:
            return _bad(error)
        try:
            with transaction.atomic():
                response = FormResponse.objects.create(form=form, student=user)
                FormAnswer.objects.bulk_create([
                    FormAnswer(response=response, question_id=qid, text=text, selected=selected)
                    for qid, (text, selected) in given.items()
                    if text or selected
                ])
        except IntegrityError:
            return _bad("You have already answered this form.", status.HTTP_409_CONFLICT)
        return Response({"detail": "Thank you. Your answers were saved."}, status=status.HTTP_201_CREATED)


# ---- results (teacher) ---------------------------------------------------------

def _answer_cell(answer):
    if answer is None:
        return ""
    return ", ".join(answer.selected) if answer.selected else answer.text


def _safe(value):
    """Stop spreadsheet apps from running a cell that starts like a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


class FormResponsesView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, form_id):
        form = _load(form_id)
        if not can_manage_course(request.user, form.classroom):
            return _denied()
        questions = list(form.questions.all())
        responses = list(form.responses.select_related("student").prefetch_related("answers"))
        by_response = [{a.question_id: a for a in r.answers.all()} for r in responses]

        if request.query_params.get("export") == "csv":
            out = HttpResponse(content_type="text/csv")
            out["Content-Disposition"] = f'attachment; filename="form_{form.pk}_responses.csv"'
            writer = csv.writer(out)
            writer.writerow(["Student", "Email", "Submitted", *[_safe(q.prompt) for q in questions]])
            for r, answers in zip(responses, by_response):
                writer.writerow([
                    _safe(r.student.full_name), r.student.email, r.submitted_at.strftime("%Y-%m-%d %H:%M"),
                    *[_safe(_answer_cell(answers.get(q.pk))) for q in questions],
                ])
            return out

        summary = []
        for q in questions:
            item = {"question_id": q.pk, "prompt": q.prompt, "kind": q.kind, "answered": sum(1 for a in by_response if q.pk in a)}
            if q.kind in CHOICE_KINDS:
                item["counts"] = [
                    {"option": o, "count": sum(1 for a in by_response if q.pk in a and o in a[q.pk].selected)} for o in q.options
                ]
            summary.append(item)
        enrolled = form.classroom.enrollments.filter(is_active=True).count()
        return Response({
            "form": _form_json(form),
            "enrolled": enrolled,
            "summary": summary,
            "responses": [
                {
                    "id": r.pk,
                    "student": r.student.full_name or r.student.email,
                    "email": r.student.email,
                    "submitted_at": r.submitted_at.isoformat(),
                    "answers": {str(q.pk): _answer_cell(answers.get(q.pk)) for q in questions},
                }
                for r, answers in zip(responses, by_response)
            ],
        })
