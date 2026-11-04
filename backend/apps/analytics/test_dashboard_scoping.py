from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.appointments.models import Appointment
from apps.assignments.models import Assignment, Submission
from apps.calendar_app.models import CalendarEvent
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import ActionHistory
from apps.exams.models import Exam
from apps.mail.models import MailHistory

User = get_user_model()


class ScopingBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department

        def make(email, role, first, last, **kw):
            return User.objects.create_user(email=email, role=role, first_name=first, last_name=last, **kw)

        self.ann = make("ann@x.com", "TEACHER", "Ann", "Lee", department=department)
        self.joanna = make("joanna@x.com", "TEACHER", "Joanna", "Smith", department=department)
        self.newbie = make("new@x.com", "TEACHER", "Newbie", "Teacher", department=department)
        self.admin = make("m@x.com", "MASTER_ADMIN", "Master", "Admin")
        self.alice = make("alice@x.com", "STUDENT", "Alice", "A", register_no="R1")
        self.bob = make("bob@x.com", "STUDENT", "Bob", "B", register_no="R2")
        self.zed = make("zed@x.com", "STUDENT", "Zed", "Z", register_no="R9")
        self.course = Classroom.objects.create(name="Maths", subject_code="M1", teacher=self.ann, department=department, program=program, batch=batch)
        self.empty = Classroom.objects.create(name="Empty", subject_code="E1", teacher=self.ann, department=department, program=program, batch=batch)
        self.theirs = Classroom.objects.create(name="Private", subject_code="P1", teacher=self.joanna, department=department, program=program, batch=batch)
        Enrollment.objects.create(classroom=self.course, student=self.alice)
        Enrollment.objects.create(classroom=self.course, student=self.bob)
        Enrollment.objects.create(classroom=self.theirs, student=self.zed)

    def dashboard(self, user):
        self.client.force_authenticate(user)
        response = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()


class RecentActivityTests(ScopingBase):
    def test_other_peoples_actions_are_not_shown_but_my_classes_events_are(self):
        ActionHistory.objects.create(feature="campus", action="deactivate", user_id=str(self.admin.pk))
        ActionHistory.objects.create(feature="appointment", action="approved", user_id=str(self.joanna.pk))
        hw = Assignment.objects.create(course=self.course, title="HW1")
        Submission.objects.create(assignment=hw, student=self.alice, student_name="Alice A")
        their_hw = Assignment.objects.create(course=self.theirs, title="Secret HW")
        Submission.objects.create(assignment=their_hw, student=self.zed, student_name="Zed Z")
        texts = [a["text"] for a in self.dashboard(self.ann)["recentActivity"]]
        self.assertTrue(any("Alice A submitted HW1" in t for t in texts), texts)
        joined = " ".join(texts)
        for leaked in ("Zed", "Secret", "deactivate", "Campus", "approved"):
            self.assertNotIn(leaked, joined)

    def test_a_new_teacher_with_nothing_sees_no_activity(self):
        Submission.objects.create(assignment=Assignment.objects.create(course=self.course, title="HW"), student=self.alice, student_name="Alice A")
        self.assertEqual(self.dashboard(self.newbie)["recentActivity"], [])


class AppointmentTests(ScopingBase):
    def test_only_requests_addressed_to_exactly_me_are_listed(self):
        Appointment.objects.create(student_name="S1", teacher_name="Joanna Smith", agenda="Private talk", status="pending")
        Appointment.objects.create(student_name="S2", teacher_name="Ann Lee", agenda="Mine", status="pending")
        Appointment.objects.create(student_name="S3", teacher_name="Ann", agenda="Partial name", status="pending")
        agendas = [a["agenda"] for a in self.dashboard(self.ann)["pendingAppointments"]]
        self.assertEqual(agendas, ["Mine"])
        self.assertEqual(self.dashboard(self.joanna)["pendingAppointments"][0]["agenda"], "Private talk")

    def test_every_listed_request_can_actually_be_approved_by_me(self):
        appt = Appointment.objects.create(student_name="S2", teacher_name="Ann Lee", agenda="Mine", status="pending")
        listed = self.dashboard(self.ann)["pendingAppointments"][0]["id"]
        self.assertEqual(listed, appt.pk)
        self.client.force_authenticate(self.ann)
        response = self.client.put(f"/api/v1/appointments/{appt.pk}/status", {"status": "approved"}, format="json")
        self.assertNotEqual(response.status_code, 403)


