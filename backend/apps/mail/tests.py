from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient, APITestCase

from apps.core.utils import file_uploads


class MailAccessAndUploadTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        self.teacher = User.objects.create_user(email="t@example.com", password="x", role="TEACHER")
        self.student = User.objects.create_user(
            email="s@example.com", password="x", role="STUDENT", first_name="Sam", register_no="R1"
        )

    def test_students_and_anonymous_cannot_use_mail_tools(self):
        for client_user in (None, self.student):
            self.client.force_authenticate(client_user)
            for method, url in (
                ("post", "/api/v1/mail/filter"),
                ("get", "/api/v1/mail/drafts"),
                ("get", "/api/v1/mail/history"),
                ("post", "/api/v1/mail/generate"),
            ):
                res = getattr(self.client, method)(url, {"students": [{"name": "x"}]}, format="json")
                self.assertIn(res.status_code, (401, 403), f"{method} {url} as {client_user}")

    def test_teacher_can_filter_only_their_own_enrolled_students(self):
        from apps.accounts.testing import default_section
        from apps.classrooms.models import Classroom, Enrollment

        section = default_section()
        batch = section.batch
        classroom = Classroom.objects.create(
            name="Maths", subject_code="M1", teacher=self.teacher,
            department=batch.program.department, program=batch.program, batch=batch,
        )
        Enrollment.objects.create(classroom=classroom, student=self.student)
        get_user_model().objects.create_user(email="other@example.com", password="x", role="STUDENT")  # not enrolled
        self.client.force_authenticate(self.teacher)
        res = self.client.post("/api/v1/mail/filter", {"conditions": []}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([row["email"] for row in res.json()], ["s@example.com"])

    def test_spreadsheet_upload_rejects_wrong_type_and_oversize(self):
        self.client.force_authenticate(self.teacher)
        bad_type = SimpleUploadedFile("evil.exe", b"MZ", content_type="application/octet-stream")
        res = self.client.post("/api/v1/mail/parse-excel", {"file": bad_type}, format="multipart")
        self.assertEqual(res.status_code, 400)

        big = SimpleUploadedFile("big.csv", b"a,b\n" + b"1,2\n" * (file_uploads.MAX_SPREADSHEET_BYTES // 4 + 10))
        res = self.client.post("/api/v1/mail/parse-excel", {"file": big}, format="multipart")
        self.assertEqual(res.status_code, 400)
        self.assertIn("too large", str(res.json()["detail"]))

    def test_small_csv_upload_still_works(self):
        self.client.force_authenticate(self.teacher)
        ok = SimpleUploadedFile("students.csv", b"name,email\nAnn,ann@example.com\n")
        res = self.client.post("/api/v1/mail/parse-excel", {"file": ok}, format="multipart")
        self.assertEqual(res.status_code, 200)


class SpreadsheetParsingTests(APITestCase):
    """The student sheet is read without pandas: .xlsx and .csv, blank cells fall back to defaults."""

    def setUp(self):
        self.teacher = get_user_model().objects.create_user(email="t@example.com", password="pw", role="TEACHER")
        self.client.force_authenticate(self.teacher)

    def parse(self, name, data):
        return self.client.post("/api/v1/mail/parse-excel", {"file": SimpleUploadedFile(name, data)}, format="multipart")

    def test_csv_columns_and_blank_cells(self):
        res = self.parse("s.csv", b"Name,Email,Reg_No,Score,attendance\nAnn,ann@example.com,R1,72.5,\n,,,,\nBen,,,,90\n")
        self.assertEqual(res.status_code, 200, res.content)
        rows = res.json()
        self.assertEqual(len(rows), 2)  # the empty line is skipped
        self.assertEqual((rows[0]["name"], rows[0]["email"], rows[0]["registration_number"], rows[0]["avg_score"], rows[0]["attendance"]), ("Ann", "ann@example.com", "R1", 72.5, None))
        self.assertEqual((rows[1]["name"], rows[1]["registration_number"], rows[1]["attendance"]), ("Ben", "R-2", 90.0))

    def test_xlsx(self):
        import io

        from openpyxl import Workbook

        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["name", "email", "score"])
        sheet.append(["Cy", "cy@example.com", 55])
        buffer = io.BytesIO()
        workbook.save(buffer)
        res = self.parse("s.xlsx", buffer.getvalue())
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual((res.json()[0]["name"], res.json()[0]["avg_score"]), ("Cy", 55.0))

    def test_old_xls_gets_a_clear_message(self):
        res = self.parse("s.xls", b"not really excel")
        self.assertEqual(res.status_code, 400)
        self.assertIn(".xlsx", res.json()["detail"])
