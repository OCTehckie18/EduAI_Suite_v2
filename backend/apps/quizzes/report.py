import csv
import io

from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import QuizAnswer, QuizPlayer
from .question_types import TYPED, normalise


def percent_correct(correct, total):
    """A mark out of 100. Questions that were not answered count as wrong; None when there were no questions."""
    if not total:
        return None
    return round(100.0 * correct / total, 1)


def _students_for(players):
    """The accounts behind the players, found in one query instead of one per player."""
    keys = {p.student_id for p in players if p.student_id}
    if not keys:
        return {}
    digits = [int(k) for k in keys if str(k).isdigit()]
    found = get_user_model().objects.filter(Q(register_no__in=keys) | Q(pk__in=digits))
    lookup = {}
    for user in found:
        if user.register_no:
            lookup[user.register_no.strip().lower()] = user
        lookup.setdefault(str(user.pk), user)
    return {key: lookup.get(str(key).strip().lower()) for key in keys}


def _answer_text(answer, option_text):
    """What the player actually answered, in words."""
    if answer.text_answer:
        return answer.text_answer
    ids = answer.selected_ids or [answer.option_id]
    return ", ".join(option_text.get(i, "") for i in ids)


def build_report(session):
    """Everything a teacher needs to see how a game went: per question and per player."""
    questions = list(session.quiz.questions.prefetch_related("options").order_by("order", "id"))
    players = list(QuizPlayer.objects.filter(session=session).order_by("-score", "id"))
    answers = list(QuizAnswer.objects.filter(player__session=session))
    students = _students_for(players)

    by_question = {}
    by_player = {}
    for answer in answers:
        by_question.setdefault(answer.question_id, []).append(answer)
        by_player.setdefault(answer.player_id, {})[answer.question_id] = answer

    option_text = {o.id: (o.option_text or "") for q in questions for o in q.options.all()}
    total_players = len(players)

    question_rows = []
    for number, question in enumerate(questions, start=1):
        given = by_question.get(question.id, [])
        counts = {}
        typed = {}
        for answer in given:
            if question.question_type == TYPED:
                row = typed.setdefault(normalise(answer.text_answer), {
                    "text": answer.text_answer or "", "count": 0, "is_correct": answer.is_correct})
                row["count"] += 1
                continue
            for option_id in (answer.selected_ids or [answer.option_id]):
                counts[option_id] = counts.get(option_id, 0) + 1
        correct = sum(1 for a in given if a.is_correct)
        question_rows.append({
            "id": question.id,
            "question_type": question.question_type or "mcq",
            "typed_answers": sorted(typed.values(), key=lambda r: (-r["count"], r["text"])),
            "number": number,
            "text": question.question_text or "",
            "points": question.points,
            "answered": len(given),
            "correct": correct,
            "players": total_players,
            # Of everyone who played, how many got it right (silence counts as wrong).
            "percent_correct": percent_correct(correct, total_players),
            "average_time_s": round(sum(a.response_time_ms for a in given) / len(given) / 1000, 1) if given else None,
            "options": [
                {"id": o.id, "text": o.option_text or "", "is_correct": o.is_correct, "count": counts.get(o.id, 0)}
                for o in question.options.all()
            ],
        })

    player_rows = []
    for rank, player in enumerate(players, start=1):
        mine = by_player.get(player.id, {})
        correct = sum(1 for a in mine.values() if a.is_correct)
        user = students.get(player.student_id) if player.student_id else None
        times = [a.response_time_ms for a in mine.values()]
        player_rows.append({
            "rank": rank,
            "id": player.id,
            "nickname": player.nickname or "",
            "student": {
                "name": user.full_name or user.email,
                "register_no": user.register_no,
            } if user else None,
            "score": player.score,
            "correct": correct,
            "answered": len(mine),
            "total": len(questions),
            "percent": percent_correct(correct, len(questions)),
            "average_time_s": round(sum(times) / len(times) / 1000, 1) if times else None,
            "answers": [
                {
                    "question_id": q.id,
                    "answered": q.id in mine,
                    "option_text": _answer_text(mine[q.id], option_text) if q.id in mine else None,
                    "is_correct": mine[q.id].is_correct if q.id in mine else False,
                    "points": mine[q.id].points_earned if q.id in mine else 0,
                    "time_s": round(mine[q.id].response_time_ms / 1000, 1) if q.id in mine else None,
                }
                for q in questions
            ],
        })

    percents = [p["percent"] for p in player_rows if p["percent"] is not None]
    return {
        "session": {
            "pin": session.pin,
            "quiz_title": session.quiz.title or "Untitled Quiz",
            "status": session.status,
            "is_test_run": session.is_test_run,
            "played_at": (session.started_at or session.created_at).isoformat(),
            "players": total_players,
            "questions": len(questions),
        },
        "summary": {
            "average_percent": round(sum(percents) / len(percents), 1) if percents else None,
            "highest_percent": max(percents) if percents else None,
            "lowest_percent": min(percents) if percents else None,
        },
        "questions": question_rows,
        "players": player_rows,
    }


def _safe(value):
    """Stop a spreadsheet treating a typed nickname as a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def report_csv(report):
    out = io.StringIO()
    writer = csv.writer(out)
    questions = report["questions"]
    writer.writerow(["Rank", "Nickname", "Student name", "Register no", "Points", "Correct", "Questions", "Percent"]
                    + [f"Q{q['number']}" for q in questions])
    for p in report["players"]:
        student = p["student"] or {}
        marks = ["Not answered" if not a["answered"] else ("Correct" if a["is_correct"] else "Wrong") for a in p["answers"]]
        writer.writerow([
            p["rank"], _safe(p["nickname"]), _safe(student.get("name")), _safe(student.get("register_no")),
            p["score"], p["correct"], p["total"], "" if p["percent"] is None else p["percent"], *marks,
        ])
    return out.getvalue()
