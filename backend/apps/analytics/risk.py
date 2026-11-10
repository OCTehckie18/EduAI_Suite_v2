"""Explainable risk scores for a teacher's students.

Every point of a student's score comes from a recorded signal, and every signal produces a sentence
a teacher can read and act on. Nothing is guessed: a student with no results and nothing overdue is
"not enough data", never "low risk". Attendance is not recorded, so it is not part of the score.

Score (0 to 100, capped) = marks (up to 50) + missing and late work (up to 30) + falling trend (up to 15)
                           + exam integrity flags (up to 10).
Marks use the average of the last three results (or all results if fewer): they add nothing at 70% or above
and count fully at 30% or below.
"""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from apps.accounts.models import User
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment
from apps.exams.models import Exam, ExamAttempt
from apps.omr.models import OMRSubmission

MARKS_SAFE = 70  # at or above this average, marks add nothing
MARKS_FLOOR = 30  # at or below this average, marks count fully
MARKS_POINTS = 50
MISSING_POINTS = 25
LATE_POINT_EACH, LATE_POINTS = 1.5, 5
TREND_POINTS = 15
TREND_MIN_RESULTS = 3
FLAG_POINTS = 10

HIGH, MODERATE = 50, 25  # the distribution bands below follow these


@dataclass
class Result:
    when: datetime
    percent: float
    kind: str  # assignment, exam, omr
    title: str
    course_id: int


