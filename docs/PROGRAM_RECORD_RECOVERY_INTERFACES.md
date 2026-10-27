# Program record recovery interfaces

Pre-implementation contract · October 27, 2026 · AI-assisted · engineering review: accepted. Read the [plan](PROGRAM_RECORD_RECOVERY_PLAN.md). These are frozen implementation interfaces, not a claim that the async engine exists. The separate context-form privacy correction merged in PR #23. The root implementation agent accepted the capacities and interfaces before runtime implementation; commit history records that boundary. This is engineering review, not human or institutional validation.

## Fixed keys and native data

The production schema module is inert and imports existing models only as types. It must not import storage-bearing helpers. All six keys are final full localStorage keys and exact Web Lock names. No caller supplies a validator, serializer, prefix, alternate key or default. Null is invalid as a saved value for every key; absent storage is a different state.

```ts
import type { ProgramState } from "../src/lib/client/program-workspaces";
import type { Workspace } from "../src/lib/client/charity-os";

type PRProgram =
  | "university-chapters"
  | "local-charitology"
  | "time-charitology"
  | "corporate-program"
  | "policy-program";
type PRProgramKey = `charitology.program-workspace-v1.${PRProgram}`;
type PRKey = PRProgramKey | "charitology.charity-os";
type PRHash = string; //64 lowercase SHA-256 hexadecimal characters

type PRValueMap = { [K in PRProgramKey]: ProgramState } & {
  "charitology.charity-os": Workspace;
};
interface PROsEnvelope {
  format: "charitology.charity-os";
  version: 1;
  exportedAt: string;
  workspace: Workspace;
}
type PRNative<K extends PRKey> = K extends "charitology.charity-os"
  ? PROsEnvelope
  : ProgramState;
type PRReadonly<T> = T extends readonly (infer E)[]
  ? readonly PRReadonly<E>[]
  : T extends object
    ? { readonly [P in keyof T]: PRReadonly<T[P]> }
    : T;

type PRCode =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
type PRErrorCode =
  | PRCode
  | "invalid_data"
  | "input_limit"
  | "input_changed"
  | "stale_view"
  | "superseded"
  | "foreign_owner"
  | "used_authority"
  | "discard_required"
  | "pending_operation"
  | "reentrant_call";
interface PRRecordError extends Error {
  readonly code: PRErrorCode;
  readonly path: string | null;
}
type PRCurrent<T> =
  | { readonly hasCurrent: false; readonly value: null; readonly hash: null }
  | {
      readonly hasCurrent: true;
      readonly value: PRReadonly<T>;
      readonly hash: PRHash;
    };
type PRSnapshot<K extends PRKey> = Readonly<
  PRCurrent<PRValueMap[K]> & {
    key: K;
    generation: number;
    observedRaw: string | null | undefined;
    persistence: "saved" | "absent" | "unsaved-memory" | "unreadable";
    code: PRCode;
    message: string;
    unsaved: boolean;
    pendingOperation: "set" | "remove" | null;
    hasUndo: boolean;
    canWrite: boolean;
    canRecover: boolean;
    canRetryPersist: boolean;
  }
>;
declare const PROGRAM_RECORD_LIMITS: Readonly<{
  nativeBackupBytes: 8_000_000;
  osCompactWorkspaceBytes: 4_500_000;
  rawArchiveBytes: 64_000_000;
  formArchiveBytes: 524_288;
  jsonDepth: 32;
  fileReadTimeoutMs: 30_000;
  pendingFullReplacements: 1;
}>;
```

`observedRaw:undefined` means reading failed, `null` means proven absent, and `""` is a readable corrupt empty string. No failed read becomes absence. An absent key gets the real valid empty default in memory with `persistence:'absent'`, without a write; it does not say Saved. Initial corrupt/unreadable data has `hasCurrent:false`, so callers cannot render an apparent successfully loaded blank. Retained valid memory after a later failed read remains exportable and labeled unsaved memory.

The exact general/OS schema, field/count/date/reference rules and historical boundary are in the plan. The fixed registry explicitly pins version-1 field names/options/defaults and producer limits. Unknown fields, unknown versions, duplicate IDs/JSON keys and noncanonical identity/date/enum spellings are protected, not dropped or repaired. Retained free text is not trimmed. Validate numeric strings through a read-only trimmed copy and retain their exact original string; finite stored numeric values remain numbers. No data format or ID migration is implicit.

