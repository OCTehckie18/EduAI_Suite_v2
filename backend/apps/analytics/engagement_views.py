from rest_framework import status

from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.assignments.models import Assignment, Submission
from apps.exams.models import Exam, ExamAttempt
from apps.games.models import ChainAnswerGame, GamePlayer
from apps.core.models import StudentActivity
from apps.core.access import can_manage_course, is_master_admin, managed_courses, managed_students, visible_courses
from apps.core.permissions import IsTeacher
from apps.core.services import student_keys
from apps.quizzes.models import QuizPlayer


def _compute_engagement_level(score) -> str:
    if score is None:
        return "no_data"
    if score >= 80:
        return "excellent"
    elif score >= 65:
        return "good"
    elif score >= 50:
        return "needs_attention"
    else:
        return "at_risk"


def _generate_engagement_summary(student_name: str, data: dict) -> str:
    level = data["engagement_level"]
    score = data["engagement_score"]
    att = data["attendance"]
    comp = data["assignments"]["completion_rate"]
    if level == "no_data":
        return f"No submissions, exam attempts or game results are recorded for {student_name} in this class yet, so there is nothing to judge."

    attendance_text = f"{att}% attendance" if att is not None else "attendance data is unavailable"
    if level == "excellent":
        return f"{student_name} demonstrates outstanding academic engagement with a score of {score}/100, with {attendance_text} and a {comp}% assignment completion rate."
    elif level == "good":
        return f"{student_name} is performing well with an engagement score of {score}/100. {attendance_text.capitalize()} and assignment completion is at {comp}%."
    elif level == "needs_attention":
        return f"{student_name} requires monitoring with an engagement score of {score}/100. {attendance_text.capitalize()} and {comp}% of assignments are completed."
    else:
        return f"{student_name} is classified as at risk with an engagement score of {score}/100 ({comp}% of assignments completed). Academic support is advised."


class _ClassData:
    """Everything the engagement figures need for a set of students in one class, loaded in a few
    grouped queries. Loading per student instead costs a query per student per assignment."""

    def __init__(self, students, course_id):
        ids = [s.id for s in students]
        self.course_id = course_id
        self.assignments = list(Assignment.objects.filter(course_id=course_id).order_by("id"))
        self.submissions = {}  # (student_id, assignment_id) -> latest submission
        for sub in Submission.objects.filter(assignment__course_id=course_id, student_id__in=ids).order_by("id"):
            self.submissions[(sub.student_id, sub.assignment_id)] = sub
        self.attempts = {}
        for attempt in ExamAttempt.objects.filter(exam__course_id=course_id, student_id__in=ids).select_related("exam"):
            self.attempts.setdefault(attempt.student_id, []).append(attempt)
        self.game_players = {}
        for player in GamePlayer.objects.filter(student_id__in=ids).select_related("game"):
            self.game_players.setdefault(player.student_id, []).append(player)
        # Live quizzes are matched on the student's register number or account id, never the nickname.
        owner_of_key = {key: s.id for s in students for key in student_keys(s)}
        self.quiz_players = {}
        for qp in QuizPlayer.objects.filter(student_id__in=list(owner_of_key), session__is_test_run=False).select_related("session__quiz"):
            self.quiz_players.setdefault(owner_of_key[qp.student_id], []).append(qp)
        self.activities = {}
        for activity in StudentActivity.objects.filter(student_id__in=ids):
            self.activities.setdefault(activity.student_id, []).append(activity)


