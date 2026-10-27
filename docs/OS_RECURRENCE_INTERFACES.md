# Recurring task draft interfaces

Pre-implementation proposal · October 27, 2026 · AI-assisted · root engineering review pending. Read the [plan](OS_RECURRENCE_PLAN.md). Types below describe proposed boundaries, not implemented exports. Root acceptance and a pre-runtime freeze are required before code. No new dependency, provider, account or scheduled job is proposed.

## Typed calendar boundary

All live JSON inputs must be plain owned data, with closed fields and finite bounded strings/numbers. Production validators must detach before retaining a token/queued operation and return frozen owned values. IDs use the existing `[A-Za-z0-9_-]{1,100}` grammar; hashes are lowercase SHA-256. The existing record `source` shape is reserved for integrations and is never used for recurrence.

```ts
type TaskRecurrenceMethod = 'task-recurrence-v1';
type TaskFrequency = 'weekly' | 'monthly' | 'quarterly';
type RecurrenceHash = string;
type RecurrenceId = string;
type CivilDateTime = string; // YYYY-MM-DDTHH:mm:ss.SSS, real 1900–2200 date
type OffsetInstant = string; // existing validInstant grammar and matching zone
type UtcInstant = string; // exact YYYY-MM-DDTHH:mm:ss.SSSZ

interface TaskAnchor {
  method: TaskRecurrenceMethod;
  rootRecordId: RecurrenceId;
  frequency: TaskFrequency;
  originalDueAt: OffsetInstant;
  anchorCivil: CivilDateTime;
  anchorInstant: UtcInstant;
  originalTimeZone: string;
  canonicalTimeZone: string;
  programId: RecurrenceId | null;
  monthPolicy: 'original-day-clamp';
  weekPolicy: 'local-calendar-days';
  gapPolicy: 'refuse';
  foldPolicy: 'explicit-each-occurrence';
}
interface TaskInstantCandidate {
  choice: 'unique' | 'earlier' | 'later';
  dueAt: OffsetInstant;
  instant: UtcInstant;
  offsetSeconds: number; // divisible by 60; representable within ±14:00
}
type TaskDateResolution =
  | { kind:'unique'; civil:CivilDateTime; candidates:readonly [TaskInstantCandidate] }
  | { kind:'fold'; civil:CivilDateTime; candidates:readonly [TaskInstantCandidate,TaskInstantCandidate] }
  | { kind:'gap'; civil:CivilDateTime; candidates:readonly [] }
  | { kind:'unsupported'; civil:CivilDateTime|null; reason:'date-range'|'zone'|'offset'|'multiplicity'; candidates:readonly [] };

declare function taskAnchor(source: SavedTask): Readonly<TaskAnchor>;
declare function taskCivilAt(anchor: TaskAnchor, sequence: number): CivilDateTime;
declare function resolveTaskCivil(civil: CivilDateTime, timeZone: string): Readonly<TaskDateResolution>;
```

`sequence` is an integer 1–2,000. `SavedTask` is a normalized same-org `projects` record with `data.kind:'task'`; dueAt/timeZone/frequency are known and valid. The model accepts source data as a read-only value, never changes the source and never consults process-local zone or current date to choose an occurrence. Gap and unsupported results have no generated candidate. A fold caller must pass the exact named choice to a separate preparation step; unknown choices or stale candidates refuse.

The exhaustive resolver tests at most 100,801 integer-second offsets through native Intl. Compare numeric year/month/day/hour/minute/second parts and preserve source fractional milliseconds separately. Detect matching sub-minute offsets and refuse them rather than rounding. Invalid zones refuse before a loop. Do not use locale-formatted strings as date parsers, `Date.setMonth` overflow or a fixed-millisecond week in an IANA zone.

## Pure preparation boundary

