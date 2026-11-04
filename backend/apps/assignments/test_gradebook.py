from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import StudentActivity

User = get_user_model()


class GradebookBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department
        self.teacher = User.objects.create_user(email="t@x.com", first_name="Tess", last_name="Teach", role="TEACHER", department=department)
        self.rival = User.objects.create_user(email="r@x.com", first_name="Rita", last_name="Rival", role="TEACHER", department=department)
        # Two different students with exactly the same name.
        self.sam1 = User.objects.create_user(email="sam1@x.com", first_name="Sam", last_name="Lee", role="STUDENT", register_no="R1")
        self.sam2 = User.objects.create_user(email="sam2@x.com", first_name="Sam", last_name="Lee", role="STUDENT", register_no="R2")
        self.course = Classroom.objects.create(name="Maths", subject_code="M1", teacher=self.teacher, department=department, program=program, batch=batch)
        for student in (self.sam1, self.sam2):
            Enrollment.objects.create(classroom=self.course, student=student)
        self.hw1 = Assignment.objects.create(course=self.course, title="HW1", max_points=50)
        self.hw2 = Assignment.objects.create(course=self.course, title="HW2", max_points=100)

    def submit(self, student, assignment):
        self.client.force_authenticate(student)
        return self.client.post(f"/api/v1/submissions/{assignment.pk}", {"files": SimpleUploadedFile("a.pdf", b"%PDF-1.4 x")}, format="multipart")


class SameNameStudentsTests(GradebookBase):
    def test_students_with_the_same_name_keep_separate_work_and_grades(self):
        self.assertEqual(self.submit(self.sam1, self.hw1).status_code, 201)
        self.assertEqual(self.submit(self.sam2, self.hw1).status_code, 201)
        self.assertEqual(Submission.objects.count(), 2)
        self.client.force_authenticate(self.sam1)
        self.assertEqual(len(self.client.get(f"/api/v1/submissions/{self.hw1.pk}").json()), 1)
        mine = Submission.objects.get(student=self.sam1)
        self.client.force_authenticate(self.teacher)
        self.client.put(f"/api/v1/submissions/grade/{mine.pk}", {"grade": 45})
        self.client.force_authenticate(self.sam2)
        self.assertIsNone(self.client.get(f"/api/v1/submissions/{self.hw1.pk}").json()[0]["grade"])
        # Withdrawing removes only the caller's work, even with the other Sam's name in the URL.
        self.assertEqual(self.client.delete(f"/api/v1/submissions/assignment/{self.hw1.pk}/student/Sam%20Lee").status_code, 204)
        self.assertEqual(list(Submission.objects.values_list("student_id", flat=True)), [self.sam1.pk])

    def test_resubmitting_replaces_the_earlier_attempt_and_clears_its_grade(self):
        self.submit(self.sam1, self.hw1)
        sub = Submission.objects.get()
        sub.grade = 40
        sub.save()
        response = self.submit(self.sam1, self.hw1)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Submission.objects.count(), 1)
        sub.refresh_from_db()
        self.assertIsNone(sub.grade)


