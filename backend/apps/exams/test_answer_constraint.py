from django.db import IntegrityError, transaction

from .models import ExamAnswer, ExamAttempt
from .test_question_types import QuestionTypeBase, mcq


class OneAnswerPerQuestionTests(QuestionTypeBase):
    def test_a_second_answer_to_the_same_question_is_refused_by_the_database(self):
        exam = self.make_exam([mcq(text="2+2?")])
        attempt = ExamAttempt.objects.create(exam=exam, student_id=self.student.pk)
        question = exam.questions.get()
        ExamAnswer.objects.create(attempt=attempt, question=question)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ExamAnswer.objects.create(attempt=attempt, question=question)
