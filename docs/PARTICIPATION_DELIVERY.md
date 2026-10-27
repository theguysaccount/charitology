# Participation email delivery

Implementation record · review: draft · AI-assisted documentation

This slice implements operational email for the shared Charity OS participation ledger. A verified participant can give fresh, specific email consent for an own linked participation. An administrator can review and activate a bounded set of current confirmations. Later waitlist, confirmation and cancellation changes can queue updates under that policy. Attendance, capacity and newsletter consent remain separate.

The implementation has passed **188 OS unit/browser-model checks and 60 actual PostgreSQL checks**, including **16 delivery checks**, plus exact-commit hosted CI and a controlled Chrome journey. The database-to-outbox/worker browser proof uses synthetic accounts and injected transport. A separate real OS-transport-to-provider exercise delivered one message to the authorized owner's inbox and verified signed delivery feedback. No production participation or access grant was created, and these checks do not establish participant adoption. The final general-recipient configuration and exact deployment identities are recorded below. The evidence table below preserves those boundaries; the [frozen plan](PARTICIPATION_DELIVERY_PLAN.md) and [service README](../services/charity-os/README.md) explain the contract and setup.

## Published configuration

Both canonical origins run runtime `3913166b8e3be5f301d4145944e05fe1e76eef42`: OS `dpl_Bth3N1eLdNWFUchDewaPKZceakzX` at https://os.charitology.org and mail `dpl_GJxZ7qVXZXnhQwZYpSddZXPVbSbE` at https://mail.charitology.org. Both participation gates are enabled and controlled-recipient mode is off after the one authorized owned-inbox test. Organization activation and fresh own consent remain mandatory. Defaults for new installations remain off/controlled. Final staged/public checks and rollback evidence are in [SHARED_OS_RELEASE.md](SHARED_OS_RELEASE.md).

## The participant's choice

The portal starts with operational updates off unless it holds the new `participation-email-v1` consent. The person must explicitly save that choice. Historical `emailUpdates` preferences, collection consent, attendance consent, offline staff assertions and old paused events cannot enable delivery.

Enabling updates requires the existing own-request link, a verified account and the original reserved request email still matching that account. The server binds the consent copy, time and revision to the current account/link revision and a recipient hash. Staff cannot supply an address or opt in for another person. A changed account address stops the old binding; it does not redirect messages. New consent cannot be enabled after answer erasure. Saving consent alone sends no welcome or other email.

The portal permits this specific choice for an existing confirmed participation without reopening its frozen attendance terms. It can also save consent while the service or organization delivery policy is off, with an explicit unavailable state. Turning updates off uses current own-link authority and expected revisions; it does not require a fresh occurrence approval or ordinary storage space. See [the own delivery routes and recipient resolver](../services/charity-os/lib/participation-delivery.mjs) and [portal controls](../services/charity-os/public/participant.js).

## Administrator activation

The Delivery console is limited to current scoped event/volunteer writers. Candidate and contact scope also apply; a target in one program cannot disclose another program's roster. Only an owner or administrator can preview, activate or disable organization delivery.

1. Select **1–20** current confirmed participations whose occurrence has not ended, with fresh delivery consent. Each needs managed, unrecovered authority, current independent source approval, frozen confirmation terms and a current verified recipient binding.
2. Prepare a review. Its private bindings include participation, consent and link revisions, recipient hash, template and payload hash. The page shows safe eligibility reasons, not addresses or hashes.
3. Commit the exact review hash and policy revision with a random command key. The review expires after **10 minutes**. The server rechecks every selection under the organization lock; a stale or ineligible row aborts the whole activation.

Activation creates new current-state snapshot intents. It never promotes old paused history to pending or flushes a backlog. Exact latest-command replay has no repeated effect. Snapshot and transition paths cannot create two live notices for the same participation revision, consent revision and template. An initial disabled organization policy can be activated after local service configuration is ready. Disabling policy cancels unattempted work and keeps the participant's separate preference. [Implementation](../services/charity-os/lib/participation-delivery.mjs)

## Configuration and the message

Both the OS and the separate mail service require explicit participation configuration. [OS defaults](../services/charity-os/.env.example), [OS settings](../services/charity-os/lib/security.mjs), [mail defaults](../services/newsletter/.env.example) and [mail settings](../services/newsletter/lib/config.mjs) define:

| Setting in both services | Default | Meaning |
| --- | --- | --- |
| `OS_PARTICIPATION_DELIVERY_ENABLED` | `false` | Participation sends remain gated until deliberately enabled. |
| `OS_PARTICIPATION_TEST_ONLY` | `true` | Only the privately configured controlled recipient is eligible. |
| `OS_PARTICIPATION_TEST_RECIPIENT` | empty | Controlled mode cannot send without a valid matching recipient in both services. |

The organization policy starts disabled independently of these settings. Credentials, controlled addresses and database URLs stay server-side. The existing exact OS origin and independent relay secret still apply. Configuration presence and an HTTP health response do not prove readiness or receipt.

