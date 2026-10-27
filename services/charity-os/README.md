# Shared Charity OS

An organization workspace for coordinating charitable work, built as a separate service from the public Astro site and the local browser workspace. It combines typed records, accountable owners, linked workflows, independent review and private recovery tools. Charitology studies the system that directs generosity; it does not rate named charities or judge the good people are doing. A program's optional depth value is a hypothesis about mechanism, not a grade.

This is a Node 24 ESM service with a plain JavaScript browser client, a Postgres database and Better Auth magic-link sessions. Dependencies are pinned in [package.json](package.json) and [package-lock.json](package-lock.json). Detailed domain rules are in [MODULES.md](docs/MODULES.md); the source and regression review is in [BACKEND_REVIEW.md](docs/BACKEND_REVIEW.md).

## What the service does

All 26 modules share typed forms, linked records, table/board views, applicable calendar views, ownership, revisions, comments and workflows. Their fields and validation are defined in [modules.mjs](lib/modules.mjs), rather than being interchangeable free-text forms.

| Area | Module IDs |
| --- | --- |
| Foundation | `organization`, `integrations`, `administration` |
| Programs and learning | `programs`, `projects`, `outcomes`, `feedback`, `evaluation` |
| Funding and finance | `grant-seeking`, `grant-delivery`, `finance`, `accounting`, `fundraising` |
| People and participation | `contacts`, `memberships`, `volunteers`, `events`, `communications`, `forms` |
| Restricted coordination | `casework`, `safeguarding` |
| Governance and records | `reporting`, `governance`, `documents` |
| Operations | `assets`, `resources` |

The rules include dependency cycles, allocation and grant caps, restriction codes, matching currencies, volunteer/event capacity, overlapping shifts, evidence units and denominators, external source identities and eligibility. Unknown values stay `null`, distinct from zero and false. Money uses integer minor units with an explicit currency and precision. Scheduled instants require a written UTC offset and a matching named time zone.

Accounting and payroll records hold external references, aggregate reconciliation and control results. They do not post a ledger, run payroll, move money or issue tax receipts. Casework and safeguarding support opaque codes, status and specialist-system references; they do not accept beneficiary histories, case notes, allegations or medical narratives. Form records describe operational definitions and aggregate response batches. The separate public intake workflow below accepts only minimal operational requests; it is not a sensitive-service intake backend. Resource and benefit records do not enroll an organization with a provider.

The public AI Charitologist remains a source-retrieval tool. This service does not introduce an autonomous recommendation model or claim independently verified impact.

## Public operational requests

The deployed service implements account-free contact, event-interest and volunteer-interest forms. The intake slice first shipped as runtime `98ebea527b6a5b382d5e143acf207205eccd172b`, deployment `dpl_1yFKcLN8m2x8QkXs4Sf1sZbeBdYd`; the participant follow-up below extends that service. [PUBLIC_PARTICIPATION.md](../../docs/PUBLIC_PARTICIPATION.md) records exact CI, production RLS and controlled synthetic browser evidence. The browser fixture used an isolated actual database and explicitly fake administrator authentication; it does not establish actual human approval, participant adoption or a published production form. [SHARED_OS_RELEASE.md](../../docs/SHARED_OS_RELEASE.md) preserves the full release history and remaining gates.

An owner or administrator can publish the exact current, independently approved Forms revision in its published workflow state, optionally linked to an equally current approved event session or volunteer shift. Source or target edits, deletion, closure, withdrawal or an expired retention review date stop new acceptance and conversion. The public page shows only the organization's name and the deliberately published title, purpose, questions, consent and review date. Publishers must inspect that wording; keyword screening cannot guarantee that prompts or volunteered answers contain no sensitive information.

Explicit-consent requests enter a separate owner/admin queue. Review is a separate action before conversion, which creates unapproved contact/registration/assignment drafts or links an explicitly selected existing contact. It checks live capacity and schedule rules without reserving a place. It does not verify identity, subscribe to a newsletter, book an event, assign a volunteer, send notifications or transfer funds.

