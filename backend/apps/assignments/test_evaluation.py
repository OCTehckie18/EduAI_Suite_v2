from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import StudentActivity
from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import Assignment, Submission, SubmissionEvaluation

RUBRIC = [
    {"label": "Content", "description": "Accuracy", "max_score": 60},
    {"label": "Style", "max_score": 40},
]


def person(email, role):
    return User.objects.create_user(email=email, password="x", role=role, first_name=email.split("@")[0])


class EvaluationBase(TestCase):
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
        self.classmate = person("mate@x.com", User.Role.STUDENT)
        self.course = Classroom.objects.create(
            name="W", subject_code="W1", teacher=self.teacher, department=dept, program=program, batch=batch, section=section
        )
        for s in (self.pupil, self.classmate):
            Enrollment.objects.create(classroom=self.course, student=s)
        self.assignment = Assignment.objects.create(course=self.course, title="Essay", max_points=100)
        self.sub = Submission.objects.create(assignment=self.assignment, student=self.pupil, student_name="pupil", file_path="a.pdf")
        self.mate_sub = Submission.objects.create(assignment=self.assignment, student=self.classmate, student_name="mate")

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def set_rubric(self, rubric=RUBRIC, user=None):
        return self.api(user or self.teacher).put(f"/assignments/{self.assignment.pk}/rubric", {"criteria": rubric}, format="json")

    def scores(self, a=50, b=30):
        crit = self.api(self.teacher).get(f"/assignments/{self.assignment.pk}/rubric").json()["criteria"]
        return [{"criterion_id": crit[0]["id"], "score": a, "comment": "ok"}, {"criterion_id": crit[1]["id"], "score": b}]


class RubricSetup(EvaluationBase):
    def test_the_rubric_must_add_up_to_the_assignment_marks(self):
        self.assertEqual(self.set_rubric().status_code, 200)
        self.assertEqual(self.set_rubric([{"label": "A", "max_score": 50}]).status_code, 400)
        self.assertEqual(self.set_rubric([{"label": "A", "max_score": 100}, {"label": "B", "max_score": 0}]).status_code, 400)
        self.assertEqual(self.set_rubric([{"label": " ", "max_score": 100}]).status_code, 400)
        self.assertEqual(self.set_rubric([{"label": "A", "max_score": 99.5}, {"label": "B", "max_score": 0.5}]).status_code, 400)
        self.assertEqual(self.api(self.teacher).put(f"/assignments/{self.assignment.pk}/rubric", {"criteria": "x"}, format="json").status_code, 400)
        # failed attempts changed nothing
        self.assertEqual(self.assignment.criteria.count(), 2)

    def test_only_the_courses_teacher_edits_the_rubric(self):
        self.assertEqual(self.set_rubric(user=self.other_teacher).status_code, 403)
        self.assertEqual(self.set_rubric(user=self.pupil).status_code, 403)
        self.assertEqual(self.assignment.criteria.count(), 0)

    def test_students_in_the_course_can_read_it_and_strangers_cannot(self):
        self.set_rubric()
        self.assertEqual(len(self.api(self.pupil).get(f"/assignments/{self.assignment.pk}/rubric").json()["criteria"]), 2)
        self.assertEqual(self.api(self.other_teacher).get(f"/assignments/{self.assignment.pk}/rubric").status_code, 403)

    def test_a_rubric_in_use_cannot_be_changed(self):
        self.set_rubric()
        self.api(self.teacher).put(f"/submissions/evaluation/{self.sub.pk}", {"scores": self.scores()}, format="json")
        self.assertEqual(self.set_rubric([{"label": "Only", "max_score": 100}]).status_code, 409)
        self.assertEqual(self.assignment.criteria.count(), 2)


