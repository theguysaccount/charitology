# R2 study register interfaces

Frozen before implementation · October 26, 2026 · review: draft · AI-assisted. Read with [STUDY_REGISTER_PLAN.md](STUDY_REGISTER_PLAN.md). No runtime, schema or provider changes existed when this contract was frozen. Existing legacy research keys and public review/evidence fields remain untouched.

## Boundary and ownership

One JSON workspace at logical key `study-register.v1`, actual key **`charitology.study-register.v1`**, shared between the two static-site views on the same browser origin. No shared-account/team meaning. Root owns Astro/catalog wiring/docs; model agent owns pure model/import/actual-module checks; storage agent owns the Web Lock/observed-byte adapter and recovery tests; UI agent owns shared controls and browser acceptance.

New pure modules are `src/lib/client/study-register-model.ts` and `study-register-import.ts`; no DOM, storage, network, clock or random-ID lookup inside them. Web Crypto is used for SHA-256 through an injected/default digest function. `scripts/check-study-register.mjs` bundles the actual modules using the existing esbuild test pattern. All functions below return new JSON objects; they never mutate input state, preview input or supplied bytes. Unknown keys fail validation. No inferred person, study design, effect, search or independent review.

## Core TypeScript types

```ts
type Id = string; // 1..100 ASCII letters/digits/_/-; globally unique within workspace
type Hash = string; // exactly 64 lowercase SHA-256 hex
type Instant = string; // real canonical UTC ISO instant, YYYY-MM-DDTHH:mm:ss.sssZ
type Day = string; // real YYYY-MM-DD, no inferred date
type Nullable<T> = T | null;
type Stage = 'title-abstract' | 'full-report';
type Lane = 'A' | 'B';
type FirstOutcome = 'advance' | 'exclude' | 'undecided';
type FullOutcome = 'include' | 'exclude' | 'undecided';
type SourceClass = 'unknown' | 'empirical-report' | 'review' | 'method' |
  'guideline' | 'dataset' | 'organization' | 'discussion' | 'other';
type Design = 'unknown' | 'randomized' | 'quasi-experimental' | 'observational' |
  'qualitative' | 'systematic-review' | 'method' | 'other';
interface Metadata {
  title: string; authors: Nullable<string>; year: Nullable<number>;
  originalYear: Nullable<string>; doi: Nullable<string>; pmid: Nullable<string>;
  url: Nullable<string>; abstract: Nullable<string>; classification: SourceClass;
  design: Design; population: Nullable<string>; intervention: Nullable<string>;
  outcomes: Nullable<string>; tags: string[]; summary: Nullable<string>;
}
interface ProtocolContent {
  title: string; question: string; population: string; intervention: string;
  comparison: Nullable<string>; outcomes: string; timeHorizon: Nullable<string>;
  eligibleDesigns: Design[]; eligibleSourceClasses: SourceClass[];
  inclusion: string; exclusion: string; searchPlan: string;
}
interface Protocol {
  id: Id; version: number; basedOnId: Nullable<Id>; hash: Hash;
  content: ProtocolContent; frozenAt: Instant;
}
interface SearchRun {
  id: Id; source: string; query: Nullable<string>; searchedOn: Nullable<Day>;
  performed: 'unknown' | 'self-reported'; provenanceNote: Nullable<string>;
  recordedAt: Instant;
}
interface SourceBacklink { title: string; href: string } // internal site href only
interface ImportedCitation {
  title: string; authors: Nullable<string>; year: Nullable<number>;
  originalYear: Nullable<string>; doi: Nullable<string>; pmid: Nullable<string>;
  url: Nullable<string>; abstract: Nullable<string>;
}
interface ImportBatch {
  id: Id; kind: 'citation-csv' | 'site-bibliography'; identityHash: Hash;
  sourceHash: Hash; fileName: Nullable<string>; parserVersion: 'citation-csv-v1' | 'site-citations-v1';
  columnMap: Record<string, number>; headers: string[];
  searchRunId: Nullable<Id>; catalogHash: Nullable<Hash>;
  provenanceNote: Nullable<string>; committedAt: Instant;
  assignments: { row: number; occurrenceId: Id; initialReportId: Id }[];
}
interface Occurrence {
  id: Id; batchId: Id; row: number; rawCells: string[];
  imported: ImportedCitation; backlinks: SourceBacklink[];
  reportId: Id; // current mapping; original is retained in batch.assignments
}
interface ReportRevision {
  revision: number; hash: Hash; metadata: Metadata; occurrenceIds: Id[];
  reason: string; recordedAt: Instant;
}
interface Report { id: Id; currentRevision: number; revisions: ReportRevision[] }
interface DuplicateAction {
  id: Id; kind: 'merge' | 'split' | 'decline'; recordedAt: Instant; reason: string;
  moves: { occurrenceId: Id; from: Id; to: Id }[];
  revisions: { reportId: Id; before: Nullable<number>; after: number }[];
  suggestionHash: Nullable<Hash>;
}
interface Binding { protocolId: Id; protocolHash: Hash; reportId: Id; reportRevision: number }
interface Decision extends Binding {
  id: Id; stage: Stage; lane: Lane; laneLabel: string;
  outcome: FirstOutcome | FullOutcome; reasonCode: Nullable<string>;
  reason: Nullable<string>; recordedAt: Instant; supersedesId: Nullable<Id>;
  retrievalId: Nullable<Id>; // full-report only; exact current obtained retrieval
}
interface Resolution extends Binding {
  id: Id; stage: Stage; decisionA: Id; decisionB: Id;
  outcome: 'advance' | 'include' | 'exclude'; resolverLabel: string;
  reason: string; recordedAt: Instant;
}
interface Retrieval extends Binding {
  id: Id; titleBasisHash: Hash; state: 'pending' | 'obtained' | 'not-retrieved';
  reason: Nullable<string>; sourceReference: Nullable<string>; recordedAt: Instant;
  supersedesId: Nullable<Id>;
}
interface Extraction extends Binding {
  id: Id; inclusionHash: Hash; supersedesId: Nullable<Id>; recordedAt: Instant;
  comparison: Nullable<string>; population: Nullable<string>; outcome: Nullable<string>;
  measure: Nullable<string>; unit: Nullable<string>; followUp: Nullable<string>;
  estimate: Nullable<number>; lower: Nullable<number>; upper: Nullable<number>;
  denominator: Nullable<number>; sourceReference: Nullable<string>;
  bias: Nullable<string>; limitations: Nullable<string>;
}
interface Counts {
  occurrences: number; collapsedOccurrences: number; canonicalReports: number;
  titleExcluded: number; titleAdvanced: number; titlePending: number; titleConflicts: number;
  includedReports: number; fullExcluded: number; notRetrieved: number;
  fullPending: number; fullConflicts: number; includedWithExtraction: number;
}
interface PacketDescriptor {
  id: Id; recordedAt: Instant; inputHash: Hash;
  protocolId: Id; protocolHash: Hash; counts: Counts;
}
type DraftKind = 'protocol' | 'metadata' | 'decision' | 'resolution' | 'retrieval' |
  'extraction' | 'search' | 'import' | 'merge' | 'split';
interface Draft {
  tab: 'browse' | 'protocol' | 'imports' | 'reports' | 'screening' | 'exports';
  selectedReportId: Nullable<Id>;
  form: Nullable<{ kind: DraftKind; targetId: Nullable<Id>; fields: Record<string, string> }>;
  dirty: boolean;
}
interface StudyState {
  version: 1; id: Id; revision: number; updatedAt: Instant;
  selectedProtocolId: Nullable<Id>; protocols: Protocol[]; searchRuns: SearchRun[];
  imports: ImportBatch[]; occurrences: Occurrence[]; reports: Report[];
  duplicateActions: DuplicateAction[]; decisions: Decision[]; resolutions: Resolution[];
  retrievals: Retrieval[]; extractions: Extraction[]; packets: PacketDescriptor[];
  draft: Draft;
}
```

