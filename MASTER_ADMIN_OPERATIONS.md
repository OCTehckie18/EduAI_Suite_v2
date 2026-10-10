# Master Admin Operations

## Required configuration

The frontend reads `VITE_API_URL` when an absolute backend URL is required.
When running through the Docker Compose proxy, leave it unset and use the
configured `/api` proxy. Backend authentication and database settings remain
in the backend environment files; do not commit those files or their values.

## Deployment and rollback

1. Build the frontend with `npm run build` from `apps/eduai`.
2. Run `python manage.py check` and
   `python manage.py makemigrations --check --dry-run` from `backend`.
3. Apply pending migrations with `python manage.py migrate` in the backend
   runtime.
4. Rebuild and restart the `eduai` service so the container serves the new
   frontend bundle.
5. To roll back, deploy the previous application image or Git revision. Do not
   reverse migrations unless the migration is explicitly reversible and the
   database has been backed up.

## Authenticated smoke checklist

- Sign in as a Master Admin and refresh the browser; the session must restore.
- Confirm overview KPI values and campus rows come from the backend.
- Create, edit, and soft-deactivate a campus; confirm the list refreshes.
- Search the global user directory and verify role/campus/active filters.
- Soft-deactivate a permitted user and restore it from the recycle bin.
- Confirm non-admin users receive an access-denied state and protected API
  requests do not expose admin data.
- Sign out and confirm the login screen returns.

## Verification status

- Master Admin backend suite: 12 tests passed.
- Django system and migration checks: passed.
- Frontend production build: passed.
- Authenticated Docker smoke flow: manually verified during Phase 3.
- The broader 41-test selection has one unrelated legacy expectation:
  `apps.core.test_migration.MigrationSmokeTestCase.test_ai_chat` expects
  unauthenticated `POST /ai/chat` to return 200, while the current endpoint
  and its dedicated test correctly require authentication and return 403.
