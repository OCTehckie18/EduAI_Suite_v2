# EduAI Suite v2 Test Plan

**Document status:** Test strategy and release gate baseline  
**Product:** EduAI Suite v2  
**Primary release:** Academic workspace foundation  
**Last updated:** 2026-09-20  
**Requirements source:** [docs/PRD.md](docs/PRD.md)  
**Architecture source:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  
**Design source:** [DESIGN.md](DESIGN.md)  
**Test owner:** Engineering and quality team

## 1. Purpose

This document defines how EduAI Suite v2 will be verified before development tasks are considered complete, before a preview deployment is accepted, and before production release.

The plan covers:

- Account creation, login, onboarding, and role-aware routing.
- Personal note creation, editing, listing, soft deletion, and privacy.
- Teacher assignment creation and publication.
- Student assignment completion and teacher visibility.
- Existing classroom, institution, assessment, game, reporting, storage, AI, and administration boundaries.
- Django REST APIs, PostgreSQL data integrity, Redis and Celery behavior, and future Channels WebSockets.
- React portal behavior across teacher, student, and master administration surfaces.
- Accessibility, responsive behavior, failure recovery, security, performance, and observability.
- Current implementation gaps that must remain visible until they are fixed or explicitly accepted.

This is an executable test strategy, not a list of aspirations. Every release claim must point to a test, a manual check, a monitoring signal, or an explicitly recorded exception.

## 2. Quality Objectives

EduAI is acceptable for the foundation release when users can complete the seven PRD journeys without ambiguity or data loss:

1. Create an account.
2. Log in.
3. Create a note.
4. Edit a note.
5. Delete a note.
6. Create an assignment.
7. Mark an assignment complete.

The quality bar is based on the following outcomes:

| Quality objective | Evidence required |
| --- | --- |
| Correctness | Unit, integration, API, and end-to-end tests for state transitions |
| Authorization | Positive and negative role, ownership, campus, classroom, and enrollment tests |
| Data integrity | Transaction, uniqueness, idempotency, migration, and rollback checks |
| Usability | Manual workflow review against [DESIGN.md](DESIGN.md) |
| Accessibility | Automated checks plus keyboard and screen-reader-oriented review |
| Resilience | Network, provider, queue, reconnect, retry, and stale-state tests |
| Performance | Baseline latency, list pagination, queue, and concurrent mutation measurements |
| Operability | Health checks, request IDs, structured error evidence, logs, and metrics |
| Compatibility | Frontend build, API contract, legacy route, and deployment smoke checks |

## 3. Scope

### 3.1 In scope for foundation release

- Custom user account lifecycle.
- Google authentication and approved password fallback where configured.
- Profile completion and pending or blocked states.
- Role-aware portal routing.
- Campus, institution, classroom, and enrollment scope enforcement.
- Personal notes with server ownership and soft deletion.
- Teacher-created assignments.
- Draft and published assignment states.
- Student-visible assignment listing.
- Student completion records.
- Idempotent completion requests.
- Teacher visibility of confirmed completion.
- Shared API error, loading, empty, pending, and recovery states.
- Responsive and accessible portal behavior.
- Database migrations and local Docker Compose startup.

### 3.2 Existing platform scope

The repository already includes or partially includes these domains. They require regression coverage when shared authentication, routing, core models, configuration, or API infrastructure changes:

- Accounts and authentication.
- Institution and campus hierarchy.
- Classrooms and enrollment.
- Assignments and submissions.
- Announcements.
- Appointments.
- Calendar.
- Exams.
- Quizzes.
- OMR.
- Games.
- Lessons.
- Mail.
- Reports.
- Analytics.
- AI chat.
- Slido.
- Trello integration.
- Master administration.
- Storage and file uploads.
- Celery tasks and Redis-backed infrastructure.

### 3.3 Out of scope for foundation release

The following are not release blockers unless separately enabled or claimed by the release:

- Collaborative rich-text note editing.
- Public note sharing.
- Automatic grading.
- AI-generated grades or unreviewed academic feedback.
- Full external calendar synchronization.
- Full offline-first application behavior.
- Production WebSocket features while backend ASGI WebSocket routing remains unwired.
- Full parity with every legacy FastAPI feature unless that feature is part of the release scope.

Out-of-scope behavior must not be presented in the UI as complete.

## 4. Test Architecture

### 4.1 Testing layers

```text
                  +--------------------------+
                  | Production smoke checks  |
                  +------------+-------------+
                               |
                  +------------v-------------+
                  | Browser end-to-end flows |
                  +------------+-------------+
                               |
              +----------------v----------------+
              | API, contract, integration tests |
              +----------------+----------------+
                               |
                 +-------------v-------------+
                 | Unit and component tests  |
                 +-------------+-------------+
                               |
                    +----------v----------+
                    | Static and type checks|
                    +---------------------+
```

Each layer answers a different question:

- **Static checks:** Is the code syntactically valid, typed, linted, and buildable?
- **Unit tests:** Does one rule or transformation behave correctly in isolation?
- **Component tests:** Does a user-facing component render and respond correctly?
- **Integration tests:** Do multiple backend layers, models, permissions, and services work together?
- **Contract tests:** Do clients and servers agree on routes, payloads, statuses, and events?
- **End-to-end tests:** Can a real user complete the workflow across browser and backend boundaries?
- **Smoke tests:** Does the deployed system start and serve its essential paths?
- **Monitoring:** Does the running system reveal failure after release?

