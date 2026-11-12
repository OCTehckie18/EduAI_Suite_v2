"""Report content built from real records.

A report's ``content`` is plain text with a tiny markup: ``# Heading``, ``## Subheading``, ``- bullet`` and
``**bold**``. The same text is shown on screen, emailed, and turned into a Word document. Anything the
platform does not record (attendance) is stated as "Not recorded" instead of being invented.
"""

import io
import logging
import re
from datetime import datetime

from django.utils import timezone

from apps.assignments.models import Assignment, Submission
from apps.assignments.stats import average_by_student, course_average
from apps.classrooms.models import Enrollment
from apps.exams.models import Exam, ExamAttempt

logger = logging.getLogger(__name__)

NOT_RECORDED = "Not recorded"
LOW_SCORE = 60
STRONG_SCORE = 75


def _pct(value):
    """A percentage, with the university's grade beside it when it uses letters or grade points."""
    if value is None:
        return NOT_RECORDED
    from apps.institution import academic

    grading = academic.current()["grading"]
    grade = academic.grade_for(value, grading) if grading["scale"] != "percentage" else None
    return f"{value}% ({grade['label']})" if grade and grade["label"] else f"{value}%"


def _stamp():
    return timezone.localtime().strftime("%d %b %Y, %I:%M %p")


def build_class_report(classroom):
    enrolled = list(
        Enrollment.objects.filter(classroom=classroom, is_active=True, student__role="STUDENT").select_related("student")
    )
    students = {e.student_id: e.student for e in enrolled}
    averages = average_by_student(list(students), [classroom.pk])
    assignments = list(Assignment.objects.filter(course=classroom).order_by("created_at"))
    exams = list(Exam.objects.filter(course=classroom).order_by("created_at"))

    lines = [
        f"# Class Report: {classroom.name}",
        f"**Course:** {classroom.subject_code} - {classroom.name}",
        f"**Teacher:** {classroom.teacher.full_name if classroom.teacher else NOT_RECORDED}",
        f"**Generated:** {_stamp()}",
        "",
        "## Overview",
        f"- Students enrolled: {len(students)}",
        f"- Assignments set: {len(assignments)}",
        f"- Exams: {len(exams)}",
        f"- Class average (graded work): {_pct(course_average([classroom.pk], list(students)))}",
        f"- Attendance: {NOT_RECORDED}",
        "",
        "## Assignments",
    ]
    if not assignments:
        lines.append("- No assignments have been set yet.")
    for asg in assignments:
        subs = list(Submission.objects.filter(assignment=asg, student_id__in=list(students)))
        graded = [s.grade for s in subs if s.grade is not None]
        mean = round(100 * sum(graded) / (len(graded) * asg.max_points), 1) if graded and asg.max_points else None
        lines.append(f"- {asg.title or 'Untitled'}: {len(subs)} of {len(students)} submitted, {len(graded)} graded, average {_pct(mean)}")

    lines += ["", "## Exams"]
    if not exams:
        lines.append("- No exams have been set yet.")
    for exam in exams:
        attempts = list(ExamAttempt.objects.filter(exam=exam))
        done = [a.score for a in attempts if a.status == "submitted" and a.score is not None]
        flagged = sum(1 for a in attempts if a.status == "flagged")
        waiting = sum(1 for a in attempts if a.status == "pending_review")
        mean = round(sum(done) / len(done), 1) if done else None
        extra = f", {flagged} flagged for leaving the exam" if flagged else ""
        if waiting:
            extra += f", {waiting} awaiting marking"
        lines.append(f"- {exam.title or 'Untitled'}: {len(done)} completed, average {_pct(mean)}{extra}")

    ranked = sorted(averages.items(), key=lambda pair: pair[1])
    support = [(sid, avg) for sid, avg in ranked if avg < LOW_SCORE]
    top = sorted(averages.items(), key=lambda pair: -pair[1])[:3]
    lines += ["", "## Students who need support (average below 60%)"]
    lines += [f"- {students[sid].full_name}: {avg}%" for sid, avg in support] or ["- None, or no marks recorded yet."]
    lines += ["", "## Top performers"]
    lines += [f"- {students[sid].full_name}: {avg}%" for sid, avg in top] or ["- No graded work yet."]
    ungraded = [s.full_name for sid, s in students.items() if sid not in averages]
    if ungraded:
        lines += ["", "## No marks recorded yet", "- " + ", ".join(sorted(ungraded))]
    return f"Class Report - {classroom.name}", "\n".join(lines)


