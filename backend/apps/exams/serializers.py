from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from .models import Exam, ExamQuestion, ExamChoice, ExamAttempt, ExamAnswer, ExamReset, exam_availability, personal_deadline
from .paper import attempt_questions, paper_total, pool_groups


class ExamChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamChoice
        fields = ["id", "choice_text", "is_correct"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.context.get("hide_answers"):
            data.pop("is_correct", None)
        return data


class ExamQuestionSerializer(serializers.ModelSerializer):
    choices = ExamChoiceSerializer(many=True, required=False)

    class Meta:
        model = ExamQuestion
        fields = ["id", "question_text", "question_type", "points", "order", "word_limit", "accepted_answers", "answer_guide", "choices"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.context.get("hide_answers"):
            # Students never receive the accepted answers or the marking notes.
            data.pop("accepted_answers", None)
            data.pop("answer_guide", None)
        return data


class ExamAnswerSerializer(serializers.ModelSerializer):
    question_id = serializers.IntegerField(source="question.id", read_only=True)

    class Meta:
        model = ExamAnswer
        fields = ["id", "question_id", "selected_choice_id", "text_answer", "awarded_points", "feedback"]


class ExamAttemptSerializer(serializers.ModelSerializer):
    """An attempt. ``student_name`` / ``student_email`` identify whose it is for the teacher's lists.

    With ``include_review`` in the context (and the attempt finished, or the viewer a teacher) it also
    carries the exam's questions with the answer key, which is what the answer sheet displays.
    """

    answers = ExamAnswerSerializer(many=True, read_only=True)
    student_name = serializers.SerializerMethodField()
    student_email = serializers.SerializerMethodField()
    remaining_seconds = serializers.SerializerMethodField()
    exam = serializers.SerializerMethodField()
    paper = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            "id", "student_id", "student_name", "student_email", "score", "earned_points", "total_points",
            "status", "flag_reason", "start_time", "end_time", "expires_at", "remaining_seconds", "answers", "exam",
            "paper",
        ]

    def get_paper(self, attempt):
        """The questions this student sits, in their order (no answer key). Only while the attempt runs."""
        if not self.context.get("include_paper") or attempt.status != "in_progress":
            return None
        return [
            {
                "id": q.id, "question_text": q.question_text, "question_type": q.question_type, "points": points,
                "order": position, "word_limit": q.word_limit,
                "choices": [{"id": c.id, "choice_text": c.choice_text} for c in choices],
            }
            for position, (q, points, choices) in enumerate(attempt_questions(attempt))
        ]

    def _student(self, attempt):
        users = self.context.get("users")
        if users is None:
            users = self.context["users"] = {}
        if attempt.student_id not in users:
            users[attempt.student_id] = get_user_model().objects.filter(pk=attempt.student_id).first()
        return users[attempt.student_id]

    def get_student_name(self, attempt):
        student = self._student(attempt)
        return student.full_name if student else ""

    def get_student_email(self, attempt):
        student = self._student(attempt)
        return student.email if student else ""

    def get_remaining_seconds(self, attempt):
        if attempt.status != "in_progress" or not attempt.expires_at:
            return None
        return max(0, int((attempt.expires_at - timezone.now()).total_seconds()))

    def get_exam(self, attempt):
        if not self.context.get("include_review"):
            return None
        if attempt.status in ("in_progress", "flagged") and not self.context.get("viewer_manages"):
            return None  # no answer key while sitting the exam, and none for an attempt ended for cheating
        exam = attempt.exam
        manages = bool(self.context.get("viewer_manages"))
        questions = []
        for position, (q, points, choices) in enumerate(attempt_questions(attempt)):
            item = {
                "id": q.id,
                "question_text": q.question_text,
                "question_type": q.question_type,
                "points": points,
                "order": position,
                "word_limit": q.word_limit,
                "choices": [{"id": c.id, "choice_text": c.choice_text, "is_correct": c.is_correct} for c in choices],
            }
            if manages:  # the answer key for written questions is the teacher's only
                item["accepted_answers"] = q.accepted_answers
                item["answer_guide"] = q.answer_guide
            questions.append(item)
        return {"id": exam.id, "title": exam.title, "questions": questions}


class ExamSerializer(serializers.ModelSerializer):
    course_id = serializers.IntegerField(source="course.id", read_only=True)
    course_code = serializers.CharField(source="course.subject_code", read_only=True)
    course_name = serializers.CharField(source="course.name", read_only=True)
    questions = ExamQuestionSerializer(many=True, required=False)
    attempts = serializers.SerializerMethodField()
    availability = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()
    my_reset = serializers.SerializerMethodField()
    paper_total = serializers.SerializerMethodField()
    pool_groups = serializers.SerializerMethodField()

    def get_availability(self, exam):
        availability = exam_availability(exam)
        student_id = self.context.get("attempts_for_student")
        if availability == "ended" and student_id is not None and personal_deadline(exam, student_id):
            return "open"  # a reset gave this student a personal deadline
        return availability

    def get_my_reset(self, exam):
        """For a student: their latest reset of this exam, so the card can say they may start again."""
        student_id = self.context.get("attempts_for_student")
        if student_id is None:
            return None
        latest = ExamReset.objects.filter(exam=exam, student_id=student_id).order_by("-created_at").first()
        return {"at": latest.created_at, "allowed_until": latest.allowed_until} if latest else None

    def get_question_count(self, exam):
        """Questions on one student's paper."""
        if exam.pattern:
            return sum(section["count"] for section in exam.pattern)
        return len(exam.questions.all())

    def get_paper_total(self, exam):
        return paper_total(exam.pattern, list(exam.questions.all()))

    def get_pool_groups(self, exam):
        if self.context.get("hide_answers"):
            return None  # students never see how the pool is made up
        return pool_groups(list(exam.questions.all()))

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.context.get("hide_answers") and instance.pattern:
            # A student must not see the whole pool: their paper arrives when they start.
            data["questions"] = []
            data["pattern"] = None
        return data

    def get_attempts(self, exam):
        attempts = exam.attempts.all()
        student_id = self.context.get("attempts_for_student")
        if student_id is not None:
            attempts = [a for a in attempts if a.student_id == student_id]
        return ExamAttemptSerializer(attempts, many=True, context=self.context).data

    class Meta:
        model = Exam
        fields = [
            "id",
            "course_id",
            "course_code",
            "course_name",
            "title",
            "description",
            "time_limit",
            "attempts_allowed",
            "randomize_questions",
            "pattern",
            "question_count",
            "my_reset",
            "paper_total",
            "pool_groups",
            "opens_at",
            "closes_at",
            "availability",
            "status",
            "created_at",
            "questions",
            "attempts",
        ]
