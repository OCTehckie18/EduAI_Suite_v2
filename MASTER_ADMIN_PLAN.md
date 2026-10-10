# Master Admin Working Plan

## Summary

Make the Master Admin portal a real, authenticated, cross-campus administration
surface backed by Django APIs. Replace mock data and no-op controls in
`apps/eduai` with live data, add the missing user and campus governance
operations, preserve soft-delete recovery, and verify authorization and
failure states end to end.

## Current-State Findings

- `apps/eduai/src/App.tsx` renders hardcoded campus, KPI, and recycle-bin data.
- The portal has no login/session bootstrap and makes no API requests.
- The users tab is a placeholder and has no backend endpoint.
- The "New Campus", restore, and export controls do not perform operations.
- `backend/apps/master_admin/` currently exposes:
  - `GET /api/v1/master-admin/overview/`
  - `GET /api/v1/master-admin/campuses/`
  - `GET /api/v1/master-admin/recycle-bin/`
  - `POST /api/v1/master-admin/recycle-bin/<content_type>/<id>/restore/`
- Those endpoints already require authentication and `IsMasterAdmin`.
- User records and institutional hierarchy already exist in the accounts and
  institution apps, so this work should extend existing models rather than
  create parallel admin models.
- The current backend tests cover authorization for overview, campus summary,
  and recycle-bin restore, but not the frontend or user/campus mutations.

## Scope and Requirements

### REQ-001 — Secure Master Admin access

Only authenticated users with the master-admin role or superuser status may
load the portal or call Master Admin APIs. Expired/invalid sessions must send
the user to login, and non-master users must receive a clear access-denied
state.

### REQ-002 — Live institutional overview

The overview must load KPI values from the backend and show loading, empty,
error, retry, and last-refreshed states. It must not display fabricated counts.

### REQ-003 — Campus governance

Master Admins must be able to list active campuses with live counts, inspect
the hierarchy, create a campus, edit campus metadata, deactivate a campus using
the existing soft-delete policy, and export the currently loaded hierarchy.

### REQ-004 — Global user directory

Master Admins must be able to search and filter users by name, email,
register/employee number, role, campus, and active state; inspect a user;
create/update role and institutional assignments; and deactivate or reactivate
users through controlled server-side operations.

### REQ-005 — Recycle-bin recovery

The recycle bin must load all supported soft-deleted records, support model
filtering and search/pagination, show deletion metadata, and restore records
with confirmation, success feedback, and refresh.

### REQ-006 — Consistent API and error contracts

Admin endpoints must return typed, predictable response shapes, validate input,
avoid leaking secrets, and expose actionable errors without silently falling
back to sample data.

### REQ-007 — Auditability and safety

Mutating operations must be attributable to the acting admin, protect
master-admin accounts from unsafe self-demotion/deactivation, and preserve
soft-delete semantics. Destructive actions require confirmation.

### REQ-008 — Verification and operational readiness

Backend authorization and behavior tests, frontend build/lint checks, and an
authenticated smoke flow must prove the portal works against a configured
Django backend.

## Technical Approach

1. Keep Django REST Framework as the source of truth for administration.
2. Extend `apps.master_admin` for admin-specific serializers, views, filtering,
   validation, and audit hooks; reuse `accounts.User`, institution models, and
   `SoftDeleteModel`.
3. Use the existing JWT login/refresh endpoints rather than inventing a second
   authentication mechanism.
4. Add a small typed API client and auth/session layer to `apps/eduai`.
5. Split the current monolithic `App.tsx` into focused overview, campus,
   directory, recycle-bin, modal/form, and shared request-state components.
6. Keep all permissions enforced server-side; frontend role checks are only UX
   guards.
7. Prefer paginated/filterable endpoints for users and recycle-bin records.
8. Add audit events using the existing action-history mechanism if it supports
   the required actor/action/target fields; otherwise add a narrowly scoped
   admin audit model and migration.

## Implementation Phases

### Phase 1 — Foundation and access

**P1.1 [Cross-cutting] Define API contracts and state model (REQ-001, REQ-006,
REQ-008)**

- Document request/response/error shapes for overview, campuses, users, and
  recycle bin.
- Define frontend types for authenticated user, KPI snapshot, campus row,
  hierarchy node, user row, deleted item, pagination, and API errors.
- Decide whether the admin portal shares token storage with the other portals
  or receives a dedicated secure-cookie/session integration before coding.

**P1.2 [Cross-cutting] Implement Master Admin session bootstrap (REQ-001)**

