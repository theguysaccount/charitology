# Remaining record recovery interfaces

Pre-implementation proposal · October 27, 2026 · AI-assisted · engineering review: accepted for implementation. Read the [plan](REMAINING_RECORDS_RECOVERY_PLAN.md). These are proposed implementation interfaces and exact compatibility definitions. They do not claim the twenty-key engine exists. Freeze this contract before runtime work; later changes need explicit coordinating-agent review. No human or institutional review is claimed.

## Closed keys and native values

New inert modules are `src/lib/client/remaining-record-recovery-schemas.ts` and `remaining-record-recovery-formats.ts`; the closed engine facade is `remaining-record-recovery.ts`, and DOM/file/autosave controls are `remaining-record-recovery-controls.ts`. No released engine registry is extended. Producer imports below are type-only. The schema may read the existing inert frozen partner adapter descriptors, but not a graph/store/controller or current arbitrary caller configuration. Field validation uses this frozen semantic inventory and golden compatibility checks.

All twenty strings are final full keys and Web Lock names. No caller supplies a prefix, validator, serializer, default, alternate key or key-discovery callback. Null is invalid saved data for every key. A readable absent key is a separate state. Every family uses its original native value directly, without a new envelope.

```ts
import type { ResearchState } from "../src/lib/client/research-programs";
import type { ProgramState } from "../src/lib/client/program-workspaces";
import type { DepthSample, Nomination } from "../src/lib/client/completion-models";

type RRResearchProgram =
  | "moral-frameworks-program"
  | "methods-lab"
  | "cause-census"
  | "evidence-reviews"
  | "replication-program"
  | "failure-lab"
  | "history-of-charity";
type RRPartnerProgram =
  | "the-charitology-fund"
  | "charity-incubator"
  | "question-bounties"
  | "the-charitology-prize"
  | "charitology-fellowship"
  | "charitology-summit"
  | "donor-advisory"
  | "nonprofit-advisory"
  | "field-verification";
type RRResearchKey = `charitology.research-program.${RRResearchProgram}.v1`;
type RRPartnerKey = `charitology.partner-workspace-v1.${RRPartnerProgram}`;
type RROtherKey =
  | "charitology-manuscript-v1"
  | "charitology-nominations-v1"
  | "charitology-depth-census-v1"
  | "charitology-country-notes-v1";
type RRKey = RRResearchKey | RRPartnerKey | RROtherKey;
type RRHash = string; //64 lowercase hexadecimal SHA-256 characters

type RRManuscriptField =
  | "title" | "author" | "summary" | "kind" | "question"
  | "methods" | "results" | "limits" | "sources";
type RRManuscript = Record<RRManuscriptField, string>;
type RRCountryNotes = Record<string, {
  voices: string;
  institutions: string;
  gaps: string;
}>; //Runtime restricts own keys to the exact 217 codes listed below.
type RRValueMap = { [K in RRResearchKey]: ResearchState } &
  { [K in RRPartnerKey]: ProgramState } & {
    "charitology-manuscript-v1": RRManuscript;
    "charitology-nominations-v1": Nomination[];
    "charitology-depth-census-v1": DepthSample;
    "charitology-country-notes-v1": RRCountryNotes;
  };
type RRNative<K extends RRKey> = RRValueMap[K];
type RRReadonly<T> = T extends readonly (infer E)[]
  ? readonly RRReadonly<E>[]
  : T extends object ? { readonly [P in keyof T]: RRReadonly<T[P]> } : T;
type RRCode = "ready" | "read-only" | "corrupt" | "conflict" | "unavailable" | "disposed";
type RRFailureCode =
  | "invalid_data" | "input_limit" | "unavailable"
  | "stale_view" | "foreign_owner" | "used_preview" | "superseded"
  | "conflict" | "unsaved_intent" | "discard_required" | "disposed";
interface RRRecordError extends Error {
  readonly code: RRFailureCode;
  readonly path?: string;
}
type RRCurrent<T> =
  | { readonly hasCurrent: true; readonly value: RRReadonly<T> }
  | { readonly hasCurrent: false; readonly value: null };
type RRSnapshot<K extends RRKey> = Readonly<
  RRCurrent<RRValueMap[K]> & {
    key: K;
    code: RRCode;
    message: string;
    persistence: "absent" | "saved" | "unsaved" | "unavailable";
    observedPresence: "present" | "absent" | "unreadable";
    pendingPersist: boolean;
    canWrite: boolean;
    canUndo: boolean;
    hasProtectedRaw: boolean;
    hasObservedRaw: boolean;
    generation: number;
  }
>;
```

TypeScript's broad existing `ResearchState`/`ProgramState` types are not permission to add arbitrary programs/fields. Runtime admission fixes each key to its matching program and exact schema. `Nomination` has a producer index signature; runtime admission still allows only its ID and ten declared fields. Country's `Record<string,...>` remains convenient for existing callers; runtime rejects unknown codes.

## Defaults, schema and bounded formats

`validateRemainingRecordValue` and `defaultRemainingRecordValue` are pure: no DOM, localStorage, key discovery, clock, random ID or custom caller validator. Accept owned plain JSON-compatible data only, preserving accepted strings, own-field insertion order and array order. Detach before queueing. Do not invoke getters, `toJSON`, custom iterators, caller array methods or application callbacks. Descriptor inspection can itself trigger a transparent Proxy; do not promise impossible trap-free Proxy detection. Reject accessors, unsupported prototypes, cycles, sparse/decorated arrays, unknown/symbol fields, nonfinite numbers and future formats. Plain inert frozen data remains acceptable.

Strict raw parsing counts exact UTF-8 bytes before parsing/traversal/hashing; rejects BOM, invalid UTF-8, duplicate decoded keys and depth above 32. No input trimming or replacement decoding. An escaped lone UTF-16 surrogate round-trips as native JSON; an unrepresentable raw string input is refused before lossy encoding. Byte arrays must be genuine ordinary fixed ArrayBuffer-backed Uint8Arrays: detach with native built-ins; reject shared/resizable/proxy/subclass/custom-prototype substitutes. Public native serializer checks complete pretty bytes and does not append a newline. Saved compact bytes also fit the same native bound. A caller cannot pass a raw/form archive as a native object.

```ts
interface RRCapacity {
  readonly nativeBytes: number;
  readonly rawArchiveBytes: 128000000;
  readonly formArchiveBytes: 1000000;
  readonly jsonDepth: 32;
  readonly fileReadTimeoutMs: 30000;
  readonly autosaveDelayMs: 250;
}
declare function remainingRecordCapacity(key: RRKey): RRCapacity;
declare function validateRemainingRecordValue<K extends RRKey>(
  key: K, input: unknown,
): RRReadonly<RRValueMap[K]>;
declare function defaultRemainingRecordValue<K extends RRKey>(
  key: K,
): RRReadonly<RRValueMap[K]>;
declare function strictRemainingRecordJson(
  raw: string | Uint8Array, maxBytes: number,
): unknown;
declare function parseRemainingRecordBackup<K extends RRKey>(
  raw: string | Uint8Array, key: K,
): RRReadonly<RRNative<K>>;
declare function remainingRecordBackup<K extends RRKey>(
  key: K, native: RRNative<K> | RRReadonly<RRNative<K>>,
): string;
interface RRRawArchive {
  readonly format: "charitology-remaining-record-raw-copy";
  readonly version: 1;
  readonly key: RRKey;
  readonly copy: "protected" | "observed";
  readonly raw: string;
}
declare function remainingRecordRawArchive(input: RRRawArchive): string;
declare function parseRemainingRecordRawArchive(
  raw: string | Uint8Array,
): RRRawArchive;
```

Native capacities are research 32,000,000; manuscript 1,000,000; nominations 24,000,000; Depth 32,000,000; country 48,000,000; partner 8,000,000. The whole bound wins. Partner native capacity keeps the existing `max(0,24-updated.length)` timestamp reservation when serializing a blank/short timestamp. No reservation is needed for another family. Initial/read-only load may export an admitted native value; an over-cap saved value is protected raw, not adopted as writable memory. Raw archive is its own 128 MB whole bound and cannot promise every malformed original fits. Its raw string preserves exact original UTF-16 code units and distinguishes empty raw string from absence. Read denial has no invented raw copy.

Defaults: research `{version:1,program,records:[],draft:{},editing:null}`; manuscript all fields empty except `kind:"Proposed method"`; nominations `[]`; Depth `{currency:"USD",rows:[]}`; country `{}`; partner `{version:1,program,updated:"",context:<all frozen default strings>,records:<all configured empty arrays>}`. Creating any default does not write a key or create sample data. Partner default strings are the frozen configured `value`, otherwise empty. The current select helper explicitly sets its first choice as `value`; do not invent that fallback for a future descriptor that omits it. Partial blank partner context is valid native data even when an ordinary context submission requires completion.

## Owned view and raw forms

A tracker belongs to one key/session. It contains no application callback or DOM reference. Session/tracker ownership is enforced with private WeakMaps, not a public visible brand. `changedForm` runs synchronously before starting any async work or timer for an edit. `changedView` revokes source/navigation/reload/cancel intent without falsely cleaning a form. `markClean` requires its own exact still-current token and named form. Disposing revokes everything.