The template subject is **Your Charity OS participation update**. Its fixed generic body directs the person to the signed-in portal for current details. The only action URL is the exact configured origin plus `/participant`, with no query or fragment. Neither staff-authored text nor organization, occurrence, schedule, answers, receipt, roster or contact identifiers appear in the notice. The established sender/reply route and postal footer remain. The [renderer and validator](../services/newsletter/lib/os-mail.mjs) accept only the fixed participation purpose; other operational mail keeps its own purpose rules.

No OS delivery operation creates a newsletter subscriber, Contact, Topic, Segment or Broadcast. The [provider adapter](../services/newsletter/lib/provider.mjs) checks sender/tracking readiness and the exact recipient's suppression before an attempt. An unavailable check stops the attempt; the workflow never removes a suppression.

## Dispatch and outcome evidence

The included [schedule](../services/charity-os/vercel.json) calls authenticated maintenance daily at **07:00 UTC**. Existing invitation/reminder jobs go first. They and participation work share **20 selected work/status operations and a 45-second budget per invocation**. Cancelled or deferred leased work consumes that budget too. Tenants rotate by last visit. A queued update can therefore wait for a later bounded run; the service does not promise an exact send time. [Dispatcher wiring](../services/charity-os/lib/handler.mjs), [existing jobs](../services/charity-os/lib/jobs.mjs), [delivery worker](../services/charity-os/lib/participation-delivery.mjs)

Each live intent has a stable key, immutable payload hash, lease nonce and a checkpoint before transport. The worker rechecks state, policy, consent, active link and verified address immediately before that checkpoint. Transport happens outside the allocation lock. Conditional finalization prevents an expired worker from overwriting another worker's result.

| Recorded state | Meaning |
| --- | --- |
| `paused` | Historical or unavailable journal entry; no live send authority. |
| `pending`, `leased` | Queued or being checked. Neither proves acceptance. |
| `accepted` | Durable provider acceptance, including recovery of an existing attempt. |
| `delivered` | Recorded delivery to the receiving mail server; no inbox-placement or reading claim. |
| `unknown` | A possible attempt lacks a confirmed result. Reconcile the same key; never invent a resend identity. |
| `suppressed`, `failed`, `cancelled` | A recorded blocked, failed or stopped intent; attendance is unchanged. |

An expired attempted lease becomes unknown and status-only. A missing status or network failure does not prove that no email was sent. Resend documents a [24-hour native idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys); its expiry never authorizes a new attempt here. Durable minimal intent history remains. Only an explicit relay send response proving `unavailable/preflight_unavailable` permits a bounded retry of the exact same key and payload before any provider attempt. Status failure supplies no such permission.

Reconciliation preserves known acceptance/delivery evidence during a temporary status outage. Delivered rows remain eligible for slower daily status checks, so a later verified complaint or bounce can record suppression. Verified blocking evidence disables the matching current live consent and cancels unsent work. An older or contradictory response cannot turn unknown data into consent authority. [Outcome handling](../services/charity-os/lib/participation-delivery.mjs), [typed transport](../services/charity-os/lib/mail.mjs), [relay status](../services/newsletter/lib/os-mail.mjs), [verified feedback](../services/newsletter/lib/webhook.mjs)

The existing relay bounds remain **200 operational attempts/day globally** and **10/recipient/hour**, with a separate **60 status reads/minute globally**. Duplicate/status reads do not become new send attempts. These are application limits, not provider-plan or deliverability guarantees. [Rate definitions](../services/newsletter/lib/os-mail.mjs)

## API boundaries

Browser mutations use same-origin session cookies, JSON and the current CSRF value. Own commands also carry expected participation and intake revisions. [The handler](../services/charity-os/lib/handler.mjs) keeps these separate from the independent server relay bearer.

| Path | Authority and behavior |
| --- | --- |
| `GET /api/orgs/:orgId/participation-delivery` and `/outbox` | Scoped writer; safe candidate/outcome pages of 20. |
| `POST .../participation-delivery/preview`, `/activate`, `/disable` | Administrator; exact saved selection/hash and policy revision, with a random command key for activation/disable. |
| `GET /api/participant/orgs/:orgId/requests/:intakeId/participations/:participationId/delivery` | Verified own-link account; its safe delivery preference and latest outcome. |
| `POST .../participations/:participationId/delivery-preference` | Same own authority; expected revisions, `enabled`, `consentVersion` and random `idempotencyKey`. No caller-supplied recipient. |
| `POST /api/system/os-mail/status` on the mail service | Independent server bearer and existing intent key in JSON. Status only; no public email lookup or send. |

## Privacy actions and cancellation

Turning email off, erasing request answers, unlinking portal access and disabling organization delivery never create a new email. Off/unlink/erasure cancels unattempted work; erasure and unlink also remove current delivery authority. These actions remain available after ordinary storage fills. Earlier provider acceptance and private recovery history remain provenance. If email authority is withdrawn before the final check, the attempt stops; a change after that check can race with transport. An already attempted message cannot be recalled.

Request withdrawal and answer erasure do not cancel attendance or release a confirmed place. Permanent unlinking removes self-service access. The independent participation cancellation action releases its place once and may queue one current cancellation notice using pre-existing live consent and an active verified link, even after the source closes. It never creates or renews consent. No automatic promotion follows cancellation. [Booking controls](../services/charity-os/lib/participation.mjs), [request privacy hooks](../services/charity-os/lib/participants.mjs), [administrator erasure](../services/charity-os/lib/intake.mjs)

