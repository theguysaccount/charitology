# Shared Charity OS

An organization workspace for coordinating charitable work, built as a separate service from the public Astro site and the local browser workspace. It combines typed records, accountable owners, linked workflows, independent review and private recovery tools. Charitology studies the system that directs generosity; it does not rate named charities or judge the good people are doing. A program's optional depth value is a hypothesis about mechanism, not a grade.

This is a Node 24 ESM service with a plain JavaScript browser client, a Postgres database and Better Auth magic-link sessions. Dependencies are pinned in [package.json](package.json) and [package-lock.json](package-lock.json). Detailed domain rules are in [MODULES.md](docs/MODULES.md); the source and regression review is in [BACKEND_REVIEW.md](docs/BACKEND_REVIEW.md).

## What the service does

All 26 modules share typed forms, linked records, table/board views, applicable calendar views, ownership, revisions, comments and workflows. The registry now contains 339 fields. Their definitions and validation are in [modules.mjs](lib/modules.mjs), rather than being interchangeable free-text forms.

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

## Directory source review for Resources

The public Tools/Benefits directories and the hosted Resources index support an explicit retained-source selection → inspection → preview → unapproved Resource copy. Rechecks show exact source versions, field changes, owned organization notes and optional dated declarations. Resources remain organization-wide, including for program-scoped writers; the UI states that boundary before copying. No program field, provider connection, eligibility approval, enrollment, reminder or job is added. All 31 retained entries remain editorial drafts checked October 25, 2026.

Current session/membership, source/head, record revision and exact raw proposal are rebound under the organization lock. One primary binding survives Retry, changed keys and trash. Ordinary workflow validation and independent approval still apply; recheck clears approval and preserves an existing frozen reader snapshot. Full organization JSON preserves complete source history; selected evidence and CSV are partial. Restore leaves history inactive until an authorized member explicitly adopts it.

Runtime `02cc6cfc3ee45c4c7f5427c56e4f2d86bca6bac2` passes 408 complete OS unit/browser-model tests, 116 actual isolated PostgreSQL tests, the 546-page build/check and both exact-head CI runs. Final fictional Better Auth/Chrome covers 25 versioned journeys and eight narrow light/dark layouts, including actual saved-full-backup chooser/restore/adoption. The additive migration preserves all 31 prior tables/60 rows/ACLs and increases forced-RLS tenant tables from 24 to 25. Protected stage `dpl_F2ACtEYm5CLHDUwwyKQQCJBfJxdE` passes 43 HTTP checks and 13 exact assets. Final docs `670f132fdfcd7e0d36d95388fa6ead8b2776a547` passed both exact CI runs; PR #28 merged as `c0d509a0e132e91b7f5d6b764eabce421015b125`, and Pages 40584685952 succeeded. The exact tested stage is promoted after 44 canonical checks/13 exact assets; all 31 old tables/60 rows/ACLs remain unchanged. All 62 selected public files and 31 source fragments match, including favicon/OG media. Live Chrome confirmed the unsigned exact-fragment handoff. Normal future Git auto-assignment remains enabled. The [acceptance record](../../docs/DIRECTORY_RESOURCE_BRIDGE_ACCEPTANCE.md) separates exact versions, fixture assistance, corrected bugs/harness findings and remaining operating work.

## Manual recurring task drafts

Projects tasks support explicit preview → generate for one weekly, monthly or quarterly successor. The preview retains the original calendar anchor, requires an instant choice for repeated local times and refuses missing local times. New tasks start planned and unapproved, with the acting member as owner. Source approvals, connection identity, files, comments and reminders are not copied. Nothing generates on a schedule or sends a message.

One source has one saved successor across retries and later edits. Active series keep kind, program and schedule fixed until a separately confirmed End; cancellation/deletion also ends generation without cancelling children. Current organization/program permissions are rechecked. Backup restores recurrence only as inactive history. The [acceptance record](../../docs/OS_RECURRENCE_ACCEPTANCE.md) records exact limits, real signed-in fictional browser checks, 309 units and 90 isolated PostgreSQL tests. PR #26/release head `b542f13f3ceec9960b358e816afa589584e36252` passed both exact CI runs. Runtime `ffdbf7af612985492dd415bd7b0af4ffdaf7b398` is promoted as `dpl_CyAHQVAiZ4zqwQD4yVQQob3f4Cq9` after 34 staged/35 canonical checks and ten exact assets. The additive migration preserved all 60 old rows/columns/ACLs and inspected 24 forced-RLS tables. See that record for proof time and normal future auto-assignment limits.

