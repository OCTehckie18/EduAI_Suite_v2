import io
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import Workbook, load_workbook
from rest_framework.test import APITestCase

User = get_user_model()


def workbook_file(rows, name="q.xlsx"):
    wb = Workbook()
    for row in rows:
        wb.active.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return SimpleUploadedFile(name, buffer.getvalue())


HEADER = ["Question", "Option A", "Option B", "Option C", "Option D", "Correct (A-D)", "Points"]


class ImportBase(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(email="t@x.com", role="TEACHER")
        self.student = User.objects.create_user(email="s@x.com", role="STUDENT")
        self.client.force_authenticate(self.teacher)

    def upload(self, name, rows):
        return self.client.post(reverse(name), {"file": workbook_file(rows)}, format="multipart")


class TemplateTests(ImportBase):
    def test_template_is_a_real_workbook_with_the_expected_headings(self):
        response = self.client.get(reverse("exam-template"))
        self.assertEqual(response.status_code, 200)
        sheet = load_workbook(io.BytesIO(response.content)).active
        self.assertEqual([c.value for c in sheet[1]], HEADER)

    def test_the_template_round_trips_through_the_importer(self):
        template = self.client.get(reverse("exam-template")).content
        response = self.client.post(reverse("exam-import-excel"), {"file": SimpleUploadedFile("t.xlsx", template)}, format="multipart")
        body = response.json()
        self.assertEqual((response.status_code, body["imported_count"], body["errors"]), (200, 2, []))
        self.assertEqual([c["is_correct"] for c in body["questions"][0]["choices"]], [False, True, False, False])


class ImportExcelTests(ImportBase):
    def test_good_rows_import_and_bad_rows_are_reported_by_row_number(self):
        body = self.upload("exam-import-excel", [
            HEADER,
            ["Good?", "yes", "no", None, None, "A", 2],
            ["", "a", "b", None, None, "A", 1],
            ["One option", "only", None, None, None, "A", 1],
            ["Bad answer", "a", "b", None, None, "D", 1],
            ["Bad points", "a", "b", None, None, "A", "lots"],
            [None, None, None, None, None, None, None],
        ]).json()
        self.assertEqual(body["imported_count"], 1)
        self.assertEqual(len(body["errors"]), 4)
        self.assertTrue(body["errors"][0].startswith("Row 3"))
        self.assertEqual(body["questions"][0]["points"], 2.0)
        self.assertEqual(len(body["questions"][0]["choices"]), 2)  # blank options are dropped

    def test_a_sheet_without_the_right_headings_is_explained(self):
        response = self.upload("exam-import-excel", [["Foo", "Bar"], ["x", "y"]])
        self.assertEqual(response.status_code, 400)
        self.assertIn("template", response.json()["detail"])

    def test_wrong_file_types_and_junk_are_refused(self):
        for name, content in (("q.csv", b"a,b"), ("q.xls", b"\xd0\xcf"), ("q.xlsx", b"not a workbook")):
            response = self.client.post(reverse("exam-import-excel"), {"file": SimpleUploadedFile(name, content)}, format="multipart")
            self.assertEqual(response.status_code, 400, name)

    def test_students_cannot_use_the_import_tools(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(reverse("exam-template")).status_code, 403)
        self.assertEqual(self.upload("exam-import-excel", [HEADER]).status_code, 403)
        self.assertEqual(self.upload("exam-extract", [HEADER]).status_code, 403)


class ExtractTests(ImportBase):
    def pdf(self, text="Q1 What is 2+2? A) 3 B) 4"):
        import fitz
        document = fitz.open()
        document.new_page().insert_text((72, 72), text)
        return SimpleUploadedFile("paper.pdf", document.tobytes())

    def post(self, upload):
        return self.client.post(reverse("exam-extract"), {"file": upload}, format="multipart")

    def test_without_an_ai_key_the_teacher_is_told_so_instead_of_a_silent_failure(self):
        with mock.patch("apps.exams.import_views.GroqService.get_client", return_value=None):
            response = self.post(self.pdf())
        self.assertEqual(response.status_code, 503)
        self.assertIn("Excel", response.json()["detail"])

    def test_questions_from_the_ai_are_cleaned_and_returned_as_a_list(self):
        reply = {"questions": [
            {"question_text": "2+2?", "points": 2, "choices": [{"choice_text": "3", "is_correct": False}, {"choice_text": "4", "is_correct": True}]},
            {"question_text": "one choice only", "choices": [{"choice_text": "x", "is_correct": True}]},
            "junk",
        ]}
        client = mock.Mock()
        client.chat.completions.create.return_value.choices = [mock.Mock(message=mock.Mock(content=json.dumps(reply)))]
        with mock.patch("apps.exams.import_views.GroqService.get_client", return_value=client):
            response = self.post(self.pdf())
        self.assertEqual(response.status_code, 200)
        self.assertEqual([q["question_text"] for q in response.json()], ["2+2?"])

    def test_an_ai_failure_is_reported_as_a_502(self):
        client = mock.Mock()
        client.chat.completions.create.side_effect = RuntimeError("boom")
        with mock.patch("apps.exams.import_views.GroqService.get_client", return_value=client):
            self.assertEqual(self.post(self.pdf()).status_code, 502)

    def test_a_file_with_no_readable_text_and_wrong_types_are_refused(self):
        self.assertEqual(self.post(SimpleUploadedFile("scan.pdf", b"%PDF-1.4 not really")).status_code, 400)
        self.assertEqual(self.post(SimpleUploadedFile("paper.txt", b"hello")).status_code, 400)