@dataclass
class StudentRisk:
    student: User
    course_ids: set = field(default_factory=set)
    results: list = field(default_factory=list)
    past_due: int = 0
    missing: list = field(default_factory=list)
    missing_items: list = field(default_factory=list)  # {title, due, course_id, assignment_id}
    late: list = field(default_factory=list)
    flags: list = field(default_factory=list)
    cleared: int = 0  # flags a teacher cleared by resetting the attempt

    # ---- the signals --------------------------------------------------------------
    @property
    def average(self):
        return round(sum(r.percent for r in self.results) / len(self.results), 1) if self.results else None

    @property
    def recent_average(self):
        """Average of the last three results: where the student is now, not where they started."""
        recent = sorted(self.results, key=lambda r: r.when)[-3:]
        return round(sum(r.percent for r in recent) / len(recent), 1) if len(recent) == 3 else self.average

    @property
    def slope(self):
        """Change in percentage points per result over the last six results (least squares)."""
        recent = sorted(self.results, key=lambda r: r.when)[-6:]
        if len(recent) < TREND_MIN_RESULTS:
            return None
        n = len(recent)
        xs = range(n)
        mean_x, mean_y = (n - 1) / 2, sum(r.percent for r in recent) / n
        num = sum((x - mean_x) * (r.percent - mean_y) for x, r in zip(xs, recent))
        den = sum((x - mean_x) ** 2 for x in xs)
        return round(num / den, 1) if den else None

    # ---- the score ----------------------------------------------------------------
    def parts(self):
        marks = 0.0
        current = self.recent_average
        if current is not None and current < MARKS_SAFE:
            marks = MARKS_POINTS * min(1.0, (MARKS_SAFE - current) / (MARKS_SAFE - MARKS_FLOOR))
        missing = MISSING_POINTS * len(self.missing) / self.past_due if self.past_due else 0.0
        late = min(LATE_POINTS, LATE_POINT_EACH * len(self.late))
        trend = 0.0
        if self.slope is not None and self.slope < 0:
            trend = min(TREND_POINTS, -self.slope * 1.5)
        flags = min(FLAG_POINTS, FLAG_POINTS * len(self.flags))
        return {"marks": round(marks, 1), "missing": round(missing + late, 1), "trend": round(trend, 1), "integrity": round(flags, 1)}

    @property
    def has_data(self):
        return bool(self.results or self.past_due or self.flags)

    @property
    def score(self):
        return round(min(100.0, sum(self.parts().values())), 1) if self.has_data else None

    @property
    def level(self):
        if self.score is None:
            return "no_data"
        return "high" if self.score >= HIGH else "moderate" if self.score >= MODERATE else "low"

    def reasons(self):
        """What is pushing the score up, biggest first, as sentences."""
        parts = self.parts()
        out = []
        if parts["marks"]:
            if self.recent_average != self.average:
                text = f"Recent marks average {self.recent_average}% (last 3 results); {self.average}% across all {len(self.results)}."
            else:
                text = f"Average mark is {self.average}% across {len(self.results)} graded result{'s' if len(self.results) != 1 else ''}."
            out.append((parts["marks"], "marks", text))
        if self.missing:
            names = ", ".join(self.missing[:3]) + (f" and {len(self.missing) - 3} more" if len(self.missing) > 3 else "")
            out.append((parts["missing"], "missing", f"{len(self.missing)} of {self.past_due} assignments past their due date {'was' if len(self.missing) == 1 else 'were'} not handed in ({names})."))
        if self.late:
            out.append((min(LATE_POINTS, LATE_POINT_EACH * len(self.late)), "late", f"{len(self.late)} assignment{'s were' if len(self.late) != 1 else ' was'} handed in late."))
        if parts["trend"]:
            out.append((parts["trend"], "trend", f"Marks are falling by about {abs(self.slope)} points per result over the last {min(6, len(self.results))} results."))
        if self.flags:
            out.append((parts["integrity"], "integrity", f"{len(self.flags)} exam attempt{'s were' if len(self.flags) != 1 else ' was'} ended for leaving the exam window ({', '.join(self.flags[:2])})."
                       + (f" {self.cleared} earlier flag{'s' if self.cleared != 1 else ''} cleared by a teacher reset." if self.cleared else "")))
        out.sort(key=lambda item: -item[0])
        return [{"signal": kind, "points": round(points, 1), "text": text} for points, kind, text in out]

    def next_step(self):
        """One concrete suggestion, from the biggest driver."""
        reasons = self.reasons()
        if not reasons:
            return "No action needed now." if self.has_data else "Not enough graded work yet to judge. Check again after the next assignment is marked."
        steps = {
            "marks": "Offer a revision session or extra practice on the weakest topics, and check understanding in person.",
            "missing": "Follow up on the missing work this week and agree a new hand-in date.",
            "late": "Talk about planning and deadlines; late work is starting to pile up.",
            "trend": "Meet soon to find out what changed; marks were better earlier in the term.",
            "integrity": "Discuss exam conduct with the student and note it before the next exam.",
        }
        first = steps[reasons[0]["signal"]]
        # A second problem that is nearly as big is worth naming too.
        if len(reasons) > 1 and reasons[1]["points"] >= 10 and reasons[1]["signal"] != reasons[0]["signal"]:
            return f"{first} Also: {steps[reasons[1]['signal']][0].lower()}{steps[reasons[1]['signal']][1:]}"
        return first

    def as_dict(self, class_average=None, class_sd=None):
        z = None
        if self.average is not None and class_average is not None and class_sd:
            z = round((self.average - class_average) / class_sd, 2)
        timeline = sorted(self.results, key=lambda r: r.when)
        return {
            "student_id": self.student.pk,
            "name": self.student.full_name or self.student.email,
            "email": self.student.email,
            "register_no": self.student.register_no,
            "course_ids": sorted(self.course_ids),
            "score": self.score,
            "level": self.level,
            "parts": self.parts() if self.has_data else None,
            "average": self.average,
            "recent_average": self.recent_average,
            "results_count": len(self.results),
            "missing_count": len(self.missing),
            "past_due_count": self.past_due,
            "late_count": len(self.late),
            "trend_slope": self.slope,
            "integrity_flags": len(self.flags),
            "integrity_cleared": self.cleared,
            "z_score": z,
            "reasons": self.reasons(),
            "next_step": self.next_step(),
            "timeline": [{"date": r.when.date().isoformat(), "percent": r.percent, "kind": r.kind, "title": r.title} for r in timeline],
        }


