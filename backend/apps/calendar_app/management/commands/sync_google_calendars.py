"""Send calendar changes to users' Google calendars.

  python manage.py sync_google_calendars            one pass over the outbox (for a cron job)
  python manage.py sync_google_calendars --watch    keep running, a pass every 15 seconds (the worker process)
  python manage.py sync_google_calendars --all      reconcile every connected user (run nightly as a safety net)
"""

import time

from django.core.management.base import BaseCommand

from apps.calendar_app import sync


class Command(BaseCommand):
    help = "Send pending calendar changes to connected Google calendars."

    def add_arguments(self, parser):
        parser.add_argument("--watch", action="store_true", help="Keep running and process the outbox repeatedly.")
        parser.add_argument("--all", action="store_true", help="Reconcile every connected user once (nightly safety net).")
        parser.add_argument("--interval", type=int, default=15, help="Seconds between passes with --watch (default 15).")
        parser.add_argument("--limit", type=int, default=50, help="Most users to process in one pass (default 50).")

    def handle(self, *args, **options):
        if options["all"]:
            self._report("full reconcile", sync.sync_all())
            return
        if not options["watch"]:
            self._report("pass", sync.process_outbox(limit=options["limit"]))
            return
        self.stdout.write("Watching the Google Calendar outbox. Press Ctrl+C to stop.")
        try:
            while True:
                result = sync.process_outbox(limit=options["limit"])
                if any(result.values()):
                    self._report("pass", result)
                time.sleep(options["interval"])
        except KeyboardInterrupt:
            self.stdout.write("Stopped.")

    def _report(self, label, result):
        self.stdout.write(f"{label}: {result['synced']} synced, {result['failed']} failed, {result['skipped']} skipped")
