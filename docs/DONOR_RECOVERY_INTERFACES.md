# Donor recovery interfaces

Pre-implementation contract · October 27, 2026 · AI-assisted · review: draft. Read the [plan](DONOR_RECOVERY_PLAN.md). All declarations below specify future code, not an existing runtime API. Preserve legacy keys and JSON shapes; no released L1 helper is changed.

## Constants, keys and snapshots

The adapter and control modules live under the D1 namespace, initially `src/lib/client/donor-recovery.ts` and `donor-recovery-controls.ts`. Per-tool schema ownership can use `donor-recovery-schemas.ts`; the caller integration replaces the opt-in durable-store imports together. `store.ts` URL/hash helpers remain unchanged. No fallback shape-only validator is permitted for a writable key.

The fourteen suffixes below are the entire allowlist. Schema code cannot runtime-import storage-bearing `gifts.ts`; use its types only and pure inert cause data/structural validation. Duplicate saved gift IDs are refused/protected, not regenerated during load. No storage-key discovery is added.

```ts
import type { Gift as D1Gift } from "../src/lib/client/gifts";
import type { LegacyPlan as D1LegacyPlan } from "../src/lib/client/legacy";
import type { CardState as D1CardState } from "../src/lib/client/giftcard";
import type { DiligenceState as D1DiligenceState } from "../src/lib/client/diligence";
import type { Draft as D1ImpactDraft } from "../src/lib/client/theory-of-change";
type D1Hash = string; //64 lowercase SHA-256 hex
type D1Key =
  | "gifts"
  | "portfolio"
  | "legacy"
  | "gift-card"
  | "ce-models"
  | "due-diligence"
  | "grant-proposals"
  | "grant-weights"
  | "grant-draft"
  | "impact-drafts"
  | "split"
  | "compass"
  | "disaster-plan"
  | "wrapped";
type D1StandaloneKey = Exclude<
  D1Key,
  "grant-proposals" | "grant-weights" | "grant-draft"
>;
type D1Code =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
type D1ErrorCode =
  | D1Code
  | "invalid_data"
  | "input_limit"
  | "input_changed"
  | "stale_view"
  | "superseded"
  | "foreign_owner"
  | "used_authority"
  | "preview_required"
  | "discard_required"
  | "reentrant_call"
  | "pending_operation";
type D1Present<T> =
  { readonly present: false } | { readonly present: true; readonly value: T };
type D1Current<T> =
  | { readonly hasState: false; readonly value: null; readonly hash: null }
  | { readonly hasState: true; readonly value: T; readonly hash: D1Hash };
interface D1Status {
  readonly key: D1Key;
  readonly generation: number; //safe nonnegative integer, advances on authority-invalidating changes
  readonly observedRaw: string | null | undefined; //undefined=read denied, null=key absent
  readonly persistence: "saved" | "absent" | "unsaved-memory" | "unreadable";
  readonly code: D1Code;
  readonly message: string;
  readonly unsaved: boolean;
  readonly pendingOperation: "set" | "remove" | null;
  readonly hasUndo: boolean; //not derived from the undo value's nullability
  readonly canWrite: boolean;
  readonly canRecover: boolean;
  readonly canRetryPersist: boolean;
}
type D1Snapshot<T> = Readonly<D1Status & D1Current<T>>;
declare const D1_LIMITS: {
  readonly individualBackupBytes: 8_000_000;
  readonly grantBundleBytes: 24_008_192;
  readonly jsonDepth: 32;
  readonly fileReadTimeoutMs: 30_000;
  readonly pendingFullReplacements: 1; //in addition to at most one running operation
};
interface D1PortfolioRecord {
  allocation: Record<string, number>;
  alternative?: Record<string, number>;
  budget: number;
  state?: { w: number[]; b: number; t: number }; //t=-100..100 from the actual producer
  method?: string;
  savedAt?: string;
}
interface D1SavedCEModel {
  id: string;
  name: string;
  unit: string;
  discount: string;
  seed: string;
  savedAt: string;
  values: Record<
    "cost" | "people" | "works" | "effect" | "years" | "anyway",
    [string, string, string]
  >;
}
interface D1SplitPlan {
  total: number | null;
  rows: {
    id: string;
    cause: string;
    name: string;
    url: string;
    share: number | null;
    done: boolean;
  }[];
  source: string;
  savedAt?: string;
}
interface D1CompassRecord {
  weights: Record<string, number>;
  position: Record<string, number>;
  answers: { d: number[]; s: number[] };
  savedAt: string;
}
interface D1ValueMap {
  gifts: D1Gift[];
  portfolio: D1PortfolioRecord;
  legacy: D1LegacyPlan;
  "gift-card": D1CardState;
  "ce-models": D1SavedCEModel[];
  "due-diligence": D1DiligenceState;
  "grant-proposals": D1GrantProposal[];
  "grant-weights": Record<string, number>;
  "grant-draft": D1GrantProposal | null;
  "impact-drafts": { v: 1; current: string; drafts: D1ImpactDraft[] };
  split: D1SplitPlan;
  compass: D1CompassRecord;
  "disaster-plan": {
    amount: number;
    shares: Record<"relief" | "recovery" | "preparedness", number>;
    what: string;
  };
  wrapped: { year: string; hide: boolean };
}
```

