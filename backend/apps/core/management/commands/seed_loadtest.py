"""Create fake data and sign-in tokens for a load test (deploy/loadtest/README.md).

This writes thousands of fake students into whatever database it points at, so it refuses to run unless you
confirm the database is a throw-away one:

    python manage.py seed_loadtest --students 2000 --output tokens.json --i-know-this-is-a-test-database
"""

import json
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.testing import default_section
from apps.accounts.views import _issue_token
from apps.classrooms.models import Classroom, Enrollment
from apps.exams.models import Exam, ExamChoice, ExamQuestion

PREFIX = "loadtest"


class Command(BaseCommand):
    help = "Seed fake students, a class and a published exam, and write sign-in tokens for the load test."

    def add_arguments(self, parser):
        parser.add_argument("--students", type=int, default=1000)
        parser.add_argument("--questions", type=int, default=60, help="Questions in the exam pool")
        parser.add_argument("--paper", type=int, default=20, help="Questions on each student's paper")
        parser.add_argument("--output", default="loadtest_tokens.json")
        parser.add_argument("--i-know-this-is-a-test-database", action="store_true", dest="confirmed")

    def handle(self, *args, **opts):
        if not opts["confirmed"]:
            raise CommandError("This creates fake users. Pass --i-know-this-is-a-test-database to confirm it is not real data.")
        if get_user_model().objects.exclude(email__startswith=PREFIX).filter(role="STUDENT").count() > 50:
            raise CommandError("This database already holds real-looking students. Use an empty test database.")

        User = get_user_model()
        section = default_section()
        teacher, _ = User.objects.get_or_create(
            email=f"{PREFIX}-teacher@example.com",
            defaults={"role": User.Role.TEACHER, "first_name": "Load", "last_name": "Teacher", "approval_status": User.ApprovalStatus.APPROVED, "is_profile_complete": True},
        )
        classroom, _ = Classroom.objects.get_or_create(
            subject_code="LOADTEST", defaults={"name": "Load test class", "teacher": teacher, "department": section.batch.program.department,
                                               "program": section.batch.program, "batch": section.batch, "section": section},
        )

        existing = User.objects.filter(email__startswith=f"{PREFIX}-s").count()
        new_students = [
            User(email=f"{PREFIX}-s{i}@example.com", role=User.Role.STUDENT, first_name="Student", last_name=str(i),
                 register_no=f"LT{i:06d}", is_profile_complete=True, approval_status=User.ApprovalStatus.APPROVED,
                 section=section, batch=section.batch, program=section.batch.program, department=section.batch.program.department)
            for i in range(existing, opts["students"])
        ]
        User.objects.bulk_create(new_students, batch_size=500)
        students = list(User.objects.filter(email__startswith=f"{PREFIX}-s").order_by("id")[: opts["students"]])
        have = set(Enrollment.objects.filter(classroom=classroom).values_list("student_id", flat=True))
        Enrollment.objects.bulk_create([Enrollment(classroom=classroom, student=s) for s in students if s.pk not in have], batch_size=500)

        exam = Exam.objects.filter(course=classroom, title="Load test exam").first()
        if exam is None:
            exam = Exam.objects.create(
                course=classroom, title="Load test exam", time_limit=60, attempts_allowed=1, randomize_questions=True,
                status=Exam.Status.PUBLISHED, pattern=[{"type": "mcq", "marks": 1, "count": opts["paper"]}],
            )
            for n in range(opts["questions"]):
                question = ExamQuestion.objects.create(exam=exam, question_text=f"Question {n}?", question_type="mcq", points=1, order=n)
                ExamChoice.objects.bulk_create([ExamChoice(question=question, choice_text=f"Option {c}", is_correct=(c == 0)) for c in range(4)])

        lifetime = timedelta(hours=6)
        tokens = {
            "exam_id": exam.pk,
            "teacher_token": _issue_token(teacher, teacher.role, "access", lifetime),
            "students": [{"id": s.pk, "token": _issue_token(s, s.role, "access", lifetime)} for s in students],
        }
        with open(opts["output"], "w", encoding="utf-8") as handle:
            json.dump(tokens, handle)
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(students)} students, exam {exam.pk} ({opts['questions']} questions, {opts['paper']} per paper). Tokens: {opts['output']} (valid 6 hours; treat the file as a secret)."
        ))
        if settings.DEBUG:
            self.stdout.write("Note: DEBUG is on; run the load test against a production-style stack for meaningful numbers.")