## Grant-period reports

The new bounded grant-report implementation selects one agreement, one explicit program and one inclusive date period. It separates awards and commitments from selected external receipts, dated cash-spent references and planning context. Unknown amounts keep an unknown headline total with a known subtotal and missing-reference count; empty selections are not reported as zero activity. Individual observations retain their own units, periods, denominators, evidence and limitations without pooling or causal inference.

An authorized contributor prepares sources from a saved Reporting manifest, explicitly saves the source digest through the normal revision workflow, then obtains a different authorized contributor's approval. A final approved preview expires after ten minutes. Freeze recomputes current source/approval/membership authority and appends one immutable edition. Later corrections require changed manifest data, fresh preparation/approval and a reason; old bytes remain unchanged. Interrupted commands can recover the original report without duplicating the approved edition.

Staff access requires current source read/export permissions and scope. Eligible board readers receive only a separately checksummed allowlisted projection for a board-audience manifest; they do not receive private application context, contacts, external source identities/URLs, actor metadata or raw source records. External reviewers are excluded. Authors still need to inspect approved summary/limitations for personal information. Reports are not automatically published, mailed or submitted to a funder, and software approval is not an accounting certification or verification of impact.

[GRANT_REPORTS.md](../../docs/GRANT_REPORTS.md) records the exact workflow, API, limits and evidence. The grant-report release promoted runtime `c9750a92f0ac6d5f2b717875f5e0a85f08e98edb` as `dpl_6FZTpTgrSCfiJcsPazysjGdNfW5D`. Exact CI passed 244 OS unit/browser-model and 69 actual OS PostgreSQL checks, plus mail and static checks. Controlled actual Chrome with synthetic Better Auth accounts verified preparation, separate-account API approval, freeze, downloaded JSON/checksums, print preview, board privacy, stale-source rejection and logout. All 29 staged/30 public-origin checks and production forced-RLS inspection passed. Narrow-screen browser acceptance, independent review and a real reporting-cycle pilot remain open. Existing generic module-snapshot reports retain their prior behavior.

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

A forced own-user RLS index provides cross-organization navigation; intake and publication tables retain their strict tenant policies. Links are capped at 100/account and 1,000/organization including revoked links, under organization-then-user locks. Durable limits cover claims, reads and writes. Private exports restore no account grants, and existing publication/receipt recovery stays inactive. [The pre-implementation plan and acceptance record](../../docs/PARTICIPANT_PORTAL.md) distinguishes actual authentication, simulated frontend checks, controlled browser evidence and deployment status. The bounded booking and separately gated delivery controls below extend this portal.

## Confirmed participation and waitlists

Runtime `e6c880d6bb2f89b4ca2fa507372d25cb964c4f69` / `dpl_4Zs32Y794voSwEkcPnEbrMgygJCG` is promoted to https://os.charitology.org. [The acceptance record](../../docs/PARTICIPATION_BOOKINGS.md) records exact CI (159 service/44 actual OS Postgres checks), forced-RLS migration, staged/live HTTP checks and controlled fictional Chrome evidence. No production participant adoption is claimed.

The Participation console manages one person and one place for a whole event session or volunteer shift. Before enabling an occurrence, an administrator reviews and accepts an exact, hashed inventory of existing active typed registrations or assignments. Unknown old consent remains unknown. Duplicate, overlapping or over-capacity legacy occupancy blocks adoption.

A scoped writer deliberately associates a typed registration or assignment draft with a contact and, where applicable, its converted intake request. Association reserves no capacity. The participant can affirm the current independently approved purpose, instructions, schedule and organizer contact through their own linked request. A staff member can instead record a specific offline affirmation with its method and evidence reference. Collection consent and an interest request alone do not authorize participation.

Staff explicitly confirm a requested participation or place it on a consented waitlist. Promotion is manual; the console suggests the earliest currently eligible waitlisted request, and skipping it requires an operational reason. Confirmation requires current independent source and candidate approval, exact revisions, capacity and volunteer overlap checks in the organization transaction. There are no group allocations, holds, automatic eligibility judgments or automatic promotions.