The full key and lock are `charitology.${key}`. The namespaced cell tracks `hasState` and `hasUndo` independently; `T` may include null. Whether saved null is valid is decided by that key's deterministic semantic validator. Never accept a stored wrapper as an internal trusted state. An absent key can expose a validated default without writing it; persistence remains absent. A corrupt initial key has no valid saved state and exposes recovery, rather than silently showing a saved blank form.

Snapshots/candidates are owned immutable values. UI working objects are detached copies. `observedRaw` exposes only this already-authorized key, not a storage scan. Protected and latest observed raw copies remain separate methods. Exact strings, not hashes alone, are used for disk comparison.

These are type-only imports; the new pure registry does not runtime-import `gifts.ts`. Only grant-draft accepts saved JSON null. Canonical producer rules supply exact known cause/framework/dimension/question IDs, bounds and complete maps. CE writer fields have no old per-string maxlength, so their complete wrapper bound applies; do not invent 40/20/12-character saved-field caps from unrelated fill controls. Compass/portfolio read aliases do not define their producer's validator. Optional producer fields use an explicit named omission projection; unknown fields are never silently cleaned away.

Portfolio has two explicit branches: a complete current producer record, or a historical supported record with allocation/budget and optional absent alternative/state/method/savedAt. Optional means absent; present null, false, empty-string stand-ins or malformed objects do not become absence. Present method/savedAt retain any nonempty string, including historical method `best`; do not add a shares-only or Date.parse restriction. Preserve every admitted field. Current state uses eight finite 0…100 weights, nonnegative budget and tilt −100…100. Do not silently renormalize allocation maps or demand exact floating-point sum 1. A budget/state.b mismatch is protected/refused if the validator enforces that relation, never overwritten to make it match.

Date admission remains key-specific: gifts require their real calendar-day roundtrip; CE, diligence and measurement retain Date.parse-compatible timestamp strings; Legacy/Split savedAt is an optional nonempty string up to 40, not necessarily a date; grant savedAt is any optional string; measurement reviewDate is blank or its old YYYY-MM-DD shape. No blanket ISO-only rule or new date repair is added. Saved maps/strings that a former loose cleaner would change are protected/refused, not quietly cleaned. Empty/whitespace diligence notes are producer-valid strings and must remain exact.

## Dependencies, view binding and owned capture

```ts
interface D1Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface D1Locks {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    run: () => Promise<T>,
  ): Promise<T>;
}
interface D1ViewState {
  readonly formGeneration: number;
  readonly recoveryGeneration: number;
  readonly hasUnsubmittedForm: boolean;
}
declare const D1_VIEW_OWNER: unique symbol;
interface D1ViewTracker {
  readonly [D1_VIEW_OWNER]: true;
  snapshot(): D1ViewState;
  changedForm(): D1ViewState; //increments form generation and sets unsubmitted=true
  changedRecovery(): D1ViewState; //increments recovery generation immediately
  markFormSaved(generation: number): boolean; //clears dirty only if this is still the exact current generation
  discardedForm(): D1ViewState; //explicit tab-only discard, increments form generation; no saved-state write
  dispose(): void;
}
declare function createD1ViewTracker(): D1ViewTracker;
interface D1Dependencies {
  storage?: D1Storage;
  locks?: D1Locks | null;
  cryptoAvailable?: boolean;
  digest?: (ownedBytes: Uint8Array) => Promise<D1Hash>;
}
interface D1OpenOptions extends D1Dependencies {
  view: D1ViewTracker;
}
declare const D1_CAPTURE_OWNER: unique symbol;
interface D1SaveCapture<T> {
  readonly format: "charitology-d1-save-capture";
  readonly version: 1;
  readonly key: D1StandaloneKey;
  readonly value: T;
  readonly formGeneration: number;
  readonly recoveryGeneration: number;
  readonly [D1_CAPTURE_OWNER]: true;
}
declare const D1_RECOVERY_OWNER: unique symbol;
interface D1RecoveryPreview<T> {
  readonly format: "charitology-d1-recovery-preview";
  readonly version: 1;
  readonly kind: "restore" | "clear";
  readonly key: D1StandaloneKey;
  readonly candidate: D1Present<T>;
  readonly candidateHash: D1Hash | null;
  readonly expectedGeneration: number;
  readonly expectedMemoryHash: D1Hash | null;
  readonly expectedObservedRawHash: D1Hash | null;
  readonly formGeneration: number;
  readonly recoveryGeneration: number;
  readonly [D1_RECOVERY_OWNER]: true;
}
type D1RestorePreview<T> = D1RecoveryPreview<T> & { readonly kind: "restore" };
type D1ClearPreview<T> = D1RecoveryPreview<T> & { readonly kind: "clear" };
```

All public operation entries synchronously validate/capture their arguments before awaiting. Reject getters, custom prototypes, decorated arrays, sparse arrays, cycles and nonfinite values. Key, dependencies and opaque tracker identity are captured on open. Canonical defaults and validators come only from the fixed semantic registry, not caller options. `captureSave` bounds and detaches the full candidate synchronously, records the view epochs and registers it in a private owner WeakMap. The hash/schema/whole-backup checks finish before memory assignment. It is not a plain prepared mutation accepted from JSON.

