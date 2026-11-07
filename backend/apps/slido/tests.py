from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import PollResponse, PresentationAssignment, PresentationSubmission, QnAUpvote, SlidoPoll, SlidoQnA, SlidoSession


def person(email, role):
    return User.objects.create_user(email=email, password="x", role=role, first_name=email.split("@")[0])


class SlidoBase(TestCase):
    def setUp(self):
        campus = Campus.objects.create(name="C", code="C", city="B")
        school = School.objects.create(name="S", code="S", campus=campus)
        dept = Department.objects.create(name="D", code="D", school=school)
        program = Program.objects.create(name="P", code="P", department=dept, degree_level=Program.DegreeLevel.PG, duration_years=2)
        batch = Batch.objects.create(name="B", program=program, start_year=2025, end_year=2027, academic_year="2025-2026")
        section = Section.objects.create(name="A", batch=batch)
        self.teacher = person("t@x.com", "TEACHER")
        self.other = person("o@x.com", "TEACHER")
        self.ann = person("ann@x.com", "STUDENT")
        self.bob = person("bob@x.com", "STUDENT")
        self.outsider = person("out@x.com", "STUDENT")
        self.course = Classroom.objects.create(
            name="W", subject_code="W1", teacher=self.teacher, department=dept, program=program, batch=batch, section=section
        )
        for s in (self.ann, self.bob):
            Enrollment.objects.create(classroom=self.course, student=s)

    def api(self, user=None):
        client = APIClient()
        if user:
            client.force_authenticate(user)
        return client


class Anonymous(SlidoBase):
    def test_nothing_works_without_signing_in(self):
        session = SlidoSession.objects.create(teacher_id=self.teacher.pk, pin="111111")
        poll = SlidoPoll.objects.create(session=session, teacher_id=self.teacher.pk, question="q")
        calls = [
            ("get", "/slido/sessions/111111"),
            ("post", "/slido/sessions"),
            ("post", f"/slido/sessions/111111/polls/{poll.pk}/vote"),
            ("post", "/slido/sessions/111111/qna"),
            ("get", "/slido/assignments"),
        ]
        for method, url in calls:
            self.assertIn(getattr(self.api(), method)(url).status_code, (401, 403), url)
        self.assertEqual(PollResponse.objects.count(), 0)


