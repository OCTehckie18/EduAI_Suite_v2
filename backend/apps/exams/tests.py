from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.classrooms.models import Classroom, Enrollment
from apps.institution.models import Batch, Campus, Department, Program, School
from .models import Exam, ExamAttempt, ExamChoice, ExamQuestion

User = get_user_model()


class ExamAccessTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        campus = Campus.objects.create(name="Central", code="C", city="Bengaluru")
        school = School.objects.create(name="Sci", code="S", campus=campus)
        department = Department.objects.create(name="CS", code="CS", school=school)
        program = Program.objects.create(name="BCA", code="BCA", department=department, degree_level="UG", duration_years=3)
        batch = Batch.objects.create(name="2025", program=program, start_year=2025, end_year=2028, academic_year="2025-26")

        cls.teacher = User.objects.create_user(email="t@example.com", password="x", role=User.Role.TEACHER)
        cls.other_teacher = User.objects.create_user(email="t2@example.com", password="x", role=User.Role.TEACHER)
        cls.student = User.objects.create_user(email="s@example.com", password="x", role=User.Role.STUDENT, register_no="R1")
        cls.outsider = User.objects.create_user(email="o@example.com", password="x", role=User.Role.STUDENT, register_no="R2")

        cls.classroom = Classroom.objects.create(
            name="Maths", subject_code="M1", teacher=cls.teacher, department=department, program=program, batch=batch
        )
        Enrollment.objects.create(classroom=cls.classroom, student=cls.student)

        cls.exam = Exam.objects.create(course=cls.classroom, title="Quiz", status="published", attempts_allowed=1)
        question = ExamQuestion.objects.create(exam=cls.exam, question_text="2+2", points=1.0)
        cls.right = ExamChoice.objects.create(question=question, choice_text="4", is_correct=True)
        cls.wrong = ExamChoice.objects.create(question=question, choice_text="5", is_correct=False)
        cls.question = question

    def login(self, user):
        self.client.force_authenticate(user)

    def test_anonymous_is_rejected_everywhere(self):
        calls = [
            self.client.get(reverse("exam-list-create")),
            self.client.post(reverse("exam-list-create"), {}, format="json"),
            self.client.get(reverse("exam-stats")),
            self.client.get(reverse("exam-detail", args=[self.exam.pk])),
            self.client.delete(reverse("exam-detail", args=[self.exam.pk])),
            self.client.get(reverse("exam-attempts-list", args=[self.exam.pk])),
            self.client.post(reverse("exam-attempt-start", args=[self.exam.pk]), {"student_id": 1}, format="json"),
        ]
        self.assertTrue(all(r.status_code in (401, 403) for r in calls))
        self.assertTrue(Exam.objects.filter(pk=self.exam.pk).exists())

    def test_student_cannot_see_answer_key_or_modify_exam(self):
        self.login(self.student)
        detail = self.client.get(reverse("exam-detail", args=[self.exam.pk]))
        self.assertEqual(detail.status_code, 200)
        for choice in detail.data["questions"][0]["choices"]:
            self.assertNotIn("is_correct", choice)
        self.assertEqual(self.client.put(reverse("exam-detail", args=[self.exam.pk]), {"title": "x"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(reverse("exam-detail", args=[self.exam.pk])).status_code, 403)
        self.assertEqual(self.client.get(reverse("exam-attempts-list", args=[self.exam.pk])).status_code, 403)

    def test_teacher_sees_answer_key_but_other_teacher_cannot_manage(self):
        self.login(self.teacher)
        detail = self.client.get(reverse("exam-detail", args=[self.exam.pk]))
        self.assertIn("is_correct", detail.data["questions"][0]["choices"][0])

        self.login(self.other_teacher)
        self.assertEqual(self.client.get(reverse("exam-detail", args=[self.exam.pk])).status_code, 403)
        self.assertEqual(self.client.delete(reverse("exam-detail", args=[self.exam.pk])).status_code, 403)
        self.assertEqual(
            self.client.post(reverse("exam-list-create"), {"course_id": self.classroom.pk, "title": "hijack"}, format="json").status_code,
            403,
        )

    def test_unenrolled_student_cannot_view_or_start(self):
        self.login(self.outsider)
        self.assertEqual(self.client.get(reverse("exam-detail", args=[self.exam.pk])).status_code, 403)
        self.assertEqual(self.client.post(reverse("exam-attempt-start", args=[self.exam.pk])).status_code, 403)
        self.assertEqual(self.client.get(reverse("exam-list-create")).data, [])

    def test_attempt_identity_comes_from_token_not_body(self):
        self.login(self.student)
        response = self.client.post(reverse("exam-attempt-start", args=[self.exam.pk]), {"student_id": self.outsider.pk}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["student_id"], self.student.pk)

    def test_attempt_is_private_and_single_submission(self):
        self.login(self.student)
        attempt_id = self.client.post(reverse("exam-attempt-start", args=[self.exam.pk])).data["id"]

        self.login(self.outsider)
        submit_url = reverse("exam-attempt-submit", args=[self.exam.pk, attempt_id])
        detail_url = reverse("exam-attempt-detail", args=[self.exam.pk, attempt_id])
        self.assertEqual(self.client.post(submit_url, {"answers": []}, format="json").status_code, 403)
        self.assertEqual(self.client.get(detail_url).status_code, 403)

        self.login(self.student)
        answers = {"answers": [{"question_id": self.question.pk, "selected_choice_id": self.right.pk}] * 2}
        first = self.client.post(submit_url, answers, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["score"], 100.0)
        self.assertEqual(len(first.data["answers"]), 1)
        self.assertEqual(self.client.post(submit_url, answers, format="json").status_code, 409)

        self.login(self.teacher)
        self.assertEqual(self.client.get(detail_url).status_code, 200)
        self.assertEqual(self.client.get(reverse("exam-attempts-list", args=[self.exam.pk])).status_code, 200)

    def test_attempts_allowed_is_enforced(self):
        self.login(self.student)
        first = self.client.post(reverse("exam-attempt-start", args=[self.exam.pk])).data["id"]
        self.client.post(
            reverse("exam-attempt-submit", args=[self.exam.pk, first]),
            {"answers": [{"question_id": self.question.pk, "selected_choice_id": self.wrong.pk}]},
            format="json",
        )
        self.assertEqual(self.client.post(reverse("exam-attempt-start", args=[self.exam.pk])).status_code, 403)
        self.assertEqual(ExamAttempt.objects.filter(exam=self.exam).count(), 1)

    def test_student_list_hides_other_students_attempts(self):
        ExamAttempt.objects.create(exam=self.exam, student_id=self.outsider.pk, status="submitted", score=50)
        self.login(self.student)
        data = self.client.get(reverse("exam-list-create")).data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["attempts"], [])