The module recognizes its own tracker with a private WeakMap and reads its primitive state directly. A copied object or method override is refused; it cannot substitute an observer or execute caller code under a lock. Tracker bookkeeping is not proof of persistence. `markFormSaved` is called by the actual UI only after an authentic saved/no-op result for the matching generation. Operation completion rendering is outside critical sections; no public under-lock callback API exists. Reentrant entry from injected dependency callbacks is refused before acquiring another lock.

Every real input/change/reset/record or source selection increments `formGeneration` before initiating work. Each recovery file choice, clear/reload/undo decision and other authority-invalidating choice increments `recoveryGeneration` immediately. The control owner invalidates pending file callbacks/visible Apply at that moment. Store generations independently bind memory/disk authority. A boolean `hasUnsubmittedForm` is an honest UI warning, not a promise those fields are included in the saved-record backup.

## Exact application-facing facade

```ts
interface D1SaveResult<T> {
  readonly outcome: "saved" | "unsaved" | "no-op" | "superseded";
  readonly formGeneration: number;
  readonly snapshot: D1Snapshot<T>;
}
interface D1ReloadOptions {
  discardUnsaved?: boolean;
} //explicitly covers failed-memory AND unsubmitted DOM loss
interface D1ToolSession<T> {
  snapshot(): D1Snapshot<T>;
  captureSave(value: T): D1SaveCapture<T>; //synchronous owned full-value capture
  saveCaptured(capture: D1SaveCapture<T>): Promise<D1SaveResult<T>>;
  retryPersist(): Promise<D1Snapshot<T>>; //same valid candidate/intended operation, never replay
  previewRestore(
    raw: string | Uint8Array,
    options?: D1ReloadOptions,
  ): Promise<D1RestorePreview<T>>;
  restore(preview: D1RestorePreview<T>): Promise<D1Snapshot<T>>;
  previewRemove(options?: D1ReloadOptions): Promise<D1ClearPreview<T>>;
  remove(preview: D1ClearPreview<T>): Promise<D1Snapshot<T>>;
  undo(options?: D1ReloadOptions): Promise<D1Snapshot<T>>;
  reload(options?: D1ReloadOptions): Promise<D1Snapshot<T>>;
  noticeExternalChange(): D1Snapshot<T>; //no disk adoption or write; blocks and invalidates
  backup(): Promise<string>; //complete valid current record, not arbitrary HTML input
  protectedRawCopy(): string | null | undefined;
  observedRawCopy(): string | null | undefined;
  dispose(): void;
}
declare function openD1ToolSession<K extends D1StandaloneKey>(
  key: K,
  options: D1OpenOptions,
): Promise<D1ToolSession<D1ValueMap[K]>>;
```

`await openD1ToolSession(key,{view})` is initialization and load. It selects the fixed canonical producer validator/default for that key; unknown keys, validator overrides and extra options are refused. A test-only generic cell factory can accept a checker through a separate entry point that application imports cannot use. There is no old synchronous `load/save/remove` persistence facade. `snapshot()` reads already-loaded memory only; it does not reread/adopt disk. `reload()` is an explicit awaited recovery operation. URL/hash helpers remain separate synchronous helpers.

The facade serializes its own operations. There is at most one running operation plus one unstarted full replacement. A newer captured full replacement supersedes the unstarted one with an explicit result; do not grow an unbounded autosave queue. At the queue head, it checks current view epochs, validates the exact owned value, binds current memory and then acquires the full-key lock. It checks view/caller ownership after asynchronous validation and again immediately before mutation under lock. New input makes an older uncommitted capture superseded; it cannot clear a newer dirty form. Earlier own successful operations may precede this newly captured full replacement; a foreign disk change instead blocks it. No automatic replay/rebase over foreign data occurs.

A save capture is consumed once at entry to `saveCaptured`; failed persistence is retried through the internal candidate, not by reusing that capture. Recovery previews are private one-use objects, bound to store instance, key, kind, exact baseline and generations. `remove` accepts only a clear preview and removes only that key. No copied/rehashed object is authority. Unsupported lock/crypto mode refuses all mutations without optimistic fallback.

A value-save no-op is permitted only if the exact readable observed saved baseline still represents the requested value, `persistence==='saved'` and `unsaved===false`. Compare under the lock. An absent default or valid failed-write memory candidate equal to a new capture must attempt persistence or remain unsaved; memory equality must never produce a false Saved no-op. A requested removal of an already absent key can be a separately labeled no-op only after an exact fresh absence check and no pending failed operation. New captures are refused while a failed set/remove is pending; retain newer DOM work until exact retry or explicitly warned recovery/reload resolves that intent.

Restore/remove/undo/reload that would discard failed-memory or unsubmitted UI work refuse by default. Only a separately explained deliberate `discardUnsaved:true` choice permits that loss, captured before awaiting and bound to the exact current generations. The UI must distinguish saved-record backup from raw HTML not included in it. Downloading alone neither sets this choice nor grants authority. Preview choices carry it privately; apply accepts no new mutable discard flag. Newer work invalidates that permission. Unknown option keys or nonboolean choices are refused.

