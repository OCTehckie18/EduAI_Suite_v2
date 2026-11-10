# Google Calendar sync: setup

EduAI can keep a separate calendar called "EduAI · {University}" up to date in each user's own Google account.
It only touches the calendar it creates; the user's personal events are never read.

## What you need to do once (Google Cloud)

1. In the Google Cloud project that owns `GOOGLE_CLIENT_ID`, enable the **Google Calendar API**.
2. On the **OAuth consent screen**, add the scope `https://www.googleapis.com/auth/calendar.app.created`.
3. On the OAuth client, add each environment's callback as an **Authorised redirect URI**. It must equal
   `GOOGLE_CALENDAR_REDIRECT_URI` exactly, for example
   `https://api.your-college.example/api/v1/calendar/google/callback` (local: `http://localhost:8000/api/v1/calendar/google/callback`).
4. While the app is in Google's **Testing** mode only the test users you list (up to 100) can connect. Opening it to the whole
   university needs Google's app verification for the calendar scope, which can take days to weeks.

## Server settings

| Setting | What it is |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The same OAuth client used for sign-in |
| `GOOGLE_CALENDAR_REDIRECT_URI` | The callback address from step 3 |
| `CALENDAR_TOKEN_KEY` | Encrypts the stored Google permissions. Required in production. Create one with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and keep it safe: without it, connected users must reconnect |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` | The portal addresses a user may be sent back to after connecting |

## The worker

Changes reach Google through a small worker that must run next to the web server:

```bash
python manage.py sync_google_calendars --watch     # keeps running; sends queued changes every 15 seconds
python manage.py sync_google_calendars --all       # run nightly: reconcile every connected user (safety net)
python manage.py sync_google_calendars             # one pass, for a cron job
```

Without the worker, a user's calendar only updates when they press **Sync now**.

## Behaviour to know

- Each user's calendar is exactly what the in-app calendar shows (30 days back to 365 days ahead).
- Re-sending never creates duplicates: Google event ids are derived from the calendar item.
- If Google stops accepting the permission, the user sees "Reconnect Google Calendar". A Google outage is retried with a growing delay.
- **Disconnect** deletes the EduAI calendar in the user's Google account, revokes the permission and removes the stored token.
- Deactivating a user disconnects their sync the next time the worker runs.