def build_student_report(student, courses):
    """``courses``: the classrooms (already limited to the requesting teacher's) this student is in."""
    course_ids = [c.pk for c in courses]
    overall = average_by_student([student.pk], course_ids).get(student.pk)
    lines = [
        f"# Student Report: {student.full_name}",
        f"**Register number:** {student.register_no or NOT_RECORDED}",
        f"**Email:** {student.email}",
        f"**Generated:** {_stamp()}",
        "",
        "## Overview",
        f"- Overall average (graded work): {_pct(overall)}",
        f"- Attendance: {NOT_RECORDED}",
        "",
        "## Courses",
    ]
    strengths, weaknesses = [], []
    for course in courses:
        assignments = list(Assignment.objects.filter(course=course))
        submitted = Submission.objects.filter(assignment__in=assignments, student=student).count() if assignments else 0
        average = average_by_student([student.pk], [course.pk]).get(student.pk)
        lines.append(f"- {course.name} ({course.subject_code}): {submitted} of {len(assignments)} assignments submitted, average {_pct(average)}")
        if average is not None and average >= STRONG_SCORE:
            strengths.append(f"{course.name} ({average}%)")
        elif average is not None and average < LOW_SCORE:
            weaknesses.append(f"{course.name} ({average}%)")
    if not courses:
        lines.append("- Not enrolled in any of your courses.")

    lines += ["", "## Exams"]
    attempts = ExamAttempt.objects.filter(student_id=student.pk, exam__course_id__in=course_ids).select_related("exam").order_by("start_time")
    if not attempts:
        lines.append("- No exam attempts yet.")
    for attempt in attempts:
        if attempt.status == "submitted":
            result = _pct(attempt.score)
        elif attempt.status == "flagged":
            result = f"Flagged for leaving the exam ({attempt.flag_reason or 'no reason recorded'}); scored 0%"
        elif attempt.status == "pending_review":
            result = "Awaiting marking"
        elif attempt.status == "expired":
            result = "Timed out without a score"
        else:
            result = "In progress"
        lines.append(f"- {attempt.exam.title or 'Untitled'}: {result}")

    lines += ["", "## Strengths"]
    lines += [f"- {item}" for item in strengths] or ["- No course above 75% yet."]
    lines += ["", "## Areas to improve"]
    lines += [f"- {item}" for item in weaknesses] or ["- No course below 60%."]
    return f"Student Report - {student.full_name}", "\n".join(lines)


# ---------------------------------------------------------------- event reports
EVENT_FIELDS = [
    ("activity_type", "Activity type"),
    ("title", "Title"),
    ("date", "Date"),
    ("time", "Time"),
    ("venue", "Venue"),
    ("guests", "Guests / resource persons"),
    ("participants", "Participants"),
    ("highlights", "Highlights"),
    ("takeaways", "Key takeaways"),
    ("feedback", "Feedback"),
    ("follow_up", "Follow-up actions"),
]
_ALIASES = {
    "activity_type": ["activity type", "type", "event type", "activity"],
    "title": ["title", "event", "event title", "meeting", "topic", "subject", "name"],
    "date": ["date", "on"],
    "time": ["time", "timing"],
    "venue": ["venue", "location", "place"],
    "guests": ["guests", "guest", "chief guest", "resource person", "resource persons", "speaker", "speakers"],
    "participants": ["participants", "attendees", "audience", "participant"],
    "highlights": ["highlights", "summary", "agenda", "discussion"],
    "takeaways": ["takeaways", "key takeaways", "outcomes", "learnings", "conclusion"],
    "feedback": ["feedback", "remarks"],
    "follow_up": ["follow up", "follow-up", "follow up actions", "next steps", "action items", "actions"],
}


def extract_event_fields(notes):
    """Read ``Label: value`` lines from the notes. Fields that are not there stay empty."""
    lookup = {alias: key for key, aliases in _ALIASES.items() for alias in aliases}
    found, current = {}, None
    for raw in notes.splitlines():
        line = raw.strip()
        if not line:
            continue
        match = re.match(r"^[-*\s]*([A-Za-z][A-Za-z /-]{1,30}?)\s*[:\-–]\s*(.*)$", line)
        label = match.group(1).strip().lower() if match else ""
        if match and label in lookup:
            current = lookup[label]
            found[current] = match.group(2).strip()
        elif current and not match:
            found[current] = (found[current] + " " + line).strip()  # a wrapped continuation line
    return {key: value for key, value in found.items() if value}


def build_event_report(notes, *, extra=None, ai_client=None, ai_model=None):
    fields = extract_event_fields(notes)
    if ai_client is not None:
        try:
            import json

            prompt = (
                "From these event or meeting notes extract only what is stated, as JSON with the keys "
                + ", ".join(k for k, _ in EVENT_FIELDS)
                + ". Use an empty string for anything the notes do not say. Do not invent details.\n\n"
                + notes[:8000]
            )
            reply = ai_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}], model=ai_model, temperature=0.1,
                response_format={"type": "json_object"},
            )
            data = json.loads(reply.choices[0].message.content)
            for key, _ in EVENT_FIELDS:
                value = str(data.get(key) or "").strip()
                if value and key not in fields:
                    fields[key] = value
        except Exception as exc:  # the notes-based result is still usable
            logger.warning("AI event extraction failed: %s", exc)

    missing = [key for key, _ in EVENT_FIELDS if key not in fields]
    title = fields.get("title") or "Event Report"
    lines = [f"# {title}", f"**Generated:** {_stamp()}"]
    if extra:
        lines += [f"**Prepared in connection with:** {extra}"]
    lines.append("")
    for key, label in EVENT_FIELDS:
        if key == "title":
            continue
        lines.append(f"**{label}:** {fields.get(key) or '(to be completed by the teacher)'}")
    lines += ["", "## Notes as provided", *[line for line in notes.strip().splitlines()]]
    return title, "\n".join(lines), missing


# ---------------------------------------------------------------- Word output
def render_docx(name, content):
    from docx import Document

    document = Document()
    document.core_properties.title = name[:250]
    for raw in content.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("# "):
            document.add_heading(line[2:].strip(), level=1)
            continue
        if line.startswith("## "):
            document.add_heading(line[3:].strip(), level=2)
            continue
        bullet = line.startswith("- ")
        paragraph = document.add_paragraph(style="List Bullet" if bullet else None)
        for index, part in enumerate(re.split(r"\*\*", line[2:] if bullet else line)):
            if part:
                paragraph.add_run(part).bold = index % 2 == 1
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