```ts
interface SavedTask {
  id: RecurrenceId;
  orgId: RecurrenceId;
  moduleId: 'projects';
  revision: number;
  status: 'planned'|'ready'|'active'|'review'|'done'|'cancelled';
  ownerId: RecurrenceId;
  lastEditedBy: RecurrenceId;
  data: {
    title:string; kind:'task'; programId:RecurrenceId|null;
    projectId:RecurrenceId|null; dependencyIds:readonly RecurrenceId[]|null;
    deliverable:string|null; dueAt:OffsetInstant|null; timeZone:string|null;
    effortMinutes:number|null; priority:'normal'|'high'|'low'|null;
    recurrence:'none'|TaskFrequency|null;
  };
  approval:unknown|null; snapshot:unknown|null; source:unknown|null;
}
interface RecurrenceMembership {
  userId:RecurrenceId;
  role:string;
  programIds:readonly RecurrenceId[];
  revision:number;
  createdAtExact:string; // persisted PostgreSQL UTC timestamp, all six fractional digits
}
interface TaskRecurrenceSeries {
  id:RecurrenceId; orgId:RecurrenceId; rootRecordId:RecurrenceId;
  method:TaskRecurrenceMethod; anchor:Readonly<TaskAnchor>;
  state:'active'|'ended'|'recovered'; revision:number;
  tipRecordId:RecurrenceId; tipSequence:number;
  createdBy:RecurrenceId; createdAt:UtcInstant;
  endedAt:UtcInstant|null;
  endCode:'explicit'|'record-cancelled'|'record-deleted'|'backup-recovery'|null;
  recoveredState:'active'|'ended'|'recovered'|null;
  budgetBytes:number; // conservative prepaid row size, including 2,048 End-growth bytes
  lastEndCommand:Readonly<{
    actorHash:RecurrenceHash; intentHash:RecurrenceHash;
    requestHash:RecurrenceHash; resultRevision:number; auditRecorded:boolean;
  }>|null; // at most 512 measured JSON bytes; never reason text or a raw key
}
interface TaskRecurrencePlan {
  method:TaskRecurrenceMethod;
  orgId:RecurrenceId;
  seriesId:RecurrenceId;
  seriesRevision:number|null; // null means no series exists yet
  sequence:number;
  sourceId:RecurrenceId;
  sourceRevision:number;
  sourceDataHash:RecurrenceHash;
  sourceApproval:'current'|'not-current'; // descriptive only
  anchor:Readonly<TaskAnchor>;
  chosen:Readonly<TaskInstantCandidate>;
  generatedRecordId:RecurrenceId;
  referenceRevisions:readonly {id:RecurrenceId;revision:number}[];
  referenceHash:RecurrenceHash;
  membershipHash:RecurrenceHash;
  candidate:{
    moduleId:'projects'; data:SavedTask['data']; status:'planned';
    ownerId:RecurrenceId; lastEditedBy:RecurrenceId; revision:1;
    approval:null; snapshot:null; source:null;
  };
  candidateDataHash:RecurrenceHash;
  planHash:RecurrenceHash;
}
```

Generation copies the source's normalized title, kind, program, parent, dependency IDs/order, deliverable, effort and priority. Replace only dueAt with the resolved target and retain the frozen zone/frequency. The generated owner and last editor are the current acting member. Do not append a title suffix, substitute an empty dependency array for null, add the predecessor as a dependency, inherit owner assignment, or copy source status, approval, snapshot, external source identity, comments, files or reminders.

`sourceDataHash` binds the complete normalized source data, even fields not displayed in a compact summary. Reference revisions are a unique sorted list for every non-null program/parent/dependency. Preparation must run the same module validator and readable-reference/scope checks as ordinary create against actual live records. A browser cannot supply that inventory as authority. Root is sequence zero; `seriesRevision:null` is valid only before its first generation. Every subsequent source must match the active series tip and expected frozen schedule/scope fields.

The canonical plan hash uses existing `security.mjs` stable/hash semantics over an explicitly closed method payload. It excludes the plan's own hash and token issue/expiry timestamps; it includes membership fingerprint, anchor, source/ref versions, chosen candidate, generated ID, complete candidate and series tip/revision. The fingerprint includes user ID, role, sorted program scopes, revision and the exact persisted membership `created_at` at microsecond precision. Read it under the organization lock using a fixed UTC textual projection, such as PostgreSQL `to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`; never round-trip through a JavaScript Date or replace it with the current time. The membership helper currently drops this column, so recurrence must explicitly retrieve this persisted incarnation rather than hash only that helper's existing result. A delete/reinvite with revision 1 must invalidate the earlier preview. Shared references are context, not inherited approvals.

## HTTP and token boundary

All endpoints require the current verified Better Auth member session, same-origin CSRF protection and current Projects read/write scope. They do not accept query data apart from the deployment's existing route adapter. Responses use `Cache-Control:no-store`. Unsupported fields, versions, query keys or repeated query keys refuse. Duplicate decoded JSON member names also refuse through the bounded reader described below. Nonmembers receive no identity or preview data.

