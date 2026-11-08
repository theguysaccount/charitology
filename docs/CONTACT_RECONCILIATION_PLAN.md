# Review two contact records

This is the first bounded OS-CRM-01 implementation contract. Its finite software is published through [PR #55](https://github.com/theguysaccount/charitology/pull/55)/main `ef91597bbec21ce66dc3510a0a62a668cd08b864`, with the complete tested `b35af42160488e0c126f6d07e7c0362080f34583` tree `b4ac3cfae7294f5fa98bfa011b4e2369ae933f41`. All eight CI jobs and both sixteen-case actual PG17.11 profiles pass; protected stage and unsigned canonical OS checks each pass ten selected responses with independent offline rehash. No new table, grant, production migration or stage promotion is added. [Acceptance](CONTACT_RECONCILIATION_ACCEPTANCE.md#finite-os-production-release) separates this release from the earlier local PG18/unit/browser checkpoints. All five main-`ef91597` Pages jobs pass. The one 56,171-byte unsigned public guide response matches the exact retained local build and its new links/limits, with independent offline readback; no Pages-artifact or complete-site comparison is claimed. Real authentication/hosted business, human use and complete CRM reconciliation remain separate. Earlier local candidate `3bffd8d` kept the `8eb6b2e` runtime/public/package bytes unchanged while adding CI17 guards; it is a historical checkpoint, not the published identity.

The first actual local PG18 profile on predecessor `829ecde` failed its first catalog-column assertion and did not exercise the other fifteen cases. The three-cast catalog text-array correction in `8eb6b2e` retains the same closed inventory and passing local unit/mounted checks. The fresh owned PG18.6 replacement now passes all sixteen cases with cleanup. The first failure remains retained; older unchanged-file browser evidence still proves only its fictional-callback interface scope.

## One deliberate decision

Only a current organization owner or administrator with unrestricted program scope and Contacts read/write permission can use this workflow. Choose two current person-reference records explicitly. Compare every field, the record IDs, source ownership and relevant dependencies. A shared name or email never establishes identity, account ownership, consent or authority.

Choose one operation:

- **Keep both records:** retain an explicit assertion, basis and reason without changing either record. Assertions can distinguish people, a shared household, separate role records or an unresolved comparison. This does not create a household membership or grant one person authority over another.
- **Merge eligible local drafts:** both records must be unapproved local drafts without external source ownership. Choose the surviving ID. Choose the title from the left or right record; choose each display label and email from left, right or Unknown. No field choice is preselected. Organization, role/relationship, contact preference, purpose and review date must agree and stay unchanged. Protected or private linkage can block the merge.

A merge changes the survivor's three selected fields and moves the other record to trash, with new revisions on both. It does not rewrite references to the retired ID, create an alias, transfer preferences or consent, link participant requests or grant an account/team role. Normal, fully parsed Contacts CRUD audit rows stay associated with their original IDs and values. Comments, files, immutable or private references and unclassified history remain blockers for this first merge.

The outgoing preview shows the exact choices and retained history. A separate unchecked acknowledgement is required before Commit. The final processing time and report checksum are recorded at commit, not invented by the preview. The server freshly verifies current membership, record versions, exact SQL timestamps, sources and dependencies in the tenant transaction.

## Exact Retry and a limited inverse

An interrupted or malformed result retains one exact preview ID and command key in the open page. Only an explicit Retry resends that same body. A later rate limit or refusal does not authorize a replacement key. If the first attempt is definitively refused as stale or expired, a deliberate fresh-review path is available. No command is sent in the background. Leaving, closing or signing out can discard the page's local Retry; the interface warns about pending work.

A saved merge can have its own undo preview only when the original accepted command is still verifiable in the same restore epoch. Both resulting records and the complete current dependency inventory must still match. The controller can exclude only the exact original merge report after that proof; there is no client ignore-list. Other reports or new references still block it. The inverse restores recorded field values and trash disposition with new revisions, preserving the original history. It is not automatic and cannot override later edits.

## Private history and recovery

Immutable reports use the existing seven-column `os_reports` table, with a reserved versioned payload and checksum. Titles identify the operation and checksum prefix rather than a person's name or email. History list/detail use the same fresh unrestricted owner/admin access, stable pagination and no hidden global counts. History is not live command authority.

Native backups retain the original report IDs, origin, historical six-digit timestamps, values and checksum. Destination bookkeeping is remapped by the ordinary restore path; accepted commands, sessions, account links and eligibility to undo are not restored. Existing reserved destination history or any report-ID collision refuses replacement. Source archives remain separate from live restored trash. Absent CRM history adds no new counter or packet fields.

Existing whole-workspace SQL/native/inactive-restore limits and other feature reserves still apply. The nominal one-report size bound is not proof of a physically attained maximum. No table, grant or production migration is added. Generic migration is not part of releasing this slice.

## First-version limits

The context reader supports fully validated FIELD and contact-reconciliation report families. Generic legacy snapshots, Learning reports and grant reports currently refuse; so do unsupported preview, job or sidecar families. Some existing workspaces therefore cannot use this first version. Do not delete history or move records to bypass a refusal. Extending complete, source-specific reference coverage is separate work.

Source-owned connector records, general reference migration, durable alias resolution, household/role merging and broader connector reconciliation remain open OS-CRM-01 work. The finite local SQL/atomicity and two-hop restore profiles now have source-specific evidence. The finite PG17/CI, canonical OS and one-guide public publication checks are now recorded; real authentication/hosted business, broader capacity limits and human operating use still need their own evidence. The twenty-two software IDs, eight conditional decisions and original 66-item brief remain intact.

## Implementation touchpoints

The [model](../services/charity-os/lib/contact-reconciliation-model.mjs), [context](../services/charity-os/lib/contact-reconciliation-context.mjs), [commands](../services/charity-os/lib/contact-reconciliation-commands.mjs), [reports](../services/charity-os/lib/contact-reconciliation-report.mjs), [store](../services/charity-os/lib/contact-reconciliation-store.mjs) and [recovery](../services/charity-os/lib/contact-reconciliation-recovery.mjs) keep planning, current authority, accepted receipts and historical data separate. [Routes](../services/charity-os/lib/contact-reconciliation-routes.mjs) use the normal handler, rate limits and CSRF boundary. The [client](../services/charity-os/public/contact-reconciliation.js) owns explicit review and local exact Retry.