Confirmed places have a separate fulfillment history and retain frozen terms when generic edits reset a record to review. Generic edits, transitions, imports, deletion and trash recovery cannot bypass allocation rules. Cancellation releases capacity once and never promotes another person automatically. Cancellation remains available when the source closes, approval changes or ordinary storage fills. A cancelled candidate is historical; reapplication requires a new typed candidate.

The own-request portal shows only that participant's associated state and public terms. Specific consent, email preference and cancellation are separate actions. Withdrawing the original request or erasing its answers does not cancel a confirmed participation. Permanent unlinking removes self-service access and cancels unsent account-addressed notices; the portal warns participants to cancel first or retain the approved organizer contact. Confirmed terms cannot be silently rescheduled through a new consent form.

The historical booking email checkbox remains preference-only. The new delivery workflow requires fresh `participation-email-v1` consent from the verified own-linked participant, then an administrator's exact review of 1–20 current confirmations. Both services default participation delivery off and controlled-recipient mode on; the organization policy starts disabled too. Activation creates new snapshot intents, while later eligible waitlist/confirmation/cancellation changes can queue updates under that policy. Saving consent sends no welcome, and old paused history never becomes a backlog. [PARTICIPATION_DELIVERY.md](../../docs/PARTICIPATION_DELIVERY.md) records the implemented controls and release evidence; [the plan](../../docs/PARTICIPATION_DELIVERY_PLAN.md) preserves the design. Login, invitation and personal-reminder behavior and newsletter consent stay separate.

Managed targets are limited to 500 rows/2 MiB, participation history to 2,000 rows/8 MiB and retained outbox history to 8,000 rows/8 MiB, including cancelled/history rows. Live intents reserve 8 KiB each for bounded outcome metadata; accounting uses the larger of actual row bytes or that reservation. Four transient delivery reviews per organization expire after 10 minutes, with private bindings bounded at 64 KiB. The conservative workspace export budget also applies. At full storage, cancellation and preference-off can omit a new notification event rather than strand a place; the response makes that gap explicit. Commands use a random intent key and expected revisions. Only an exact latest-command retry is replayable; reload after an ambiguous failure rather than inventing a new attempt.

Backups preserve bounded fulfillment provenance, not live authority or restored participant access. Recovered targets remain paused and blocked, consent cannot allocate, and former confirmed occupancy must be reconciled through exact administrator adoption before new places can be allocated. Missing references for formerly confirmed history are rejected. Historical approvals, actors and timestamps are provenance, not proof of a new review. See [the pre-implementation contract](../../docs/PARTICIPATION_BOOKINGS_PLAN.md) and the [release record](../../docs/SHARED_OS_RELEASE.md).

## Architecture and access

- [api/index.mjs](api/index.mjs) connects the authenticated request handler to the database and mail relay. [public/](public/) contains the browser client and local fonts.
- [auth.mjs](lib/auth.mjs) configures Better Auth. Sign-in links expire after 10 minutes, use hashed verification tokens and require a deliberate confirmation POST. Opening an email link with GET does not create a session. Session cookies are HttpOnly and use secure transport for HTTPS origins.
- [database.mjs](lib/database.mjs) sets organization/user context inside each transaction. Tenant tables enable and force row-level security. Mutations serialize by organization and require expected revisions where records or memberships are replaced. The application uses a separate role that cannot bypass RLS; the migration owner is not the runtime role.
- [access.mjs](lib/access.mjs) checks current membership, module permissions and program scope. Linked targets must also be readable. Membership changes apply on subsequent requests and reminder access is rechecked at dispatch.
- [jobs.mjs](lib/jobs.mjs) stores invitation and personal-reminder jobs. [mail.mjs](lib/mail.mjs) calls the separate, purpose-limited newsletter service relay. No OS mail operation creates a newsletter subscriber, Contact, Topic, Segment or Broadcast.
- [integrations.mjs](lib/integrations.mjs) supports read-only CiviCRM, OpenProject and Kobo previews plus local CSV rows. Credentials are encrypted server-side. HTTPS hosts must resolve to public addresses; the checked address is pinned and redirects are refused. Import is an explicit preview/commit operation, not unattended two-way synchronization.
- [participation.mjs](lib/participation.mjs) manages confirmed occupancy and consent separately from generic review state. Central [write guards](lib/participation-guards.mjs) protect generic mutations and [recovery](lib/participation-backup.mjs) restores inactive provenance.
- [participation-delivery.mjs](lib/participation-delivery.mjs) adds verified versioned email consent, exact administrator activation, safe scoped status, bounded leases and status-only recovery of uncertain attempts. [Delivery recovery](lib/participation-delivery-backup.mjs) restores disabled policies and no recipient authority.
- [grant-report-model.mjs](lib/grant-report-model.mjs) assembles deterministic one-grant period reports. [grant-reports.mjs](lib/grant-reports.mjs) binds current authority, transient previews, immutable freeze/replay and the server-selected board projection.
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