def _get_student_engagement(student: User, course_id, data: "_ClassData | None" = None):
    """One student's engagement in one class. Pass ``data`` (a _ClassData for the whole class) when
    computing many students, so the database is asked once for all of them."""
    data = data or _ClassData([student], course_id)

    # Assignments: only this one class's work is ever considered; there is no "any class" fallback.
    course_assignments = data.assignments
    total_assignments = len(course_assignments)

    submissions = []
    submitted_count = 0
    total_grade = 0.0
    graded_count = 0

    for asgn in course_assignments:
        sub = data.submissions.get((student.id, asgn.id))

        if sub:
            submitted_count += 1
            if sub.grade is not None:
                total_grade += sub.grade
                graded_count += 1
            submissions.append({
                "assignment_id": asgn.id,
                "assignment_title": asgn.title or "Untitled Assignment",
                "status": "submitted",
                "submitted_at": sub.submitted_at,
                "grade": sub.grade,
                "max_points": asgn.max_points,
            })
        else:
            submissions.append({
                "assignment_id": asgn.id,
                "assignment_title": asgn.title or "Untitled Assignment",
                "status": "pending",
                "submitted_at": None,
                "grade": None,
                "max_points": asgn.max_points,
            })

    assignment_completion = (
        (submitted_count / total_assignments) * 100.0) if total_assignments > 0 else None
    avg_grade = (total_grade / graded_count) if graded_count > 0 else None

    # Exams of this class only
    exam_attempts = data.attempts.get(student.id, [])

    exams_data = []
    total_exam_score = 0.0
    for attempt in exam_attempts:
        exams_data.append({
            "exam_id": attempt.exam_id,
            "exam_title": attempt.exam.title if attempt.exam else "Assessment",
            "score": attempt.score,
            "status": attempt.status,
            "start_time": attempt.start_time.isoformat() if attempt.start_time else None,
            "end_time": attempt.end_time.isoformat() if attempt.end_time else None,
        })
        if attempt.score is not None:
            total_exam_score += attempt.score

    avg_exam_score = (total_exam_score / len(exam_attempts)) if exam_attempts else None

    # Games
    games_data = []
    total_game_score = 0.0
    total_words_submitted = 0
    total_words_valid = 0

    for gp in data.game_players.get(student.id, []):
        game = gp.game
        games_data.append({
            "game_id": game.id,
            "game_name": game.name or "Game Session",
            "game_status": game.status,
            "score": gp.score,
            "words_submitted": gp.words_submitted,
            "words_valid": gp.words_valid,
            "player_status": gp.status,
        })
        total_game_score += gp.score
        total_words_submitted += gp.words_submitted
        total_words_valid += gp.words_valid

    for qp in data.quiz_players.get(student.id, []):
        games_data.append({
            "game_id": f"quiz-{qp.session_id}",
            "game_name": qp.session.quiz.title or "Quiz",
            "game_status": qp.session.status,
            "score": qp.score,
            "words_submitted": 0,
            "words_valid": 0,
            "player_status": "completed" if qp.session.status == "completed" else qp.session.status,
        })
        total_game_score += qp.score

    # Attendance is unavailable until attendance records are stored by the backend.
    attendance_pct = None

    # A student with nothing recorded has no score at all (not a score of 0 that reads as "critical").
    score_components = []
    if assignment_completion is not None:
        score_components.append((assignment_completion, 0.35))
    if avg_exam_score is not None:
        score_components.append((avg_exam_score, 0.25))
    if games_data:
        score_components.append((min(total_game_score, 100), 0.15))
    total_weight = sum(weight for _, weight in score_components)
    engagement_score = round(
        sum(value * weight for value, weight in score_components) / total_weight,
        1,
    ) if total_weight else None
    engagement_level = _compute_engagement_level(engagement_score)

    # Compact persisted events used by the classroom student profile.
    timeline = [
        {
            "type": activity.activity_type,
            "title": activity.title,
            "detail": (
                f"Score: {activity.score}"
                if activity.score is not None else activity.status
            ),
            "timestamp": activity.occurred_at,
            "icon": "activity",
        }
        for activity in data.activities.get(student.id, [])[:20]
    ]
    has_persisted_activity = bool(timeline)

    # Assignments still use the legacy submission table, so include them
    # alongside the compact event rows.
    for sub_data in submissions:
        if sub_data["status"] == "submitted" and sub_data["submitted_at"]:
            timeline.append({
                "type": "assignment_submission",
                "title": f"Submitted: {sub_data['assignment_title']}",
                "detail": f"Grade: {sub_data['grade']}" if sub_data['grade'] is not None else "Pending grading",
                "timestamp": sub_data["submitted_at"],
                "icon": "file-check",
            })

    # Backfill exam/game events for historical records that predate this table.
    if not has_persisted_activity:
        for exam_d in exams_data:
            timeline.append({
                "type": "exam_attempt",
                "title": f"Exam: {exam_d['exam_title']}",
                "detail": f"Score: {exam_d['score']}",
                "timestamp": exam_d["end_time"] or exam_d["start_time"],
                "icon": "clipboard-list",
            })

        for game_d in games_data:
            timeline.append({
                "type": "game_session",
                "title": f"Game: {game_d['game_name']}",
                "detail": f"Score: {game_d['score']} | Words: {game_d['words_valid']}/{game_d['words_submitted']}",
                "timestamp": None,
                "icon": "gamepad-2",
            })

    reg_no = student.register_no or f"REG-{student.id}"
    dept_name = student.department.name if student.department else "General"
    cls_name = student.section.name if student.section else (
        student.batch.name if student.batch else "")

    result = {
        "student_id": student.id,
        "name": student.full_name,
        "email": student.email,
        "registration_number": reg_no,
        "department": dept_name,
        "student_class": cls_name,
        "attendance": attendance_pct,
        "engagement_score": engagement_score,
        "engagement_level": engagement_level,
        "assignments": {
            "total": total_assignments,
            "submitted": submitted_count,
            "completion_rate": round(assignment_completion, 1) if assignment_completion is not None else None,
            "avg_grade": round(avg_grade, 1) if avg_grade is not None else None,
            "details": submissions,
        },
        "exams": {
            "total_attempts": len(exams_data),
            "avg_score": round(avg_exam_score, 1) if avg_exam_score is not None else None,
            "details": exams_data,
        },
        "games": {
            "sessions_played": len(games_data),
            "total_score": total_game_score,
            "total_words_submitted": total_words_submitted,
            "total_words_valid": total_words_valid,
            "details": games_data,
        },
        "timeline": timeline[:20],
    }
    result["engagement_summary"] = _generate_engagement_summary(
        student.full_name, result)
    return result


