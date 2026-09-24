from collections import defaultdict

from django.db.models import Avg, Count, Q

from apps.accounts.models import User
from apps.announcements.models import Announcement
from apps.appointments.models import Appointment
from apps.assignments.models import Assignment, Submission
from apps.calendar_app.models import CalendarEvent
from apps.classrooms.models import Classroom, Enrollment, Resource
from apps.exams.models import Exam, ExamAttempt
from apps.games.models import ChainAnswerGame
from apps.lessons.models import Lesson
from apps.reports.models import Report
from apps.slido.models import PresentationAssignment, SlidoPoll, SlidoSession
from apps.trello_app.models import TrelloBoard, TrelloCard
from apps.quizzes.models import Quiz


MAX_ITEMS = 100
MAX_CONTEXT_CHARS = 30000


def _is_admin(user):
    return user.role in (User.Role.MASTER_ADMIN, User.Role.CAMPUS_ADMIN)


def _clip(value, limit=280):
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else f"{text[:limit - 3]}..."


def _name_key(value):
    return " ".join((value or "").split()).casefold()


def _visible_classrooms(user):
    if _is_admin(user):
        return Classroom.objects.all()
    if user.role == User.Role.TEACHER:
        return Classroom.objects.filter(teacher=user)
    return Classroom.objects.filter(enrollments__student=user, enrollments__is_active=True).distinct()


def _visible_appointments(user):
    appointments = Appointment.objects.all()
    if _is_admin(user):
        return list(appointments[:MAX_ITEMS])
    if user.role == User.Role.TEACHER:
        teacher_name = _name_key(user.full_name)
        return [item for item in appointments if _name_key(item.teacher_name) == teacher_name][:MAX_ITEMS]
    return list(appointments.filter(student_email__iexact=user.email)[:MAX_ITEMS])


def _student_metrics(students, course_ids):
    assignment_grades = defaultdict(list)
    for row in Submission.objects.filter(
        assignment__course_id__in=course_ids,
        grade__isnull=False,
    ).values("student_name", "grade"):
        assignment_grades[_name_key(row["student_name"])].append(row["grade"])

    exam_scores = defaultdict(list)
    for row in ExamAttempt.objects.filter(
        exam__course_id__in=course_ids,
        score__isnull=False,
    ).values("student_id", "score"):
        exam_scores[row["student_id"]].append(row["score"])

    metrics = []
    for student in students:
        grades = assignment_grades.get(_name_key(student.full_name), [])
        grades.extend(assignment_grades.get(_name_key(student.email), []))
        scores = exam_scores.get(student.id, [])
        metrics.append(
            "- "
            f"{student.full_name} (id {student.register_no or student.id}): "
            f"courses enrolled {Enrollment.objects.filter(student=student, classroom_id__in=course_ids, is_active=True).count()}; "
            f"assignment average {round(sum(grades) / len(grades), 1) if grades else 'not graded'}; "
            f"exam average {round(sum(scores) / len(scores), 1) if scores else 'not attempted'}"
        )
    return metrics


def _course_context(classrooms):
    course_ids = [course.id for course in classrooms]
    lines = ["CLASSROOMS / COURSES"]
    if not classrooms:
        return lines, course_ids

    for classroom in classrooms[:MAX_ITEMS]:
        enrollment_count = Enrollment.objects.filter(
            classroom=classroom,
            is_active=True,
            student__role=User.Role.STUDENT,
        ).count()
        resources = Resource.objects.filter(
            course=classroom).values_list("name", flat=True)[:10]
        lines.append(
            "- "
            f"{classroom.name} ({classroom.subject_code}), course id {classroom.id}; "
            f"batch {classroom.batch.name if classroom.batch else 'not set'}; "
            f"students {enrollment_count}; description {_clip(classroom.description) or 'none'}; "
            f"resources {', '.join(name for name in resources if name) or 'none'}"
        )
    return lines, course_ids


