# EduAI Suite v2 Security Architecture and Operating Standard

**Document status:** Security baseline for product and engineering review  
**Product:** EduAI Suite v2  
**Primary release:** Academic workspace foundation  
**Last updated:** 2026-09-20  
**Requirements source:** [docs/PRD.md](docs/PRD.md)  
**Architecture source:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  
**Test source:** [docs/TEST_PLAN.md](docs/TEST_PLAN.md)  
**Security owner:** Engineering, security, and operations team

## 1. Purpose

This document defines the security architecture, privacy rules, secure development requirements, verification strategy, incident response expectations, and current security gaps for EduAI Suite v2.

EduAI handles identity, institutional hierarchy, classroom membership, assignments, student completion records, private notes, uploaded files, generated reports, AI prompts, analytics, and administrative actions. A security failure can expose personal information, cross-campus data, academic records, provider credentials, or operational infrastructure. Security is therefore part of product correctness, not a later hardening phase.

This document distinguishes three states:

- **Current:** behavior evidenced in the repository today.
- **Required:** controls that must be true for the foundation release or production operation.
- **Target:** a planned improvement that may require implementation and a recorded decision.

A control must not be described as complete merely because the framework has a configuration option for it.

## 2. Security Position

EduAI follows these security principles:

1. **The browser is untrusted.** Client-side route guards, hidden buttons, and local state do not authorize access.
2. **Authentication identifies; authorization decides.** A valid token does not grant access to every object or operation.
3. **Academic scope is a security boundary.** Campus, school, department, program, batch, section, classroom, and enrollment relationships must be enforced server-side.
4. **Private by default.** Personal notes, student records, uploaded files, and provider prompts are visible only to the minimum authorized audience.
5. **Server-confirmed state is authoritative.** A client checkbox is not an official completion record until the server validates and persists it.
6. **Least privilege applies to users, services, workers, storage, and providers.**
7. **Secrets never belong in source code, browser bundles, logs, URLs, screenshots, or test fixtures.**
8. **Failure must be safe and legible.** Errors should not leak sensitive data, and users should not be told that a failed mutation succeeded.
9. **Critical actions are auditable.** Privileged changes, recovery actions, authentication events, and academic state transitions need safe traceability.
10. **Security controls are tested through negative cases.** A happy-path login test cannot prove tenant isolation.

## 3. Current Security Baseline

### 3.1 Current platform

The repository uses:

- Django 5.1 and Django REST Framework.
- A custom `accounts.User` model.
- Custom JWT authentication in `backend/apps/accounts/authentication.py`.
- Google OAuth identity verification through Google libraries.
- PostgreSQL in the Docker Compose path and SQLite fallback for development.
- Redis for Celery and the configured Channels layer.
- Daphne as the ASGI server.
- Three Vite and React portals.
- Supabase Storage integration through a server-side service-role key.
- Groq integration for AI capabilities.
- Soft deletion through `SoftDeleteModel` and active-only default managers.

### 3.2 Current positive controls

The current codebase already provides useful foundations:

- Passwords are handled through Django's password hashing API.
- The custom JWT authentication checks the token type and expiration through PyJWT.
- Inactive users are rejected by the JWT authenticator.
- Production settings set `DEBUG = False`.
- Production settings enable secure session and CSRF cookies.
- Production settings set `X_FRAME_OPTIONS = 'DENY'` and content-type sniffing protection.
- The custom user model has a unique email and role field.
- Domain permission classes exist for master admin, campus admin, teacher, and student roles.
- Master admin views use authentication plus an `IsMasterAdmin` permission.
- Soft deletion preserves records for recovery and audit-oriented workflows.
- Supabase uploads enforce a configured maximum byte size.
- Supabase downloads can use signed URLs rather than public object URLs.
- The frontend development proxies avoid putting backend credentials in client code.

These controls still require tests and complete endpoint coverage.

### 3.3 Current high-risk findings

The following are current risks, not hypothetical recommendations:

| ID | Finding | Impact | Required disposition |
| --- | --- | --- | --- |
| `SEC-CURRENT-001` | Base DRF permission default is `AllowAny` | A newly added endpoint can be public by omission | Change the default to authenticated access and explicitly allow only documented public endpoints |
| `SEC-CURRENT-002` | Many domain views explicitly use `AllowAny` | Academic, analytics, games, assignments, reports, and other data may be reachable without authentication | Inventory every route and replace accidental public access with role and scope permissions |
| `SEC-CURRENT-003` | Development defaults include a predictable Django secret key | Token forgery or session compromise if used outside isolated local development | Fail startup when production secrets are missing or weak |
| `SEC-CURRENT-004` | `JWT_SECRET_KEY` falls back to `SECRET_KEY` | Rotation and trust boundaries are coupled; weak fallback can sign tokens | Require a separate high-entropy token key in non-development environments |
| `SEC-CURRENT-005` | JWT validation currently checks signature, algorithm, type, and expiration but not issuer or audience | Tokens from another environment or intended consumer may be accepted if keys are reused | Add issuer, audience, key ID, and environment separation |
| `SEC-CURRENT-006` | Refresh tokens are self-contained and refresh rotation or revocation is not shown | A stolen refresh token may remain usable until expiry | Add rotation, reuse detection, revocation, and account deactivation handling |
| `SEC-CURRENT-007` | Development allows all origins when `DEBUG` is true and credentials are enabled | Local misconfiguration can become cross-origin exposure | Allow an explicit origin list and fail closed outside local development |
| `SEC-CURRENT-008` | Docker Compose contains development database credentials and publishes services on host ports | Intended for local use only; unsafe if exposed beyond a trusted developer machine | Keep local-only, isolate production networks, and use managed secret injection |
| `SEC-CURRENT-009` | ASGI `ProtocolTypeRouter` has HTTP only; frontend WebSocket support is not backend support | Real-time clients may connect to an unprotected or unavailable path | Wire authenticated consumers before enabling production WebSocket claims |
| `SEC-CURRENT-010` | Repository-wide view inventory shows broad `AllowAny` usage | Permission coverage is inconsistent and difficult to reason about | Add route inventory and authorization matrix as a release gate |
| `SEC-CURRENT-011` | Supabase service-role key is used by a backend adapter | Key compromise grants broad storage privileges | Keep key server-only, rotate it, restrict bucket policy, and never return it to clients |
| `SEC-CURRENT-012` | Some current endpoints and legacy paths predate the foundation authorization design | Legacy paths may bypass newer policy | Treat legacy routes as a migration risk and test them separately |