```ts
type RRPartnerCollection =
  | "proposals" | "conflicts" | "allocations" | "ledger" | "readiness"
  | "gaps" | "projects" | "experiments" | "milestones"
  | "specifications" | "pledges" | "claims" | "decisions"
  | "criteria" | "nominations" | "deliberations" | "curriculum" | "reviews"
  | "sessions" | "roles" | "production" | "followup"
  | "questions" | "options" | "evidence" | "diagnostics" | "actions"
  | "learning" | "checks" | "findings" | "safeguards" | "responses";
type RRFormId =
  | "draft" | "manuscript" | "nomination" | "activity" | "currency"
  | "context" | `collection:${RRPartnerCollection}` | `country:${string}`;
declare const rrViewToken: unique symbol;
interface RRViewToken {
  readonly [rrViewToken]: true;
  readonly generation: number;
}
interface RRViewTracker {
  readonly key: RRKey;
  changedForm(form: RRFormId): void;
  changedView(): void;
  capture(): RRViewToken;
  isCurrent(token: RRViewToken): boolean;
  markClean(form: RRFormId, token: RRViewToken): boolean;
  snapshot(): Readonly<{generation: number; dirtyForms: readonly RRFormId[]}>;
  dispose(): void;
}
declare function createRemainingRecordView(key: RRKey): RRViewTracker;
interface RRRawForm {
  readonly form: RRFormId;
  readonly editingId: string | null;
  readonly values: Readonly<Record<string, string>>;
}
interface RRFormArchive {
  readonly format: "charitology-remaining-record-forms";
  readonly version: 1;
  readonly key: RRKey;
  readonly exportedAt: string;
  readonly forms: readonly RRRawForm[];
}
declare function remainingRecordFormArchive(input: RRFormArchive): string;
declare function parseRemainingRecordFormArchive(
  raw: string | Uint8Array,
): RRFormArchive;
```

Runtime restricts forms to the selected key: one Research `draft`; one `manuscript`; one `nomination`; Depth `activity` plus `currency`; one currently visible `country:<known-code>`; partner `context` plus at most one editor for each of that program's actual collections. No other program's collection is allowed just because its name is in the union. Every known present control must occur once; no extra field disappears. `currency` has only `{currency}`. Depth activity has `activity,amount,depth,source` as raw strings. Nomination and manuscript use their full named field lists. Country form has `voices,institutions,gaps`. Partner context/collection and research draft use the exact frozen lists below.

`editingId` is null or the raw existing/successfully-admitted-new editing identity bounded by that family's original ID length; context/currency/manuscript/country require null. Raw forms preserve the actual `control.value` strings exposed by the browser, including invalid required, number, date, URL or select values where exposed; they are not records. Some number/date controls conceal an invalid internal editing buffer and expose only an empty value. Do not claim to recover characters the browser does not expose: retain that control/tab, respect `validity.badInput` and never coerce it to zero or clear/reset it after a failed submission. Honor an explicitly declared HTML maxlength, otherwise the whole 1 MB archive bounds the raw control. The Research default maxLength 8,000 is explicitly rendered for text/number/date/URL/textarea, but not select. Manuscript/nomination/Depth selects and Depth amount likewise have no invented maxlength. A native option list is finite; an out-of-contract programmatic control value remains in the DOM if archive generation refuses it. Search/filter controls are view state, not private record fields. Editing IDs and raw form strings are never normalized because a backup was requested. A raw-form archive restores no key and grants no native Apply authority; an explicit field-copy helper, if later implemented, needs its own reviewed contract and is outside this slice.

## Native control hydration and exact candidate reading

Admitted native string and displayed HTML control value can differ. Keep a detached immutable `{original,display}` pair for each adopted control, bound to its source/form/field/editing identity. Capture `display` immediately after assigning `original` to that native control. A nonnull pair means that this individual field is untouched since that adoption. Before its first explicit `input` or `change` is processed, remove that field’s pair permanently for this adoption, even if the exposed value did not change or later returns to the sanitized display. Explicit user-intent prefill invalidates affected fields too. Candidate/native-export reading returns the exact original only while that untouched pair exists and the current value equals its captured display; otherwise it returns the actual current string. An edit→return cannot resurrect an old original, and an explicit clear of a sanitized-empty display must produce the current empty string. No `.trim()`, number conversion, date/URL normalization or synthetic empty value is substituted. Preserve untouched pairs, touched status and controls through failed save, status updates and Retry; reset only at deliberate current adoption. Exact Retry retains its separately captured failed candidate rather than rereading the newly touched form. An unrelated successful save cannot regenerate pairs from a stale saved snapshot over another dirty editor.

```ts
interface RRHydratedString {
  readonly original: string;
  readonly display: string;
}
declare function remainingRecordHydratedString(
  current: string, hydrated: RRHydratedString | null, //null after the first explicit field input/change
): string;
```

This pure helper has no storage/preview authority. Callers own detached pairs, not arbitrary callbacks inside locks. Numeric-string fields use text plus suitable `inputmode` where needed, while the frozen schema remains authoritative. Research partial invalid numeric/date/URL drafts need a text-capable editor or explicit equivalent preservation/display path. Native backup overlays must use this exact candidate reading; raw-form backup must use literal exposed `control.value`, never hidden original/display substitution. The admitted original remains in the current native model/export even when the raw-form display is sanitized. Raw-form archives do not carry hydration pairs or become native restores. Bounded actual Chrome checks must verify the input-type behaviors, CR/LF, partial drafts, unrelated save/autosave/export and failed-save/status/Retry retention, edit→return and sanitized-empty→explicit-clear; a DOM double is insufficient evidence of browser sanitization.

## Captured saves, one-use previews and session

The engine exposes this closed facade. No public transaction/exclusive callback, arbitrary key reader or same-lock reentry exists. Each `captureSave` synchronously detaches and fully admits the complete input under schema/capacity rules and captures its current view. Keep this synchronous semantic admission: a caller must know whether to retain a proposed new-row identity. Before detaching the newest input, revoke/release any older unstarted owned capture or preview source; the old opaque handle may survive without its payload/authority. Capture ownership is distinct from queueing a submitted promise. The caller has already allocated any proposed new ID and timestamp once through the explicit producer command. The engine does not run a clock, mutate IDs, restamp an import or rerun a producer on retry.

```ts
declare const rrCapture: unique symbol;
declare const rrRestore: unique symbol;
declare const rrRemove: unique symbol;
interface RRCapturedSave<K extends RRKey> {
  readonly [rrCapture]: true;
  readonly key: K;
  readonly view: RRViewToken;
  readonly form: RRFormId | null;
}
interface RRPreviewSummary {
  readonly title: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly replacesCurrent: true;
  readonly discardsLocal: boolean;
}
interface RRRestorePreview<K extends RRKey> {
  readonly [rrRestore]: true;
  readonly key: K;
  readonly kind: "restore" | "example" | "replace";
  readonly view: RRViewToken;
  readonly reviewHash: RRHash;
  readonly summary: RRPreviewSummary;
}
interface RRRemovePreview<K extends RRKey> {
  readonly [rrRemove]: true;
  readonly key: K;
  readonly kind: "remove";
  readonly view: RRViewToken;
  readonly reviewHash: RRHash;
  readonly summary: RRPreviewSummary;
}
interface RRWriteResult<K extends RRKey> {
  readonly outcome: "saved" | "no-op" | "unsaved" | "superseded";
  readonly snapshot: RRSnapshot<K>;
  readonly viewCurrent: boolean;
  readonly view: RRViewToken;
}
interface RRNativeExport {
  readonly text: string;
  readonly persistence: RRSnapshot<RRKey>["persistence"];
  readonly formOrigin: "current-model";
}
interface RRRawSavedCopy {
  readonly copy: "protected" | "observed";
  readonly raw: string;
}
interface RRSession<K extends RRKey> {
  readonly key: K;
  snapshot(): RRSnapshot<K>;
  captureSave(
    value: RRValueMap[K] | RRReadonly<RRValueMap[K]>,
    options: {form: RRFormId | null},
  ): RRCapturedSave<K>;
  saveCaptured(captured: RRCapturedSave<K>): Promise<RRWriteResult<K>>;
  retryPersist(): Promise<RRWriteResult<K>>;
  previewRestore(
    raw: string | Uint8Array, options: {discardLocal: boolean},
  ): Promise<RRRestorePreview<K>>;
  previewReplace(
    value: RRValueMap[K] | RRReadonly<RRValueMap[K]>,
    options: {kind: "example" | "replace"; discardLocal: boolean},
  ): Promise<RRRestorePreview<K>>;
  applyRestore(preview: RRRestorePreview<K>): Promise<RRWriteResult<K>>;
  previewRemove(options: {discardLocal: boolean}): Promise<RRRemovePreview<K>>;
  applyRemove(preview: RRRemovePreview<K>): Promise<RRWriteResult<K>>;
  undo(options: {discardLocal: boolean}): Promise<RRWriteResult<K>>;
  reload(options: {discardLocal: boolean}): Promise<RRSnapshot<K>>;
  noticeExternalChange(): Promise<RRSnapshot<K>>;
  exportNative(): RRNativeExport;
  rawSavedCopy(copy: "protected" | "observed"): RRRawSavedCopy | null;
  dispose(): void;
}
declare function openRemainingRecordSession<K extends RRKey>(
  key: K, options: {view: RRViewTracker},
): Promise<RRSession<K>>;
```

### Exact operation rules