Fields not yet known are null, not empty strings. Raw occurrence cells preserve original strings, including whitespace; canonical metadata is deliberately normalized through user-reviewed import/correction. `Metadata.year` is a finite integer 1..2200 or null; unparseable declared dates stay `originalYear` with year null. DOI/PMID originals remain in occurrences; normalized tokens are matching suggestions only. URLs are absolute HTTPS without credentials; no fetch occurs. Backlinks are controlled internal paths, never executable/external URLs. A source with unknown classification stays unknown until a deliberate correction/classification.

All report identities, including retired merge sources, count toward the 1,000 report bound. Occurrences may be 2,000 because explicitly reviewed import assignments may attach several rows to one new/existing report. A merged-away report retains an empty current occurrence list and its full older revisions; it is not counted in the current canonical-report denominator. No ID is reused. Current occurrence mapping must exactly equal current report revisions' occurrence lists; historical lists stay historical.

Protocol versions use one monotonically increasing workspace sequence (1..20), with `basedOnId` identifying the chosen earlier version. Content hashes are unique: freezing identical content returns the existing protocol rather than minting a new apparent registration. Selecting an old protocol may show its still-current decisions, but current report revisions are always checked. No automatic carry-forward to changed protocol content or changed metadata.

## Limits and validation

`STUDY_LIMITS` exports the frozen numbers: reports 1000 (including retired identities), occurrences 2000, imports 20, search runs 20, protocols 20, combined immutable history 8000, packet descriptors 20, page size 25, CSV bytes 1,048,576, complete backup bytes 2,097,152, draft canonical bytes 65,536, CSV columns 30. History counts protocol versions + report revisions + search runs + duplicate actions + decisions + resolutions + retrievals + extractions + packet descriptors. No operation silently removes history to make room.

