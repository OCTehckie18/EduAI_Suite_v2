from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import Form, FormResponse

QUESTIONS = [
    {"kind": "short_text", "prompt": "Your name?", "required": True},
    {"kind": "choice", "prompt": "Pick a day", "options": ["Mon", "Tue"], "required": True},
    {"kind": "checkbox", "prompt": "Topics", "options": ["A", "B", "C"]},
    {"kind": "paragraph", "prompt": "Comments"},
]


def person(email, role):
    return User.objects.create_user(email=email, password="x", role=role, first_name=email.split("@")[0])


class FormsBase(TestCase):
    def setUp(self):
        campus = Campus.objects.create(name="C", code="C", city="B")
        school = School.objects.create(name="S", code="S", campus=campus)
        dept = Department.objects.create(name="D", code="D", school=school)
        program = Program.objects.create(name="P", code="P", department=dept, degree_level=Program.DegreeLevel.PG, duration_years=2)
        batch = Batch.objects.create(name="B", program=program, start_year=2025, end_year=2027, academic_year="2025-2026")
        section = Section.objects.create(name="A", batch=batch)
        self.teacher = person("teacher@x.com", User.Role.TEACHER)
        self.other_teacher = person("other@x.com", User.Role.TEACHER)
        self.pupil = person("pupil@x.com", User.Role.STUDENT)
        self.mate = person("mate@x.com", User.Role.STUDENT)
        self.outsider = person("out@x.com", User.Role.STUDENT)
        make = lambda teacher, code: Classroom.objects.create(
            name=code, subject_code=code, teacher=teacher, department=dept, program=program, batch=batch, section=section
        )
        self.course = make(self.teacher, "W1")
        self.other_course = make(self.other_teacher, "W2")
        for s in (self.pupil, self.mate):
            Enrollment.objects.create(classroom=self.course, student=s)

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def create(self, questions=QUESTIONS, user=None, **extra):
        body = {"classroom_id": self.course.pk, "title": "Survey", "questions": questions, **extra}
        return self.api(user or self.teacher).post("/api/v1/forms", body, format="json")

    def publish(self, form_id):
        return self.api(self.teacher).post(f"/api/v1/forms/{form_id}/status", {"status": "PUBLISHED"}, format="json")

    def answers(self, form, name="Ann", day="Mon", topics=("A",), comment="ok"):
        ids = {q["prompt"]: q["id"] for q in form["questions"]}
        return [
            {"question_id": ids["Your name?"], "text": name},
            {"question_id": ids["Pick a day"], "selected": [day] if day else []},
            {"question_id": ids["Topics"], "selected": list(topics)},
            {"question_id": ids["Comments"], "text": comment},
        ]

    def submit(self, form, user=None, **kw):
        return self.api(user or self.pupil).post(f"/api/v1/forms/{form['id']}/submit", {"answers": self.answers(form, **kw)}, format="json")


