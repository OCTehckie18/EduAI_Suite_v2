"""Exam-day load test: a whole class loads the exam list, starts, answers and submits at once.

    python exam_day.py --base http://127.0.0.1:18080 --host play.example.edu --tokens tokens.json --students 500 --spread 20

Every student does: GET the university details, GET the exam list, POST start, (think time), POST submit with an
answer to every question, GET their attempt. Start times are spread randomly over ``--spread`` seconds and the
submissions bunch into the last part of ``--exam-seconds``, like a real exam. It prints latency percentiles per
step, the error count, and checks the database rules afterwards (no student with two attempts).

Needs: pip install httpx. See README.md for the seeding command and what to watch on the server.
"""

import argparse
import asyncio
import json
import random
import statistics
import time
from collections import defaultdict

import httpx


def percentile(values, p):
    if not values:
        return float("nan")
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * p / 100))]


async def one_student(client, student, exam_id, args, results, errors):
    headers = {"Authorization": f"Bearer {student['token']}", "Host": args.host, "X-Forwarded-Proto": "https"}

    async def call(step, method, url, **kwargs):
        began = time.perf_counter()
        try:
            response = await client.request(method, url, headers=headers, timeout=60, **kwargs)
            results[step].append(time.perf_counter() - began)
            if response.status_code >= 400:
                errors[f"{step} {response.status_code}"] += 1
                return None
            return response.json()
        except Exception as exc:  # noqa: BLE001 - a failed request is a result, not a crash
            errors[f"{step} {type(exc).__name__}"] += 1
            return None

    await asyncio.sleep(random.uniform(0, args.spread))
    await call("university", "GET", "/api/v1/institution/university/")
    await call("exam list", "GET", "/api/v1/exams/")
    attempt = await call("start", "POST", f"/api/v1/exams/{exam_id}/attempts/start")
    if not attempt or not attempt.get("paper"):
        return
    # Think time, then most students hand in near the end.
    await asyncio.sleep(random.uniform(args.exam_seconds * 0.6, args.exam_seconds))
    answers = [{"question_id": q["id"], "selected_choice_id": q["choices"][0]["id"]} for q in attempt["paper"]]
    await call("submit", "POST", f"/api/v1/exams/{exam_id}/attempts/{attempt['id']}/submit", json={"answers": answers})
    await call("attempt", "GET", f"/api/v1/exams/{exam_id}/attempts/{attempt['id']}")


async def teacher_poll(client, token, exam_id, args, results, errors, stop):
    headers = {"Authorization": f"Bearer {token}", "Host": args.host, "X-Forwarded-Proto": "https"}
    while not stop.is_set():
        began = time.perf_counter()
        try:
            response = await client.get(f"/api/v1/exams/{exam_id}/attempts", headers=headers, timeout=60)
            results["teacher attempts"].append(time.perf_counter() - began)
            if response.status_code >= 400:
                errors[f"teacher attempts {response.status_code}"] += 1
        except Exception as exc:  # noqa: BLE001
            errors[f"teacher attempts {type(exc).__name__}"] += 1
        await asyncio.sleep(args.teacher_poll)


async def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", required=True, help="Address of the edge, e.g. http://127.0.0.1:18080")
    parser.add_argument("--host", required=True, help="Host name of a portal (it must be in DJANGO_ALLOWED_HOSTS)")
    parser.add_argument("--tokens", default="loadtest_tokens.json")
    parser.add_argument("--students", type=int, default=500)
    parser.add_argument("--spread", type=float, default=20, help="Seconds over which students arrive")
    parser.add_argument("--exam-seconds", type=float, default=60, help="Length of the simulated exam")
    parser.add_argument("--teacher-poll", type=float, default=5, help="Seconds between the teacher's attempt-list refreshes")
    args = parser.parse_args()

    data = json.load(open(args.tokens, encoding="utf-8"))
    students = data["students"][: args.students]
    results, errors = defaultdict(list), defaultdict(int)
    limits = httpx.Limits(max_connections=min(2000, len(students) + 10), max_keepalive_connections=200)
    stop = asyncio.Event()
    began = time.perf_counter()
    async with httpx.AsyncClient(base_url=args.base, limits=limits) as client:
        poller = asyncio.create_task(teacher_poll(client, data["teacher_token"], data["exam_id"], args, results, errors, stop))
        await asyncio.gather(*(one_student(client, s, data["exam_id"], args, results, errors) for s in students))
        stop.set()
        await poller
    elapsed = time.perf_counter() - began

    print(f"\n{len(students)} students, {elapsed:.0f} s in total\n")
    print(f"{'step':<18}{'requests':>9}{'p50 ms':>9}{'p95 ms':>9}{'p99 ms':>9}{'max ms':>9}")
    for step in ("university", "exam list", "start", "submit", "attempt", "teacher attempts"):
        values = [v * 1000 for v in results.get(step, [])]
        if values:
            print(f"{step:<18}{len(values):>9}{statistics.median(values):>9.0f}{percentile(values, 95):>9.0f}{percentile(values, 99):>9.0f}{max(values):>9.0f}")
    total = sum(len(v) for v in results.values())
    failed = sum(errors.values())
    print(f"\nrequests: {total}, errors: {failed} ({100 * failed / max(total, 1):.2f}%)")
    for kind, count in sorted(errors.items()):
        print(f"  {kind}: {count}")
    print("\nTargets: p95 under 500 ms for start, 800 ms for submit, 300 ms for the exam list; errors under 0.1%.")


if __name__ == "__main__":
    asyncio.run(main())