- Add login/session restoration using the existing account endpoints.
- Fetch `/api/v1/auth/me/` on startup, gate the portal by role, and handle
  refresh/logout/expired-token paths.
- Add backend tests for master admin, superuser, authenticated non-admin, and
  unauthenticated access.

**P1.3 [Cross-cutting] Create frontend API/request infrastructure (REQ-001,
REQ-006)**

- Add a centralized API base URL and authenticated request helper.
- Normalize non-2xx responses into visible error messages.
- Add loading, retry, and request cancellation behavior for page-level data.

### Phase 2 — Backend governance APIs

**P2.1 [G1: master_admin] Complete overview and campus read contracts
(REQ-002, REQ-003)**

- Add serializers and explicit response types for overview and campus
  summaries.
- Add query validation, active-record filtering, stable ordering, and
  pagination where needed.
- Add tests for zero-data, mixed active/inactive, and multi-campus counts.

**P2.2 [G1: master_admin] Add campus management operations (REQ-003, REQ-007)**

- Add list/detail/create/update/deactivate endpoints using the existing
  `Campus` model and soft-delete behavior.
- Validate unique campus code, required name, and safe deactivation rules.
- Return hierarchy/count information needed by the UI.
- Record the acting admin for mutations.

**P2.3 [G1: master_admin] Add global user directory operations (REQ-004,
REQ-007)**

- Add filterable, paginated user list and detail endpoints.
- Support role, campus, active state, name/email/register/employee search.
- Add constrained update operations for role and institutional assignments.
- Add deactivate/reactivate operations with protections for the last active
  master admin and unsafe self-demotion.
- Never return password hashes, tokens, secrets, or unrelated private fields.

**P2.4 [G1: master_admin] Harden recycle-bin operations (REQ-005, REQ-007)**

- Add search/filter/pagination and a stable response schema.
- Include actor/deletion metadata when available.
- Validate restore eligibility and return clear conflict/errors.
- Add audit entries for restore and any new deactivation operation.

### Phase 3 — Live portal UI

**P3.1 [G2: eduai] Replace hardcoded overview with live dashboard
(REQ-002, REQ-006)**

- Remove sample KPI and campus data from `apps/eduai/src/App.tsx`.
- Render API-backed KPI cards, refresh state, empty state, error state, and
  retry action.
- Keep responsive behavior and current visual language.

**P3.2 [G2: eduai] Implement campus governance UI (REQ-003)**

- Build live campus table/cards with search and active-state display.
- Add create/edit modal with field validation and server errors.
- Add deactivate confirmation and post-mutation refresh.
- Implement hierarchy export from loaded API data as JSON/CSV with a clear
  success/failure result.

**P3.3 [G2: eduai] Implement global user directory UI (REQ-004)**

- Add debounced search, role/campus/active filters, pagination, and empty
  states.
- Add user detail/edit form for permitted fields.
- Add deactivate/reactivate confirmation and mutation feedback.
- Ensure sensitive fields are never rendered.

**P3.4 [G2: eduai] Implement recycle-bin UI (REQ-005)**

- Replace hardcoded deleted rows with the recycle-bin endpoint.
- Add model filter, search/pagination, deletion metadata, restore confirmation,
  optimistic or refresh-based update, and error recovery.
- Keep restore disabled while a request is in flight.

### Phase 4 — Verification and operations

**P4.1 [Cross-cutting] Backend test and security gate (REQ-001, REQ-003,
REQ-004, REQ-005, REQ-007, REQ-008)**

- Add API tests for permissions, validation, filtering, pagination, mutation,
  audit attribution, and protected-admin edge cases.
- Run existing accounts, institution, and Master Admin regression tests.
- Run Django checks and migration checks.

**P4.2 [Cross-cutting] Frontend quality and authenticated smoke flow
(REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-008)**

- Add focused component/request tests for loading, errors, empty results,
  restore, create, edit, and access denied states.
- Run `npm run build` and `npm run lint` for `apps/eduai`.
- Smoke test login, overview load, campus create/edit/deactivate, user search,
  and recycle-bin restore against a real local backend.

**P4.3 [Cross-cutting] Documentation and deployment readiness (REQ-006,
REQ-008)**

- Document required frontend/backend environment variables without committing
  secrets.
- Document migration and rollback steps.
- Document the master-admin smoke checklist and known operational limits.

## Task Breakdown

- [ ] T001 [P] [Plan:1.1] Define typed Master Admin API contracts and error
  shapes in `apps/eduai/src` and `backend/apps/master_admin`.