General `ProgramState.program` must match its key. Program IDs are unique across that desk's collections; OS IDs are unique per collection, and project references resolve exactly. Distinct OS collections may contain the same ID. Production defaults have no random IDs or clock side effects. Sample generation is a separate explicit fictional action.

## Owned view and unfinished forms

The tracker is the final synchronous authority for DOM intent. It contains no callbacks or DOM references. Each tool owns one tracker and one session. The engine's private WeakMaps enforce that pairing; a structural clone or a same-key tracker from another session is not equivalent authority. `changedForm` runs before starting any async work from an edit. `changedView` revokes pending authority for source choice/cancel/reload/navigation without falsely marking a record form dirty.

```ts
type PRCollection =
  | "sessions"
  | "roles"
  | "tasks"
  | "needs"
  | "activities"
  | "questions"
  | "logs"
  | "scenarios"
  | "options"
  | "evidence"
  | "equity";
type PROsKind = "projects" | "grants" | "tasks" | "outcomes";
type PRFormId = "context" | `collection:${PRCollection}` | `editor:${PROsKind}`;
declare const prViewToken: unique symbol;
interface PRViewToken {
  readonly [prViewToken]: true;
  readonly generation: number;
}
interface PRViewTracker {
  readonly key: PRKey;
  changedForm(form: PRFormId): void;
  changedView(): void;
  capture(): PRViewToken;
  isCurrent(token: PRViewToken): boolean;
  markClean(form: PRFormId, token: PRViewToken): boolean;
  snapshot(): Readonly<{
    generation: number;
    dirtyForms: readonly PRFormId[];
  }>;
  dispose(): void;
}
declare function createProgramRecordView(key: PRKey): PRViewTracker;
interface PRRawForm {
  readonly form: PRFormId;
  readonly editingId: string | null;
  readonly values: Readonly<Record<string, string>>;
}
interface PRFormArchive {
  readonly format: "charitology-program-record-forms";
  readonly version: 1;
  readonly key: PRKey;
  readonly exportedAt: string;
  readonly forms: readonly PRRawForm[];
}
```

Only the forms/field keys actually belonging to the selected key are admitted. A general desk has context plus one editor per configured collection; OS has context and at most one currently open record editor. This archive preserves invalid raw input strings, record editing IDs and form identity. It is not a native record backup and cannot be passed to native restore. Search/filter state and transient confirmation choices confer no saved-record authority.

`markClean` succeeds only for its own still-current token and the named form; it cannot clear a newer edit or another form's dirty status. On `dispose`, all tokens/captures/previews become invalid. Initial/read-only/corrupt UI may still offer a raw-form archive if there are actual local controls, without inventing loaded records.

## Captured saves, one-use previews and session

The engine exports the following closed facade from `src/lib/client/program-record-recovery.ts`. Internal generic-cell factories are excluded test seams, never application imports. There is no public `exclusive` callback, transaction callback, storage accessor or method that reacquires a held same-key lock.

