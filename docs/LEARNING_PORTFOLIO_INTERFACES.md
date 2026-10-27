# Learning portfolio interfaces

Pre-implementation proposal · October 27, 2026 · AI-assisted · review: draft. Read the [plan](LEARNING_PORTFOLIO_PLAN.md). This is a private self-study companion and guarded legacy editor, not an assessment service. No runtime is authorized by this document alone.

## Constants and accepted legacy data

Final course key/lock: `charitology.principles-course-v1`. Final companion key/lock: `charitology.learning-portfolio.v1`. No key discovery or reading-notebook/partner access. All limits count actual serialized future UTF-8 bytes where stated; string limits use JavaScript UTF-16 length.

```ts
type Id = string; //1..100 ASCII A-Z/a-z/0-9/_/-, globally unique workspace IDs
type Hash = string; //64 lowercase SHA-256 hex
type Instant = string; //real canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ, 1900..2200
type LegacyDay = string; //empty, or actual old real YYYY-MM-DD domain; no new year restriction
interface CourseState {
  version: 1;
  name: string; //<=120
  capstone: string; //<=12000
  completedAt: LegacyDay; //declared source date, not a verified completion instant
  lessons: { read: boolean; practice: string; answers: [number, number] }[];
  //Exactly ten lessons; practice<=5000; answers integer -1..2. No other keys.
}
declare const LEARNING_LIMITS: {
  readonly courseBytes: 400_000;
  readonly criteriaBytes: 262_144;
  readonly criteria: 20;
  readonly records: 10;
  readonly backupBytes: 2_097_152;
  readonly draftBytes: 524_288;
  readonly draftFieldChars: 16_384;
  readonly jsonDepth: 32;
};
type LearningDigest = (bytes: Uint8Array) => Promise<Hash>;
```

Strict admission checks byte bounds before decode/parse/hash/clone, using intrinsic typed-array length and owned byte copies. Fatal UTF-8 decoding, decoded duplicate-key refusal and a preparse maximum container nesting depth of 32 apply to file and saved JSON. Root object is depth 1. Refuse decorated/accessor/symbol/sparse/non-finite/unknown-key objects rather than invoking getters or silently normalizing them. A source file may be recovered unchanged when readable, but unsupported extra fields never enter active progress or portfolio data. Known strings are retained exactly; `0`, `-1`, blank, false and unknown dates are distinct.

The 400,000-byte v1 ceiling expands only the old import capacity. It covers the maximum **known writer shape**, not all arbitrary extra properties the old validator tolerated and discarded. No v2 envelope or revision field is written into the course key.

## Frozen criteria

```ts
interface CriteriaSource {
  path: string; //exact allowlisted repo-relative chapter path
  rawText: string; //exact UTF-8 source; inert when rendered from an archive
  rawHash: Hash;
}
interface CourseQuestion {
  prompt: string;
  options: [string, string, string];
  correct: 0 | 1 | 2;
  explanation: string;
}
interface CriteriaUnit {
  id: Id; //stable chapter ID
  chapter: number; //1..10, ordered without gaps
  chapterPath: string;
  chapterHash: Hash;
  takeaway: string;
  exercise: string;
  worked: string;
  questions: [CourseQuestion, CourseQuestion];
}
interface CourseCriteria {
  format: "charitology-course-criteria";
  version: 1;
  id: Id;
  sourceCommit: string; //actual explicit 40-lowercase-hex Git baseline
  sourceFiles: CriteriaSource[]; //exact ten chapter files, stable chapter order
  units: CriteriaUnit[]; //exact ten known chapter bindings
  capstoneInstructions: string; //exact authored current text
  rules: {
    readRequired: true;
    practiceMin: number; //current30; safe integer1..5000, known editions only
    capstoneMin: number; //current200; safe integer1..12000, known editions only
    nameMax: 120;
    practiceMax: 5000;
    capstoneMax: 12000;
    stringLength: "javascript-utf16";
  };
  limitations: "self-study-v1";
  hash: Hash;
}
interface CriteriaRegistry {
  format: "charitology-course-criteria-registry";
  version: 1;
  currentId: Id;
  entries: { id: Id; hash: Hash; path: string }[];
}
```