### 4.2 Test environments

| Environment | Purpose | Data policy |
| --- | --- | --- |
| Local unit | Fast developer feedback | Factories or small fixtures; no production data |
| Local integration | Django, database, Redis, and worker behavior | Disposable database and seeded test users |
| Preview | Cross-service and browser validation | Synthetic, isolated tenant and accounts |
| Staging | Release candidate and operational checks | Synthetic or approved masked data |
| Production | Smoke and monitoring only | No destructive test data; approved synthetic probes |

### 4.3 Required environment variables

Tests must use isolated values for:

- Django secret and debug configuration.
- Test database URL.
- Redis test database or disposable Redis instance.
- JWT or session test settings.
- OAuth test client configuration or provider mock.
- Groq or other AI provider mock configuration.
- Storage test bucket or local temporary directory.
- Frontend API and WebSocket test URLs.

No test may require a real production token, production database, production storage bucket, or uncontrolled AI provider call.

## 5. Tooling Baseline

### 5.1 Backend

The backend dependency manifest provides:

- Django 5.1.
- Django REST Framework.
- `pytest` and `pytest-django`.
- PostgreSQL support through `psycopg`.
- Channels and `channels-redis`.
- Daphne.
- Celery and Redis.
- Google authentication libraries.
- Pillow, pandas, OpenPyXL, PyPDF2, and python-docx for file and document workflows.
- Groq client integration.

Required backend commands should be standardized in the backend README or project scripts. The expected baseline is:

```powershell
Set-Location backend
pytest
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate --plan
```

Where a project-specific pytest configuration exists, it is authoritative. Tests must run against a test database and must not mutate `backend/db.sqlite3` unintentionally.

### 5.2 Teacher portal

The teacher portal has scripts for:

```powershell
Set-Location apps/teacherbuddy
npm run lint
npm run test
npm run build
```

Vitest uses jsdom and a setup file at `src/test/setup.ts`. Component tests should use Testing Library and `user-event` rather than implementation-detail selectors.

### 5.3 Student portal

The student portal has scripts for:

```powershell
Set-Location apps/edugames
npm run lint
npm run test
npm run build
```

Vitest uses jsdom. Game synchronization tests must cover both WebSocket and REST polling modes without requiring a live backend for unit and component layers.

### 5.4 Master admin portal

The inspected `apps/eduai` package configuration does not provide the same Vitest configuration as the teacher and student portals. Before claiming browser coverage for master administration:

- Add an explicit test script and test environment, or
- Document the manual and end-to-end coverage that substitutes for component tests.

This is a test infrastructure gap, not evidence that the admin portal is safe by default.

### 5.5 Browser and accessibility tools

The project should standardize on a browser runner for end-to-end testing, such as Playwright, with:

- Chromium at minimum.
- Desktop and mobile viewport profiles.
- Trace and screenshot capture on failure.
- Network interception for failure scenarios.
- Keyboard-only test helpers.
- Accessibility assertions using an approved axe integration or equivalent.

The chosen browser runner must be recorded in `DECISIONS.md` if it differs from the implementation plan.

## 6. Test Data Strategy

### 6.1 Tenant and role matrix

Every authorization suite should be able to create or load at least:

| Account | Role | Scope |
| --- | --- | --- |
| `student_a` | Student | Campus A, Classroom A |
| `student_b` | Student | Campus A, Classroom B |
| `student_other_campus` | Student | Campus B |
| `teacher_a` | Teacher | Owns Classroom A |
| `teacher_b` | Teacher | Owns Classroom B |
| `campus_admin_a` | Campus administrator | Campus A only |
| `master_admin` | Master administrator | All campuses under policy |
| `support_user` | Support or operations | Operational permissions only |
| `inactive_user` | Any role | Disabled or suspended |
| `pending_user` | Any role | Incomplete or pending onboarding |

Tests must use at least two campuses and two classrooms. A single-user fixture cannot prove object-level authorization.

### 6.2 Domain fixtures

Minimum reusable fixtures:

- Institution hierarchy with valid and invalid parent-child combinations.
- Classroom and enrollment records.
- Draft, published, closed, archived, and soft-deleted assignments.
- Notes owned by different users and optionally attached to different academic contexts.
- Completion records in not-started, pending, and completed states.
- Expired and valid authentication tokens.
- Files at valid, invalid, oversized, and suspicious types.
- Queued, running, succeeded, retrying, and failed background jobs.
- Game session with two or more players and a disconnected client.

### 6.3 Data isolation

- Tests must use factories or explicit fixtures that can be reset.
- Tests must not depend on execution order.
- Tests must not share mutable records across test cases unless the test explicitly verifies concurrency.
- Test data must not contain real student names, emails, registration numbers, or note content.
- Randomized identifiers are preferred where uniqueness is part of the behavior.

## 7. Requirement Traceability

### 7.1 Account and login requirements

