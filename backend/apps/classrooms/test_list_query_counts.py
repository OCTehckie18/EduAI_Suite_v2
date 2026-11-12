from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.exams.test_question_types import QuestionTypeBase


def count(client, url):
    with CaptureQueriesContext(connection) as captured:
        response = client.get(url)
    assert response.status_code == 200, response.content
    return len(captured)


class ClassroomListQueryCountTests(QuestionTypeBase):
    def add_students(self, first, last):
        for n in range(first, last):
            student = User.objects.create_user(email=f"ql{n}@example.com", password="x", role=User.Role.STUDENT, register_no=f"QL{n}")
            Enrollment.objects.create(classroom=self.classroom, student=student)

    def test_the_course_list_does_not_grow_with_the_number_of_courses(self):
        self.client.force_authenticate(self.teacher)
        url = reverse("legacy-course-list")
        one = count(self.client, url)
        for n in range(5):
            Classroom.objects.create(
                name=f"Extra {n}", subject_code=f"X{n}", teacher=self.teacher, department=self.classroom.department,
                program=self.classroom.program, batch=self.classroom.batch,
            )
        self.assertEqual(one, count(self.client, url))

    def test_the_class_list_does_not_grow_with_the_number_of_students(self):
        self.client.force_authenticate(self.teacher)
        url = f"/api/v1/students/{self.classroom.pk}"
        self.add_students(1, 4)
        few = count(self.client, url)
        self.add_students(4, 20)
        self.assertEqual(few, count(self.client, url))
