# Explicit recurring task drafts

Pre-implementation proposal · October 27, 2026 · AI-assisted · root engineering review pending. No runtime, database migration or deployment is supplied by this document. Read the [proposed interfaces](OS_RECURRENCE_INTERFACES.md) and [writing standard](../STYLE.md). The root implementation agent must accept and freeze both documents before runtime work starts. Engineering review does not establish an organizational pilot or independent human review.

## Result and boundary

A member deliberately previews and generates one next task draft from a saved recurring task. A second request for the same next occurrence finds the existing result, including when the first response was interrupted. Every generated task starts in `planned` with no approval or approved snapshot. The preview states exactly which fields will be copied and who will own the draft.

The existing `projects` module remains the task editor and workflow. This slice covers `data.kind:'task'` with `weekly`, `monthly` or `quarterly` recurrence, a valid due instant and an explicit named zone. It does not generate projects or milestones. The smaller local OS and partial volunteer assignments are outside scope. There is no schedule dispatcher, catch-up loop, automatic approval, reminder, notification, provider call, participation allocation or money action.

The original brief asks for tools that improve coordination. This is one bounded software workflow; it does not create an institution or verify that a charitable intervention works.

## Actual implementation inspected

The audit read `HANDOFF.md`, `STYLE.md`, the shared-service guide, module definitions and validators, access/session checks, organization transactions, record/revision/approval/delete/restore routes, backups and integrations, audits and quotas, participation command identities, jobs, and the plain JavaScript client. Shared-service source was unchanged by the R1 merge inspected at `25e5c4fd2d2c2c01a10bf8baf56cb91a3512832c`.

| Existing behavior | Consequence for this proposal |
| --- | --- |
| Projects has `kind`, `programId`, `projectId`, `dependencyIds`, `deliverable`, `dueAt`, `timeZone`, `effortMinutes`, `priority` and `recurrence` | Keep the exact typed data shape; recurrence provenance belongs in separate service-owned tables |
| `projects` workflow is planned → ready → active → review → done, with cancellation paths | Create only `planned`; completion still needs the existing independent approval and completed dependencies |
| Nullable fields distinguish unknown from zero | Copy `null`, zero and empty dependency arrays exactly after normal validation |
| `validateRecord` accepts 1900–2200 instants with seconds, up to three fractional digits, explicit offsets at most ±14:00, and a matching named zone | Calendar output must fit that same grammar; do not round or invent an offset |
| `database.tx(...,{lock:true})` serializes ordinary mutations with the organization advisory lock | Use this transaction for every generation and end command, plus central guards for other writers |
| `saveRecord` invokes participation guards and enforces 2,000 active records and 16 MiB structured data | Recurrence cannot bypass those guards or quotas |
| `source` is the strict external connection identity `{integrationId,externalId,checksum}` | A generated task has `source:null`; do not impersonate a remote row or overload that identity |
| Generic PATCH replaces normalized data, increments revision and clears approval; trash restore clears approval and starts at review | Source changes invalidate previews; restored recurrence remains blocked |
| Backup imports only `backup.records`, resetting owners, statuses, revisions and approvals; `backup.trash` stays in the committed source archive | Recurrence recovery retains inactive historical IDs without creating live trash rows or requiring those archived IDs to have live-record foreign keys |
| Membership deletion removes the row; reinvitation inserts a new row with revision 1 | Bind exact persisted membership creation time as well as revision, role and scopes; revision alone cannot identify the membership incarnation |
| `jobs.mjs` accepts only invitation and reminder work | Do not add a recurrence job kind or modify maintenance delivery |

The actual permission registry permits Projects writes for owner, admin and staff roles. Board readers and external reviewers cannot generate. Generation requires current read/write permission and scope, not approval permission. An unapproved source may prepare another unapproved draft; its source approval state is shown honestly and is never inherited.

## Deliberate user journey