- Open/read validates the exact declared key under its lock. If absent, expose a valid unsaved default without writing. If unreadable/corrupt/over-cap, expose no invented writable current. Keep first readable protected raw A. Missing lock/hash capability permits valid reading/export and inert raw recovery, with writes unavailable.
- One shared per-session lane owns all asynchronous full-payload preparation and lock waits for save, `previewRestore` and `previewReplace` of both example/replacement kinds. At most one job runs and the newest unstarted job survives across all kinds; no independent async preview validation/serialization/hash pipeline exists outside it. Synchronous `captureSave` retains complete detachment plus schema/capacity admission. Release/revoke the older unstarted capture/preview payload before detaching the newest. Old opaque handles may retain small completion metadata, never the superseded payload/authority. A later `saveCaptured` on an unstarted superseded capture resolves superseded. An already-submitted superseded save settles immediately; an unstarted superseded preview rejects immediately with `RRRecordError.code === "superseded"`. A running revoked digest/lock wait may finish, but cannot yield usable authority or write. Bound application-owned retained copies rather than browser garbage collection or arbitrary caller input references. Final under-lock saved presence/string, session and view checks happen immediately before set/no-op. Another form’s newer edit prevents a stale completion from replacing DOM; no application callback can approve the guard.
- A storage set/remove failure retains the exact admitted desired candidate, presence operation, timestamps and useful prior Undo/raw copies. Result is unsaved. Pending intent blocks ordinary saves; new raw typing remains in the form. Retry writes that exact candidate once under all guards, never replaying a command. A foreign disk change prevents retry but leaves desired export available.
- Explicit `previewReplace(...kind:"replace")` is the only route to supersede failed intent with the newly captured current form/model candidate. It binds the captured discard permission and current generation. It is not an automatic autosave path. A later edit revokes it; a stale review does not discard pending newer text.
- Restore/source bytes are detached synchronously before validation/digest awaits. Private owner, key, kind, native payload/source hash, exact observed saved bytes/presence, current memory identity, view/session generations and captured discard permission bind a one-use preview. A visible review hash/summary or copied brand is not authority. Apply never reads a file again. Failed apply preserves the candidate and protected raw data, without showing success or reusing an already consumed preview.
- Saved baselines compare exact UTF-16 presence/raw strings. Hash corrupt raw context only through a lossless escaped JSON wrapper, never replacement-encoded UTF-8. Native source-file hashes use their exact admitted bytes.
- A first unseen B always warns before new replacement/removal authority, even when the page already protects corrupt A. A fresh second explicit review may bind B; B→C warns again. Keep A separately. An empty raw string is a raw copy object, not falsy absence. Read denial supplies no bytes.
- Every new file event, including empty/invalid/oversized, cancels prior read/preview authority before inspecting that event. Cancel, form/view/source change, save, clear, Undo, reload, external notice and dispose revoke earlier authority at entry. Read completion, digest completion and final apply repeat generation checks. Deadline/aborted/stale completion never revives Apply or clears a newer status/form.
- Remove is one reviewed key removal. Saved empty and absence remain distinct. Keep one owned previous valid value/presence for Undo. Failed remove→explicit Undo can restore the prior desired state under recovery guards; Undo is not stranded behind ordinary-save refusal. Failed Undo keeps its exact retry candidate and does not toggle repeatedly.
- Reload captures discard permission and generation before awaiting. Adopt only admitted current saved data or proven absence. Corrupt/unreadable reload preserves valid memory, pending desired export, raw forms and protected A. Do not say Loaded or clear pending intent merely because reload was clicked. New baseline bytes disable an old retry rather than retargeting it.
- `discardLocal:false` refuses destruction of dirty forms, pending timer, failed intent or meaningful unsaved model. `true` applies only to that captured generation. Downloads do not mark clean or grant discard permission. No-op and read-only operations still validate owner/generation where they would affect local intent.
- Notifications run only after locks release. A constructor-bound status callback can render current admitted lists/calculations but must preserve all unfinished fields. A successful adoption callback with a still-current token may refill/reset the captured form. A notification exception cannot relabel/undo an actual disk write. No callback accepted by a later command may authorize a write.
- `exportNative()` serializes current admitted model only. Research's model already has a native draft, but it may lag newer raw DOM. To preserve the original Research/Manuscript/current-country form-export behavior, caller explicitly builds an owned native candidate overlay outside the engine and invokes the pure bounded serializer. This is read-only and never marks clean, saves or changes the current model. An invalid/oversized overlay offers raw-form recovery. Other record/kit exports exclude unsaved editor fields and disclose current memory's persistence state.

## New-row editor identity after admission

Nomination, Depth activity and partner new-row submissions allocate their proposed ID before building a complete candidate. Install no new editor binding if synchronous `captureSave` refuses schema/capacity admission. After successful admission, retain that captured ID before awaiting `saveCaptured`, bound to the exact key, collection/form and editor instance. A failed or older still-admitted save, newer raw typing, status refresh and exact Retry must not allocate another ID or retarget an unrelated row.

Keep whether that ID originated as an admitted new row or an edit of an existing row. On later submit, update the same admitted row if present; if that admitted-new candidate has not entered current memory, insert that same owned new identity under current guards. Do not treat a vanished preexisting editing target as a new row, silently recreate it or adopt a matching ID from another source/collection. Explicit New/Cancel, deliberate adoption or successful still-current editor reset clears the binding. A stale completion cannot reinstall a cleared binding. The exact failed candidate remains separate from the newer raw editor; Retry never rereads fields.

Raw-form `editingId` may therefore describe the existing target or this successfully admitted-new identity; it is still only a bounded inert string, not row/preview authority. No native envelope gains a field. Research already carries its own draft/editing/freeze semantics and must not confuse those native references with this extra caller-only identity. Required mounted tests are failed-new→edit→Retry→resubmit with exactly one same-ID row, other-collection isolation, current/stale successful reset, explicit New/Cancel and pre-admission refusal leaving no dangling new editor ID.

## Controls, abortable reads and autosave

The controls module owns local file reading/preview UI. Production uses one abortable `FileReader.readAsArrayBuffer`, byte/deadline limits and generation-owned detached bytes. On new choice/cancel, remove handlers, abort the active reader and revoke authority before starting a new reader. Still check generation at load/error/abort, digest and Apply. This does not promise immediate browser garbage collection; it bounds application-owned active/pending readers and candidates. Missing FileReader/import hashing capability disables that import path with a clear explanation; other valid recovery/export paths stay available. Tests control the native reader seam outside locks; production does not accept an arbitrary later `File.text`/read callback.

```ts
interface RRRecoveryControls {
  noteViewMutation(): void;
  refresh(): void;
  dispose(): void;
}
interface RRRecoveryControlsOptions<K extends RRKey> {
  host: HTMLElement;
  session: RRSession<K>;
  view: RRViewTracker;
  readForms: () => readonly RRRawForm[];
  onAdopt: (snapshot: RRSnapshot<K>, view: RRViewToken) => void;
  onStatus?: (snapshot: RRSnapshot<K>) => void;
}
declare function mountRemainingRecordRecoveryControls<K extends RRKey>(
  options: RRRecoveryControlsOptions<K>,
): RRRecoveryControls;
/** Controls-only WeakMap owner check; application components never import it. */
declare function assertRemainingRecordControlBinding<K extends RRKey>(
  session: RRSession<K>, view: RRViewTracker,
): void;
type RRAutosaveKey = RRResearchKey | "charitology-manuscript-v1" | "charitology-country-notes-v1";
interface RRDraftAutosaver<K extends RRAutosaveKey> {
  noteInput(): void;
  flush(): Promise<RRWriteResult<K> | null>;
  cancel(): void;
  hasPending(): boolean;
  dispose(): void;
}
interface RRDraftAutosaveOptions<K extends RRAutosaveKey> {
  session: RRSession<K>;
  view: RRViewTracker;
  form: RRFormId;
  readCandidate: () => RRValueMap[K] | RRReadonly<RRValueMap[K]>;
  onResult: (result: RRWriteResult<K>) => void;
  onError: (error: unknown) => void;
}
declare function createRemainingRecordDraftAutosaver<K extends RRAutosaveKey>(
  options: RRDraftAutosaveOptions<K>,
): RRDraftAutosaver<K>;
```

Callbacks are captured at construction and run outside engine operations/locks. `readForms` is called only for an explicit raw-form backup outside a lock. `readCandidate` runs synchronously outside the lock when the 250 ms timer/explicit flush fires; `captureSave` immediately detaches its result. Caller must first call `view.changedForm(...)`, then `controls.noteViewMutation()`, then `autosaver.noteInput()` for an edit. Neither helper double-increments that form generation. On source change/cancel/reload/dispose, caller revokes the view and cancels the timer before replacing any DOM. Autosave retains one current timer and one coalesced desired update, not a closure/copy per keystroke. A pending failed engine candidate refuses ordinary timer saves and leaves raw form text intact.

`hasPending()` covers a scheduled timer or its unresolved submitted save, so beforeunload and destructive/navigation reviews see it. `flush` awaits the current owned request or captures the current form now; it does not bypass failed-intent/discard guards. `cancel` drops unstarted timer intent and revokes helper read authority; it does not claim a running save was rolled back or clean the form. `onResult` may render truthful status; it may clean/reset only the exact current submitted form on saved/no-op. Callbacks cannot access or approve final under-lock guards. The helper captures request/view identity before `readCandidate` and every await. Suppress stale `onError(error)` notifications after any newer request, view/generation change, cancellation or disposal: that callback has no token with which to infer ownership itself. `onResult` may report an old outcome only through guarded status that cannot clobber a newer form/message; the example below checks its exact result view. Errors never drop raw DOM.