| Requirement | Test IDs | Acceptance evidence |
| --- | --- | --- |
| Account can be created or activated | `AUTH-001` to `AUTH-006` | API and browser flow create one valid account |
| Existing identity is not duplicated | `AUTH-007` | Duplicate identity returns safe conflict or login route |
| Role and academic scope are assigned correctly | `AUTH-008` to `AUTH-014` | Cross-role and hierarchy tests |
| Login succeeds with approved methods | `AUTH-015` to `AUTH-020` | Provider mock and password tests |
| Invalid, pending, suspended, and expired states are clear | `AUTH-021` to `AUTH-028` | API status plus UI state tests |
| Correct portal is selected | `AUTH-029` to `AUTH-032` | Browser route assertions |

### 7.2 Notes requirements

| Requirement | Test IDs | Acceptance evidence |
| --- | --- | --- |
| Authorized user creates a note | `NOTE-001` to `NOTE-006` | API transaction and browser flow |
| Owner can retrieve and edit the note | `NOTE-007` to `NOTE-014` | Ownership and update tests |
| Non-owner cannot read or mutate it | `NOTE-015` to `NOTE-022` | Student, teacher, campus, and admin matrix |
| Delete is soft and hidden from active lists | `NOTE-023` to `NOTE-029` | Model, API, and list tests |
| Failed save is visible and does not claim success | `NOTE-030` to `NOTE-035` | Network and server failure UI tests |
| Stale updates follow the selected conflict policy | `NOTE-036` to `NOTE-040` | Concurrent update tests |

### 7.3 Assignment and completion requirements

| Requirement | Test IDs | Acceptance evidence |
| --- | --- | --- |
| Authorized teacher creates a draft | `ASGN-001` to `ASGN-008` | Scope and validation tests |
| Draft can be published according to policy | `ASGN-009` to `ASGN-015` | Transition and visibility tests |
| Student sees only eligible assignments | `ASGN-016` to `ASGN-024` | Enrollment and campus isolation tests |
| Student can mark eligible assignment complete | `ASGN-025` to `ASGN-033` | API and browser flow |
| Completion is idempotent | `ASGN-034` to `ASGN-039` | Duplicate request and retry tests |
| Completion is not submission or grade | `ASGN-040` to `ASGN-043` | Response, UI, and model separation tests |
| Teacher sees confirmed completion | `ASGN-044` to `ASGN-050` | Cross-portal reconciliation tests |

### 7.4 Platform quality requirements

| Requirement | Test IDs | Acceptance evidence |
| --- | --- | --- |
| Server-side authorization | `AUTHZ-001` to `AUTHZ-030` | Negative access matrix |
| Responsive behavior | `UX-001` to `UX-018` | Desktop, tablet, and mobile browser checks |
| Accessibility | `A11Y-001` to `A11Y-024` | Automated and manual keyboard checks |
| Network recovery | `RES-001` to `RES-018` | Abort, retry, reconnect, and stale-state tests |
| Observability | `OPS-001` to `OPS-018` | Request IDs, logs, health, and job evidence |
| Release compatibility | `REL-001` to `REL-020` | Build, migration, smoke, and rollback checks |

## 8. Backend Test Plan

### 8.1 Model and constraint tests

For every foundation model, test:

- Required and optional fields.
- Default values.
- Time zone behavior.
- Foreign-key relationships.
- Unique constraints.
- Null and blank behavior.
- Soft-delete flags and managers.
- Ordering and pagination assumptions.
- State transition validity.
- Related-record behavior after soft deletion.

The model layer must not be the only authorization test layer. A valid model instance can still be exposed incorrectly by a view.

### 8.2 Selector and scope tests

Test that selectors return only records visible to the actor:

- Student sees enrolled classroom assignments.
- Student does not see another campus's assignment.
- Teacher sees owned or explicitly assigned classrooms.
- Campus admin sees only the authorized campus.
- Master admin sees cross-campus records only through approved administrative paths.
- Support user cannot use operational access as a substitute for academic ownership.
- Deleted records are absent from normal selectors.
- Explicit recycle-bin selectors include only authorized deleted records.

### 8.3 Service and transaction tests

Test multi-step operations as services:

- Account activation and profile completion commit all required state together.
- Note creation persists owner and context atomically.
- Note update rejects or resolves stale version according to the selected policy.
- Note deletion records soft deletion and any audit event together.
- Assignment publication changes state only when validation succeeds.
- Completion creates exactly one student-assignment relationship.
- A failed side effect rolls back the domain mutation or records a deliberate pending state.
- External provider calls do not hold a database transaction open unnecessarily.

### 8.4 Serializer and validation tests

Test:

- Missing required fields.
- Invalid lengths and unsupported values.
- Invalid dates and time zones.
- Invalid hierarchy relationships.
- Assignment due dates before publication or creation where disallowed.
- Unauthorized owner or classroom IDs supplied by the client.
- Invalid file type, size, and content signature where applicable.
- Error field names and normalized error response shape.

### 8.5 API tests

For every foundation endpoint, cover:

- Anonymous request.
- Valid authenticated request.
- Wrong role.
- Same-role wrong owner.
- Same-campus wrong classroom.
- Cross-campus request.
- Missing object.
- Soft-deleted object.
- Invalid payload.
- Duplicate or retried mutation.
- Database or provider failure.
- Pagination, filtering, and ordering.
- Correct response status and body.

Do not accept an HTTP 200 response that embeds a provider or domain failure in a normal success payload when the client needs to know that the operation failed.

### 8.6 Authentication and onboarding tests

`AUTH-001` through `AUTH-032` should include:

- Valid account activation.
- Duplicate email or external identity.
- Unverified provider identity.
- Invalid provider token.
- Password validation and weak-password rejection.
- Profile completion with valid hierarchy.
- Parent-child hierarchy mismatch.
- Pending approval or mapping state.
- Suspended account.
- Access-token expiration.
- Refresh success and refresh failure.
- Role-aware response fields.
- Session logout or token invalidation behavior.
- No protected data returned before onboarding completion.

### 8.7 Notes API tests

`NOTE-001` through `NOTE-040` should verify:

- Owner is derived from the authenticated actor.
- Create returns server ID and timestamps.
- Owner can list active notes.
- Non-owner receives a safe denial or not-found response according to the privacy policy.
- Update cannot transfer ownership through payload manipulation.
- Soft-deleted notes are excluded from active lists and normal lookup.
- Delete is idempotent or returns the documented conflict.
- Restore is restricted to approved actors.
- Stale update returns the documented conflict behavior.
- Empty title, oversized body, and invalid context are rejected.
- Request ID is present in normalized failure responses.

### 8.8 Assignment and completion API tests

`ASGN-001` through `ASGN-050` should verify:

- Teacher cannot create an assignment in a classroom they do not own or administer.
- Student cannot create, edit, publish, close, or delete assignment definitions.
- Draft is not visible to students unless policy explicitly allows it.
- Published assignment visibility follows enrollment and scope.
- Closed and archived assignments have documented read and mutation behavior.
- Student identity is taken from authentication, not a posted student ID.
- Completion requires eligibility.
- Duplicate completion commands produce one stable completion record.
- Concurrent completion requests do not create duplicates.
- Completion response does not imply submission or grade.
- Teacher status reads show server-confirmed completion only.

## 9. Frontend Unit and Component Plan

### 9.1 Shared component tests

For shared controls and layout components, test:

- Visible label and accessible role.
- Keyboard activation.
- Focus-visible state behavior where testable.
- Disabled and loading states.
- Error and helper text association.
- Long labels and wrapping.
- Narrow viewport layout assumptions.
- Icon-only accessible names.
- Dialog and drawer focus behavior.
- Status labels that do not rely only on color.

### 9.2 API client tests

For each typed client:

- Correct HTTP method and path.
- Query and body serialization.
- Authentication header behavior.
- Successful JSON parsing.
- Empty response handling.
- Normalized error parsing.
- Abort and timeout behavior.
- Retry behavior only for safe operations.
- No token or private content in console output.

### 9.3 Auth and routing component tests

Test:

- Login form validation.
- Provider button loading and failure.
- Password show/hide control.
- Pending onboarding route.
- Role-to-portal routing.
- Protected route behavior with missing, expired, and malformed session.
- Logout clears protected client state.
- Refresh failure does not cause an infinite redirect or request loop.

### 9.4 Notes component tests

Test:

- Empty note list.
- Loading note list.
- Create note form.
- Successful save state.
- Unsaved changes warning.
- Save failure while preserving input.
- Edit state and server reconciliation.
- Delete confirmation.
- Deleted note removal after confirmed response.
- No accidental share controls in the personal-notes release.
- Stale update or conflict presentation.

### 9.5 Assignment component tests

Test:

- Teacher draft form validation.
- Classroom scope selection.
- Due date and time zone presentation.
- Save draft versus publish action distinction.
- Publish confirmation and pending state.
- Student assignment list filters and empty state.
- `Mark as complete` pending, success, duplicate, and failure states.
- Completion wording does not say `Submitted` or `Graded`.
- Teacher completion count uses confirmed server data.

### 9.6 Game synchronization tests

The current `useGameSync` hook attempts WebSocket connection, retries, and falls back to REST polling. Test:

- No socket is created without a session ID.
- A successful socket enters `ws` mode.
- JSON events update game state.
- Malformed or error events are handled without crashing the component.
- Reconnect uses bounded attempts and cleans up timers.
- Polling begins after the configured retry limit.
- Polling performs an initial fetch and interval fetch.
- Unmount clears polling, reconnect, and socket handlers.
- REST fallback does not duplicate a command.
- A missing game session stops polling and exposes a useful error.

## 10. Frontend End-to-End Plan

### 10.1 Browser profiles

Run core flows at minimum in:

- Desktop Chromium at 1440 by 900.
- Tablet-sized viewport at 768 by 1024.
- Mobile viewport at 390 by 844.
- A keyboard-only interaction profile.
- A reduced-motion profile.

Use stable seeded accounts and reset the preview data between scenarios.

### 10.2 Account journey

`E2E-AUTH-001`:

1. Open the authentication entry point.
2. Create or activate a valid account using a test provider or approved password route.
3. Complete required onboarding fields.
4. Verify the correct portal opens.
5. Verify protected navigation is present.
6. Refresh the page and confirm the session remains valid according to policy.
7. Log out and verify protected pages are inaccessible.

Negative variants:

- Invalid identity.
- Duplicate account.
- Unverified identity.
- Pending approval.
- Suspended account.
- Expired session during navigation.
- Network failure during onboarding.

### 10.3 Notes journey

`E2E-NOTE-001`:

1. Sign in as `student_a`.
2. Open `My notes`.
3. Confirm the empty state or existing seeded notes.
4. Create a note with title, body, and optional academic context.
5. Confirm the server-saved state.
6. Navigate away and return.
7. Edit the note.
8. Confirm the updated content persists.
9. Delete the note.
10. Confirm it leaves the active list and the UI does not claim deletion before the server response.

Negative variants:

- Save request fails.
- Delete request fails.
- Another user tries to open the note URL.
- The note changes in another browser before update.
- Browser reload occurs with unsaved changes.

### 10.4 Assignment journey

`E2E-ASGN-001`:

1. Sign in as `teacher_a`.
2. Select Classroom A.
3. Create a draft assignment.
4. Verify it appears as `Draft` only in the teacher view.
5. Publish it.
6. Sign in as `student_a`.
7. Verify the assignment is visible and the scope is correct.
8. Mark it complete.
9. Verify `Completed` and the confirmation timestamp.
10. Sign in again as `teacher_a`.
11. Verify the correct student completion status.

Negative variants:

- Teacher attempts another teacher's classroom.
- Student attempts to edit or publish the assignment.
- Student from Classroom B attempts to access it.
- Student repeats completion after a timeout.
- Publication fails validation.
- Completion request fails after the user clicks the button.

### 10.5 Cross-portal consistency journey

`E2E-CROSS-001` verifies that:

- The same assignment state uses the same terminology in student and teacher portals.
- A completion shown to a teacher is the same server-confirmed record shown to the student.
- Logout in one portal invalidates the session according to the configured policy.
- Unauthorized route access is blocked even when a URL is manually entered.

## 11. Accessibility Test Plan

### 11.1 Automated checks

Run accessibility assertions on:

- Login.
- Onboarding.
- Student dashboard.
- Notes list and editor.
- Teacher assignment form.
- Student assignment detail.
- Completion confirmation.
- Admin list or management surface.
- Dialogs, drawers, menus, and error banners.

Check for:

- Missing labels.
- Invalid heading hierarchy.
- Low contrast.
- Unnamed buttons and links.
- Invalid ARIA relationships.
- Focusable hidden elements.
- Dialog focus violations.
- Duplicate IDs.
- Missing table headers.
- Live-region misuse.

Automated accessibility tools are a filter, not proof of accessibility.

### 11.2 Keyboard manual checks

For every core journey:

- Complete the flow without a mouse.
- Confirm visible focus at every step.
- Open and close navigation drawer.
- Navigate selects, comboboxes, dialogs, tabs, and menus.
- Submit forms from the keyboard.
- Recover from validation errors.
- Confirm focus returns to the invoking control after a dialog closes.

### 11.3 Screen-reader-oriented checks

Verify that:

- Page title and main heading identify the current route.
- Form labels and validation messages are announced.
- Save, pending, and failure states are announced.
- Completion confirmation is announced without requiring visual color.
- Table row and action context is understandable.
- Private note status is available as text.

## 12. Responsive and Visual Test Plan

### 12.1 Layout checks

At each supported viewport:

- No horizontal overflow except deliberate table regions.
- No text overlaps buttons, badges, or adjacent content.
- Headings wrap without covering actions.
- Sticky actions do not hide fields or list rows.
- Sidebar and mobile drawer do not trap or obscure content.
- Empty and error illustrations or icons do not dominate the actual action.
- Long names, assignment titles, and error messages remain readable.

### 12.2 Visual regression targets

Capture stable screenshots for:

- Auth screen.
- Authenticated shell with expanded and collapsed navigation.
- Student overview.
- Teacher assignment list.
- Assignment authoring form.
- Notes list and editor.
- Student assignment detail with completed state.
- Admin overview.
- Loading, empty, error, and mobile states.

Review changes for:

- Token drift.
- Inconsistent radii.
- Unintended color-only status.
- Broken focus rings.
- Density regressions.
- Button resizing during loading.
- Text clipping or overflow.

## 13. Security and Authorization Test Plan

Detailed security controls belong in `SECURITY.md`, but they are release-blocking test concerns.

### 13.1 Authentication tests

- Invalid access token.
- Expired access token.
- Invalid refresh token.
- Token from another environment.
- Suspended or deactivated user.
- Missing authentication header.
- Session fixation or unintended token reuse where applicable.
- Sensitive tokens absent from logs and browser-visible errors.

### 13.2 Authorization matrix

For each protected resource, test:

| Actor | Own object | Same campus, other owner | Other campus | Deleted object |
| --- | --- | --- | --- | --- |
| Student | Allowed according to role | Denied | Denied | Hidden or explicit restore policy |
| Teacher | Allowed in owned scope | Denied unless assigned | Denied | Hidden or explicit policy |
| Campus admin | Allowed within campus policy | Allowed only within policy | Denied | Restore only if granted |
| Master admin | Allowed under admin policy | Allowed under admin policy | Allowed under admin policy | Explicit recycle-bin path |
| Support | Operational data only | No academic content by default | No academic content by default | No content by default |

The exact policy may be refined, but every cell must be intentional and tested.

### 13.3 Input and data exposure tests

- Client cannot set owner, creator, campus, student, or grade fields to bypass scope.
- Error responses do not reveal private object existence where policy prohibits it.
- List endpoints do not leak records through counts, search, ordering, or pagination.
- Files cannot be downloaded by guessing storage keys.
- Upload limits and content validation are enforced server-side.
- HTML, script, path traversal, and malformed document inputs are handled safely.
- AI prompts and provider payloads exclude secrets and unnecessary private content.

## 14. Resilience and Failure Test Plan

### 14.1 HTTP failures

Test:

- DNS or connection failure.
- Timeout.
- `401` during an active session.
- `403` permission denial.
- `404` unavailable object.
- `409` stale or duplicate mutation.
- `429` rate limit.
- `500` unexpected server failure.
- `502/503` provider or dependency failure.

The UI must preserve safe input and distinguish unconfirmed state from confirmed state.

### 14.2 Retry rules

- GET and safe idempotent reads may retry with a bounded policy.
- Note create, assignment publish, and completion commands must use an idempotency strategy or must not be automatically repeated blindly.
- A retry must not create duplicate completion records or duplicate assignments.
- Retry exhaustion displays an actionable failure.

### 14.3 WebSocket and polling

Because the frontend game code supports WebSocket-first behavior with REST polling fallback while backend WebSocket routing is currently incomplete:

- Unit tests must mock both modes.
- Preview tests must verify the actual backend capability before enabling WebSocket assertions.
- A failed socket must not prevent read-only game state when polling is available.
- Reconnect must have bounded attempts and cleanup.
- Events received after unmount must not mutate state.
- Polling must stop when the session is complete, missing, or the component is destroyed.

### 14.4 Celery and provider failures

- Worker unavailable.
- Broker unavailable.
- Task timeout.
- Retry limit reached.
- Provider rate limit.
- Provider returns malformed output.
- Storage upload fails after provider success.
- Worker retries after partial side effect.

For every user-visible background workflow, verify the user can identify pending, failed, and successfully completed states.

## 15. Performance Test Plan

Performance targets should be finalized in `DECISIONS.md` after baseline measurement. Until then, use these release guidance thresholds:

| Surface | Baseline target |
| --- | --- |
| Health endpoint | p95 under 250 ms in preview |
| Authenticated read API | p95 under 750 ms for normal page size |
| Create or update API | p95 under 1,000 ms excluding approved async providers |
| First useful portal render | Within 3 seconds on a representative preview connection |
| Notes list | Stable response with pagination at 20 records |
| Assignment list | Stable response with pagination and scoped query |
| Completion command | Confirmed response under 1,000 ms under normal load |
| WebSocket reconnect | Bounded and observable; no unbounded client loop |
| Queue task | Visible status within 5 seconds of enqueue |

Measure rather than assume. A slow query hidden behind a visually polished page is still a product failure.

### 15.1 Load scenarios

- 100 concurrent authenticated reads across student dashboards.
- 25 concurrent teachers listing classroom assignments.
- 25 concurrent completion commands for the same and different assignments.
- 10 concurrent note edits on different notes.
- 10 concurrent duplicate completion commands for one student and assignment.
- Queue burst for report or document jobs.
- WebSocket connection and reconnect burst when real-time backend support is enabled.

Monitor database query count, slow queries, Redis memory, queue age, worker concurrency, API errors, and browser failure rate.

## 16. Data and Migration Test Plan

### 16.1 Migration checks

For every migration:

- Apply from an empty database.
- Apply from the previous release schema.
- Run the application checks after migration.
- Verify indexes and constraints.
- Verify existing records remain readable.
- Verify soft-deleted records retain expected lifecycle metadata.
- Verify a rollback or forward-fix procedure exists for destructive changes.

### 16.2 Seed and fixture checks

- Seed data creates valid hierarchy relationships.
- Seed data contains at least two scopes for authorization testing.
- Seed data does not create duplicate user or completion records.
- Seed data can be removed or recreated without manual database editing.
- Preview reset does not preserve private content from a previous test run.

### 16.3 Data integrity checks

- One completion per student-assignment pair.
- No assignment visible outside its scope.
- No note visible outside its ownership or explicit future sharing policy.
- Timestamps use the configured time zone and remain ordered correctly.
- Background job result links to the correct requester and source record.
- File metadata links to the correct owner and domain object.

## 17. Existing Gap and Regression Register

The repository memory contains an audit of the FastAPI-to-Django conversion. These issues affect test scope and must not be silently treated as passing behavior:

