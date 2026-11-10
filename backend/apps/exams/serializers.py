from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from .models import Exam, ExamQuestion, ExamChoice, ExamAttempt, ExamAnswer, exam_availability


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

    class Meta:
        model = ExamAttempt
        fields = [
            "id", "student_id", "student_name", "student_email", "score", "earned_points", "total_points",
            "status", "flag_reason", "start_time", "end_time", "expires_at", "remaining_seconds", "answers", "exam",
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
        for q in exam.questions.all():
            item = {
                "id": q.id,
                "question_text": q.question_text,
                "question_type": q.question_type,
                "points": q.points,
                "order": q.order,
                "word_limit": q.word_limit,
                "choices": [{"id": c.id, "choice_text": c.choice_text, "is_correct": c.is_correct} for c in q.choices.all()],
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

    def get_availability(self, exam):
        return exam_availability(exam)

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
            "opens_at",
            "closes_at",
            "availability",
            "status",
            "created_at",
            "questions",
            "attempts",
        ]
