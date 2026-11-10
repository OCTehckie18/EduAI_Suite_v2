"""Bring questions into the exam creator from a spreadsheet or a question paper.

Nothing here saves anything: the creator receives the questions, the teacher reviews and edits them,
and only then saves the exam (which validates everything again).
"""

import io
import json
import logging

from django.http import HttpResponse
from openpyxl import Workbook, load_workbook
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsTeacher
from apps.exams.grading import clean_accepted_answers, count_blanks
from apps.core.utils.file_uploads import MAX_SPREADSHEET_BYTES, validate_upload
from apps.core.utils.plan_parser import CoursePlanParser
from services.groq_service import DEFAULT_MODEL, GroqService

logger = logging.getLogger(__name__)

MAX_QUESTIONS_PER_IMPORT = 500
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_PROMPT_CHARS = 12000
OPTION_LETTERS = "ABCDEF"
HEADERS = ["Type", "Question", "Option A", "Option B", "Option C", "Option D", "Option E", "Option F",
           "Correct Option", "Accepted Answers", "Marks", "Answer Guide", "Word Limit"]
TYPE_NAMES = {
    "mcq": "mcq", "multiple choice": "mcq", "multiple-choice": "mcq",
    "fill in the blanks": "fill_blank", "fill in the blank": "fill_blank", "fill_blank": "fill_blank", "fill blank": "fill_blank", "blank": "fill_blank",
    "long answer": "long_answer", "long_answer": "long_answer", "long": "long_answer", "theory": "long_answer",
}


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _check_file(request, extensions, max_bytes):
    uploaded = request.FILES.get("file")
    if not uploaded:
        return None, _error("Choose a file to upload.")
    try:
        validate_upload(uploaded, extensions, max_bytes)
    except ValidationError as exc:
        detail = exc.detail[0] if isinstance(exc.detail, list) else exc.detail
        return None, _error(str(detail))
    return uploaded, None


class ExamTemplateView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Questions"
        sheet.append(HEADERS)
        sheet.append(["MCQ", "What is 2 + 2?", "3", "4", "5", "6", None, None, "B", None, 1, None, None])
        sheet.append(["Fill in the blanks", "The capital of France is ___.", None, None, None, None, None, None, None, "Paris", 2, None, None])
        sheet.append(["Fill in the blanks", "Water boils at ___ degrees Celsius at sea level and freezes at ___.", None, None, None, None, None, None, None, "100|one hundred;0|zero", 2, None, None])
        sheet.append(["Long answer", "Explain how photosynthesis works.", None, None, None, None, None, None, None, None, 6, "Light reactions, Calvin cycle, role of chlorophyll.", 250])
        for column, width in zip("ABCDEFGHIJKLM", (18, 50, 16, 16, 16, 16, 16, 16, 14, 28, 8, 40, 11)):
            sheet.column_dimensions[column].width = width
        guide = workbook.create_sheet("How to fill this in")
        for line in (
            "Each row is one question. The Type column decides which other columns to fill in.",
            "Type: MCQ, Fill in the blanks or Long answer.",
            "MCQ: fill Option A and Option B (more if you like, up to F) and Correct Option (a letter). Leave Accepted Answers empty.",
            "Fill in the blanks: write ___ in the Question where each blank goes. Leave all Option columns and Correct Option empty.",
            "   Accepted Answers: separate alternatives for one blank with | and separate blanks with ; (for example 100|one hundred;0|zero).",
            "   Spelling is not case sensitive and extra spaces are ignored. All blanks must be right to earn the marks.",
            "Long answer: leave all Option columns, Correct Option and Accepted Answers empty. You mark these yourself after the exam.",
            "   Answer Guide (optional) is your marking notes, never shown to students. Word Limit (optional) is a number.",
            "Marks: required on every row. A question can be worth any number above 0.",
        ):
            guide.append([line])
        guide.column_dimensions["A"].width = 120
        response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response["Content-Disposition"] = 'attachment; filename="exam_questions_template.xlsx"'
        workbook.save(response)
        return response