Recognize `/api/orgs/:orgId/task-recurrence/...` before the handler's existing common `await body(...,8*1024*1024)` branch. After session/CSRF checks, use a dedicated reader with an **8,192-byte actual stream bound**, regardless of missing/untrusted Content-Length, and cancel further reads on overflow. Decode fatal UTF-8 without BOM; enforce JSON depth at most 8, exact syntax/no trailing content and duplicate decoded member-name detection at every object level, including `"revision"` versus `"\u0072evision"`, before returning an owned parsed value. A post-parse field check is insufficient because `JSON.parse` has already discarded duplicate keys. Token payload decoding uses the same duplicate-aware strict parser under its separate 2,048-byte limit. Other routes keep their existing parser. Apply the 120-read/60-command account rates before expensive calendar resolution or token preparation, with no resolver work on a rate-rejected request.

```ts
declare function readTaskRecurrenceBody(request:Request):Promise<unknown>;
// Recurrence-only: <=8,192 stream bytes; fatal UTF-8, no BOM,
// <=8 JSON levels, duplicate decoded names refused before JSON.parse.
```

| Route under `/api/orgs/:orgId` | Request | Result |
| --- | --- | --- |
| `GET /task-recurrence/tasks/:recordId` | No body | Current bounded series/disposition, existing next-result link or eligible source metadata |
| `POST /task-recurrence/tasks/:recordId/preview` | `{sourceRevision,seriesRevision,resolution}` | `needs-resolution`, `unavailable`, `existing` or signed `ready` preview |
| `POST /task-recurrence/tasks/:recordId/generate` | `{previewToken,idempotencyKey}` | One new saved draft or existing generated disposition |
| `POST /task-recurrence/series/:seriesId/end` | `{seriesRevision,idempotencyKey,reason}` | Ended state; same exact latest End retry recoverable |

```ts
type TaskResolutionChoice = 'unique'|'earlier'|'later'|null;
interface TaskPreviewInput {
  sourceRevision:number;
  seriesRevision:number|null;
  resolution:TaskResolutionChoice;
}
type TaskPreviewResult =
  | {ok:true;kind:'needs-resolution';resolution:TaskDateResolution}
  | {ok:true;kind:'unavailable';code:string;message:string;resolution?:TaskDateResolution}
  | {ok:true;kind:'existing';existing:TaskGeneratedDisposition}
  | {ok:true;kind:'ready';preview:Readonly<TaskRecurrencePlan>;previewToken:string;expiresAt:UtcInstant};
type TaskGeneratedDisposition =
  | {kind:'active-record';record:OrdinaryProjectsRecord;seriesId:RecurrenceId;sequence:number;replayed:boolean}
  | {kind:'trashed-record';recordId:RecurrenceId;seriesId:RecurrenceId;sequence:number;replayed:true;recoveryAvailable:true}
  | {kind:'historical-only';seriesId:RecurrenceId;sequence:number;replayed:false;recoveryAvailable:false};
```

The GET read does not run the 100,801-candidate resolver or issue a token; expensive resolution is an explicit bounded POST. A no-longer-readable current result yields a generic unavailable response, without IDs from outside current scope. `OrdinaryProjectsRecord` is the existing complete normal Projects record view; generated records may later have any ordinary workflow status, owner, data edits or approval, or a changed kind/program/schedule after recurrence ends, and are not relabeled as fresh drafts. Only stable ID, same-org Projects-module identity and current visibility are required for an existing-result view; do not reassert its old kind/program/schedule against mutable data. A trashed response and ordinary restore link require an actual current soft-deleted row plus current write/scope for that row. An archived-only ID after organization restore has neither: it cannot return `trashed-record`, an ordinary restore link or a fabricated live record. `historical-only` is an administrator-only provenance disposition; other callers receive generic unavailable. It grants no new source-archive access.

`resolution:null` is allowed to ask for candidates. A unique candidate may then produce a ready preview without further user choice; a fold requires a second explicit preview request with `earlier` or `later`. No selection is prefilled. A gap remains unavailable. Every newer source selection/edit/cancel or task navigation revokes the browser's in-memory preview immediately, before an async response arrives.

The signed token is a closed version-1, base64url payload plus HMAC using a domain-separated existing server secret. The payload binds method, org/source/series identities and revisions, source/ref/plan hashes, chosen offset and civil/UTC target, actor plus a hash of the session ID, membership hash including exact persisted incarnation, issuedAt and expiresAt. Reference and membership inventories are bound by their 64-character hashes rather than embedded arrays; an account with many program scopes must not exceed the token cap solely because its scope list is large. Include no task free text or credentials. Use constant-time signature comparison and strict bounded duplicate-aware decoding. Tokens remain in memory/JSON bodies, never a URL, localStorage, log or backup. A signature is integrity, not a permission grant.