def _as_datetime(value):
    """Assignment due dates are stored as text: accept a date or a date-time, else None."""
    if not value:
        return None
    text = str(value).strip()
    parsed = parse_datetime(text)
    if parsed is None:
        d = parse_date(text[:10])
        if d is None:
            return None
        parsed = datetime(d.year, d.month, d.day, 23, 59)
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def analyse(classrooms, now=None):
    """{student_id: StudentRisk} for everyone actively enrolled in `classrooms`."""
    now = now or timezone.now()
    course_ids = [c.pk for c in classrooms]
    risks = {}
    for e in Enrollment.objects.filter(classroom_id__in=course_ids, is_active=True, student__role=User.Role.STUDENT).select_related("student"):
        risk = risks.setdefault(e.student_id, StudentRisk(student=e.student))
        risk.course_ids.add(e.classroom_id)
    if not risks:
        return risks
    student_ids = list(risks)

    # Assignments: graded marks, missing work and late work.
    assignments = list(Assignment.objects.filter(course_id__in=course_ids))
    latest = {}
    for sub in Submission.objects.filter(assignment__in=assignments, student_id__in=student_ids).order_by("id"):
        latest[(sub.student_id, sub.assignment_id)] = sub
    for a in assignments:
        due = _as_datetime(a.due_date)
        for sid, risk in risks.items():
            if a.course_id not in risk.course_ids:
                continue
            sub = latest.get((sid, a.pk))
            if sub and sub.grade is not None and a.max_points:
                risk.results.append(Result(sub.created_at, round(100 * sub.grade / a.max_points, 1), "assignment", a.title or "Assignment", a.course_id))
            if due and due < now:
                risk.past_due += 1
                if sub is None:
                    risk.missing.append(a.title or "Assignment")
                    risk.missing_items.append({"assignment_id": a.pk, "title": a.title or "Assignment", "due": due.isoformat(), "course_id": a.course_id})
                elif sub.created_at > due + timedelta(minutes=5):
                    risk.late.append(a.title or "Assignment")

    # Exams: submitted scores and integrity flags.
    exams = {x.pk: x for x in Exam.objects.filter(course_id__in=course_ids)}
    for att in ExamAttempt.objects.filter(exam_id__in=list(exams), student_id__in=student_ids).exclude(status="in_progress"):
        risk = risks[att.student_id]
        exam = exams[att.exam_id]
        if att.status == "flagged":
            risk.flags.append(exam.title or "Exam")
        elif att.score is not None:
            risk.results.append(Result(att.end_time or att.start_time, round(att.score, 1), "exam", exam.title or "Exam", exam.course_id))

    # Flagged attempts a teacher reset are gone, but the history stays visible beside the student.
    from apps.exams.models import ExamReset
    for reset in ExamReset.objects.filter(exam_id__in=list(exams), student_id__in=student_ids):
        if (reset.snapshot or {}).get("status") == "flagged":
            risks[reset.student_id].cleared += 1

    # OMR sheets the teacher has verified.
    for sheet in OMRSubmission.objects.filter(job__classroom_id__in=course_ids, student_id__in=student_ids, status="verified").select_related("job"):
        risks[sheet.student_id].results.append(Result(sheet.created_at, round(sheet.score, 1), "omr", sheet.job.title or "OMR exam", sheet.job.classroom_id))
    return risks