A random 32-byte receipt is returned once and stored only as a hash. Its private URL uses a fragment. Same-origin JSON POSTs can read status or deliberately withdraw a request without revealing answers or addresses; query tokens and cross-origin mutations are refused. An unchanged request identifier deduplicates retry but does not disclose the original receipt again. If the first accepted response is lost and no receipt was saved, contact the organization another way. Cancellation withdraws a request; submitted answers and separately prepared records remain for the organization's retention review.

The separate, revision-checked erasure action clears queue answers and IP/payload hashes, keeps an erasure timestamp and minimal status/receipt/idempotency provenance, and closes pending/reviewed items. It does not erase separately created contacts or drafts, immutable reports, earlier source archives, external recovery copies or downloaded backups. The retention date closes collection after its review date; it is not automatic deletion. Administrators must manage retention deliberately. Erasure, cancellation and publication withdrawal remain possible after ordinary audit capacity is full, using the emergency reserve behavior described below.

The server bounds forms at 30 questions/12,000 schema bytes, total submissions at 16,384 bytes, new requests at 100 per organization/UTC day, and the pending/reviewed queue at 1,000 rows/8 MiB of measured row data. General text answers have a 300-character limit; reserved contact fields have narrower bounds. Durable IP-derived limits are 20 submissions/hour and 60 receipt actions/hour. The full workspace export budget also applies. See [intake.mjs](lib/intake.mjs) for the exact validation and [intake-backup.mjs](lib/intake-backup.mjs) for recovery.

## Participant self-service

Runtime `a6202f32a7fa7b9ac610bfc5676717530c1ba5ee` / `dpl_39nM5eZuamArw2rLYv5DyogcFkxF` is promoted to https://os.charitology.org/participant. Exact-commit CI passed 132 service and 31 actual OS Postgres tests; protected-stage/public checks and one controlled real owner-inbox sign-in also passed. These remain bounded engineering checks rather than actual participant adoption.

`/participant` is a separate own-request portal. A current verified Better Auth account, an unguessable receipt, explicit linking consent and an exact trim/lowercase match to the submitted reserved email are all required. Signing in alone discovers no requests and grants no organization membership. Login emails carry only the sign-in token and a fixed portal destination; the receipt stays in the original tab until deliberately claimed, then clears from its fragment and memory.

The portal paginates 20 own requests, shows only submitted answers/public schema/status, and permits revision-checked corrections while a request is pending and its approved publication is current. Corrections require fresh purpose consent and cannot change the original verified email. Withdrawal, answer erasure and permanent account unlinking have separate confirmations and consequences. They do not erase separate contacts or earlier backups. After unlinking, this request cannot be claimed by another account or re-linked with the same receipt.

A forced own-user RLS index provides cross-organization navigation; intake and publication tables retain their strict tenant policies. Links are capped at 100/account and 1,000/organization including revoked links, under organization-then-user locks. Durable limits cover claims, reads and writes. Private exports restore no account grants, and existing publication/receipt recovery stays inactive. [The pre-implementation plan and acceptance record](../../docs/PARTICIPANT_PORTAL.md) distinguishes actual authentication, simulated frontend checks, controlled browser evidence and deployment status. The bounded booking controls below extend this portal; participant email delivery remains paused.

## Confirmed participation and waitlists

The Participation console manages one person and one place for a whole event session or volunteer shift. Before enabling an occurrence, an administrator reviews and accepts an exact, hashed inventory of existing active typed registrations or assignments. Unknown old consent remains unknown. Duplicate, overlapping or over-capacity legacy occupancy blocks adoption.

A scoped writer deliberately associates a typed registration or assignment draft with a contact and, where applicable, its converted intake request. Association reserves no capacity. The participant can affirm the current independently approved purpose, instructions, schedule and organizer contact through their own linked request. A staff member can instead record a specific offline affirmation with its method and evidence reference. Collection consent and an interest request alone do not authorize participation.

Staff explicitly confirm a requested participation or place it on a consented waitlist. Promotion is manual; the console suggests the earliest currently eligible waitlisted request, and skipping it requires an operational reason. Confirmation requires current independent source and candidate approval, exact revisions, capacity and volunteer overlap checks in the organization transaction. There are no group allocations, holds, automatic eligibility judgments or automatic promotions.