class Marking(EvaluationBase):
    def setUp(self):
        super().setUp()
        self.set_rubric()

    def mark(self, scores=None, feedback="Good", user=None, sub=None):
        return self.api(user or self.teacher).put(
            f"/submissions/evaluation/{(sub or self.sub).pk}", {"scores": scores or self.scores(), "feedback": feedback}, format="json"
        )

    def test_marking_sets_the_grade_and_the_students_record(self):
        res = self.mark()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["submission"]["grade"], 80)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.grade, 80)
        self.assertEqual(self.sub.evaluation.feedback, "Good")
        activity = StudentActivity.objects.get(student_id=self.pupil.pk, source_id=self.assignment.pk)
        self.assertEqual(activity.score, 80)
        # appears in the teacher's gradebook
        book = self.api(self.teacher).get(f"/assignments/gradebook/{self.course.pk}").json()
        row = next(r for r in book["students"] if r["student_id"] == self.pupil.pk)
        self.assertEqual(row["cells"][0]["grade"], 80)

    def test_marking_again_replaces_the_earlier_marks(self):
        self.mark()
        self.mark(self.scores(10, 5), feedback="Redo")
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.grade, 15)
        self.assertEqual(self.sub.evaluation.scores.count(), 2)
        self.assertEqual(SubmissionEvaluation.objects.count(), 1)

    def test_scores_are_checked_and_nothing_is_saved_on_error(self):
        crit = self.scores()
        cases = [
            [{**crit[0], "score": 61}, crit[1]],  # above the line's maximum
            [{**crit[0], "score": -1}, crit[1]],
            [{**crit[0], "score": "lots"}, crit[1]],
            [{**crit[0], "score": True}, crit[1]],
            [crit[0]],  # a line is missing
            [crit[0], crit[0], crit[1]],  # scored twice
            [crit[0], {"criterion_id": 99999, "score": 1}],
        ]
        for bad in cases:
            self.assertEqual(self.mark(bad).status_code, 400, bad)
        self.assertEqual(self.api(self.teacher).put(f"/submissions/evaluation/{self.sub.pk}", {"scores": crit, "feedback": "x" * 5001}, format="json").status_code, 400)
        self.sub.refresh_from_db()
        self.assertIsNone(self.sub.grade)
        self.assertFalse(SubmissionEvaluation.objects.exists())

    def test_another_assignments_criterion_is_refused(self):
        other = Assignment.objects.create(course=self.course, title="Other", max_points=10)
        self.api(self.teacher).put(f"/assignments/{other.pk}/rubric", {"criteria": [{"label": "X", "max_score": 10}]}, format="json")
        foreign = other.criteria.get().pk
        crit = self.scores()
        self.assertEqual(self.mark([crit[0], {"criterion_id": foreign, "score": 5}]).status_code, 400)

    def test_marking_needs_a_rubric(self):
        bare = Assignment.objects.create(course=self.course, title="Bare", max_points=10)
        sub = Submission.objects.create(assignment=bare, student=self.pupil, student_name="pupil")
        res = self.api(self.teacher).put(f"/submissions/evaluation/{sub.pk}", {"scores": []}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_only_the_courses_teacher_marks(self):
        self.assertEqual(self.mark(user=self.other_teacher).status_code, 403)
        self.assertEqual(self.mark(user=self.pupil).status_code, 403)
        self.assertEqual(self.api(self.other_teacher).get(f"/submissions/evaluation/{self.sub.pk}").status_code, 403)
        self.assertEqual(self.api(self.other_teacher).get(f"/assignments/{self.assignment.pk}/evaluation").status_code, 403)
        self.sub.refresh_from_db()
        self.assertIsNone(self.sub.grade)

    def test_queue_lists_every_submission_and_whether_it_is_marked(self):
        self.mark()
        queue = self.api(self.teacher).get(f"/assignments/{self.assignment.pk}/evaluation").json()
        by_name = {s["student_name"]: s for s in queue["submissions"]}
        self.assertTrue(by_name["pupil"]["evaluated"])
        self.assertFalse(by_name["mate"]["evaluated"])
        self.assertEqual(len(queue["criteria"]), 2)

    def test_loading_a_marked_submission_returns_its_scores(self):
        self.mark()
        data = self.api(self.teacher).get(f"/submissions/evaluation/{self.sub.pk}").json()
        self.assertTrue(data["evaluated"])
        self.assertEqual([c["score"] for c in data["criteria"]], [50, 30])
        self.assertEqual(data["criteria"][0]["comment"], "ok")
        fresh = self.api(self.teacher).get(f"/submissions/evaluation/{self.mate_sub.pk}").json()
        self.assertFalse(fresh["evaluated"])
        self.assertEqual([c["score"] for c in fresh["criteria"]], [None, None])

    def test_a_student_reads_only_their_own_marking(self):
        self.mark()
        self.assertEqual(self.api(self.pupil).get(f"/submissions/my-evaluation/{self.mate_sub.pk}").status_code, 404)
        self.assertEqual(self.api(self.classmate).get(f"/submissions/my-evaluation/{self.sub.pk}").status_code, 404)
        mine = self.api(self.pupil).get(f"/submissions/my-evaluation/{self.sub.pk}")
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(mine.json()["feedback"], "Good")
        # unmarked work says so
        self.assertEqual(self.api(self.classmate).get(f"/submissions/my-evaluation/{self.mate_sub.pk}").status_code, 404)