An accepted generation's actor/command hash is unique across its organization's occurrence rows, and its request hash binds exact accepted token/input. Actor command identities include user ID and exact membership creation incarnation, rather than user ID alone; current role/scopes/revision remain rechecked under the lock. A reused accepted key with changed request returns 409. A second valid command key for an already generated predecessor returns the retained existing disposition without creating another journal row or treating that second key as a new accepted generation. There is no general unbounded command history. The committed occurrence identity, rather than a token lifetime, preserves duplicate prevention forever within retained history.

To recover an interrupted exact accepted command, signature/route/actor binding and current authorization still apply, but source revision change or token expiry does not authorize a second creation or hide an existing committed result that is currently readable. A new membership incarnation requires ordinary reload/GET rather than treating the old preview as command authority. Recovered series have no command replay authority at all; their metadata is historical only. If the source or result is no longer readable, refuse disclosure. For a new occurrence, expiry, session/membership fingerprint including full creation microseconds, revisions, source/reference/plan hashes, candidate and all quotas must be current. A stale preview returns 409 and instructs reload/review; it does not recalculate and silently commit a different date.

Proposed errors follow the service `{ok:false,code,message,issues?}` shape: 401 session; 403 role/scope; generic 404 unavailable; 409 revision/preview/ended/recovered/already-in-series/identity-conflict/idempotency; 413 body size; 422 fields/strict-JSON/calendar/record-validation/quota; 429 rate. Do not return raw SQL, source data or a token in an error.

## Database, transaction and write guards

Proposed series rows have typed org/id/root/tip columns, immutable method/anchor JSON, mutable revision/state/end fields, nullable `recovered_state`, prepaid `budget_bytes` and bounded original creator/time. A series has no provider credential. Proposed occurrence rows have typed org/series/sequence/source/generated columns plus a closed bounded packet. A tenant-scoped foreign key from occurrence to its retained series is permitted; historical root/source/generated record IDs have **no mandatory foreign key to live `os_records`**, because ordinary backup restore leaves source trash archived. Application generation requires actual same-org Projects records, while inactive recovery may retain archived-only identities. Both tables enable and force tenant RLS using the existing `app.org_id` setting.

Occurrence rows are append-only through `os_immutable`; uniqueness covers `(org,series,sequence)`, `(org,sourceRecordId)`, `(org,generatedRecordId)` and accepted actor/command hash. Series `(org,rootRecordId)` is unique. Application checks prohibit a task appearing in two chains, cycles, disconnected tips or skipped sequences. Stable IDs are never changed on conflict. Source or generated rows in a live workspace are soft-deleted, preserving provenance; after backup restore, IDs from original source trash can remain historical metadata without a corresponding row.

```ts
declare function taskRecurrenceRoutes(context: {
  c:DbClient; org:string; user:string; session:VerifiedSession;
  member:RecurrenceMembership; tail:string; method:string;
  input:unknown; url:URL; settings:Settings;
}): Promise<Response|null>;
declare function guardTaskRecurrenceWrite(c:DbClient, next:OrdinaryRecord,
  options?:{operation?:'save'|'delete'|'restore'}):Promise<void>;
declare function endTaskRecurrence(c:DbClient, context:EndContext):Promise<EndResult>;
```

Call the route inside the existing organization transaction, which takes `lock:true` for every POST. Re-read membership and its exact persisted creation value inside that transaction. Use current rows, not prior browser/module cache or an imported signed-looking record. Creation, provenance insertion, tip update and audit share one transaction. Checking capacity or uniqueness in a separate transaction is insufficient. Normal `saveRecord` still invokes participation guards; do not add a bypass option for recurrence.

The central recurrence guard reads the actual prior row and retained membership, not an optional caller-supplied `previous` object. Active-series changes to `kind/programId/dueAt/timeZone/recurrence` refuse. After End, those ordinary edits are legal under the existing validator and permissions; ended/recovered metadata does not impose its former values on current data, exports or backups. Historical task/program/schedule assertions are checked from the immutable packet. A cancellation transition ends the series in the same transaction; generic deletion needs an explicit hook before its direct SQL soft-delete. Every restore hook keeps series inactive and does not clear provenance. Review all integration/import callers; a future direct SQL writer must not bypass this invariant. No guard emits mail or changes existing child workflow.

