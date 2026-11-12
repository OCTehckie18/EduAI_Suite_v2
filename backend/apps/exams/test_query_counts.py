from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from .test_paper import PaperBase, pool_of_mcqs


def queries_for(client, url):
    with CaptureQueriesContext(connection) as captured:
        response = client.get(url)
    assert response.status_code == 200, response.content
    return len(captured)


class ExamListQueryCountTests(PaperBase):
    """The exam lists answer in a fixed number of queries, however many students have sat the exams."""

    def sit_many(self, exam, first, last):
        for n in range(first, last):
            self.assertEqual(self.start(self.student_number(n), exam).status_code, 201)

    def test_the_teachers_exam_list_does_not_grow_with_the_number_of_students(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 3}], pool_of_mcqs(9))
        self.sit_many(exam, 10, 13)
        self.client.force_authenticate(self.teacher)
        few = queries_for(self.client, reverse("exam-list-create"))
        self.sit_many(exam, 13, 25)
        self.client.force_authenticate(self.teacher)
        many = queries_for(self.client, reverse("exam-list-create"))
        self.assertEqual(few, many, "the exam list runs more queries as students are added")

    def test_the_attempt_list_does_not_grow_with_the_number_of_students(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 3}], pool_of_mcqs(9))
        self.sit_many(exam, 10, 13)
        self.client.force_authenticate(self.teacher)
        url = reverse("exam-attempts-list", args=[exam.pk])
        few = queries_for(self.client, url)
        self.sit_many(exam, 13, 25)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(few, queries_for(self.client, url))

    def test_the_students_exam_list_does_not_grow_with_the_number_of_exams(self):
        self.make_exam(pool_of_mcqs(4))
        self.client.force_authenticate(self.student)
        one = queries_for(self.client, reverse("exam-list-create"))
        for _ in range(5):
            self.make_exam(pool_of_mcqs(4))
        self.client.force_authenticate(self.student)
        self.assertEqual(one, queries_for(self.client, reverse("exam-list-create")))