For country notes, the `country:<code>` form identity is captured, not read from a later selector. On primary-country navigation, revoke pending read/preview authority and resolve/prompt for that exact earlier form and failed intent before refilling. A compare/search/filter change does not refill the note fields. A rejected or stale navigation restores the prior selection without rewriting a newer note form. Country factual helpers/APIs and fourteen R1 baseline files stay unchanged.

Private forms stay default-disabled/intercepted before async opening; startup failure never enables default GET submission. Program fields created in JS are attached to intercepted forms before enabling them. Display recovery summaries with text nodes, not raw HTML. A requested download is not native Save acceptance.

### Compilable caller seam

This example deliberately does not start a provider or simulate a complete mount. The real journal caller also supplies controls, native/form export, disposal, source generations, capability states and leaving guards. It illustrates the actual typed producer shape, retained form text and awaited result. Its callbacks run outside locks.

```ts
async function exampleManuscriptAutosave(
  form: HTMLFormElement,
  status: HTMLElement,
): Promise<void> {
  const key = "charitology-manuscript-v1" as const;
  const fields: readonly RRManuscriptField[] = [
    "title", "author", "summary", "kind", "question",
    "methods", "results", "limits", "sources",
  ];
  form.addEventListener("submit", event => event.preventDefault(), true);
  const view = createRemainingRecordView(key);
  const session = await openRemainingRecordSession(key, {view});
  const readCandidate = (): RRManuscript => Object.fromEntries(fields.map(field => {
    const control = form.elements.namedItem(field);
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement))
      throw new Error(`Missing manuscript field: ${field}`);
    return [field, control.value];
  })) as RRManuscript;
  const autosaver = createRemainingRecordDraftAutosaver({
    session, view, form: "manuscript", readCandidate,
    onResult(result) {
      if (!view.isCurrent(result.view)) return;
      if (result.outcome === "saved" || result.outcome === "no-op") {
        view.markClean("manuscript", result.view);
        status.textContent = "Draft saved in this browser. No submission sent.";
        // A newer edit would fail the exact token check; form reset is unnecessary.
      } else if (result.outcome === "unsaved")
        status.textContent = "Saving failed. Keep this form; export or retry the captured draft.";
      else status.textContent = "Newer local input superseded this save request.";
    },
    onError(error) {
      status.textContent = error instanceof Error ? error.message : "Draft save was refused.";
    },
  });
  form.addEventListener("input", () => {
    view.changedForm("manuscript");
    autosaver.noteInput();
  });
  window.addEventListener("beforeunload", event => {
    const snapshot = session.snapshot();
    if (autosaver.hasPending() || snapshot.pendingPersist || view.snapshot().dirtyForms.length) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
```

The result carries the actual submitted view token. The tracker still checks private ownership/currentness; a copied or forged token is not authority. The example cleans only that current form and never resets it. Full integration must likewise guard adoption/status updates and dispose the mounted session/tracker/autosaver. Do not turn this partial example into a blanket acceptance claim.

## Frozen semantic inventory

This inventory was compared with the seven actual source-derived field arrays and nine frozen partner adapters, not guessed from rendered labels. Field order is producer order. Every field name below is exact and case-sensitive. A future semantic edit must fail compatibility checks until a new explicitly reviewed migration/version choice exists; do not derive the frozen v1 table dynamically from a changed UI config. No such migration/new key is included here.

Research field limits default to 8,000 UTF-16 code units. Saved `values` obey requiredness and every type rule. Draft fields are a sparse subset and obey type/length only: each present value is a string; numeric/date/select/URL content may remain invalid partial input. Required blank is a failed record submission, not a reason to erase a draft. Date values are exact real `YYYY-MM-DD`, retaining the old representable calendar range; numeric fields use finite `Number(raw)` and declared bounds, with integer requirement only where step is `1`. URL fields require credential-free HTTPS; unsupported control/backslash spellings remain protected rather than executed. Selection strings are exact listed values. Numeric text, whitespace and zero are retained, not converted in native JSON.

The two comparison programs require `first !== second` when both are nonempty. Methods requires `costLow<=costHigh`, `probabilityLow<=probabilityHigh`, `unitsLow<=unitsHigh` whenever each pair is present. Replication alone has `freeze:true`; the other six have `freeze:false`. All current research record producers emit exact `Date.toISOString()` strings, 24 characters for their ordinary current-year timestamps; unsupported legacy-shaped/noncanonical timestamps remain protected, not restamped. IDs remain the original nonempty up-to-100-code-unit strings.

### Research: moral-frameworks-program

Final key: `charitology.research-program.moral-frameworks-program.v1`; freeze: `false`.

| Field | Type | Required record | Max code units | Exact extra rule |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 8000 | — |
| `first` | select | yes | 8000 | Choices: `global-health`, `extreme-poverty`, `hunger`, `climate`, `nature`, `animals`, `education`, `mental-health`, `housing`, `democracy`, `peace`, `catastrophic-risk`, `science`, `community`, `arts`, `faith`, `charity-system` |
| `second` | select | yes | 8000 | Choices: `global-health`, `extreme-poverty`, `hunger`, `climate`, `nature`, `animals`, `education`, `mental-health`, `housing`, `democracy`, `peace`, `catastrophic-risk`, `science`, `community`, `arts`, `faith`, `charity-system` |
| `weight_welfare` | number | no | 8000 | min 0; max 5 |
| `weight_rights` | number | no | 8000 | min 0; max 5 |
| `weight_justice` | number | no | 8000 | min 0; max 5 |
| `weight_care` | number | no | 8000 | min 0; max 5 |
| `weight_tradition` | number | no | 8000 | min 0; max 5 |
| `weight_future` | number | no | 8000 | min 0; max 5 |
| `weight_nature` | number | no | 8000 | min 0; max 5 |
| `weight_flourishing` | number | no | 8000 | min 0; max 5 |
| `reasons` | textarea | yes | 8000 | — |
| `disagreement` | textarea | yes | 8000 | — |
| `source` | url | no | 8000 | — |
| `correction` | textarea | no | 8000 | — |

### Research: methods-lab

Final key: `charitology.research-program.methods-lab.v1`; freeze: `false`.

| Field | Type | Required record | Max code units | Exact extra rule |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 8000 | — |
| `problem` | text | yes | 8000 | — |
| `unit` | text | yes | 8000 | — |
| `horizon` | text | yes | 8000 | — |
| `currency` | text | yes | 8000 | — |
| `method` | select | yes | 8000 | Choices: `cash`, `advocacy`, `research`, `mutual-aid`, `volunteering`, `investing`, `prizes` |
| `chain` | textarea | yes | 8000 | — |
| `costLow` | number | no | 8000 | min 0 |
| `costHigh` | number | no | 8000 | min 0 |
| `probabilityLow` | number | no | 8000 | min 0; max 100 |
| `probabilityHigh` | number | no | 8000 | min 0; max 100 |
| `unitsLow` | number | no | 8000 | min 0 |
| `unitsHigh` | number | no | 8000 | min 0 |
| `assumptions` | textarea | yes | 8000 | — |
| `source` | url | no | 8000 | — |
| `harm` | textarea | yes | 8000 | — |
| `next` | textarea | no | 8000 | — |

### Research: cause-census

Final key: `charitology.research-program.cause-census.v1`; freeze: `false`.

| Field | Type | Required record | Max code units | Exact extra rule |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 8000 | — |
| `cause` | select | yes | 8000 | Choices: `global-health`, `extreme-poverty`, `hunger`, `climate`, `nature`, `animals`, `education`, `mental-health`, `housing`, `democracy`, `peace`, `catastrophic-risk`, `science`, `community`, `arts`, `faith`, `charity-system` |
| `scope` | text | yes | 8000 | — |
| `metric` | select | yes | 8000 | Choices: `scale`, `spending`, `solvability`, `depth`, `other` |
| `value` | number | no | 8000 | min 0 |
| `unit` | text | yes | 8000 | — |
| `year` | number | yes | 8000 | min 1900; max 2200; integer |
| `uncertainty` | textarea | yes | 8000 | — |
| `source` | url | yes | 8000 | — |
| `location` | textarea | yes | 8000 | — |
| `framework` | textarea | yes | 8000 | — |
| `depth` | textarea | no | 8000 | — |
| `check` | textarea | no | 8000 | — |

### Research: evidence-reviews

Final key: `charitology.research-program.evidence-reviews.v1`; freeze: `false`.

| Field | Type | Required record | Max code units | Exact extra rule |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 8000 | — |
| `population` | text | yes | 8000 | — |
| `intervention` | textarea | yes | 8000 | — |
| `outcome` | text | yes | 8000 | — |
| `search` | textarea | yes | 8000 | — |
| `inclusion` | textarea | yes | 8000 | — |
| `selection` | textarea | no | 8000 | — |
| `source` | url | yes | 8000 | — |
| `design` | select | yes | 8000 | Choices: `randomized`, `quasi`, `observational`, `qualitative`, `systematic`, `other` |
| `sample` | textarea | no | 8000 | — |
| `effect` | textarea | yes | 8000 | — |
| `bias` | textarea | yes | 8000 | — |
| `transfer` | textarea | no | 8000 | — |
| `conflicts` | textarea | no | 8000 | — |
| `synthesis` | textarea | yes | 8000 | — |
| `next` | textarea | no | 8000 | — |

### Research: replication-program

Final key: `charitology.research-program.replication-program.v1`; freeze: `true`.