def _build_platform_context(user):
    classrooms = list(
        _visible_classrooms(user)
        .select_related("teacher", "batch", "department", "program", "section")[:MAX_ITEMS]
    )
    course_ids = [course.id for course in classrooms]
    context = [
        "AUTHENTICATED EDUAI SUITE PLATFORM SNAPSHOT",
        f"User: {user.full_name}; email: {user.email}; role: {user.role}",
        "Only records accessible to this authenticated user are included below.",
        "Attendance is not stored as a verified platform record; do not infer it.",
        "",
    ]

    course_lines, course_ids = _course_context(classrooms)
    context.extend(course_lines)

    if user.role == User.Role.STUDENT:
        students = [user]
    else:
        students = list(
            User.objects.filter(
                enrollments__classroom_id__in=course_ids,
                enrollments__is_active=True,
                role=User.Role.STUDENT,
            ).distinct().order_by("last_name", "first_name")[:MAX_ITEMS]
        )
    context.append("\nSTUDENTS AND RECORDED PERFORMANCE")
    context.extend(_student_metrics(students, course_ids)
                   or ["- No enrolled students found."])

    assignments = Assignment.objects.filter(course_id__in=course_ids).select_related("course").annotate(
        submission_count=Count("submissions"),
        graded_count=Count("submissions", filter=Q(
            submissions__grade__isnull=False)),
        average_grade=Avg("submissions__grade"),
    )[:MAX_ITEMS]
    context.append("\nASSIGNMENTS AND SUBMISSIONS")
    context.extend([
        "- "
        f"{assignment.title or 'Untitled'} in {assignment.course.name}; "
        f"due {assignment.due_date or 'not set'}; max points {assignment.max_points}; "
        f"submissions {assignment.submission_count}; graded {assignment.graded_count}; "
        f"average grade {round(assignment.average_grade, 1) if assignment.average_grade is not None else 'not graded'}; "
        f"description {_clip(assignment.description) or 'none'}"
        for assignment in assignments
    ] or ["- No assignments found."])

    exams = Exam.objects.filter(course_id__in=course_ids).select_related("course").annotate(
        question_count=Count("questions"),
        attempt_count=Count("attempts"),
        submitted_count=Count("attempts", filter=Q(
            attempts__status="submitted")),
        average_score=Avg("attempts__score"),
    )[:MAX_ITEMS]
    context.append("\nEXAMS AND ASSESSMENT ACTIVITY")
    context.extend([
        "- "
        f"{exam.title or 'Untitled'} in {exam.course.name}; status {exam.status}; "
        f"questions {exam.question_count}; attempts {exam.attempt_count}; "
        f"submitted {exam.submitted_count}; average score {round(exam.average_score, 1) if exam.average_score is not None else 'not scored'}; "
        f"time limit {exam.time_limit} minutes"
        for exam in exams
    ] or ["- No exams found."])

    lessons = Lesson.objects.filter(
        course_id__in=course_ids).select_related("course")[:MAX_ITEMS]
    context.append("\nLESSONS AND TEACHING CONTENT")
    context.extend([
        "- "
        f"{lesson.title or lesson.topic or 'Untitled'} in {lesson.course.name}; "
        f"topic {_clip(lesson.topic) or 'not set'}; syllabus {_clip(lesson.syllabus_context) or 'not set'}; "
        f"posted {lesson.posted_at or 'not posted'}"
        for lesson in lessons
    ] or ["- No lessons found."])

    announcements = Announcement.objects.filter(
        course_id__in=course_ids).select_related("course")[:MAX_ITEMS]
    context.append("\nANNOUNCEMENTS")
    context.extend([
        "- "
        f"{announcement.title or 'Untitled'} in {announcement.course.name}; "
        f"pinned {announcement.pinned}; time {announcement.time or 'not set'}; "
        f"body {_clip(announcement.body, 500) or 'empty'}"
        for announcement in announcements
    ] or ["- No announcements found."])

    context.append("\nAPPOINTMENTS")
    appointments = _visible_appointments(user)
    context.extend([
        "- "
        f"status {appointment.status or 'not set'}; time {appointment.time_slot or 'not set'}; "
        f"teacher {appointment.teacher_name or 'not set'}; student {appointment.student_name or 'not set'}; "
        f"mode {appointment.meeting_mode or 'not set'}; agenda {_clip(appointment.agenda) or 'not set'}; "
        f"details {_clip(appointment.details) or 'none'}; notes {_clip(appointment.notes) or 'none'}"
        for appointment in appointments
    ] or ["- No appointment records found."])

    calendar_filter = Q(course_id__in=course_ids)
    if not _is_admin(user):
        calendar_filter |= Q(teacher_name__iexact=user.full_name)
    calendar_events = CalendarEvent.objects.filter(
        calendar_filter).order_by("start_time")[:MAX_ITEMS]
    context.append("\nCALENDAR EVENTS")
    context.extend([
        "- "
        f"{event.title}; type {event.event_type}; start {event.start_time or 'not set'}; "
        f"end {event.end_time or 'not set'}; location {event.location or 'not set'}; "
        f"description {_clip(event.description) or 'none'}"
        for event in calendar_events
    ] or ["- No calendar events found."])

    quiz_filter = {} if _is_admin(user) else {"teacher_id": user.id}
    quizzes = Quiz.objects.filter(
        **quiz_filter).annotate(question_count=Count("questions"))[:MAX_ITEMS]
    context.append("\nQUIZZES")
    context.extend([
        "- "
        f"{quiz.title or 'Untitled'}; status {'draft' if quiz.is_draft else 'published'}; "
        f"questions {quiz.question_count}; description {_clip(quiz.description) or 'none'}"
        for quiz in quizzes
    ] or ["- No quizzes found."])

    presentation_filter = {} if _is_admin(user) else {"teacher_id": user.id}
    presentations = PresentationAssignment.objects.filter(**presentation_filter).annotate(
        submission_count=Count("submissions"),
    )[:MAX_ITEMS]
    context.append("\nINTERACTIVE PRESENTATIONS")
    context.extend([
        "- "
        f"{item.title or 'Untitled'}; course id {item.course_id or 'not linked'}; status {item.status}; "
        f"deadline {item.deadline or 'not set'}; submissions {item.submission_count}; "
        f"description {_clip(item.description) or 'none'}"
        for item in presentations
    ] or ["- No interactive presentation assignments found."])

    slido_filter = {} if _is_admin(user) else {"teacher_id": user.id}
    sessions = SlidoSession.objects.filter(
        **slido_filter).select_related("assignment")[:MAX_ITEMS]
    session_ids = [session.id for session in sessions]
    polls = SlidoPoll.objects.filter(session_id__in=session_ids)[:MAX_ITEMS]
    context.append("\nLIVE SESSIONS AND POLLS")
    context.extend([
        "- "
        f"session {session.pin}; status {session.status}; assignment {session.assignment.title if session.assignment else 'none'}; "
        f"current slide {session.current_slide}"
        for session in sessions
    ] or ["- No live sessions found."])
    context.extend([
        "- Poll: "
        f"{_clip(poll.question)}; type {poll.poll_type}; active {poll.is_active}; responses {poll.total_responses}"
        for poll in polls
    ])

    game_filter = {} if _is_admin(user) else {"teacher_id": user.id}
    games = ChainAnswerGame.objects.filter(
        **game_filter).annotate(player_count=Count("players"))[:MAX_ITEMS]
    context.append("\nGAME STUDIO")
    context.extend([
        "- "
        f"{game.name}; subject {game.subject or 'not set'}; category {game.category or 'not set'}; "
        f"difficulty {game.difficulty_level}; status {game.status}; players {game.player_count}"
        for game in games
    ] or ["- No games found."])

    board_candidates = list(TrelloBoard.objects.all()[:MAX_ITEMS])
    if not _is_admin(user):
        board_candidates = [
            board for board in board_candidates
            if board.creator_email.casefold() == user.email.casefold()
            or any(str(member).casefold() in {user.email.casefold(), user.full_name.casefold()} for member in (board.members or []))
        ]
    board_ids = [board.id for board in board_candidates]
    cards = TrelloCard.objects.filter(board_id__in=board_ids)[:MAX_ITEMS]
    context.append("\nTRELLO WORKSPACES")
    context.extend([
        "- "
        f"board {board.name or board.id}; starred {board.starred}; members {len(board.members or [])}"
        for board in board_candidates
    ] or ["- No Trello boards found."])
    context.extend([
        "- Card: "
        f"{card.title or 'Untitled'}; board {card.board_id}; due {card.due_date or 'not set'}; "
        f"description {_clip(card.description) or 'none'}"
        for card in cards
    ])

    reports = Report.objects.filter(target_id__in=course_ids)[:MAX_ITEMS]
    context.append("\nREPORTS")
    context.extend([
        "- "
        f"{report.name or report.report_id or 'Untitled'}; type {report.type or 'not set'}; "
        f"status {report.status}; generated {report.generated_at}; content {_clip(report.content) or 'none'}"
        for report in reports
    ] or ["- No course reports found."])

    return "\n".join(context)[:MAX_CONTEXT_CHARS]
