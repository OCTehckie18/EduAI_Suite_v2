from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.announcements.models import Announcement
from apps.assignments.models import Assignment
from apps.classrooms.models import Classroom, Enrollment
from apps.exams.models import Exam
from apps.institution.models import Batch, Campus, Department, Program, School
from apps.lessons.models import Lesson
from apps.ai_chat.context import _build_platform_context


class AIChatRetrievalTests(APITestCase):
    def test_chat_requires_authentication(self):
        response = self.client.post(
            "/ai/chat", {"message": "What appointments do I have?"}, format="json")

        self.assertEqual(response.status_code, 403)

    @patch("apps.ai_chat.views.GroqService.get_client")
    def test_chat_grounds_groq_prompt_in_authenticated_teacher_appointments(self, get_client):
        teacher = get_user_model().objects.create_user(
            email="teacher@example.com",
            password="password",
            role="TEACHER",
            first_name="Ada",
            last_name="Lovelace",
        )
        other_teacher = get_user_model().objects.create_user(
            email="other@example.com",
            password="password",
            role="TEACHER",
            first_name="Alan",
            last_name="Turing",
        )
        Appointment.objects.create(
            teacher_name="Ada Lovelace",
            student_name="Grace Hopper",
            student_email="grace@example.com",
            time_slot="2026-09-25 10:00",
            agenda="Discuss compiler design",
            status="approved",
        )
        Appointment.objects.create(
            teacher_name="Alan Turing",
            student_name="Private Student",
            student_email="private@example.com",
            time_slot="2026-09-25 11:00",
            agenda="Private meeting",
            status="pending",
        )

        captured = {}

        class FakeCompletions:
            def create(self, **kwargs):
                captured["messages"] = kwargs["messages"]
                return SimpleNamespace(
                    choices=[SimpleNamespace(message=SimpleNamespace(
                        content="Your approved appointment is at 10:00."))]
                )

        get_client.return_value = SimpleNamespace(
            chat=SimpleNamespace(completions=FakeCompletions()))
        self.client.force_authenticate(user=teacher)

        response = self.client.post(
            "/ai/chat", {"message": "What appointments do I have?"}, format="json")

        self.assertEqual(response.status_code, 200)
        system_context = captured["messages"][0]["content"]
        self.assertIn("Grace Hopper", system_context)
        self.assertIn("Discuss compiler design", system_context)
        self.assertNotIn("Private Student", system_context)
        self.assertNotIn(other_teacher.full_name, system_context)

    def test_platform_context_is_scoped_to_owned_classrooms(self):
        teacher = get_user_model().objects.create_user(
            email="owner@example.com",
            password="password",
            role="TEACHER",
            first_name="Grace",
            last_name="Hopper",
        )
        other_teacher = get_user_model().objects.create_user(
            email="other-owner@example.com",
            password="password",
            role="TEACHER",
            first_name="Alan",
            last_name="Turing",
        )
        campus = Campus.objects.create(
            name="Main Campus", code="MAIN", city="Bengaluru")
        school = School.objects.create(
            name="School of Computing", code="SOC", campus=campus)
        department = Department.objects.create(
            name="Computer Science", code="CS", school=school)
        program = Program.objects.create(
            name="Computer Science",
            code="BSC-CS",
            department=department,
            degree_level="UG",
            duration_years=4,
        )
        batch = Batch.objects.create(
            name="2026",
            program=program,
            start_year=2026,
            end_year=2030,
            academic_year="2026-27",
        )
        owned_classroom = Classroom.objects.create(
            name="Owned Algorithms",
            subject_code="CS-301",
            teacher=teacher,
            department=department,
            program=program,
            batch=batch,
            description="Graph algorithms and complexity",
        )
        other_classroom = Classroom.objects.create(
            name="Private Networks",
            subject_code="CS-401",
            teacher=other_teacher,
            department=department,
            program=program,
            batch=batch,
        )
        student = get_user_model().objects.create_user(
            email="student@example.com",
            password="password",
            role="STUDENT",
            first_name="Grace",
            last_name="Student",
            register_no="STU-1",
        )
        other_student = get_user_model().objects.create_user(
            email="private-student@example.com",
            password="password",
            role="STUDENT",
            first_name="Private",
            last_name="Student",
            register_no="STU-2",
        )
        Enrollment.objects.create(classroom=owned_classroom, student=student)
        Enrollment.objects.create(
            classroom=other_classroom, student=other_student)
        owned_assignment = Assignment.objects.create(
            course=owned_classroom,
            title="Owned Assignment",
            description="Analyze a graph",
            due_date="2026-10-01",
        )
        Assignment.objects.create(
            course=other_classroom, title="Private Assignment")
        Exam.objects.create(course=owned_classroom,
                            title="Owned Exam", status="published")
        Exam.objects.create(course=other_classroom, title="Private Exam")
        Lesson.objects.create(course=owned_classroom,
                              title="Owned Lesson", topic="Graphs")
        Lesson.objects.create(course=other_classroom,
                              title="Private Lesson", topic="Routing")
        Announcement.objects.create(
            course=owned_classroom, title="Owned Announcement", body="Bring your notes")
        Announcement.objects.create(
            course=other_classroom, title="Private Announcement", body="Private notice")

        context = _build_platform_context(teacher)

        self.assertIn("Owned Algorithms", context)
        self.assertIn("Grace Student", context)
        self.assertIn("Owned Assignment", context)
        self.assertIn("Owned Exam", context)
        self.assertIn("Owned Lesson", context)
        self.assertIn("Owned Announcement", context)
        self.assertNotIn("Private Networks", context)
        self.assertNotIn("Private Student", context)
        self.assertNotIn("Private Assignment", context)
        self.assertNotIn("Private Exam", context)
        self.assertNotIn("Private Lesson", context)
        self.assertNotIn("Private Announcement", context)

        student_context = _build_platform_context(student)

        self.assertIn("Grace Student", student_context)
        self.assertNotIn("Private Student", student_context)