Confirmed places have a separate fulfillment history and retain frozen terms when generic edits reset a record to review. Generic edits, transitions, imports, deletion and trash recovery cannot bypass allocation rules. Cancellation releases capacity once and never promotes another person automatically. Cancellation remains available when the source closes, approval changes or ordinary storage fills. A cancelled candidate is historical; reapplication requires a new typed candidate.

The own-request portal shows only that participant's associated state and public terms. Specific consent, email preference and cancellation are separate actions. Withdrawing the original request or erasing its answers does not cancel a confirmed participation. Permanent unlinking removes self-service access and cancels unsent account-addressed notices; the portal warns participants to cancel first or retain the approved organizer contact. Confirmed terms cannot be silently rescheduled through a new consent form.

**Participation email is paused.** The email control records a preference only. Events enter a bounded paused outbox; this release does not send those messages. Notification delivery requires the separate [delivery plan](../../docs/PARTICIPATION_DELIVERY_PLAN.md). Login, invitation and personal-reminder mail retain their existing relay behavior and newsletter consent stays separate.

Managed targets are limited to 500 rows/2 MiB, participation history to 2,000 rows/8 MiB and paused outbox history to 8,000 rows/8 MiB, including cancelled/history rows. The conservative workspace export budget also applies. At full storage, cancellation and preference-off can omit a new notification event rather than strand a place; the response makes that gap explicit. Commands use a random intent key and expected revisions. Only an exact latest-command retry is replayable; reload after an ambiguous failure rather than inventing a new attempt.

Backups preserve bounded fulfillment provenance, not live authority or restored participant access. Recovered targets remain paused and blocked, consent cannot allocate, and former confirmed occupancy must be reconciled through exact administrator adoption before new places can be allocated. Missing references for formerly confirmed history are rejected. Historical approvals, actors and timestamps are provenance, not proof of a new review. See [the pre-implementation contract](../../docs/PARTICIPATION_BOOKINGS_PLAN.md) and the [release record](../../docs/SHARED_OS_RELEASE.md).

## Architecture and access

- [api/index.mjs](api/index.mjs) connects the authenticated request handler to the database and mail relay. [public/](public/) contains the browser client and local fonts.
- [auth.mjs](lib/auth.mjs) configures Better Auth. Sign-in links expire after 10 minutes, use hashed verification tokens and require a deliberate confirmation POST. Opening an email link with GET does not create a session. Session cookies are HttpOnly and use secure transport for HTTPS origins.
- [database.mjs](lib/database.mjs) sets organization/user context inside each transaction. Tenant tables enable and force row-level security. Mutations serialize by organization and require expected revisions where records or memberships are replaced. The application uses a separate role that cannot bypass RLS; the migration owner is not the runtime role.
- [access.mjs](lib/access.mjs) checks current membership, module permissions and program scope. Linked targets must also be readable. Membership changes apply on subsequent requests and reminder access is rechecked at dispatch.
- [jobs.mjs](lib/jobs.mjs) stores invitation and personal-reminder jobs. [mail.mjs](lib/mail.mjs) calls the separate, purpose-limited newsletter service relay. No OS mail operation creates a newsletter subscriber, Contact, Topic, Segment or Broadcast.
- [integrations.mjs](lib/integrations.mjs) supports read-only CiviCRM, OpenProject and Kobo previews plus local CSV rows. Credentials are encrypted server-side. HTTPS hosts must resolve to public addresses; the checked address is pinned and redirects are refused. Import is an explicit preview/commit operation, not unattended two-way synchronization.
- [participation.mjs](lib/participation.mjs) manages confirmed occupancy and consent separately from generic review state. Central [write guards](lib/participation-guards.mjs) protect generic mutations and [recovery](lib/participation-backup.mjs) restores inactive provenance.
- [intake.mjs](lib/intake.mjs) exposes only explicit publication schemas and bearer-receipt status through fixed anonymous routes. Private answers stay in separately scoped owner/admin tables with forced RLS. [intake-backup.mjs](lib/intake-backup.mjs) omits capabilities and restores publications closed.