Text limits: title500, authors1000, abstract8000, URL1200, DOI/PMID200, ordinary note/reason2000, at most20 tags of80. Raw cells are at most2000 except a mapped abstract cell (8000). Protocol title180; question/population/intervention/comparison/outcomes/inclusion/exclusion/searchPlan2000 each; timeHorizon500. Draft has at most40 own string fields, key length80/value8000, total65,536 bytes; allowed keys depend on `DraftKind` and correspond to that form's typed command fields (JSON text for small lists/maps). Draft values may be invalid form inputs, but must satisfy these raw shape/size limits. Never coerce them into active research entities on restore.

Reject prototype-like column/form keys (`__proto__`, `prototype`, `constructor`), unknown canonical fields, dangling refs, duplicate IDs, impossible dates/instants, nonfinite numbers, negative denominator, invalid intervals where values exist, contradictory stage/outcome/binding, noncontiguous revisions and edited historical hashes. Full backup validation recomputes all hashes and current reductions, not just root checksum. Count/byte admission precedes assigning any candidate; the exact future pretty backup envelope reserves its full 24-character timestamp, never truncates. All quota failures preserve prior valid state.

## Pure functions and command preparation

```ts
interface StudyIssue { path: string; code: string; message: string }
class StudyError extends Error { code: string; issues: StudyIssue[] }
interface ModelContext {
  expectedStateHash: Hash; at: Instant; makeId: () => Id;
  digest?: (bytes: Uint8Array) => Promise<Hash>; // default Web Crypto SHA-256
}
interface PreparedStudyMutation {
  format: 'charitology-study-mutation'; version: 1;
  expectedStateHash: Hash; expectedRevision: number;
  nextStateHash: Hash; nextState: StudyState;
  commandHash: Hash; noOp: boolean;
  summary: { kind: StudyCommand['kind']; message: string; counts: Counts | null };
}
function blankStudyState(id: Id, at: Instant): StudyState;
function canonicalStudyJson(value: unknown): string; // finite JSON only; sorted object keys
function validateStudyState(value: unknown): Promise<StudyState>; // new validated normalized copy
function hashStudyValue(value: unknown): Promise<Hash>; // canonical JSON using Web Crypto
function studyStateHash(state: StudyState): Promise<Hash>; // whole state, including draft/history
function studyInputHash(state: StudyState): Promise<Hash>; // research entities+selected protocol;
// excludes only draft, packet descriptors, workspace revision/updatedAt/id
function studyCounts(state: StudyState, protocolId?: Id): Counts;
function studyReportView(state: StudyState, reportId: Id, protocolId?: Id): ReportView;
function duplicateSuggestions(state: StudyState): DuplicateSuggestion[];
function prepareStudyCommand(state: StudyState, command: StudyCommand,
  context: ModelContext): Promise<PreparedStudyMutation>;
```

