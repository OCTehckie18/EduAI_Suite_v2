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
from apps.core.utils.file_uploads import MAX_SPREADSHEET_BYTES, validate_upload
from apps.core.utils.plan_parser import CoursePlanParser
from services.groq_service import DEFAULT_MODEL, GroqService

logger = logging.getLogger(__name__)

MAX_QUESTIONS_PER_IMPORT = 500
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_PROMPT_CHARS = 12000
OPTION_LETTERS = "ABCDEF"
HEADERS = ["Question", "Option A", "Option B", "Option C", "Option D", "Correct (A-D)", "Points"]


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
        sheet.append(["What is 2 + 2?", "3", "4", "5", "6", "B", 1])
        sheet.append(["The capital of France is...", "Paris", "Rome", "Madrid", "Berlin", "A", 2])
        for column, width in zip("ABCDEFG", (50, 20, 20, 20, 20, 14, 8)):
            sheet.column_dimensions[column].width = width
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
            rows = list(workbook.active.iter_rows(values_only=True))
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

        question_col = column("question", "question text")
        option_cols = [column(f"option {letter.lower()}") for letter in OPTION_LETTERS]
        option_cols = [(letter, col) for letter, col in zip(OPTION_LETTERS, option_cols) if col is not None]
        correct_col = column("correct (a-d)", "correct", "answer", "correct answer")
        points_col = column("points", "marks")
        if question_col is None or len(option_cols) < 2 or correct_col is None:
            return _error("The first row must have the headings Question, Option A, Option B, ... and Correct. Download the template to see the layout.")

        questions, errors = [], []
        for number, row in enumerate(rows[1:], start=2):
            if all(_cell_text(c) == "" for c in row):
                continue
            if len(questions) >= MAX_QUESTIONS_PER_IMPORT:
                errors.append(f"Stopped after {MAX_QUESTIONS_PER_IMPORT} questions.")
                break
            text = _cell_text(row[question_col]) if question_col < len(row) else ""
            options = [(letter, _cell_text(row[col]) if col < len(row) else "") for letter, col in option_cols]
            options = [(letter, value) for letter, value in options if value]
            answer = (_cell_text(row[correct_col]) if correct_col < len(row) else "").upper().rstrip(".")
            if not text:
                errors.append(f"Row {number}: the question is empty.")
            elif len(options) < 2:
                errors.append(f"Row {number}: needs at least two options.")
            elif answer not in {letter for letter, _ in options}:
                errors.append(f"Row {number}: the correct answer '{answer or '(blank)'}' does not match a filled option.")
            else:
                points = 1.0
                if points_col is not None and points_col < len(row) and _cell_text(row[points_col]):
                    try:
                        points = float(row[points_col])
                    except (TypeError, ValueError):
                        errors.append(f"Row {number}: points must be a number.")
                        continue
                    if not 0 < points <= 1000:
                        errors.append(f"Row {number}: points must be more than 0 and at most 1000.")
                        continue
                questions.append({
                    "question_text": text,
                    "question_type": "mcq",
                    "points": points,
                    "choices": [{"choice_text": value, "is_correct": letter == answer} for letter, value in options],
                })

        return Response({"questions": questions, "imported_count": len(questions), "errors": errors})


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