## Storage and recovery

The journal retains at most **8,000 rows/8 MiB**, including terminal and legacy history, with a **2 KiB** causal payload bound. Each live intent reserves **8 KiB** for bounded later outcome metadata; accounting uses the larger of the measured PostgreSQL row or its reservation. At most **four** transient delivery reviews are retained per organization, each with **64 KiB** of private bindings. Expired reviews can be removed; terminal intent identities are not automatically deleted. All normal delivery storage counts in the existing **60 MiB** workspace budget. Safe cancellation may omit a new notice rather than strand a place. [Schema](../services/charity-os/lib/schema.sql), [accounting](../services/charity-os/lib/database.mjs), [admission checks](../services/charity-os/lib/participation-delivery.mjs)

Private backups preserve bounded policy and outcome provenance. Restore creates a fresh disabled policy, no reviews, no live delivery consent, no account grants and no recipient/relay bindings. Former delivery state is retained as historical `recovered_state`; current restored outbox rows are cancelled legacy history. An accepted or unknown source event can never become a resend credential. Current erasure cannot erase older downloaded backups, private source archives or provider retention. [Delivery recovery](../services/charity-os/lib/participation-delivery-backup.mjs), [ledger recovery](../services/charity-os/lib/participation-backup.mjs)

## Verification recorded here

| Evidence | Result |
| --- | --- |
| Local service and browser-model checks | **188/188 passed**, no failures or skips. Covers the OS workflow, strict delivery outcomes, transport isolation, consent UI and stale reads. |
| Actual PostgreSQL suite | **60/60 passed**, serialized, using random schemas and the constrained application role. Includes Better Auth and existing intake/booking/recovery workflows. |
| Delivery PostgreSQL checks within that suite | **16/16 passed**. Covers forced RLS, fresh consent, original email binding, stale-review rollback, snapshot/replay dedupe, concurrent one-attempt leases, unknown status-only recovery beyond native cache expiry, exact preflight defer, later suppression, scoped output, privacy, shared work limits, row reservations, full-budget opt-out and inactive restore. |
| Cleanup and formatting | Temporary-schema teardown passed; a separate namespace check found zero remaining delivery test schemas. The four delivery helper/test files passed pinned formatting. |
| Browser acceptance | Chrome exercised one fictional seeded confirmation with actual isolated PostgreSQL, the constrained role and real Better Auth captured-email login. Fresh consent, initial disabled-policy activation, exact replay, accepted/simulated-delivered outcomes, 390-pixel opt-out, cancellation, erasure and unlink passed, with one mocked send and one status call. Fresh-process maintenance loaded worker SHA-256 `2bc28f2c8cb7640b17b98aabefe57a62636e91ab61b8c9576ebabfedaac1c41a`; the earlier UI handler preceded final worker-only refinements, so the whole UI journey is not labeled exact final-worker evidence. Keyboard checks cover the new checkbox/save flow, and mobile checks cover the own card, not a full accessibility audit. Temporary schemas/listeners were removed. |
| Hosted CI and staged/production checks | [Run 40452060367](https://github.com/theguysaccount/charitology/actions/runs/40452060367) passed commit `3913166b8e3be5f301d4145944e05fe1e76eef42`: **188 OS unit/60 OS PostgreSQL**, **75 mail unit/9 mail PostgreSQL** checks and the **447-page** public build/check. Protected-stage checks passed **23 OS + 10 mail**; public-origin checks passed **24 OS + 10 mail**, with eight exact OS asset SHA comparisons in each OS check set. All **21** production tenant tables forced RLS, and runtime privileged-role flags were false. The published configuration above records both final deployment identities; [the release record](SHARED_OS_RELEASE.md) preserves the final promotion and rollback evidence. |
| Controlled owned-inbox exercise | One authorized owner-recipient message used actual OS `participationMailer` → canonical relay → Resend. Gmail INBOX inspection confirmed HTML/plain text, DKIM pass, expected sender/reply/footer and the exact clean portal action; an actual Chrome click opened `/participant` without a receipt. Same-key repeat recovered the accepted intent without another attempt. The mail-service database held one attempted intent, with signed sent time **2026-10-27 04:57:47.384 UTC** and delivered time **04:57:48.125 UTC**; authenticated status returned `provider_delivered` with that delivery time. Existing newsletter opt-out and prior edition acceptance stayed unchanged. This proves real transport/provider/inbox behavior separately from the mocked outbox-worker journey; no real production participation or account grant was created. |

The [unit tests](../services/charity-os/test/participation-delivery.test.mjs), [actual database checks](../services/charity-os/test-db/participation-delivery.test.mjs) and [frontend tests](../services/charity-os/public/participation.test.js) are executable sources. They use injected transport and do not establish real recipient consent or human review. Record later release evidence without rewriting those limits. Corrections and challenges can be submitted through the [public repository issue form](https://github.com/theguysaccount/charitology/issues/new).