`npm test` runs server/domain/registry and browser API/model regressions; the explicit Node command is equivalent. `test:db` reads private `.env.local`, requires both owner and constrained application URLs, and exercises actual Postgres with Better Auth. Its fixture creates a random temporary schema, applies migrations there, grants the application role access to that schema, asserts the role cannot bypass RLS, uses synthetic recipients with a mocked mailer and drops the schema in `finally`. Use a dedicated test database whose owner can create/drop schemas; do not point it at a production database.

[charity-os-check.yml](../../.github/workflows/charity-os-check.yml) runs on relevant pull requests and main-branch changes, can be called by another workflow, and supports manual dispatch. It installs locked dependencies, checks the browser entry's syntax, runs server plus browser-model tests, and runs the actual database fixture against a disposable Postgres 17 service. CI creates a separate `os_test_app` login with no superuser, role-creation, database-creation, inheritance or RLS-bypass privilege. It uses no provider or deployment secrets and does not send email. CI invokes the database test directly so a private local env file is never loaded.

Test commands and workflow configuration are not evidence that a hosted deployment or inbox delivery passed. Record those results separately. [BACKEND_REVIEW.md](docs/BACKEND_REVIEW.md) states the scope and limitations of the independent source/regression review.

The directory Resource release's complete suite passes 408 unit/browser-model and 116 actual isolated PostgreSQL tests. Its focused regressions cover source identity, exact proposal binding, queued session revocation/expiry, ordinary approval/snapshot rules, PostgreSQL quota accounting, inactive recovery/adoption and strict exact-file admission. The [acceptance record](../../docs/DIRECTORY_RESOURCE_BRIDGE_ACCEPTANCE.md) records independent review, exact CI and separate controlled browser/protected-stage evidence; fictional accounts do not establish human review or a pilot.

The current delivery implementation passed 188 local service/browser-model checks and the full 60-check actual PostgreSQL suite, including 16 delivery checks. Transport was injected; the separate hosted CI, controlled Chrome and actual owned-inbox evidence are recorded in [the delivery record](../../docs/PARTICIPATION_DELIVERY.md).