```ts
declare const prCapture: unique symbol;
declare const prRestore: unique symbol;
declare const prRemove: unique symbol;
interface PRCapturedSave<K extends PRKey> {
  readonly [prCapture]: true;
  readonly key: K;
  readonly view: PRViewToken;
  readonly form: PRFormId | null;
}
interface PRPreviewSummary {
  readonly title: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly replacesCurrent: true;
  readonly discardsLocal: boolean;
}
interface PRRestorePreview<K extends PRKey> {
  readonly [prRestore]: true;
  readonly key: K;
  readonly kind: "restore" | "example" | "replace";
  readonly view: PRViewToken;
  readonly reviewHash: PRHash;
  readonly summary: PRPreviewSummary;
}
interface PRRemovePreview<K extends PRKey> {
  readonly [prRemove]: true;
  readonly key: K;
  readonly kind: "remove";
  readonly view: PRViewToken;
  readonly reviewHash: PRHash;
  readonly summary: PRPreviewSummary;
}
interface PRWriteResult<K extends PRKey> {
  readonly outcome: "saved" | "no-op" | "unsaved" | "superseded";
  readonly snapshot: PRSnapshot<K>;
  readonly viewCurrent: boolean;
}
interface PRNativeExport {
  readonly text: string;
  readonly persistence: PRSnapshot<PRKey>["persistence"];
  readonly unfinishedFormsIncluded: false;
}
interface PRRawSavedCopy {
  readonly copy: "protected" | "observed";
  readonly raw: string;
}
interface PRSession<K extends PRKey> {
  readonly key: K;
  snapshot(): PRSnapshot<K>;
  captureSave(
    value: PRValueMap[K],
    options: { at: string; form: PRFormId | null },
  ): PRCapturedSave<K>;
  saveCaptured(captured: PRCapturedSave<K>): Promise<PRWriteResult<K>>;
  retryPersist(): Promise<PRWriteResult<K>>;
  previewRestore(
    raw: string | Uint8Array,
    options: { discardLocal: boolean },
  ): Promise<PRRestorePreview<K>>;
  previewReplace(
    value: PRValueMap[K],
    options: {
      kind: "example" | "replace";
      at: string;
      discardLocal: boolean;
    },
  ): Promise<PRRestorePreview<K>>;
  applyRestore(preview: PRRestorePreview<K>): Promise<PRWriteResult<K>>;
  previewRemove(options: {
    discardLocal: boolean;
  }): Promise<PRRemovePreview<K>>;
  applyRemove(preview: PRRemovePreview<K>): Promise<PRWriteResult<K>>;
  undo(options: { discardLocal: boolean }): Promise<PRWriteResult<K>>;
  reload(options: { discardLocal: boolean }): Promise<PRSnapshot<K>>;
  noticeExternalChange(): Promise<PRSnapshot<K>>;
  exportNative(options: { at: string }): PRNativeExport;
  rawSavedCopy(copy: "protected" | "observed"): PRRawSavedCopy | null;
  dispose(): void;
}
declare function openProgramRecordSession<K extends PRKey>(
  key: K,
  options: { view: PRViewTracker },
): Promise<PRSession<K>>;
```

### Exact operation rules

- **Entry capture:** captureSave synchronously clones/adopts the complete candidate, options and current view token before any await. Plain own data only; descriptor checks refuse accessors and unsupported prototypes and never call custom conversion/array methods. Strict JSON/byte admission is plain by construction. Standard browser JavaScript cannot detect a transparent Proxy without possible reflection traps, so live-object entry cannot claim trap-free Proxy detection. Copy/admission occurs before queueing; final guards use only owned data, never original callbacks. Validate schema and exact whole-backup capacity before changing memory. If digest/validation is asynchronous, recheck the captured state generation after its final await. All method options are exact closed objects; capture their primitive fields before queueing.
- **Clock:** `at` is a valid canonical UTC millisecond instant from the caller's captured action clock. For an ordinary changed general save, the engine alone sets `updated=at`; caller's original `updated` must equal current memory's value. It sets OS envelope `exportedAt=at` once. Real semantic change or explicit absent-key Save creates this captured timestamp; retry reuses it. An existing saved same-content no-op keeps its timestamp. Restore retains the admitted native timestamp; it never relabels historical data as freshly created. Empty defaults have no historical timestamp, and an OS default export may use the explicit export action's `at` without saving it.
- **No-op:** only a readable persisted equal logical value with `persistence:'saved'`, no pending intent and `unsaved:false` can yield `no-op`. Compare semantic general content without its engine-managed `updated`, or OS workspace content without envelope `exportedAt`; all other fields remain exact. An absent equal fallback must attempt persistence; a failed-memory equal capture is refused as pending, not declared Saved.
- **Queue:** one running full replacement and one unstarted slot per session. Superseding the unstarted capture immediately releases its value reference and resolves that save as superseded. A single pump consumes slots; never append one candidate-holding closure per event. A running capture may finish only if memory/view/disk guards still pass.
- **Lock and final checks:** lock name is exactly the final key. Re-read exact disk presence/string under lock, then recheck memory hash, session generation, view token and the owned async-source generation immediately after the last disk read and before assignment/write. No callback under lock. Web Locks cover cooperating updated clients; arbitrary older/direct writers remain outside this guarantee.
- **Failure:** retain the exact failed set/remove candidate, timestamp, presence operation and valid current memory. Mark unsaved; provide native export if a valid current value exists. A pending failure refuses a new normal save so it cannot silently replace the only retry candidate. Retry reuses the captured candidate, never reruns a command or advances clock. A foreign disk change blocks retry and keeps that desired candidate exportable.
- **Restore/remove:** private owner, source bytes, payload/native hash, preview kind, exact key, exact observed presence/string, current memory hash, session generation and view token are all bound. Visible summary/reviewHash are not authority. Brand copying or forging a matching plain object fails. Preview and Apply never discover keys. Apply consumes only that preview and does not read a file again. No-op still validates ownership/generation. Successful recovery establishes a new baseline only after the exact under-lock check.
- **File generations:** every new file input event invalidates earlier preview/read authority before checking whether a file exists, is oversized or parses. Cancel/source change/clear/undo/reload/save/external notice/dispose also revoke earlier work at entry. Deadline expiry and stale completion return without reopening a preview. The controller owns detached file bytes; source mutation cannot retarget a queued operation.
- **Dirty state:** `discardLocal:false` refuses operations that would discard dirty forms or pending/meaningful unsaved memory. `true` is explicit permission for the captured local version only; newer edits still revoke it. Downloading alone never changes this permission. Post-await DOM resets use still-current view tokens. A successful record/library action does not clean unrelated forms.
- **Clear:** applyRemove removes only its one selected key; memory becomes the valid empty default with persistence absent. A valid empty saved object remains distinct. No remove-all, blank sentinel, journal, hidden backup key or automatic sample is allowed.
- **Undo:** one previous valid model/presence, owned by the exact loaded baseline. Explicit discard may undo failed set/remove memory under all recovery checks; ordinary `requireWrite` cannot strand an enabled Undo behind a pending flag. A failed undo retains the candidate and useful prior recovery; retry does not replay Undo or toggle a second time. New ordinary mutation replaces the one-level Undo only after candidate admission.
- **Reload:** capture options/generation before awaiting. Adopt only a successfully read and validated saved value or proven absence. Corrupt/read-denied reload preserves valid memory, pending desired export, forms and protected raw A; it does not claim Loaded. Pending retry becomes unavailable if a newly observed baseline differs. Do not clear pending just because a reload button was clicked.
- **Recovery copies:** retain first protected corrupt raw A separately from current observed B. First unseen B always warns before preview authority, even if already blocked/corrupt; a second fresh explicit review may bind B. B→C warns again. Never discard A because B appeared. RawSavedCopy returns empty raw string as an object, not falsy absence. Read denial does not invent raw bytes.
- **Capabilities:** missing Web Locks/required hash capability is read-only, not optimistic fallback. Loading/export of valid data and raw-copy recovery may still work. Constructor-only internal notifications run after locks release; notification errors do not roll back or mislabel an actual write. No injected application callback can authorize a final guard.