class Building(FormsBase):
    def test_a_teacher_builds_a_draft_for_their_own_classroom(self):
        res = self.create()
        self.assertEqual(res.status_code, 201, res.content)
        form = res.json()
        self.assertEqual((form["status"], len(form["questions"])), ("DRAFT", 4))
        self.assertEqual(Form.objects.get().owner, self.teacher)
        # someone else's classroom, a student, and bad input are all refused
        self.assertEqual(self.create(user=self.other_teacher).status_code, 400)
        self.assertEqual(self.create(user=self.pupil).status_code, 403)
        self.assertEqual(Form.objects.count(), 1)

    def test_questions_are_checked(self):
        bad = [
            [{"kind": "short_text", "prompt": " "}],
            [{"kind": "essay", "prompt": "x"}],
            [{"kind": "choice", "prompt": "x", "options": ["only"]}],
            [{"kind": "choice", "prompt": "x", "options": ["a", "A"]}],
            [{"kind": "choice", "prompt": "x", "options": ["a", ""]}],
            [{"kind": "checkbox", "prompt": "x"}],
            "nope",
        ]
        for questions in bad:
            self.assertEqual(self.create(questions).status_code, 400, questions)
        self.assertEqual(self.create(title="  ").status_code, 400)
        self.assertEqual(Form.objects.count(), 0)

    def test_only_the_owner_edits_publishes_and_deletes(self):
        form = self.create().json()
        theirs = self.api(self.other_teacher)
        self.assertEqual(theirs.put(f"/api/v1/forms/{form['id']}", {"title": "x"}, format="json").status_code, 403)
        self.assertEqual(theirs.post(f"/api/v1/forms/{form['id']}/status", {"status": "PUBLISHED"}, format="json").status_code, 403)
        self.assertEqual(theirs.delete(f"/api/v1/forms/{form['id']}").status_code, 403)
        self.assertEqual(theirs.get(f"/api/v1/forms/{form['id']}").status_code, 404)
        self.assertEqual(self.api(self.pupil).put(f"/api/v1/forms/{form['id']}", {"title": "x"}, format="json").status_code, 403)
        self.assertEqual(Form.objects.get().title, "Survey")
        ok = self.api(self.teacher).put(f"/api/v1/forms/{form['id']}", {"title": "Renamed"}, format="json")
        self.assertEqual(ok.json()["title"], "Renamed")
        self.assertEqual(self.api(self.teacher).delete(f"/api/v1/forms/{form['id']}").status_code, 204)

    def test_publishing_needs_a_question(self):
        empty = self.create([]).json()
        self.assertEqual(self.publish(empty["id"]).status_code, 400)
        self.assertEqual(self.api(self.teacher).post(f"/api/v1/forms/{empty['id']}/status", {"status": "LIVE"}, format="json").status_code, 400)

    def test_questions_lock_once_answered(self):
        form = self.create().json()
        self.publish(form["id"])
        self.submit(form)
        api = self.api(self.teacher)
        self.assertEqual(api.put(f"/api/v1/forms/{form['id']}", {"questions": QUESTIONS[:1]}, format="json").status_code, 409)
        self.assertEqual(api.put(f"/api/v1/forms/{form['id']}", {"title": "Still fine"}, format="json").status_code, 200)
        self.assertEqual(api.post(f"/api/v1/forms/{form['id']}/status", {"status": "DRAFT"}, format="json").status_code, 409)
        self.assertEqual(api.post(f"/api/v1/forms/{form['id']}/status", {"status": "CLOSED"}, format="json").status_code, 200)