1. On a saved task detail, choose **Preview next draft**. Unsaved editor values are not a source. A nonrecurring, missing-date, cancelled, trashed, ended or recovered task explains why generation is unavailable.
2. Read the original anchor, recurrence, named zone, local target, exact offset/UTC instant, sequence and copied fields. The owner will be the current acting member. Dependencies and parent links retain their current IDs; they are not automatically advanced to recurring counterparts. A source may be unapproved, and the preview says so.
3. If a clock repeats during a daylight-saving transition, choose one of the two displayed exact instants. Neither choice is preselected. A local time that does not exist is refused with an explanation. The first slice does not move that time or skip the occurrence.
4. Choose **Generate one unapproved draft**. The command creates at most one draft and one immutable occurrence row in the organization transaction. The result opens the saved task and shows its predecessor and sequence. It does not advance workflow or send anything.
5. If the result is interrupted, reload the source's recurrence panel or retry the same retained command. **Open existing draft** is different from generating another task. Existing generated work remains identifiable after edits, cancellation or trash; the service never creates a replacement silently.
6. To stop future drafts, choose **End recurrence** with a reason. This permanently ends that series. Existing tasks keep their own workflow; nothing is deleted or cancelled automatically. Starting again requires a deliberately created ordinary task with a new ID and a fresh first preview. There is no resume or automatic restart in this slice.

The panel is shown only to current Projects writers. General approved-snapshot readers keep their existing record view and receive no new recurrence ledger, actor identities or unsigned preview token. Private commands stay in same-origin JSON bodies. With JavaScript unavailable there is no named static private form that could submit into a GET URL.

## Frozen calendar policy

Each series uses `task-recurrence-v1`. Its immutable anchor is the root task's original due local date/time, original written offset, exact UTC instant, named zone and frequency at first generation. Retain the original zone spelling and record the native canonical zone label separately. The organization default zone never supplies a missing task zone. Keep original milliseconds; normalization may render three fractional digits without changing the instant.

Sequence zero is the root. Sequence `n` is calculated directly from that original anchor, never by adding to a previously clamped occurrence:

- Weekly: add `7 × n` calendar days to the local date and keep the original local clock. An elapsed week may be 167 or 169 hours when clocks change.
- Monthly: add `n` calendar months and use the original day, clamped to the target month's last day. January 31 → February 28 → March 31 is intentional.
- Quarterly: add `3 × n` calendar months with the same original-day clamp. January 31 → April 30 → July 31 is intentional.
- Resolve the resulting local wall time in the frozen zone. One representable matching instant is unambiguous. Two require an explicit earlier/later choice. No match is a gap and refuses generation. More than two matches, unknown zones, results outside 1900–2200, or offsets the current OS grammar cannot represent refuse without a write.

Do not silently roll a gap forward. The panel offers an explanation and the existing End/new-task path. An occurrence within a repeated hour needs its own explicit choice each time; a past choice does not establish a universal preference. A stopped gap is an honest limitation of this first manual workflow, not a claim that every recurrence rule is supported.

The server recomputes candidates for commit. A runtime time-zone-data update that changes the preview candidates invalidates the preview and requires another review. Earlier generated instants remain unchanged. The policy freezes the method and selected occurrence, not every future government time-zone decision.

No new dependency is required for the proposed resolver. Native `Intl.DateTimeFormat(...).formatToParts` can test every integer-second offset within the existing ±14-hour range: at most 100,801 candidates for one target. This also detects and refuses historical sub-minute offsets that the OS's `±HH:MM` input cannot express. Pure civil arithmetic uses UTC components only as a calendar calculator; the runtime's local process zone never selects the schedule. Production must preserve this bounded behavior or replace it only after an equivalent reviewed proof.

## Series and occurrence identity

Propose two new forced-RLS tenant tables, `os_task_recurrence_series` and `os_task_recurrence_occurrences`. They do not use jobs, external integration identities or public participation tables.

