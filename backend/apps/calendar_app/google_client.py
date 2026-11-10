"""The only code that talks to Google: OAuth and the Calendar REST API.

Everything else (the sync engine, the views) takes a ``GoogleApi`` object, so tests replace it with a fake and
nothing ever calls Google from the test suite. Tokens are never logged.
"""

import logging
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core import signing

logger = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"
# The narrowest calendar scope: it only allows managing calendars this app created itself.
SCOPE = "https://www.googleapis.com/auth/calendar.app.created"
STATE_SALT = "eduai-google-calendar"
STATE_MAX_AGE = 600  # seconds
TIMEOUT = 20


class GoogleAuthError(Exception):
    """Google no longer accepts this token (revoked, expired or the grant is invalid)."""


class GoogleApiError(Exception):
    """Any other failure talking to Google; carries the HTTP status when there is one."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


class NotFound(GoogleApiError):
    pass


class Conflict(GoogleApiError):
    pass


def configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def make_state(user_id, return_to):
    return signing.dumps({"u": user_id, "r": return_to}, salt=STATE_SALT)


def read_state(state):
    """The state's contents, or None when it was tampered with or is older than ten minutes."""
    try:
        return signing.loads(state, salt=STATE_SALT, max_age=STATE_MAX_AGE)
    except signing.BadSignature:
        return None


def consent_url(user_id, return_to):
    query = urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_CALENDAR_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "false",
        "state": make_state(user_id, return_to),
    })
    return f"{AUTH_URL}?{query}"


class GoogleApi:
    """Thin wrapper over Google's token and Calendar endpoints."""

    def _check(self, response):
        if response.status_code == 403 and "ratelimit" in response.text.lower().replace(" ", ""):
            raise GoogleApiError("Google asked us to slow down.", 403)  # retried later; not a revoked permission
        if response.status_code in (401, 403):
            raise GoogleAuthError(f"Google refused the request ({response.status_code}).")
        if response.status_code == 404 or response.status_code == 410:
            raise NotFound("Not found.", response.status_code)
        if response.status_code == 409:
            raise Conflict("Already exists.", 409)
        if response.status_code >= 400:
            raise GoogleApiError(f"Google returned {response.status_code}.", response.status_code)
        return response

    # ---- OAuth -------------------------------------------------------------
    def exchange_code(self, code):
        response = requests.post(TOKEN_URL, data={
            "code": code, "client_id": settings.GOOGLE_CLIENT_ID, "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_CALENDAR_REDIRECT_URI, "grant_type": "authorization_code",
        }, timeout=TIMEOUT)
        if response.status_code >= 400:
            raise GoogleApiError("Google did not accept the authorisation code.", response.status_code)
        return response.json()

    def access_token(self, refresh_token):
        response = requests.post(TOKEN_URL, data={
            "refresh_token": refresh_token, "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET, "grant_type": "refresh_token",
        }, timeout=TIMEOUT)
        if response.status_code == 400 and "invalid_grant" in response.text:
            raise GoogleAuthError("Google no longer accepts this permission (invalid_grant).")
        if response.status_code >= 400:
            raise GoogleApiError("Could not refresh the Google access token.", response.status_code)
        return response.json()["access_token"]

    def revoke(self, token):
        try:
            requests.post(REVOKE_URL, params={"token": token}, timeout=TIMEOUT)
        except requests.RequestException:
            logger.info("Could not revoke a Google token (it will expire on its own).")

    # ---- Calendar ----------------------------------------------------------
    def _headers(self, access_token):
        return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

    def create_calendar(self, access_token, name, time_zone):
        response = requests.post(f"{CALENDAR_API}/calendars", headers=self._headers(access_token),
                                 json={"summary": name, "timeZone": time_zone}, timeout=TIMEOUT)
        return self._check(response).json()["id"]

    def delete_calendar(self, access_token, calendar_id):
        response = requests.delete(f"{CALENDAR_API}/calendars/{calendar_id}", headers=self._headers(access_token), timeout=TIMEOUT)
        self._check(response)

    def insert_event(self, access_token, calendar_id, body):
        response = requests.post(f"{CALENDAR_API}/calendars/{calendar_id}/events", headers=self._headers(access_token), json=body, timeout=TIMEOUT)
        return self._check(response).json()["id"]

    def patch_event(self, access_token, calendar_id, event_id, body):
        response = requests.patch(f"{CALENDAR_API}/calendars/{calendar_id}/events/{event_id}", headers=self._headers(access_token), json=body, timeout=TIMEOUT)
        self._check(response)

    def delete_event(self, access_token, calendar_id, event_id):
        response = requests.delete(f"{CALENDAR_API}/calendars/{calendar_id}/events/{event_id}", headers=self._headers(access_token), timeout=TIMEOUT)
        self._check(response)