def summary(risks):
    """Class-level figures for the dashboard."""
    rows = list(risks.values())
    averages = [r.average for r in rows if r.average is not None]
    class_average = round(sum(averages) / len(averages), 1) if averages else None
    class_sd = None
    if len(averages) >= 5:  # a spread from fewer students says little
        mean = sum(averages) / len(averages)
        class_sd = (sum((a - mean) ** 2 for a in averages) / (len(averages) - 1)) ** 0.5 or None
    levels = defaultdict(int)
    for r in rows:
        levels[r.level] += 1
    drivers = defaultdict(int)
    for r in rows:
        for reason in r.reasons():
            drivers[reason["signal"]] += 1
    # Four bands that line up with the levels: low, moderate, and two bands of high.
    bands = [("0-24", 0, 25), ("25-49", 25, 50), ("50-74", 50, 75), ("75-100", 75, 101)]
    buckets = [0] * len(bands)
    for r in rows:
        if r.score is not None:
            buckets[next(i for i, (_, lo, hi) in enumerate(bands) if lo <= r.score < hi)] += 1

    # Class average by week, from every graded result.
    weekly = defaultdict(list)
    for r in rows:
        for res in r.results:
            week = (res.when - timedelta(days=res.when.weekday())).date()
            weekly[week].append(res.percent)
    trend = [{"week": w.isoformat(), "average": round(sum(v) / len(v), 1), "results": len(v)} for w, v in sorted(weekly.items())]

    return {
        "students": len(rows),
        "levels": {k: levels.get(k, 0) for k in ("high", "moderate", "low", "no_data")},
        "class_average": class_average,
        "class_sd": round(class_sd, 1) if class_sd else None,
        "drivers": {k: drivers.get(k, 0) for k in ("marks", "missing", "late", "trend", "integrity")},
        "distribution": [{"range": label, "students": n} for (label, _, _), n in zip(bands, buckets)],
        "weekly_average": trend,
        "graded_results": sum(len(r.results) for r in rows),
    }


STUDENT_STATUS = {"high": "act_now", "moderate": "needs_attention", "low": "on_track", "no_data": "getting_started"}


def student_tips(risk):
    """The same signals the teacher sees, said to the student, with something they can do about each."""
    tips = []
    for reason in risk.reasons():
        kind = reason["signal"]
        if kind == "marks":
            tips.append({"signal": kind, "text": f"Your recent marks average {risk.recent_average}%. Ask your teacher which topics to revise, and redo the questions you lost marks on."})
        elif kind == "missing":
            n = len(risk.missing)
            tips.append({"signal": kind, "text": f"{n} assignment{'s are' if n != 1 else ' is'} past the due date and not handed in. Hand {'them' if n != 1 else 'it'} in, or ask your teacher for a new date."})
        elif kind == "late":
            n = len(risk.late)
            tips.append({"signal": kind, "text": f"{n} of your hand-ins {'were' if n != 1 else 'was'} late. Try to finish a day before the deadline."})
        elif kind == "trend":
            tips.append({"signal": kind, "text": f"Your marks have been dropping, by about {abs(risk.slope)} points per result. Book a meeting with your teacher to get back on track."})
        elif kind == "integrity":
            n = len(risk.flags)
            tips.append({"signal": kind, "text": f"{n} exam attempt{'s were' if n != 1 else ' was'} ended because you left the exam window. Close other apps and turn off notifications before you start."})
    if not tips:
        tips.append({"signal": "ok", "text": "You are on track. Keep handing work in on time." if risk.has_data
                     else "Nothing has been marked yet. Your progress will show here after your first marked work."})
    return tips


def student_view(risk, course=None):
    return {
        **({"course_id": course.pk, "code": course.subject_code, "name": course.name} if course else {}),
        "status": STUDENT_STATUS[risk.level],
        "average": risk.average,
        "recent_average": risk.recent_average,
        "trend_slope": risk.slope,
        "results_count": len(risk.results),
        "past_due_count": risk.past_due,
        "missing": risk.missing_items,
        "late_count": len(risk.late),
        "exam_flags": len(risk.flags),
        "tips": student_tips(risk),
        "timeline": [{"date": r.when.date().isoformat(), "percent": r.percent, "kind": r.kind, "title": r.title}
                     for r in sorted(risk.results, key=lambda r: r.when)],
    }
