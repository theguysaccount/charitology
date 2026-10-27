# Shared Charity OS release evidence

Evidence checkpoint: **26 October 2026** (local date). The public operational intake follow-up is promoted at https://os.charitology.org. Its evidence is recorded first; the earlier foundation, recovery and controlled login/reminder evidence follows separately.

## Public operational intake follow-up

Runtime commit **`98ebea527b6a5b382d5e143acf207205eccd172b`** was staged, tested and promoted as **`dpl_1yFKcLN8m2x8QkXs4Sf1sZbeBdYd`**. A post-promotion lookup of `os.charitology.org` resolved to that exact deployment and commit. [PR #9](https://github.com/theguysaccount/charitology/pull/9) contains the implementation and its documentation. The later `9713128` change only extends the optional disposable test fixture; it does not change the deployed application.

| Check | Recorded result and limit |
| --- | --- |
| Exact runtime CI | [Run 40437664958](https://github.com/theguysaccount/charitology/actions/runs/40437664958) passed **106 unit/browser-model tests**, **21 actual OS Postgres tests**, newsletter safety/isolated-database checks and the **447-page** public build/check. [Fixture follow-up CI](https://github.com/theguysaccount/charitology/actions/runs/40438583603) also passed. |
| Intake database boundaries | Actual separate-role Postgres tests cover one-time receipts/concurrent deduplication, tenant/admin isolation, revisions, draft conversion/capacity, source/target withdrawal, daily/row/byte limits, erasure and inactive recovery. Cancellation, withdrawal and erasure still commit after the audit reserve fills. No mail transport is used. |
| Production migration and role | The additive migration completed. Both `os_publications` and `os_intake` enable and force tenant RLS. The constrained runtime has neither superuser nor RLS-bypass privilege; context-free reads returned zero rows from both new tables. The earlier twelve tenant tables retain their separate foundation evidence below. |
| Protected staged requests | **13 checks passed:** health 200; nonexistent publication 404; query receipt 400; unsigned private queue 401; foreign-origin submission 403; three HTML shells and five assets 200. The deployed `app.js`, `intake.js`, `api.js`, stylesheet and compass bytes matched local SHA-256 hashes. |
| Live production requests | **12 checks passed** after promotion: the same API boundaries, receipt shell and five exact asset comparisons, plus HTTP-to-HTTPS 308. This checks the real public origin, not only a preview URL. No production form was published or participant record created. |
| Public browser journey | Actual Chrome and an isolated constrained Postgres schema: fictional form submission, explicit purpose consent, accepted receipt, status, in-page withdrawal confirmation and displayed **Cancelled**. Editing/closing a synthetic source made its public form unavailable while its existing receipt status remained readable. Accepted answers were removed from the page. Skip navigation preserved the receipt fragment and directly focused the main landmark. |
| Staff browser journey | A separate temporary fixture used an explicit synthetic session stub, actual tenant membership, the real handler and CSRF checks. A public request appeared in the private queue; review advanced revision 1→2; conversion prepared an unapproved contact draft and revision 3. Erasure advanced to revision 4; reopening showed the erasure notice and no answer fields. The linked contact still opened as **Draft, revision 1, Permission needed**, with its creation history. This is not a real sign-in, human review, participant or booking claim. |
| Recovery | Unit and actual Postgres checks preserve private answers/erasure tombstones while omitting receipt, idempotency, payload and IP hashes. Restored publications are withdrawn, capabilities disabled and earlier reviews confer no authority. A new intake-specific hosted/browser backup round trip was not executed; earlier local-to-shared browser recovery remains a separate result. |
| Cleanup and logs | All disposable intake fixtures exited successfully; a catalog check found zero remaining temporary intake schemas. The final deployment's error/fatal log scan for the inspected hour returned no entries. This is a bounded log observation, not an uptime guarantee. |

Staging exposed a hosting-specific issue before promotion: Vercel forwards unused rewrite captures as query parameters. The intake route now removes only one exact `path` capture matching its pathname and refuses every remaining, wrong or duplicate query field. [Vercel's rewrite documentation](https://vercel.com/docs/routing/rewrites) describes that forwarding behavior. Unit and staged/live requests verify the correction without accepting receipt tokens in queries.

Two initial GETs in a fresh local Neon fixture returned sanitized internal errors before the browser's retry recovered. The original error message was not retained, so their cause remains unconfirmed; a connection/transport explanation is an inference. The later fixture, staged and public-origin checks passed. Native browser confirmation was replaced by an in-page deliberate confirmation; no browser-modal acceptance is claimed.

The optional fixtures serve only synthetic data, use separate temporary schemas, disable mail and are excluded from deployment. They do not establish real participant adoption or independent human approval. Newsletter consent, suppression and the previously accepted issue were untouched. No AI provider or additional paid plan was introduced.

The compatible pre-intake application was **`f2722ae` / `dpl_As6sDYZweoP8spRHdeo95QQb5ZLu`**. The migration is additive: preserve all tables and data on rollback. That older application cannot operate or export the new intake queue, so retain a current-version backup and its separate source archives before using it. Do not use a destructive down-migration.

Authenticated participant portals, confirmed booking/waitlists, participant/staff notifications, real connector contracts, consented pilots and independent privacy/security/accessibility review remain separate work. The original 66-item register retains its partial, adapted and people-dependent labels; this release does not turn software workflows into operating institutions.

## Scope

The original mega list contains **66 items: 26 programs, 19 tools and 21 information bases**. [MEGA_LIST_ACCEPTANCE.md](MEGA_LIST_ACCEPTANCE.md) records each item's bounded implementation and remaining partial, adapted or people-dependent scope. This release adds a shared, authenticated Charity OS with 26 typed operational modules; it does not establish that every original institutional or research ambition is complete.

The public AI Charitologist remains source retrieval. A model-backed recommendation assistant is deferred. No new model provider or model billing was introduced. Charitology's systemic frame, honest evidence labels and prohibition on ratings of named charities remain in force.

Accounting/payroll execution, money movement, tax receipts and sensitive beneficiary case histories remain outside this service. See the [service README](../services/charity-os/README.md) and [module rules](../services/charity-os/docs/MODULES.md) for the implemented boundaries.

## Completed verification

| Check | Recorded result and limit |
| --- | --- |
| Local OS server/domain/browser-model checks | **89 passed**, including actual server and browser-model regressions. |
| Local newsletter/transactional relay checks | **61 passed**, including the long-label relay boundary. Actual inbox tests are recorded separately. |
| Hosted CI for `2974e76` | [All checks passed](https://github.com/theguysaccount/charitology/actions/runs/40401822391): **12 actual OS database tests**, **61 newsletter checks plus its actual isolated database suite**, and the **447-page** static build.  |
| Actual Postgres workflow fixture | Passed using separate migration-owner and constrained application roles, temporary schemas and actual Better Auth sessions. Covered scanner-safe confirmation/replay, CSRF, tenant isolation, revisions, approvals, scoped snapshots, invitations/revocation, files, recovery and job idempotence. Mail transport was a test double. |
| Upload boundary | Actual database suite accepted a **64 MiB** recovery input and rejected the next byte. This does not establish hosted upload behavior. |
| Source archive boundary | Actual Postgres archive suite passed: JSON text sizing, rollback preservation and two concurrent commits competing for the final archive slot. Exactly one committed; the other returned 422. Existing committed source payloads remained preserved. |
| Source/regression review | [BACKEND_REVIEW.md](../services/charity-os/docs/BACKEND_REVIEW.md) records reviewed access, approval, recovery and provider boundaries. It is an implementation review, without a certification claim. |

The [runtime fixture](../services/charity-os/test-db/runtime.test.mjs) and [archive fixture](../services/charity-os/test-db/archive-quota.test.mjs) use synthetic identities, isolate their tables in temporary schemas and clean those schemas up. They do not send real email.

The [reusable/manual OS workflow](../.github/workflows/charity-os-check.yml) installs locked dependencies, checks browser syntax, runs server and browser-model tests, and executes the database fixtures against **Postgres 17**. Its disposable application role has no superuser, database/role creation, inheritance or RLS-bypass privilege. It uses no production/provider secrets. The linked release run retains the logs.

## Production configuration inspected read-only

The constrained production database connection was inspected without changing production rows, sending mail or exposing credentials:

- Migration owner and runtime identities are distinct. Runtime superuser, RLS bypass, database creation, role creation and inheritance flags were all false.
- The runtime role owns no tables, cannot create in the public schema and has no table-truncation grants.
- All **12 tenant tables**, including `os_uploads`, have enabled and forced row-level security with tenant policies. Auth and opaque system coordination tables have their separate intended scope.
- Audit events and frozen reports allow runtime select/insert, with update/delete revoked and immutable triggers enabled. Default table/sequence grants were inspected.
- `os_job_tenants.last_run_at` exists as a non-null timestamp with time zone and a default.
- A tenant record query without tenant context returned zero rows. The final `logicalBackupBytes` SQL executed successfully under a nonexistent synthetic tenant context and returned zero.

This audit establishes the inspected database constraints. It does not verify the active deployment's origin, cookies, environment or request path; those require the production checks below. No database URLs, tokens or user email addresses are included in this record.

## Infrastructure and operating limits

- The OS uses a **new, separate free Neon database** and a separate hosting project. Newsletter storage remains separate. No additional paid hosting/database plan was provisioned for this release.
- OS transactional mail uses the existing paid Charitology mail account through the purpose-scoped relay. It creates no newsletter subscriber, Contact, Topic, Segment or Broadcast.
- The manually configured `os` CNAME was checked against the hosting provider's recommendation, and the provider verified the host. HTTPS serves the client and API; HTTP redirects to the same HTTPS hostname with 308.
- Normal current-workspace exports have a **60 MiB** budget plus a separate **1 MiB** emergency access-audit reserve. Revocation and other safe access changes still complete if that reserve is exhausted; a redacted operational warning replaces an additional durable audit event in that case.
- Recovery input is capped at **64 MiB**. Pending previews have a separate **4-count / 128 MiB** cap; committed backup archives and integration journals share **32-count / 128 MiB**, measured as actual Postgres JSON text. Committed archives remain preserved after preview expiry and are downloaded separately from current-workspace backups.
- Other limits include 2,000 active records, 16 MiB structured records, 30 connections and 25 MiB / 1,000 files. The README specifies per-record/file limits and recovery behavior.
- The W1 adapter previews the earlier local browser format and preserves the complete source privately. Imported records become drafts; source owners, approvals, evidence claims and credentials do not become trusted live permissions or decisions. Trash and deleted-file bytes remain source provenance during recovery.
- Hosted reminders are dispatched daily at **07:00 UTC**, after their due instant, with access rechecked and bounded work per invocation. Native provider acceptance is distinct from inbox delivery.

The initial OS promotion omitted static client files because the root `.vercelignore` used an unanchored `public/` pattern. Commit **`52c7532`** anchored root-only exclusions (`/public/`, `/src/`, `/dist/`); the corrected client and its JavaScript/CSS/font assets now load in the actual browser. The mail deployment was promoted as **`dpl_E1hFsWb1Y7yain1hTxenCMLv32t7`**. The coordinator also inspected packaged files for excluded local secrets and artifacts; this is separate from request-path acceptance.

## Release acceptance and explicit limits

Each result identifies its transport and identities. Synthetic database checks and one owned inbox do not establish general deliverability or independent assurance.

| Evidence | Status / reference |
| --- | --- |
| Candidate commit and production deployment ID | `2974e768eb18d4acab62c7b3931defb03609319d`, `dpl_7bKHf7c674tk3x8V9pyLRszWhDs1`. |
| Hosted CI | [Release run](https://github.com/theguysaccount/charitology/actions/runs/40401822391) passed static, OS and newsletter checks. |
| Compatible fallback | Prior `e977b39` deployment `dpl_5v9U5crL3JCPbqNPp6wrm8kH1Js6`; the schema is unchanged. Preserve data during rollback. |
| Public service and transport | https://os.charitology.org serves the client/API over HTTPS. HTTP redirects 308. Health reports configured authentication and mail; signed-out session returns no user. |
| Deployed auth origin | Controlled sign-in mail used the exact canonical OS origin; deliberate browser confirmation created a usable session, and actual browser logout returned to sign-in. Wrong-origin mutations returned 403. |
| Browser organization setup | Sign-in, all 26 module links, organization creation, switching and the empty owner organization passed. False unsaved-form navigation after successful creation was fixed and retested. |
| Public-site links | Public OS links and IRS/donor changes are built and checked. Main-branch Pages publication is tracked by this release’s [Deploy workflow](https://github.com/theguysaccount/charitology/actions/workflows/deploy.yml). |
| Mobile/keyboard acceptance | Responsive CSS and semantic forms are present. A separate mobile viewport and comprehensive keyboard/accessibility audit were not completed in this release. |
| Multiple-identity access | Actual isolated Postgres/Better Auth CI covered invitation identity/replay/revocation, scope and independent approval. No second real person was invited during live acceptance. |
| Hosted HTTP recovery | A fictional local backup previewed with 6 target records, 0 issues and 13 warnings, then committed into a labeled empty sandbox. Export contained 6 initial-state, unapproved records. USD 10.29 became `{minor:1029,currency:"USD",precision:2}` and explicit zero remained zero. Original source deep comparison and archive checksum passed. |
| Browser recovery | Passed in a second labeled sandbox: file selection, 6-record/13-warning preview, explicit confirmation, completed import and original archive listing. A task edit saved revision 2 with linked program/project labels and visible history. The archive download control was invoked, but browser automation did not return a downloaded path; source bytes/checksum were verified through the authenticated hosted HTTP API. |
| Frozen report | Hosted API froze a fictional report with 5 selected source revisions and a checksum. It is a private input snapshot, not verified impact. |
| Controlled mail | Two deliberately requested login emails and one due personal reminder reached the owned Gmail inbox. Both inspected purposes had HTML/plain text, `hello@charitology.org` reply-to and passing DKIM. The authenticated dispatcher processed the one due reminder; public signup/suppression state was not modified. Invitation transport remains synthetic-test evidence. |
| Production database audit | The final schema’s role, RLS, append-only protections, grants and scheduler column passed the read-only audit above; no later schema migration was required. |

## Rollback and recovery

1. Before promotion, record the prior deployment and confirm schema compatibility. For a first OS release without a known working predecessor, keep the OS unavailable and remove/revert its public entry point if acceptance fails.
2. Roll back application promotion to the recorded compatible deployment when necessary. A code rollback does not undo database writes. Preserve database tables, source archives, auth state and durable mail intents; do not use a destructive down-migration or reset production workspaces.
3. Keep the public Astro site and existing newsletter service independent while isolating an OS failure. Withhold OS promotion when CI, TLS, access or delivery checks are unresolved.
4. Before data changes, download both the current workspace and its separately stored original import archives. Recovery requires an empty destination, including trash and connections; restored work starts without trusted approvals or connector credentials.
5. Inspect durable mail status and provider evidence before recovery. Preserve ambiguous attempts and their idempotency identities; do not blindly resend with a new identity.

Implementation and review used AI assistance. Local tests, database constraints and code review support the recorded claims; they do not substitute for the unexercised mobile, real provider/pilot and specialist assurance gates.