Roles are `owner`, `admin`, `program_lead`, `grants_lead`, `finance_reviewer`, `contributor`, `board_reader` and `external_reviewer`. Owners and administrators manage access across the organization. Other roles receive module-specific permissions; optional program assignments narrow linked work. An owner field assigns responsibility and cannot grant access. An organization-profile record cannot change membership.

Board and external readers receive permitted approved snapshots, not later working fields, comments or history. Both current and historical program scopes must allow access. Approved attachments are frozen by ID/checksum; later uploads remain outside that snapshot. Restricted modules apply their own role lists. The module registry is the exact permission source.

Approval binds a persisted revision to a reason and an independent reviewer. The last editor cannot approve that revision. Editing approved/frozen content or attaching a file clears current approval and returns the working record to review or its initial state while preserving its historical snapshot. Advancing an approval stage requires current approval. Frozen reports retain source IDs/revisions and their checksum. Imported approvals and actor claims never become new trusted approvals or membership grants.

## Local setup

From the repository root:

```sh
cd services/charity-os
npm ci
cp -n .env.example .env.local
```

Use a dedicated development database. Set these values privately in `.env.local`; the file is ignored by Git. URL-encode database credentials when constructing connection URLs.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Migration/test owner connection. It creates tables, functions and isolated test schemas. |
| `OS_DATABASE_URL` | Separate application connection with `NOSUPERUSER` and `NOBYPASSRLS`. Required in production. |
| `BETTER_AUTH_URL` | Exact public origin; use `http://localhost:4344` for the included local server. |
| `BETTER_AUTH_SECRET` | Independent random secret of at least 32 characters. |
| `OS_ENCRYPTION_KEY` | Independent random secret for stored integration credentials. Preserve it for reconnection or rotate credentials deliberately. |
| `OS_MAIL_RELAY_URL` | Purpose-limited mail endpoint, normally `https://mail.charitology.org/api/system/os-mail`. |
| `OS_MAIL_RELAY_SECRET` | Dedicated shared bearer secret, matching the relay configuration. Never expose it in the browser. |
| `CRON_SECRET` | Independent bearer for maintenance. |

Generate independent secret values with a cryptographically secure generator, for example `openssl rand -base64 48`. Replace every example value. For development mail, use a separately configured local relay or a transport test; the production relay accepts only its configured OS origin. Unit and database tests mock mail and need no real provider credential.

Create the application role once through the database owner's administrative connection. For example, in `psql`:

```sql
CREATE ROLE charitology_os_app LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\password charitology_os_app
```

Use that role's connection URL for `OS_DATABASE_URL`. Keep the owner connection in `DATABASE_URL` for migration, then run:

```sh
npm run migrate
npm run dev
```

Migration creates the Better Auth and OS tables and grants the configured application role schema usage, data access and sequence access. It revokes updates/deletes on live audit events and frozen reports; append-only triggers also protect those tables. It does not send mail. If the database provider requires roles to be created through its control plane, create the same constrained role there before migration.

Confirm the runtime connection directly before serving real work:

```sql
SELECT current_user, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname = current_user;
```

Both privilege flags must be false. Keep owner credentials for administration and migration; serve requests through `OS_DATABASE_URL`. Never weaken RLS to resolve a permission error. After a schema change, rerun migration and verify the application grants, including newly created tables.

## Tests and CI

```sh
npm test
node --test test/*.test.mjs public/*.test.js
npm run test:db
```

`npm test` runs server/domain/registry regressions. The explicit command also runs browser API/model tests. `test:db` reads private `.env.local`, requires both owner and constrained application URLs, and exercises actual Postgres with Better Auth. Its fixture creates a random temporary schema, applies migrations there, grants the application role access to that schema, asserts the role cannot bypass RLS, uses synthetic recipients with a mocked mailer and drops the schema in `finally`. Use a dedicated test database whose owner can create/drop schemas; do not point it at a production database.

[charity-os-check.yml](../../.github/workflows/charity-os-check.yml) runs on relevant pull requests and main-branch changes, can be called by another workflow, and supports manual dispatch. It installs locked dependencies, checks the browser entry's syntax, runs server plus browser-model tests, and runs the actual database fixture against a disposable Postgres 17 service. CI creates a separate `os_test_app` login with no superuser, role-creation, database-creation, inheritance or RLS-bypass privilege. It uses no provider or deployment secrets and does not send email. CI invokes the database test directly so a private local env file is never loaded.