## Pure schema and format seam

`program-record-recovery-schemas.ts` owns exact fixed-key admission and defaults. `program-record-recovery-formats.ts` owns bounded JSON/native/raw/form archives. The engine owns digesting and storage. The pure modules do not import stores/DOM and do not allocate IDs or use a clock. The frozen schema table and actual current config must agree in tests; all production admission uses that table.

```ts
declare function validateProgramRecordValue<K extends PRKey>(
  key: K,
  input: unknown,
): PRReadonly<PRValueMap[K]>;
declare function defaultProgramRecordValue<K extends PRKey>(
  key: K,
): PRReadonly<PRValueMap[K]>;
declare function strictProgramRecordJson(
  raw: string | Uint8Array,
  maxBytes: number,
): unknown;
declare function parseProgramRecordBackup<K extends PRKey>(
  raw: string | Uint8Array,
  key: K,
): PRReadonly<PRNative<K>>;
declare function programRecordBackup<K extends PRKey>(
  key: K,
  native: PRNative<K>,
): string;
interface PRRawArchive {
  readonly format: "charitology-program-record-raw-copy";
  readonly version: 1;
  readonly key: PRKey;
  readonly copy: "protected" | "observed";
  readonly raw: string;
}
declare function programRecordRawArchive(input: PRRawArchive): string;
declare function parseProgramRecordRawArchive(
  raw: string | Uint8Array,
): PRRawArchive;
declare function programRecordFormArchive(input: PRFormArchive): string;
declare function parseProgramRecordFormArchive(
  raw: string | Uint8Array,
): PRFormArchive;
```

Native backup serializer preserves existing two-space/no-terminal-newline convention; exact whole bytes are checked before return. It accepts the complete appropriate native envelope only, never a raw-copy/form archive or a generic shape. Whole size wins over count/field maxima. The OS compact 4,500,000-byte model check is additional. Strict byte admission occurs before JSON traversal or source hashing. Raw input parsers reject wrong keys/versions and decode bytes fatally; no replacement decoding or `.trim()` of input. Raw archive serializes the raw string as JSON so unpaired UTF-16 code units round-trip. A 64,000,000-byte raw wrapper does not imply arbitrary large saved values are valid records.