After a valid set/remove failure, `unsaved` remains true, valid current memory/intent is exportable, and saved bytes remain distinct. `retryPersist` checks the same baseline under the lock and retries the same bytes or remove. After validation/size failure before assignment, retain the prior valid memory and newer UI input; offer its page-appropriate raw form recovery. Successful reload invalidates old undo/captures/previews. Failed reload must retain valid memory and raw recovery instead of claiming that the saved copy loaded.

## Compilable standalone integration example

This example shows the required await/generation behavior, not a new UI implementation. Actual adapters use their real validators. A save result may not reset a newer form. Tool-specific native exports remain available for unsubmitted raw fields; generic record backup does not silently collect them.

```ts
type ExampleCard = D1ValueMap["gift-card"];
declare function readExampleCard(): ExampleCard;
declare function renderExampleCard(value: ExampleCard): void;
declare function announceD1(message: string): void;
declare function setExampleEnabled(enabled: boolean): void;
async function exampleCardIntegration(): Promise<void> {
  const view = createD1ViewTracker();
  setExampleEnabled(false);
  const session = await openD1ToolSession("gift-card", { view });
  const loaded = session.snapshot();
  if (loaded.hasState) renderExampleCard(loaded.value);
  else announceD1(loaded.message); //do not render an apparently saved blank from corrupt data
  setExampleEnabled(loaded.canWrite);
  async function onInput(): Promise<void> {
    view.changedForm();
    const capture = session.captureSave(readExampleCard());
    try {
      const result = await session.saveCaptured(capture);
      if (result.formGeneration !== view.snapshot().formGeneration) {
        announceD1("Earlier work completed; newer input remains in this tab.");
        return;
      }
      if (result.outcome === "saved" || result.outcome === "no-op") {
        view.markFormSaved(result.formGeneration);
        announceD1("This record is saved in this browser.");
      } else if (result.outcome === "unsaved")
        announceD1(result.snapshot.message);
    } catch (error) {
      if (capture.formGeneration === view.snapshot().formGeneration)
        announceD1(
          error instanceof Error ? error.message : "Saving was refused.",
        );
    }
  }
  async function onExplicitRemove(): Promise<void> {
    view.changedRecovery();
    //A real UI first explains saved/unsaved scope and obtains a deliberate discard choice.
    const preview = await session.previewRemove({ discardUnsaved: true });
    //A separate deliberate confirmation applies this exact reviewed removal.
    const result = await session.remove(preview);
    announceD1(
      result.unsaved
        ? "Removal has not persisted. Keep a recovery copy."
        : "Only this tool key was removed.",
    );
  }
  void onInput;
  void onExplicitRemove;
}
```

The facade must not trust this example's announcement/tracker bookkeeping to clear its own failed-write state. Controllers disable actions while initialization is incomplete, record dirty input before awaiting, and never set a Saved label from Promise truthiness. All twelve actual scripts must adopt equivalent behavior. Measurement's pending timer and CE's explicit library save have different raw-form scopes; preserve those distinctions. Native gift/measurement imports need their own file/selection generation guards too.

## Backups, raw copies and controls

```ts
interface D1IndividualBackup<T> {
  format: "charitology-local-draft";
  version: 1;
  key: D1Key;
  exportedAt: string;
  value: T;
}
interface D1RawRecovery {
  format: "charitology-raw-saved-copy";
  version: 1;
  key: D1Key;
  copy: "protected" | "observed";
  raw: string;
}
declare function d1IndividualBackup<K extends D1Key>(
  key: K,
  value: D1ValueMap[K],
  exportedAt: string,
): string;
declare function parseD1IndividualBackup<K extends D1Key>(
  raw: string | Uint8Array,
  key: K,
): D1ValueMap[K];
declare function d1RawRecovery(
  key: D1Key,
  copy: "protected" | "observed",
  raw: string,
): string;
declare function parseD1RawRecovery(raw: string | Uint8Array): D1RawRecovery;
interface D1RecoveryControls {
  refresh(): void; //snapshot/status render only; no generation change or disk adoption
  noteFileChoice(): void; //immediate authority invalidation, before any file await
  noteViewMutation(): void;
  dispose(): void;
}
interface D1RecoveryControlsOptions<T> {
  host: HTMLElement;
  session: D1ToolSession<T>;
  view: D1ViewTracker;
}
declare function mountD1RecoveryControls<T>(
  options: D1RecoveryControlsOptions<T>,
): D1RecoveryControls;
interface D1GrantRecoveryControlsOptions {
  host: HTMLElement;
  editor: HTMLElement; //ordinary grant writer controls; shared recovery stays outside it
  coordinator: D1GrantCoordinator;
  view: D1ViewTracker;
}
declare function mountD1GrantRecoveryControls(
  options: D1GrantRecoveryControlsOptions,
): D1RecoveryControls;
declare function assertD1ControlBinding(
  target: D1ToolSession<unknown> | D1GrantCoordinator,
  view: D1ViewTracker,
): void; //engine export for controls only; application components cannot import it
type D1DependencyReader =
  "portfolio-builder" | "one-click-split" | "charitology-wrapped";
type D1DependencyKey<R extends D1DependencyReader> =
  R extends "portfolio-builder"
    ? "compass"
    : R extends "one-click-split"
      ? "portfolio"
      : "gifts";
type D1DependencyRead<T> =
  | {
      readonly code: "saved";
      readonly value: T;
      readonly rawHash: D1Hash | null;
    }
  | {
      readonly code: "absent" | "corrupt" | "read_error";
      readonly message: string;
    };
declare function readD1Dependency<R extends D1DependencyReader>(
  reader: R,
  options?: Pick<D1Dependencies, "storage" | "cryptoAvailable" | "digest">,
): Promise<D1DependencyRead<D1ValueMap[D1DependencyKey<R>]>>;
```