Test commands and workflow configuration are not evidence that a hosted deployment or inbox delivery passed. Record those results separately. [BACKEND_REVIEW.md](docs/BACKEND_REVIEW.md) states the scope and limitations of the independent source/regression review.

## API outline

Authenticated browser mutations send same-origin cookies, exact `Origin`, `Content-Type: application/json` and the `X-CSRF-Token` returned by `/api/session`. Account-free intake mutations use exact-origin JSON plus explicit collection consent or a private receipt bearer; they do not require a session or grant general organization access. Token confirmation and the independent cron bearer have their own narrow authentication paths. Do not call Better Auth's consuming verification GET directly; it is not publicly dispatched.

All organization paths below start with `/api/orgs/:orgId`. Current membership and permissions are checked on each request.

| Method/path | Behavior |
| --- | --- |
| `POST /api/auth/request-link` | Request a sign-in link; address/IP limits apply. |
| `GET, POST /auth/confirm` | Scanner-safe page, then deliberate token confirmation. |
| `GET /api/session`, `POST /api/auth/logout` | Read the current user/organizations/CSRF value; revoke the session. |
| `GET /api/modules` | Typed modules, currencies and role metadata. |
| `POST /api/orgs` | Create an organization and its first owner. |
| `GET, PATCH /` | Read/update organization settings allowed by the API. |
| `GET /dashboard`, `GET /audit` | Scoped overview; administrator audit history. |
| `GET /modules/:module/records`, `POST .../records` | List accessible records or create a typed draft. |
| `GET, PATCH, DELETE .../records/:id` | Read, replace with expected revision, or soft-delete. Existing links and retention holds prevent unsafe deletion. |
| `POST .../records/:id/approve`, `/transition` | Independently approve a revision or advance an allowed workflow with a reason. |
| `POST .../records/:id/comments`, `/reminder`, `/files` | Comment, schedule a personal reminder or attach an allowed document file. |
| `GET /files/:id`, `GET .../records/:id/files` | Access permitted attachment bytes/metadata, honoring frozen snapshots. |
| `GET /modules/:module/trash`, `POST .../records/:id/restore` | Inspect and recover eligible soft-deleted records. |
| `GET /modules/:module/export?format=csv` | Scoped module export; JSON is the default. |
| `GET, POST /reports`, `GET /reports/:id` | List permitted frozen reports, create a report or read its frozen payload. |
| `GET /members`, `PATCH, DELETE /members/:userId` | Inspect the team or administratively change/revoke access. |
| `POST /invitations`, `DELETE /invitations/:id` | Issue or revoke an invitation. Acceptance uses `POST /api/invitations/accept` and the invited authenticated email. |
| `GET, POST /integrations` | Inspect connections or create one. |
| `PATCH, DELETE /integrations/:id` | Replace/remove credentials with expected revision, or disable a connection. |
| `POST /integrations/:id/test`, `/preview`, `/import` | Test read-only access, review mapped rows, then commit the stored preview. |
| `GET /export`, `POST /import/upload`, `/import/preview`, `/import/commit` | Download a backup or upload, preview and commit a recovery file. |
| `GET /backups/imports`, `GET /backups/imports/:id` | Administrator access to original committed import archives. |
| `GET, POST /intake/publications`, `POST /intake/publications/:id/withdraw` | Administrator publication of an approved current form version, list/status or withdrawal. |
| `GET /intake/submissions`, `GET /intake/submissions/:id` | Administrator-only private queue, filters, cursor pages and detail. |
| `POST /intake/submissions/:id/review` | Expected-revision review, dismissal, draft conversion or answer erasure. |
| `GET /participation-targets`, `GET /participation-targets/:id` | Scoped-writer occurrence list and adoption preview. |
| `POST /participation-targets/:id/adopt` | Administrator acceptance of exact hashed legacy occupancy. |
| `GET, POST /participation-targets/:id/participations` | Scoped-writer roster pages or deliberate typed-candidate association. |
| `POST /participation-targets/:id/participations/:participationId/:action` | Expected-revision `consent`, `waitlist`, `confirm`, `promote` or `cancel`. |