Criteria hash covers every field except its own hash. No clock/generated time enters criteria identity. Source text hashes cover exact UTF-8 bytes; the criteria hash covers ordered normalized JSON. Known immutable registry definitions are injected into pure validators. Incoming definitions must match known ID/hash/complete content exactly; custom curricula are unsupported. Registry history is append-only. Current-source checks compare exact chapter bytes and authored lesson/instruction/rule data with the declared current artifact. Source capture follows the two-commit A/B workflow in the plan.

The initial adapter supports the actual ten/two/three shape only. New criteria may change authored content, answer order or the two minimum-length thresholds within this shape through an explicit registry edition; different v1 input limits/shapes require an explicit contract/schema change, not incoming custom JSON. Freeze only inert authored question/rubric definitions and exact ten chapter snapshots, never a later UI component that embeds its own criteria hash. Test-only alternative definitions do not become public editions.

## Evaluation, origin and immutable records

```ts
interface CourseEvaluation {
  complete: boolean;
  unitsComplete: number; //0..10, count of all checks satisfied per unit
  units: {
    unitId: Id;
    read: boolean;
    practiceCharacters: number; //trim().length
    practiceSufficient: boolean;
    answers: [
      "unanswered" | "correct" | "incorrect",
      "unanswered" | "correct" | "incorrect",
    ];
    passed: boolean;
  }[];
  capstoneCharacters: number;
  capstoneSufficient: boolean;
  limitations: "self-study-v1";
}
interface CourseOrigin {
  kind: "course-memory" | "course-file";
  persistence: "saved" | "unsaved-memory" | "selected-file";
  rawHash: Hash | null; //exact selected/saved text bytes where actually available
  fileName: string | null; //safe basename<=255; descriptive, not identity
  declaredCompletedAt: LegacyDay; //equals input.completedAt
  historicalCriteria: "unknown"; //v1 source contains no binding proof
}
interface LearningRecord {
  id: Id;
  seriesId: Id; //first record's ID
  revision: number; //safe integer starting1
  previousId: Id | null;
  previousHash: Hash | null; //null revision1; exact predecessor hash on amendment
  criteriaId: Id;
  criteriaHash: Hash;
  input: CourseState;
  inputHash: Hash;
  origin: CourseOrigin;
  evaluation: CourseEvaluation; //recomputed; never trusted as an imported flag
  criteriaAffirmed: true; //local assertion of inspecting this selected version now
  recordedAt: Instant; //capture/amend instant, separate from declared source day
  amendmentReason: string | null; //null for revision1; trimmed nonempty<=2000 later
  limitations: "self-study-v1";
  hash: Hash;
}
```

Record hash covers all fields except itself. Input hash covers the complete exact known v1 object, including the declared date. Evaluation never uses that date to pass a check. First record has `seriesId=id`, revision1 and both predecessor fields null; an amendment extends the exact current head of that series, pins its exact ID/hash in `previousId`/`previousHash`, keeps its criteria ID/hash and appends. Full validation resolves and verifies every predecessor hash, not just the current head. No orphan, branch, cycle, duplicate ID, skipped revision, reused entry hash with altered content or unreferenced criteria is allowed. Same input may be deliberately recorded in a separate series; hashes do not identify people. Exact replay of a prepared mutation cannot append twice.

`course-file` requires `selected-file`, a nonnull actual byte hash and a safe filename. Saved `course-memory` means `observedRaw` is nonnull actual text representing the exact current validated memory, with no unsaved candidate, and requires that actual source-text hash. An absent/cleared key with valid blank memory is `unsaved-memory` with `rawHash:null`, even if the store snapshot's `unsaved` flag is false. All other valid unsaved course memory also has `rawHash:null`. In-memory origins have `fileName:null`. Protected older saved bytes are a private capture guard, not the raw hash of different unsaved answers. Restoring a selected portfolio input into the course is a separate action; a later snapshot of that mutable course does not invent a historical binding.

Changing the live course or current registry leaves every retained record unchanged. A new criteria evaluation starts a separate series. Histories show which version was recorded, while current partial progress is not called an amendment until the learner explicitly commits one. There are no assessor, signature, accreditation, professional credential, public verification or admission fields.