Individual wrapper identity stays compatible; no revision or trusted marker is inserted into an old value. Preserve the legacy serializer's **no terminal newline** convention. Use its exact whole pretty UTF-8 bytes, including metadata, for the 8,000,000-byte limit. A normal export with a later exportedAt timestamp must still fit the admitted record; size checks reserve the complete timestamp/envelope. Require an actual old-serializer exact-8,000,000 fixture to import/re-export, and +1 refusal. The new grant bundle may use a defined terminal newline independently. Exact source strings are retained. Null/0/false/blank are not interchangeable.

The shared recovery controller owns file objects/bytes, separate read generations and previews; it never accepts a raw plain `expected` string as public apply authority. Every file choice first removes old Apply/Clear, captures selected identity, reads owned actual bytes within the 30-second deadline and rechecks all generations. A late result is ignored, not rendered as a newer preview. New commands/reload/undo/clear/dispose/external changes revoke outstanding file authority. A valid preview changes neither memory nor disk.

Protected A and observed B/C recovery exports use the lossless wrapper. Parsing it recovers exact JS code units; it does not grant write authority or silently restore that raw string. The complete raw wrapper has a separate 64,000,000 UTF-8-byte cap; refusal is visible and never truncates a copy. Plain UTF-8 text is optional only if encode/decode equality succeeds. Unknown future/corrupt/oversize material can remain an inert private archive, never labeled normal-restorable. Read denial yields no fake raw copy.

Controls expose current validated record backup, protected/observed raw copies, exact failed-persist retry, explicit reload, reviewed individual restore, reviewed key-only remove and guarded undo where available. Explanations say whether a backup excludes open unsubmitted HTML input. Download actions say requested/generated, not saved. No arbitrary remote URL, provider call or data submission exists.

The mount verifies that session and tracker are owned and share the same private view identity. It renders into the explicit host, not an arbitrary discovered first tool. It owns the file input, confirmation controls and read generations. `noteFileChoice` immediately advances the tracker recovery generation and revokes pending file/Apply/Clear authority; `noteViewMutation` revokes stale previews after the caller already advanced the form generation. No public callback runs under a lock. After a successful saved restore/remove/reload/undo the shared controls deliberately reload the page to hydrate its ordinary script; an unsaved/failure result never reloads. Any loss of unsubmitted fields requires the generation-bound explicit discard choice first. Native tool actions can use the same session without mounting a second cell.

The grant variant verifies its coordinator/view identity, owns the three-member source/step controls and keeps the explicit editor inert while recovery is partial, pending or inconsistent. Recovery/export/retry stay outside that editor. It never reloads after one successful member of an incomplete plan. It may reload after complete success or a separately warned explicit reload; no hidden step loop or continuation occurs. Dispose removes only its own controls/listeners and restores only the editor inert state it owned. Runtime coordinator guards still refuse ordinary writes while incomplete, even if a caller forgets to disable a button.

`refresh` renders current snapshot/status after the tool's own awaited save/delete/failure or storage notice. It does not advance tracker generations, adopt disk or revoke an otherwise current preview. It can hide an already invalid preview whose stored bindings no longer match. `noteViewMutation` remains the explicit preview invalidation method. The controls use engine-only `assertD1ControlBinding` to verify private target ownership and the exact same owned tracker, not only matching key strings. Static application-import checks forbid that internal assertion outside the controls/tests; it grants no write lease.

`readD1Dependency` has an exact reader→key map: Builder→Compass, Split→Portfolio, Wrapped→gifts. It performs a read of only that one saved key using the fixed canonical producer schema. It returns a detached immutable value or explicit absence/error; no fallback default, writer, recovery controls, raw preview or lock lease. It never opens a writable session or scans keys. The returned value is a saved snapshot, not a promise of the latest live source. It works read-only without Web Locks; rawHash can be null if secure hashing is unavailable.

## Grant values, bundle and vector

The exact nine grant criteria IDs are depth, evidence, counterfactual, feedback, voice, cost, durability, team and harm. These declarations match the current envelope shape; validators enforce complete maps of those IDs and exact limits without cleaning them. Weights are integers 0…10; scores are null or integers 0…4. Names are at most 120 and notes at most 4,000 UTF-16 code units. A library ID must be nonempty and unique; a draft may use an empty ID. Do not invent an ID regex/length cap or savedAt parse/length cap absent from the existing producer contract.

