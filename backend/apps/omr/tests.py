import cv2
import numpy as np
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import StudentActivity
from apps.institution.models import Batch, Campus, Department, Program, School, Section

from . import layout as L
from .models import OMRJob, OMRSubmission
from .reader import SheetError, decode_image, read_sheet
from .template import build_template_pdf

N = 30
KEY = {str(q): "ABCD"[q % 4] for q in range(1, N + 1)}


def sheet_image(answers, register="20250123", n=N):
    """The printed template with bubbles filled in, as the scanner would see it."""
    img = decode_image(build_template_pdf("Test", n), "t.pdf")
    scale = img.shape[1] / L.PAGE_W

    def fill(x, y):
        cv2.circle(img, (int(x * scale), int(y * scale)), int(L.BUBBLE_R * scale * 0.85), (20, 20, 20), -1)

    for q, letters in answers.items():
        for letter in letters or "":
            fill(*L.answer_bubble(int(q), L.OPTIONS.index(letter)))
    for pos, digit in enumerate(register.rjust(L.REG_DIGITS, "-")):
        if digit != "-":
            fill(*L.register_bubble(pos, int(digit)))
    return img


def as_photo(img):
    """Skew, blur and a grey table behind it: a phone photo, roughly."""
    h, w = img.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[60, 40], [w - 30, 70], [w - 80, h - 30], [20, h - 60]])
    out = np.full((h + 100, w + 100, 3), 150, np.uint8)
    out = cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (w + 100, h + 100), dst=out, borderMode=cv2.BORDER_TRANSPARENT)
    return cv2.GaussianBlur(out, (5, 5), 0)


def png(img, name="scan.png"):
    ok, data = cv2.imencode(".png", img)
    return SimpleUploadedFile(name, data.tobytes(), content_type="image/png")


class Reader(SimpleTestCase):
    def test_a_clean_sheet_reads_exactly(self):
        reading = read_sheet(sheet_image({q: a for q, a in KEY.items()}), N)
        self.assertEqual({str(q): r.answer for q, r in reading.questions.items()}, KEY)
        self.assertEqual((reading.register, reading.register_ok), ("20250123", True))

    def test_a_skewed_blurred_photo_still_reads(self):
        reading = read_sheet(as_photo(sheet_image({q: a for q, a in KEY.items()})), N)
        self.assertEqual({str(q): r.answer for q, r in reading.questions.items()}, KEY)
        self.assertEqual(reading.register, "20250123")

    def test_blank_and_double_marks_are_reported_not_guessed(self):
        answers = {q: a for q, a in KEY.items()}
        answers["2"] = ""  # left blank
        answers["3"] = "AB"  # two marks
        reading = read_sheet(sheet_image(answers), N)
        self.assertEqual((reading.questions[2].answer, reading.questions[2].state), (None, "blank"))
        self.assertEqual((reading.questions[3].answer, reading.questions[3].state), (None, "multiple"))
        self.assertEqual(reading.questions[4].state, "ok")

    def test_short_register_numbers_and_unreadable_ones(self):
        self.assertEqual(read_sheet(sheet_image(KEY, register="4567"), N).register, "4567")
        blank = read_sheet(sheet_image(KEY, register=""), N)
        self.assertFalse(blank.register_ok)

    def test_a_photo_without_the_corner_squares_is_refused(self):
        with self.assertRaises(SheetError):
            read_sheet(np.full((800, 600, 3), 255, np.uint8), N)

    def test_garbage_bytes_are_refused(self):
        with self.assertRaises(SheetError):
            decode_image(b"not an image", "x.png")
        with self.assertRaises(SheetError):
            decode_image(b"%PDF-1.4 broken", "x.pdf")

    def test_the_template_is_a_pdf_with_room_for_100_questions(self):
        self.assertTrue(build_template_pdf("Big", 100).startswith(b"%PDF"))
        self.assertEqual(L.answer_bubble(100, 3)[1] < L.MARKER_CENTERS[3][1] - 4, True)