`ReportView` is read-only derived data: `{report,revision,metadata,occurrences,binding,title:{state,decisionA,decisionB,resolution,basisHash},retrieval,full:{state,decisionA,decisionB,resolution,inclusionHash},extraction,eligibility:{canTitleDecide,canRetrieve,canFullDecide,canExtract},notices}`. Title states are `pending|conflict|advance|exclude`; full states `not-advanced|pending|conflict|include|exclude|not-retrieved`. No automatic design/evidence judgement. Missing selected protocol returns null binding/stages pending and disables decisions; counts requiring a protocol throw `protocol_required` rather than pretending no decisions equal a completed review.

`DuplicateSuggestion` is `{hash,reportIds,reason:'doi'|'pmid'|'exact-url'|'title-year',identifierConflict:boolean}`. At most100 suggestions per call, deterministically sorted; pagination/search does not change state. DOI/PMID/exact credential-free URL tokens may suggest identity. Title/year similarity is visibly weak. Every merge remains explicit. Nonempty conflicting canonical DOI or PMID blocks merge/group import until a deliberate metadata correction with a reason resolves the conflict; originals are retained. Different reports of a study are not duplicate articles. Optional study grouping is **deferred** in this first DTO rather than creating an unimplemented or misleading unique-study count.

`prepareStudyCommand` checks current whole-state hash against `expectedStateHash` both before and after asynchronous validation/hashing; generated IDs and `at` are supplied, then frozen into the returned candidate/command hash. It never mutates/persists. A caller must still discard a late result when UI generation/current-state hash changes. An exact no-op returns unchanged state/hash/revision/time. For ordinary mutations, workspace revision increments once and updatedAt becomes supplied `at`. `commandHash` is an integrity/recovery identity, not proof of an authenticated actor or independent time.

### Exact command union

```ts
type StudyCommand =
 | {kind:'draft.replace'; draft:Draft}
 | {kind:'protocol.freeze'; content:ProtocolContent; basedOnId:Id|null}
 | {kind:'protocol.select'; protocolId:Id}
 | {kind:'search.record'; source:string; query:string|null; searchedOn:Day|null;
      performed:'unknown'|'self-reported'; provenanceNote:string|null}
 | {kind:'import.commit'; preview:ImportPreview; assignments:ImportAssignment[]; reason:string}
 | {kind:'report.correct'; reportId:Id; reportRevision:number; metadata:Metadata; reason:string}
 | {kind:'duplicates.merge'; reportIds:Id[]; targetId:Id; metadata:Metadata; reason:string}
 | {kind:'duplicates.split'; reportId:Id; reportRevision:number;
      partitions:{retainOriginal:boolean; occurrenceIds:Id[]; metadata:Metadata}[]; reason:string}
 | {kind:'duplicates.decline'; suggestionHash:Hash; reportIds:Id[]; reason:string}
 | ({kind:'decision.record'; stage:Stage; lane:Lane; laneLabel:string;
      outcome:FirstOutcome|FullOutcome; reasonCode:string|null; reason:string|null;
      retrievalId:Id|null; supersedesId:Id|null} & Binding)
 | ({kind:'resolution.record'; stage:Stage; decisionA:Id; decisionB:Id;
      outcome:'advance'|'include'|'exclude'; resolverLabel:string; reason:string} & Binding)
 | ({kind:'retrieval.record'; titleBasisHash:Hash; state:'pending'|'obtained'|'not-retrieved';
      reason:string|null; sourceReference:string|null; supersedesId:Id|null} & Binding)
 | ({kind:'extraction.record'; inclusionHash:Hash; supersedesId:Id|null;
      values:Omit<Extraction,keyof Binding|'id'|'inclusionHash'|'supersedesId'|'recordedAt'>} & Binding)
 | {kind:'packet.record'};
```