def _cell_text(value):
    return "" if value is None else str(value).strip()


class ExamImportExcelView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded, problem = _check_file(request, {".xlsx"}, MAX_SPREADSHEET_BYTES)
        if problem:
            return problem
        try:
            workbook = load_workbook(io.BytesIO(uploaded.read()), read_only=True, data_only=True)
            sheet = workbook["Questions"] if "Questions" in workbook.sheetnames else workbook.worksheets[0]
            rows = list(sheet.iter_rows(values_only=True))
        except Exception:
            return _error("That file could not be read as an Excel workbook. Use the template and save it as .xlsx.")
        if not rows:
            return _error("The spreadsheet is empty.")

        header = [_cell_text(c).lower() for c in rows[0]]

        def column(*names):
            for name in names:
                if name in header:
                    return header.index(name)
            return None

        cols = {
            "question": column("question", "question text"),
            "type": column("type", "question type"),
            "correct": column("correct option", "correct (a-d)", "correct", "answer", "correct answer"),
            "accepted": column("accepted answers", "accepted answer"),
            "points": column("marks", "points"),
            "guide": column("answer guide"),
            "limit": column("word limit"),
        }
        option_cols = [column(f"option {letter.lower()}") for letter in OPTION_LETTERS]
        cols["options"] = [(letter, col) for letter, col in zip(OPTION_LETTERS, option_cols) if col is not None]
        # Older sheets have no Type column: every row is a multiple-choice question.
        if cols["question"] is None or (cols["type"] is None and (len(cols["options"]) < 2 or cols["correct"] is None)):
            return _error("The first row must have the headings Type, Question, Option A, Option B, ... Correct Option and Marks. Download the template to see the layout.")

        questions, errors = [], []
        for number, row in enumerate(rows[1:], start=2):
            if all(_cell_text(c) == "" for c in row):
                continue
            if len(questions) >= MAX_QUESTIONS_PER_IMPORT:
                errors.append(f"Stopped after {MAX_QUESTIONS_PER_IMPORT} questions.")
                break
            problem, question = _read_row(number, row, cols)
            if problem:
                errors.append(problem)
            else:
                questions.append(question)

        return Response({"questions": questions, "imported_count": len(questions), "errors": errors})


def _cell(row, col):
    return _cell_text(row[col]) if col is not None and col < len(row) else ""


def _read_row(number, row, cols):
    """(error, question) for one spreadsheet row, following the rules of its type."""
    label = f"Row {number}"
    typed = cols["type"] is not None
    kind = "mcq"
    if typed:
        raw_type = _cell(row, cols["type"])
        kind = TYPE_NAMES.get(raw_type.lower())
        if kind is None:
            return f"{label}: the type '{raw_type or '(blank)'}' must be MCQ, Fill in the blanks or Long answer.", None
    text = _cell(row, cols["question"])
    if not text:
        return f"{label}: the question is empty.", None
    options = [(letter, _cell(row, col)) for letter, col in cols["options"]]
    options = [(letter, value) for letter, value in options if value]
    answer = _cell(row, cols["correct"]).upper().rstrip(".")
    accepted_text = _cell(row, cols["accepted"])

    points = 1.0
    if _cell(row, cols["points"]):
        try:
            points = float(row[cols["points"]])
        except (TypeError, ValueError):
            return f"{label}: marks must be a number.", None
        if not 0 < points <= 1000:
            return f"{label}: marks must be more than 0 and at most 1000.", None
    elif typed:
        return f"{label}: marks are required.", None

    question = {"question_text": text, "question_type": kind, "points": points, "choices": []}
    if kind == "mcq":
        if accepted_text:
            return f"{label}: a multiple-choice question cannot have accepted answers.", None
        if len(options) < 2:
            return f"{label}: needs at least two options.", None
        if answer not in {letter for letter, _ in options}:
            return f"{label}: the correct answer '{answer or '(blank)'}' does not match a filled option.", None
        question["choices"] = [{"choice_text": value, "is_correct": letter == answer} for letter, value in options]
        return None, question
    noun = "a fill in the blanks question" if kind == "fill_blank" else "a long-answer question"
    if options:
        return f"{label}: {noun} cannot have options.", None
    if answer:
        return f"{label}: {noun} cannot have a correct option.", None
    if kind == "fill_blank":
        blanks = count_blanks(text)
        if blanks < 1:
            return f"{label}: write ___ in the question where each blank goes.", None
        if not accepted_text:
            return f"{label}: accepted answers are required.", None
        groups = [group.split("|") for group in accepted_text.split(";")]
        accepted, error = clean_accepted_answers(groups, blanks, label)
        if error:
            return error, None
        question["accepted_answers"] = accepted
        return None, question
    if accepted_text:
        return f"{label}: a long-answer question cannot have accepted answers.", None
    question["answer_guide"] = _cell(row, cols["guide"])
    if _cell(row, cols["limit"]):
        try:
            limit = float(row[cols["limit"]])
        except (TypeError, ValueError):
            return f"{label}: the word limit must be a number.", None
        if not limit.is_integer() or not 1 <= limit <= 5000:
            return f"{label}: the word limit must be a whole number from 1 to 5000.", None
        question["word_limit"] = int(limit)
    return None, question