## Companion state and unfinished form

```ts
interface CourseRawForm {
  name: string;
  capstone: string;
  completedAt: string; //raw dedicated day-action text; may be invalid/unfinished
  lessons: { read: boolean; practice: string; answers: [string, string] }[];
  //Exactly ten. Raw answer strings may be blank/malformed for repair.
}
interface LearningDraft {
  tab: "course" | "portfolio" | "criteria" | "exports" | "recovery";
  recordId: Id | null;
  form: null | {
    kind: "capture" | "amend" | "course";
    targetId: Id | null;
    binding: {
      criteriaId?: string;
      criteriaHash?: string;
      expectedRecordId?: string;
      expectedRecordHash?: string;
      sourceInputHash?: string;
      sourceGeneration?: string;
      sourceObservedRawHash?: string; //literal "missing" for observed null
    };
    fields: {
      criteriaAffirmed?: string; //raw "true"/"false" when valid
      amendmentReason?: string;
    };
    course: CourseRawForm | null;
  };
  dirty: boolean;
}
interface LearningPortfolioState {
  format: "charitology-learning-portfolio";
  version: 1;
  id: Id;
  revision: number;
  createdAt: Instant;
  updatedAt: Instant;
  criteria: CourseCriteria[];
  records: LearningRecord[];
  draft: LearningDraft;
}
```

Draft maps may be partial and raw values malformed for recovery, but unknown names are refused. `capture` allows criteria/source binding fields and `criteriaAffirmed`, with course raw input. `amend` additionally requires current record bindings and amendment reason. `course` allows source bindings and course raw input, no record target/criteria affirmation fields. `CourseRawForm.completedAt` preserves the dedicated day input, including invalid/unsaved strings, without making a routine course save a date action. Null versus absent bindings are not silently filled from current UI state. A restored incomplete form cannot authorize a command. Individual raw strings may reach 16,384; total draft at most 512 KiB. This admits the complete known legacy form under JSON escaping; the actual full 2 MiB backup may still refuse it, in which case plain raw recovery remains available.

Every newly reviewed capture/amend preview starts with a fresh unchecked criteria affirmation. Source memory, file bytes, criteria, amendment target, reload or recovery changes reset that active control to unchecked. A restored raw `criteriaAffirmed:"true"` is retained as recovery text only and never carried into renewed present affirmation or commit options. No preview constructor supplies an affirmative learner action.

Only an exact matching relevant form can clear after a successful command: same kind/target, every required binding and every supplied canonical value. Unrelated, partial, malformed or newer forms remain; no-op/error clears nothing. A capture form saved inside the hashed state can invalidate its earlier state binding. Rebuild/review without treating an old self-referential binding as current authority; explicit discard remains available.

## Pure API and commands

```ts
interface LearningContext {
  expectedStateHash: Hash;
  expectedRevision: number;
  at: Instant;
  makeId(): Id;
  knownCriteria: readonly CourseCriteria[];
  digest?: LearningDigest; //caller wraps Web Crypto bytes as lowercase hex
}
interface CourseSnapshotInput {
  input: CourseState;
  origin: CourseOrigin;
}
type LearningCommand =
  | {
      kind: "record.capture";
      criteriaId: Id;
      criteriaHash: Hash;
      source: CourseSnapshotInput;
      criteriaAffirmed: true;
    }
  | {
      kind: "record.amend";
      criteriaId: Id;
      criteriaHash: Hash;
      expectedRecordId: Id;
      expectedRecordHash: Hash;
      source: CourseSnapshotInput;
      criteriaAffirmed: true;
      reason: string;
    }
  | { kind: "draft.replace"; draft: LearningDraft };
interface PreparedLearningMutation {
  format: "charitology-learning-mutation";
  version: 1;
  commandKind: LearningCommand["kind"];
  expectedStateHash: Hash;
  expectedRevision: number;
  commandHash: Hash;
  candidateHash: Hash;
  candidate: LearningPortfolioState;
  noOp: boolean;
  summary: { message: string; recordId: Id | null };
}
```

Exports from `src/lib/client/learning-portfolio-model.ts`:

```ts
declare function canonicalLearningJson(value: unknown): string;
declare function hashLearningSync(value: unknown): Hash;
declare function hashLearningValue(
  value: unknown,
  digest?: LearningDigest,
): Promise<Hash>;
declare function learningPortfolioStateHash(
  state: LearningPortfolioState,
  digest?: LearningDigest,
): Promise<Hash>;
declare function strictLearningJson(
  raw: string | Uint8Array,
  maxBytes: number,
): unknown;
declare function emptyCourseProgress(): CourseState;
declare function validateCourseProgress(value: unknown): CourseState;
declare function makeCourseProgressExport(input: CourseState): string;
declare function parseCourseProgressExport(
  raw: string | Uint8Array,
  digest?: LearningDigest,
): Promise<{ input: CourseState; rawHash: Hash }>;
declare function validateCourseCriteria(
  value: unknown,
  knownCriteria: readonly CourseCriteria[],
): CourseCriteria;
declare function evaluateCourseProgress(
  input: CourseState,
  criteria: CourseCriteria,
): CourseEvaluation;
declare function blankLearningPortfolio(
  id: Id,
  at: Instant,
): LearningPortfolioState;
declare function validateLearningPortfolio(
  value: unknown,
  knownCriteria: readonly CourseCriteria[],
): LearningPortfolioState;
declare function prepareLearningCommand(
  state: LearningPortfolioState,
  command: LearningCommand,
  context: LearningContext,
): Promise<PreparedLearningMutation>;
declare function learningRecordView(
  state: LearningPortfolioState,
  recordId: Id,
  knownCriteria: readonly CourseCriteria[],
): {
  record: LearningRecord;
  criteria: CourseCriteria;
  currentInSeries: boolean;
  history: LearningRecord[];
};
declare function makeLearningBackup(
  state: LearningPortfolioState,
  exportedAt: Instant,
  knownCriteria: readonly CourseCriteria[],
  digest?: LearningDigest,
): Promise<string>;
declare function parseLearningBackup(
  raw: string | Uint8Array,
  knownCriteria: readonly CourseCriteria[],
  digest?: LearningDigest,
): Promise<LearningPortfolioState>;
type LearningPacketPurpose =
  "personal-study" | "credential-proposal" | "fellowship-planning";
declare function makeLearningPacket(
  state: LearningPortfolioState,
  recordId: Id,
  purpose: LearningPacketPurpose,
  knownCriteria: readonly CourseCriteria[],
  digest?: LearningDigest,
): Promise<{
  json: string;
  markdown: string;
  csv: string;
  packetHash: Hash;
}>;
```

Every async entry point snapshots owned plain inputs before its first await and detects caller mutation afterward, including no-op paths. Returned prepared candidates are deeply frozen. Input typed arrays are defensively copied without trusting subclass hooks. IDs/clocks are caller-supplied; pure code has no DOM/storage/clock/network. `LearningDigest` returns lowercase hexadecimal SHA-256, matching R3/W1; callers wrap the `ArrayBuffer` from Web Crypto. Compare injected results with the pinned synchronous SHA implementation, with UTF-8/multiblock test vectors. A changed digest/function/context reference while queued is an input mutation. There is no new persisted metadata in `CourseState`: generation lives in its adapter. Portfolio state revision is persisted, and both `LearningContext.expectedRevision` and `PreparedLearningMutation.expectedRevision` must equal it. A changing candidate has revision+1; a no-op preserves the exact state/revision.

## Two guarded stores and capture coordination

The two adapter modules own different exact keys. They may share types, but never a lock or mutable in-memory state. All returned states/candidates/previews are deeply frozen. Opaque symbols below express ownership in TypeScript; the implementation also uses private per-store `WeakMap`/`WeakSet` state. A parsed, cloned, foreign-store or consumed preview is rejected even if every visible field/hash is equal.