- A series has one root task, one immutable anchor policy, one current tip, a positive revision and `active`, `ended` or `recovered` state, plus nullable `recoveredState` for reexport. `(org_id,root_record_id)` is unique. An active series requires actual same-org Projects records. Root/tip/member IDs in ended or recovered provenance may refer to archived source trash that was not restored; there is no mandatory foreign key from historical record IDs to `os_records`.
- A generated occurrence has immutable series/sequence, predecessor ID/revision/data hash and captured schedule/kind/program assertion, selected local/UTC instant and offset, generated record ID and original kind/module assertion, actor/command/request hashes and method/plan hashes. `(org_id,series_id,sequence)`, `(org_id,source_record_id)` and `(org_id,generated_record_id)` are unique. One predecessor can never acquire a second successor after an edit or trash operation. Historical assertions are checked from these immutable fields, not from a currently edited record's kind, program or schedule.
- A task can be a member of only one recurrence chain. Service-only creation binds a generated member to the series. The tip advances exactly once in the same transaction. A request from an earlier member opens its existing successor; only the current tip can generate a new one.
- A stable proposed series ID is a namespaced SHA-256 of method, organization ID and root ID. A proposed generated record ID is a separately namespaced SHA-256 of series ID and sequence. A collision with any existing unrelated record is a conflict, including trash; do not overwrite or generate a different ID.

These identities describe the service's own drafting history. They are not evidence of completion, charity impact, external source identity or approval. Immutable occurrence metadata stores hashes and bounded fields, not a second complete copy of every source record. The generation audit retains the complete initial child record and provenance under the existing private workspace budget.

## Atomic commit and replay

The server supplies a short-lived signed preview token bound to actor/session, current membership fingerprint, org, source ID/revision/data digest, series ID/revision/tip, exact linked-reference revisions, selected resolution, plan hash and expiry. The membership fingerprint includes the exact persisted `os_members.created_at` value at full microsecond precision, plus user, role, sorted scopes and revision, read under the organization lock. A JavaScript Date truncated to milliseconds, or a newly generated timestamp, is not that identity. Deleting and reinviting the same user cannot reuse an old preview just because the new membership starts at revision 1. The token contains IDs/hashes/calendar policy only, not task title, deliverable, private notes or a serialized record. The client cannot submit a draft payload or choose a generated ID.

Under the organization lock, the command verifies the signature and route binding, reloads current membership, source, series and linked records, and checks current permissions/scope before any existing-result response. An exact committed command or an already generated predecessor returns its existing result only when that result is currently readable to the caller. A current live trash row can return its existing bounded trash disposition to an authorized writer. An archived-only historical ID returns no live trash/recovery link and is not regenerated. Current ordinary Projects-module identity and visibility govern an existing-record response; it need not still be a task with its former program or schedule after End. A different payload reusing an accepted actor/command key is a conflict.

For new work, the token must be unexpired and every captured revision, membership fingerprint, source digest, calendar candidate and plan hash must still match. Run normal record validation and reference visibility again against the live workspace. Then save the ordinary task, insert occurrence provenance, advance the series tip and append the generation audit in one transaction. A quota, validation, uniqueness, connection or audit failure rolls the entire transaction back. Database uniqueness is a second defense behind the organization lock, not a replacement for it.

Exactly-once here means at most one persisted generated record for a retained predecessor identity, plus recovery of its stored result. It is not an exactly-once HTTP guarantee. Failed commands do not consume an occurrence or silently advance a sequence. Idempotency does not authorize reading a record after access ends. Never retry by creating a new source task ID automatically.

## Generic edits, cancellation and recovery

Once the first occurrence exists, `kind`, `programId`, `dueAt`, `timeZone` and `recurrence` are frozen for every member of an active series. Other ordinary fields can change through the existing revision workflow; the next preview uses that current tip's values and invalidates any older preview. Historical occurrence bytes remain unchanged. Frozen schedule/scope edits require ending the series first; rejected integration/import writes must show a field conflict rather than bypassing the guard. After End, ordinary kind, program and schedule edits are legal under the existing validator and permissions. Recurrence history must not impose old task-kind/program/date assertions on those current rows, exports or backup admission. Stable ID and Projects-module identity remain; the immutable occurrence packet records what was asserted at generation.

Cancelling or deleting any series member ends future generation atomically. Existing descendants retain their ordinary workflow and approval state. Editing/approving a source alone does not create or approve a child. Trash restore never reactivates the series. The explicit End command remains possible at ordinary capacity because the series prepaid its bounded End-row growth, and only the exact `task-recurrence.ended` audit action joins the existing minimal reserve/fallback allowlist. The audit function must return `true` after a durable event INSERT and `false` when deliberately omitted; do not infer success from today's undefined return. End stores and returns that exact `auditRecorded` result. Database/transaction failures still fail honestly. Normal generic record changes keep their current quota rules.