| Field | Type | Required record | Max code units | Exact extra rule |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 8000 | — |
| `source` | url | yes | 8000 | — |
| `claim` | textarea | yes | 8000 | — |
| `kind` | select | yes | 8000 | Choices: `reproduce`, `reanalyse`, `direct`, `context` |
| `change` | textarea | yes | 8000 | — |
| `hypotheses` | textarea | yes | 8000 | — |
| `sample` | textarea | yes | 8000 | — |
| `outcome` | textarea | yes | 8000 | — |
| `estimand` | textarea | yes | 8000 | — |
| `analysis` | textarea | yes | 8000 | — |
| `missing` | textarea | yes | 8000 | — |
| `multiple` | textarea | yes | 8000 | — |
| `access` | textarea | yes | 8000 | — |
| `ethics` | textarea | yes | 8000 | — |
| `review` | textarea | yes | 8000 | — |
| `due` | date | no | 8000 | — |
| `amendments` | textarea | no | 8000 | — |

### Research: failure-lab

Final key: `charitology.research-program.failure-lab.v1`; freeze: `false`.

| Field | Type | Required record | Max code units | Exact extra rule |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 8000 | — |
| `source` | url | yes | 8000 | — |
| `intent` | textarea | yes | 8000 | — |
| `timeline` | textarea | yes | 8000 | — |
| `observed` | textarea | yes | 8000 | — |
| `counterfactual` | textarea | yes | 8000 | — |
| `mechanism` | select | yes | 8000 | Choices: `causal-chain`, `implementation`, `context`, `incentives`, `displacement`, `measurement`, `unknown` |
| `confidence` | select | yes | 8000 | Choices: `hypothesis`, `documented`, `debated` |
| `lesson` | textarea | yes | 8000 | — |
| `action` | text | yes | 8000 | — |
| `owner` | text | no | 8000 | — |
| `due` | date | no | 8000 | — |
| `verification` | textarea | yes | 8000 | — |
| `result` | textarea | no | 8000 | — |

### Research: history-of-charity

Final key: `charitology.research-program.history-of-charity.v1`; freeze: `false`.

| Field | Type | Required record | Max code units | Exact extra rule |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 8000 | — |
| `first` | select | yes | 8000 | Choices: `carnegie-libraries`, `dare`, `green-revolution`, `haiti-earthquake-reconstruction`, `hookworm-campaign`, `ice-bucket-challenge`, `one-laptop-per-child`, `oral-rehydration-therapy-spread`, `playpumps`, `polio-eradication`, `rosenwald-schools`, `scared-straight`, `smallpox-eradication` |
| `second` | select | yes | 8000 | Choices: `carnegie-libraries`, `dare`, `green-revolution`, `haiti-earthquake-reconstruction`, `hookworm-campaign`, `ice-bucket-challenge`, `one-laptop-per-child`, `oral-rehydration-therapy-spread`, `playpumps`, `polio-eradication`, `rosenwald-schools`, `scared-straight`, `smallpox-eradication` |
| `question` | textarea | yes | 8000 | — |
| `source` | url | yes | 8000 | — |
| `similar` | textarea | yes | 8000 | — |
| `different` | textarea | yes | 8000 | — |
| `missing` | textarea | yes | 8000 | — |
| `lesson` | textarea | yes | 8000 | — |
| `next` | textarea | no | 8000 | — |

### Manuscript, nominations and Depth Census

Manuscript has exactly `title` (200), `author` (150), `summary` (1,500), `kind` (100), `question` (10,000), `methods` (20,000), `results` (20,000), `limits` (10,000), `sources` (10,000). Parentheses are UTF-16 code-unit maxima. All values are strings; all may be blank except the known `kind`. Its exact choices are `Proposed method`, `Research result`, `Replication`, `Null result or failure report`, `Essay`. No ID, timestamp, version or metadata field is added.

Nominations has exactly `id` plus `title` (180), `subject` (180), `depth` (100), `mechanism` (5,000), `lenses` (5,000), `evidence` (10,000), `funding` (5,000), `voice` (5,000), `objection` (5,000), `conflicts` (3,000). All ten fields are nonblank strings after inspection with `trim`, but their accepted original strings remain unchanged. Depth is exactly one of `unknown`, `0 · Relief`, `1 · Repair`, `2 · Prevention`, `3 · Structure`, `4 · Source`, `Multiple levels; explain below`. At most 100 rows with unique nonempty string IDs of 1–99 code units; ID spelling remains inert and is not changed into a UUID/slug.

Depth Census has exactly `{currency,rows}` and each row exactly `{id,activity,amount,depth,source}`. Currency matches `[A-Z]{3}`. At most 1,000 rows with unique nonempty string IDs of 1–99 code units. Activity is nonblank and at most 200; source/rationale is nonblank and at most 5,000. Amount is a finite JavaScript number 0–1e9 and keeps the current admission expression `abs(amount*100-round(amount*100))<0.0001`; no stronger financial-precision claim is added. Depth is exactly `unknown`, `0`, `1`, `2`, `3` or `4`. Its native shape keeps no editing ID; that lives only in the current raw activity form.

### Country notes

The native map can contain any subset of these exact 217 known codes, including an empty map. Every present value is exactly `{voices,institutions,gaps}`; three strings of at most 10,000 code units each, including empty or invalid-as-a-claim draft text. No note becomes evidence or a public country assessment. No new key or per-country browser key is introduced. Codes derive from the preserved country producer identity set, not a guessed ISO validator; in particular do not silently drop special source codes.

```text
AFG ALB DZA ASM AND AGO ATG ARG ARM ABW AUS AUT AZE BHS BHR BGD BRB BLR BEL BLZ BEN BMU BTN BOL BIH BWA BRA VGB BRN BGR BFA BDI CPV KHM CMR CAN CYM CAF TCD CHI CHL CHN COL COM COD COG CRI CIV HRV CUB CUW CYP CZE DNK DJI DMA DOM ECU EGY SLV GNQ ERI EST SWZ ETH FRO FJI FIN FRA PYF GAB GMB GEO DEU GHA GIB GRC GRL GRD GUM GTM GIN GNB GUY HTI HND HKG HUN ISL IND IDN IRN IRQ IRL IMN ISR ITA JAM JPN JOR KAZ KEN KIR PRK KOR XKX KWT KGZ LAO LVA LBN LSO LBR LBY LIE LTU LUX MAC MDG MWI MYS MDV MLI MLT MHL MRT MUS MEX FSM MDA MCO MNG MNE MAR MOZ MMR NAM NRU NPL NLD NCL NZL NIC NER NGA MKD MNP NOR OMN PAK PLW PAN PNG PRY PER PHL POL PRT PRI QAT ROU RUS RWA WSM SMR STP SAU SEN SRB SYC SLE SGP SXM SVK SVN SLB SOM ZAF SSD ESP LKA KNA LCA MAF VCT SDN SUR SWE CHE SYR TJK TZA THA TLS TGO TON TTO TUN TUR TKM TCA TUV UGA UKR ARE GBR USA URY UZB VUT VEN VNM VIR PSE YEM ZMB ZWE
```

### Partner native rules and fields

All nine envelopes have exactly `version,program,updated,context,records`. Each collection is an ordered array of exact `{id,values}` rows. Each context/values object contains every frozen field exactly once and no unknown field. Context may retain incomplete blanks as an initial/native draft; submitting context obeys requiredness. Saved row fields obey requiredness and types. Text and textarea are strings; inspect a trimmed copy for validation, retain original accepted bytes/code units. Dates are exact real four-digit `YYYY-MM-DD` values under the existing producer calendar check. URLs are public credential-free HTTPS; unsupported control/backslash forms stay protected instead of being rendered as a link. Optional blank remains blank.

Numbers stay strings, finite after `Number(trimmed)`, at least the listed minimum or 0 and at most `min(listed maximum ?? 1e9,1e9)`. `amount` and `budget` also match `^(?:\d+|\d*\.\d{1,2})$`; `minutes` is integer. Summit `start` is exact `HH:MM` in UTC, although the field is a text descriptor. No implicit date/time-zone conversion is introduced. Records with status Cancelled or incomplete slots stay excluded by the unchanged calendar selector. `updated` is empty or a retained parseable timestamp of at most 100 code units. IDs match `[A-Za-z0-9_-]{1,100}`, unique across that partner workspace; 250 per collection/500 total. There is no new referential integrity rule for textual cross-record labels.

The tables show raw frozen descriptor maxima; the effective 1e9 number ceiling above still applies. A default is the actual configured string, or empty when absent, and does not fill a nondefault retained value. Requiredness applies to ordinary submissions and saved rows; incomplete native context is permitted as described above.

#### Partner: the-charitology-fund

Final key: `charitology.partner-workspace-v1.the-charitology-fund`. Collections: `proposals`, `conflicts`, `allocations`, `ledger`, `readiness`.

**Context**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `name` | text | yes | 500 | default empty |
| `scope` | textarea | yes | 5000 | default empty |
| `period` | text | yes | 500 | default empty |
| `authority` | textarea | yes | 5000 | default empty |
| `privacy` | textarea | yes | 5000 | default empty |
| `budget` | number | no | 500 | min 0; raw max 1000000000000 |
| `currency` | text | no | 500 | default empty |
| `publicSummary` | textarea | yes | 5000 | default empty |