End is permanent for the series. Its last exact end-command fingerprint/result is a closed packet of at most **512 measured JSON bytes**, with fixed hashes, bounded revision and an audit boolean; no raw key or reason text enters that row. Its actor hash binds user ID and exact persisted membership creation incarnation. A mismatched expected series revision refuses; an exact retained latest retry under that same incarnation and current permission returns the ended result and its original audit boolean. A reintroduced member uses ordinary GET/current permission, not an old End command as authority. Use reason text at most 2,000 characters in the audit, subject to the whole 8,192-byte request cap, with a small typed `endCode` in the series.

Only the exact action **`task-recurrence.ended`** joins the existing audit reserve allowlist. Under ordinary capacity it may retain the bounded reason. In reserve mode its detail reduces to `{id:seriesId}` plus the existing minimal reserve fields; reserve exhaustion emits the existing redacted operational warning and omits the event. Extend `audit` narrowly to return `Promise<boolean>`: `true` only after its event INSERT, `false` only for its deliberate no-event paths. Existing callers may ignore the result. End persists and returns that boolean, never inferring it from today's undefined return. Unexpected SQL/transaction errors still fail; the guarantee covers quota exhaustion, not database unavailability. This does not let generic cancellation/deletion bypass existing ordinary quotas.

Freeze **`END_GROWTH_RESERVE_BYTES = 2048`** and retain that charge for each series' lifetime. At series creation and each generation, measure the candidate series with Postgres `octet_length(to_jsonb(row)::text)`, using the maximum integer representation for `budget_bytes` while measuring; set `budget_bytes` to that conservative measured size plus 2,048. Construct the fully populated maximum End projection, including longest bounded time/code spelling, revision digits and a 512-byte last-command/result packet, and require it to fit this total before accepting the series/generation. Hashes are fixed 64-character ASCII strings; end times are bounded at 35 characters; revisions are positive signed-32-bit integers; no unbounded field grows on End. A future schema that breaks this bound needs a new reviewed reservation, not a silent best-effort End.

`logicalBackupBytes` and the **4 MiB recurrence-table quota** charge series as `GREATEST(octet_length(to_jsonb(row)::text),budget_bytes)` and occurrence rows at actual measured size. This includes the reservation before ordinary work can consume it. End does not release, enlarge or recheck the prepaid reservation against free ordinary capacity; its resulting row must stay inside it. Retain the same conservative budget after End. Measure record/audit/occurrence overhead before accepting generation, count ended/recovered history and refuse capacity without a partial write. No preview reserves capacity. No deletion API for occurrence history is included.

Recovery recomputes a bounded conservative charge for its inactive series rows, validating source values but never trusting a source `budgetBytes` to lower actual accounting. It grants no End/Generate authority. Full-limit tests must show maximum legal End fields still commit with both ordinary and recurrence quotas full, and that exhausted audit reserve returns `auditRecorded:false` while ending the series.

## Backup and import boundary

```ts
interface TaskRecurrenceBackup {
  format:'charitology-os-task-recurrence'; version:1;
  series:readonly TaskRecurrenceSeriesBackup[];
  occurrences:readonly TaskRecurrenceOccurrenceBackup[];
}
interface TaskRecurrenceSeriesBackup {
  id:RecurrenceId; rootRecordId:RecurrenceId;
  method:TaskRecurrenceMethod; anchor:Readonly<TaskAnchor>;
  state:'active'|'ended'|'recovered'; revision:number;
  tipRecordId:RecurrenceId; tipSequence:number;
  createdBy:RecurrenceId; createdAt:UtcInstant;
  endedAt:UtcInstant|null;
  endCode:'explicit'|'record-cancelled'|'record-deleted'|'backup-recovery'|null;
  recoveredState:'active'|'ended'|'recovered'|null;
  budgetBytes:number; // source accounting provenance; destination recomputes its own charge
}
interface TaskRecurrenceOccurrenceBackup {
  seriesId:RecurrenceId; sequence:number;
  sourceRecordId:RecurrenceId; sourceRevision:number;
  sourceDataHash:RecurrenceHash;
  capturedSource:{
    moduleId:'projects';kind:'task';programId:RecurrenceId|null;
    dueAt:OffsetInstant;timeZone:string;recurrence:TaskFrequency;
  };
  generatedRecordId:RecurrenceId; initialGeneratedDataHash:RecurrenceHash;
  generatedModuleId:'projects'; generatedKindAtCreation:'task';
  method:TaskRecurrenceMethod; anchorHash:RecurrenceHash;
  selectedCivil:CivilDateTime; chosen:Readonly<TaskInstantCandidate>;
  planHash:RecurrenceHash;
  originalActorId:RecurrenceId; acceptedCommandHash:RecurrenceHash;
  acceptedRequestHash:RecurrenceHash; createdAt:UtcInstant;
}
declare function exportTaskRecurrence(c:DbClient,org:string):Promise<TaskRecurrenceBackup>;
declare function restoredTaskRecurrence(backup:unknown,source:{
  records:readonly OrdinaryRecord[];trash:readonly OrdinaryRecord[];
}):Readonly<TaskRecurrenceBackup>;
declare function restoreTaskRecurrence(c:DbClient,org:string,user:string,
  prepared:TaskRecurrenceBackup):Promise<void>;
```