class CalendarTests(ScopingBase):
    def test_schedule_and_week_count_only_include_my_own_events_in_local_time(self):
        now = timezone.now()
        CalendarEvent.objects.create(title="My meeting", start_time=now + timedelta(minutes=1), created_by=self.ann, teacher_name="Ann Lee")
        CalendarEvent.objects.create(title="Joanna meeting", start_time=now + timedelta(minutes=1), created_by=self.joanna, teacher_name="Joanna Smith")
        body = self.dashboard(self.ann)
        titles = [item["name"] for item in body["schedule"]]
        self.assertNotIn("Joanna meeting", titles)
        if timezone.localtime(now + timedelta(minutes=1)).date() == timezone.localdate():
            self.assertIn("My meeting", titles)
            item = next(i for i in body["schedule"] if i["name"] == "My meeting")
            self.assertEqual(item["time"], timezone.localtime(now + timedelta(minutes=1)).strftime("%I:%M %p"))
            self.assertEqual(item["room"], "")  # no invented room
        self.assertEqual(body["calendarEventsThisWeek"], 1)

    def test_exams_and_lessons_are_not_listed_as_scheduled_items(self):
        Exam.objects.create(course=self.course, title="Created today")
        self.assertEqual([i for i in self.dashboard(self.ann)["schedule"] if i["name"].startswith("Exam")], [])


class MailAndExamTests(ScopingBase):
    def test_mail_stats_count_only_my_mail(self):
        MailHistory.objects.create(owner=self.joanna, subject="Theirs", recipients=[], recipient_count=0)
        self.assertEqual(self.dashboard(self.ann)["mailStats"], {"sentThisWeek": 0, "lastSentAt": None})
        MailHistory.objects.create(owner=self.ann, subject="Mine", recipients=["a@x.com"], recipient_count=1)
        self.assertEqual(self.dashboard(self.ann)["mailStats"]["sentThisWeek"], 1)

    def test_a_teacher_with_no_classes_sees_no_exams_not_everyones(self):
        Exam.objects.create(course=self.theirs, title="Secret exam")
        self.assertEqual(self.dashboard(self.newbie)["upcomingExams"], [])
        self.assertEqual([e["title"] for e in self.dashboard(self.joanna)["upcomingExams"]], ["Secret exam"])
        self.assertEqual(self.dashboard(self.ann)["upcomingExams"], [])


class JoinCodeTests(ScopingBase):
    def test_no_endpoint_lists_every_classroom_with_its_join_code(self):
        self.client.force_authenticate(self.zed)
        for path in ("/api/v1/dashboard/discoverable-classrooms", "/api/v1/api/dashboard/discoverable-classrooms"):
            self.assertEqual(self.client.get(path).status_code, 404, path)
        body = self.client.get(reverse("dashboard-student-summary")).json()
        self.assertNotIn(self.course.enrollment_code, str(body))
        self.assertNotIn(self.empty.enrollment_code, str(body))


class EngagementTests(ScopingBase):
    def summary(self, user, course):
        self.client.force_authenticate(user)
        return self.client.get(f"/api/v1/engagement/{course.pk}/summary")

    def test_only_the_courses_teacher_can_open_its_engagement_summary(self):
        self.assertEqual(self.summary(self.ann, self.course).status_code, 200)
        self.assertEqual(self.summary(self.joanna, self.course).status_code, 403)
        self.assertEqual(self.summary(self.admin, self.course).status_code, 200)

    def test_an_empty_course_does_not_borrow_other_students(self):
        body = self.summary(self.ann, self.empty).json()
        self.assertEqual((body["total_students"], body["students"], body["class_avg_engagement"]), (0, [], None))

    def test_a_student_with_nothing_recorded_is_not_called_critical(self):
        body = self.summary(self.ann, self.course).json()
        first = body["students"][0]
        self.assertEqual((first["engagement_score"], first["engagement_level"]), (None, "no_data"))
        self.assertNotIn("CRITICAL", first["engagement_summary"])
        self.assertNotIn("None", first["engagement_summary"])
        self.assertEqual((body["at_risk_count"], body["class_avg_engagement"]), (0, None))

    def test_scores_use_only_this_courses_work(self):
        hw = Assignment.objects.create(course=self.course, title="HW")
        Assignment.objects.create(course=self.theirs, title="Other course work")
        Submission.objects.create(assignment=hw, student=self.alice, grade=50)
        body = self.summary(self.ann, self.course).json()
        alice = next(s for s in body["students"] if s["name"].startswith("Alice"))
        self.assertEqual((alice["assignments"]["total"], alice["assignments"]["completion_rate"]), (1, 100.0))

    def profile(self, user, student, query=""):
        self.client.force_authenticate(user)
        return self.client.get(f"/api/v1/engagement/student/{student.pk}{query}")

    def test_a_teacher_can_only_open_students_in_their_own_classes(self):
        self.assertEqual(self.profile(self.ann, self.alice).status_code, 200)
        self.assertEqual(self.profile(self.ann, self.zed).status_code, 403)
        self.assertEqual(self.profile(self.joanna, self.alice).status_code, 403)

    def test_the_profile_never_uses_a_course_the_teacher_does_not_manage(self):
        Assignment.objects.create(course=self.theirs, title="Their private work")
        body = self.profile(self.ann, self.alice, f"?course_id={self.theirs.pk}").json()
        self.assertEqual(body["assignments"]["total"], 0)
        self.assertNotIn("Their private work", str(body))

    def test_students_see_only_their_own_profile(self):
        self.assertEqual(self.profile(self.alice, self.alice).status_code, 200)
        self.assertEqual(self.profile(self.alice, self.bob).status_code, 403)