Freeze an **End growth reservation of 2,048 measured bytes per series**, retained for the series' lifetime. The End row changes only bounded state/revision/time/code and a last-End-command/result packet of at most 512 measured JSON bytes; reason text stays in the audit, never in that row. On series creation and every generation, measure actual Postgres row JSON using the maximum legal representation of its integer `budget_bytes` field, reserve 2,048 additional bytes, and set `budget_bytes` to that conservative total. Before accepting, verify a fully populated maximum End projection fits the reserved total. Both recurrence-table quota and logical workspace usage charge `GREATEST(actual_row_bytes,budget_bytes)`, as the existing delivery budget does for its own rows. Occurrences are charged at actual measured bytes. End never releases or enlarges the reservation; its actual row must remain within the prepaid budget. Version/field changes that break this bound require a reviewed contract change. Required boundary tests include full ordinary/table quota, maximum last-command fields, revision digits, timestamp spelling and exhausted audit reserve.

All ordinary saves, integration commits, cancellation transitions, deletion and trash restore must call the same recurrence guard or dedicated transaction hook. `saveRecord` is the central save hook; deletion currently updates `deleted_at` directly and needs its own hook. Restore must not turn a historical ID into a fresh eligible root. Direct maintenance, database repair and old deployments are not cooperating guard clients; do not claim a new application guard prevents a privileged database owner from bypassing it.

Organization backup adds a versioned `taskRecurrence` member containing bounded series and occurrence provenance, including ended/recovered history and `recoveredState`. Older backups without it remain readable. Validate the source chain against the source backup's `records` and `trash` identity inventory, accepting post-End ordinary changes and checking original task/schedule/program assertions only from the immutable packet. An already recovered series may retain historical-only IDs absent from its current reexport; those packet references stay inactive provenance and do not grant record access.

Restore keeps the existing empty-destination semantics: import only `backup.records`, with existing approval/owner/status resets. Source `trash` and its files remain only in the private committed import archive. Do not insert them as live or trashed records to satisfy recurrence links. Restore bounded recurrence metadata with stable historical IDs and `state:'recovered'`; retain the former state in `recoveredState` and clear command replay authority. There is no mandatory live-record foreign key for those historical IDs, no fabricated trash page and no new restoration path. Current source-archive access remains administrator-only under the existing recovery API. Former command keys, preview tokens, sessions and approvals are not restored as capabilities. Preserve command hashes only as historical provenance; they cannot execute a command or revive account access.

A backup without recurrence metadata does not prove an imported recurring task once belonged to a service series; its ordinary metadata remains a draft. A user may explicitly start a new series only after supplying a valid saved task schedule. The W1 local migration's date-only values do not become zoned instants automatically. Source archives remain independently downloadable, and earlier backups are not erased by this feature.

## Proposed limits and implementation boundary

These are proposed bounds requiring root acceptance before runtime work:

| Bound | Proposed value |
| --- | --- |
| JSON command body | 8,192 UTF-8 bytes |
| Signed token | 4,096 bytes; decoded payload at most 2,048 bytes |
| Preview lifetime | 10 minutes; no retained database preview rows |
| Series per organization, including history | 250 |
| Generated occurrences per organization, including history | 2,000 |
| Highest series sequence | 2,000 |
| One immutable occurrence packet | 8,192 measured JSON bytes |
| Both recurrence tables, including ended/recovered rows | 4 MiB charged Postgres row JSON, including prepaid End reservations |
| End growth reservation per series | 2,048 measured bytes, prepaid and retained |
| Last End command/result stored in a series | 512 measured JSON bytes; fixed hashes/booleans/integers only |
| Current references captured for one task | At most 102 IDs/revisions: 100 dependencies, parent and program |
| New endpoint rates per account | 120 reads/hour; 60 preview/generate/end commands/hour |

Whole-workspace 60 MiB export budget, 64 MiB restore envelope, 16 MiB structured record quota, 64,000-byte normalized record cap and 2,000 active-record cap also apply. Table history and prepaid End reservations count in logical backup usage. The lower whole-byte bound may stop work before a count maximum. There is no pruning, truncation, automatic archive deletion or assumption that a preview reserves quota. Ending generation is available at full ordinary storage as described above.