The new grant-report slice separately passed 33 focused model/service tests and nine isolated actual Postgres tests, including eight workflow groups and their parent. They cover current source approval, synthetic historical submission artifacts, replay/concurrency, board privacy, quotas and inactive recovery. They use injected server identities rather than claiming real sign-in or human review. Subsequent exact release CI passed 244 OS unit/browser-model and 69 actual PostgreSQL checks, plus mail and static checks; 29 protected-stage/30 public-origin checks and production isolation inspection also passed. Separately, actual Chrome with fictional Better Auth accounts covered the authenticated report journey, downloaded JSON/checksums, board privacy, stale sources and logout. A ten-page print preview was cancelled; no physical print or saved PDF is claimed. Narrow-screen acceptance, independent human/accountant review and a consented reporting-cycle pilot remain open. See [the report acceptance record](../../docs/GRANT_REPORTS.md) for exact evidence and limits.

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
| `POST /grant-reports/prepare`, `/preview`, `/freeze`                       | Prepare selected approved sources, cache a reviewed proof or freeze an immutable one-grant edition with a body-bound command key. |
| `GET /grant-reports`, `GET /grant-reports/:id`                             | Twenty-row scoped pages and the current-authority-selected staff payload or board projection.                                     |
| `GET /members`, `PATCH, DELETE /members/:userId` | Inspect the team or administratively change/revoke access. |
| `POST /invitations`, `DELETE /invitations/:id` | Issue or revoke an invitation. Acceptance uses `POST /api/invitations/accept` and the invited authenticated email. |
| `GET, POST /integrations` | Inspect connections or create one. |
| `PATCH, DELETE /integrations/:id` | Replace/remove credentials with expected revision, or disable a connection. |
| `POST /integrations/:id/test`, `/preview`, `/import` | Test read-only access, review mapped rows, then commit the stored preview. |
| `GET /export`, `POST /import/upload`, `/import/preview`, `/import/commit` | Download a backup or upload, preview and commit a recovery file. |
| `GET /backups/imports`, `GET /backups/imports/:id` | Administrator access to original committed import archives. |
| `GET /directory-resources/records/:id` | Current permitted Resource/source history, with bounded cursor pages. |
| `POST /directory-resources/preview`, `/commit` | Inspect a copy/recheck/adoption plan, then deliberately commit its exact memory-only proof and command. |
| `GET /directory-resources/records/:id/export` | Permitted partial selected-Resource evidence; not a full recovery file. |
| `GET, POST /intake/publications`, `POST /intake/publications/:id/withdraw` | Administrator publication of an approved current form version, list/status or withdrawal. |
| `GET /intake/submissions`, `GET /intake/submissions/:id` | Administrator-only private queue, filters, cursor pages and detail. |
| `POST /intake/submissions/:id/review` | Expected-revision review, dismissal, draft conversion or answer erasure. |
| `GET /participation-targets`, `GET /participation-targets/:id` | Scoped-writer occurrence list and adoption preview. |
| `POST /participation-targets/:id/adopt` | Administrator acceptance of exact hashed legacy occupancy. |
| `GET, POST /participation-targets/:id/participations` | Scoped-writer roster pages or deliberate typed-candidate association. |
| `POST /participation-targets/:id/participations/:participationId/:action` | Expected-revision `consent`, `waitlist`, `confirm`, `promote` or `cancel`. |
| `GET /participation-delivery`, `GET /participation-delivery/outbox` | Scoped-writer candidate/status pages; no addresses or recipient bindings. |
| `POST /participation-delivery/preview`, `/activate`, `/disable` | Administrator review, exact atomic activation or policy disable. |

Authenticated catalog paths are `GET /api/directory-resources/catalogs` and `GET /api/directory-resources/catalogs/:captureId/:catalogKind/:listingId`. They expose only the bundled retained source projection. No request fetches provider URLs or discovers a remote catalog.

Public paths are `GET /api/public/intake/:orgId/:publicationId`, `POST .../submissions` and `POST .../receipt`. Standalone pages use `/p/:orgId.:publicationId` and `/p/receipt#orgId.publicationId.privateToken`. GET never cancels. Public endpoints return no private queue answers, contact addresses, approval identities or receipt hashes.

Own booking paths are `GET /api/participant/orgs/:orgId/requests/:intakeId/participations` and `POST .../participations/:participationId/consent`, `/cancel` or `/preferences`. Fresh delivery uses `GET .../participations/:participationId/delivery` and `POST .../delivery-preference`, with expected participation/intake revisions, the current consent-copy version, an enabled choice and a random command key. These paths require a verified session and the existing active own-request link; they expose no roster, private staff reasons or contact identifiers. The server chooses the verified recipient; clients cannot submit one.

Record replacement/approval/transition/delete uses the expected integer `revision`. A stale revision returns 409. Domain validation returns 422 with field issues. A broken connection or interrupted mutation is not proof that the write failed; reload saved state before deciding whether to repeat it. Imports commit a server-stored preview and refuse expired, previously committed or changed-workspace previews. They do not trust client-supplied preview records.

## Recovery, files and limits

Download an organization JSON backup before a migration or handover. It contains private records, current files, comments, source history, reports, trash metadata, deleted documents' bytes in `trashFiles` and connection configuration; store it under the organization's access rules. It omits authentication sessions, newsletter consent, live invitation/job tokens and connector credentials. Module CSV neutralizes formula-like cells, but JSON is the recovery format. Large JSON and CSV responses stream.

Backups also include deliberately published schemas and private intake answers/status, including erasure tombstones, but omit receipt, idempotency, payload and IP hashes. Restored publications are withdrawn, old receipt capabilities remain disabled and prior staff reviews do not authorize conversion. An erased active request restores closed, with no answers. Publish a newly approved form for new requests and handle recovered requests manually. Historical source archives and previously downloaded backups can still contain answers that were subsequently erased from the live queue.

Delivery backups preserve policy/outcome provenance, including former outbox state, while restoring a fresh disabled policy, cancelled legacy intents and no delivery consent, recipient/relay bindings or account grants. Historical accepted/unknown outcomes never authorize a resend. Answer erasure and unlinking disable current delivery consent and cancel unattempted work without cancelling attendance or recalling an email already attempted.