```ts
interface LearningStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface LearningLocks {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    action: () => Promise<T>,
  ): Promise<T>;
}
type LearningStoreCode =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
interface LearningStoreStatus {
  readonly generation: number;
  readonly observedRaw: string | null | undefined;
  readonly unsaved: boolean;
  readonly blocked: string;
  readonly message: string;
  readonly code: LearningStoreCode;
  readonly readOnly: boolean;
  readonly canWrite: boolean;
  readonly canRecover: boolean;
  readonly canRetryPersist: boolean;
  readonly canUndo: boolean;
}
interface CourseStoreSnapshot extends LearningStoreStatus {
  readonly state: CourseState | null;
  readonly hash: Hash | null;
}
interface LearningStoreSnapshot extends LearningStoreStatus {
  readonly state: LearningPortfolioState | null;
  readonly hash: Hash | null;
}
interface LearningStoreDependencies {
  storage?: LearningStorage;
  locks?: LearningLocks | null;
  cryptoAvailable?: boolean;
  digest?: LearningDigest;
}
interface CourseStoreOptions extends LearningStoreDependencies {
  initialState: CourseState; //must be the exact empty known v1 shape
}
interface LearningStoreOptions extends LearningStoreDependencies {
  initialState: LearningPortfolioState; //exact blank state; actual absent key only
  knownCriteria: readonly CourseCriteria[];
}
interface CourseMutationBinding {
  expectedGeneration: number;
  expectedStateHash: Hash;
}
declare const COURSE_PREPARED_OWNER: unique symbol;
interface PreparedCourseReplacement {
  readonly format: "charitology-course-replacement";
  readonly version: 1;
  readonly action: "replace" | "completion-day";
  readonly expectedGeneration: number;
  readonly expectedStateHash: Hash;
  readonly expectedObservedRawHash: Hash | null; //null means observed absence
  readonly candidate: CourseState;
  readonly candidateHash: Hash;
  readonly noOp: boolean;
  readonly [COURSE_PREPARED_OWNER]: true;
}
declare const COURSE_RECOVERY_OWNER: unique symbol;
interface CourseRecoveryPreview {
  readonly format: "charitology-course-recovery-preview";
  readonly version: 1;
  readonly kind: "restore" | "clear";
  readonly state: CourseState;
  readonly stateHash: Hash;
  readonly expectedGeneration: number;
  readonly expectedStateHash: Hash | null;
  readonly expectedObservedRawHash: Hash | null;
  readonly [COURSE_RECOVERY_OWNER]: true;
}
type CourseRestorePreview = CourseRecoveryPreview & {
  readonly kind: "restore";
};
type CourseClearPreview = CourseRecoveryPreview & { readonly kind: "clear" };
declare const LEARNING_RECOVERY_OWNER: unique symbol;
interface LearningRecoveryPreview {
  readonly format: "charitology-learning-recovery-preview";
  readonly version: 1;
  readonly kind: "restore" | "clear";
  readonly state: LearningPortfolioState;
  readonly stateHash: Hash;
  readonly expectedGeneration: number;
  readonly expectedStateHash: Hash | null;
  readonly expectedRevision: number | null;
  readonly expectedObservedRawHash: Hash | null;
  readonly [LEARNING_RECOVERY_OWNER]: true;
}
type LearningRestorePreview = LearningRecoveryPreview & {
  readonly kind: "restore";
};
type LearningClearPreview = LearningRecoveryPreview & {
  readonly kind: "clear";
};
interface StoreReloadOptions {
  discardUnsaved?: boolean;
}
```

`observedRaw:undefined` means a read failed, not an absent key. It blocks preview/commit recovery until a fresh explicit read succeeds. A corrupt but readable saved value may have no valid state/hash; a replacement preview can bind its exact protected bytes. The visible hash is only a descriptor; private owner state retains the actual string/null and checks exact equality, never hash equality alone. No-op does not create an undo/revision or clear raw forms. Initial options/criteria/dependencies are snapshotted and validated; known criteria definitions cannot be mutated after store creation.