| Area | Current issue | Test treatment |
| --- | --- | --- |
| Mail | Filter is a hardcoded mock result | Add regression test before claiming mail parity |
| Trello | Sync lacks creator checks and orphan cleanup | Add authorization and reconciliation tests |
| Reports | AI narrative generation and related endpoints are missing or stubbed | Mark as known gap; add contract tests when implemented |
| Slido | Upload validation is incomplete | Add signature, size, and type tests |
| Analytics | Engagement uses fabricated attendance values | Block authoritative analytics claims until real data model exists |
| AI chat | Provider failures may return HTTP 200 with error text | Add status-code regression tests |
| Exams | Scoring and import/resumption behavior diverge | Add migration and behavioral comparison tests |
| Lessons | Posted lesson edit/delete guard is missing | Add state-transition authorization tests |
| OMR | Full image processing pipeline and exports are absent | Mark unsupported until implementation exists |
| Calendar | Google Calendar synchronization is absent or partial | Test status behavior and do not expose false sync completion |
| Accounts | Legacy admin approval differs from current onboarding design | Product decision required before parity claim |
| Assignments | Course progress recalculation is missing | Do not use progress dashboard as authoritative until fixed |
| WebSockets | Channels dependencies exist but ASGI routing is not wired | Test frontend fallback; block real-time release claim |

Known gaps may be accepted only with an owner, severity, release impact, and next action in `DECISIONS.md` or the implementation plan.

## 18. Observability and Operations Tests

### 18.1 Health checks

Verify:

- Backend process liveness.
- Database readiness.
- Redis readiness where required.
- Celery worker or queue readiness where required.
- Static and media configuration in preview.
- ASGI startup through Daphne.

Health endpoints must not expose secrets or full dependency credentials.

### 18.2 Request and job correlation

For a failing request, verify:

- Client receives a request ID when supported.
- Backend logs include the same safe ID.
- A queued job keeps a traceable job identifier.
- WebSocket errors identify the session or request without leaking private content.
- Provider failures record category and latency, not API keys or raw sensitive prompts.

### 18.3 Alert scenarios

Test that monitoring or support procedures can identify:

- Rising authentication failures.
- Elevated permission denials.
- Note save failures.
- Assignment publication failures.
- Completion conflict or duplicate rates.
- Queue age and worker failure.
- Redis or database outage.
- Provider error spikes.
- WebSocket reconnect and polling fallback spikes.

## 19. Release Gates

### 19.1 Pull request gate

A pull request changing frontend or backend code must pass the relevant narrow checks before review:

- Formatting or project style checks where configured.
- Backend targeted pytest tests.
- Portal targeted Vitest tests.
- TypeScript build or typecheck for changed portal.
- ESLint for changed portal.
- Migration check when models change.
- Contract tests when API or event payloads change.
- Accessibility checks when interactive UI changes.

### 19.2 Preview gate

A preview release must pass:

- Docker Compose or equivalent service startup.
- Database migration and health checks.
- Backend smoke tests.
- Teacher, student, and admin portal build checks.
- Account and login browser flow.
- Notes browser flow where implemented.
- Assignment and completion browser flow.
- Cross-scope authorization smoke checks.
- Responsive checks at desktop and mobile viewports.
- No high-severity error or security findings.

### 19.3 Production gate

Production release requires:

- All foundation critical-path tests passing.
- No unresolved release-blocking authorization or data-integrity defect.
- Migration rehearsal completed.
- Rollback or forward-fix plan reviewed.
- Secrets and environment configuration verified.
- Health and alert checks verified.
- Known gaps explicitly accepted by owner.
- Support runbook and incident path available.

## 20. Severity and Defect Policy

| Severity | Definition | Release treatment |
| --- | --- | --- |
| P0 | Data loss, account takeover, cross-tenant exposure, corrupted academic record, or system unavailable | Immediate stop; no release |
| P1 | Critical foundation flow blocked, authorization bypass, duplicate official record, or unsafe migration | No release until fixed or formally escalated |
| P2 | Important workflow broken with a workaround, serious accessibility failure, or misleading state | Fix before production unless accepted with owner |
| P3 | Minor visual, copy, or low-impact edge-case defect | May defer with ticket and evidence |
| P4 | Cosmetic or exploratory improvement | Backlog |

A test failure is not reclassified as lower severity merely because the UI still loads. A misleading completion, save, grade, or permission state is at least P1 or P2 depending on impact.

## 21. Test Reporting

Every test run should make the following visible:

- Commit or build identifier.
- Environment.
- Test command.
- Scope and test count.
- Passed, failed, skipped, and flaky tests.
- Browser and viewport when applicable.
- Database and migration version.
- Relevant request, job, or trace IDs.
- Screenshots, traces, or logs for browser failures.
- Known environmental failures separated from product failures.

A release report should summarize:

```text
Release candidate:
Foundation journeys:
Backend tests:
Frontend tests:
E2E tests:
Accessibility:
Responsive checks:
Security and authorization:
Performance baseline:
Known accepted gaps:
Release decision:
Owner and timestamp:
```

Do not report only a green unit-test count while browser, authorization, or migration gates are unknown.

## 22. Flaky Test Policy

A flaky test is a product-quality signal, not a permanent skip.

When a test flakes:

1. Record the test, environment, frequency, and failure evidence.
2. Determine whether the cause is timing, isolation, external dependency, data collision, or product race condition.
3. Quarantine only with an owner and expiration date.
4. Preserve the test's requirement mapping.
5. Fix or remove the quarantine before the next release gate.

