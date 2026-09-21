from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom, Enrollment
from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import Lesson


class LessonEduGamesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.campus = Campus.objects.create(name="Central", code="CENTRAL")
        self.school = School.objects.create(name="Science", code="SCI", campus=self.campus)
        self.department = Department.objects.create(name="Computer Science", code="CSE", school=self.school)
        self.program = Program.objects.create(
            name="Computer Science",
            code="BTECH-CSE",
            department=self.department,
            degree_level=Program.DegreeLevel.UG,
            duration_years=4,
        )
        self.batch = Batch.objects.create(
            name="2025-29",
            program=self.program,
            start_year=2025,
            end_year=2029,
            academic_year="2025-26",
        )
        self.section = Section.objects.create(name="A", batch=self.batch)
        user_model = get_user_model()
        self.teacher = user_model.objects.create_user(
            email="teacher@example.com",
            password="password123",
            role=user_model.Role.TEACHER,
            campus=self.campus,
            school=self.school,
            department=self.department,
        )
        self.classroom = Classroom.objects.create(
            name="Data Structures",
            subject_code="CS201",
            teacher=self.teacher,
            department=self.department,
            program=self.program,
            batch=self.batch,
            section=self.section,
        )
        for index in range(2):
            student = user_model.objects.create_user(
                email=f"student{index}@example.com",
                role=user_model.Role.STUDENT,
                first_name=f"Student {index}",
            )
            Enrollment.objects.create(classroom=self.classroom, student=student)

    def test_posted_lesson_prepares_edugames_session(self):
        lesson = Lesson.objects.create(
            course=self.classroom,
            title="Stacks",
            topic="Stacks",
            quiz_questions="1. What is a stack?\n2. What is LIFO?",
            created_by=self.teacher.id,
            posted_at=timezone.now(),
        )

        response = self.client.post(f"/api/v1/lessons/{lesson.id}/edugames")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Stacks Quiz")
        self.assertEqual(response.data["session_id"].startswith("game_"), True)
        self.assertEqual(len(response.data["players"]), 2)
        self.assertEqual(
            [question["question_text"] for question in response.data["questions"]],
            ["What is a stack?", "What is LIFO?"],
        )

    def test_unposted_lesson_cannot_be_sent_to_edugames(self):
        lesson = Lesson.objects.create(
            course=self.classroom,
            topic="Queues",
            quiz_questions="1. What is FIFO?",
            created_by=self.teacher.id,
        )

        response = self.client.post(f"/api/v1/lessons/{lesson.id}/edugames")

        self.assertEqual(response.status_code, 400)