"""Gunicorn settings for the HTTP API (live game websockets run in the separate daphne service).

Everything can be tuned with environment variables, so a bigger server needs no code change.
"""
import multiprocessing
import os

bind = "0.0.0.0:8000"
worker_class = "gthread"
# A common starting point is (2 x CPU cores) + 1 processes; each runs several threads that share its DB pool.
# Each process may hold DB_POOL_MAX database connections, so never start more processes than the database allows
# (keeping a reserve for the live-game service, the calendar worker and admin tools).
_database_room = max(1, (int(os.getenv("POSTGRES_MAX_CONNECTIONS", "200")) - 40) // int(os.getenv("DB_POOL_MAX", "10")))
workers = int(os.getenv("WEB_CONCURRENCY", min(multiprocessing.cpu_count() * 2 + 1, _database_room)))
threads = int(os.getenv("WEB_THREADS", "4"))
timeout = int(os.getenv("WEB_TIMEOUT", "60"))
graceful_timeout = 30
keepalive = 5
# Restart each worker now and then so slow memory growth never accumulates. A restart resets the connections nginx
# keeps open to that worker, so a request in flight on one of them fails with a 502: keep this high (a load test at
# 2,000 showed a handful of 502s per thousand students) and raise it further on a busy server.
max_requests = int(os.getenv("WEB_MAX_REQUESTS", "50000"))
max_requests_jitter = max_requests // 10
accesslog = "-"
errorlog = "-"
# nginx sits in front and tells us whether the visitor used HTTPS.
forwarded_allow_ips = "*"
worker_tmp_dir = "/dev/shm"
