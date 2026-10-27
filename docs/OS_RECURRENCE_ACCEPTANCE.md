# Manual recurring task drafts: acceptance

October 27, 2026 · AI-assisted engineering · local implementation and controlled browser checks complete; release checks pending. The [plan](OS_RECURRENCE_PLAN.md) and [interfaces](OS_RECURRENCE_INTERFACES.md) were accepted and committed before implementation. This is software acceptance with fictional records, not independent human review or an organizational pilot.

## Working flow

An authorized member opens a saved Projects task, previews its next weekly, monthly or quarterly occurrence, then explicitly generates one planned, unapproved task. The preview names the acting owner, exact copied fields, civil time, named zone, written offset, UTC instant and original anchor. Source approval, external connection identity, comments, files and reminders are not inherited. Unknown values remain unknown and zero remains zero.

Monthly and quarterly schedules clamp against the original day, so January 31 → February 28 → March 31. Weekly schedules use local calendar days. Repeated local times require a fresh explicit instant choice; missing local times refuse generation. The existing 1900–2200 instant grammar, millisecond precision and ±14:00 offsets remain. Unsupported historical sub-minute offsets are refused.

Generation is manual. There is no new scheduler, catch-up loop, automatic approval, participation allocation, email, provider call or money action. The smaller browser-local OS is separate.

## Consistency and access

Ten-minute signed previews bind the current actor/session and exact membership incarnation, revision, role and program scope, source and reference revisions/hashes, series tip and exact candidate. Current access is rechecked during commands. Full series views and End also require current access to their source, tip and program; inaccessible history is unavailable rather than disclosing its identifiers or anchor. A narrow accepted-command result may return only the currently readable source/result disposition.

An organization transaction commits the ordinary child record, immutable occurrence, series tip and audit together. Stable identities and uniqueness constraints allow only one successor per source across retries, changed command keys, later edits and trash. A lost response retains the exact command for Retry; a new command is not silently substituted. A stale route, organization change or sign-out cannot repaint another detail view with a late result.

While a series is active, task kind, program and schedule are fixed through central record writers. Explicit End, cancellation or deletion stops future generation without cancelling existing children. End requires a reason and separate confirmation. Restore never resumes a series. Original history remains private, and the normal record workflow still governs editing and approval.

## Limits and recovery

Commands use the dedicated streaming, fatal-UTF-8, duplicate-aware 8,192-byte JSON reader before the generic request reader. Preview tokens are at most 4,096 bytes, with decoded payloads at most 2,048 bytes. Per-account limits are 120 reads and 60 commands per hour. Limits include 250 series, 2,000 occurrences, sequence 2,000, 102 captured references and 8,192 measured bytes per immutable packet. Recurrence history and prepaid End reservations count toward the 4 MiB recurrence-table and existing 60 MiB logical export budgets. Existing 2,000-record, 16 MiB structured-data and 64,000-byte record limits still apply.

Every series prepays 2,048 measured bytes for End; its retained last-command packet is at most 512 bytes. End can commit at full ordinary storage. Its response states whether the audit event was recorded; exhausted audit storage is not presented as a recorded event, and unrelated database errors still roll back.

Organization backup adds optional version-1 recurrence history. Older backups remain readable. Import preserves the existing empty-destination semantics and ordinary record/approval resets. Source trash remains in the private import archive. Restored series are inactive `recovered` history, retaining former state and stable historical IDs without restoring command authority, sessions, approvals or live trash rows. Reexport can preserve historical-only identifiers; those identifiers grant no access.

## Executed checks

The held implementation passed **309 complete OS unit/browser-model tests**, **90 actual isolated PostgreSQL tests with zero skips**, including **19 recurrence PostgreSQL groups**. All eight suite-owned schema prefixes were inspected absent after completion. Focused independent review passed 36 model, six backend and 23 actual UI-controller/API groups and reported no remaining finding within the reviewed contract. These are engineering checks, not a comprehensive security audit.

Actual Chrome used two real Better Auth browser sessions and disposable constrained PostgreSQL schemas. Thirteen recorded journeys cover original-anchor monthly generation through March, no inherited approval, explicit later New York fold selection, missing-time refusal, quarterly clamping, current scoped access, generic refusal outside the assigned program, existing-result reuse, separately confirmed End and actual authenticated export → preview → commit into inactive recovery. Fixture assistance is explicit: fictional login delivery capture, direct scoped-membership seeding and a labeled backup-orchestration button. No native file Save is claimed. The original workflow fixture ended with two series, three occurrences, zero jobs and zero provider calls.

Four additional actual 320/390 light/dark cases show the recurrence preview fitting the viewport. Width is controlled by a private same-origin iframe fixture; only that fixture's document frame policy permits embedding, while frozen product assets and authenticated APIs remain unchanged. The product's own theme control supplies both palettes. Bounded browser logs contained no application warnings after excluding extension messages. Both fictional browser accounts signed out, and owned tabs closed. All private fixture schemas were removed and absence verified; the earlier orphaned setup schema was also explicitly removed.

The model's near-quota projection admits a valid 16,707,576-byte structured workspace whose former whole-context copy occupied 34,687,239 bytes. It projects only necessary fields rather than copying irrelevant snapshots. This is bounded engineering feasibility, not a low-memory-device guarantee.

## Release record

- Final runtime: `ffdbf7af612985492dd415bd7b0af4ffdaf7b398`; [PR #26](https://github.com/theguysaccount/charitology/pull/26). Final release-head CI pending. The initial new-branch push correctly refused an all-zero prior branch base; the next nonzero push supplies an actual committed comparison base without weakening the observation-history gate.
- Complete static build/check: passed, 546 pages and 46,600 internal links/assets with none broken; social assets and strict checks pass. Exact-head required CI: pending.
- Additive production migration: passed. All 60 existing rows, old columns and ACLs stayed unchanged in one repeatable-read transaction. Both new tables are empty; 24 tenant tables enable and force RLS. Constrained runtime flags, narrow privileges and the immutable trigger passed; context-free counts and nonexistent-tenant backup usage are zero.
- Protected production stage, canonical promotion and exact public assets: pending.

Do not label this slice published until these identities and checks are recorded. Existing email/provider state and actual participants are outside this release.

## Rollback and operating work

Preserve current backups, immutable occurrences, both additive tables and unique indexes. Older application versions do not enforce recurrence schedule guards or include its history in recovery/quota calculations. Assess those omissions before assigning an old deployment the public alias; prefer a reviewed fix without deleting history. No real team pilot, independently approved task, completed charitable outcome or reduction in administrative work is established by the fictional checks.
