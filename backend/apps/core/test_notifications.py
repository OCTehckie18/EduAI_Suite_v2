from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.announcements.models import Announcement
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment
from apps.exams.models import Exam
from apps.institution.models import Batch, Campus, Department, Program, School, Section
from apps.trello_app.models import Board

from .models import Notification
from .services import notify


def person(email, role):
    return User.objects.create_user(email=email, password="x", role=role, first_name=email.split("@")[0])


class NotificationBase(TestCase):
    def setUp(self):
        campus = Campus.objects.create(name="C", code="C", city="B")
        school = School.objects.create(name="S", code="S", campus=campus)
        dept = Department.objects.create(name="D", code="D", school=school)
        program = Program.objects.create(name="P", code="P", department=dept, degree_level=Program.DegreeLevel.PG, duration_years=2)
        batch = Batch.objects.create(name="B", program=program, start_year=2025, end_year=2027, academic_year="2025-2026")
        section = Section.objects.create(name="A", batch=batch)
        self.teacher = person("t@x.com", "TEACHER")
        self.ann = person("ann@x.com", "STUDENT")
        self.bob = person("bob@x.com", "STUDENT")
        self.outsider = person("out@x.com", "STUDENT")
        self.course = Classroom.objects.create(
            name="Maths", subject_code="M1", teacher=self.teacher, department=dept, program=program, batch=batch, section=section
        )
        for s in (self.ann, self.bob):
            Enrollment.objects.create(classroom=self.course, student=s)

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def titles(self, user):
        return [n["title"] for n in self.api(user).get("/notifications").json()["results"]]


class Reading(NotificationBase):
    def test_you_only_see_and_clear_your_own(self):
        notify([self.ann], "grade", "Hello", "body", "/x")
        notify([self.bob], "grade", "Private", "", "")
        data = self.api(self.ann).get("/notifications").json()
        self.assertEqual((data["unread"], [n["title"] for n in data["results"]]), (1, ["Hello"]))
        other = Notification.objects.get(title="Private")
        # marking someone else's notification does nothing
        self.assertEqual(self.api(self.ann).post("/notifications/read", {"ids": [other.pk]}, format="json").json()["marked"], 0)
        other.refresh_from_db()
        self.assertIsNone(other.read_at)
        self.assertEqual(self.api(self.ann).post("/notifications/read", {}, format="json").json()["marked"], 1)
        self.assertEqual(self.api(self.ann).get("/notifications").json()["unread"], 0)
        self.assertEqual(self.api(self.ann).post("/notifications/read", {"ids": "all"}, format="json").status_code, 400)

    def test_login_is_required(self):
        self.assertIn(APIClient().get("/notifications").status_code, (401, 403))


class Triggers(NotificationBase):
    def test_an_announcement_reaches_enrolled_students_only(self):
        self.api(self.teacher).post(f"/announcements/{self.course.pk}", {"title": "Quiz Friday", "body": "x"}, format="json")
        self.assertEqual(self.titles(self.ann), ["New announcement in Maths"])
        self.assertEqual(self.titles(self.bob), ["New announcement in Maths"])
        self.assertEqual(self.titles(self.outsider), [])
        self.assertEqual(self.titles(self.teacher), [])

    def test_publishing_an_exam_tells_students_once(self):
        body = {"course_id": self.course.pk, "title": "Midterm", "time_limit": 30, "status": "draft",
                "questions": [{"question_text": "Q", "points": 1, "choices": [{"choice_text": "A", "is_correct": True}, {"choice_text": "B", "is_correct": False}]}]}
        exam_id = self.api(self.teacher).post("/exams/", body, format="json").json()["id"]
        self.assertEqual(self.titles(self.ann), [])
        self.api(self.teacher).patch(f"/exams/{exam_id}", {"status": "published"}, format="json")
        self.api(self.teacher).patch(f"/exams/{exam_id}", {"status": "published"}, format="json")
        self.assertEqual(self.titles(self.ann), ["New exam in Maths"])

    def test_grading_tells_that_student_only(self):
        asg = Assignment.objects.create(course=self.course, title="Essay", max_points=100)
        sub = Submission.objects.create(assignment=asg, student=self.ann, student_name="ann")
        Submission.objects.create(assignment=asg, student=self.bob, student_name="bob")
        self.api(self.teacher).put(f"/submissions/grade/{sub.pk}", {"grade": 80}, format="json")
        self.assertEqual(self.titles(self.ann), ["Essay was graded"])
        self.assertEqual(self.titles(self.bob), [])

    def test_form_publish_and_board_requests(self):
        form = self.api(self.teacher).post("/forms", {"classroom_id": self.course.pk, "title": "Survey", "questions": [{"kind": "short_text", "prompt": "Q"}]}, format="json").json()
        self.api(self.teacher).post(f"/forms/{form['id']}/status", {"status": "PUBLISHED"}, format="json")
        self.assertEqual(self.titles(self.ann), ["New form in Maths"])

        board = self.api(self.teacher).post("/trello/board", {"name": "Plan"}, format="json").json()
        self.api(self.outsider).post("/trello/board/join", {"code": board["join_code"]}, format="json")
        self.assertIn("out asked to join Plan", self.titles(self.teacher))
        self.api(self.teacher).post(f"/trello/board/{board['id']}/approve", {"email": "out@x.com"}, format="json")
        self.assertEqual(self.titles(self.outsider), ["You can now open Plan"])
        self.api(self.teacher).post(f"/trello/board/{board['id']}/add-member", {"email": "ann@x.com"}, format="json")
        self.assertIn("t added you to Plan", self.titles(self.ann))

    def test_a_failure_to_notify_never_breaks_the_action(self):
        # unknown recipient ids are ignored rather than raising
        notify([None, 999999], "grade", "x")
        self.assertEqual(Notification.objects.count(), 0)
