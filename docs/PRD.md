# EduAI Suite v2 Product Requirements Document

**Document status:** Draft for product and engineering review  
**Product:** EduAI Suite v2  
**Primary release:** Academic workspace foundation  
**Last updated:** 2026-09-20  
**Document owner:** Product and engineering team  
**Related product surfaces:** `apps/teacherbuddy`, `apps/edugames`, `apps/eduai`, and `backend/`

## 1. Purpose

This document defines what EduAI Suite v2 should provide for authenticated academic work, personal or classroom notes, and assignment workflows. It explains the user problem, the product behavior, the reasons for each capability, the boundaries of the first release, and the measurable conditions for success.

This is a product contract. It deliberately describes user outcomes and observable behavior before prescribing database tables, framework components, folder structure, API implementation, or deployment details. Those implementation decisions belong in `ARCHITECTURE.md`, `DESIGN.md`, `TEST_PLAN.md`, `SECURITY.md`, and `DECISIONS.md`.

The requested foundation journeys are:

1. Create an account.
2. Log in.
3. Create a note.
4. Edit a note.
5. Delete a note.
6. Create an assignment.
7. Mark an assignment complete.

EduAI Suite is an academic platform rather than a generic notes application. The same account may interact with different portals and permissions depending on whether the person is a student, teacher, campus administrator, or master administrator. Product requirements therefore include role, institution, classroom, enrollment, academic-record integrity, privacy, and network-resilience concerns.

## 2. Product Context

EduAI Suite v2 is a multi-campus education platform with:

- A teacher portal for classroom management, planning, assignments, assessments, analytics, communication, and live learning tools.
- A student portal for classrooms, lessons, assignments, exams, games, appointments, analytics, and feedback.
- A master administration portal for institutional governance, cross-campus oversight, and recovery of soft-deleted records.
- A Django and Django REST Framework backend supporting academic domains, authentication, storage, AI services, background work, and real-time features.
- Planned or existing support for Google authentication, password fallback, classroom enrollment, assignments, reports, analytics, games, exams, and interactive classroom sessions.

The current implementation roadmap identifies custom accounts and onboarding, classrooms and enrollment, assignments and submissions, and frontend JWT integration as major product areas. The note capability in this PRD is a product proposal that should be implemented only after its ownership and privacy rules are accepted.

## 3. Problem Statement

Students and teachers need one trustworthy academic workspace for capturing knowledge, completing academic work, and understanding what remains to be done. Without a coherent workflow:

- Users create accounts but cannot reliably reach the correct role-specific experience.
- Students lose notes across tools or cannot connect notes to a classroom or assignment.
- Teachers create assignments without a clear completion signal or consistent student status.
- Users cannot tell whether data was saved, is still loading, or failed because of a network or server problem.
- Institutions cannot safely distinguish user-owned content from classroom content and official academic records.
- Administrators may see incomplete or misleading data if ownership, scope, or data lineage is unclear.

The product should reduce friction in routine academic work while preserving the trustworthiness of enrollment, submissions, completion status, and institutional data.

## 4. Product Vision

EduAI Suite should make academic work feel continuous across planning, learning, submission, and review:

- A user can authenticate once and reach the correct academic workspace.
- A user can capture and organize notes without losing ownership or context.
- A teacher can create an assignment with clear expectations and a due date.
- A student can understand what is assigned, complete it, and see the completion state reflected consistently.
- A teacher can distinguish not started, in progress, submitted, completed, late, returned, and needs-revision states.
- Every critical state has a visible recovery path when the network, provider, or browser fails.
- AI assistance, where added later, supports users without replacing human review or inventing academic facts.

## 5. Goals

### 5.1 Primary goals

1. Provide a reliable account lifecycle for institutionally scoped users.
2. Give users a clear and secure login experience with role-aware routing.
3. Allow an authenticated user to create, view, edit, and soft-delete notes they are authorized to manage.
4. Allow authorized teachers to create assignments for a classroom or academic scope.
5. Allow authorized students to mark an assignment complete through a controlled workflow.
6. Make ownership, classroom scope, status, timestamps, and error states understandable.
7. Protect user content and academic records with server-side authentication and authorization.
8. Make the workflows measurable, testable, accessible, and resilient to intermittent connectivity.
9. Preserve compatibility with EduAI's existing multi-portal and multi-campus direction.

### 5.2 Secondary goals

- Make notes useful as a foundation for future lesson, resource, AI, and assignment workflows.
- Support a consistent status vocabulary across assignments, submissions, background work, and live activities.
- Make it possible to expand from personal notes to classroom-shared notes without silently changing privacy expectations.
- Provide operational evidence when a workflow fails.

## 6. Non-Goals for the First Release

The following are explicitly outside the initial foundation release unless separately approved:

- Full collaborative real-time editing of a note.
- Rich document editing with arbitrary embedded media, drawing, or spreadsheet formulas.
- Public note sharing or anonymous note access.
- Automatic plagiarism detection.
- Automatic grading of assignment content.
- AI-generated notes, answers, grades, or feedback without a separately approved AI requirement.
- Google Drive, Microsoft OneDrive, or external note-provider synchronization.
- Full calendar synchronization for assignment due dates.
- Parent or guardian accounts.
- Anonymous classroom participation.
- Hard deletion of institutional records where soft-delete policy applies.
- Replacing the existing identity, classroom, or institutional hierarchy without a migration plan.
- Treating a client-side completion toggle as an official grade or verified submission.