```ts
interface D1GrantProposal {
  id: string;
  name: string;
  savedAt?: string;
  scores: Record<string, 0 | 1 | 2 | 3 | 4 | null>;
  notes: Record<string, string>;
}
type D1GrantValues = {
  "grant-proposals": D1GrantProposal[];
  "grant-weights": Record<string, number>;
  "grant-draft": D1GrantProposal | null;
};
type D1GrantKey = keyof D1GrantValues;
type D1GrantMember = {
  [K in D1GrantKey]:
    | {
        readonly key: K;
        readonly presence: "absent";
        readonly persistence: "saved" | "unsaved-memory";
      }
    | {
        readonly key: K;
        readonly presence: "value";
        readonly persistence: "saved" | "unsaved-memory";
        readonly value: D1GrantValues[K];
      };
}[D1GrantKey];
interface D1GrantBundle {
  format: "charitology-grant-workspace";
  version: 1;
  exportedAt: string;
  members: readonly D1GrantMember[]; //exact three keys, fixed library/weights/draft order
}
type D1GrantVector = Readonly<{
  [K in D1GrantKey]: {
    readonly generation: number;
    readonly hasState: boolean;
    readonly memoryHash: D1Hash | null;
    readonly observedRawHash: D1Hash | null;
  };
}>;
type D1GrantWriteSet = Readonly<Partial<D1GrantValues>>; //one or more own known keys; value null may be meaningful
type D1GrantIntent = {
  [K in D1GrantKey]:
    | {
        readonly key: K;
        readonly operation: "set";
        readonly value: D1GrantValues[K];
      }
    | { readonly key: K; readonly operation: "remove" };
}[D1GrantKey];
interface D1GrantPending {
  readonly origin: "save" | "restore" | "remove";
  readonly remaining: readonly D1GrantIntent[];
  readonly completed: readonly D1GrantKey[];
  readonly sourceHash: D1Hash | null;
}
type D1GrantMemberOutcome = "saved" | "unsaved" | "no-op" | "not-attempted";
interface D1GrantSnapshot {
  readonly members: {
    readonly [K in D1GrantKey]: D1Snapshot<D1GrantValues[K]>;
  };
  readonly pending: D1GrantPending | null;
  readonly partial: boolean;
  readonly consistency:
    "consistent" | "partial" | "inconsistent" | "unreadable";
  readonly message: string;
}
interface D1GrantWriteResult {
  readonly outcomes: Readonly<
    Partial<Record<D1GrantKey, D1GrantMemberOutcome>>
  >;
  readonly formGeneration: number;
  readonly snapshot: D1GrantSnapshot;
}
```

Absent and a valid null draft value have different representations. Weights null is invalid saved data: the old null load fallback became equalWeights before use, not a persisted null. The fixed registry creates that actual validated default for an absent weight key. For an absent member, persistence saved means an observed absent key, while unsaved-memory means a retained pending removal; neither means a stored null. Every individual wrapper must pass its own 8,000,000-byte cap and the complete bundle its 24,008,192-byte cap. The full cap is checked after all metadata/formatting; refuse the entire bundle and offer individual copies if needed. Unsupported/unreadable members prevent a valid complete-bundle claim. Preserve their raw copies separately.

The current draft's nonempty ID must reference the supplied proposal library or be explicitly marked as an unsupported relationship before apply. Do not silently clear/change its ID. Individual restoration is partial and labeled as such. Preserve null scores versus explicit zero and unchanged weight scale; no grant decision or approval is inferred.

## Closed grant coordinator