Merge takes2..20 current nonempty reports including the stable target; moves every occurrence to that target, appends an empty revision to retired reports and one metadata/occurrence revision to the target. Split partitions **all** current occurrences into2..20 nonempty, disjoint groups; exactly one retains the old ID and the others receive new IDs/revision1. Both preserve originals/history and invalidate affected current screening via report revision change. `report.correct` replaces the complete normalized metadata, requires reason and exact current revision, and retains old version. Metadata with no actual change is an explicit no-op.

A decision supersedes only the latest exact binding/stage/lane decision (or null for first). Full-report decision chains also include the current retrieval ID; a fresh obtained retrieval starts new A/B chains with null supersession while keeping older decisions historical. The lane label is bounded self-recorded text, not identity; both may be the same person. Exclusion needs code+reason. Undecided is pending, never an exclusion. Stage outcomes are checked (`advance` never valid at full report; `include` never valid at title/abstract). A resolution is allowed only for the exact latest two completed disagreeing decisions; it selects a supported stage outcome with a nonempty resolver label/reason. A changed pair invalidates the old resolution.

Title advancement produces `titleBasisHash=hash(binding,latest A/B IDs,resolution ID|null)`. Retrieval binds that exact basis. A new title-decision basis requires new retrieval, avoiding resurrection of an old final inclusion. Not retrieved needs a reason. Full-report decisions require the current obtained retrieval's exact ID. Final inclusion produces `inclusionHash=hash(binding,retrieval ID,latest full A/B IDs,resolution ID|null)`. Extraction requires that current inclusion hash and supersedes only the latest extraction for that exact binding and current inclusion hash. A new inclusion hash starts an extraction chain with null supersession. A later protocol/report/retrieval/decision change keeps old extractions but they do not count as current. Extraction is optional; inclusion never implies numeric effects exist.

`packet.record` appends only a compact descriptor for the selected protocol/current input hash/counts. No recursively embedded workspace snapshots. An old descriptor cannot reconstruct earlier complete state; its downloaded full JSON is the archived packet. The UI explains this before export. No delete/prune commands are supplied. Reviewed clear, restore and undo are storage recovery operations over a complete validated state, not silent history edits.

## Strict CSV/catalog import

```ts
type CitationColumn = 'title'|'authors'|'year'|'doi'|'pmid'|'url'|'abstract';
interface CsvInput {
  kind:'citation-csv'; bytes:Uint8Array; fileName:string;
  columnMap:Partial<Record<CitationColumn,number>>;
  searchRunId:Id|null; provenanceNote:string|null;
}
interface CatalogEntry extends ImportedCitation {
  entryId:string; publisher:string|null; backlinks:SourceBacklink[];
}
interface CatalogInput {
  kind:'site-bibliography'; entries:CatalogEntry[]; catalogHash:Hash;
  provenanceNote:string|null;
}
type CitationImportInput = CsvInput | CatalogInput;
interface ImportRow {
  row:number; rawCells:string[]; citation:ImportedCitation;
  backlinks:SourceBacklink[]; issues:StudyIssue[];
}
interface ImportAssignment {
  row:number;
  target:{kind:'existing';reportId:Id;reportRevision:number} |
         {kind:'new';group:string;canonicalRow:number};
}
interface ImportDuplicateSuggestion {
  hash:Hash; rows:number[]; reportIds:Id[];
  reason:'doi'|'pmid'|'exact-url'|'title-year'; identifierConflict:boolean;
}
interface ImportPreview {
  version:1; expectedStateHash:Hash; sourceHash:Hash; identityHash:Hash;
  reviewHash:Hash; input:CitationImportInput; headers:string[]; rows:ImportRow[];
  issues:StudyIssue[]; ignoredBlankLines:number;
  duplicateSuggestions:ImportDuplicateSuggestion[];
  capacity:{currentReports:number;currentOccurrences:number;currentBatches:number};
  existingBatchId:Id|null; // exact import identity already committed
}
function parseCitationCsv(bytes:Uint8Array):{headers:string[];
  rows:{row:number;cells:string[]}[];ignoredBlankLines:number};
function previewCitationImport(state:StudyState,input:CitationImportInput,
  expectedStateHash:Hash):Promise<ImportPreview>;
function defaultImportAssignments(preview:ImportPreview):ImportAssignment[];
// prepareStudyCommand import.commit recomputes preview and validates exact assignments.
```

