from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.announcements.models import Announcement
from apps.assignments.models import Assignment, Submission
from apps.calendar_app.models import CalendarEvent
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import StudentActivity
from apps.exams.models import Exam, ExamAttempt

User = get_user_model()


def local_iso(delta):
    return (timezone.localtime() + delta).strftime("%Y-%m-%dT%H:%M")


class WidgetBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department
        make = lambda email, role, first, **kw: User.objects.create_user(email=email, role=role, first_name=first, last_name="X", **kw)
        self.ann = make("ann@x.com", "TEACHER", "Ann", department=department)
        self.joanna = make("jo@x.com", "TEACHER", "Joanna", department=department)
        self.alice = make("alice@x.com", "STUDENT", "Alice", register_no="R1")
        self.bob = make("bob@x.com", "STUDENT", "Bob", register_no="R2")
        mk = lambda name, code, teacher: Classroom.objects.create(name=name, subject_code=code, teacher=teacher, department=department, program=program, batch=batch)
        self.maths, self.art, self.theirs = mk("Maths", "M1", self.ann), mk("Art", "A1", self.ann), mk("Private", "P1", self.joanna)
        for course in (self.maths, self.art):
            Enrollment.objects.create(classroom=course, student=self.alice)
        Enrollment.objects.create(classroom=self.maths, student=self.bob)
        Enrollment.objects.create(classroom=self.theirs, student=self.bob)

    def teacher_body(self, user=None):
        self.client.force_authenticate(user or self.ann)
        return self.client.get(reverse("dashboard-summary")).json()

    def student_body(self, user=None):
        self.client.force_authenticate(user or self.alice)
        return self.client.get(reverse("dashboard-student-summary")).json()


class TeacherWidgetTests(WidgetBase):
    def test_the_marking_queue_counts_ungraded_work_in_my_classes_only(self):
        big = Assignment.objects.create(course=self.maths, title="Big essay")
        small = Assignment.objects.create(course=self.art, title="Sketch")
        for student in (self.alice, self.bob):
            Submission.objects.create(assignment=big, student=student)
        Submission.objects.create(assignment=small, student=self.alice)
        Submission.objects.create(assignment=small, student=self.bob, grade=5)  # already marked
        secret = Assignment.objects.create(course=self.theirs, title="Secret")
        Submission.objects.create(assignment=secret, student=self.bob)
        queue = self.teacher_body()["markingQueue"]
        self.assertEqual(queue["total"], 3)
        self.assertEqual([(i["title"], i["waiting"], i["courseCode"]) for i in queue["items"]], [("Big essay", 2, "M1"), ("Sketch", 1, "A1")])
        self.assertEqual(self.teacher_body(self.joanna)["markingQueue"]["total"], 1)

    def test_due_soon_lists_the_next_week_with_hand_in_progress(self):
        soon = Assignment.objects.create(course=self.maths, title="Soon", due_date=local_iso(timedelta(days=2)))
        Assignment.objects.create(course=self.maths, title="Far away", due_date=local_iso(timedelta(days=20)))
        Assignment.objects.create(course=self.maths, title="Gone", due_date=local_iso(timedelta(days=-2)))
        Assignment.objects.create(course=self.theirs, title="Not mine", due_date=local_iso(timedelta(days=1)))
        Submission.objects.create(assignment=soon, student=self.alice)
        items = self.teacher_body()["dueSoon"]
        self.assertEqual([(i["title"], i["handedIn"], i["enrolled"]) for i in items], [("Soon", 1, 2)])

    def test_exam_results_show_finished_average_and_flagged(self):
        exam = Exam.objects.create(course=self.maths, title="Midterm", status="published")
        ExamAttempt.objects.create(exam=exam, student_id=self.alice.pk, status="submitted", score=80.0)
        ExamAttempt.objects.create(exam=exam, student_id=self.bob.pk, status="flagged", score=0.0)
        other = Exam.objects.create(course=self.theirs, title="Theirs", status="published")
        ExamAttempt.objects.create(exam=other, student_id=self.bob.pk, status="submitted", score=10.0)
        results = self.teacher_body()["examResults"]
        self.assertEqual([(r["title"], r["finished"], r["flagged"], r["average"]) for r in results], [("Midterm", 1, 1, 80.0)])

    def test_a_new_teacher_gets_empty_widgets(self):
        body = self.teacher_body(User.objects.create_user(email="n@x.com", role="TEACHER"))
        self.assertEqual((body["markingQueue"], body["dueSoon"], body["examResults"]), ({"total": 0, "items": []}, [], []))