Do not add arbitrary sleeps to hide asynchronous behavior. Use deterministic waits on visible state, network completion, job status, or event confirmation.

## 23. Implementation Order

1. Standardize backend test discovery, settings, fixtures, and isolated database behavior.
2. Add authorization and scope fixtures for two campuses and multiple roles.
3. Establish API error and request-ID contract tests.
4. Cover account creation, login, onboarding, and role routing.
5. Implement or verify notes domain tests before exposing the notes UI as complete.
6. Cover assignment draft, publish, visibility, and completion state transitions.
7. Add teacher and student browser flows.
8. Add responsive, accessibility, and failure-state checks.
9. Add Celery, storage, AI, and provider contract tests for released features.
10. Wire and test Channels WebSockets before claiming real-time production support.
11. Add master admin test infrastructure and browser coverage.
12. Add performance baselines and operational alert checks.
13. Run preview and production release gates.

## 24. Test Cases for the Seven Foundation Journeys

### 24.1 Create an account

- Valid institution-approved identity creates one account.
- Existing identity routes to login or safe duplicate response.
- Invalid identity cannot create an account.
- Required onboarding fields are enforced.
- Invalid hierarchy combinations are rejected.
- Account remains protected while incomplete or pending.
- Correct role and portal are assigned after completion.
- Refresh does not duplicate profile or account state.
- Network failure preserves safe user input and communicates retry.

### 24.2 Log in

- Valid Google identity logs in.
- Unverified or invalid provider identity is rejected.
- Valid password fallback logs in when enabled.
- Invalid password does not reveal account details.
- Suspended account cannot log in.
- Expired access token follows refresh or re-auth policy.
- Logout clears protected client state.
- Direct access to another portal's protected route is denied or redirected.

### 24.3 Create a note

- Authenticated user opens the notes surface.
- User creates a valid private note.
- Server returns authoritative ID, timestamps, and owner.
- Note appears in the active list after confirmed save.
- Another user cannot retrieve it.
- Failed save does not remove the user's input or show false success.

### 24.4 Edit a note

- Owner can edit title and body.
- Empty or invalid content is rejected clearly.
- Updated server state survives navigation and reload.
- Stale update follows the conflict policy.
- Non-owner cannot edit through UI or direct API request.

### 24.5 Delete a note

- Delete requires explicit confirmation.
- Cancel leaves the note unchanged.
- Confirmed delete removes it from active lists.
- Deleted note remains recoverable according to policy.
- Failed delete leaves the note visible and explains failure.
- Non-owner cannot delete it.

### 24.6 Create an assignment

- Authorized teacher selects a valid classroom scope.
- Required title, instructions, and due-date rules are validated.
- Save draft creates a draft only.
- Publish changes visibility according to policy.
- Student outside the scope cannot view it.
- Student cannot edit or publish it.
- Teacher sees the authoritative state after reload.

### 24.7 Mark an assignment complete

- Eligible student sees the assignment.
- Student selects `Mark as complete`.
- Button shows pending state and blocks unsafe duplicate activation.
- Server creates one completion record.
- Confirmation includes clear status and timestamp.
- Repeated or retried request remains idempotent.
- Teacher sees the confirmed completion.
- Completion is not displayed as submission or grade.
- Ineligible or unauthorized student is denied without data leakage.

## 25. Open Testing Decisions

Record these decisions in `DECISIONS.md` before they affect test implementation:

1. Browser runner and accessibility automation library.
2. Backend test database strategy for local and CI execution.
3. Whether API contract schemas will use OpenAPI-generated clients or hand-maintained TypeScript types.
4. Note conflict policy: version conflict, timestamp conflict, or last-write-wins.
5. Token refresh and logout behavior across independently deployed portals.
6. Exact performance targets and representative preview hardware/network.
7. Whether WebSocket coverage is enabled in the foundation release or deferred with polling as the only supported mode.
8. Master admin portal component-test tooling.
9. Approved test data retention and preview reset strategy.
10. Required production synthetic probes and their privacy constraints.

## 26. Exit Criteria

The foundation release may exit testing when:

- All seven journeys pass through API and browser validation.
- Critical authorization matrix tests pass.
- No P0 or P1 defect remains open.
- P2 defects have an owner and explicit release decision.
- Migrations apply cleanly from the previous release state.
- Backend and released portals pass build, lint, and targeted test checks.
- Accessibility checks pass for core journeys with no known critical keyboard or labeling defect.
- Responsive checks pass at mobile, tablet, and desktop profiles.
- Failure states do not falsely claim saved, completed, published, or deleted state.
- Preview health, logs, request IDs, and support evidence are available.
- Known FastAPI-to-Django gaps are visible in the release report and not misrepresented as parity.
- Product, engineering, security, and operations owners approve the release evidence.

## 27. Final Testing Principle

A feature is not tested when its happy path renders once. It is tested when the right user can complete it, the wrong user cannot, the database records one correct result, retries do not corrupt state, the interface explains pending and failure states, the layout remains usable, and operators can understand what happened afterward.