## 7. Users and Personas

### 7.1 Student

**Primary needs:**

- Sign in using an institution-approved identity or fallback credentials.
- Reach enrolled classrooms and assigned work.
- Capture personal learning notes.
- Edit notes as understanding changes.
- Remove notes that are no longer useful while retaining predictable recovery behavior.
- Mark eligible work complete and know whether completion was saved.

**Constraints:**

- May use a mobile phone, shared device, low-bandwidth connection, or an unstable network.
- Must not see another student's private notes, submissions, or account data.
- Must not edit assignment definitions created by a teacher.
- May be required to complete profile onboarding before accessing protected features.

**Success signal:** The student can enter the product, find relevant work, save a note, and complete an assignment without needing technical assistance.

### 7.2 Teacher

**Primary needs:**

- Sign in and access owned or assigned classrooms.
- Create assignments with clear instructions and due dates.
- Review completion status at classroom and student levels.
- Create or manage teaching notes according to the selected visibility.
- Correct or clarify assignment information without corrupting student submission history.

**Constraints:**

- Must not access classrooms or student records outside their authorization scope.
- Must be able to distinguish assignment definition from student submission or completion state.
- Must not treat a completion marker as proof of academic quality unless a separate review process exists.

**Success signal:** The teacher can create meaningful work quickly and trust the status shown for each student.

### 7.3 Campus administrator

**Primary needs:**

- Manage or oversee users and academic hierarchy within an authorized campus scope.
- Support account and access issues.
- View operational or aggregate information without unnecessary access to private note content.

**Constraints:**

- Access is scoped by campus, school, department, or policy.
- Administrative visibility must not automatically imply permission to edit personal learning content.

### 7.4 Master administrator

**Primary needs:**

- Govern the platform across campuses.
- Investigate access and data integrity issues.
- Restore soft-deleted records under policy.
- Review aggregate health and usage signals.

**Constraints:**

- High privilege requires strong authentication, audit logging, and least-privilege interfaces.
- Access to content should be justified by support, governance, or incident procedures.

### 7.5 Support or operations user

**Primary needs:**

- Diagnose authentication, API, queue, storage, and real-time failures.
- Resolve incidents without browsing unnecessary academic content.

**Constraints:**

- Operational access is not equivalent to academic ownership.
- Logs and support tools must redact secrets and sensitive content.

## 8. Product Principles

1. **Trust over convenience:** A status must reflect server-confirmed state when it represents academic work.
2. **Clear ownership:** Every note, assignment, and completion record has an identifiable owner and scope.
3. **Human-readable state:** Users should understand whether something is saved, pending, failed, deleted, or awaiting review.
4. **Server-side authority:** The browser may request an action, but the server decides whether it is allowed and records the result.
5. **Recoverable work:** Network interruption should not silently discard a user's work.
6. **Minimum necessary visibility:** Users see the content and records needed for their role, not the entire institution.
7. **Accessible by default:** Forms, feedback, focus, keyboard behavior, contrast, and responsive layouts are part of the feature.
8. **Evidence-based iteration:** Product changes are evaluated using user feedback, behavior metrics, quality data, and operational signals.
9. **Academic integrity:** A completion state is not automatically a grade, and generated content is not automatically truth.
10. **Consistent platform behavior:** Similar actions should use the same terminology, status semantics, error handling, and recovery patterns across portals.

## 9. Scope and Release Strategy

### 9.1 Foundation release

The foundation release includes:

- Institutionally scoped account creation or account provisioning.
- Login with approved authentication methods.
- Role-aware access to the correct portal.
- Profile completion or onboarding when required.
- Personal note creation, viewing, editing, and soft deletion.
- Teacher assignment creation.
- Student assignment completion marking.
- Assignment listing and status visibility.
- Server-side ownership and authorization checks.
- Responsive, accessible, and testable user flows.
- Basic monitoring for authentication, note, assignment, and completion failures.

### 9.2 Later releases

Potential later capabilities include:

- Classroom-shared notes.
- Note folders, tags, search, pinning, and archival.
- Attachments and controlled file uploads.
- Assignment submissions, attachments, grading, feedback, and resubmission.
- Assignment reminders and calendar integration.
- AI-assisted note organization or teacher feedback with provenance and human review.
- Offline drafts with conflict resolution.
- Collaborative real-time editing.
- Cross-campus analytics with privacy-preserving aggregation.

## 10. Core User Journeys

## 10.1 Journey A: Create an account

### Goal - Create an account

A new eligible user establishes an account that is connected to the correct identity, role, and academic scope.

### Preconditions - Create an account

- The user has an institution-approved identity or an invitation/provisioning record.
- The platform is available.
- The selected authentication method is configured for the environment.

### Main flow - Create an account