class CourseEngagementSummaryView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, course_id):
        classroom = Classroom.objects.filter(pk=course_id).first()
        if not classroom:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_course(request.user, classroom):
            return Response({"detail": "You can only view engagement for your own courses."}, status=status.HTTP_403_FORBIDDEN)

        students = list(User.objects.filter(
            enrollments__classroom=classroom,
            enrollments__is_active=True,
            role=User.Role.STUDENT
        ).select_related("department", "section", "batch").distinct())

        data = _ClassData(students, course_id)
        all_engagement = [_get_student_engagement(s, course_id, data) for s in students]

        total = len(all_engagement)
        scored = [e for e in all_engagement if e["engagement_score"] is not None]
        avg_engagement = round(sum(e["engagement_score"] for e in scored) / len(scored), 1) if scored else None
        attendance_values = [e["attendance"] for e in all_engagement if e["attendance"] is not None]
        avg_attendance = round(sum(attendance_values) / len(attendance_values), 1) if attendance_values else None
        completions = [e["assignments"]["completion_rate"] for e in all_engagement if e["assignments"]["completion_rate"] is not None]
        avg_assignment = round(sum(completions) / len(completions), 1) if completions else None
        at_risk = sum(1 for e in all_engagement if e["engagement_level"] == "at_risk")
        needs_attention = sum(1 for e in all_engagement if e["engagement_level"] == "needs_attention")

        # Students with no data go last, the rest highest score first.
        all_engagement.sort(key=lambda x: (x["engagement_score"] is None, -(x["engagement_score"] or 0)))

        return Response({
            "course_id": course_id,
            "course_name": classroom.name,
            "total_students": total,
            "class_avg_engagement": avg_engagement,
            "class_avg_attendance": avg_attendance,
            "class_avg_assignment_completion": avg_assignment,
            "at_risk_count": at_risk,
            "needs_attention_count": needs_attention,
            "students": all_engagement,
        })


class StudentEngagementProfileView(APIView):
    """One student's profile. A student sees only their own; a teacher only students in their own classes."""

    def get(self, request, student_id):
        user = request.user
        if user.role == User.Role.STUDENT:
            if user.pk != student_id:
                return Response({"detail": "You can only view your own engagement profile."}, status=status.HTTP_403_FORBIDDEN)
            courses = visible_courses(user)
        elif user.role == User.Role.TEACHER or is_master_admin(user):
            if not managed_students(user).filter(pk=student_id).exists():
                return Response({"detail": "That student is not in one of your classes."}, status=status.HTTP_403_FORBIDDEN)
            courses = managed_courses(user)
        else:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        student = User.objects.filter(pk=student_id).first()
        if not student:
            return Response({"detail": "Student not found"}, status=status.HTTP_404_NOT_FOUND)

        # The class to look at: the one asked for (if it is theirs and the student is in it), else the first shared one.
        shared = courses.filter(enrollments__student=student, enrollments__is_active=True).distinct()
        wanted = request.query_params.get("course_id")
        course = shared.filter(pk=wanted).first() if str(wanted or "").isdigit() else None
        course = course or shared.first()
        return Response(_get_student_engagement(student, course.pk if course else None))