**Collection `proposals`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `mechanism` | textarea | yes | 5000 | default empty |
| `depth` | select | yes | 500 | Choices: `Unclassified`, `0 Relief`, `1 Repair`, `2 Prevention`, `3 Structure`, `4 Source`, `Several levels`; default "Unclassified" |
| `amount` | number | no | 500 | min 0; raw max 1000000000000 |
| `currency` | text | yes | 500 | default empty |
| `source` | url | no | 500 | default empty |
| `evidence` | textarea | yes | 5000 | default empty |
| `voice` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Evidence gathering`, `Discussion`, `Not proceeding`, `Conditional allocation proposed`; default "Draft" |

**Collection `conflicts`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `proposal` | text | yes | 500 | default empty |
| `role` | text | yes | 500 | default empty |
| `connection` | textarea | yes | 5000 | default empty |
| `response` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `allocations`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `proposal` | text | yes | 500 | default empty |
| `amount` | number | no | 500 | min 0; raw max 1000000000000 |
| `currency` | text | yes | 500 | default empty |
| `rationale` | textarea | yes | 5000 | default empty |
| `conditions` | textarea | yes | 5000 | default empty |
| `date` | date | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Conditional recommendation`, `Locally recorded authorization`, `Declined`, `Withdrawn`; default "Draft" |

**Collection `ledger`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `allocation` | text | yes | 500 | default empty |
| `amount` | number | no | 500 | min 0; raw max 1000000000000 |
| `currency` | text | yes | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Planned`, `Conditional`, `Cancelled`; default "Planned" |
| `notes` | textarea | yes | 5000 | default empty |
| `source` | url | no | 500 | default empty |

**Collection `readiness`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not established`, `Needs outside review`, `Evidence recorded locally`, `Needs revision`; default "Not established" |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `notes` | textarea | yes | 5000 | default empty |

#### Partner: charity-incubator

Final key: `charitology.partner-workspace-v1.charity-incubator`. Collections: `gaps`, `projects`, `experiments`, `milestones`, `readiness`.

**Context**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `name` | text | yes | 500 | default empty |
| `scope` | textarea | yes | 5000 | default empty |
| `period` | text | yes | 500 | default empty |
| `authority` | textarea | yes | 5000 | default empty |
| `privacy` | textarea | yes | 5000 | default empty |

**Collection `gaps`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `need` | textarea | yes | 5000 | default empty |
| `search` | textarea | yes | 5000 | default empty |
| `existing` | textarea | yes | 5000 | default empty |
| `source` | url | no | 500 | default empty |
| `next` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `projects`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `gap` | text | yes | 500 | default empty |
| `model` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Discovery`, `Existing partner search`, `Design`, `Pilot proposed`, `Learning`, `Hand-off`, `Closed`; default "Discovery" |
| `roles` | textarea | yes | 5000 | default empty |
| `governance` | textarea | yes | 5000 | default empty |
| `date` | date | no | 500 | default empty |

**Collection `experiments`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `project` | text | yes | 500 | default empty |
| `hypothesis` | textarea | yes | 5000 | default empty |
| `design` | textarea | yes | 5000 | default empty |
| `threshold` | textarea | yes | 5000 | default empty |
| `finding` | textarea | yes | 5000 | default empty |
| `source` | url | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `milestones`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `project` | text | yes | 500 | default empty |
| `acceptance` | textarea | yes | 5000 | default empty |
| `owner` | text | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Planned`, `In progress`, `Needs review`, `Accepted locally`, `Closed`; default "Planned" |
| `next` | textarea | yes | 5000 | default empty |

**Collection `readiness`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not established`, `Needs outside review`, `Evidence recorded locally`, `Needs revision`; default "Not established" |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `notes` | textarea | yes | 5000 | default empty |

#### Partner: question-bounties

Final key: `charitology.partner-workspace-v1.question-bounties`. Collections: `specifications`, `pledges`, `claims`, `decisions`, `readiness`.

**Context**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `name` | text | yes | 500 | default empty |
| `scope` | textarea | yes | 5000 | default empty |
| `period` | text | yes | 500 | default empty |
| `authority` | textarea | yes | 5000 | default empty |
| `privacy` | textarea | yes | 5000 | default empty |

**Collection `specifications`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `question` | textarea | yes | 5000 | default empty |
| `acceptance` | textarea | yes | 5000 | default empty |
| `partial` | textarea | yes | 5000 | default empty |
| `appeal` | textarea | yes | 5000 | default empty |
| `amount` | number | no | 500 | min 0; raw max 1000000000000 |
| `currency` | text | yes | 500 | default empty |
| `source` | url | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `pledges`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `bounty` | text | yes | 500 | default empty |
| `role` | text | yes | 500 | default empty |
| `amount` | number | no | 500 | min 0; raw max 1000000000000 |
| `currency` | text | yes | 500 | default empty |
| `conditions` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Illustrative only`, `Unverified conditional`, `Withdrawn`; default "Illustrative only" |

**Collection `claims`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `bounty` | text | yes | 500 | default empty |
| `source` | url | no | 500 | default empty |
| `result` | textarea | yes | 5000 | default empty |
| `limits` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `decisions`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `claim` | text | yes | 500 | default empty |
| `criteria` | textarea | yes | 5000 | default empty |
| `conflicts` | textarea | yes | 5000 | default empty |
| `amount` | number | no | 500 | min 0; raw max 1000000000000 |
| `currency` | text | yes | 500 | default empty |
| `conditions` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `More evidence needed`, `Conditional recommendation`, `No award proposed`, `Withdrawn`; default "Draft" |

**Collection `readiness`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not established`, `Needs outside review`, `Evidence recorded locally`, `Needs revision`; default "Not established" |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `notes` | textarea | yes | 5000 | default empty |

#### Partner: the-charitology-prize

Final key: `charitology.partner-workspace-v1.the-charitology-prize`. Collections: `criteria`, `nominations`, `conflicts`, `deliberations`, `readiness`.

**Context**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `name` | text | yes | 500 | default empty |
| `scope` | textarea | yes | 5000 | default empty |
| `period` | text | yes | 500 | default empty |
| `authority` | textarea | yes | 5000 | default empty |
| `privacy` | textarea | yes | 5000 | default empty |

**Collection `criteria`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `definition` | textarea | yes | 5000 | default empty |
| `risks` | textarea | yes | 5000 | default empty |
| `challenge` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `nominations`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `category` | text | yes | 500 | default empty |
| `source` | url | no | 500 | default empty |
| `contribution` | textarea | yes | 5000 | default empty |
| `voice` | textarea | yes | 5000 | default empty |
| `objection` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `conflicts`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `nomination` | text | yes | 500 | default empty |
| `role` | text | yes | 500 | default empty |
| `connection` | textarea | yes | 5000 | default empty |
| `response` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `deliberations`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `nomination` | text | yes | 500 | default empty |
| `evidence` | textarea | yes | 5000 | default empty |
| `reasons` | textarea | yes | 5000 | default empty |
| `dissent` | textarea | yes | 5000 | default empty |
| `authorization` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `More evidence requested`, `Ready for independent discussion`, `Locally recorded proposal`, `Withdrawn`; default "Draft" |

**Collection `readiness`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not established`, `Needs outside review`, `Evidence recorded locally`, `Needs revision`; default "Not established" |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `notes` | textarea | yes | 5000 | default empty |

#### Partner: charitology-fellowship

Final key: `charitology.partner-workspace-v1.charitology-fellowship`. Collections: `projects`, `curriculum`, `milestones`, `reviews`, `readiness`.

**Context**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `name` | text | yes | 500 | default empty |
| `scope` | textarea | yes | 5000 | default empty |
| `period` | text | yes | 500 | default empty |
| `authority` | textarea | yes | 5000 | default empty |
| `privacy` | textarea | yes | 5000 | default empty |

**Collection `projects`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `question` | textarea | yes | 5000 | default empty |
| `method` | textarea | yes | 5000 | default empty |
| `output` | textarea | yes | 5000 | default empty |
| `support` | textarea | yes | 5000 | default empty |
| `source` | url | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `curriculum`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `objective` | textarea | yes | 5000 | default empty |
| `activity` | textarea | yes | 5000 | default empty |
| `output` | textarea | yes | 5000 | default empty |
| `role` | text | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Materials prepared`, `Discussion planned`, `Local learning notes recorded`; default "Draft" |

**Collection `milestones`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `project` | text | yes | 500 | default empty |
| `deliverable` | textarea | yes | 5000 | default empty |
| `feedback` | textarea | yes | 5000 | default empty |
| `date` | date | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Planned`, `In progress`, `Needs discussion`, `Locally recorded completion`, `Closed`; default "Planned" |

**Collection `reviews`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `project` | text | yes | 500 | default empty |
| `criteria` | textarea | yes | 5000 | default empty |
| `access` | textarea | yes | 5000 | default empty |
| `conflicts` | textarea | yes | 5000 | default empty |
| `reasoning` | textarea | yes | 5000 | default empty |
| `next` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `readiness`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not established`, `Needs outside review`, `Evidence recorded locally`, `Needs revision`; default "Not established" |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `notes` | textarea | yes | 5000 | default empty |

#### Partner: charitology-summit

Final key: `charitology.partner-workspace-v1.charitology-summit`. Collections: `sessions`, `roles`, `production`, `followup`, `readiness`.

**Context**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `name` | text | yes | 500 | default empty |
| `scope` | textarea | yes | 5000 | default empty |
| `period` | text | yes | 500 | default empty |
| `authority` | textarea | yes | 5000 | default empty |
| `privacy` | textarea | yes | 5000 | default empty |

**Collection `sessions`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `start` | text | no | 500 | default empty |
| `minutes` | number | no | 500 | min 1; raw max 1440 |
| `question` | textarea | yes | 5000 | default empty |
| `format` | textarea | yes | 5000 | default empty |
| `output` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs host`, `Tentative internal plan`, `Cancelled`; default "Draft" |