class StudentWidgetTests(WidgetBase):
    def test_recent_results_come_from_the_students_own_record_newest_first(self):
        now = timezone.now()
        StudentActivity.objects.create(student_id=self.alice.pk, source_id="1", activity_type="exam", title="Midterm", score=80.0, status="submitted", occurred_at=now - timedelta(days=2))
        StudentActivity.objects.create(student_id=self.alice.pk, source_id="2", activity_type="game", title="Word chain", score=30.0, status="completed", occurred_at=now - timedelta(hours=1))
        StudentActivity.objects.create(student_id=self.bob.pk, source_id="3", activity_type="exam", title="Bob only", score=1.0, status="submitted", occurred_at=now)
        results = self.student_body()["recentResults"]
        self.assertEqual([r["title"] for r in results], ["Word chain", "Midterm"])

    def test_exams_available_are_published_have_attempts_left_and_are_not_flagged(self):
        open_exam = Exam.objects.create(course=self.maths, title="Open", status="published", attempts_allowed=2)
        used_up = Exam.objects.create(course=self.maths, title="Used up", status="published", attempts_allowed=1)
        flagged = Exam.objects.create(course=self.art, title="Flagged", status="published", attempts_allowed=3)
        running = Exam.objects.create(course=self.art, title="Running", status="published", attempts_allowed=1)
        Exam.objects.create(course=self.maths, title="Draft", status="draft")
        Exam.objects.create(course=self.theirs, title="Not my class", status="published")
        ExamAttempt.objects.create(exam=open_exam, student_id=self.alice.pk, status="submitted", score=50.0)
        ExamAttempt.objects.create(exam=used_up, student_id=self.alice.pk, status="submitted", score=50.0)
        ExamAttempt.objects.create(exam=flagged, student_id=self.alice.pk, status="flagged", score=0.0)
        ExamAttempt.objects.create(exam=running, student_id=self.alice.pk, status="in_progress")
        exams = {e["title"]: e for e in self.student_body()["exams"]}
        self.assertEqual(set(exams), {"Open", "Running"})
        self.assertEqual((exams["Open"]["attemptsLeft"], exams["Open"]["inProgress"]), (1, False))
        self.assertTrue(exams["Running"]["inProgress"])

    def test_announcements_cover_my_courses_with_pinned_first(self):
        Announcement.objects.create(course=self.maths, title="Old", body="x")
        Announcement.objects.create(course=self.art, title="Pinned", body="y", pinned=True)
        Announcement.objects.create(course=self.maths, title="Newest", body="z")
        Announcement.objects.create(course=self.theirs, title="Secret", body="no")
        titles = [a["title"] for a in self.student_body()["announcements"]]
        self.assertEqual(titles, ["Pinned", "Newest", "Old"])

    def test_coming_up_shows_today_and_tomorrow_only_and_never_exams_or_lessons(self):
        now = timezone.now()
        CalendarEvent.objects.create(title="Study group", start_time=now + timedelta(minutes=5), created_by=self.alice)
        CalendarEvent.objects.create(title="Next week", start_time=now + timedelta(days=5), created_by=self.alice)
        CalendarEvent.objects.create(title="Not mine", start_time=now + timedelta(minutes=5), created_by=self.bob)
        Assignment.objects.create(course=self.maths, title="Due tomorrow", due_date=local_iso(timedelta(days=1)))
        Exam.objects.create(course=self.maths, title="Exam made today", status="published")
        coming = {c["title"]: c for c in self.student_body()["comingUp"]}
        self.assertIn("Due: Due tomorrow", coming)
        self.assertNotIn("Next week", coming)
        self.assertNotIn("Not mine", coming)
        self.assertFalse(any("Exam" in title for title in coming))
        if timezone.localtime(now + timedelta(minutes=5)).date() == timezone.localdate():
            self.assertEqual(coming["Study group"]["day"], "today")

    def test_a_student_with_no_courses_gets_empty_widgets(self):
        body = self.student_body(User.objects.create_user(email="new@x.com", role="STUDENT"))
        self.assertEqual((body["recentResults"], body["exams"], body["announcements"], body["comingUp"]), ([], [], [], []))