Directory history backups preserve complete retained source cores and exact event chains, including recovered/archive-only provenance. They omit live receipts, command/proof/session authority and account grants. Restored history stays inactive; an authorized member must inspect and explicitly adopt a currently readable Resource. A selected Resource evidence file is partial and cannot be imported as a full organization backup.

Restore into an organization with no records, including trash, and no existing connections. Preview validates the checksum, schema and linked records; commit rechecks destination state in a transaction. Active records keep their stable IDs but start at the module's initial workflow state with the restoring member as owner and approvals/snapshots reset. Original audit history, comments, reports, trash and deleted-file bytes remain source provenance in the private committed import archive; they do not become new trusted decisions or account permissions. The live restore audit records the archive ID, checksum and counts rather than copying all source history into another event.

Download original committed import archives separately through the recovery page/API and keep them with the current workspace backup. Archive payloads are not embedded recursively in each later workspace export. Keep the original source files as independent recovery copies; a current-workspace backup alone does not replace those earlier archives.

Native source identities and connection IDs survive recovery. Connections return unconfigured, without saved credentials. Reconnect the restored connection with a new credential so unchanged source IDs remain idempotent; creating a different connection establishes a different source identity. Changed source rows require explicit reconciliation. Remote previews read only the first supported page of up to 100 records, and CSV previews accept up to 1,000 rows; neither claims a complete external-system migration.

Current storage and request bounds are defined in code:

- A backup import may be at most 64 MiB. The browser validates exact selected bytes with fatal UTF-8, duplicate decoded-key and nonfinite-number checks before parsing; server direct/chunked intake repeats strict admission. Larger files use authenticated chunks, then one preview. Whole backups do not inherit the directory command's small depth/byte bounds. Chunk uploads and previews expire after 30 minutes. Original committed import archives remain private administrator recovery records.
- Pending previews share a separate limit of 4 previews and 128 MiB of retained Postgres JSON text per organization. Committed backup archives and integration-import journals share a separate limit of 32 committed previews and 128 MiB. The server measures both with Postgres `octet_length(payload::text)`, including JSON representation overhead, rather than trusting the file size. Preview creation checks pending and eventual committed capacity under the organization lock; commit checks the retained limit again. Expired uncommitted previews can be cleared when creating a new preview. Committed source archives are preserved even after their original preview expiry.
- Each file may be at most 2 MiB; the workspace file quota is 25 MiB and 1,000 files. Allowed types are PDF, UTF-8 text/CSV, PNG and JPEG, with signatures checked where applicable. File downloads use attachment disposition and restrictive headers.
- Structured record data has a 16 MiB workspace quota, with a 64,000-byte bound per normalized domain record. The central save path limits the workspace to 2,000 active records, including bulk callers. Connection creation and restore are limited to 30 connections.
- A conservative 60 MiB current-workspace export budget covers records, history, comments, reports, connections, publication/intake rows, participation history/outbox, delivery policy/reviews and base64 file data. Ordinary mutations stop before exceeding it, leaving room inside the 64 MiB restore envelope. Original import archives and temporary uploads are stored separately from this projected export budget.
- Grant reports allow 100 selected sources, 250 records in the dependency closure and 2 MiB canonical final JSON. Four live report previews share 8 MiB of measured row data and expire after ten minutes; they count toward the ordinary workspace budget rather than committed source-archive slots. Commands are at most 16 KiB, with separate per-account limits of 120 reads/hour and 60 preparation/preview/freeze commands/hour. Report recovery retains historical payloads only in the private source archive, with no active report, preview or approval authority.
- Directory history allows 250 primary bindings, 1,000 total capture/event rows and 32 events per binding. Each row is at most 32 KiB of measured PostgreSQL JSON payload plus a reserved 4 KiB recovery allowance, within a 4 MiB feature limit and the whole-workspace budget. Dedicated commands stream at most 32,768 bytes; ten-minute proofs remain in memory. Reads and commands have separate per-account limits of 120/hour and 60/hour. These bounds do not authorize automatic rechecks or eligibility decisions.
- A separate 1 MiB audit reserve records minimal access-control changes after the ordinary budget is full. Revocation, access changes, connection disablement, public-request cancellation, publication withdrawal, answer erasure, participation cancellation, preference-off and delivery-policy disable must still complete even if that reserve is exhausted. In that emergency case the service emits a redacted operational warning instead of promising another durable audit event. Export remains available at the budget limit; retain the recovery copy and resolve storage before ordinary work continues.
- Session and organization access are separate from these storage controls. A planning record called a cost limit does not provision a service or enforce provider billing.