class OmrBase(TestCase):
    def setUp(self):
        campus = Campus.objects.create(name="C", code="C", city="B")
        school = School.objects.create(name="S", code="S", campus=campus)
        dept = Department.objects.create(name="D", code="D", school=school)
        program = Program.objects.create(name="P", code="P", department=dept, degree_level=Program.DegreeLevel.PG, duration_years=2)
        batch = Batch.objects.create(name="B", program=program, start_year=2025, end_year=2027, academic_year="2025-2026")
        section = Section.objects.create(name="A", batch=batch)
        mk = lambda email, role, **kw: User.objects.create_user(email=email, password="x", role=role, first_name=email.split("@")[0], **kw)
        self.teacher = mk("t@x.com", User.Role.TEACHER)
        self.other = mk("o@x.com", User.Role.TEACHER)
        self.ann = mk("ann@x.com", User.Role.STUDENT, register_no="20250123")
        self.bob = mk("bob@x.com", User.Role.STUDENT, register_no="777")
        self.outsider = mk("out@x.com", User.Role.STUDENT, register_no="999")
        self.course = Classroom.objects.create(
            name="W", subject_code="W1", teacher=self.teacher, department=dept, program=program, batch=batch, section=section
        )
        for s in (self.ann, self.bob):
            Enrollment.objects.create(classroom=self.course, student=s)

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def job(self, **extra):
        res = self.api(self.teacher).post("/omr/jobs", {"title": "Midterm", "num_questions": N, "answer_key": KEY, "classroom_id": self.course.pk, **extra}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def scan(self, job, image, user=None, name="scan.png"):
        return self.api(user or self.teacher).post(f"/omr/jobs/{job['id']}/submissions", {"files": [png(image, name)]}, format="multipart")


class Jobs(OmrBase):
    def test_creating_checks_everything(self):
        api = self.api(self.teacher)
        bad = [
            {"title": " ", "num_questions": N, "answer_key": KEY},
            {"title": "x", "num_questions": 0, "answer_key": KEY},
            {"title": "x", "num_questions": 101, "answer_key": KEY},
            {"title": "x", "num_questions": N, "answer_key": {"1": "A"}},
            {"title": "x", "num_questions": N, "answer_key": {**KEY, "2": "E"}},
            {"title": "x", "num_questions": N, "answer_key": {**KEY, "99": "A"}},
            {"title": "x", "num_questions": N, "answer_key": KEY, "classroom_id": 99999},
        ]
        for body in bad:
            self.assertEqual(api.post("/omr/jobs", body, format="json").status_code, 400, body)
        self.assertEqual(self.api(self.other).post("/omr/jobs", {"title": "x", "num_questions": N, "answer_key": KEY, "classroom_id": self.course.pk}, format="json").status_code, 400)
        self.assertEqual(self.api(self.ann).post("/omr/jobs", {"title": "x", "num_questions": N, "answer_key": KEY}, format="json").status_code, 403)
        self.assertEqual(OMRJob.objects.count(), 0)

    def test_jobs_belong_to_their_teacher(self):
        job = self.job()
        self.assertEqual(OMRJob.objects.get().owner, self.teacher)
        other = self.api(self.other)
        self.assertEqual(other.get("/omr/jobs").json(), [])
        for method, url in (("get", f"/omr/jobs/{job['id']}"), ("patch", f"/omr/jobs/{job['id']}"), ("delete", f"/omr/jobs/{job['id']}"),
                            ("get", f"/omr/jobs/{job['id']}/template"), ("get", f"/omr/jobs/{job['id']}/submissions")):
            self.assertEqual(getattr(other, method)(url).status_code, 404, (method, url))
        self.assertEqual(OMRJob.objects.count(), 1)

    def test_the_template_downloads_as_pdf(self):
        job = self.job()
        res = self.api(self.teacher).get(f"/omr/jobs/{job['id']}/template")
        self.assertEqual((res.status_code, res["Content-Type"]), (200, "application/pdf"))
        self.assertTrue(res.content.startswith(b"%PDF"))


class Scanning(OmrBase):
    def test_a_clean_sheet_is_matched_scored_and_recorded(self):
        job = self.job()
        res = self.scan(job, as_photo(sheet_image({q: a for q, a in KEY.items()})))
        self.assertEqual(res.status_code, 201, res.content)
        sub = res.json()["results"][0]["submission"]
        self.assertEqual((sub["status"], sub["score"], sub["student_id"]), ("verified", 100.0, self.ann.pk))
        self.assertEqual(StudentActivity.objects.get(student_id=self.ann.pk, activity_type="exam").score, 100.0)

    def test_wrong_blank_and_double_answers_count_against_the_score(self):
        job = self.job()
        answers = {q: a for q, a in KEY.items()}
        answers["1"] = "D" if KEY["1"] != "D" else "C"  # wrong
        answers["2"] = ""  # blank
        answers["3"] = "AB"  # double
        sub = self.scan(job, sheet_image(answers)).json()["results"][0]["submission"]
        self.assertEqual(sub["score"], round(100 * (N - 3) / N, 1))
        self.assertEqual(sub["status"], "needs_review")
        self.assertEqual(sub["issues"]["questions"], {"2": "blank", "3": "multiple"})
        # a sheet that needs review does not reach the student's record yet
        self.assertFalse(StudentActivity.objects.exists())

    def test_unknown_or_outside_register_numbers_need_a_student_chosen(self):
        job = self.job()
        for reg in ("5555", "999"):  # nobody / not in this classroom
            sub = self.scan(job, sheet_image(KEY, register=reg)).json()["results"][0]["submission"]
            self.assertIsNone(sub["student_id"])
            self.assertEqual(sub["status"], "needs_review")
            self.assertTrue(sub["issues"]["notes"])

    def test_a_second_sheet_for_the_same_student_is_not_matched_twice(self):
        job = self.job()
        self.scan(job, sheet_image(KEY))
        second = self.scan(job, sheet_image(KEY)).json()["results"][0]["submission"]
        self.assertIsNone(second["student_id"])
        self.assertIn("already has a sheet", second["issues"]["notes"][0])
        self.assertEqual(OMRSubmission.objects.filter(student=self.ann).count(), 1)

    def test_bad_files_are_reported_one_by_one(self):
        job = self.job()
        files = [png(sheet_image(KEY), "ok.png"), SimpleUploadedFile("bad.png", b"junk"), SimpleUploadedFile("note.txt", b"hello")]
        res = self.api(self.teacher).post(f"/omr/jobs/{job['id']}/submissions", {"files": files}, format="multipart")
        self.assertEqual(res.status_code, 201)
        results = res.json()["results"]
        self.assertIn("submission", results[0])
        self.assertIn("error", results[1])
        self.assertIn("error", results[2])
        self.assertEqual(OMRSubmission.objects.count(), 1)
        none = self.api(self.teacher).post(f"/omr/jobs/{job['id']}/submissions", {}, format="multipart")
        self.assertEqual(none.status_code, 400)
        only_bad = self.api(self.teacher).post(f"/omr/jobs/{job['id']}/submissions", {"files": [SimpleUploadedFile("bad.png", b"junk")]}, format="multipart")
        self.assertEqual(only_bad.status_code, 400)

    def test_only_the_owner_can_scan(self):
        job = self.job()
        self.assertEqual(self.scan(job, sheet_image(KEY), user=self.other).status_code, 404)
        self.assertEqual(self.scan(job, sheet_image(KEY), user=self.ann).status_code, 403)
        self.assertEqual(OMRSubmission.objects.count(), 0)


class Review(OmrBase):
    def flagged(self):
        job = self.job()
        answers = {q: a for q, a in KEY.items()}
        answers["2"] = ""
        sub = self.scan(job, sheet_image(answers, register="5555")).json()["results"][0]["submission"]
        return job, sub

    def test_correcting_answers_and_choosing_the_student_then_confirming(self):
        job, sub = self.flagged()
        api = self.api(self.teacher)
        url = f"/omr/submissions/{sub['id']}"
        self.assertEqual(api.patch(url, {"confirm": True}, format="json").status_code, 400)  # no student yet
        res = api.patch(url, {"answers": {"2": KEY["2"]}, "student_id": self.bob.pk}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual((res.json()["score"], res.json()["status"]), (100.0, "verified"))
        self.assertEqual(StudentActivity.objects.get(student_id=self.bob.pk).score, 100.0)
        # moving the sheet to another student moves the record
        res = api.patch(url, {"student_id": self.ann.pk}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(StudentActivity.objects.filter(student_id=self.bob.pk).exists())
        self.assertTrue(StudentActivity.objects.filter(student_id=self.ann.pk).exists())

    def test_edits_are_validated(self):
        job, sub = self.flagged()
        api, url = self.api(self.teacher), f"/omr/submissions/{sub['id']}"
        for body in ({"answers": {"2": "E"}}, {"answers": {"99": "A"}}, {"answers": "A"}, {"student_id": self.outsider.pk}, {"student_id": 99999}):
            self.assertEqual(api.patch(url, body, format="json").status_code, 400, body)
        self.assertEqual(OMRSubmission.objects.get().student_id, None)

    def test_another_teacher_cannot_review(self):
        job, sub = self.flagged()
        other = self.api(self.other)
        self.assertEqual(other.patch(f"/omr/submissions/{sub['id']}", {"confirm": True}, format="json").status_code, 404)
        self.assertEqual(other.delete(f"/omr/submissions/{sub['id']}").status_code, 404)

    def test_changing_the_key_regrades_everything(self):
        job = self.job()
        self.scan(job, sheet_image(KEY))
        new_key = {**KEY, "1": "D" if KEY["1"] != "D" else "C"}
        res = self.api(self.teacher).patch(f"/omr/jobs/{job['id']}", {"answer_key": new_key}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(OMRSubmission.objects.get().score, round(100 * (N - 1) / N, 1))
        self.assertEqual(StudentActivity.objects.get().score, round(100 * (N - 1) / N, 1))
        self.assertEqual(self.api(self.teacher).patch(f"/omr/jobs/{job['id']}", {"answer_key": {"1": "A"}}, format="json").status_code, 400)

    def test_deleting_a_sheet_or_an_exam_removes_the_students_record(self):
        job = self.job()
        sub = self.scan(job, sheet_image(KEY)).json()["results"][0]["submission"]
        self.assertTrue(StudentActivity.objects.exists())
        self.assertEqual(self.api(self.teacher).delete(f"/omr/submissions/{sub['id']}").status_code, 204)
        self.assertFalse(StudentActivity.objects.exists())
        self.scan(job, sheet_image(KEY))
        self.assertEqual(self.api(self.teacher).delete(f"/omr/jobs/{job['id']}").status_code, 204)
        self.assertFalse(StudentActivity.objects.exists())
        self.assertEqual(OMRSubmission.objects.count(), 0)

    def test_csv_export(self):
        job = self.job()
        self.scan(job, sheet_image(KEY))
        res = self.api(self.teacher).get(f"/omr/jobs/{job['id']}/submissions?export=csv")
        lines = res.content.decode().splitlines()
        self.assertEqual(lines[0].split(",")[:5], ["Student", "Email", "Register read", "Score %", "Status"])
        self.assertIn("ann@x.com", lines[1])
        self.assertIn("100.0", lines[1])
