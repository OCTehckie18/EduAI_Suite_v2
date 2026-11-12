# Scalability, optimisation and dead-code plan

Written 12 November 2026 from a read-only review (planned with Fable, checked against the code). Each item is its own branch, tested and merged into `development` before the next.

## Order of work
1. `chore/dead-assets-and-deps`: unused files, npm packages, 1.9 MB logo shrunk to 68 KB.
2. `perf/cache-university-settings`: one cached read of the university settings instead of a database read per request; HTTP caching on the public payload.
3. `perf/exam-indexes`: indexes on the exam, quiz, calendar and activity columns that are filtered most.
4. `perf/exam-list-queries`: remove the N+1 queries in the exam list and attempt list.
5. `perf/exam-start-and-submit`: no cohort-wide row lock on start; bulk insert of answers on submit.
6. `perf/calendar-signal-gating`: skip calendar-sync work unless something that matters changed.
7. `perf/course-student-queries`: counts and averages in bulk for the course and student lists.
8. `perf/route-code-splitting`: lazy-loaded routes and vendor chunks in each app.
9. `perf/university-fetch-ttl-and-polling`: fetch the university payload once, pause polling in hidden tabs.
10. `perf/ws-broadcast-debounce`: fewer queries and messages for live games.
11. `ops/prod-compose`: gunicorn for HTTP, daphne for websockets only, nginx for static files, database pooling.
12. `perf/mail-and-ai-background`: reuse one mail connection, timeouts on AI calls, then background tasks.
13. Last: shared package for duplicated frontend code; Slido back end and legacy URL removal once verified.

## Not done without a decision
- Slido back end (`backend/apps/slido/`) is kept: its screens are hidden but the models are in migrations.
- Legacy URL prefixes are kept until a week of logs shows no use.
- The Celery worker stays; it is needed once mail and AI work move to background tasks (step 12).

## Load test (design only, not run)
k6 against a staging stack on Postgres and Redis, never SQLite or dev servers. Seed 5,000 students, 300 teachers, one exam with a 60-question pool.
- **exam_day:** 2,000 users load the university payload and exam list; all start within 60 s; 10% send violation events; 80% submit in the last 90 s. Targets: p95 under 500 ms for start, under 800 ms for submit, under 300 ms for the list; errors under 0.1%; no duplicate in-progress attempts.
- **live_quiz:** 20 rooms of 150 players; every player answers 10 questions. Targets: connect success over 99.5%; p95 under 1 s from last answer to results; no dropped broadcasts.
- **chain_game:** 30 rooms of 40 players, one word every 3 s.
- Watch: request time per endpoint, Postgres connections and lock waits, `pg_stat_statements`, Redis memory, channel-layer "over capacity" logs, CPU and memory of each process.