These findings should be tracked with owners and deadlines. They must not be hidden by a general statement that Django or DRF is secure by default.

## 4. Threat Model

### 4.1 Protected assets

- User identities, email addresses, phone numbers, avatars, registration numbers, and employee numbers.
- Password hashes and authentication tokens.
- Campus, school, department, program, batch, section, classroom, and enrollment data.
- Personal notes and future shared learning content.
- Assignment definitions, completion records, submissions, grades, and feedback.
- Uploaded presentations, documents, images, OMR artifacts, and generated reports.
- AI prompts, provider responses, and generated content.
- Audit events, request identifiers, operational logs, and support data.
- Database credentials, Django keys, JWT keys, Google credentials, Groq keys, storage service-role keys, and Redis credentials.
- Queue messages and transient real-time session state.

### 4.2 Trust boundaries

```text
Untrusted browser
  -> public edge / reverse proxy
  -> frontend static assets
  -> Django API and ASGI server
  -> domain authorization boundary
  -> PostgreSQL / Redis / object storage
  -> Celery workers and external providers
```

Additional boundaries include:

- One student versus another student.
- One teacher's classroom versus another teacher's classroom.
- Campus A versus Campus B.
- Regular user versus campus administrator.
- Campus administrator versus master administrator.
- Application process versus Celery worker.
- Backend service versus Supabase or Groq.
- Local development versus preview or production.
- Public authentication endpoints versus authenticated academic endpoints.

### 4.3 Threat actors

Consider:

- Anonymous internet users probing public and legacy endpoints.
- A normal student attempting horizontal access to another student's records.
- A teacher attempting access to a classroom outside their scope.
- A compromised student or teacher token.
- A malicious or careless administrator.
- A support operator using excessive access to diagnose an incident.
- A browser extension or malicious script running in a user's browser.
- An attacker who obtains a storage object key or signed URL.
- A compromised dependency or CI runner.
- A provider or queue failure that causes unsafe retries or data disclosure.
- A developer accidentally deploying local defaults or test data.

### 4.4 Primary abuse cases

- Forge or replay an access or refresh token.
- Change a posted `user_id`, `owner_id`, `student_id`, `campus_id`, or `classroom_id` to bypass scope.
- Read a personal note through an unfiltered list, search, count, or detail endpoint.
- Mark another student as complete or create duplicate official completion records.
- Modify or publish another teacher's assignment.
- Download a private upload by guessing a path or reusing a signed URL.
- Upload a malicious file, oversized file, path traversal name, or disguised content type.
- Inject script into note, assignment, chat, report, or classroom content.
- Abuse AI endpoints for prompt injection, sensitive data exfiltration, cost exhaustion, or unsafe generated output.
- Use a public endpoint as an anonymous proxy to query internal or provider resources.
- Exploit error messages, timing, counts, or search results to discover private objects.
- Cause queue duplication through retries after a partial provider or storage success.
- Use a stale WebSocket connection to issue commands after authorization changes.

## 5. Security Ownership and Accountability

### 5.1 Engineering

Engineering owns:

- Secure defaults in settings and endpoint declarations.
- Authentication and authorization implementation.
- Input validation, output filtering, and query scoping.
- Dependency updates and vulnerability remediation.
- Security tests and regression coverage.
- Safe migrations and rollback or forward-fix plans.

### 5.2 Product and design

Product and design own:

- Privacy expectations and user-facing visibility language.
- Whether a workflow is personal, classroom-scoped, institution-scoped, or administrative.
- Safe wording for access denial, pending state, and failure recovery.
- Avoiding UI claims that imply unsupported security or academic state.

### 5.3 Operations

Operations owns:

- Secret storage and rotation execution.
- Network, TLS, firewall, database, Redis, storage, and deployment controls.
- Logging, alerting, backups, restore testing, and incident response.
- Production access review and environment separation.

### 5.4 Administrators and support

Privileged users must:

- Use named accounts, not shared credentials.
- Use strong authentication and approved devices or networks.
- Access the minimum scope required for the task.
- Avoid copying private content into tickets or chat.
- Record support or recovery actions when the system provides an audit path.
- Report suspected account compromise or data exposure immediately.

## 6. Authentication

### 6.1 Account identity

The custom `accounts.User` model is the identity root. Email, registration number, and employee number have different operational meaning and must not be treated as interchangeable identifiers without a documented policy.

Required controls:

- Normalize and case-fold email consistently.
- Enforce uniqueness in the database and service layer.
- Do not use a user-controlled role, campus, or academic scope as proof of identity.
- Do not expose whether an account exists when doing so would enable account enumeration.
- Require account activation or approval rules appropriate to the institution.
- Prevent inactive, deleted, suspended, or denied users from accessing protected data.
- Define how identity changes affect existing tokens and sessions.

### 6.2 Google authentication

Google login must:

- Verify the ID token signature and issuer through the supported Google library.
- Check the configured client ID or audience.
- Require a verified email when product policy requires it.
- Validate issuer, expiration, and token type through the provider library.
- Map the identity to an existing or explicitly provisioned account.
- Avoid accepting a client-supplied role as authority.
- Avoid silently changing a user's existing role based only on the selected frontend application.
- Record safe authentication outcome metadata without storing raw provider tokens.
- Return generic failure messages that do not disclose account existence unnecessarily.

The current implementation derives a role from the `app` request value for new Google users. This is a security-sensitive product decision. The server must use institution provisioning or an approved mapping policy as the authority for role assignment.

### 6.3 Password authentication

Password behavior must include:

- Django's password hashing and password validators.
- Minimum length and breached-password policy appropriate to the institution.
- Rate limiting and progressive delay for repeated failures.
- Generic invalid-credential responses.
- No password logging, echoing, or inclusion in analytics.
- Password reset tokens that are single-use, short-lived, and revocable.
- Notification of security-sensitive changes through an approved channel.
- Session or refresh-token invalidation after a password reset where required.

The current profile setup requires a password of at least six characters. This is a development baseline, not necessarily an acceptable production policy.

### 6.4 JWT access tokens

The current custom authentication uses an HS256 access token containing `sub`, `email`, `role`, `type`, `iat`, and `exp`. The target contract must additionally define:

- A separate high-entropy signing secret or asymmetric key per environment.
- Strict algorithm allow-listing; never accept an algorithm from the token header without policy validation.
- `iss` issuer validation.
- `aud` audience validation.
- `jti` unique token identifier.
- Key identifier (`kid`) for planned key rotation where applicable.
- Short access-token lifetime.
- Clear handling of clock skew.
- Account active or session-version checks.
- No sensitive or mutable authorization state that cannot be revoked in the token alone.

Authorization must not trust only the role embedded in a token if the user can be suspended, moved between campuses, or have permissions changed before expiry. The server should load current authorization state or use a revocable session version for sensitive operations.

### 6.5 Refresh tokens

The target refresh design must include:

- Refresh-token rotation after successful use.
- Single-use token families or equivalent reuse detection.
- Server-side storage of a hashed token identifier, family, subject, issued time, expiry, device metadata, and revoked state where required.
- Revocation on logout, password reset, account suspension, and detected reuse.
- A bounded lifetime and idle timeout.
- No refresh token in a URL, log, error body, or analytics event.
- A safe response when a stolen or previously rotated token is reused.

The current implementation returns self-contained refresh JWTs and does not show rotation or server-side revocation. This is a production gap.

### 6.6 Browser token storage

Token storage must be chosen deliberately and recorded in `DECISIONS.md`:

- Prefer an architecture that limits exposure to XSS and cross-site requests.
- If cookies are used, configure `Secure`, `HttpOnly`, `SameSite`, domain, path, and CSRF protection deliberately.
- If browser memory or session storage is used, document refresh and reload behavior and the XSS threat.
- Do not store long-lived refresh tokens in local storage without explicit risk acceptance.
- Never place tokens in query strings or fragment identifiers sent to analytics or referrers.

### 6.7 Session lifecycle

Test and implement:

- Login.
- Logout.
- Access expiration.
- Refresh success.
- Refresh failure.
- Account deactivation.
- Role or scope change.
- Password reset.
- Browser reload.
- Multiple tabs.
- Multiple portals using the same account.

A failed refresh must clear protected client state and avoid infinite retry or redirect loops.

## 7. Authorization and Academic Scope

### 7.1 Default-deny policy

The backend target default must be authenticated access, not `AllowAny`. Public endpoints must be explicitly named, documented, rate-limited, and tested.

Every protected endpoint must define:

- Authentication requirement.
- Allowed roles.
- Object ownership rule.
- Academic or campus scope rule.
- Allowed methods and state transitions.
- Deleted-record behavior.
- Audit requirement.
- Error disclosure policy.

### 7.2 Role authorization

Existing role permission classes are useful coarse gates but are not sufficient alone:

- `IsMasterAdmin` controls master administrative capability.
- `IsCampusAdmin` includes campus and master administrators.
- `IsTeacher` includes teacher and administrative roles.
- `IsStudent` controls student-only capability.

A role check must be followed by object and scope checks. A teacher role does not authorize every classroom. A campus admin role does not authorize every campus. A master admin role does not remove audit and least-privilege requirements.

### 7.3 Object-level authorization

For every object read or mutation:

1. Resolve the authenticated actor from trusted authentication.
2. Load the object through an active, scope-aware selector.
3. Check ownership, relationship, role, and academic scope.
4. Check state transition permission.
5. Return a safe denial or not-found result according to the information-disclosure policy.
6. Serialize only fields the actor may see.

Never authorize from a posted owner, campus, classroom, student, or role value.

### 7.4 Scope hierarchy

Scope must be evaluated consistently:

```text
Institution
  -> Campus
    -> School
      -> Department
        -> Program
          -> Batch
            -> Section
              -> Classroom
                -> Enrollment
                  -> Student academic record
```

A child reference is valid only when its parent chain is valid. Changing a parent selection in onboarding or administration must not leave orphaned or mismatched child relationships.

### 7.5 Foundation authorization matrix

| Actor | Personal note | Teacher assignment | Completion record | Campus data |
| --- | --- | --- | --- | --- |
| Student owner | Read and mutate own active note | Read eligible published assignment | Create or view own eligible completion | Only permitted student scope |
| Other student | No access | Read only if enrolled and eligible | No access to another student's record | Own permitted scope only |
| Teacher owner | Own notes under policy | Create and manage owned classroom assignments | View authorized classroom completion | Authorized teaching scope |
| Other teacher | No private note access | No access to another teacher's assignment unless explicitly assigned | No access outside authorized classroom | Own teaching scope |
| Campus admin | Only policy-approved administrative access | Campus-policy access, not automatic private-note access | Campus-policy access with audit | Own campus |
| Master admin | Explicit privileged path with audit | Explicit privileged path with audit | Explicit privileged path with audit | Cross-campus policy scope |
| Support | No academic content by default | No academic content by default | No academic content by default | Operational metadata only |

The product owner must confirm exact administrative visibility before implementation.

### 7.6 List, search, filter, and count leakage

Authorization must apply to:

- Detail endpoints.
- List endpoints.
- Search endpoints.
- Ordering fields.
- Aggregates and counts.
- Pagination metadata.
- Export endpoints.
- Autocomplete and dropdown data.
- Error messages and timing where object existence is sensitive.

A filtered query must be scoped before pagination and aggregation. Counting all records and filtering after serialization is not acceptable.

## 8. Personal Notes Security

### 8.1 Ownership

Personal notes are private by default. Classroom membership, teacher role, campus administration, or assignment context does not automatically grant note access.

The note service must derive owner from the authenticated actor and must not accept a client-supplied owner as an authority field.

### 8.2 Note content