The form archive's permitted keys match real controls; each value is raw text with any explicitly declared maxlength, not a coerced valid number or a guessed zero. OS editor number/date/select fields without maxlength are bounded by the whole 524,288-byte wrapper only. They are never truncated to an invented field limit. A failed archive generation leaves DOM untouched. A UI may offer plain raw text for out-of-contract controls, clearly separate from this structured archive. Native records, unsubmitted forms and original raw saved copies are three different downloads.

## Controls and caller integration

Controls live in `program-record-recovery-controls.ts`. UI callbacks run outside locks, not during validation or final write checks. They are constructor-bound notification/read seams, not authority. No callback is accepted by a later command. A caller owns explicit input generations and must not silently clear them on an error/no-op. The facade's private binding helper is imported only by controls and static checks, never tool components.

```ts
interface PRRecoveryControls {
  noteViewMutation(): void;
  refresh(): void;
  dispose(): void;
}
interface PRRecoveryControlsOptions<K extends PRKey> {
  host: HTMLElement;
  session: PRSession<K>;
  view: PRViewTracker;
  readForms: () => readonly PRRawForm[];
  onAdopt: (snapshot: PRSnapshot<K>, view: PRViewToken) => void;
  onStatus?: (snapshot: PRSnapshot<K>) => void;
}
declare function mountProgramRecordRecoveryControls<K extends PRKey>(
  options: PRRecoveryControlsOptions<K>,
): PRRecoveryControls;
/** Internal controls-only owner/tracker WeakMap check; no application imports. */
declare function assertProgramRecordControlBinding<K extends PRKey>(
  session: PRSession<K>,
  view: PRViewTracker,
): void;
```

`noteViewMutation` revokes the controls' transient file/read/preview authority, after the caller updates its tracker. It does not mark a form clean or double-increment its form generation. `refresh` renders current status only and revokes nothing. Call it after awaited tool saves/deletes so Retry/backup labels reflect the result. `onAdopt` is notified only after an actual successful recovery/reload with its still-current token; caller must check that token before rerender/reset. Notification failure cannot undo saved data; expose a retry-render notice. Preview metadata is text-rendered; no HTML/source execution.

Actual caller integration exposed a notification gap after exact Retry and failed replacement. The accepted constructor-only optional `onStatus` refinement reports the current immutable snapshot after controls refresh, outside engine operations/locks. It may update cached validated records, derived lists and capability/status labels; it must retain every unfinished context/editor field. Only successful `onAdopt` with its current token permits form reset. Notification errors cannot mislabel or roll back writes; nested refresh notification is guarded. Initial notification is synchronous during mounting, so it cannot rely on an unassigned controls handle. This callback conveys no save, discard or preview authority and is never accepted by a later command.

All private forms are disabled/intercepted before async opening. General fields are dynamically created after interception; the existing local OS static context fieldset remains default-disabled and enables only after local interception/readiness. An error path never enables a private native GET submission. Record editor controls are likewise attached to intercepted forms before being made usable. The large recovery implementation does not weaken the separately tested privacy fix.

The following complete example awaits real save results and keeps newer or failed form text. It uses the existing type-only producer type, not a fake runtime declaration. All declarations and this example must compile together under strict ES2022/DOM.

