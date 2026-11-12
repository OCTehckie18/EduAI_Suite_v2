from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.testing import default_section
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment


class MailFilterFields(TestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        self.teacher = User.objects.create_user(email="t@x.com", password="x", role="TEACHER")
        self.asha = User.objects.create_user(email="asha@x.com", password="x", role="STUDENT", first_name="Asha", register_no="R100")
        self.ben = User.objects.create_user(email="ben@x.com", password="x", role="STUDENT", first_name="Ben", register_no="R200")
        course = Classroom.objects.create(name="C", subject_code="C1", teacher=self.teacher, department=batch.program.department,
                                          program=batch.program, batch=batch, section=section)
        for s in (self.asha, self.ben):
            Enrollment.objects.create(classroom=course, student=s)
        a = Assignment.objects.create(course=course, title="A", max_points=100)
        Submission.objects.create(assignment=a, student=self.asha, student_name="Asha", grade=40)
        self.client = APIClient()
        self.client.force_authenticate(self.teacher)

    def names(self, *conditions):
        res = self.client.post("/api/v1/mail/filter", {"conditions": [dict(zip(("field", "operator", "value"), c)) for c in conditions]}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        return sorted(r["name"] for r in res.json())

    def test_text_and_number_conditions(self):
        self.assertEqual(self.names(("name", "contains", "ASH")), ["Asha"])
        self.assertEqual(self.names(("registration_number", "==", "r200")), ["Ben"])
        self.assertEqual(self.names(("name", "!=", "asha")), ["Ben"])
        self.assertEqual(self.names(("avg_score", "<", 50)), ["Asha"])  # Ben has no marks, so he never matches a number
        self.assertEqual(self.names(("avg_score", "!=", 40)), [])

    def test_bad_conditions_are_explained(self):
        for bad in ([{"field": "avg_score", "operator": "<", "value": "x"}],
                    [{"field": "avg_score", "operator": "contains", "value": "4"}],
                    [{"field": "name", "operator": ">", "value": "a"}],
                    [{"field": "shoe_size", "operator": "==", "value": "9"}],
                    [{"field": "name", "operator": "~", "value": "a"}],
                    "nope"):
            res = self.client.post("/api/v1/mail/filter", {"conditions": bad}, format="json")
            self.assertEqual(res.status_code, 400, bad)
            self.assertTrue(res.json()["detail"])