1. The user opens the authentication entry point.
2. The product explains the available sign-in or account activation options.
3. The user selects institution-approved authentication or enters an eligible registration, employee, or email identifier where password setup is allowed.
4. The server validates the identity evidence.
5. If the identity is new, the server creates or activates an account in an incomplete or pending state.
6. The product displays the required onboarding fields for the user's role.
7. The user provides required academic hierarchy details, such as campus, school, department, program, batch, or section where applicable.
8. The server validates that the hierarchy values are compatible and that the user is allowed to select or claim them.
9. The user accepts required policies and completes setup.
10. The server marks the profile complete only after all required validation succeeds.
11. The product routes the user to the appropriate portal or a pending-approval state.

### Alternate flows - Create an account

- The identity already exists: the product offers login rather than creating a duplicate account.
- The email domain is not eligible: account creation is rejected with a safe, actionable message.
- The identity is valid but academic mapping is pending: the account enters a waiting state without exposing unauthorized data.
- Required hierarchy data is invalid or inconsistent: the form preserves safe input and identifies the invalid field.
- The user closes the browser during onboarding: the account remains incomplete and can resume without creating a duplicate.
- The user retries after a timeout: the operation does not create duplicate accounts.

### Success criteria - Create an account

- Exactly one account is associated with the verified identity.
- The account has a clear status: incomplete, pending, active, suspended, or rejected.
- No protected academic data is accessible before authorization is complete.
- The user receives a clear next action.

### Why this matters - Create an account

A correct account foundation prevents duplicate identities, incorrect campus assignment, unauthorized classroom access, and confusing downstream behavior in notes and assignments.

## 10.2 Journey B: Login

### Goal - Login

An existing user enters the correct portal with an authenticated session and the permissions associated with their current account state.

### Main flow - Login

1. The user opens the login page.
2. The user selects an approved method, such as institution Google authentication or username/password fallback.
3. The client sends only the necessary authentication request.
4. The server verifies credentials or the external identity token.
5. The server evaluates account status, profile completion, role, and authorization state.
6. The server issues an authenticated session or token pair according to the approved architecture.
7. The client stores credentials according to the security design and loads the current-user profile.
8. The client routes the user to onboarding, waiting, the role portal, or a safe error state.
9. The product records the outcome for security and operational monitoring without logging secrets.

### Failure behavior

- Invalid credentials produce a generic authentication failure without revealing whether an account exists.
- Suspended or deactivated users see a clear support path and cannot access protected content.
- Expired sessions return the user to login without losing safe local draft data.
- Provider outages show a service-unavailable state rather than an apparent successful login.
- A user with incomplete onboarding is not shown an empty or unauthorized dashboard.

### Success criteria - Login

- A valid user can reach the correct workspace.
- An invalid or unauthorized user cannot reach protected content.
- Role and scope are loaded from the server, not trusted from client-editable values.
- Logout invalidates or removes the active client session according to the security design.

### Why this matters - Login

Every other workflow depends on a correct identity. A misleading login flow creates both security risk and product confusion.

## 10.3 Journey C: Create a note

### Goal - Create a note

An authenticated user records useful academic information in a note whose ownership, visibility, and save state are clear.

### Proposed initial note types

- **Personal note:** visible only to its owner unless explicitly shared by a future approved feature.
- **Teaching note:** created by a teacher for their own planning or classroom preparation; it is not automatically visible to students.
- **Classroom note:** reserved for a later release unless the product owner approves a shared visibility contract.

The first release should default to personal ownership. Sharing must never be inferred from a classroom relationship.

### Main flow - Create a note

1. The user opens Notes from the role-appropriate portal.
2. The product shows existing notes, an empty state, or a loading state.
3. The user selects Create note.
4. The product displays required and optional fields.
5. The user enters a title and note body.
6. The user may optionally select safe context such as course, classroom, lesson, or assignment if the user is authorized to see that context.
7. The user submits Save.
8. The client displays a saving state and prevents confusing duplicate submissions.
9. The server validates ownership, field length, content format, and any selected academic scope.
10. The server creates the note and records creation metadata.
11. The product displays the saved note and its last-saved timestamp.

### Required initial fields - Create a note

- Title.
- Body.
- Visibility or ownership mode, defaulting to personal and not allowing unsupported modes.

### Optional initial fields

- Classroom reference.
- Assignment reference.
- Subject or course reference.
- Tags, only if the initial design includes them.

### Empty and error states

- No notes: explain that the user has not created a note and provide a single clear action.
- Validation failure: identify the field and preserve the user's safe input.
- Network failure: state that the note was not confirmed as saved; do not claim success.
- Duplicate request: return the existing result or safely reject the duplicate according to the idempotency design.
- Unauthorized academic context: remove or reject the context rather than revealing it.

### Success criteria - Create a note

- The note appears in the user's note list after a confirmed save.
- The note is not visible to another user by changing a client-side identifier or URL.
- The displayed ownership and visibility match the server record.
- The user can return later and find the note.

### Why this matters - Create a note

Notes are only valuable if users trust that they are saved, private when expected, and connected to the right academic context.

## 10.4 Journey D: Edit a note

### Goal - Edit a note

An authorized owner updates a note without losing content, ownership, or audit-relevant metadata.

### Main flow - Edit a note

1. The user opens an owned note.
2. The product enters an editable state.
3. The user changes title, body, or permitted context.
4. The product indicates unsaved changes.
5. The user saves the update.
6. The server verifies that the note still exists, is active, and is owned or editable by the current user.
7. The server validates the complete updated representation.
8. The server persists the update and records the updated timestamp.
9. The product shows the confirmed state and clears the unsaved indicator.

