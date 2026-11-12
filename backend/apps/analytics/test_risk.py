from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.testing import default_section
from apps.appointments.models import Appointment
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import Notification
from apps.exams.models import Exam, ExamAttempt

from . import risk as engine
from .models import RiskWatch


def person(email, role, first):
    return User.objects.create_user(email=email, password="x", role=role, first_name=first, last_name="X")


class RiskBase(TestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        self.teacher = person("t@x.com", "TEACHER", "Tina")
        self.other = person("o@x.com", "TEACHER", "Omar")
        self.good = person("good@x.com", "STUDENT", "Good")
        self.weak = person("weak@x.com", "STUDENT", "Weak")
        self.fresh = person("fresh@x.com", "STUDENT", "Fresh")
        self.outsider = person("out@x.com", "STUDENT", "Out")
        make = lambda teacher, code: Classroom.objects.create(
            name=code, subject_code=code, teacher=teacher, department=batch.program.department,
            program=batch.program, batch=batch, section=section,
        )
        self.course = make(self.teacher, "C1")
        self.course2 = make(self.teacher, "C2")
        self.foreign = make(self.other, "F1")
        for s in (self.good, self.weak, self.fresh):
            Enrollment.objects.create(classroom=self.course, student=s)
        Enrollment.objects.create(classroom=self.course2, student=self.good)
        Enrollment.objects.create(classroom=self.foreign, student=self.outsider)
        self.now = timezone.now()

    def assignment(self, title, days_ago, course=None, max_points=100):
        return Assignment.objects.create(course=course or self.course, title=title, max_points=max_points,
                                         due_date=(self.now - timedelta(days=days_ago)).isoformat())

    def hand_in(self, a, student, grade=None, days_ago=None):
        sub = Submission.objects.create(assignment=a, student=student, student_name=student.first_name, grade=grade)
        if days_ago is not None:
            Submission.objects.filter(pk=sub.pk).update(created_at=self.now - timedelta(days=days_ago))
        return sub

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c


class Engine(RiskBase):
    def test_signals_add_up_and_explain_themselves(self):
        a1 = self.assignment("Week 1", 30)
        a2 = self.assignment("Week 2", 20)
        a3 = self.assignment("Week 3", 10)
        a4 = self.assignment("Week 4", 2)
        # good: high marks on time
        for a, d in ((a1, 31), (a2, 21), (a3, 11), (a4, 3)):
            self.hand_in(a, self.good, 90, days_ago=d)
        # weak: falling marks, one late, one missing
        self.hand_in(a1, self.weak, 80, days_ago=31)
        self.hand_in(a2, self.weak, 50, days_ago=21)
        self.hand_in(a3, self.weak, 20, days_ago=5)  # late
        exam = Exam.objects.create(course=self.course, title="Mid", status="published")
        ExamAttempt.objects.create(exam=exam, student_id=self.weak.pk, status="flagged", flag_reason="tab")

        risks = engine.analyse([self.course])
        good, weak, fresh = risks[self.good.pk], risks[self.weak.pk], risks[self.fresh.pk]
        self.assertEqual(good.level, "low")
        self.assertEqual(good.reasons(), [])
        self.assertEqual(weak.average, 50.0)
        self.assertEqual((len(weak.missing), weak.past_due, len(weak.late), len(weak.flags)), (1, 4, 1, 1))
        self.assertLess(weak.slope, 0)
        self.assertEqual(weak.level, "high")
        signals = [r["signal"] for r in weak.reasons()]
        self.assertEqual(set(signals), {"marks", "missing", "late", "trend", "integrity"})
        self.assertIn("Week 4", " ".join(r["text"] for r in weak.reasons()))
        self.assertTrue(weak.next_step())
        # fresh: everything overdue is missing, so it is not "no data"
        self.assertEqual(fresh.level, "moderate")
        self.assertEqual(len(fresh.missing), 4)

    def test_no_results_and_nothing_due_is_not_low_risk(self):
        self.assignment("Later", -5)  # due in the future
        risk = engine.analyse([self.course])[self.fresh.pk]
        self.assertIsNone(risk.score)
        self.assertEqual(risk.level, "no_data")
        self.assertIn("Not enough", risk.next_step())

    def test_due_dates_in_either_format_and_unparseable_ones(self):
        Assignment.objects.create(course=self.course, title="Date only", due_date=(self.now - timedelta(days=3)).date().isoformat())
        Assignment.objects.create(course=self.course, title="Garbage", due_date="next Friday")
        risk = engine.analyse([self.course])[self.fresh.pk]
        self.assertEqual((risk.past_due, risk.missing), (1, ["Date only"]))

    def test_summary_counts_and_distribution(self):
        a = self.assignment("A", 5)
        self.hand_in(a, self.good, 95)
        self.hand_in(a, self.weak, 10)
        s = engine.summary(engine.analyse([self.course]))
        self.assertEqual(s["students"], 3)
        self.assertEqual(s["levels"]["low"], 1)
        self.assertEqual(sum(b["students"] for b in s["distribution"]), 3)
        self.assertEqual(s["class_average"], 52.5)
        self.assertTrue(s["weekly_average"])


class Dashboard(RiskBase):
    def test_teacher_sees_only_their_students_and_can_filter_by_class(self):
        self.assignment("A", 5)
        data = self.api(self.teacher).get("/api/v1/analytics/risk").json()
        names = {s["email"] for s in data["students"]}
        self.assertEqual(names, {"good@x.com", "weak@x.com", "fresh@x.com"})
        self.assertEqual(len(data["courses"]), 2)
        one = self.api(self.teacher).get(f"/api/v1/analytics/risk?course_id={self.course2.pk}").json()
        self.assertEqual([s["email"] for s in one["students"]], ["good@x.com"])
        self.assertEqual(self.api(self.teacher).get(f"/api/v1/analytics/risk?course_id={self.foreign.pk}").status_code, 404)
        self.assertEqual(self.api(self.good).get("/api/v1/analytics/risk").status_code, 403)

    def test_highest_risk_first_and_no_data_last(self):
        a = self.assignment("A", 5)
        self.hand_in(a, self.good, 95)
        self.hand_in(a, self.weak, 5)
        Assignment.objects.filter(pk=a.pk).update(due_date=(self.now + timedelta(days=5)).isoformat())
        order = [s["email"] for s in self.api(self.teacher).get("/api/v1/analytics/risk").json()["students"]]
        self.assertEqual(order, ["weak@x.com", "good@x.com", "fresh@x.com"])

    def test_csv_export(self):
        a = self.assignment("=HYPERLINK()", 5)
        self.hand_in(a, self.weak, 10)
        res = self.api(self.teacher).get("/api/v1/analytics/risk?export=csv")
        self.assertEqual(res.status_code, 200)
        body = res.content.decode()
        self.assertTrue(body.startswith("Student,Register no."))
        self.assertIn("Weak X", body)
        self.assertNotIn(",=HYPERLINK", body)


class Watchlist(RiskBase):
    def test_add_note_resolve_and_privacy(self):
        a = self.assignment("A", 5)
        self.hand_in(a, self.weak, 10)
        api = self.api(self.teacher)
        res = api.post("/api/v1/analytics/watchlist", {"student_id": self.weak.pk, "note": "Check in on Monday"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertIsNotNone(res.json()["score_at_start"])
        self.assertEqual(api.post("/api/v1/analytics/watchlist", {"student_id": self.weak.pk}, format="json").status_code, 409)
        self.assertEqual(api.post("/api/v1/analytics/watchlist", {"student_id": self.outsider.pk}, format="json").status_code, 400)
        board = api.get("/api/v1/analytics/risk").json()["students"]
        self.assertEqual(next(s for s in board if s["email"] == "weak@x.com")["watch"]["note"], "Check in on Monday")
        wid = res.json()["id"]
        # another teacher cannot read or change it
        self.assertEqual(self.api(self.other).get("/api/v1/analytics/watchlist").json(), [])
        self.assertEqual(self.api(self.other).patch(f"/api/v1/analytics/watchlist/{wid}", {"status": "resolved"}, format="json").status_code, 404)
        done = api.patch(f"/api/v1/analytics/watchlist/{wid}", {"status": "resolved", "note": "Improved"}, format="json").json()
        self.assertEqual((done["status"], done["note"]), ("resolved", "Improved"))
        self.assertIsNotNone(done["resolved_at"])
        self.assertEqual(api.patch(f"/api/v1/analytics/watchlist/{wid}", {"status": "maybe"}, format="json").status_code, 400)
        # once resolved, the student can be watched again
        self.assertEqual(api.post("/api/v1/analytics/watchlist", {"student_id": self.weak.pk}, format="json").status_code, 201)
        self.assertEqual(RiskWatch.objects.count(), 2)


class MeetingInvite(RiskBase):
    def test_teacher_books_a_meeting_and_the_student_is_told(self):
        res = self.api(self.teacher).post("/api/v1/appointments/invite", {"student_id": self.weak.pk, "time_slot": "2026-11-20 10:00", "agenda": "Progress"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        appt = Appointment.objects.get()
        self.assertEqual((appt.status, appt.student_email, appt.teacher_name), ("approved", "weak@x.com", self.teacher.full_name))
        self.assertTrue(Notification.objects.filter(user=self.weak, title__contains="booked a meeting").exists())
        # the student now sees it in their own list
        self.assertEqual(len(self.api(self.weak).get("/api/v1/appointments/").json()), 1)

    def test_only_for_own_students_and_with_a_time(self):
        api = self.api(self.teacher)
        self.assertEqual(api.post("/api/v1/appointments/invite", {"student_id": self.outsider.pk, "time_slot": "x"}, format="json").status_code, 400)
        self.assertEqual(api.post("/api/v1/appointments/invite", {"student_id": self.weak.pk}, format="json").status_code, 400)
        self.assertEqual(self.api(self.weak).post("/api/v1/appointments/invite", {"student_id": self.weak.pk, "time_slot": "x"}, format="json").status_code, 403)
        self.assertEqual(Appointment.objects.count(), 0)