class Sessions(SlidoBase):
    def test_the_host_is_the_signed_in_teacher(self):
        res = self.api(self.teacher).post("/slido/sessions", {"teacher_id": self.other.pk}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(SlidoSession.objects.get().teacher_id, self.teacher.pk)
        self.assertEqual(self.api(self.ann).post("/slido/sessions", {}, format="json").status_code, 403)

    def test_only_the_host_adds_polls(self):
        pin = self.api(self.teacher).post("/slido/sessions", {}, format="json").json()["pin"]
        self.assertEqual(self.api(self.other).post(f"/slido/sessions/{pin}/polls", {"question": "x"}, format="json").status_code, 403)
        self.assertEqual(self.api(self.ann).post(f"/slido/sessions/{pin}/polls", {"question": "x"}, format="json").status_code, 403)
        self.assertEqual(self.api(self.teacher).post(f"/slido/sessions/{pin}/polls", {"question": " "}, format="json").status_code, 400)
        self.assertEqual(self.api(self.teacher).post(f"/slido/sessions/{pin}/polls", {"question": "Why?", "teacher_id": 99}, format="json").status_code, 201)
        self.assertEqual(SlidoPoll.objects.get().teacher_id, self.teacher.pk)

    def test_a_session_can_only_use_my_own_assignment(self):
        mine = self.api(self.teacher).post("/slido/assignments", {"title": "T", "course_id": self.course.pk}, format="json").json()
        theirs = PresentationAssignment.objects.create(teacher_id=self.other.pk, title="Theirs")
        self.assertEqual(self.api(self.teacher).post("/slido/sessions", {"assignment_id": mine["id"]}, format="json").status_code, 201)
        self.assertEqual(self.api(self.teacher).post("/slido/sessions", {"assignment_id": theirs.pk}, format="json").status_code, 400)


class Voting(SlidoBase):
    def setUp(self):
        super().setUp()
        self.session = SlidoSession.objects.create(teacher_id=self.teacher.pk, pin="222222")
        self.poll = SlidoPoll.objects.create(session=self.session, teacher_id=self.teacher.pk, question="Q")
        self.url = f"/slido/sessions/222222/polls/{self.poll.pk}/vote"

    def test_a_vote_belongs_to_the_signed_in_student_and_counts_once(self):
        res = self.api(self.ann).post(self.url, {"option_text": "A", "student_id": self.bob.pk}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(PollResponse.objects.get().student_id, self.ann.pk)
        self.assertEqual(self.api(self.ann).post(self.url, {"option_text": "B"}, format="json").status_code, 409)
        self.assertEqual(self.api(self.bob).post(self.url, {"option_text": "B"}, format="json").json()["total_responses"], 2)
        self.poll.refresh_from_db()
        self.assertEqual(self.poll.total_responses, PollResponse.objects.count())

    def test_teachers_empty_and_closed_votes_are_refused(self):
        self.assertEqual(self.api(self.teacher).post(self.url, {"option_text": "A"}, format="json").status_code, 403)
        self.assertEqual(self.api(self.ann).post(self.url, {}, format="json").status_code, 400)
        self.assertEqual(self.api(self.ann).post(self.url, {"response_value": "abc"}, format="json").status_code, 400)
        SlidoPoll.objects.filter(pk=self.poll.pk).update(is_active=False)
        self.assertEqual(self.api(self.ann).post(self.url, {"option_text": "A"}, format="json").status_code, 409)
        self.assertEqual(PollResponse.objects.count(), 0)

    def test_questions_and_upvotes(self):
        res = self.api(self.ann).post("/slido/sessions/222222/qna", {"question_text": "What?", "student_id": self.bob.pk}, format="json")
        self.assertEqual(res.status_code, 201)
        qna = SlidoQnA.objects.get()
        self.assertEqual(qna.student_id, self.ann.pk)
        up = f"/slido/sessions/222222/qna/{qna.pk}/upvote"
        for _ in range(2):
            self.assertEqual(self.api(self.bob).post(up).json()["upvotes"], 1)
        self.assertEqual(self.api(self.ann).post(up).json()["upvotes"], 2)
        self.assertEqual(QnAUpvote.objects.count(), 2)
        self.assertEqual(self.api(self.teacher).post(up).status_code, 403)
        self.assertEqual(self.api(self.ann).post("/slido/sessions/222222/qna", {"question_text": " "}, format="json").status_code, 400)


class Presentations(SlidoBase):
    def setUp(self):
        super().setUp()
        self.asgn = PresentationAssignment.objects.create(teacher_id=self.teacher.pk, course_id=self.course.pk, title="Pitch")

    def test_visibility_follows_the_classroom(self):
        titles = lambda user: [a["title"] for a in self.api(user).get("/slido/assignments").json()]
        self.assertEqual(titles(self.teacher), ["Pitch"])
        self.assertEqual(titles(self.ann), ["Pitch"])
        self.assertEqual(titles(self.other), [])
        self.assertEqual(titles(self.outsider), [])
        self.assertEqual(self.api(self.outsider).get(f"/slido/assignments/{self.asgn.pk}").status_code, 403)
        self.assertEqual(self.api(self.other).get(f"/slido/assignments/{self.asgn.pk}").status_code, 403)

    def test_creating_needs_a_teacher_and_their_own_classroom(self):
        post = lambda user, body: self.api(user).post("/slido/assignments", body, format="json").status_code
        self.assertEqual(post(self.ann, {"title": "x"}), 403)
        self.assertEqual(post(self.other, {"title": "x", "course_id": self.course.pk}), 400)
        self.assertEqual(post(self.teacher, {"title": "x", "course_id": self.course.pk}), 201)

    def test_students_submit_as_themselves_and_see_only_their_own(self):
        url = f"/slido/assignments/{self.asgn.pk}/submissions"
        self.assertEqual(self.api(self.ann).post(url, {"student_id": self.bob.pk}, format="multipart").status_code, 201)
        self.api(self.bob).post(url, {}, format="multipart")
        self.assertEqual(sorted(PresentationSubmission.objects.values_list("student_id", flat=True)), sorted([self.ann.pk, self.bob.pk]))
        self.assertEqual(len(self.api(self.ann).get(url).json()), 1)
        self.assertEqual(len(self.api(self.teacher).get(url).json()), 2)
        self.assertEqual(self.api(self.other).get(url).status_code, 403)
        self.assertEqual(self.api(self.outsider).post(url, {}, format="multipart").status_code, 403)
        self.assertEqual(self.api(self.teacher).post(url, {}, format="multipart").status_code, 403)