**Collection `roles`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `session` | text | yes | 500 | default empty |
| `contribution` | textarea | yes | 5000 | default empty |
| `access` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Placeholder only`, `Invitation process needed`, `Response not recorded`, `Role no longer needed`; default "Placeholder only" |

**Collection `production`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `plan` | textarea | yes | 5000 | default empty |
| `owner` | text | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not started`, `Planning`, `Needs outside confirmation`, `Locally checked`; default "Not started" |

**Collection `followup`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `session` | text | yes | 500 | default empty |
| `output` | textarea | yes | 5000 | default empty |
| `action` | textarea | yes | 5000 | default empty |
| `date` | date | no | 500 | default empty |
| `source` | url | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `readiness`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not established`, `Needs outside review`, `Evidence recorded locally`, `Needs revision`; default "Not established" |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `notes` | textarea | yes | 5000 | default empty |

#### Partner: donor-advisory

Final key: `charitology.partner-workspace-v1.donor-advisory`. Collections: `questions`, `options`, `evidence`, `followup`, `readiness`.

**Context**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `name` | text | yes | 500 | default empty |
| `decision` | textarea | yes | 5000 | default empty |
| `values` | textarea | yes | 5000 | default empty |
| `constraints` | textarea | yes | 5000 | default empty |
| `amount` | number | no | 500 | min 0; raw max 1000000000000 |
| `currency` | text | no | 500 | default empty |
| `horizon` | text | yes | 500 | default empty |
| `privacy` | textarea | yes | 5000 | default empty |
| `conflicts` | textarea | yes | 5000 | default empty |

**Collection `questions`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `topic` | select | yes | 500 | Choices: `Values and disagreement`, `Timing`, `Near and far`, `Restrictions and flexibility`, `Decision authority`, `Privacy and access`, `Professional referral`; default "Values and disagreement" |
| `answer` | textarea | yes | 5000 | default empty |
| `alternatives` | textarea | yes | 5000 | default empty |
| `next` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `options`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `mechanism` | textarea | yes | 5000 | default empty |
| `depth` | select | yes | 500 | Choices: `Unclassified`, `0 Relief`, `1 Repair`, `2 Prevention`, `3 Structure`, `4 Source`, `Several levels`; default "Unclassified" |
| `place` | text | yes | 500 | default empty |
| `amount` | number | no | 500 | min 0; raw max 1000000000000 |
| `timing` | text | yes | 500 | default empty |
| `fit` | textarea | yes | 5000 | default empty |
| `tradeoffs` | textarea | yes | 5000 | default empty |
| `unknowns` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `evidence`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `scenario` | text | yes | 500 | default empty |
| `source` | url | no | 500 | default empty |
| `evidence` | select | yes | 500 | Choices: `Unknown or not checked`, `Public description only`, `Observational evidence`, `Causal study`, `Mixed or disputed`, `Hypothesis`; default "Unknown or not checked" |
| `finding` | textarea | yes | 5000 | default empty |
| `limits` | textarea | yes | 5000 | default empty |
| `checked` | date | no | 500 | default empty |
| `next` | textarea | yes | 5000 | default empty |

**Collection `followup`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `decision` | textarea | yes | 5000 | default empty |
| `conditions` | textarea | yes | 5000 | default empty |
| `owner` | text | yes | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `learning` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `readiness`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not established`, `Needs outside review`, `Evidence recorded locally`, `Needs revision`; default "Not established" |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `notes` | textarea | yes | 5000 | default empty |

#### Partner: nonprofit-advisory

Final key: `charitology.partner-workspace-v1.nonprofit-advisory`. Collections: `diagnostics`, `evidence`, `actions`, `learning`, `readiness`.

**Context**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `name` | text | yes | 500 | default empty |
| `activity` | text | yes | 500 | default empty |
| `decision` | textarea | yes | 5000 | default empty |
| `change` | textarea | yes | 5000 | default empty |
| `baseline` | textarea | yes | 5000 | default empty |
| `capacity` | textarea | yes | 5000 | default empty |
| `voice` | textarea | yes | 5000 | default empty |
| `privacy` | textarea | yes | 5000 | default empty |
| `period` | text | yes | 500 | default empty |

**Collection `diagnostics`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `area` | select | yes | 500 | Choices: `Outcomes and causal pathway`, `Evidence and comparison`, `Full costs and capacity`, `Voice and access`, `Reporting burden`, `Governance and incentives`; default "Outcomes and causal pathway" |
| `current` | textarea | yes | 5000 | default empty |
| `gap` | textarea | yes | 5000 | default empty |
| `consequence` | textarea | yes | 5000 | default empty |
| `depth` | select | yes | 500 | Choices: `Unclassified`, `0 Relief`, `1 Repair`, `2 Prevention`, `3 Structure`, `4 Source`, `Several levels`; default "Unclassified" |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `evidence`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `type` | select | yes | 500 | Choices: `Outcome evidence`, `Output description`, `Cost or capacity assumption`, `Feedback and access`, `Rival explanation`; default "Outcome evidence" |
| `measure` | text | yes | 500 | default empty |
| `finding` | textarea | yes | 5000 | default empty |
| `source` | url | no | 500 | default empty |
| `evidence` | select | yes | 500 | Choices: `Unknown or not checked`, `Public description only`, `Observational evidence`, `Causal study`, `Mixed or disputed`, `Hypothesis`; default "Unknown or not checked" |
| `method` | textarea | yes | 5000 | default empty |
| `limits` | textarea | yes | 5000 | default empty |
| `checked` | date | no | 500 | default empty |

**Collection `actions`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `diagnostic` | text | yes | 500 | default empty |
| `owner` | text | yes | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `steps` | textarea | yes | 5000 | default empty |
| `burden` | textarea | yes | 5000 | default empty |
| `complete` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `To do`, `In progress`, `Blocked`, `Done`; default "To do" |

**Collection `learning`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `outcome` | text | yes | 500 | default empty |
| `method` | textarea | yes | 5000 | default empty |
| `rule` | textarea | yes | 5000 | default empty |
| `feedback` | textarea | yes | 5000 | default empty |
| `result` | textarea | yes | 5000 | default empty |
| `date` | date | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `readiness`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not established`, `Needs outside review`, `Evidence recorded locally`, `Needs revision`; default "Not established" |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `notes` | textarea | yes | 5000 | default empty |

#### Partner: field-verification

Final key: `charitology.partner-workspace-v1.field-verification`. Collections: `checks`, `findings`, `safeguards`, `responses`, `actions`, `readiness`.

**Context**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `name` | text | yes | 500 | default empty |
| `question` | textarea | yes | 5000 | default empty |
| `scope` | textarea | yes | 5000 | default empty |
| `sampling` | textarea | yes | 5000 | default empty |
| `method` | textarea | yes | 5000 | default empty |
| `independence` | textarea | yes | 5000 | default empty |
| `consent` | textarea | yes | 5000 | default empty |
| `publication` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Draft`, `Needs evidence`, `Ready for discussion`, `Recorded decision`, `Closed`; default "Draft" |

**Collection `checks`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `claim` | textarea | yes | 5000 | default empty |
| `source` | url | no | 500 | default empty |
| `method` | textarea | yes | 5000 | default empty |
| `sampling` | textarea | yes | 5000 | default empty |
| `limits` | textarea | yes | 5000 | default empty |
| `stop` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Planned only`, `Blocked pending safeguards`, `User note entered — unverified`, `Needs further check`, `Closed locally`; default "Planned only" |

**Collection `findings`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `check` | text | yes | 500 | default empty |
| `kind` | select | yes | 500 | Choices: `No observation — planning example`, `Aggregate user-entered observation`, `Public document comparison`, `Conflicting sources`, `Unable to check`; default "No observation — planning example" |
| `observed` | textarea | yes | 5000 | default empty |
| `interpretation` | textarea | yes | 5000 | default empty |
| `coverage` | textarea | yes | 5000 | default empty |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Draft — unverified`, `Needs evidence`, `Awaiting response`, `Ready for discussion`, `Closed locally`; default "Draft — unverified" |

**Collection `safeguards`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `risk` | textarea | yes | 5000 | default empty |
| `control` | textarea | yes | 5000 | default empty |
| `stop` | textarea | yes | 5000 | default empty |
| `owner` | text | yes | 500 | default empty |
| `evidence` | textarea | yes | 5000 | default empty |
| `status` | select | yes | 500 | Choices: `Unresolved — do not proceed`, `Under review`, `User records a resolution`, `Needs recheck`; default "Unresolved — do not proceed" |