Byte hash covers actual input bytes including any initial BOM; fatal UTF-8 decode and strict quote grammar precede row parsing. One initial BOM is accepted for syntax. Preserve all cell values; row is the first physical line number of each data record, including records with quoted internal newlines. Reject unclosed quotes, quote misuse, ragged rows, duplicate/empty headers, >30columns, malformed/oversized mapped values or missing/invalid title. No malformed row is silently skipped; wholly empty physical lines outside quotes are explicitly counted in ignoredBlankLines (a row of empty quoted cells/commas is not silently ignored), not imported reports. The preview carries the raw input only in memory; it never silently persists a 1 MiB original file. Committed rows preserve cell values and file hash, not the original quote/line-ending byte representation; users keep the source file separately if those bytes matter.

Only mapped fields enter canonical citation metadata; retained unmapped columns remain local raw data. Canonical new reports start classification/design unknown and tags/summary empty/null. Unparseable publication year stays originalYear plus null year; it is not dropped or replaced by current year. Bad mapped URL is a blocking issue. There is no arbitrary JSON citation-import dialect: CatalogInput is internal, controlled Astro data, while user JSON files are validated full backups only.

Import identity hashes kind + sourceHash + parser version + exact column mapping + searchRunId + relevant recorded provenance/catalogHash. Same identity returns existing batch/no new occurrences; same bytes under an explicitly different recorded run remain distinct. SearchRunId resolves to a saved search record; a bibliography import can never be counted as an executed search. Preview hash covers all normalized rows, diagnostics, provenance and expected state hash. Commit rehashes/reparses input, rejects changed preview/input/state and any blocking issue, validates complete assignment coverage, then creates the batch/occurrences/reports atomically as one candidate.

Default assignments create one new group per row. A user may explicitly combine rows or attach to an existing exact-revision report after inspecting suggestions and entering a reason; no implicit merge. Every row has exactly one assignment. Group canonicalRow must be a member row; all group assignments agree on it. Conflicting canonical identifiers block grouping. Attachment to an existing report appends a revision with its changed occurrence list, invalidating stale screening; its metadata is not silently replaced. The immutable initial batch assignment records the deliberate grouping. This permits2,000 retained occurrences while bounding all retained report IDs at1,000.

## Exact reductions, exports and full backups

```ts
interface BackupEnvelope {
  format:'charitology-study-register'; version:1; exportedAt:Instant;
  checksum:Hash; workspace:StudyState;
}
function makeStudyBackup(state:StudyState,exportedAt:Instant):Promise<string>;
function parseStudyBackup(raw:string|Uint8Array):Promise<StudyState>;
function studyCsvExports(state:StudyState,protocolId?:Id):Record<
  'reports'|'occurrences'|'decisions'|'exclusions'|'extractions',string>;
function studyMarkdownMemo(state:StudyState,protocolId?:Id):string;
function makeStudyPacket(state:StudyState,packetId:Id,exportedAt:Instant):Promise<{
  json:string; csv:ReturnType<typeof studyCsvExports>; markdown:string;
  descriptor:PacketDescriptor;
}>;
```

Backup checksum is SHA-256 of canonical `{format,version,workspace}`, excluding only checksum/exportedAt. Produce pretty JSON with two-space indentation; **actual UTF-8 bytes of that complete string** must be<=2,097,152, including timestamp/wrapper. Parser checks incoming byte limit before decode/parse and validates/recomputes complete graph/root/entity hashes, counts and the future re-export envelope. No value is trusted merely because a caller supplied a checksum. Format/version/key mismatches fail; no restore touches the old research engine.

`makeStudyPacket` requires current `studyInputHash` equal the selected compact descriptor's inputHash, and matching protocol/counts; otherwise the old packet is available only from its earlier downloaded JSON. A current packet's complete JSON is the same restorable backup format. Derived CSV/memo are clearly labeled views of that packet's protocol/revisions and self-recorded workflow, not additional canonical stores. Do not place full snapshots inside descriptors or make the archive recursively contain itself.