- [ ] T002 [P] [Plan:1.1] Record the token/session integration decision and
  acceptance criteria in the implementation notes.
- [ ] T003 [Plan:1.2] Implement admin session bootstrap and role gate in
  `apps/eduai/src/App.tsx` plus extracted auth helpers.
- [ ] T004 [P] [Plan:1.2] Add backend authorization tests for all admin access
  classes in `backend/apps/master_admin/tests.py`.
- [ ] T005 [P] [Plan:1.3] Add the authenticated API client and normalized error
  handling under `apps/eduai/src`.
- [ ] T006 [Plan:2.1] Add serializers and stable overview/campus response
  contracts in `backend/apps/master_admin`.
- [ ] T007 [Plan:2.1] Add overview/campus edge-case tests in
  `backend/apps/master_admin/tests.py`.
- [ ] T008 [Plan:2.2] Add campus CRUD/deactivate views, URLs, validation, and
  audit attribution using existing institution models.
- [ ] T009 [P] [Plan:2.2] Add campus mutation and soft-delete tests.
- [ ] T010 [Plan:2.3] Add filterable/paginated user directory and safe mutation
  endpoints using `accounts.User`.
- [ ] T011 [P] [Plan:2.3] Add user authorization, filtering, validation, and
  protected-master-admin tests.
- [ ] T012 [Plan:2.4] Harden recycle-bin filtering, pagination, metadata, and
  restore validation.
- [ ] T013 [P] [Plan:2.4] Add recycle-bin regression and audit tests.
- [ ] T014 [Plan:3.1] Extract live overview components and remove hardcoded
  KPI/campus data from `apps/eduai/src/App.tsx`.
- [ ] T015 [Plan:3.2] Implement campus list, form, confirmation, and export
  components in `apps/eduai/src`.
- [ ] T016 [Plan:3.3] Implement user directory, filters, detail editor, and
  safe mutation UI in `apps/eduai/src`.
- [ ] T017 [Plan:3.4] Implement live recycle-bin table, filters, restore
  confirmation, and request states in `apps/eduai/src`.
- [ ] T018 [P] [Plan:4.1] Run backend tests, Django checks, migration checks,
  and security-focused authorization review.
- [ ] T019 [P] [Plan:4.2] Add/run frontend tests, lint, production build, and
  authenticated browser smoke flow.
- [ ] T020 [Plan:4.3] Update operational documentation and deployment checklist.

## Acceptance Gates

1. A logged-out browser cannot see admin data or call protected endpoints.
2. A student, teacher, or campus admin receives access denied and sees no
   admin data.
3. A master admin sees counts and campus rows that match database fixtures,
   including zero and mixed active/inactive cases.
4. Campus and user mutations persist, validate, refresh correctly, and cannot
   bypass server-side authorization.
5. Restore changes the real record state and removes the item from the live
   recycle-bin result after refresh.
6. No UI screen uses fabricated production data or silently succeeds after an
   API failure.
7. Backend tests, frontend lint/build, and the authenticated smoke flow pass.

## Open Decisions Before Implementation

Resolved decisions:

- Use the same JWT/localStorage authentication behavior as TeacherBuddy.
- Limit first-release governance mutations to campuses; hierarchy levels below
  campus remain read-only.
- User deactivation is soft-delete only.
- Reuse the existing action-history mechanism for audit records.
- Leave the user-directory pagination strategy unchanged for now; keep the
  initial implementation compatible with a capped result set.

## Requirement Mapping

| Requirement | Plan items | Evidence |
|---|---|---|
| REQ-001 | P1.2, P1.3, P4.1, P4.2 | Admin session gate, API permissions, auth tests, smoke flow |
| REQ-002 | P2.1, P3.1, P4.2 | Overview APIs, live KPI components, loading/error tests |
| REQ-003 | P2.1, P2.2, P3.2, P4.1, P4.2 | Campus APIs, forms, soft-delete tests, browser flow |
| REQ-004 | P2.3, P3.3, P4.1, P4.2 | User directory APIs, filters/editor, authorization tests |
| REQ-005 | P2.4, P3.4, P4.1, P4.2 | Recycle-bin API/UI, restore tests, refresh behavior |
| REQ-006 | P1.1, P1.3, P2.1, P2.4, P3.1, P4.3 | Typed contracts, normalized errors, documentation |
| REQ-007 | P2.2, P2.3, P2.4, P4.1 | Safe mutations, audit attribution, protected-admin tests |
| REQ-008 | P1.1, P4.1, P4.2, P4.3 | Test gates, build/lint, smoke checklist, deployment docs |