```ts
declare const COURSE_READ_OWNER: unique symbol;
interface CourseCaptureReadBinding {
  readonly format: "charitology-course-capture-read";
  readonly version: 1;
  readonly generation: number;
  readonly stateHash: Hash;
  readonly observedRawHash: Hash | null;
  readonly input: CourseState;
  readonly persistence: "saved" | "unsaved-memory";
  readonly [COURSE_READ_OWNER]: true;
}
interface CourseCaptureReadLease {
  readonly binding: CourseCaptureReadBinding;
  assertCurrent(): void; //sync memory+exact saved-byte check; throws if expired
}
interface CourseProgressStore {
  snapshot(): CourseStoreSnapshot;
  prepareReplace(
    input: CourseState,
    binding: CourseMutationBinding,
  ): Promise<PreparedCourseReplacement>;
  prepareCompletionDay(
    day: LegacyDay,
    binding: CourseMutationBinding,
  ): Promise<PreparedCourseReplacement>;
  commitPrepared(
    prepared: PreparedCourseReplacement,
  ): Promise<CourseStoreSnapshot>;
  retryPersist(): Promise<CourseStoreSnapshot>;
  previewRestore(raw: string | Uint8Array): Promise<CourseRestorePreview>;
  restore(preview: CourseRestorePreview): Promise<CourseStoreSnapshot>;
  previewClear(blank: CourseState): Promise<CourseClearPreview>;
  clear(preview: CourseClearPreview): Promise<CourseStoreSnapshot>;
  undo(): Promise<CourseStoreSnapshot>;
  reload(options?: StoreReloadOptions): Promise<CourseStoreSnapshot>;
  noticeExternalChange(): CourseStoreSnapshot;
  backup(): Promise<string>; //plain unchanged v1 shape, pretty JSON+newline
  rawSavedCopy(): string | null | undefined;
  previewCaptureRead(): Promise<CourseCaptureReadBinding>;
  dispose(): void;
}
declare function createCourseProgressStore(
  options: CourseStoreOptions,
): Promise<CourseProgressStore>;
declare function withCourseCaptureRead<T>(
  store: CourseProgressStore,
  binding: CourseCaptureReadBinding,
  action: (lease: CourseCaptureReadLease) => Promise<T>,
): Promise<T>;
```

The course adapter owns `PreparedCourseReplacement` and all course read/recovery owner maps. `prepareReplace` binds the caller's exact current form-open generation/hash and protects observed saved bytes; `commitPrepared` accepts only the issuing store's unchanged prepared object. It validates the complete future 400,000-byte export before memory assignment. Ordinary `prepareReplace` requires candidate `completedAt` to equal current validated memory and refuses a date change. `prepareCompletionDay` alone changes that field to the supplied real day or empty string; it never reads today's clock or changes other course fields. Load/import/restore preserve supplied source dates exactly through their distinct previewed recovery path. A portfolio record-to-course restoration uses `previewRestore` on the selected v1 bytes, not ordinary `prepareReplace`. Clear requires the exact empty v1 shape and removes the course key after reviewed confirmation. Course operations never append portfolio records.

`previewCaptureRead` runs under the course lock, rereads saved bytes, validates the current course memory/baseline and issues an owned binding. It does not read DOM or write course storage. `withCourseCaptureRead`, exported **only for the learning-store coordinator**, validates that store/binding ownership, consumes the binding on the first accepted invocation, takes the course lock and invokes its action with an expiring lease. It never takes a portfolio lock or performs a course write. The lease's synchronous `assertCurrent` checks generation, input hash and actual saved string/null again; it rejects after the callback finishes. No standalone UI or other store callback may use this coordinator hook, reenter course operations or reverse lock order.