Public paths are `GET /api/public/intake/:orgId/:publicationId`, `POST .../submissions` and `POST .../receipt`. Standalone pages use `/p/:orgId.:publicationId` and `/p/receipt#orgId.publicationId.privateToken`. GET never cancels. Public endpoints return no private queue answers, contact addresses, approval identities or receipt hashes.

Own booking paths are `GET /api/participant/orgs/:orgId/requests/:intakeId/participations` and `POST .../participations/:participationId/consent`, `/cancel` or `/preferences`. They require a verified session and the existing active own-request link; they expose no roster, private staff reasons or contact identifiers.

Record replacement/approval/transition/delete uses the expected integer `revision`. A stale revision returns 409. Domain validation returns 422 with field issues. A broken connection or interrupted mutation is not proof that the write failed; reload saved state before deciding whether to repeat it. Imports commit a server-stored preview and refuse expired, previously committed or changed-workspace previews. They do not trust client-supplied preview records.

## Recovery, files and limits

Download an organization JSON backup before a migration or handover. It contains private records, current files, comments, source history, reports, trash metadata, deleted documents' bytes in `trashFiles` and connection configuration; store it under the organization's access rules. It omits authentication sessions, newsletter consent, live invitation/job tokens and connector credentials. Module CSV neutralizes formula-like cells, but JSON is the recovery format. Large JSON and CSV responses stream.

Backups also include deliberately published schemas and private intake answers/status, including erasure tombstones, but omit receipt, idempotency, payload and IP hashes. Restored publications are withdrawn, old receipt capabilities remain disabled and prior staff reviews do not authorize conversion. An erased active request restores closed, with no answers. Publish a newly approved form for new requests and handle recovered requests manually. Historical source archives and previously downloaded backups can still contain answers that were subsequently erased from the live queue.

Restore into an organization with no records, including trash, and no existing connections. Preview validates the checksum, schema and linked records; commit rechecks destination state in a transaction. Active records keep their stable IDs but start at the module's initial workflow state with the restoring member as owner and approvals/snapshots reset. Original audit history, comments, reports, trash and deleted-file bytes remain source provenance in the private committed import archive; they do not become new trusted decisions or account permissions. The live restore audit records the archive ID, checksum and counts rather than copying all source history into another event.

Download original committed import archives separately through the recovery page/API and keep them with the current workspace backup. Archive payloads are not embedded recursively in each later workspace export. Keep the original source files as independent recovery copies; a current-workspace backup alone does not replace those earlier archives.

Native source identities and connection IDs survive recovery. Connections return unconfigured, without saved credentials. Reconnect the restored connection with a new credential so unchanged source IDs remain idempotent; creating a different connection establishes a different source identity. Changed source rows require explicit reconciliation. Remote previews read only the first supported page of up to 100 records, and CSV previews accept up to 1,000 rows; neither claims a complete external-system migration.

Current storage and request bounds are defined in code:

- A backup import may be at most 64 MiB. The client sends larger files as authenticated chunks, then requests one preview. Chunk uploads and previews expire after 30 minutes. Original committed import archives remain private administrator recovery records.
- Pending previews share a separate limit of 4 previews and 128 MiB of retained Postgres JSON text per organization. Committed backup archives and integration-import journals share a separate limit of 32 committed previews and 128 MiB. The server measures both with Postgres `octet_length(payload::text)`, including JSON representation overhead, rather than trusting the file size. Preview creation checks pending and eventual committed capacity under the organization lock; commit checks the retained limit again. Expired uncommitted previews can be cleared when creating a new preview. Committed source archives are preserved even after their original preview expiry.
- Each file may be at most 2 MiB; the workspace file quota is 25 MiB and 1,000 files. Allowed types are PDF, UTF-8 text/CSV, PNG and JPEG, with signatures checked where applicable. File downloads use attachment disposition and restrictive headers.
- Structured record data has a 16 MiB workspace quota, with a 64,000-byte bound per normalized domain record. The central save path limits the workspace to 2,000 active records, including bulk callers. Connection creation and restore are limited to 30 connections.
- A conservative 60 MiB current-workspace export budget covers records, history, comments, reports, connections, publication/intake rows, participation history/outbox and base64 file data. Ordinary mutations stop before exceeding it, leaving room inside the 64 MiB restore envelope. Original import archives and temporary uploads are stored separately from this projected export budget.
- A separate 1 MiB audit reserve records minimal access-control changes after the ordinary budget is full. Revocation, access changes, connection disablement, public-request cancellation, publication withdrawal, answer erasure, participation cancellation and preference-off must still complete even if that reserve is exhausted. In that emergency case the service emits a redacted operational warning instead of promising another durable audit event. Export remains available at the budget limit; retain the recovery copy and resolve storage before ordinary work continues.
- Session and organization access are separate from these storage controls. A planning record called a cost limit does not provision a service or enforce provider billing.