class Answering(FormsBase):
    def setUp(self):
        super().setUp()
        self.form = self.create().json()

    def test_students_see_only_published_forms_of_their_classrooms(self):
        self.assertEqual(self.api(self.pupil).get("/api/v1/forms").json(), [])
        self.assertEqual(self.api(self.pupil).get(f"/api/v1/forms/{self.form['id']}").status_code, 404)
        self.publish(self.form["id"])
        listed = self.api(self.pupil).get("/api/v1/forms").json()
        self.assertEqual([(f["id"], f["submitted"]) for f in listed], [(self.form["id"], False)])
        self.assertEqual(self.api(self.outsider).get("/api/v1/forms").json(), [])
        self.assertEqual(self.api(self.outsider).get(f"/api/v1/forms/{self.form['id']}").status_code, 404)
        self.assertEqual(len(self.api(self.pupil).get(f"/api/v1/forms/{self.form['id']}").json()["questions"]), 4)

    def test_a_student_answers_once(self):
        self.publish(self.form["id"])
        self.assertEqual(self.submit(self.form).status_code, 201)
        self.assertEqual(self.submit(self.form).status_code, 409)
        self.assertEqual(FormResponse.objects.filter(student=self.pupil).count(), 1)
        self.assertTrue(self.api(self.pupil).get("/api/v1/forms").json()[0]["submitted"])

    def test_drafts_closed_forms_and_non_students_cannot_be_answered(self):
        self.assertEqual(self.submit(self.form).status_code, 409)  # draft
        self.publish(self.form["id"])
        self.assertEqual(self.submit(self.form, user=self.outsider).status_code, 403)
        self.assertEqual(self.submit(self.form, user=self.teacher).status_code, 403)
        self.api(self.teacher).post(f"/api/v1/forms/{self.form['id']}/status", {"status": "CLOSED"}, format="json")
        self.assertEqual(self.submit(self.form).status_code, 409)
        self.assertEqual(FormResponse.objects.count(), 0)

    def test_answers_are_validated_and_nothing_is_saved_on_error(self):
        self.publish(self.form["id"])
        cases = [
            self.answers(self.form, name=""),  # required text missing
            self.answers(self.form, day=None),  # required choice missing
            self.answers(self.form, day="Sun"),  # not a choice
            self.answers(self.form, topics=("A", "Z")),
            self.answers(self.form, topics=("A", "A")),
            self.answers(self.form, name="x" * 301),
            [{"question_id": 99999, "text": "x"}],
        ]
        for bad in cases:
            res = self.api(self.pupil).post(f"/api/v1/forms/{self.form['id']}/submit", {"answers": bad}, format="json")
            self.assertEqual(res.status_code, 400, bad)
        two = self.answers(self.form)
        two[1]["selected"] = ["Mon", "Tue"]  # single choice takes one
        self.assertEqual(self.api(self.pupil).post(f"/api/v1/forms/{self.form['id']}/submit", {"answers": two}, format="json").status_code, 400)
        self.assertEqual(self.api(self.pupil).post(f"/api/v1/forms/{self.form['id']}/submit", {"answers": "x"}, format="json").status_code, 400)
        self.assertEqual(FormResponse.objects.count(), 0)

    def test_optional_questions_may_be_left_blank(self):
        self.publish(self.form["id"])
        res = self.submit(self.form, topics=(), comment="")
        self.assertEqual(res.status_code, 201, res.content)


class Results(FormsBase):
    def setUp(self):
        super().setUp()
        self.form = self.create().json()
        self.publish(self.form["id"])
        self.submit(self.form, user=self.pupil, name="Ann", day="Mon", topics=("A", "B"))
        self.submit(self.form, user=self.mate, name="=SUM(1)", day="Mon", topics=("B",))

    def test_summary_and_rows(self):
        data = self.api(self.teacher).get(f"/api/v1/forms/{self.form['id']}/responses").json()
        self.assertEqual((len(data["responses"]), data["enrolled"]), (2, 2))
        day = next(s for s in data["summary"] if s["prompt"] == "Pick a day")
        self.assertEqual({c["option"]: c["count"] for c in day["counts"]}, {"Mon": 2, "Tue": 0})
        topics = next(s for s in data["summary"] if s["prompt"] == "Topics")
        self.assertEqual({c["option"]: c["count"] for c in topics["counts"]}, {"A": 1, "B": 2, "C": 0})
        self.assertEqual(self.api(self.teacher).get("/api/v1/forms").json()[0]["response_count"], 2)

    def test_csv_escapes_formulas(self):
        res = self.api(self.teacher).get(f"/api/v1/forms/{self.form['id']}/responses?export=csv")
        self.assertEqual(res.status_code, 200)
        body = res.content.decode()
        self.assertIn("'=SUM(1)", body)
        self.assertIn("A, B", body)
        self.assertEqual(body.splitlines()[0].split(",")[:3], ["Student", "Email", "Submitted"])

    def test_results_are_private_to_the_owner(self):
        for user in (self.other_teacher, self.pupil, self.outsider):
            self.assertEqual(self.api(user).get(f"/api/v1/forms/{self.form['id']}/responses").status_code, 403)
        self.assertEqual(self.api(self.other_teacher).get("/api/v1/forms").json(), [])