```ts
interface CaptureTarget {
  recordId: Id;
  recordHash: Hash;
}
interface CaptureIntent {
  criteriaId: Id;
  criteriaHash: Hash;
  target: CaptureTarget | null; //null new series; otherwise exact current head
}
interface CaptureReview {
  readonly intent: CaptureIntent;
  readonly source: CourseSnapshotInput;
  readonly inputHash: Hash;
  readonly evaluation: CourseEvaluation;
  readonly expectedGeneration: number; //learning store
  readonly expectedStateHash: Hash;
  readonly expectedRevision: number;
  readonly expectedObservedRawHash: Hash | null;
}
declare const LIVE_CAPTURE_OWNER: unique symbol;
interface LiveCourseCapturePreview extends CaptureReview {
  readonly format: "charitology-live-course-capture";
  readonly version: 1;
  readonly kind: "live";
  readonly course: CourseCaptureReadBinding;
  readonly [LIVE_CAPTURE_OWNER]: true;
}
declare const FILE_CAPTURE_OWNER: unique symbol;
interface FileCourseCapturePreview extends CaptureReview {
  readonly format: "charitology-file-course-capture";
  readonly version: 1;
  readonly kind: "file";
  readonly sourceByteLength: number;
  readonly [FILE_CAPTURE_OWNER]: true;
}
interface CaptureCommitOptions {
  criteriaAffirmed: true;
  reason: string | null; //null new series; required nonempty<=2000 amendment
  at: Instant;
  makeId(): Id;
  assertUiCurrent(): undefined; //sync controller epoch/raw-input check; may throw
}
interface LearningPortfolioStore {
  snapshot(): LearningStoreSnapshot;
  commitPrepared(
    prepared: PreparedLearningMutation,
  ): Promise<LearningStoreSnapshot>;
  retryPersist(): Promise<LearningStoreSnapshot>;
  previewRestore(raw: string | Uint8Array): Promise<LearningRestorePreview>;
  restore(preview: LearningRestorePreview): Promise<LearningStoreSnapshot>;
  previewClear(blank: LearningPortfolioState): Promise<LearningClearPreview>;
  clear(preview: LearningClearPreview): Promise<LearningStoreSnapshot>;
  undo(): Promise<LearningStoreSnapshot>;
  reload(options?: StoreReloadOptions): Promise<LearningStoreSnapshot>;
  noticeExternalChange(): LearningStoreSnapshot;
  backup(exportedAt: Instant): Promise<string>;
  rawSavedCopy(): string | null | undefined;
  previewCourseCapture(
    courseStore: CourseProgressStore,
    intent: CaptureIntent,
  ): Promise<LiveCourseCapturePreview>;
  commitCourseCapture(
    preview: LiveCourseCapturePreview,
    options: CaptureCommitOptions,
  ): Promise<LearningStoreSnapshot>;
  previewFileCapture(
    raw: string | Uint8Array,
    fileName: string,
    intent: CaptureIntent,
  ): Promise<FileCourseCapturePreview>;
  commitFileCapture(
    preview: FileCourseCapturePreview,
    options: CaptureCommitOptions,
  ): Promise<LearningStoreSnapshot>;
  dispose(): void;
}
declare function createLearningPortfolioStore(
  options: LearningStoreOptions,
): Promise<LearningPortfolioStore>;
```

The learning adapter owns both capture preview maps and its already-locked commit function. Its generic public `commitPrepared` accepts **only `draft.replace`** and verifies that no records/criteria/other protected data changed; a forged `commandKind` cannot turn a record append into a draft edit. Record appends/amendments use the opaque capture methods. The pure model remains usable independently for self-recorded tests/exports; a fabricated pure candidate is not a live course-store binding.

`previewCourseCapture` captures only the selected store's current **validated CourseState memory**. It does not apply unsubmitted DOM strings. Valid unsaved memory may exist after a failed course save and is labeled `unsaved-memory`; it is not an assertion that newer DOM work was saved. If the UI raw form differs from current validated memory, the controller requires a separate explicit save/apply first or a deliberately selected file capture. No portfolio action performs a hidden course write.

Preview creation pins the source store object/read binding and exact learning generation/hash/revision/observed saved baseline. It rereads learning saved bytes under its own lock before returning. No two-lock preview is needed: a source change afterward makes the final commit fail. A file preview owns its bounded copied bytes/raw hash and does not read the course key. It cannot be revived by serializing a descriptor, copied to another learning store or substituted with a foreign file under the same name.

On live commit, synchronously snapshot/stamp the preview and commit options before queuing, check issuer/identity and consume that accepted preview. Call `withCourseCaptureRead(courseStore,binding,...)`; inside its course lease, take **only** the learning lock. Recheck the learning baseline, prepare/validate the exact pure candidate and check every input/stamp after awaits. Immediately before append, call `options.assertUiCurrent()` and `lease.assertCurrent()`, then recheck the actual learning saved bytes. The final candidate assignment/storage attempt contains no intervening await or callback. The learning module's private already-locked commit must not call its public locking `commitPrepared`, and the course hook never calls a public course mutator. This is course lock → learning lock, with no reacquisition or reverse edge. File commit uses only the learning lock with the same final UI/baseline checks.