**Collection `responses`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `finding` | text | yes | 500 | default empty |
| `question` | textarea | yes | 5000 | default empty |
| `response` | textarea | yes | 5000 | default empty |
| `provenance` | textarea | yes | 5000 | default empty |
| `change` | textarea | yes | 5000 | default empty |
| `date` | date | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not sought`, `Planned`, `User-entered response — unverified`, `Correction pending`, `Closed locally`; default "Not sought" |

**Collection `actions`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `To do`, `In progress`, `Blocked`, `Done`; default "To do" |
| `notes` | textarea | yes | 5000 | default empty |

**Collection `readiness`**

| Field | Kind | Required on submit | Max code units | Exact choices/default/bounds |
| --- | --- | --- | ---: | --- |
| `title` | text | yes | 500 | default empty |
| `owner` | text | no | 500 | default empty |
| `status` | select | yes | 500 | Choices: `Not established`, `Needs outside review`, `Evidence recorded locally`, `Needs revision`; default "Not established" |
| `source` | url | no | 500 | default empty |
| `date` | date | no | 500 | default empty |
| `notes` | textarea | yes | 5000 | default empty |

## Source inventory pins and future checks

The following byte identities describe the actual source inspected for this proposal. They are provenance of the schema decision, not a requirement that a future presentation-only edit retain identical source bytes. Golden semantic tests must compare the complete inert definitions above with real producers, including dynamic case/cause/framework IDs and default values; presentation labels alone do not silently reinterpret stored fields. Read-only R1 baseline `src/data/countries.json` stays unchanged. Research/partner/native adapters retain their released shape and own import limits.

| Inspected source | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/components/DepthCensus.astro` | 14277 | `312b6f418a1af7c721bea4d01b1f71a7e06897cbe998902c4d0326a7328feb5d` |
| `src/components/programs/PartnerWorkspace.astro` | 26718 | `c34702ffc0e05bbe4c7a785f61724e3a087a990d5f73270b6074cbf1cd821b95` |
| `src/components/programs/ResearchWorkspace.astro` | 6804 | `428a01557f6822f5c96cddbc3ebe3132fca1525e7faad63572695bec9a04a999` |
| `src/components/programs/cause-census.astro` | 9010 | `9c616eff8b48d7869b728d175f7d46297accbfb89b0c6d128fdd084962d48b33` |
| `src/components/programs/evidence-reviews.astro` | 6691 | `3502979b82c2b517e1aa9346c8db84dad47367d6e8a8df316deca31fe448f13c` |
| `src/components/programs/failure-lab.astro` | 6265 | `fa2be87d55c1e2365d502509f99415dc204fae2bc93e6278e396b68ef0398d72` |
| `src/components/programs/history-of-charity.astro` | 9514 | `7a6d7b4454cc6174c83e25949fba2aba44ad8cf60c6b548d3f67cc4b39136eb6` |
| `src/components/programs/methods-lab.astro` | 10450 | `cfe2029e18f5164f0df8cd6de3dc1bc601ede7117e70659d1e78952f0b5327ff` |
| `src/components/programs/moral-frameworks-program.astro` | 8361 | `ef6d81479a2a2dde464ff1cbbf0a94168005843010bc8cc016a38d28e39b3067` |
| `src/components/programs/replication-program.astro` | 1590 | `7e7d8d28fd7b680d8a28df86b4fe2f5c38c2ab25507e417d1fe4aba5a5a46b3c` |
| `src/components/record/charitology-100.astro` | 12295 | `1ec1079eedf2e0c8096d64e8b7bcafa7c31c535b528311fdfc7dcfac4cffe8e8` |
| `src/components/record/country-profiles.astro` | 20362 | `f69ba7cb354d05b6572dc9cd191343e9d43d110f2c8ec456c000424d851ca7fe` |
| `src/components/record/journal.astro` | 11379 | `cd39349323e894ddee5a03e9edf8b4da9b77203149e91c53954418b88e064682` |
| `src/content/cases/carnegie-libraries.md` | 4936 | `84a7487e71e29b55382185802c91da036b45e59fa6869853f6ee16b053886e82` |
| `src/content/cases/dare.md` | 4986 | `f1a09b302d257a42c26698dae5b86d3130ef1019c6120114bf86a502590fd565` |
| `src/content/cases/green-revolution.md` | 5145 | `435108f0b5bf0b1da4bd4cd08f7430dba2841714295489d6773c31f14913d8d5` |
| `src/content/cases/haiti-earthquake-reconstruction.md` | 5688 | `7cf8153c305090495f37cec33cc64f8d82e1af09f6d104e068a835d819836b15` |
| `src/content/cases/hookworm-campaign.md` | 4373 | `62a136889888521301241a5730fe5a6e086ce3035e83ee8dd050d21ea11e7a61` |
| `src/content/cases/ice-bucket-challenge.md` | 4304 | `0803922e180f38e35b79c6d8f52cbf6ba45c6ee26b769dd7e66dc21e447f5a92` |
| `src/content/cases/one-laptop-per-child.md` | 5024 | `fa0c6751c2c3e2d75b3c74246c4065ae0859ea40811315ec069a3b181f089dbd` |
| `src/content/cases/oral-rehydration-therapy-spread.md` | 4935 | `bf4d833274e25ddc03c23f5ea29e70d830ecfa0a1d2daca0eb2ab02bd2222ad3` |
| `src/content/cases/playpumps.md` | 5202 | `b900fc4a0798ccbb9bb2f08fde6b591a435b01129a8e3301bc30e323715242cf` |
| `src/content/cases/polio-eradication.md` | 4856 | `e49d5f1d1f7de6696daf6d470f9a6b3028b8b2679bf3f0cd85eb7e9ced5d3191` |
| `src/content/cases/rosenwald-schools.md` | 5205 | `bea302caaeeafbeaa833a248b85780008d553fe9afa5e0123bdf9f64b94b9da6` |
| `src/content/cases/scared-straight.md` | 4800 | `04a5ceb8cc6ff169541b0341fd851aa849721dc4ccd8f29f641f7dcd8c787ff0` |
| `src/content/cases/smallpox-eradication.md` | 2383 | `0044154ea72ec456dc979d4fbe4a94c1d003ec2018bab745497ad290d91146ae` |
| `src/data/causes.json` | 7372 | `1a3193009e02f928992758ca1adba7b53588fd136f2a8f6bb929701cbe0df571` |
| `src/data/countries.json` | 192713 | `8f4a71e525a8b7765691f211b7d94a6d4fed02746a19060b88f196d137f74543` |
| `src/data/frameworks.json` | 5552 | `459d64e3913ce1fb486441ffc06bf6ed030fcc171da1d75d65919db9b50666cf` |
| `src/data/partner-advisory.ts` | 40714 | `9abb5ca98e08024526b0acdc8888b8be17f833e94d1ba58d46ec108826ce6ef3` |
| `src/data/partner-funding.ts` | 73062 | `c93469f9e2ed13abbe21343a1fdb0791fc149921642b62f4d29af99c1a5653eb` |
| `src/data/partner-programs.ts` | 1941 | `16f9d67a02b6cd5ca5c4ad206308435d5ed66b5483fae9c5f21f73fcf7bb1790` |
| `src/data/partner-types.ts` | 1962 | `ebd44a0f94771e1877af362692ae407acebd5f39ad1868031e10a13da4dd1353` |
| `src/data/program-graph-adapters.ts` | 145206 | `f138e38985df23c3476f95fe7a3391d23bd3d49a9b273e620ed090b9eaded35c` |
| `src/data/research-artifact-adapters.ts` | 19540 | `063ec7097c23429c13226e9b9bb77ab5f1650cca3aaf94d48e0d3c1c111ff20e` |
| `src/lib/client/completion-models.ts` | 3752 | `7ec7680a66d299c84022434ecd44d9a7032721cc0a5477704915f77c49700027` |
| `src/lib/client/partner-programs.ts` | 20134 | `592b9ce2e368a57db74e4e207de8e4cb769ff67e366308a8ee5fa73e2fb7f205` |
| `src/lib/client/research-programs.ts` | 25032 | `f88ad633cb65442f4fbb90b262c54e45b4628fd9fcdd22cbe9feb2c57bdedd49` |
| `src/lib/research-program-catalog.ts` | 1174 | `87a4c960e9005095a1589b1978af3c39f51255c48dcb55d2d49c87f45cf5236c` |

Required executable checks mirror the plan: all twenty actual mounts/configs, source/native compatibility, exact and excessive whole bytes, isolated exact-key persistence, one shared async save/restore/example/replacement lane under held digests/locks and preview floods with immediate superseded payload release/settlement, owned view/source/file generations, untouched-field substitution invalidated by first explicit event including edit→return and sanitized-empty→explicit-clear, admitted failed-new→edit→Retry→resubmit preserving one row/ID with pre-admission refusal leaving no dangling ID, failed intent versus newer raw forms, corrupt A/B/C, duplicate/future data, notification errors and large-file browser acceptance. TypeScript must compile all declaration/example blocks above together using actual producer imports and strict DOM/ES2022. Tests can control browser storage/locks/readers in excluded fixtures; public modules never expose arbitrary authority callbacks. Runtime implementation, build/CI/browser/publication and human review remain pending until separately recorded.

Root accepted this corrected contract for implementation on October 27, 2026 after independent code-grounded review. The shared preparation bound, untouched-field identity and admitted-new-row identity are required behavior, not optional enhancements. This freeze does not claim runtime, native browser, CI, publication or human review acceptance.

## Accepted raw-byte transport refinement

Root accepted a narrow implementation refinement after the original freeze: a genuine ordinary fixed ArrayBuffer-backed Uint8Array with the exact native prototype transports only its indexed bytes. Unrelated own properties are ignored and never invoked, copied or treated as authority. Enumerating every own byte-index property at 32–48 MB would itself create an excessive property-name inventory. Intrinsic view/buffer getters and native destination allocation plus Uint8Array set must reject proxy, subclass, shared, resizable or detached substitutes without looking up a source constructor, species, iterator or custom method. Native object/schema admission still rejects accessors and decorated structures. Adversarial throwing decorations and complete large-byte inputs require explicit tests; this changes no key or model authority.