If a preview/archive limit is reached, the service returns 422 before retaining a new preview or committing its import. Existing source archives stay downloadable through the administrator recovery API. Download the current workspace and its original source archives, keep those copies, and use a new empty workspace for further recovery/import work. The service does not delete committed archives or promise an archive-deletion control. A pending preview is not a reservation of future archive capacity; another commit can consume the remaining room before it is applied.

The W1 adapter in [migration.mjs](lib/migration.mjs) accepts the earlier local browser export format, `charitology.charity-os` version 1, through the same authenticated preview/commit workflow. It converts projects, grants, tasks and outcome definitions into linked shared drafts, with a deterministic ID map and structured review warnings. Source owner labels do not create accounts or permissions; statuses and evidence assertions do not establish approval. Exact representable money retains its source currency and precision, with no exchange conversion. Unrepresentable amounts stay in the private source archive and become unknown active values. Dates without clock time/time zone and unsupported notes also remain archived. Observation measurements, including zero and null, remain archived until a real measurement period and any required denominator are supplied.

The complete source JSON is preserved privately in the committed migration archive, including unsupported fields; warnings omit its private field values. Local source archives are bounded at 8 MiB, and generated shared records must fit the shared workspace limits. Review the conversion counts and warnings before confirming. Keep the original local file with the shared backup and separately downloaded source archive; see [MODULES.md](docs/MODULES.md).

## Mail and operations

The included hosted schedule calls authenticated `/api/cron/maintenance` daily at **07:00 UTC**. Reminders are processed when that dispatcher runs after their due instant; they are not an exact-time notification guarantee. Invitation creation also attempts queued work after committing the invitation. Jobs persist attempts, lease/retry state and a stable relay identity. Dispatch uses a shared 45-second start/mail budget, a margin before starting another job and tenant ordering by least recent visit; it does not promise unbounded work in one function invocation. Removed membership, inaccessible records, expired/revoked invitations and deleted records stop the relevant delivery.

The relay uses transactional mail from the configured Charitology sender with a dedicated `OS_MAIL_RELAY_SECRET`. Login links use `/auth/confirm`, invitations use `/invite` and reminders use `/app`. The mail service must be migrated/configured separately; see [newsletter README](../newsletter/README.md). Its sender verification, tracking-off checks, native provider idempotence and durable relay intent remain in force. OS mail does not subscribe anyone to The Charitology Letter.

An accepted job means the provider/relay accepted the request; it does not prove inbox delivery. Ambiguous attempts are not blindly resent with a fresh identity. Inspect the administrative job summary and provider delivery evidence before deciding on recovery. Preserve account access, relay secrets and integration encryption material privately. A database restore does not restore external provider subscriptions or revoke already queued mail.

Serve this directory as its own service using [vercel.json](vercel.json), or the included local Node server for development. Use HTTPS for production, the constrained runtime database role, independent cron and relay secrets, and the configured exact origin. A successful `/api/health` response reports configuration presence, not proof of sender readiness, database isolation or inbox delivery. Run the checks and a controlled owned-recipient delivery exercise before treating a deployment as operational.

AI assistance was used for implementation, review and documentation. No legal, accounting, safeguarding or security certification is claimed.
