# Load test

`exam_day.py` simulates a class sitting an exam: every student loads the university details and the exam list, starts
the exam, answers every question and submits near the end, while a teacher refreshes the attempt list. It reports
latency percentiles per step and any errors.

Run it against a **throw-away production-style stack** (`deploy/prod`, with Postgres and Redis), never against your
real data, SQLite or the Vite dev servers.

## Steps

1. Start the production stack from `deploy/prod` (see its README) with test host names, for example in `.env`:
   `LANDING_HOST=landing.localtest.me` and so on, `PUBLIC_SCHEME=http`, `SECURE_SSL_REDIRECT=False`,
   `EDGE_PORT=18080`, and set `WEB_CONCURRENCY` to what your server would use.
2. Seed fake students, a class and a published exam, and write sign-in tokens (the command refuses to run unless you
   confirm the database is a test one):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env exec -T web \
     python manage.py seed_loadtest --students 1500 --output /tmp/tokens.json --i-know-this-is-a-test-database
   docker cp <web container>:/tmp/tokens.json ../loadtest/tokens.local.json
   ```

   `*.json` files here are git-ignored: the tokens are secrets (valid for 6 hours).
3. Run the test (needs `pip install httpx`):

   ```bash
   python exam_day.py --base http://127.0.0.1:18080 --host play.localtest.me \
     --tokens tokens.local.json --students 500 --spread 20 --exam-seconds 40
   ```

   `--spread` is how many seconds the students take to arrive. A student can only start once, so to repeat a run empty
   the attempts first:
   `docker compose ... exec -T db psql -U eduai -d eduai_suite -c "truncate exams_examanswer, exams_attemptquestion, exams_examattempt cascade;"`

## Reading the result

The script prints what the *client* saw. When the load generator shares a machine with the server, or a burst makes
requests queue for a free worker, those numbers include waiting that a real class would also feel but a separate
generator would measure more cleanly. For the server's own view read the edge log, which records nginx's
`$request_time` for every request:

```bash
docker compose ... logs edge --since 5m
```

Targets: p95 under 500 ms for starting an exam, 800 ms for submitting, 300 ms for the exam list; errors under 0.1%.
Watch `docker stats` (CPU and memory of `web`, `db`) and the `web` log for restarts.

## A first measurement (12 November 2026)

Docker Desktop on a 16-core Windows laptop, the load generator on the same machine, 9 gunicorn processes with 4 threads
each, Postgres 16, one exam with a 60-question pool and 20 questions per paper. Nothing failed in any run once the
gunicorn restart setting below was fixed.

| Class | Arrival | Server time (nginx) | Notes |
|---|---|---|---|
| 500 students | over 20 s | start p95 156 ms, submit p95 289 ms, exam list p95 60 ms | all targets met, 0 errors |
| 1000 students | over 10 s | queueing under the burst: start p95 about 1.5 s, p50 135 ms | 0 errors; submit p95 385 ms |

What the runs found:

- **Worker restarts caused 502s.** gunicorn's `max_requests` restarted workers while nginx still held connections open
  to them, so a few requests per thousand students failed. The default is now 50,000 (`WEB_MAX_REQUESTS`).
- **The default worker count could exceed the database.** 2 x CPU cores + 1 gave 33 workers on 16 cores, each allowed 10
  database connections, against 200 allowed. The default now stays inside `POSTGRES_MAX_CONNECTIONS`.
- **Starting an exam is the heaviest step** (about 135 ms at the median with a 60-question pool). It reads the whole
  pool and counts how often each question has been given across the exam, which grows with the number of students who
  have started. A burst of starts makes every other request queue behind them. Caching the pool for a minute and
  counting usage in Redis would be the next step if a real exam day shows it.

This is one machine and one scenario. It says the design holds up to a class of about 500 arriving over 20 seconds
on a laptop; it does not say where it breaks. Repeat it on the server you will use, and with the live-game scenarios
below (not yet written).

## Not written yet

- Live quiz rooms (150 players per room, websockets) and the chain game: the plan is a script like this one that opens
  the sockets and checks that every player receives every question.
- A test run from a separate machine, so the generator does not compete with the server for CPU.