```ts
declare const D1_GRANT_CAPTURE_OWNER: unique symbol;
interface D1GrantSaveCapture {
  readonly format: "charitology-d1-grant-save-capture";
  readonly version: 1;
  readonly values: D1GrantWriteSet;
  readonly formGeneration: number;
  readonly recoveryGeneration: number;
  readonly [D1_GRANT_CAPTURE_OWNER]: true;
}
declare const D1_GRANT_PLAN_OWNER: unique symbol;
interface D1GrantRestorePlan {
  readonly format: "charitology-d1-grant-restore-plan";
  readonly version: 1;
  readonly sourceHash: D1Hash;
  readonly bundle: D1GrantBundle;
  readonly steps: readonly {
    key: D1GrantKey;
    state: "ready" | "applied" | "failed" | "changed";
    message: string;
  }[];
  readonly vector: D1GrantVector;
  readonly [D1_GRANT_PLAN_OWNER]: true;
}
declare const D1_GRANT_STEP_OWNER: unique symbol;
interface D1GrantStep<K extends D1GrantKey = D1GrantKey> {
  readonly format: "charitology-d1-grant-restore-step";
  readonly version: 1;
  readonly kind: "restore" | "remove";
  readonly key: K;
  readonly sourceHash: D1Hash;
  readonly vector: D1GrantVector;
  readonly candidate: D1Present<D1GrantValues[K]>;
  readonly [D1_GRANT_STEP_OWNER]: true;
}
type D1GrantRestoreStep<K extends D1GrantKey = D1GrantKey> = D1GrantStep<K> & {
  readonly kind: "restore";
};
type D1GrantRemoveStep<K extends D1GrantKey = D1GrantKey> = D1GrantStep<K> & {
  readonly kind: "remove";
};
interface D1GrantStepResult {
  readonly outcome: "saved" | "unsaved" | "no-op";
  readonly plan: D1GrantRestorePlan;
  readonly snapshot: D1GrantSnapshot;
  readonly complete: boolean; //only final fresh locked comparison can establish true
}
interface D1GrantOpenOptions extends D1Dependencies {
  view: D1ViewTracker; //fixed canonical grant schemas/defaults, no caller validation override
}
interface D1GrantCoordinator {
  snapshot(): D1GrantSnapshot;
  captureSave(values: D1GrantWriteSet): D1GrantSaveCapture;
  saveCaptured(capture: D1GrantSaveCapture): Promise<D1GrantWriteResult>;
  retryPending(): Promise<D1GrantWriteResult>;
  bundle(exportedAt: string): Promise<string>;
  desiredBundle(exportedAt: string): Promise<string>;
  individual<K extends D1GrantKey>(key: K, exportedAt: string): Promise<string>;
  previewBundle(
    raw: string | Uint8Array,
    options?: D1ReloadOptions,
  ): Promise<D1GrantRestorePlan>;
  previewStep<K extends D1GrantKey>(
    plan: D1GrantRestorePlan,
    key: K,
  ): Promise<D1GrantRestoreStep<K>>;
  applyStep<K extends D1GrantKey>(
    preview: D1GrantRestoreStep<K>,
  ): Promise<D1GrantStepResult>;
  retryStep(plan: D1GrantRestorePlan): Promise<D1GrantStepResult>;
  previewIndividual<K extends D1GrantKey>(
    key: K,
    raw: string | Uint8Array,
    options?: D1ReloadOptions,
  ): Promise<D1GrantRestoreStep<K>>;
  previewRemove<K extends D1GrantKey>(
    key: K,
    options?: D1ReloadOptions,
  ): Promise<D1GrantRemoveStep<K>>;
  remove<K extends D1GrantKey>(
    preview: D1GrantRemoveStep<K>,
  ): Promise<D1GrantStepResult>;
  reload(options?: D1ReloadOptions): Promise<D1GrantSnapshot>;
  noticeExternalChange(key: D1GrantKey | null): D1GrantSnapshot;
  protectedRawCopy(key: D1GrantKey): string | null | undefined;
  observedRawCopy(key: D1GrantKey): string | null | undefined;
  dispose(): void;
}
declare function openD1GrantCoordinator(
  options: D1GrantOpenOptions,
): Promise<D1GrantCoordinator>;
```

Only the coordinator opens writable grant cells. `openD1ToolSession` refuses grant keys. Every grant operation requiring relationships/vector consistency acquires all three exact locks lexically: draft, proposals, weights. The mutation order is independently library, weights, draft. All updated grant writers use the coordinator, so an overlapping standalone writer cannot evade its vector checks.

There is no public `exclusive`, `withLocks`, observer callback or exposed lock-free cell. Internally, the coordinator creates a private lease in a WeakMap only after holding all three locks; its primitive helpers verify that live lease, exact owned cells and one command before operating. The lease never escapes, is revoked in `finally` and is not serialized. Do not call a cell method that reacquires its lock while holding that lease. The shared opaque tracker supplies primitive epochs without caller code. Injected dependency reentrancy is refused before queueing. Complete/failure rendering occurs only after release.

Ordinary `captureSave` captures one or more complete member values, never a patch, removal marker, arbitrary key or callback. Before the first write validate all candidates, complete bundle capacity and final cross-member references against the overlaid vector. Retain the complete valid pending set. Write known members in library/weights/draft order, stopping at the first failure. Return explicit per-member outcomes, including not-attempted; keep unattempted candidates exportable in `snapshot.pending`. Pending operations explicitly carry set versus remove; null is never a removal marker. Complete bundle export overlays known successful members plus retained pending intents, labeling pending values/removals unsaved-memory. Exact retry continues only that owned remaining set against the known successful saved bytes and unchanged foreign baselines. No hidden rollback, blind resubmit or ID/timestamp generation.

`previewBundle` owns a detached complete source and current exact vector without mutation. New file choices invalidate previous plan/steps. `previewStep` permits only the next separately explicit library/weights/draft step; `applyStep` consumes it, rechecks source/plan ownership, vector and view under all locks, and changes one key only. Its returned fresh plan records known successes. A stale prior plan/step cannot be reused. A failure keeps partial completion visible; no later member is automatically attempted. `complete:true` requires a new locked comparison that every desired member matches; hashes alone do not replace exact value/presence checks.

Each new step preview revokes any previous unconsumed step from that plan. An applied/failed step returns a new owned plan; do not mutate the old one. `retryStep` accepts only that coordinator's current failed plan and retries the exact failed set/remove bytes against its known vector; it does not reapply earlier successful members or reread/reinterpret a source file. A changed baseline refuses and marks the plan changed. No normal save may bypass a pending partial write/restore; resolve it through exact retry, explicit recovery or reload with its warned loss boundary.

