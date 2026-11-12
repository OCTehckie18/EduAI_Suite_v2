"""Gunicorn settings for the HTTP API (live game websockets run in the separate daphne service).

Everything can be tuned with environment variables, so a bigger server needs no code change.
"""
import multiprocessing
import os

bind = "0.0.0.0:8000"
worker_class = "gthread"
# A common starting point is (2 x CPU cores) + 1 processes; each runs several threads that share its DB pool.
workers = int(os.getenv("WEB_CONCURRENCY", multiprocessing.cpu_count() * 2 + 1))
threads = int(os.getenv("WEB_THREADS", "4"))
timeout = int(os.getenv("WEB_TIMEOUT", "60"))
graceful_timeout = 30
keepalive = 5
# Restart each worker now and then so slow memory growth never accumulates.
max_requests = 2000
max_requests_jitter = 200
accesslog = "-"
errorlog = "-"
# nginx sits in front and tells us whether the visitor used HTTPS.
forwarded_allow_ips = "*"
worker_tmp_dir = "/dev/shm"
