from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.assignments.models import Assignment, Submission
from apps.exams.models import Exam, ExamAttempt
from apps.games.models import ChainAnswerGame, GamePlayer


def _compute_engagement_level(score: float) -> str:
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

    attendance_text = f"{att}% attendance" if att is not None else "attendance data is unavailable"
    if level == "excellent":
        return f"{student_name} demonstrates outstanding academic engagement with a score of {score}/100, with {attendance_text} and a {comp}% assignment completion rate."
    elif level == "good":
        return f"{student_name} is performing well with an engagement score of {score}/100. {attendance_text.capitalize()} and assignment completion is at {comp}%."
    elif level == "needs_attention":
        return f"{student_name} requires monitoring with an engagement score of {score}/100. Attendance is at {att}% and {comp}% assignments are completed."
    else:
        return f"CRITICAL: {student_name} is classified as at-risk with an engagement score of {score}/100. Immediate academic intervention is advised."


def _get_student_engagement(student: User, course_id: int):
    # Assignments
    course_assignments = Assignment.objects.filter(
        course_id=course_id) if course_id else Assignment.objects.all()[:10]
    total_assignments = course_assignments.count()

    submissions = []
    submitted_count = 0
    total_grade = 0.0
    graded_count = 0

    for asgn in course_assignments:
        sub = Submission.objects.filter(
            assignment=asgn,
        ).filter(
            Q(student_name__iexact=student.full_name) |
            Q(student_name__iexact=student.email) |
            Q(student_name__iexact=student.first_name)
        ).order_by("-id").first()

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
        (submitted_count / total_assignments) * 100.0) if total_assignments > 0 else 0.0
    avg_grade = (total_grade / graded_count) if graded_count > 0 else None

    # Exams
    course_exams = Exam.objects.filter(
        course_id=course_id) if course_id else Exam.objects.all()[:5]
    exam_attempts = ExamAttempt.objects.filter(
        exam__in=course_exams,
        student_id=student.id
    )
    if not exam_attempts.exists():
        exam_attempts = ExamAttempt.objects.filter(student_id=student.id)

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

    avg_exam_score = (total_exam_score / len(exam_attempts)
                      ) if exam_attempts.exists() else None

    # Games
    game_players = GamePlayer.objects.filter(
        Q(student_id=str(student.id)) | Q(name__iexact=student.full_name)
    )
    games_data = []
    total_game_score = 0.0
    total_words_submitted = 0
    total_words_valid = 0

    for gp in game_players:
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

    # Attendance is unavailable until attendance records are stored by the backend.
    attendance_pct = None

    assignment_score_pct = assignment_completion
    score_components = [(assignment_score_pct, 0.35)]
    if avg_exam_score is not None:
        score_components.append((avg_exam_score, 0.25))
    if games_data:
        score_components.append((min(total_game_score, 100), 0.15))
    total_weight = sum(weight for _, weight in score_components)
    engagement_score = round(
        sum(value * weight for value, weight in score_components) / total_weight,
        1,
    ) if total_weight else 0.0
    engagement_level = _compute_engagement_level(engagement_score)

    # Activity Timeline
    timeline = []
    for sub_data in submissions:
        if sub_data["status"] == "submitted" and sub_data["submitted_at"]:
            timeline.append({
                "type": "assignment_submission",
                "title": f"Submitted: {sub_data['assignment_title']}",
                "detail": f"Grade: {sub_data['grade']}" if sub_data['grade'] is not None else "Pending grading",
                "timestamp": sub_data["submitted_at"],
                "icon": "file-check",
            })

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
        student.batch.name if student.batch else "Batch A")

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
            "completion_rate": round(assignment_completion, 1),
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
    permission_classes = [AllowAny]

    def get(self, request, course_id):
        classroom = Classroom.objects.filter(pk=course_id).first()
        if not classroom:
            return Response({"detail": "Course not found"}, status=status.HTTP_404_NOT_FOUND)

        students = list(User.objects.filter(
            enrollments__classroom=classroom,
            enrollments__is_active=True,
            role=User.Role.STUDENT
        ).distinct())

        if not students:
            all_students = list(User.objects.filter(
                role=User.Role.STUDENT)[:5])
            if all_students:
                students = all_students

        all_engagement = []
        for s in students:
            eng = _get_student_engagement(s, course_id)
            all_engagement.append(eng)

        total = len(all_engagement)
        avg_engagement = round(sum(
            e["engagement_score"] for e in all_engagement) / total, 1) if total > 0 else 0.0
        attendance_values = [
            e["attendance"] for e in all_engagement
            if e["attendance"] is not None
        ]
        avg_attendance = round(
            sum(attendance_values) / len(attendance_values), 1
        ) if attendance_values else 0.0
        avg_assignment = round(sum(e["assignments"]["completion_rate"]
                               for e in all_engagement) / total, 1) if total > 0 else 0.0
        at_risk = sum(
            1 for e in all_engagement if e["engagement_level"] == "at_risk")
        needs_attention = sum(
            1 for e in all_engagement if e["engagement_level"] == "needs_attention")

        all_engagement.sort(key=lambda x: x["engagement_score"], reverse=True)

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
    permission_classes = [AllowAny]

    def get(self, request, student_id):
        student = User.objects.filter(pk=student_id).first()
        if not student:
            return Response({"detail": "Student not found"}, status=status.HTTP_404_NOT_FOUND)

        enrollment = Enrollment.objects.filter(
            student=student, is_active=True).first()
        course_id = enrollment.classroom_id if enrollment else 0

        return Response(_get_student_engagement(student, course_id))