```ts
async function exampleGeneralContextSave(
  form: HTMLFormElement,
  host: HTMLElement,
  rawForms: () => readonly PRRawForm[],
  onStatus: (text: string) => void,
): Promise<void> {
  const key = "charitology.program-workspace-v1.university-chapters" as const;
  const view = createProgramRecordView(key);
  form.addEventListener("submit", (event) => event.preventDefault());
  const session = await openProgramRecordSession(key, { view });
  const controls = mountProgramRecordRecoveryControls({
    host,
    session,
    view,
    readForms: rawForms,
    onAdopt: (next, token) => {
      if (view.isCurrent(token) && next.hasCurrent)
        onStatus("Reviewed workspace loaded; render its records now.");
    },
  });
  form.addEventListener("input", () => {
    view.changedForm("context");
    controls.noteViewMutation();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save().catch((error: unknown) => {
      onStatus(error instanceof Error ? error.message : "Save was refused.");
      controls.refresh();
    });
  });
  async function save(): Promise<void> {
    const current = session.snapshot();
    if (!current.hasCurrent) {
      onStatus("Recover the saved copy before editing records.");
      return;
    }
    // Real integration reads every named context field and validates the complete
    // candidate. This example changes one free-text value without coercion.
    const name = form.elements.namedItem("name");
    if (!(name instanceof HTMLInputElement)) throw new Error("Missing name.");
    const next = structuredClone(current.value) as ProgramState;
    next.context.name = name.value;
    const capture = session.captureSave(next, {
      at: new Date().toISOString(),
      form: "context",
    });
    const result = await session.saveCaptured(capture);
    controls.refresh();
    if (result.outcome === "saved" || result.outcome === "no-op") {
      onStatus("Saved in this browser.");
      if (view.isCurrent(capture.view)) view.markClean("context", capture.view);
      // Any reset/close also requires that exact still-current token.
    } else if (result.outcome === "unsaved") {
      onStatus(
        "Kept on this page; saving failed. Export or retry this candidate.",
      );
    } else
      onStatus("A newer queued save replaced this request; form retained.");
  }
}
```

The real six callers must also handle initialization disposal and no-write capability; this example is a save seam, not a full lifecycle implementation. Delete, sample, clear, undo, file import and reload require the same awaited-result and generation checks. No remaining synchronous `saveWorkspace` or direct `store.save` bypass is allowed in the two integrated components. Pure calculation/export helpers and external shared-OS migration keep their separate existing contracts.

## Required executable checks

- Strict-compile these six blocks with actual producer type imports. No declaration shims for missing exports during implementation.
- Actual fixed-key default/empty/sample/native round-trip for all five real configs and OS; current enums, optional blanks, IDs/reference scopes, null/zero/signed outcomes, text escaping and metadata preserved. Unknown fields protect rather than disappear. No probe or other-key operation.
- Construct a valid whole native general export at exactly 8,000,000 bytes and +1; exercise save, native export, file parse and restore. Check OS compact and whole limits independently. Raw/form whole limits and escaped Unicode have separate exact proofs.
- Actual key cell: two shared-lock contenders, absent-equal explicit save, failed-equal retry refusal, corrupt A→unseen B→C, read denial, failed reload preserving desired intent, saved empty versus remove, failed remove→explicit undo, one running/one pending retained-candidate bound.
- Owned authority: foreign session/tracker, forged/mutated preview, double Apply, caller/options mutation after synchronous capture (owned original stays unchanged), last-read view/session invalidation, stale no-op, queued reload-discard change, and source bytes mutated during digest. Stale/foreign authority refuses without changing disk or newer DOM; later mutation of a detached original cannot retarget the owned operation and need not make it fail.
- Mounted actual SSR/inline integration: reproduce the eight audited failures; successful and failed saves preserve newer context/editor text; project deletion keeps linked records explicitly unlinked; import A→invalid B/cancel/late result cannot reuse old authority; failed export/reload never claims success.
- Keep separate real-browser acceptance: own fictional keys/two tabs/file chooser, native keyboard/320/390 palettes; generated bytes are distinct from operating-system download proof. CI/build/publication remain pending until recorded for the final exact head.

Implementation capability refinements following frozen `c644548`: direct candidate/options are synchronously detached before queueing, so final guards use owned data rather than inspecting live caller objects under lock. Original mutation cannot retarget that candidate; mutable file/read completion and DOM/session/view generations still revoke authority. Browser Proxy reflection and absent OS control maxlength are bounded as stated above; native v1 schemas and capacities are unchanged.

## Accepted caller refinements after integration review

Native single-line/URL controls can sanitize admitted source strings. Each untouched field retains an owned original/post-assignment-display pair for native Save candidates; its first explicit input/change revokes substitution, even when the exposed value is unchanged or returns to that display. Raw-form recovery always records literal exposed control strings. Status and exact Retry do not reset fields or make an edited field pristine.

A new row retained by an actual save result keeps its captured ID with that same unfinished editor through failure, newer typing, Retry and resubmission. Pre-admission refusal does not install a dangling ID. Cancel/reopening/adoption advances editor identity so a late result cannot retarget another editor. A successful current-form reset releases the identity. These rules refine the caller boundary; keys, native schemas, queue and write authority remain unchanged.