### Concurrency and stale state

The first release may use last-write protection with a version or updated timestamp. If the server detects that the note changed after the user loaded it:

- Do not silently overwrite newer content.
- Tell the user that a newer version exists.
- Offer reload, compare, or copy-local-content behavior according to the design.

Real-time collaborative editing is not required for the foundation release.

### Success criteria - Edit a note

- Only authorized users can update the note.
- The updated content survives refresh.
- The product distinguishes saved from unsaved content.
- A stale client cannot silently erase a newer update.

### Why this matters - Edit a note

Editing is the normal way knowledge becomes useful. Silent overwrite or false save confirmation destroys trust quickly.

## 10.5 Journey E: Delete a note

### Goal - Delete a note

An authorized user removes a note from normal views without accidental irreversible loss.

### Product behavior

EduAI's existing project rules favor soft deletion for domain records. The note workflow should therefore use a recoverable delete unless a separate retention decision says otherwise.

### Main flow - Delete a note

1. The user opens an owned note or selects it from the note list.
2. The user chooses Delete.
3. The product explains what deletion means and identifies the note title.
4. The user confirms.
5. The server verifies ownership and active status.
6. The server marks the note inactive and records deletion metadata.
7. The note disappears from the standard active list.
8. The product confirms deletion and offers undo for a short, clearly defined period if supported.

### Rules - Delete a note

- A cancelled confirmation does not alter the note.
- A deleted note is not returned by ordinary active-note queries.
- A restore operation, if exposed, is permission-controlled and auditable.
- Deleting a note must not delete an assignment, submission, classroom, or official academic record linked to it.
- If the note is referenced by another record, the product must define whether the reference remains, is hidden, or is replaced by a deleted placeholder.

### Success criteria - Delete a note

- The note is absent from active views after confirmed deletion.
- Unauthorized users cannot delete another user's note.
- The deletion is recoverable or clearly governed by retention policy.
- No unrelated academic record is changed.

### Why this matters - Delete a note

Users need control over personal content, while institutions need a safe and auditable record lifecycle.

## 10.6 Journey F: Create an assignment

### Goal - Create an assignment

An authorized teacher creates a clear piece of academic work for a permitted classroom or academic scope.

### Preconditions - Create an assignment

- The teacher is authenticated.
- The teacher has an active role and an authorized classroom or course.
- The target classroom exists and is active.
- The teacher is not creating work for an out-of-scope campus, program, batch, section, or classroom.

### Main flow - Create an assignment

1. The teacher opens the classroom or Assignments area.
2. The product shows existing assignments and a Create assignment action.
3. The teacher enters a title, instructions, and optional context.
4. The teacher selects a target classroom or permitted academic scope.
5. The teacher sets a due date and time zone where deadlines apply.
6. The teacher chooses a publication state: draft or published.
7. The teacher optionally adds allowed attachments or links after file validation rules are satisfied.
8. The teacher previews the assignment as a student would see it.
9. The teacher saves the draft or publishes it.
10. The server validates ownership, scope, dates, content, and attachments.
11. The product displays the resulting status and makes the assignment visible according to its publication state.

### Required initial fields - Create an assignment

- Title.
- Instructions.
- Target classroom or academic scope.
- Publication status.

### Recommended fields

- Due date and time zone.
- Maximum points or completion-only mode.
- Attachment metadata.
- Availability window.
- Submission instructions.
- Late policy.

### Assignment states

- `draft`: visible to authorized creators, not students.
- `published`: visible to eligible students.
- `closed`: no new completion or submission actions unless policy permits.
- `archived`: retained for history but removed from active workflow.
- `deleted`: soft-deleted or otherwise governed by the platform record policy.

### Rules - Create an assignment

- A teacher cannot publish to a classroom they do not own or manage.
- The client cannot bypass draft visibility by guessing an identifier.
- Due dates must be interpreted consistently across display, validation, and reporting.
- Editing a published assignment must not silently rewrite completed student records.
- Changes that affect student expectations should show an updated timestamp or revision indication.

### Success criteria - Create an assignment

- The teacher sees a confirmed assignment with the intended status and scope.
- Eligible students can see a published assignment.
- Ineligible users cannot access it.
- The assignment definition is distinct from each student's completion or submission record.

### Why this matters - Create an assignment

Assignments are a contract between teacher and student. Clear ownership, scope, instructions, and timing are necessary for fairness and reliable reporting.

## 10.7 Journey G: Mark an assignment complete

### Goal - Mark an assignment complete

A student records that they have completed an assignment or required activity, and the platform reflects the server-confirmed state without conflating completion with grading.

### Terminology decision

The product must distinguish:

- **Completion marker:** the student says the work is complete.
- **Submission:** the student sends content for teacher review.
- **Grade:** an authorized teacher or grading process evaluates work.
- **Feedback:** a teacher or approved workflow responds to the work.

The foundation release may support a completion marker. It must not label that marker as a grade or verified academic result.

### Main flow - Mark an assignment complete

