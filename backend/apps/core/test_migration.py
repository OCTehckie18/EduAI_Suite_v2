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
        res = self.client.post("/history/", {
            "feature": "test",
            "action": "smoke_test",
            "result": "success",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get("/history/?feature=test")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()), 1)

    def test_announcements(self):
        res = self.client.post(f"/announcements/{self.course.id}", {
            "title": "Welcome Announcement",
            "body": "Class starts Monday.",
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get(f"/announcements/{self.course.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["title"], "Welcome Announcement")

    def test_assignments_and_submissions(self):
        res = self.client.post(f"/assignments/{self.course.id}", {
            "title": "Assignment 1",
            "description": "Build a Django API",
            "due_date": "2026-09-15T23:59",
            "max_points": 100,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        asgn_id = res.json()["id"]

        # List assignments
        res = self.client.get(f"/assignments/{self.course.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()), 1)

        # Create submission
        res = self.client.post(f"/submissions/{asgn_id}", {
            "student_name": "Alice Smith",
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sub_id = res.json()["id"]

        # Grade submission
        res = self.client.put(f"/submissions/grade/{sub_id}", {
            "grade": 95.0,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["grade"], 95.0)

    def test_appointments(self):
        res = self.client.post("/appointments/", {
            "student_name": "Bob Student",
            "student_email": "bob@cs.university.in",
            "teacher_name": self.teacher.full_name,
            "agenda": "Project Discussion",
            "time_slot": "2026-09-10 14:00",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        appt_id = res.json()["id"]

        # Update status
        res = self.client.patch(f"/appointments/{appt_id}/status", {
            "status": "accepted",
            "notes": "See you in lab 3",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["status"], "accepted")

    def test_lessons(self):
        res = self.client.post("/lessons/", {
            "course_id": self.course.id,
            "topic": "Django Architecture",
            "title": "Django Deep Dive",
            "lecture_flow": "1. Models 2. Views 3. URLs",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        lesson_id = res.json()["id"]

        # Post lesson
        res = self.client.post(f"/lessons/{lesson_id}/post")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.json()["posted_at"])

    def test_exams(self):
        res = self.client.post("/exams/", {
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

        res = self.client.get("/exams/stats")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res.json()["total_exams"], 1)

    def test_calendar(self):
        res = self.client.post("/calendar/events", {
            "title": "Faculty Meeting",
            "start_time": "2026-09-12T10:00:00Z",
            "end_time": "2026-09-12T11:00:00Z",
            "event_type": "meeting",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get("/calendar/events")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.json()) >= 1)

    def test_mail(self):
        res = self.client.post("/mail/drafts", {
            "subject": "Midterm Reminder",
            "body": "Don't forget the midterm exam on Friday.",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get("/mail/drafts")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_reports(self):
        res = self.client.post("/reports/generate", {
            "type": "Class Report",
            "target_id": self.course.id,
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get("/reports/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_analytics_and_dashboard(self):
        res = self.client.get("/dashboard/summary")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["total_courses"], 1)

        res = self.client.get("/analytics/risk-global")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_games(self):
        res = self.client.post("/games/chain-answer", {
            "name": "Science Word Chain",
            "subject": "science",
            "starting_word": "atom",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        session_id = res.json()["session_id"]

        res = self.client.post(f"/games/chain-answer/{session_id}/join", {
            "name": "Player 1",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_quizzes(self):
        res = self.client.post("/quizzes/", {
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

        res = self.client.post(f"/quizzes/{quiz_id}/host")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        pin = res.json()["pin"]

        res = self.client.get(f"/quizzes/session/{pin}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_slido(self):
        res = self.client.post("/slido/sessions", {
            "teacher_id": self.teacher.id,
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        pin = res.json()["pin"]

        res = self.client.post(f"/slido/sessions/{pin}/polls", {
            "question": "How clear is today's topic?",
            "poll_type": "multiple_choice",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_omr(self):
        res = self.client.post("/omr/jobs", {
            "title": "Final OMR Exam",
            "answer_key": {"1": "A", "2": "C", "3": "D"},
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        job_id = res.json()["id"]

        res = self.client.get(f"/omr/jobs/{job_id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_trello(self):
        res = self.client.post("/trello/board", {
            "name": "Sprint 1 Board",
            "creator_email": self.teacher.email,
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        board_id = res.json()["id"]

        res = self.client.get(f"/trello/board/{board_id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()["columns"]), 3)

    def test_ai_chat(self):
        res = self.client.post("/ai/chat", {
            "message": "Hello!",
            "history": [],
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("content", res.json())

    def test_dashboard_routes(self):
        endpoints = [
            "/api/v1/api/dashboard/summary",
            "/api/v1/dashboard/summary",
            "/api/dashboard/summary",
            "/dashboard/summary",
            "/api/v1/api/dashboard/summary?teacher_name=Jane%20Prof",
            "/api/v1/api/dashboard/discoverable-classrooms",
            "/api/v1/api/dashboard/student-summary?student_name=Aarav",
        ]
        for ep in endpoints:
            res = self.client.get(ep)
            self.assertEqual(res.status_code, status.HTTP_200_OK, f"Endpoint {ep} failed with {res.status_code}")

        # Check expected payload keys for TeacherBuddy dashboard
        summary_res = self.client.get("/api/v1/api/dashboard/summary?teacher_name=Jane%20Prof")
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
        # 1. Manual Enroll
        res = self.client.post(f"/students/{self.course.id}", {
            "name": "Karan Singhania",
            "email": "karan@christuniversity.in",
            "registration_number": "REG-101",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        student_id = res.json()["id"]

        # 2. Get students in course
        res = self.client.get(f"/students/{self.course.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(any(s["id"] == student_id for s in res.json()))

        # 3. Get all students
        res = self.client.get("/students/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.json()) >= 1)

        # 4. Detail & Update
        res = self.client.get(f"/students/detail/{student_id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["name"], "Karan Singhania")

        res = self.client.put(f"/students/detail/{student_id}", {
            "name": "Karan Singhania Updated",
            "registration_number": "REG-102",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["name"], "Karan Singhania Updated")

        # 5. Enroll via code
        res = self.client.post(f"/students/enroll/code?enrollment_code={self.course.enrollment_code}", {
            "name": "Meera Sen",
            "email": "meera@christuniversity.in",
            "registration_number": "REG-103",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        meera_id = res.json()["id"]

        # 6. Active students
        res = self.client.get(f"/students/{self.course.id}/active")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 7. Engagement summary & profile
        res = self.client.get(f"/engagement/{self.course.id}/summary")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("students", res.json())
        self.assertIn("class_avg_engagement", res.json())

        res = self.client.get(f"/engagement/student/{student_id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("engagement_score", res.json())
        self.assertIn("assignments", res.json())

        # 8. Delete student
        res = self.client.delete(f"/students/{student_id}")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)