If a preview/archive limit is reached, the service returns 422 before retaining a new preview or committing its import. Existing source archives stay downloadable through the administrator recovery API. Download the current workspace and its original source archives, keep those copies, and use a new empty workspace for further recovery/import work. The service does not delete committed archives or promise an archive-deletion control. A pending preview is not a reservation of future archive capacity; another commit can consume the remaining room before it is applied.

The W1 adapter in [migration.mjs](lib/migration.mjs) accepts the earlier local browser export format, `charitology.charity-os` version 1, through the same authenticated preview/commit workflow. It converts projects, grants, tasks and outcome definitions into linked shared drafts, with a deterministic ID map and structured review warnings. Source owner labels do not create accounts or permissions; statuses and evidence assertions do not establish approval. Exact representable money retains its source currency and precision, with no exchange conversion. Unrepresentable amounts stay in the private source archive and become unknown active values. Dates without clock time/time zone and unsupported notes also remain archived. Observation measurements, including zero and null, remain archived until a real measurement period and any required denominator are supplied.

The complete source JSON is preserved privately in the committed migration archive, including unsupported fields; warnings omit its private field values. Local source archives are bounded at 8 MiB, and generated shared records must fit the shared workspace limits. Review the conversion counts and warnings before confirming. Keep the original local file with the shared backup and separately downloaded source archive; see [MODULES.md](docs/MODULES.md).

## Mail and operations

The included hosted schedule calls authenticated `/api/cron/maintenance` daily at **07:00 UTC**. Reminders and participation updates are processed when that dispatcher runs after they become due; they are not an exact-time notification guarantee. Invitation creation also attempts queued work after committing the invitation. Existing invitation/reminder jobs run first; maintenance shares at most 20 selected work/status operations and a 45-second budget across those jobs and participation delivery. Cancellation and deferral consume the work budget too. Jobs retain stable identities, tenants rotate by least recent visit and bounded leases stop concurrent duplicate work. Removed membership, inaccessible records, expired/revoked invitations and deleted records stop the relevant existing job delivery; participation rechecks its own verified-link and consent authority.

The relay uses transactional mail from the configured Charitology sender with a dedicated `OS_MAIL_RELAY_SECRET`. Login links use `/auth/confirm`, invitations use `/invite`, reminders use `/app` and the fixed generic participation notice uses only clean `/participant`. It contains no occurrence, organization, answer or receipt details. The mail service must be migrated/configured separately; see [newsletter README](../newsletter/README.md). Its sender verification, tracking-off checks, recipient suppression, native provider idempotence and durable relay intent remain in force. OS mail does not subscribe anyone to The Charitology Letter.

An accepted job means the provider/relay accepted the request; it does not prove inbox delivery. Ambiguous attempts are not blindly resent with a fresh identity. Inspect the administrative job summary and provider delivery evidence before deciding on recovery. Preserve account access, relay secrets and integration encryption material privately. A database restore does not restore external provider subscriptions or revoke already queued mail.

Participation unknown/expired attempted leases reconcile the same key through server-only status, even after native idempotency expires; missing status is not permission to resend. Only a proven pre-attempt relay defer can retry the same immutable intent. Known acceptance/delivery evidence survives a status outage. Delivered history remains eligible for daily reconciliation so a later verified complaint or bounce can suppress future live consent. Off, answer erasure, unlink and policy disable cancel unattempted work and never create a new privacy-action email. A terminal participation cancellation may notify through retained specific consent without requiring the closed source to reopen.

Serve this directory as its own service using [vercel.json](vercel.json), or the included local Node server for development. Use HTTPS for production, the constrained runtime database role, independent cron and relay secrets, and the configured exact origin. A successful `/api/health` response reports configuration presence, not proof of sender readiness, database isolation or inbox delivery. Run the checks and a controlled owned-recipient delivery exercise before treating a deployment as operational.

AI assistance was used for implementation, review and documentation. No legal, accounting, safeguarding or security certification is claimed.