1. The student opens an active published assignment.
2. The product shows instructions, due date, current status, and any submission requirements.
3. The student selects Mark complete.
4. The product requests confirmation if the action is consequential or difficult to reverse.
5. The client sends the completion command.
6. The server verifies enrollment, assignment visibility, assignment state, and whether completion is allowed.
7. The server creates or updates the student's completion record idempotently.
8. The product displays the confirmed completion time and updated status.
9. The teacher's authorized view reflects the status after refresh or supported real-time update.

### Alternate flows - Mark an assignment complete

- The assignment is closed: the student sees why completion is unavailable.
- The student is no longer enrolled: the action is rejected and protected data is not exposed.
- The request times out: the product says the result is unconfirmed and allows a safe refresh or retry.
- The student clicks repeatedly: the server returns one stable completion record rather than duplicates.
- The assignment requires a submission: completion may remain pending until the required submission exists, according to the approved requirement.
- The due date has passed: the product shows late behavior according to policy; it does not silently change the timestamp.

### Success criteria - Mark an assignment complete

- A student can mark eligible work complete once or safely repeat the command.
- The state is visible to the student and authorized teacher.
- Another student's completion cannot be created or changed by altering client identifiers.
- Completion does not create or change a grade unless an explicit grading workflow does so.

### Why this matters - Mark an assignment complete

Students need a simple progress signal, and teachers need reliable visibility. Keeping completion separate from grading protects academic integrity and avoids misleading analytics.

## 11. Functional Requirements

Each requirement has an identifier so that architecture, design, tasks, tests, security review, and release evidence can trace back to the product contract.

### 11.1 Account and identity requirements

#### PRD-AUTH-001: Begin account access

The product must provide an authentication entry point that explains available institution-approved methods and does not imply that an unverified user has access.

**Acceptance criteria:**

- A new user can start the approved account or activation path.
- The interface identifies required information before submission.
- The system does not expose account existence through unsafe error wording.

#### PRD-AUTH-002: Prevent duplicate identities

The platform must associate a verified identity with at most one active account according to the approved identity policy.

**Acceptance criteria:**

- Repeated account activation is idempotent or routes to login.
- Duplicate email, registration number, or employee number conflicts are handled safely.
- The user receives a clear next action.

#### PRD-AUTH-003: Complete role-aware onboarding

A new user must complete the required profile and academic mapping before receiving protected feature access.

**Acceptance criteria:**

- Required fields differ appropriately by role.
- Invalid hierarchy combinations are rejected.
- Incomplete accounts cannot read protected classroom, note, or assignment content.

#### PRD-AUTH-004: Log in

An active authorized user must be able to log in through the approved authentication method and reach the correct portal.

**Acceptance criteria:**

- Valid credentials succeed.
- Invalid credentials fail safely.
- Suspended, deleted, or pending accounts cannot access protected features.
- The current-user role and scope come from server-validated data.

#### PRD-AUTH-005: End a session

A user must be able to log out and the client must remove or invalidate the session according to the security contract.

**Acceptance criteria:**

- Protected pages cannot be used after logout.
- Back-button navigation does not expose authenticated data from active client state.
- A subsequent user on the same device does not inherit the previous user's session.

### 11.2 Note requirements

#### PRD-NOTE-001: List owned notes

An authenticated user must be able to view active notes they own or are explicitly authorized to view.

**Acceptance criteria:**

- Results are scoped server-side.
- Deleted notes are excluded from the active list.
- Loading, empty, error, and populated states are defined.

#### PRD-NOTE-002: Create a note

An authorized user must be able to create an active note with a title and body.

**Acceptance criteria:**

- Required fields are validated.
- The server assigns ownership and timestamps.
- The created note appears after confirmed persistence.
- Failed requests do not display false success.

#### PRD-NOTE-003: Edit an owned note

An authorized owner must be able to update permitted note fields.

**Acceptance criteria:**

- Ownership is checked server-side.
- Changes persist after refresh.
- Unsaved and saved states are distinguishable.
- Stale updates are handled according to the concurrency decision.

#### PRD-NOTE-004: Soft-delete an owned note

An authorized owner must be able to remove an active note from normal views without affecting unrelated records.

**Acceptance criteria:**

- Confirmation is required for destructive intent.
- Deleted notes disappear from active views.
- The deletion is recorded according to the retention and audit decision.
- Unauthorized deletion fails.

#### PRD-NOTE-005: Preserve note privacy

A user must not access another user's personal note by changing a route, query parameter, request body, or client-side state.

**Acceptance criteria:**

- Direct object access is denied.
- List endpoints do not leak unauthorized note metadata.
- Search, filters, previews, exports, and related references use the same scope rules.

### 11.3 Assignment requirements

#### PRD-ASSIGN-001: Create a draft assignment

An authorized teacher must be able to create a draft assignment for a permitted classroom or academic scope.

**Acceptance criteria:**

- Required fields are validated.
- The teacher can save without exposing the draft to students.
- The assignment is associated with the correct creator and scope.

#### PRD-ASSIGN-002: Publish an assignment

An authorized teacher must be able to publish a valid assignment to eligible students.

**Acceptance criteria:**

- The target scope is validated.
- Students in scope can see the assignment.
- Students outside scope cannot see it.
- The publication timestamp is recorded.

#### PRD-ASSIGN-003: View assignments

Students and teachers must see assignments appropriate to their role, scope, and state.

**Acceptance criteria:**

