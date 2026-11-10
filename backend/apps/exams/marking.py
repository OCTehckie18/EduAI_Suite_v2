"""Teacher marking of written answers: save marks, finish the attempt, suggest a mark with AI."""

import json
import logging
import math

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsTeacher
from apps.core.services import notify
from services.groq_service import DEFAULT_MODEL, GroqService

from .models import ExamAnswer, ExamAttempt, ExamQuestion
from .serializers import ExamAttemptSerializer
from .views import _bad, _can_manage, _finish, _forbidden

logger = logging.getLogger(__name__)

MAX_FEEDBACK = 2000
MARKABLE = (ExamQuestion.Type.LONG_ANSWER, ExamQuestion.Type.FILL_BLANK)


def _markable_attempt(request, exam_id, attempt_id):
    attempt = get_object_or_404(
        ExamAttempt.objects.select_for_update().select_related("exam__course"), pk=attempt_id, exam_id=exam_id
    )
    if not _can_manage(request.user, attempt.exam.course):
        return None, _forbidden()
    if attempt.status not in ("pending_review", "submitted"):
        return None, Response(
            {"detail": "Only a handed-in attempt can be marked."}, status=status.HTTP_409_CONFLICT
        )
    return attempt, None


def _clean_marks(raw):
    marks = raw.get("marks") if isinstance(raw, dict) else raw
    if not isinstance(marks, list) or not marks:
        return None, "Send the marks as a list."
    cleaned = []
    for item in marks:
        if not isinstance(item, dict) or not isinstance(item.get("question_id"), int):
            return None, "Each mark needs a question_id."
        points = item.get("awarded_points")
        if isinstance(points, bool) or not isinstance(points, (int, float)) or not math.isfinite(points):
            return None, "Marks must be numbers."
        feedback = str(item.get("feedback") or "").strip()
        if len(feedback) > MAX_FEEDBACK:
            return None, f"Feedback is too long (at most {MAX_FEEDBACK} characters)."
        cleaned.append((item["question_id"], float(points), feedback))
    return cleaned, None


def finish_if_fully_marked(attempt):
    """Score the attempt once every written answer has marks. Returns True when it was finished."""
    answers = list(attempt.answers.select_related("question"))
    waiting = [a for a in answers if a.question.question_type == ExamQuestion.Type.LONG_ANSWER and a.awarded_points is None]
    if waiting:
        return False
    earned = sum(a.awarded_points or 0.0 for a in answers)
    total = sum(a.question.points for a in answers)
    score = round(earned / total * 100, 1) if total > 0 else 0.0
    _finish(attempt, score=score, earned=earned, total=total)
    return True


class ExamAttemptMarkView(APIView):
    """Save marks (and feedback) for written answers; the score appears once all are marked."""

    permission_classes = [IsTeacher]

    def post(self, request, exam_id, attempt_id):
        marks, error = _clean_marks(request.data)
        if error:
            return _bad(error)
        with transaction.atomic():
            attempt, problem = _markable_attempt(request, exam_id, attempt_id)
            if problem:
                return problem
            answers = {a.question_id: a for a in attempt.answers.select_related("question")}
            for question_id, points, feedback in marks:
                answer = answers.get(question_id)
                if answer is None:
                    return _bad("A mark refers to a question that is not part of this attempt.")
                if answer.question.question_type not in MARKABLE:
                    return _bad("Multiple-choice questions are marked automatically.")
                if not 0 <= points <= answer.question.points:
                    return _bad(f"Marks for a question must be between 0 and {answer.question.points:g}.")
            for question_id, points, feedback in marks:
                answer = answers[question_id]
                answer.awarded_points = points
                answer.feedback = feedback
                answer.marked_by = request.user
                answer.marked_at = timezone.now()
                answer.save(update_fields=["awarded_points", "feedback", "marked_by", "marked_at"])
            finished = finish_if_fully_marked(attempt)
        if finished:
            title = attempt.exam.title or "Exam"
            notify([attempt.student_id], "exam", f"{title} has been marked", f"Your score is {attempt.score:g}%.", "/exams")
        context = {"include_review": True, "viewer_manages": True}
        return Response(ExamAttemptSerializer(attempt, context=context).data)


class ExamAttemptSuggestMarkView(APIView):
    """An AI suggestion for one written answer. Nothing is saved; the teacher decides."""

    permission_classes = [IsTeacher]

    def post(self, request, exam_id, attempt_id):
        question_id = request.data.get("question_id")
        if not isinstance(question_id, int):
            return _bad("Send the question_id.")
        attempt = get_object_or_404(ExamAttempt.objects.select_related("exam__course"), pk=attempt_id, exam_id=exam_id)
        if not _can_manage(request.user, attempt.exam.course):
            return _forbidden()
        answer = get_object_or_404(ExamAnswer.objects.select_related("question"), attempt=attempt, question_id=question_id)
        question = answer.question
        if question.question_type != ExamQuestion.Type.LONG_ANSWER:
            return _bad("Only long answers can get a suggested mark.")
        if not answer.text_answer.strip():
            return _bad("This answer is blank.")
        client = GroqService.get_client()
        if client is None:
            return Response({"detail": "AI marking is not set up on this server."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        prompt = (
            "You help a teacher mark a written exam answer. Give a fair mark and one or two sentences of feedback "
            f"addressed to the student. The question is worth {question.points:g} marks. Return ONLY JSON: "
            '{"points": number, "feedback": string}.\n\n'
            f"Question: {question.question_text}\n"
            f"Marking notes from the teacher: {question.answer_guide or '(none given)'}\n"
            f"Student answer: {answer.text_answer[:6000]}"
        )
        try:
            result = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}], model=DEFAULT_MODEL,
                temperature=0.2, response_format={"type": "json_object"},
            )
            payload = json.loads(result.choices[0].message.content)
            points = float(payload.get("points"))
        except Exception as exc:
            logger.warning("Mark suggestion failed: %s", exc)
            return Response({"detail": "The AI service could not suggest a mark right now."}, status=status.HTTP_502_BAD_GATEWAY)
        if not math.isfinite(points):
            return Response({"detail": "The AI service could not suggest a mark right now."}, status=status.HTTP_502_BAD_GATEWAY)
        points = round(min(max(points, 0.0), question.points), 2)
        return Response({"question_id": question.pk, "points": points, "feedback": str(payload.get("feedback") or "")[:MAX_FEEDBACK]})
