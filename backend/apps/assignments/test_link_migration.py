from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class LinkSubmissionsMigrationTests(TransactionTestCase):
    migrate_from = [("assignments", "0002_feedbacktemplate_rubriccriterion"), ("accounts", "0004_admitted_student_roster")]
    migrate_to = [("assignments", "0003_submission_student"), ("accounts", "0004_admitted_student_roster")]

    def test_old_name_only_submissions_are_linked_by_email_or_register_number(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old = executor.loader.project_state(self.migrate_from).apps
        User, Campus = old.get_model("accounts", "User"), old.get_model("institution", "Campus")
        Classroom, Assignment, Submission = old.get_model("classrooms", "Classroom"), old.get_model("assignments", "Assignment"), old.get_model("assignments", "Submission")
        School, Department = old.get_model("institution", "School"), old.get_model("institution", "Department")
        Program, Batch = old.get_model("institution", "Program"), old.get_model("institution", "Batch")
        campus = Campus.objects.create(name="C", code="C", city="X")
        school = School.objects.create(name="S", code="S", campus=campus)
        dept = Department.objects.create(name="D", code="D", school=school)
        program = Program.objects.create(name="P", code="P", department=dept, degree_level="UG", duration_years=3)
        batch = Batch.objects.create(name="B", program=program, start_year=2026, end_year=2029, academic_year="x")
        teacher = User.objects.create(email="t@x.com", password="x", role="TEACHER", approval_status="APPROVED")
        asha = User.objects.create(email="asha@x.com", password="x", role="STUDENT", register_no="R100", first_name="Asha", approval_status="APPROVED")
        ravi = User.objects.create(email="ravi@x.com", password="x", role="STUDENT", first_name="Ravi", approval_status="APPROVED")
        User.objects.create(email="twin1@x.com", password="x", role="STUDENT", first_name="Sam", last_name="Lee", approval_status="APPROVED")
        User.objects.create(email="twin2@x.com", password="x", role="STUDENT", first_name="Sam", last_name="Lee", approval_status="APPROVED")
        course = Classroom.objects.create(name="M", subject_code="M", teacher=teacher, department=dept, program=program, batch=batch)
        asg = Assignment.objects.create(course=course, title="HW")
        for name in ("ASHA@x.com", "r100", "ravi@x.com", "Sam Lee", "Nobody"):
            Submission.objects.create(assignment=asg, student_name=name)

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        new = executor.loader.project_state(self.migrate_to).apps
        linked = {s.student_name: s.student_id for s in new.get_model("assignments", "Submission").objects.all()}
        self.assertEqual(linked["ASHA@x.com"], asha.pk)
        self.assertEqual(linked["r100"], asha.pk)
        self.assertEqual(linked["ravi@x.com"], ravi.pk)
        self.assertIsNone(linked["Sam Lee"])  # a name alone is ambiguous, so it stays unlinked
        self.assertIsNone(linked["Nobody"])