- Students see published assignments for eligible classrooms.
- Teachers see owned or managed assignments.
- Draft and archived visibility follows the state rules.
- Status labels are consistent across list and detail views.

#### PRD-ASSIGN-004: Mark an assignment complete

An eligible student must be able to create or update one completion record for an active assignment.

**Acceptance criteria:**

- Enrollment and assignment visibility are checked server-side.
- Repeated requests do not create duplicate completion records.
- The completion time is server-confirmed.
- Completion is separate from grade and submission state.

#### PRD-ASSIGN-005: Display completion status

The student and authorized teacher must see a consistent completion state after persistence.

**Acceptance criteria:**

- Student sees their own state.
- Teacher sees eligible student states.
- Unauthorized users see neither protected details nor inferential metadata.
- Status updates are eventually consistent only where the product explicitly permits it.

#### PRD-ASSIGN-006: Protect completed work from accidental definition changes

Editing or closing an assignment must not silently erase or corrupt existing student completion records.

**Acceptance criteria:**

- Existing completion records remain linked to the assignment revision or policy-defined record.
- Material changes are visible to affected users.
- Closed or deleted assignment behavior is documented and tested.

## 12. Data and Content Requirements

### 12.1 Account data

The product may need:

- Verified email or identity provider subject.
- Registration number or employee number where applicable.
- Role.
- Name and profile details.
- Campus, school, department, program, batch, and section relationships.
- Profile completion state.
- Account status.
- Creation, update, activation, and deactivation timestamps.

The product must not collect fields that are not needed for access, academic context, support, or an approved product outcome.

### 12.2 Note data

A note record should conceptually include:

- Stable identifier.
- Owner.
- Title.
- Body.
- Visibility mode.
- Optional approved academic context.
- Creation timestamp.
- Last updated timestamp.
- Active or deleted state.
- Deletion metadata where policy requires it.
- Version or concurrency metadata if stale-edit protection is used.

The exact schema belongs in architecture and decisions documents.

### 12.3 Assignment data

An assignment record should conceptually include:

- Stable identifier.
- Creator.
- Target classroom or academic scope.
- Title.
- Instructions.
- Publication state.
- Creation and publication timestamps.
- Due date and time zone when applicable.
- Last updated timestamp.
- Revision or change metadata when material edits are allowed.
- Attachment metadata, if attachments are included.
- Soft-delete or archive state.

### 12.4 Completion data

A completion record should conceptually include:

- Stable identifier.
- Assignment.
- Student.
- Server-confirmed completion timestamp.
- Current state.
- Optional note or submission relationship only if separately approved.
- Created and updated timestamps.

A completion record must not be used to infer a grade unless a separate approved rule explicitly defines that behavior.

## 13. Authorization and Visibility Requirements

The product must enforce authorization at the API and data-access boundary, not only by hiding buttons in the UI.

### 13.1 Ownership rules

- A user can read active personal notes they own.
- A user can edit or delete only notes they own or are explicitly granted permission to manage.
- A teacher can create assignments only for classrooms or scopes they manage.
- A student can view and complete assignments only when enrolled and eligible.
- An administrator can access records only within their assigned authority or an explicitly audited support action.

### 13.2 Scope rules

Scope may include:

- Institution.
- Campus.
- School.
- Department.
- Program.
- Batch.
- Section.
- Classroom.
- Individual user.

The narrowest applicable scope must be respected. A campus relationship must not automatically grant access to every student's private notes.

### 13.3 Deleted and inactive records

- Active views exclude soft-deleted records.
- Deleted users cannot use active sessions.
- Deleted assignments follow an explicit retention and student-history policy.
- Restore operations are restricted and auditable.
- Deleting a parent entity must not unexpectedly hard-delete protected academic records.

## 14. User Experience Requirements

### 14.1 Global states

Every feature must define:

- Initial loading.
- Empty state.
- Validation error.
- Unauthorized state.
- Not-found state.
- Network failure.
- Server failure.
- Retry state.
- Success confirmation.
- Stale or unsaved state where editing applies.

### 14.2 Forms

- Labels must be persistent and associated with controls.
- Required fields must be identified before submission.
- Errors must be attached to the relevant field and summarized accessibly.
- Input must be preserved after recoverable validation or network failure.
- Destructive actions require clear confirmation.
- Focus must move predictably after submit, error, dialog close, and route change.

### 14.3 Responsive behavior

The foundation workflows must be usable at:

- 375px mobile width.
- 768px tablet width.
- 1024px laptop width.
- 1440px desktop width.

No required action may be hidden solely because the viewport is narrow. Tables and assignment status views must have an intentional mobile representation.

### 14.4 Content language

Use consistent terms:

- Account, not profile, when referring to authentication identity.
- Note, not document, for the initial note capability.
- Assignment, not task, for academic work.
- Mark complete, not submit, when no content submission occurs.
- Submitted, graded, returned, and completed only when their distinct meanings apply.

## 15. Non-Functional Requirements

### 15.1 Reliability

- Confirmed saves must survive page refresh and normal service restart.
- Retries must not create duplicate account, note, assignment, or completion records.
- Background or provider failures must produce a visible, recoverable state.
- WebSocket or polling behavior used by adjacent features must not corrupt REST-backed state.

### 15.2 Performance