`retryPending` accepts only `pending.origin==='save'`. Restore/remove pending intents require `retryStep` with the current failed owned plan. Neither method confirms or advances a later unreviewed bundle step. A changed source/file choice cannot retarget an old retry.

Full-source relationships are validated before a plan exists. A reviewed complete plan may temporarily retain an old draft/library mismatch between member steps; expose `consistency:'partial'`, block ordinary grant writes and keep recovery/export available. On a later reload, orphan draft references yield `inconsistent` without cleaning IDs or silently creating a blank draft. An individual member operation must preserve current relationships or refuse; a complete owned transition is the only exception while its explicit source plan remains active. No current consistency flag proves that a past complete source was fully restored.

An initially inconsistent target can accept a valid complete source plan without first forcing its existing relationship to pass. The alternative is explicit reviewed removal of the draft key, preserving the library and weights; this is allowed for recovery even while ordinary writes are blocked. A draft removal's absence is distinct from saving literal null. Unreadable old members retain their raw copies and can be replaced through a complete valid source plan once every current raw baseline is readable; this does not make them valid backup members.

`bundle` exports the current valid working vector, including owned failed-memory candidates and absence intents where present, with persistence labels. `desiredBundle` exports the full validated intended vector of an active partial operation: for a Save set it overlays every pending member; for a full source plan it includes all three source members, even those not yet applied. It uses current saved comparisons to label remaining members unsaved-memory. These outputs are distinguished in the UI. No valid complete backup is claimed when an unknown/unreadable member remains in that chosen vector. Exporting the desired vector neither mutates storage nor authorizes unconfirmed restore steps.

`previewIndividual` creates a clearly partial, one-member plan after validating the current other members/relationship; it cannot claim full completion of a three-member source. `previewRemove/remove` uses an opaque removal-kind fact retained privately, so a restore step cannot be passed to remove or vice versa. Removing a library that still owns the current draft is refused until the person explicitly resolves/removes that draft. No automatic unrelated member deletion.

After reload, select the same file to create a new plan and compare already-applied members; no hidden recovery journal or automatic continuation exists. Reads/exports of pending state are labeled unsaved-memory, with full-bundle privacy warnings. Read-only capability mode preserves accessible data/copies but cannot start restore/removal.

## Compilable grant caller example

```ts
declare function readGrantProposal(): D1GrantProposal;
declare function currentGrantLibrary(): D1GrantProposal[];
async function exampleGrantIntegration(): Promise<void> {
  const view = createD1ViewTracker();
  const grant = await openD1GrantCoordinator({ view });
  async function onExplicitSaveProposal(): Promise<void> {
    view.changedForm();
    const draft = readGrantProposal(); //real handler generates its new ID/time once, before capture
    const prior = currentGrantLibrary();
    const library = prior.some((p) => p.id === draft.id)
      ? prior.map((p) => (p.id === draft.id ? draft : p))
      : [...prior, draft];
    const capture = grant.captureSave({
      "grant-proposals": library,
      "grant-draft": draft,
    });
    const result = await grant.saveCaptured(capture);
    if (result.formGeneration !== view.snapshot().formGeneration) return; //retain newer DOM/dirty input
    if (
      result.outcomes["grant-proposals"] === "saved" &&
      result.outcomes["grant-draft"] === "unsaved"
    ) {
      announceD1(
        "Proposal library saved; current draft is only in memory. Keep a complete backup or retry the exact pending work.",
      );
    } else if (result.snapshot.partial) announceD1(result.snapshot.message);
    else if (
      !Object.values(result.outcomes).some(
        (v) => v === "unsaved" || v === "not-attempted",
      )
    ) {
      view.markFormSaved(result.formGeneration);
      announceD1("The requested grant records are saved.");
    }
  }
  async function onChosenBundle(bytes: Uint8Array): Promise<void> {
    view.changedRecovery();
    //The real UI separately confirms any warned loss of current memory/unsubmitted fields.
    const plan = await grant.previewBundle(bytes, { discardUnsaved: true });
    const step = await grant.previewStep(plan, "grant-proposals");
    //Present full source/differences; a separate user confirmation calls applyStep(step).
    void step;
  }
  void onExplicitSaveProposal;
  void onChosenBundle;
}
```

No example restores three keys in a loop behind one misleading success button. Each apply is a separate deliberate operation. A rendered control must preserve its exact opaque plan/step and revoke it on new source/input/recovery changes. Controller tests must execute these actual paths with scheduled failures and foreign changes.

## Required exported test surface and guarantee

The implementation should export the named facade, pure backup parsers/serializers, constants and a namespaced dependency-injected cell factory for actual-key tests. Its lower-level checked/assign primitives stay internal or test-only; application imports cannot bypass the facade. Tests use synthetic Storage/Web Locks and actual controller modules, not fabricated successful boolean saves. Strict declaration examples compile together with ES2022/DOM libraries.

Web Locks cover cooperating updated clients only. Exact raw/vector checks reject foreign data observed before the final comparison. They cannot create true CAS against a noncooperating writer that writes after that comparison. No arbitrary-external-set scheduler assertion may be presented as a universal transaction/security guarantee. Native browser acceptance, native saved-file bytes and release evidence remain pending until independently recorded.
