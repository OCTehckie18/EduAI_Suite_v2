from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.assignments.models import Assignment
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import StudentActivity
from apps.exams.models import Exam, ExamAttempt
from apps.institution.models import Batch, Campus, Department, Program, School, Section
from apps.quizzes.models import Quiz, QuizSession

from .models import CalendarEvent

User = get_user_model()


class CalendarSyncTests(APITestCase):
    def setUp(self):
        campus = Campus.objects.create(name="Central", code="CEN", city="Bengaluru")
        school = School.objects.create(name="Sciences", code="SOS", campus=campus)
        dept = Department.objects.create(name="CS", code="CS", school=school)
        program = Program.objects.create(
            name="BTech", code="BT", department=dept,
            degree_level=Program.DegreeLevel.UG, duration_years=4)
        batch = Batch.objects.create(
            name="2025-29", program=program, start_year=2025, end_year=2029, academic_year="2025-26")
        section = Section.objects.create(name="A", batch=batch)

        self.teacher = User.objects.create_user(
            email="t1@example.com", password="x", first_name="Tara", last_name="Teach",
            role=User.Role.TEACHER)
        self.other_teacher = User.objects.create_user(
            email="t2@example.com", password="x", first_name="Other", last_name="Prof",
            role=User.Role.TEACHER)
        self.student = User.objects.create_user(
            email="s1@example.com", password="x", first_name="Sam", last_name="Student",
            role=User.Role.STUDENT, register_no="2547237")
        self.stranger = User.objects.create_user(
            email="s2@example.com", password="x", role=User.Role.STUDENT, register_no="2547999")

        def classroom(name, code, teacher):
            return Classroom.objects.create(
                name=name, subject_code=code, teacher=teacher, department=dept,
                program=program, batch=batch, section=section)

        self.course = classroom("Data Structures", "CS201", self.teacher)
        self.other_course = classroom("Networks", "CS301", self.other_teacher)
        Enrollment.objects.create(classroom=self.course, student=self.student)
        Enrollment.objects.create(classroom=self.other_course, student=self.stranger)

        tomorrow = timezone.localtime() + timedelta(days=1)
        self.tomorrow_date = tomorrow.strftime("%Y-%m-%d")
        Assignment.objects.create(course=self.course, title="Stacks", due_date=self.tomorrow_date)
        Assignment.objects.create(course=self.other_course, title="Routing", due_date="2030-01-01")
        Exam.objects.create(course=self.course, title="Midterm", status="published")
        Exam.objects.create(course=self.course, title="Secret draft", status="draft")
        Appointment.objects.create(
            student_name="Sam", student_email="s1@example.com", teacher_name="Tara Teach",
            time_slot=f"{self.tomorrow_date} 10:30", agenda="Project help", status="approved")
        Appointment.objects.create(
            student_name="Sam", student_email="s1@example.com", teacher_name="Tara Teach",
            time_slot="2030-02-02 09:00", agenda="Declined", status="rejected")
        Appointment.objects.create(
            student_name="Stranger", student_email="s2@example.com", teacher_name="Other Prof",
            time_slot="2030-03-03 09:00", agenda="Not yours", status="approved")

    def feed(self, user):
        self.client.force_authenticate(user=user)
        response = self.client.get("/calendar/events")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def titles(self, user):
        return {e["title"] for e in self.feed(user)}

    def test_requires_login(self):
        self.assertEqual(self.client.get("/calendar/events").status_code, 403)
        self.assertEqual(self.client.get("/calendar/notifications").status_code, 403)

    def test_student_sees_only_their_own_activity(self):
        titles = self.titles(self.student)
        self.assertIn("Due: Stacks", titles)
        self.assertIn("Exam: Midterm", titles)
        self.assertIn("Meeting: Project help", titles)
        self.assertNotIn("Due: Routing", titles)        # another class
        self.assertNotIn("Exam: Secret draft", titles)  # unpublished
        self.assertNotIn("Meeting: Declined", titles)   # rejected
        self.assertNotIn("Meeting: Not yours", titles)  # someone else's

    def test_teacher_sees_only_their_classes_and_meetings(self):
        titles = self.titles(self.teacher)
        self.assertIn("Due: Stacks", titles)
        self.assertIn("Exam: Secret draft", titles)     # teachers see their own drafts
        self.assertIn("Meeting: Project help", titles)
        self.assertNotIn("Due: Routing", titles)
        self.assertNotIn("Meeting: Not yours", titles)

    def test_events_use_the_shape_the_calendar_pages_expect(self):
        deadline = next(e for e in self.feed(self.student) if e["title"] == "Due: Stacks")
        self.assertEqual(deadline["type"], "deadline")  # the pages filter on "deadline", not "assignment"
        self.assertTrue(deadline["is_all_day"])
        self.assertTrue(deadline["start"].startswith(self.tomorrow_date))
        meeting = next(e for e in self.feed(self.student) if e["type"] == "appointment")
        self.assertIn("T10:30", meeting["start"])       # "YYYY-MM-DD HH:MM" slot is parsed

    def test_events_are_placed_on_the_users_local_date(self):
        # 20:00 UTC is 01:30 the next day in India; the page groups by the date in the string.
        self.client.force_authenticate(user=self.student)
        self.client.post("/calendar/events", {
            "title": "Late night", "start_time": "2030-05-01T20:00:00Z"}, format="json")
        event = next(e for e in self.feed(self.student) if e["title"] == "Late night")
        self.assertTrue(event["start"].startswith("2030-05-02T01:30"))

    def test_student_activity_appears_on_their_calendar_only(self):
        ExamAttempt.objects.create(exam=Exam.objects.get(title="Midterm"), student_id=self.student.pk, score=8)
        StudentActivity.objects.create(
            student_id=self.student.pk, source_id="quiz:1", activity_type="game",
            title="Fractions Quiz", score=1200, status="completed", occurred_at=timezone.now())
        self.assertIn("Attempted: Midterm", self.titles(self.student))
        self.assertIn("Played: Fractions Quiz", self.titles(self.student))
        self.assertNotIn("Played: Fractions Quiz", self.titles(self.stranger))

    def test_teacher_sees_quizzes_they_hosted_but_not_test_runs(self):
        quiz = Quiz.objects.create(teacher_id=self.teacher.pk, title="Live Quiz")
        QuizSession.objects.create(quiz=quiz, pin="111111")
        QuizSession.objects.create(quiz=quiz, pin="222222", is_test_run=True)
        titles = [e["title"] for e in self.feed(self.teacher)]
        self.assertEqual(titles.count("Quiz: Live Quiz"), 1)
        self.assertNotIn("Quiz: Live Quiz", self.titles(self.other_teacher))

    def test_custom_events_are_private_to_their_owner(self):
        self.client.force_authenticate(user=self.student)
        created = self.client.post("/calendar/events", {
            "title": "Study group", "start_time": "2030-05-01T10:00:00Z", "event_type": "custom",
            "course_id": self.other_course.pk,  # a student cannot publish into a class
        }, format="json")
        self.assertEqual(created.status_code, 201)
        self.assertIsNone(CalendarEvent.objects.get(title="Study group").course_id)
        self.assertIn("Study group", self.titles(self.student))
        self.assertNotIn("Study group", self.titles(self.stranger))
        self.assertNotIn("Study group", self.titles(self.teacher))

    def test_teacher_class_event_reaches_enrolled_students_only(self):
        self.client.force_authenticate(user=self.teacher)
        self.client.post("/calendar/events", {
            "title": "Guest lecture", "start_time": "2030-05-02T10:00:00Z",
            "course_id": self.course.pk, "event_type": "class",
        }, format="json")
        self.assertIn("Guest lecture", self.titles(self.student))
        self.assertNotIn("Guest lecture", self.titles(self.stranger))

    def test_only_the_owner_can_edit_or_delete(self):
        self.client.force_authenticate(user=self.student)
        event_id = self.client.post("/calendar/events", {
            "title": "Mine", "start_time": "2030-06-01T10:00:00Z"}, format="json").json()["id"]
        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(self.client.delete(f"/calendar/events/{event_id}").status_code, 404)
        self.client.force_authenticate(user=self.student)
        self.assertEqual(
            self.client.put(f"/calendar/events/{event_id}", {"title": "Renamed"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/calendar/events/{event_id}").status_code, 204)

    def test_tomorrow_notifications(self):
        self.client.force_authenticate(user=self.student)
        notes = self.client.get("/calendar/notifications").json()["notifications"]
        self.assertEqual({n["title"] for n in notes}, {"Due: Stacks", "Meeting: Project help"})
        self.assertTrue(all("tomorrow" in n["message"] for n in notes))