Initial targets for the foundation release:

- Authentication response: p95 under 2 seconds in a healthy preview environment, excluding external provider interaction.
- Active note list: p95 under 1 second for a normal user dataset.
- Note save: p95 under 1.5 seconds for normal text content.
- Assignment list: p95 under 1.5 seconds for a normal classroom.
- Completion action: p95 under 1.5 seconds and visibly confirmed to the student.

These are starting targets and must be measured against representative data before being treated as an SLA.

### 15.3 Accessibility

- Meet WCAG 2.2 AA goals for foundation workflows where practical.
- Support keyboard-only completion of authentication, note, and assignment actions.
- Provide meaningful names and instructions for assistive technologies.
- Do not rely on color alone for status.
- Respect reduced-motion preferences.
- Ensure error and success messages are perceivable.

### 15.4 Privacy

- Collect only necessary personal and academic data.
- Avoid sensitive content in logs and analytics payloads.
- Do not send private notes to third-party AI providers without a separate approved requirement and consent policy.
- Define retention, export, correction, and deletion behavior before production launch.

### 15.5 Compatibility

- API clients must handle documented response and error shapes.
- Frontends must not assume a user role or scope from local storage alone.
- Contract changes must be versioned or rolled out compatibly.
- Existing classroom, authentication, and assignment flows must be regression-tested when the foundation is integrated.

## 16. Measurement Plan

### 16.1 Activation metrics

- Account activation completion rate.
- Time from first authentication to active portal access.
- Percentage of users blocked by incomplete or incorrect academic mapping.
- Login success rate by authentication method.
- Rate of duplicate-account conflicts.

### 16.2 Note metrics

- Percentage of active users who create at least one note.
- Time from opening the note form to confirmed save.
- Note save failure rate.
- Edit success rate.
- Delete and restore rate where restore is available.
- Unauthorized access attempts.
- Percentage of note sessions with unsaved content at exit.

Do not measure or expose note body content in product analytics.

### 16.3 Assignment metrics

- Assignments created per active teacher.
- Draft-to-published conversion rate.
- Time to create and publish an assignment.
- Percentage of eligible students who view an assignment.
- Completion rate by due-date policy.
- Duplicate completion request rate.
- Completion persistence failure rate.
- Teacher review or follow-up rate in releases that include submissions.

### 16.4 Trust and quality metrics

- Incorrect authorization rate.
- Data correction incidents.
- Support tickets related to missing notes or incorrect assignment status.
- API error rate by journey.
- Client error and crash rate.
- Median and p95 load and save times.
- Accessibility defects found before release.

## 17. Analytics and Event Requirements

Events should describe behavior without including private content. Suggested events:

- `account_activation_started`
- `account_activation_completed`
- `login_succeeded`
- `login_failed`
- `profile_setup_required`
- `note_create_started`
- `note_created`
- `note_updated`
- `note_deleted`
- `assignment_draft_created`
- `assignment_published`
- `assignment_viewed`
- `assignment_completion_requested`
- `assignment_completed`
- `assignment_completion_failed`

Each event should include only approved metadata such as feature, role, campus scope where safe, outcome, duration, client type, and correlation identifier. Event definitions must not become a side channel for private note titles, note bodies, student content, credentials, or sensitive academic values.

## 18. Error and Recovery Requirements

The product must distinguish at least:

- Invalid input.
- Unauthenticated request.
- Authenticated but unauthorized request.
- Resource not found or no longer active.
- Conflict or stale update.
- Rate limit.
- Dependency unavailable.
- Unexpected server error.

User-facing errors should answer:

1. What happened?
2. Did the requested change definitely save?
3. What can the user do next?
4. Is support required?

The product must never show a success state solely because a request was initiated. Success means the server confirmed the operation.

## 19. Release Acceptance Criteria

The foundation release is acceptable only when all of the following are true:

### Account and login

- A valid eligible user can create or activate an account.
- A valid existing user can log in.
- Incomplete, inactive, or unauthorized users cannot access protected content.
- Role-aware routing works for student, teacher, and administrative states.
- Logout and session expiry are handled.

### Notes

- An authenticated user can create a personal note.
- The user can edit the note and see the change after refresh.
- The user can delete the note and it leaves active views.
- Another user cannot access, edit, or delete the note.
- Loading, empty, validation, network, and server-error states are present.
- Note privacy is preserved in APIs, UI lists, search, and logs.

### Assignments

- An authorized teacher can create a draft assignment.
- The teacher can publish it to an eligible classroom.
- Eligible students can view it.
- Ineligible users cannot view it.
- An eligible student can mark it complete.
- Repeated completion requests do not duplicate records.
- The student and teacher see a consistent confirmed status.
- Completion remains distinct from grading and submission.

### Quality and operations

- Automated tests cover positive, negative, authorization, retry, and state-transition paths.
- Security review has no unresolved critical or high-risk release blocker.
- Preview deployment is reproducible.
- Monitoring identifies authentication, note, assignment, and completion failures.
- Documentation and decision records match the shipped behavior.

## 20. Risks and Mitigations