The handler must recognize recurrence paths before its existing generic 8 MiB body read. Select a dedicated **8,192-byte streaming, fatal-UTF-8 JSON reader** there, rejecting duplicate decoded member names before ordinary `JSON.parse`, including escaped aliases, BOM, excessive nesting and trailing syntax. A later per-route validator after the generic read does not enforce this intake bound. Apply the account rates before candidate resolution and token preparation. Query keys, including duplicates, are separately closed and checked. Other service routes retain their existing reader behavior.

Proposed production files are new `lib/task-recurrence-model.mjs`, `lib/task-recurrence.mjs` and `lib/task-recurrence-backup.mjs`, plus narrow database/schema/handler/backup hooks, `public/api.js` calls and one Projects task-detail panel in `public/app.js`. Add no package. Keep existing jobs/mail/participation behavior unchanged. Audit actual callers before finalizing hook placement; do not refactor unrelated modules as part of this slice.

## Feasibility and required acceptance

A private, fictional executable prototype at `work/os-private/os-recurrence-feasibility/prototype.mjs` passed **12 groups** on Node 24.22.1/ICU 78.3. It covers original-anchor clamp, leap/century/quarterly dates, weekly calendar arithmetic and bounds, New York gap/fold, 167-hour local week, Lord Howe half-hour transitions, Kathmandu, Apia's skipped day, unrepresentable historical offset, twenty modeled concurrent commands, changed-key/permission refusal, modeled rollback/retry, ended state and unapproved output. The exhaustive resolver's slowest tested target took **203 ms** on this machine. The report is private `report.json`.

This prototype is not shared-service runtime, a benchmark guarantee, an actual Postgres transaction, an import/recovery check, a browser test or a deployment. Its modeled serialization is only a feasibility check. Public tests must contain their own excluded fictional fixtures and must not depend on those private files.

| Required acceptance before release | Evidence still required |
| --- | --- |
| Pure method | Exact grammar, source immutability, every month/leap/century/year boundary, fractions, named zones, explicit fold selection, gap refusal, unknown/unsupported zones and offset/date bounds |
| Real database | Two sessions racing same/different keys; one child/occurrence/audit; unique source and sequence; transaction rollback after each stage; forced RLS and cross-tenant refusal |
| Current authority | Revoked/deleted/reinvited membership with reset revision 1, exact creation-microsecond binding, changed scope/reviewer/source/reference/series, missing or unreadable result; no idempotent disclosure after revocation |
| Existing workflows | Generated planned/no approval; dependencies unchanged; independent completion still enforced; no inherited files/comments/reminder/source IDs; all integration/delete/restore paths guarded |
| Capacity/end | Exact byte/count boundaries and +1; no partial child/sequence consumption; quota changes after preview; prepaid maximum End growth at full ordinary/table quota; durable-event boolean and exhausted reserve |
| Backup | Old compatibility, source records plus trash validation, post-End kind/program/schedule edits, broken/duplicate/cyclic claims refused, existing empty-only restore, source trash kept archived, inactive missing historical IDs reexported, no fabricated live links/authority |
| Request intake | Exact 8,192-byte body and +1, chunked input, malformed UTF-8/BOM, escaped duplicate JSON keys, nesting/trailing syntax, route cap before the generic read and rates before resolution |
| Actual UI | Saved versus unsaved source, fold no preselection, gap explanation, interrupted response recovery, stale preview, existing trashed child, keyboard and 320/390 light/dark |
| Release | Existing OS unit/database suites, exact final CI, protected stage, read-only production smoke, pinned deployment/rollback and an acceptance record |

The shared service's actual participant pilot, independent review, narrow-screen gates from earlier releases and other documented operating gates stay open until their own evidence exists. This proposal does not declare the entire mega list complete.

Root accepted this corrected contract for implementation on October 27, 2026, after independent code-grounded review of source-trash recovery, post-End edits, membership incarnation, prepaid End accounting and strict route intake. This freeze authorizes the bounded software work; runtime, database, browser and release acceptance remain required.