- Validate title and body length.
- Define whether HTML, Markdown, links, images, or attachments are allowed.
- Escape or sanitize rendered content according to the chosen format.
- Prevent stored XSS through titles, previews, search results, exports, and notifications.
- Do not include note bodies in ordinary logs, analytics, request IDs, or error traces.
- Minimize note content sent to AI providers and require a separate privacy decision before doing so.

### 8.3 Note lifecycle

- Normal queries exclude soft-deleted notes.
- Delete requires owner or explicitly authorized administrative policy.
- Restore is a separate operation with a separate permission.
- Deleted content remains protected while retained.
- Hard deletion, if required for privacy or retention, must be a controlled process with evidence and backup implications.
- Audit events should identify the action and object without copying the body.

### 8.4 Concurrent editing

Choose and test one policy:

- Version conflict with `409 Conflict`.
- Timestamp conflict with a documented last-write decision.
- Last-write-wins with explicit user acceptance.

A stale update must not silently erase another confirmed edit unless the product decision explicitly accepts that behavior.

## 9. Assignment and Academic Record Security

### 9.1 Assignment ownership

- Only an authorized teacher or administrator can create an assignment for a scope.
- The server derives creator and classroom ownership.
- Draft visibility is restricted according to policy.
- Publishing is a state transition, not an arbitrary status field update.
- Closed and archived assignments reject unauthorized mutations.
- Changes to published assignments must preserve the integrity of student history.

### 9.2 Completion integrity

- Student identity comes from authentication.
- Eligibility comes from current enrollment and assignment scope.
- Completion is separate from submission, grading, feedback, and attendance.
- The database enforces one completion per student-assignment pair where appropriate.
- Repeated commands are idempotent.
- Concurrent commands cannot create duplicate official records.
- A client timeout must not cause an unsafe blind retry.
- The UI distinguishes pending, confirmed, and failed completion.

### 9.3 Administrative access

Administrative views of completion, submissions, or grades must:

- Display the current scope.
- Require the appropriate role and permission.
- Record privileged actions.
- Avoid exposing more student information than necessary.
- Prevent bulk export unless explicitly authorized and protected.

## 10. API and Web Security

### 10.1 Transport security

Production traffic must use HTTPS with:

- Valid certificates and automated renewal.
- HTTP to HTTPS redirect at the edge.
- HSTS after confirming all required subdomains and deployment paths.
- TLS configuration appropriate to the hosting platform.
- Secure WebSocket transport (`wss`) when real-time features are enabled.
- No credentials or private data in query strings.

### 10.2 CORS

- Use an explicit allow-list of production portal origins.
- Do not enable `CORS_ALLOW_ALL_ORIGINS` outside isolated local development.
- Review `CORS_ALLOW_CREDENTIALS` together with cookie and authorization behavior.
- Do not allow arbitrary origins through environment concatenation without validation.
- Test requests from an unapproved origin.

The current base setting permits all origins whenever `DEBUG` is true. This must never be carried into preview or production through an environment mistake.

### 10.3 CSRF

If browser cookies authenticate requests:

- Enable CSRF protection on unsafe methods.
- Configure trusted origins explicitly.
- Set secure, HttpOnly, and SameSite attributes deliberately.
- Test cross-site POST, PATCH, DELETE, and form submission.

If bearer tokens are used without cookies, still assess cross-site request behavior, token exposure, and refresh-token protection. Removing CSRF from one authentication path does not make the application generally safe from browser attacks.

### 10.4 Security headers

Production should provide, through Django and the edge as appropriate:

- `Strict-Transport-Security`.
- `Content-Security-Policy` appropriate to React, provider scripts, fonts, and API origins.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY` or a narrowly required frame policy.
- `Referrer-Policy` that does not leak sensitive paths or query data.
- `Permissions-Policy` restricting unused browser capabilities.
- A safe `Cross-Origin-Opener-Policy` and related isolation headers where compatible.
- Cache controls for authenticated and sensitive responses.

The current production settings set some useful headers but do not establish a complete CSP, HSTS, Referrer-Policy, or Permissions-Policy baseline.

### 10.5 Input validation

Validate at the API boundary and again at security-sensitive service boundaries:

- Type, requiredness, length, encoding, and allowed values.
- Date, time zone, and range constraints.
- File size, detected type, and content signature.
- Foreign-key and hierarchy relationships.
- State transition rules.
- Search and ordering fields through allow-lists.
- Pagination limits.
- Bulk operation size.

Validation is not authorization. A valid campus ID can still be outside the actor's scope.

### 10.6 Output encoding

- Escape user content in HTML contexts.
- Sanitize rich text before rendering.
- Avoid inserting raw API content into `dangerouslySetInnerHTML` without an approved sanitizer and test suite.
- Return only fields required for the actor and use case.
- Remove internal stack traces, SQL, filesystem paths, provider response bodies, and secrets from client responses.

### 10.7 Rate limits and abuse controls

Apply explicit rate limits to:

- Login and password attempts.
- Google token verification endpoints.
- Token refresh.
- Password reset and account activation.
- AI chat and generation.
- File uploads and report generation.
- Bulk enrollment and exports.
- Public health or metadata endpoints.
- WebSocket connection and command rates.

Rate limits should be scoped by account, IP, token, operation, and tenant where appropriate. A limit must not make shared institutional networks unusable without a documented strategy.

### 10.8 Error handling

Use normalized errors with:

- Stable safe error code.
- Plain-language message.
- Field errors when appropriate.
- Request or correlation ID.
- No secret, token, SQL, path, stack trace, or provider payload.

Return `401` for missing or invalid authentication, `403` for authenticated denial, `404` for intentionally undisclosed objects where policy requires it, and `409` for stale or duplicate state conflicts.

## 11. WebSocket Security

### 11.1 Current limitation

The current `backend/config/asgi.py` contains an HTTP route in `ProtocolTypeRouter` and a comment that WebSocket routing will be added later. Frontend Vite proxies and `useGameSync` support WebSocket behavior, but this does not establish a secure server-side WebSocket path.

Real-time features must not be declared production-ready until the following exist:

- ASGI `websocket` routing.
- Authentication middleware compatible with the token strategy.
- Domain consumers.
- Connection and command authorization.
- Redis channel-layer configuration.
- Origin and upgrade checks at the edge.
- Reconnect, revocation, and session-expiry behavior.
- Event contract and security tests.

### 11.2 WebSocket controls

- Authenticate before joining a private room.
- Validate session, classroom, game, and participant scope on every connection.
- Re-check authorization for sensitive commands, not only at initial connect.
- Treat client messages as untrusted commands.
- Use server-confirmed events for official state.
- Prevent replay and duplicate commands with event IDs or idempotency keys.
- Limit message size, connection count, command rate, and room membership.
- Remove connections after logout, account suspension, session expiry, or scope change where required.
- Never broadcast private note content or unrelated student records.
- Use `wss` in production and validate allowed origins.

### 11.3 Polling fallback

The REST polling fallback must enforce the same authorization and data filtering as the WebSocket path. It must not become an unauthenticated read path or create duplicate writes during reconnect.

## 12. File and Storage Security

### 12.1 Storage boundary

The Supabase adapter uses a server-side service-role key and supports upload, signed download, retrieval, deletion, and listing. The service-role key must remain backend-only.

Required rules:

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to any frontend bundle, API response, log, or error.
- Use separate buckets or prefixes for domains with different sensitivity.
- Use private buckets for student, teacher, report, exam, and administrative content unless public access is explicitly approved.
- Authorize the object owner and related domain scope before generating a signed URL.
- Use short signed URL lifetimes appropriate to the operation.
- Do not trust an object key supplied by a client without resolving it through an owned metadata record.
- Rotate the service-role key after suspected exposure or staff turnover.

### 12.2 Upload controls

For each upload:

- Enforce maximum request and file size before buffering too much data.
- Validate extension, declared MIME type, detected content signature, and permitted domain format.
- Generate a server-controlled storage key; do not use an unsanitized original filename as the key.
- Normalize or discard path separators and traversal sequences.
- Store original display name separately from storage key.
- Record owner, scope, checksum, type, size, and processing state.
- Scan or safely process documents before making them available to other users.
- Reject macros, active content, or unsupported formats where the product does not need them.
- Protect image and document processing from decompression bombs and resource exhaustion.
- Do not render untrusted HTML or SVG without sanitization.

### 12.3 Download controls

- Require authentication for private downloads.
- Check object authorization immediately before signed URL generation.
- Keep signed URLs short-lived and non-reusable where possible.
- Set safe content disposition and content type.
- Do not allow arbitrary storage listing from the client.
- Revoke or delete objects when a domain record is deleted according to retention policy.

### 12.4 Current storage gap

The current adapter enforces a byte-size limit, but file validation and authorization depend on each calling workflow. Every upload endpoint must add domain-specific checks rather than assuming the adapter alone is sufficient.

## 13. AI and External Provider Security

### 13.1 Provider isolation

AI and storage providers are external trust boundaries. Domain code should call an adapter or use-case service that controls:

- Which data may leave the system.
- Prompt construction.
- Provider model and settings.
- Timeout and retry.
- Rate and cost limits.
- Output validation.
- Provenance and retention.
- Error mapping.

### 13.2 Data minimization

Before sending content to Groq or another provider:

- Send only the minimum fields needed for the use case.
- Remove access tokens, passwords, secrets, and unnecessary identifiers.
- Minimize student names, registration numbers, and private note content.
- Obtain product and privacy approval before sending personal notes or academic records.
- Document provider retention and training behavior where relevant.
- Do not send content merely because it is present in the page state.

### 13.3 Prompt injection and untrusted content

Treat uploaded documents, notes, assignment text, and retrieved content as untrusted input. They may contain instructions intended to manipulate the provider or the application.

Controls:

- Separate system instructions from user or retrieved content.
- Do not allow generated text to trigger privileged actions without validation and authorization.
- Treat generated URLs, file paths, SQL, code, and role instructions as untrusted output.
- Validate structured output against a schema.
- Require human review for grades, attendance, disciplinary actions, or official reports where applicable.

### 13.4 Provider failures

- Return an accurate non-2xx response or explicit pending state.
- Do not return HTTP 200 with provider failure hidden in normal content.
- Retry only when the operation is safe and within a bounded budget.
- Prevent duplicate generation and duplicate charges with idempotency.
- Avoid logging raw prompts and responses by default.
- Alert on elevated failure, latency, or cost.

## 14. Background Jobs and Redis Security

### 14.1 Celery

Celery tasks must:

- Accept IDs and validated arguments, not trusted serialized permission claims.
- Re-check object ownership, state, and authorization context before acting.
- Use bounded timeouts and retries.
- Be idempotent or use a durable deduplication key.
- Avoid placing sensitive content directly in queue messages when a protected database reference will do.
- Protect task result access by requester and scope.
- Record task state for user-visible workflows.
- Avoid logging credentials or private document content.

### 14.2 Redis

Production Redis must:

- Be private-network only where possible.
- Require authentication or managed identity controls.
- Use TLS where the managed service and topology require it.
- Use separate logical or physical instances for queue, cache, and channel-layer data when isolation matters.
- Apply memory, eviction, persistence, and backup policy appropriate to the data type.
- Never be treated as the sole source of official academic records.

### 14.3 Queue abuse

Protect report generation, AI, document processing, exports, and bulk operations from:

- Unbounded job creation.
- Large payload submission.
- Repeated retries.
- Cross-user job lookup.
- Worker starvation by low-priority tasks.
- Provider cost exhaustion.

## 15. Database Security and Data Protection

### 15.1 Database access

- Use separate credentials per environment and service where practical.
- Application accounts should not have schema-owner or superuser privileges in production.
- Use encrypted connections to managed PostgreSQL where required.
- Restrict network access to application and migration runners.
- Rotate credentials through a secret manager.
- Do not expose PostgreSQL to the public internet.
- Log administrative database access through the platform's controls.

The Docker Compose PostgreSQL password is a development credential and must never be reused in preview or production.

### 15.2 Query safety

- Use Django ORM parameterization and safe query APIs.
- Allow-list ordering and filter fields.
- Do not concatenate SQL, table names, or user-provided clauses.
- Test injection through search, filters, exports, and report parameters.
- Avoid N+1 queries that create denial-of-service conditions on large scopes.

### 15.3 Integrity and transactions

Use transactions for:

- Account activation and hierarchy assignment.
- Assignment publication.
- Completion creation and state transitions.
- Soft deletion plus audit history.
- Job creation and after-commit enqueue.
- File metadata and domain record relationships.

Database constraints should enforce unique identity and completion relationships where possible. Application authorization remains required.

### 15.4 Backups and restoration

Production must have:

- Encrypted backups.
- Defined retention.
- Point-in-time recovery where required.
- Restore tests at a scheduled interval.
- Access control for backup contents.
- A plan for rotating keys without making backups unrecoverable.
- A documented recovery point and recovery time objective.

A backup containing private notes or academic records is itself sensitive data.

## 16. Privacy and Data Governance

### 16.1 Data minimization

Collect and expose only what the workflow needs. Avoid returning full user profiles from endpoints that need only display name and ID. Avoid copying academic records into analytics, logs, browser storage, or provider payloads unnecessarily.

### 16.2 Classification

| Classification | Examples | Required handling |
| --- | --- | --- |
| Public | Public product copy, static assets | Integrity and availability controls |
| Internal | Non-sensitive configuration metadata, aggregate health | Authenticated operational access |
| Confidential | User profiles, classroom membership, assignments | Scoped access, encryption in transit, limited logs |
| Restricted | Password material, tokens, private notes, grades, reports, service keys | Strong access control, minimization, redaction, audit, protected storage |

### 16.3 Retention

Define retention for:

- User accounts and deactivated accounts.
- Personal notes and soft-deleted notes.
- Assignments, completion records, submissions, grades, and feedback.
- Uploaded and generated files.
- AI prompts and outputs.
- Audit events and authentication events.
- Logs, traces, queue results, and backups.

Soft deletion is not automatic privacy deletion. A retention or erasure process must define when data is permanently removed and how backups are handled.

### 16.4 User rights and support requests

The product should provide a controlled process for approved requests to:

- Review personal data.
- Correct inaccurate profile data.
- Deactivate an account.
- Request deletion where retention policy permits.
- Understand sharing or administrative access.

Support must verify identity before disclosing or changing protected data.

## 17. Logging, Auditing, and Monitoring

### 17.1 Logging rules

Never log:

- Passwords.
- Access or refresh tokens.
- OAuth provider tokens.
- Django, JWT, storage, database, Redis, AI, or email secrets.
- Full private note bodies.
- Full student submissions or uploaded documents.
- Unredacted provider prompts or responses.
- Signed URLs where they can be used as credentials.

Log safe metadata such as:

- Request ID.
- Actor ID or hashed support-safe identifier.
- Role and scope identifier where needed.
- Route name and method.
- Status code.
- Latency.
- Domain operation.
- Failure category.
- Job ID.
- Object ID only when object existence itself is not sensitive.

### 17.2 Audit events

Audit privileged and security-relevant actions:

- Login success and failure summary.
- Logout, refresh reuse, and session revocation.
- Account activation, role, scope, and status changes.
- Assignment publish, close, archive, and restore.
- Completion mutation where official records are affected.
- Note delete and restore.
- Administrative data access and exports.
- File upload, download authorization, deletion, and sharing.
- Provider and background job actions that alter official state.
- Security configuration and secret rotation events.

Audit records must be append-oriented, protected from ordinary users, time-stamped, and safe from storing private content unnecessarily.

### 17.3 Monitoring signals

Alert on:

- Authentication failure spikes.
- Refresh-token reuse or unusual refresh patterns.
- Permission-denial spikes or cross-campus access attempts.
- Sudden increases in public endpoint traffic.
- Note, assignment, or completion mutation failures.
- Unusual export or download volume.
- Storage signed URL generation spikes.
- AI usage, cost, latency, or provider error anomalies.
- Queue growth, repeated retries, or worker failures.
- Redis, database, or storage health failures.
- WebSocket reconnect and polling fallback spikes.
- Configuration showing debug mode or wildcard origins outside local development.

## 18. Frontend Security

### 18.1 Client assumptions

Frontend code must assume:

- Any user can inspect and modify JavaScript.
- Local state can be changed.
- Routes can be entered directly.
- API requests can be replayed.
- Browser storage can be read by an XSS payload or local user.
- A hidden button provides no security.

### 18.2 XSS prevention

- Render untrusted content as text by default.
- Sanitize approved rich text with a maintained library and restrictive configuration.
- Avoid unsafe HTML injection.
- Use a restrictive CSP compatible with approved scripts, fonts, and providers.
- Do not place tokens in DOM attributes, URLs, or analytics payloads.
- Keep dependencies updated and scan bundles for accidental secrets.

### 18.3 Client state and cache

- Do not cache private data in shared browser storage without an explicit policy.
- Clear query caches and Zustand state on logout or account switch.
- Scope cached keys by authenticated user and academic context.
- Avoid showing cached data after a permission or campus change until it is revalidated.
- Do not persist private notes on shared devices unless the user explicitly opts in and the privacy decision is recorded.

### 18.4 Browser permissions

Request only required browser capabilities. Do not request camera, microphone, notifications, clipboard, location, or persistent storage for a feature that does not need it. Document provider and browser permissions for games, OMR, and live sessions separately.

## 19. Dependency and Supply Chain Security

### 19.1 Dependency controls

- Pin or constrain versions through reviewed manifests and lockfiles where supported.
- Review transitive dependencies for known vulnerabilities.
- Remove unused packages and scripts.
- Verify package provenance where the registry and tooling support it.
- Run dependency audits in CI and before release.
- Patch critical vulnerabilities according to severity and exploitability.
- Do not install packages from untrusted local paths in production builds.

### 19.2 Build security

- Keep CI secrets out of build logs.
- Use least-privilege CI tokens.
- Separate pull-request jobs from deployment credentials.
- Restrict artifact publication.
- Scan built images and dependencies.
- Rebuild from a known source after suspicious dependency activity.
- Do not include `.env` files, database files, media, uploads, or test credentials in frontend artifacts or Docker images.

### 19.3 Repository hygiene

Before merge:

- Scan for keys, tokens, passwords, private certificates, and provider URLs containing credentials.
- Review Dockerfiles and compose files for exposed secrets and unnecessary ports.
- Check generated files and debug output.
- Verify test fixtures use synthetic data.
- Review new endpoints for explicit permission declarations.

## 20. Docker and Deployment Security

### 20.1 Current local Compose boundary

The current Compose file is a local development topology with:

- Postgres published on port 5432.
- Redis published on port 6379.
- Backend published on port 8000.
- Three frontend services on ports 5173, 5174, and 5175.
- Development debug mode enabled.
- Development credentials and service names.
- Source and upload volumes mounted into containers.

This topology must be treated as local-only. Do not expose it directly to the public internet.

### 20.2 Production container rules

- Use minimal runtime images and non-root users.
- Pin base image versions and scan for vulnerabilities.
- Do not bake secrets into image layers or build arguments.
- Set read-only filesystems where compatible.
- Mount writable media and temporary directories deliberately.
- Drop unused Linux capabilities.
- Set resource, CPU, memory, and process limits.
- Keep backend, workers, database, Redis, and frontend networks appropriately separated.
- Expose only the edge and required service ports.
- Use health and readiness checks that do not leak sensitive information.
- Ensure migrations run through a controlled release step rather than every replica starting simultaneously.

### 20.3 Configuration gates

Production startup must fail or refuse readiness when:

- `DEBUG` is enabled.
- Secret keys are missing, default, or below an entropy threshold.
- Allowed hosts are empty or contain unsafe wildcards.
- CORS origins are wildcarded.
- Production database credentials are absent.
- Storage service-role key is missing or accidentally present in frontend build configuration.
- TLS or secure cookie expectations are not met.
- Required Redis and database checks fail.

## 21. Secure Development Lifecycle

### 21.1 Design review

Before implementing a security-sensitive feature, document:

- Data collected and classification.
- Actors and scopes.
- Trust boundaries.
- Threats and abuse cases.
- Authentication and authorization model.
- Storage and provider destinations.
- Logging and retention.
- Failure and rollback behavior.
- Security tests and release gate.

### 21.2 Code review checklist

Reviewers must ask:

- Is the endpoint explicitly authenticated or intentionally public?
- Are role and object-level permissions enforced server-side?
- Is the query scoped before serialization, pagination, counts, and exports?
- Can a client-controlled ID change ownership or scope?
- Does the operation remain safe under retry and timeout?
- Are state transitions explicit?
- Are private values excluded from logs and errors?
- Are files validated and downloads authorized?
- Are provider calls minimized and bounded?
- Are migrations and rollback behavior safe?
- Are tests included for denied access and cross-tenant access?
- Does the frontend avoid implying success before confirmation?

### 21.3 Security testing

Every security-sensitive change requires:

- Positive authenticated test.
- Anonymous test.
- Wrong-role test.
- Same-role wrong-owner test.
- Cross-campus or cross-classroom test.
- Deleted-object test.
- Malformed-input test.
- Retry or replay test where mutation is involved.
- Log and error redaction check.
- Browser route or direct-request check where frontend behavior changes.

### 21.4 Vulnerability management

Triage findings by exploitability and impact:

| Severity | Expected response |
| --- | --- |
| Critical | Stop release, contain, rotate affected secrets, patch, verify, and assess disclosure |
| High | Fix urgently before production or obtain explicit security risk acceptance |
| Medium | Fix in the current or next planned release with owner and deadline |
| Low | Track and address through normal hardening work |

A vulnerable dependency is not the only security issue. Authorization regressions and data exposure are release blockers even when dependency scans are clean.

## 22. Security Test Matrix

### 22.1 Authentication tests

- Invalid access token.
- Expired access token.
- Wrong token type.
- Wrong issuer and audience.
- Wrong environment key.
- Refresh rotation and reuse.
- Deactivated account.
- Password reset invalidation.
- Google audience and issuer validation.
- Login rate limiting.
- Token absence from logs and URLs.

### 22.2 Authorization tests

- Student reads own permitted assignment.
- Student cannot read another student's private note.
- Student cannot change `student_id` to complete for another user.
- Student cannot publish or edit a teacher assignment.
- Teacher cannot access another classroom.
- Campus admin cannot cross campus without policy.
- Master admin uses explicit privileged path and audit.
- Support cannot browse academic content by default.
- Search, counts, exports, and pagination are scoped.

### 22.3 Input and injection tests

- SQL injection through filters and ordering.
- Stored XSS through note and assignment content.
- Reflected XSS through query parameters and errors.
- Path traversal through filenames and object keys.
- Oversized uploads and decompression bombs.
- Malformed JSON and deeply nested payloads.
- Prompt injection in notes, uploads, and assignment content.
- Header and URL injection where user content is reflected.

### 22.4 Operational tests

- Debug mode cannot start in production.
- Wildcard CORS cannot pass the production configuration check.
- Default secrets cannot pass startup checks.
- Database and Redis are unreachable from unauthorized network segments.
- Backups restore successfully.
- Revoked credentials stop working.
- Alerts fire for authentication, authorization, queue, and provider anomalies.

## 23. Incident Response

### 23.1 Incident categories

- Suspected token or credential compromise.
- Cross-campus or cross-user data exposure.
- Unauthorized administrative action.
- Malicious upload or stored XSS.
- Provider key exposure or excessive AI data transfer.
- Database, Redis, or storage compromise.
- Ransomware, destructive deletion, or backup compromise.
- Dependency or build supply-chain compromise.

### 23.2 Initial response

1. Record the time, reporter, affected environment, and known symptoms.
2. Preserve logs, traces, request IDs, and relevant deployment identifiers.
3. Avoid copying sensitive content into general chat or tickets.
4. Assess whether access is ongoing.
5. Disable or rotate affected tokens, secrets, keys, or accounts.
6. Restrict the affected endpoint, provider, bucket, queue, or deployment if needed.
7. Preserve evidence before destructive cleanup where possible.
8. Identify affected users, tenants, records, and time range.
9. Notify product, engineering, operations, and required institutional contacts.
10. Apply a verified fix or containment change.
11. Test the containment and monitor for recurrence.
12. Document root cause, impact, response, and follow-up actions.

### 23.3 Credential rotation

Maintain a runbook for rotating:

- Django secret key.
- JWT signing key.
- Database credentials.
- Redis credentials.
- Google client secret.
- Groq API key.
- Supabase service-role key.
- CI/CD tokens.
- Email or calendar provider credentials.

Rotation must account for active sessions, workers, signed URLs, queued jobs, backups, and deployment rollback.

### 23.4 User notification

The incident owner determines notification obligations based on the affected data, institution policy, and applicable law. Notification content should be accurate, actionable, and free of unnecessary sensitive detail.

## 24. Current Remediation Roadmap

### Phase 0: Block unsafe defaults

- Replace global `AllowAny` default with authenticated default.
- Inventory all explicit public views and justify each one.
- Remove default secrets from non-development settings.
- Require explicit production `JWT_SECRET_KEY` or signing keys.
- Fail startup on debug, wildcard origins, unsafe hosts, or missing required secrets.
- Separate local Compose credentials from all deployed credentials.
- Add secret scanning to CI.

### Phase 1: Establish identity and authorization

- Define role assignment authority independent of frontend `app` input.
- Add issuer, audience, token ID, key rotation, and revocation strategy.
- Implement refresh rotation and reuse detection.
- Add centralized scope selectors and object-level permission tests.
- Protect accounts, assignments, analytics, games, reports, files, and admin routes.
- Add authorization matrix tests across two campuses and multiple roles.

### Phase 2: Protect data and files

- Create the notes bounded context with owner-derived mutations.
- Define note rendering and XSS policy.
- Add file metadata ownership and signed download authorization.
- Validate uploads by size, type, signature, and processing policy.
- Define retention, deletion, restoration, and backup policy.
- Redact private content from logs and provider payloads.

### Phase 3: Secure integrations and asynchronous work

- Add Celery task authorization, idempotency, and result scoping.
- Define AI data minimization, prompt injection, output validation, cost, and retention controls.
- Restrict Redis and provider network access.
- Add provider timeout, retry, failure-status, and monitoring tests.
- Establish audit events for privileged and academic-record mutations.

### Phase 4: Real-time and production operations

- Implement authenticated ASGI WebSocket routing and consumers.
- Add origin, connection, command, rate, and room controls.
- Add security headers and CSP.
- Harden containers and production network topology.
- Test backup restoration and credential rotation.
- Run incident response exercises and production probes.

## 25. Release Security Gates

A foundation release cannot proceed with an unresolved P0 or P1 security defect.

### Pull request gate

- No new endpoint without explicit permission declaration.
- Targeted unit and integration tests pass.
- Positive and negative authorization tests pass.
- Secret scan passes.
- Dependency scan has no unresolved release-blocking finding.
- New logs and errors are reviewed for sensitive data.
- Upload and provider changes include abuse-case tests.

### Preview gate

- Production-like settings use non-default secrets.
- Debug is disabled.
- CORS and allowed hosts are explicit.
- HTTPS or protected preview transport is configured.
- Account, login, notes, assignment, completion, and logout flows pass.
- Cross-campus and wrong-owner requests are denied.
- Files cannot be downloaded through guessed or unauthorized keys.
- Logs contain request IDs but no tokens, passwords, private note bodies, or service keys.
- Health, database, Redis, worker, and storage checks pass.

### Production gate

- Threat model and data classification are reviewed.
- Authentication and refresh-token policy is implemented and tested.
- Authorization matrix passes across all released routes.
- Backup restoration and rollback or forward-fix are rehearsed.
- Secrets are in approved management systems and rotation owners are named.
- Monitoring and alerting are active.
- Incident response contacts and runbooks are available.
- Known gaps have owner, severity, deadline, and explicit acceptance if not fixed.

## 26. Security Decision Register

The following decisions must be recorded in `DECISIONS.md` before they become difficult to change:

1. Browser token storage and refresh-token transport.
2. JWT versus server-side session strategy for independently deployed portals.
3. Role assignment authority for Google login and account creation.
4. Refresh-token rotation and revocation data model.
5. Exact campus, classroom, teacher, student, and administrator visibility rules.
6. Note rendering format and sanitization policy.
7. Note conflict and deletion-retention policy.
8. Storage bucket layout, signed URL lifetime, and object retention.
9. AI provider data-use and retention policy.
10. WebSocket authentication and token refresh behavior.
11. Production CSP and approved third-party script, font, and provider origins.
12. Backup retention, restore objectives, and deletion implications.
13. Security incident notification responsibilities.
14. Browser storage and offline draft policy for shared devices.

## 27. Security Completion Criteria

Security work for the foundation release is complete only when:

- Public and protected routes are inventoried and intentionally classified.
- Default permissions are deny-by-default for academic and administrative data.
- Authentication has explicit issuance, expiry, refresh, revocation, and deactivation behavior.
- Role and object-level authorization are tested across multiple campuses and owners.
- Notes, assignments, completion records, and files preserve ownership and scope.
- Inputs are validated and outputs are safely encoded.
- Secrets are externalized, scanned, rotated, and absent from client artifacts and logs.
- AI, storage, Redis, Celery, and database integrations have bounded permissions and failure behavior.
- Security headers, TLS, CORS, CSRF, and cookie settings match the deployment model.
- WebSocket claims are not enabled until authenticated routing exists.
- Backups, restore, incident response, and monitoring are operationally testable.
- Known current gaps are either remediated or formally accepted with a named owner.

## 28. Final Security Principle

EduAI is secure when a valid user can do the work they are authorized to do, an unauthorized user cannot infer or alter protected records, a failed request cannot silently corrupt academic state, a provider cannot become an uncontrolled data sink, and operators can detect, contain, and explain what happened.
