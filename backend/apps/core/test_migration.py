from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User
from apps.institution.models import Campus, School, Department, Program, Batch, Section
from apps.classrooms.models import Classroom


class MigrationSmokeTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Seed minimal institution hierarchy
        self.campus = Campus.objects.create(name="Central Campus", code="CEN", city="Bangalore")
        self.school = School.objects.create(name="School of Sciences", code="SOS", campus=self.campus)
        self.department = Department.objects.create(name="Computer Science", code="CS", school=self.school)
        self.program = Program.objects.create(
            name="MCA", code="MCA", department=self.department,
            degree_level=Program.DegreeLevel.PG, duration_years=2
        )
        self.batch = Batch.objects.create(
            name="2025-2027", program=self.program, start_year=2025, end_year=2027,
            academic_year="2025-2026"
        )
        self.section = Section.objects.create(name="A", batch=self.batch)

        self.teacher = User.objects.create_user(
            email="teacher@university.in",
            password="password123",
            first_name="Jane",
            last_name="Prof",
            role=User.Role.TEACHER,
        )

        self.course = Classroom.objects.create(
            name="Advanced Web Tech",
            subject_code="CS501",
            teacher=self.teacher,
            department=self.department,
            program=self.program,
            batch=self.batch,
            section=self.section,
        )
        self.client.force_authenticate(user=self.teacher)

    def test_root_and_health(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("EduAI Backend Running", res.json()["message"])

        res = self.client.get("/api/v1/health/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["status"], "healthy")

        res = self.client.get("/health")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_action_history(self):
        res = self.client.post("/api/v1/history/", {
            "feature": "test",
            "action": "smoke_test",
            "result": "success",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get("/api/v1/history/?feature=test")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()), 1)

    def test_announcements(self):
        res = self.client.post(f"/api/v1/announcements/{self.course.id}", {
            "title": "Welcome Announcement",
            "body": "Class starts Monday.",
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get(f"/api/v1/announcements/{self.course.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["title"], "Welcome Announcement")

    def test_assignments_and_submissions(self):
        res = self.client.post(f"/api/v1/assignments/{self.course.id}", {
            "title": "Assignment 1",
            "description": "Build a Django API",
            "due_date": "2026-09-15T23:59",
            "max_points": 100,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        asgn_id = res.json()["id"]

        # List assignments
        res = self.client.get(f"/api/v1/assignments/{self.course.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()), 1)

        # A student enrolled in the course submits under their own name
        from apps.classrooms.models import Enrollment
        alice = User.objects.create_user(
            email="alice@university.in", first_name="Alice", last_name="Smith", role=User.Role.STUDENT,
        )
        Enrollment.objects.create(classroom=self.course, student=alice)
        self.client.force_authenticate(user=alice)
        res = self.client.post(f"/api/v1/submissions/{asgn_id}", {"student_name": "Someone Else"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.json()["student_name"], "Alice Smith")
        sub_id = res.json()["id"]

        # Grade submission (teacher)
        self.client.force_authenticate(user=self.teacher)
        res = self.client.put(f"/api/v1/submissions/grade/{sub_id}", {
            "grade": 95.0,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["grade"], 95.0)

    def test_appointments(self):
        student = User.objects.create_user(
            email="bob@cs.university.in", password="password123", first_name="Bob", last_name="Student",
            role=User.Role.STUDENT,
        )
        self.client.force_authenticate(user=student)
        res = self.client.post("/api/v1/appointments/", {
            "student_name": "Bob Student",
            "student_email": "bob@cs.university.in",
            "teacher_name": self.teacher.full_name,
            "agenda": "Project Discussion",
            "time_slot": "2026-09-10 14:00",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        appt_id = res.json()["id"]

        self.client.force_authenticate(user=self.teacher)
        # Update status
        res = self.client.patch(f"/api/v1/appointments/{appt_id}/status", {
            "status": "approved",
            "notes": "See you in lab 3",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["status"], "approved")

    def test_lessons(self):
        res = self.client.post("/api/v1/lessons/", {
            "course_id": self.course.id,
            "topic": "Django Architecture",
            "title": "Django Deep Dive",
            "lecture_flow": "1. Models 2. Views 3. URLs",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        lesson_id = res.json()["id"]

        # Post lesson
        res = self.client.post(f"/api/v1/lessons/{lesson_id}/post")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.json()["posted_at"])

    def test_exams(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.post("/api/v1/exams/", {
            "course_id": self.course.id,
            "title": "Midterm Exam",
            "time_limit": 45,
            "questions": [
                {
                    "question_text": "What is Django?",
                    "choices": [
                        {"choice_text": "Web framework", "is_correct": True},
                        {"choice_text": "CSS library", "is_correct": False},
                    ],
                }
            ],
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        exam_id = res.json()["id"]

        res = self.client.get("/api/v1/exams/stats")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res.json()["total_exams"], 1)

    def test_calendar(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.post("/api/v1/calendar/events", {
            "title": "Faculty Meeting",
            "start_time": "2026-09-12T10:00:00Z",
            "end_time": "2026-09-12T11:00:00Z",
            "event_type": "meeting",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get("/api/v1/calendar/events")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.json()) >= 1)

    def test_mail(self):
        res = self.client.post("/api/v1/mail/drafts", {
            "subject": "Midterm Reminder",
            "body": "Don't forget the midterm exam on Friday.",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get("/api/v1/mail/drafts")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_reports(self):
        res = self.client.post("/api/v1/reports/generate", {
            "type": "Class Report",
            "target_id": self.course.id,
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get("/api/v1/reports/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_analytics_and_dashboard(self):
        res = self.client.get("/api/v1/dashboard/summary")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()["classrooms"]), 1)

        res = self.client.get("/api/v1/analytics/risk-global")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_games(self):
        res = self.client.post("/api/v1/games/chain-answer", {
            "name": "Science Word Chain",
            "subject": "science",
            "starting_word": "atom",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        session_id = res.json()["session_id"]

        # Students join as themselves: the account comes from the login, not from the request body.
        from apps.classrooms.models import Enrollment
        student = User.objects.create_user(email="player1@university.in", password="x", role=User.Role.STUDENT, first_name="Player", last_name="One")
        Enrollment.objects.create(classroom=self.course, student=student)
        self.client.force_authenticate(user=student)
        res = self.client.post(f"/api/v1/games/chain-answer/{session_id}/join", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.json()["name"], "Player One")

    def test_quizzes(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.post("/api/v1/quizzes/", {
            "title": "Python Basics",
            "questions": [
                {
                    "question_text": "Is Python interpreted?",
                    "options": [
                        {"option_text": "Yes", "is_correct": True},
                        {"option_text": "No", "is_correct": False},
                    ],
                }
            ],
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        quiz_id = res.json()["id"]

        res = self.client.post(f"/api/v1/quizzes/{quiz_id}/host")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        pin = res.json()["pin"]

        res = self.client.get(f"/api/v1/quizzes/session/{pin}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_slido(self):
        res = self.client.post("/api/v1/slido/sessions", {
            "teacher_id": self.teacher.id,
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        pin = res.json()["pin"]

        res = self.client.post(f"/api/v1/slido/sessions/{pin}/polls", {
            "question": "How clear is today's topic?",
            "poll_type": "multiple_choice",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_omr(self):
        res = self.client.post("/api/v1/omr/jobs", {
            "title": "Final OMR Exam",
            "num_questions": 3,
            "answer_key": {"1": "A", "2": "C", "3": "D"},
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        job_id = res.json()["id"]

        res = self.client.get(f"/api/v1/omr/jobs/{job_id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_trello(self):
        res = self.client.post("/api/v1/trello/board", {
            "name": "Sprint 1 Board",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        board_id = res.json()["id"]

        res = self.client.get(f"/api/v1/trello/board/{board_id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()["columns"]), 3)

    def test_ai_chat(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.post("/api/v1/ai/chat", {
            "message": "Hello!",
            "history": [],
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("content", res.json())

    def test_dashboard_routes(self):
        endpoints = [
            "/api/v1/dashboard/summary",
            "/api/v1/dashboard/summary?teacher_name=Jane%20Prof",
        ]
        for ep in endpoints:
            res = self.client.get(ep)
            self.assertEqual(res.status_code, status.HTTP_200_OK, f"Endpoint {ep} failed with {res.status_code}")

        # The list of every class with its join code no longer exists.
        self.assertEqual(self.client.get("/api/v1/dashboard/discoverable-classrooms").status_code, status.HTTP_404_NOT_FOUND)

        # The student dashboard belongs to students (covered in analytics.test_student_summary).
        self.assertEqual(self.client.get("/api/v1/dashboard/student-summary").status_code, status.HTTP_403_FORBIDDEN)

        # Check expected payload keys for TeacherBuddy dashboard
        summary_res = self.client.get("/api/v1/dashboard/summary?teacher_name=Jane%20Prof")
        self.assertEqual(summary_res.status_code, status.HTTP_200_OK)
        data = summary_res.json()
        expected_keys = [
            "stats", "classrooms", "riskAlerts", "recentActivity", "schedule",
            "pendingAppointments", "recentReports", "mailStats", "upcomingExams",
            "engagementSnapshot", "calendarEventsThisWeek"
        ]
        for key in expected_keys:
            self.assertIn(key, data, f"Missing key '{key}' in dashboard summary response")

    def test_student_crud_and_engagement(self):
        from apps.accounts.testing import admit
        admit("karan@example.edu", "REG-101", name="Karan Singhania")
        admit("meera@example.edu", "REG-103", name="Meera Sen")
        # 1. Manual Enroll
        res = self.client.post(f"/api/v1/students/{self.course.id}", {
            "name": "Karan Singhania",
            "email": "karan@example.edu",
            "registration_number": "REG-101",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        student_id = res.json()["id"]

        # 2. Get students in course
        res = self.client.get(f"/api/v1/students/{self.course.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(any(s["id"] == student_id for s in res.json()))

        # 3. Get all students
        res = self.client.get("/api/v1/students/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.json()) >= 1)

        # 4. Detail & Update
        res = self.client.get(f"/api/v1/students/detail/{student_id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["name"], "Karan Singhania")

        res = self.client.put(f"/api/v1/students/detail/{student_id}", {
            "name": "Karan Singhania Updated",
            "registration_number": "REG-101",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["name"], "Karan Singhania Updated")

        # 5. Enroll via code
        res = self.client.post(f"/api/v1/students/enroll/code?enrollment_code={self.course.enrollment_code}", {
            "name": "Meera Sen",
            "email": "meera@example.edu",
            "registration_number": "REG-103",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        meera_id = res.json()["id"]

        # 6. Active students
        res = self.client.get(f"/api/v1/students/{self.course.id}/active")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 7. Engagement summary & profile
        res = self.client.get(f"/api/v1/engagement/{self.course.id}/summary")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("students", res.json())
        self.assertIn("class_avg_engagement", res.json())

        res = self.client.get(f"/api/v1/engagement/student/{student_id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("engagement_score", res.json())
        self.assertIn("assignments", res.json())

        # 8. Delete student
        res = self.client.delete(f"/api/v1/students/{student_id}")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)