class GradebookTests(GradebookBase):
    def setUp(self):
        super().setUp()
        self.a = Submission.objects.create(assignment=self.hw1, student=self.sam1, student_name="Sam Lee", grade=40)
        self.b = Submission.objects.create(assignment=self.hw2, student=self.sam1, student_name="Sam Lee", grade=None)
        self.c = Submission.objects.create(assignment=self.hw1, student=self.sam2, student_name="Sam Lee", grade=25)

    def test_teacher_sees_every_enrolled_student_against_every_assignment(self):
        self.client.force_authenticate(self.teacher)
        body = self.client.get(f"/api/v1/assignments/gradebook/{self.course.pk}").json()
        self.assertEqual([a["title"] for a in body["assignments"]], ["HW1", "HW2"])
        rows = {r["register_no"]: r for r in body["students"]}
        self.assertEqual([c["grade"] for c in rows["R1"]["cells"]], [40, None])
        self.assertEqual([c["submitted"] for c in rows["R1"]["cells"]], [True, True])
        self.assertEqual([c["submitted"] for c in rows["R2"]["cells"]], [True, False])
        # Only graded work counts towards the percentage: 40/50, not 40/150.
        self.assertEqual((rows["R1"]["earned"], rows["R1"]["possible"], rows["R1"]["percentage"]), (40, 50, 80.0))
        self.assertEqual(rows["R2"]["percentage"], 50.0)

    def test_students_without_graded_work_have_no_percentage(self):
        Submission.objects.all().delete()
        self.client.force_authenticate(self.teacher)
        body = self.client.get(f"/api/v1/assignments/gradebook/{self.course.pk}").json()
        self.assertTrue(all(r["percentage"] is None for r in body["students"]))

    def test_csv_export_and_formula_injection_is_neutralised(self):
        self.sam1.first_name = "=HYPERLINK(1)"
        self.sam1.save()
        self.client.force_authenticate(self.teacher)
        response = self.client.get(f"/api/v1/assignments/gradebook/{self.course.pk}?export=csv")
        self.assertEqual(response["Content-Type"], "text/csv")
        text = response.content.decode()
        self.assertIn("Register no,Name,Email,HW1 (/50),HW2 (/100),Earned,Possible,Percentage", text)
        self.assertIn("R1,'=HYPERLINK(1) Lee,sam1@x.com,40.0,Submitted,40.0,50,80.0", text)

    def test_only_the_courses_teacher_can_open_the_gradebook(self):
        url = f"/api/v1/assignments/gradebook/{self.course.pk}"
        for user in (self.rival, self.sam1):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(User.objects.create_user(email="m@x.com", role="MASTER_ADMIN"))
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_a_student_sees_only_their_own_row(self):
        self.client.force_authenticate(self.sam2)
        body = self.client.get(f"/api/v1/assignments/my-grades/{self.course.pk}").json()
        self.assertEqual(body["result"]["register_no"], "R2")
        self.assertEqual(body["result"]["percentage"], 50.0)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(f"/api/v1/assignments/my-grades/{self.course.pk}").status_code, 403)
        self.client.force_authenticate(User.objects.create_user(email="o@x.com", role="STUDENT"))
        self.assertEqual(self.client.get(f"/api/v1/assignments/my-grades/{self.course.pk}").status_code, 403)

    def test_grading_records_the_result_on_the_students_activity(self):
        self.client.force_authenticate(self.teacher)
        self.client.put(f"/api/v1/submissions/grade/{self.b.pk}", {"grade": 80})
        activity = StudentActivity.objects.get(student_id=self.sam1.pk, activity_type="assignment", source_id=str(self.hw2.pk))
        self.assertEqual((activity.score, activity.status), (80.0, "graded"))


class WithdrawGradedWorkTests(GradebookBase):
    def test_graded_work_cannot_be_withdrawn_by_the_student(self):
        Submission.objects.create(assignment=self.hw1, student=self.sam1, student_name="Sam Lee", grade=40)
        self.client.force_authenticate(self.sam1)
        response = self.client.delete(f"/api/v1/submissions/assignment/{self.hw1.pk}/student/Sam%20Lee")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Submission.objects.count(), 1)


class SubmissionFileTypeTests(GradebookBase):
    def post_file(self, name, content):
        self.client.force_authenticate(self.sam1)
        return self.client.post(f"/api/v1/submissions/{self.hw1.pk}", {"files": SimpleUploadedFile(name, content)}, format="multipart")

    def test_pdf_and_docx_are_accepted(self):
        self.assertEqual(self.post_file("work.pdf", b"%PDF-1.7 body").status_code, 201)
        self.assertEqual(self.post_file("work.docx", b"PK\x03\x04 body").status_code, 200)

    def test_other_file_types_are_refused_and_nothing_is_saved(self):
        for name in ("a.txt", "a.zip", "a.png", "a.doc", "a.pptx"):
            response = self.post_file(name, b"%PDF-1.4 x")
            self.assertEqual(response.status_code, 400, name)
        self.assertEqual(Submission.objects.count(), 0)

    def test_a_renamed_file_is_refused(self):
        response = self.post_file("fake.pdf", b"just text")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Submission.objects.count(), 0)