The new optional whole-backup field is `taskRecurrence`. Absent means older v1 backup with no recurrence provenance, not malformed or silently restored active history. Present requires closed format/version and full bounded validation. Retain root/generated/source identities, original anchor, sequence, source versions/digests, original selected instants and initial child-data digest. Preserve old actor/command hashes as historical provenance only; no token or session is exported.

Validate all series/occurrences together: unique IDs, one chain, consecutive sequence, correct tip, consistent immutable method/program/anchor assertions, matching frozen calendar selections, no self-links/cycles and exact count/byte bounds. For a source live/ended series, its root/source/generated IDs must appear in the **source backup's `records` or `trash`** and have stable same-org Projects-module identity. For an already recovered series, historical IDs absent from the current reexport may remain as inactive packet references. Check current source rows only for stable ID/module identity, never for equality to their original task kind, program, due date, zone, recurrence or old data hash after End. Those original assertions come from `capturedSource`, generated-at-creation fields and the immutable anchor/selection packet. A forged future approval or old status carries no authority.

Calendar reconstruction must not reinterpret an old selected UTC instant under changed current zone rules: validate its frozen written civil/offset/instant arithmetic and method packet, disclose later time-zone-rule mismatch, and keep recovery inactive. Do not fabricate the original runtime's zone database version. Historical source revisions and child hashes describe initial versions; later ordinary edits are legal and need not equal them.

Restore runs only into the existing empty destination contract and imports **only `backup.records`**, under existing reset workflow/approval rules. Source `trash` and `trashFiles` remain in the private committed source archive; recurrence must not add them as live or soft-deleted rows. Then restore validated inactive recurrence provenance in the same transaction, retaining historical IDs without mandatory live-record foreign keys. Every series becomes `recovered`, with original state in runtime `recoveredState` for truthful reexport and all End/Generate command replay authority cleared. On another restore, preserve an existing `recoveredState` rather than overwriting the original value with `recovered`. There is no automatic activation, resume, new trash-restoration route or new source-archive authority. A historical-only successor gets no live record/ordinary recovery link. Only actual current rows can use current record/soft-trash views, under their current visibility; source archives keep their existing administrator-only access.

Existing integration `source` metadata remains unchanged. A newly generated task always has `source:null` even when its predecessor came from a connection. Connection re-import cannot write frozen recurrence schedule fields into an active series. Keep the existing complete source archive with recovery copies; recurrence metadata is not a substitute for that archive.

## Client ownership and acceptance boundary

The client retains one selected task/revision, one preview generation counter and at most one pending Generate/End command. Capture the exact token/key before awaiting a request. Changing task, source editor, resolution, organization or cancel invalidates older async responses. A failed request keeps the command and its ambiguous outcome visible; it does not construct a new task ID/key behind the user. Reload/GET is the recovery path. Disable duplicate action buttons while pending, without treating a disabled button as server idempotency.

Use existing DOM-safe `node`/text creation and request/CSRF helpers. Avoid static named fields before interception. The panel explicitly distinguishes source approval, newly generated planned task, current existing edited task and recovered/trashed history. It must show the exact offset and UTC instant beside local time, not only the browser's locale conversion.

Public runtime tests must verify the plan's acceptance matrix, actual forced-RLS transactions, two-session races, all save/delete/restore/integration routes, backup downgrade compatibility and bounds, plus actual browser interruption/fold/gap/stale views. The private 12-group prototype is feasibility only. No test count here is a production or release claim.

Root accepted this corrected contract for implementation on October 27, 2026, after independent code-grounded review of source-trash recovery, post-End edits, membership incarnation, prepaid End accounting and strict route intake. This freeze authorizes the bounded software work; runtime, database, browser and release acceptance remain required.