Counts use nonempty current canonical report groups only, including unknown/nonstudy records until deliberately excluded. For the selected protocol/current revisions:

- `occurrences = collapsedOccurrences + canonicalReports`.
- `canonicalReports = titleExcluded + titleAdvanced + titlePending`; titleConflicts is a subset of titlePending.
- `titleAdvanced = includedReports + fullExcluded + notRetrieved + fullPending`; fullConflicts is a subset of fullPending.
- A single lane/undecided/stale binding is pending. Current not-retrieved is neither final exclusion nor zero effect. `includedWithExtraction <= includedReports`.

Imported bibliography/manual provenance is separately labeled; total occurrences are never relabeled database search results. Included **reports**, not unique studies or sample sizes, is the primary total. No effects/people/denominators are pooled. Counts are derived before applying UI filters/paging. No selected protocol makes the UI show “Select/freeze a protocol” rather than a misleading zero completed count.

CSV contains stable IDs, protocol/report revisions, stage/lane labels, reasons, source/file identity, local timestamps and explicit derived/current indicators. Occurrence CSV uses fixed raw-cell columns plus header/map provenance; no untrusted header becomes an object key. Exclusions carry exact stage/reason/decision/resolution identity. Numeric null is an empty field accompanied by a known/unknown flag; explicit zero is `0`. Serialize text safely for spreadsheets: prefix a single quote when a string begins (after whitespace/control prefixes) with `=`, `+`, `-`, `@`, tab/CR/LF; then quote every cell and double internal quotes. This is an export representation only; raw JSON remains lossless. Memo uses existing Markdown escaping and states local labels, unverified source classifications, selected-source coverage and absent real independent review.

## Storage/UI handshake that prevents blind retry

1. UI captures generation and computes expected hash of its **current in-memory** state. Async preparation may parse/hash; a changed generation/state invalidates the result.
2. `commitPrepared(prepared)` in the storage adapter acquires the exact-key Web Lock, confirms current in-memory hash equals expectedStateHash, and independently confirms browser bytes equal the adapter's exact observed saved bytes. These are different checks: after quota failure the valid current candidate may be newer than disk.
3. Validate nextState/hash/backup bound, assign valid current candidate, attempt write. Successful persist advances observed bytes and clears unsaved. Failed storage write retains current valid candidate+visible unsaved state; saved bytes remain protected.
4. A later **retryPersist** saves that same current candidate under the unchanged observed-byte check; it never reapplies a command or increments revisions/events. A fresh command may be prepared from current unsaved state only while saved bytes are still unchanged. A stale other tab blocks both paths and preserves current work for export.
5. Restore is previewed and bound to exact observed saved bytes plus UI generation/current hash, under the same lock; undo is a validated guarded replacement, not in-place history mutation. Reload clears undo and gets a new adapter. Clear requires inline review and affects this key only. None of these silently copies fields into the legacy research key.
6. Without Web Locks/secure-context hashing, no writes or protocol/import/decision confirmations are offered. Retain bibliography/readable local/raw export capabilities with a visible read-only explanation. Network-free does not mean persistent storage is guaranteed.

Tests must execute actual modules for command invariants, import/grouping/idempotence, all three conservation equations, revision invalidation, backup exact boundaries/CSV formulas and storage racing/failure recovery. Browser proof must traverse both routes and inspect real exported bytes where supported. Synthetic inputs and injected local labels never establish an actual search, study verification or independent human review.

## Implementation clarification before reducer completion

Synchronous read projections use SHA-256 from pinned `@noble/hashes` 2.4.0 ([official documentation](https://github.com/paulmillr/noble-hashes)). Persistent validation and portable checksums continue to use Web Crypto. No handwritten cryptographic kernel is introduced. The storage adapter reuses the earlier durable store’s observed-byte/failure-preservation pattern; its asynchronous full-graph validation and Web Lock transaction need a dedicated adapter rather than the older synchronous helper. These choices do not change source authority or public evidence labels.