The controller disables course/portfolio editing during this short final commit and supplies a synchronous guard that checks the exact preview epoch. For live capture it also checks current raw-form-versus-validated-course-source equality; for file capture it checks the exact reviewed file/intent and retains unrelated dirty course input. Its successful return must be `undefined`; reject a thenable or any other return, rather than accepting an async guard. It also checks the epoch on return, so any newer programmatic input survives rather than being cleared. A changed/consumed/stale preview requires fresh review, never a blind retry. If the storage attempt fails after valid candidate assignment, that record exists once in unsaved memory; `retryPersist` saves the same candidate without re-preparing or appending another record. A later command invalidates an older retry intent.

Restore/clear previews bind current generation/hash/revision and actual observed saved bytes, including a fresh pre-preview read. All public async methods copy/stamp every caller-supplied object, raw byte sequence, options and callback reference **at invocation before entering a queued lock**, then detect mutation after each await and before assignment, even on no-op paths. Hash equality alone does not excuse a different queued object/owner. Failed reads do not become absent storage. Successful reload clears undo; delayed reload options cannot change an earlier discard choice. A companion record-to-course restore is a distinct course replacement preview and never replays capture or changes the companion. No atomic two-key write is claimed.

## Backups, packets, print and mount

Full wrapper is `{format:"charitology-learning-portfolio-backup",version:1,exportedAt,state,checksum}`. SHA-256 covers every wrapper field except `checksum`, including `exportedAt`. Pretty JSON uses two spaces and one final newline. Validate the **actual future wrapper** before any candidate assignment, not a compact state estimate. Restore recomputes criteria/input/evaluation/entry/full checksums and all reference/head rules; rejects unknown data and never silently repairs history. Complete backup includes all records, full criteria and saved unfinished raw fields; UI states its private scope.

Selected packet is `{format:"charitology-learning-packet",version:1,purpose,criteria,record,limitations:"self-study-v1",checksum}` for exactly one selected record and its complete criteria. Its `record.previousId`/`record.previousHash` retain the exact original predecessor reference as provenance only; the packet omits ancestors. It is deterministic and is **not** a complete workspace backup or a course/partner import. Never imply that omitted ancestors can be reconstructed. Packet hash covers the complete packet except its checksum. CSV neutralizes formula prefixes before quoting; Markdown fences user text safely and does not execute HTML. Every print/download shows criteria ID/hash, input hash, capture instant, self-reported/unknown date distinction and unconditional nonaccredited/unverified limitations. Filename, ID, SHA or timestamp never supplies a signature, assessor or submission receipt.

```ts
interface LearningMountProps {
  criteriaRegistry: CriteriaRegistry;
  currentCriteria: CourseCriteria;
  knownCriteria: readonly CourseCriteria[];
  mode: "course" | "completion";
  base: string;
}
declare function mountLearningPortfolio(root: HTMLElement): Promise<void>;
```

`LearningPortfolio.astro` receives `LearningMountProps` from the server adapter. Initial artifacts contain no learner records. `mountLearningPortfolio` consumes only the serialized exact known criteria and scoped UI; no private input goes to a route/query/fragment. Course/current completion wrappers mount one shared controller using the existing final progress key. Current checks and archived portfolio views are visibly distinct. Render archived chapter source/user text inertly. Existing current textbook links and private reading notes remain separate.

Controller guarantees: capture exact bindings when a form opens; retain invalid raw input through parse/validation/quota errors; explicitly review replacement/discard; epoch-check late work; preserve a newer form after older completion; no-op retains work; unsupported saving does not claim success; plain raw recovery remains possible at whole-backup pressure. Exports of current DOM work validate a separate candidate and do not silently save it. No assessor UI or automatic fellowship/credential write belongs in this contract.

## Test and release evidence

Pure checker, actual-key stores, mounted UI, criteria/current-source checker and strict type checker run independently, then aggregate build/check. Excluded synthetic fixtures cover alternate curricula, learners, concurrency and impossible histories. Known max-shape v1 source, exact 2 MiB/+1 full backups and malformed queued inputs are actual-module tests. Browser/download/print evidence is recorded separately with exact code/assets; tests do not prove learner outcomes, independent review or accreditation. No completed learner or reviewer is seeded publicly.