class ExamExtractView(APIView):
    """Read a PDF or Word question paper with AI and return the questions it finds."""

    permission_classes = [IsTeacher]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded, problem = _check_file(request, {".pdf", ".docx"}, MAX_DOCUMENT_BYTES)
        if problem:
            return problem
        content = uploaded.read()
        if uploaded.name.lower().endswith(".pdf"):
            text = CoursePlanParser.extract_text_from_pdf(content)
        else:
            text = CoursePlanParser.extract_text_from_docx(content)
        if not text.strip():
            return _error("No text could be read from that file. A scanned paper (an image) cannot be read; use the Excel import instead.")

        client = GroqService.get_client()
        if client is None:
            return _error("AI extraction is not set up on this server. Use the Excel import instead.", status.HTTP_503_SERVICE_UNAVAILABLE)

        prompt = (
            "Extract every multiple-choice question from this question paper. Return ONLY a JSON object "
            '{"questions": [{"question_text": str, "points": number, "choices": [{"choice_text": str, "is_correct": bool}]}]}. '
            "Each question needs at least two choices and exactly one with is_correct true. "
            "If the paper does not mark the correct answer, leave your best judgement but do not invent questions.\n\n"
            + text[:MAX_PROMPT_CHARS]
        )
        try:
            result = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=DEFAULT_MODEL,
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            payload = json.loads(result.choices[0].message.content)
        except Exception as exc:
            logger.warning("Exam question extraction failed: %s", exc)
            return _error("The AI service could not read that paper right now. Try again, or use the Excel import.", status.HTTP_502_BAD_GATEWAY)

        questions = []
        for item in (payload.get("questions") if isinstance(payload, dict) else None) or []:
            if not isinstance(item, dict):
                continue
            choices = [
                {"choice_text": str(c.get("choice_text") or "").strip(), "is_correct": bool(c.get("is_correct"))}
                for c in (item.get("choices") or []) if isinstance(c, dict) and str(c.get("choice_text") or "").strip()
            ]
            text_value = str(item.get("question_text") or "").strip()
            if text_value and len(choices) >= 2:
                try:
                    points = float(item.get("points") or 1)
                except (TypeError, ValueError):
                    points = 1.0
                questions.append({
                    "question_text": text_value,
                    "question_type": "mcq",
                    "points": points if 0 < points <= 1000 else 1.0,
                    "choices": choices,  # the teacher must confirm one correct choice before saving
                })
        return Response(questions[:MAX_QUESTIONS_PER_IMPORT])