| Risk | Impact | Mitigation | Owner |
| --- | --- | --- | --- |
| Account mapping assigns the wrong campus or role | Unauthorized access and incorrect reporting | Server-side hierarchy validation, approval state, audit events, onboarding tests | Identity owner |
| Note visibility is inferred from classroom membership | Privacy breach | Default personal visibility, explicit sharing contract, object-level authorization tests | Notes owner |
| Client shows a false save success | Data loss and loss of trust | Confirmed server response, retry state, idempotency, failure tests | Frontend and API owners |
| Completion is mistaken for grading | Academic integrity issue | Separate statuses, labels, data model, and acceptance tests | Assignments owner |
| Published assignment edits change student expectations silently | Fairness and disputes | Revision metadata, change policy, teacher confirmation, notification decision | Product owner |
| Duplicate requests create duplicate records | Corrupt progress and reporting | Idempotency keys or unique constraints, retry tests | Backend owner |
| Existing frontend and backend contracts diverge | Broken portals | Contract tests, typed clients, compatibility rollout | Platform owner |
| Soft-delete behavior is inconsistent | Data loss or confusing lists | Shared lifecycle rules, restore policy, migration tests | Data owner |
| AI or external providers receive private content | Privacy and compliance exposure | Keep AI out of foundation notes, provider boundary review, redaction | Security owner |
| Network interruption loses student work | Frustration and incomplete records | Preserve local input, explicit unconfirmed state, recovery testing | UX owner |

## 21. Open Product Decisions

These decisions must be resolved before implementation is considered complete:

1. Is note content strictly personal in the foundation release, or can a teacher create classroom-visible notes?
2. Should notes be available in all three portals or only `teacherbuddy` and `edugames` initially?
3. Is a student completion marker sufficient, or must the first assignment release include a content submission?
4. Can students undo completion, and under what conditions?
5. Which assignment changes are allowed after publication?
6. What is the due-date and late-completion policy?
7. Is assignment completion a required prerequisite for a submission, or only a separate progress signal?
8. What identity sources are approved for account creation in each campus?
9. Which users require administrator approval before activation?
10. What retention and restore policy applies to notes and assignment records?
11. Which administrative roles may restore soft-deleted records?
12. Which analytics are allowed to include campus or classroom dimensions without exposing individual student behavior?
13. What service-level targets become production commitments after preview measurement?
14. Which existing implementation gaps must be fixed before this foundation is released?

## 22. Traceability Map

| Product area | Requirement IDs | Primary portal | Likely backend domain | Evidence needed |
| --- | --- | --- | --- | --- |
| Account creation | PRD-AUTH-001 to PRD-AUTH-003 | All portals | `backend/apps/accounts` | Identity, onboarding, hierarchy, permission tests |
| Login | PRD-AUTH-004 to PRD-AUTH-005 | All portals | `backend/apps/accounts`, shared auth clients | Token/session, route guard, logout tests |
| Notes | PRD-NOTE-001 to PRD-NOTE-005 | Initial portal decision pending | New or selected academic/content domain | Ownership, lifecycle, privacy, UI state tests |
| Assignment authoring | PRD-ASSIGN-001 to PRD-ASSIGN-003 | `teacherbuddy` | `backend/apps/assignments`, classrooms | Scope, publication, contract, browser tests |
| Assignment completion | PRD-ASSIGN-004 to PRD-ASSIGN-006 | `edugames` and `teacherbuddy` | `backend/apps/assignments` | Enrollment, idempotency, status, regression tests |
| Administration | Cross-cutting | `eduai` | `backend/apps/master_admin`, core | Scope, audit, restore, operational tests |

## 23. Definition of Ready

A feature slice is ready for architecture and design when:

- The primary user and desired outcome are named.
- The user journey includes success and failure paths.
- Ownership and authorization are explicit.
- Data fields and retention expectations are understood.
- Status vocabulary is agreed.
- Acceptance criteria are testable.
- Non-goals prevent scope drift.
- Open decisions have owners and due dates.
- Existing EduAI behavior and migration risk have been checked.

## 24. Definition of Product Done

The product requirement is satisfied when:

- The shipped behavior matches the approved requirement IDs.
- The appropriate frontend surfaces implement the intended flow.
- The backend enforces identity, scope, ownership, and state transitions.
- The user can understand loading, success, failure, and recovery states.
- Tests cover normal, invalid, unauthorized, repeated, stale, and unavailable conditions.
- Security review and code review are complete.
- Preview and QA evidence exist.
- Production monitoring can detect user-impacting failure.
- Any deviation is documented as a decision rather than silently accepted.

## 25. Handoff to the Next Documents

The next project documents should use this PRD as their source of truth:

- `ARCHITECTURE.md` defines how the requirements are implemented across frontends, backend domains, data, authentication, APIs, and deployment.
- `DESIGN.md` defines how the workflows look, feel, and behave across viewports and states.
- `TEST_PLAN.md` maps every requirement to unit, integration, contract, end-to-end, accessibility, security, and operational checks.
- `SECURITY.md` turns the privacy, identity, authorization, input, data, and operational requirements into enforceable controls.
- `DECISIONS.md` records permanent choices, especially note visibility, completion semantics, identity, deletion, and migration behavior.
- `MEMORY.md` records the current implementation state, active task, completed work, known issues, and next step.

The PRD answers **what** EduAI should do and **why** it matters. It does not authorize implementation choices that contradict the product, security, or academic-integrity requirements above.
