/** D1 fixed-key asynchronous facade. Opaque authorities never come from saved JSON. */
import {
  validateD1Value,
  d1DefaultValue,
  canonicalD1Json,
} from "./donor-recovery-schemas";
import {
  D1_LIMITS,
  strictD1Json,
  d1IndividualBackup,
  parseD1IndividualBackup,
  d1GrantBundle,
  parseD1GrantBundle,
  assertD1GrantReferences,
  type D1GrantBundle as FormatGrantBundle,
} from "./donor-recovery-formats";
import {
  createD1Cell,
  createD1ReplacementQueue,
  d1Environment,
  d1Fail,
  d1Freeze,
  d1Hash,
  d1RawHash,
  d1Watch,
  d1OwnRaw,
  D1_STAMP,
  D1RecoveryError,
  type D1Cell,
  type D1Binding,
  type D1Intent,
  type D1Environment,
} from "./donor-recovery-cell";
export { D1_LIMITS, D1RecoveryError };
import type { Gift as D1Gift } from "./gifts";
import type { LegacyPlan as D1LegacyPlan } from "./legacy";
import type { CardState as D1CardState } from "./giftcard";
import type { DiligenceState as D1DiligenceState } from "./diligence";
import type { Draft as D1ImpactDraft } from "./theory-of-change";
export type D1Hash = string; //64 lowercase SHA-256 hex
export type D1Key =
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
export type D1StandaloneKey = Exclude<
  D1Key,
  "grant-proposals" | "grant-weights" | "grant-draft"
>;
export type D1Code =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
export type D1ErrorCode =
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
export type D1Present<T> =
  { readonly present: false } | { readonly present: true; readonly value: T };
export type D1Current<T> =
  | { readonly hasState: false; readonly value: null; readonly hash: null }
  | { readonly hasState: true; readonly value: T; readonly hash: D1Hash };
export interface D1Status {
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
export type D1Snapshot<T> = Readonly<D1Status & D1Current<T>>;

export interface D1PortfolioRecord {
  allocation: Record<string, number>;
  alternative?: Record<string, number>;
  budget: number;
  state?: { w: number[]; b: number; t: number }; //t=-100..100 from the actual producer
  method?: string;
  savedAt?: string;
}
export interface D1SavedCEModel {
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
export interface D1SplitPlan {
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
export interface D1CompassRecord {
  weights: Record<string, number>;
  position: Record<string, number>;
  answers: { d: number[]; s: number[] };
  savedAt: string;
}
export interface D1ValueMap {
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

export interface D1Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface D1Locks {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    run: () => Promise<T>,
  ): Promise<T>;
}
export interface D1ViewState {
  readonly formGeneration: number;
  readonly recoveryGeneration: number;
  readonly hasUnsubmittedForm: boolean;
}
export declare const D1_VIEW_OWNER: unique symbol;
export interface D1ViewTracker {
  readonly [D1_VIEW_OWNER]: true;
  snapshot(): D1ViewState;
  changedForm(): D1ViewState; //increments form generation and sets unsubmitted=true
  changedRecovery(): D1ViewState; //increments recovery generation immediately
  markFormSaved(generation: number): boolean; //clears dirty only if this is still the exact current generation
  discardedForm(): D1ViewState; //explicit tab-only discard, increments form generation; no saved-state write
  dispose(): void;
}

export interface D1Dependencies {
  storage?: D1Storage;
  locks?: D1Locks | null;
  cryptoAvailable?: boolean;
  digest?: (ownedBytes: Uint8Array) => Promise<D1Hash>;
}
export interface D1OpenOptions extends D1Dependencies {
  view: D1ViewTracker;
}
export declare const D1_CAPTURE_OWNER: unique symbol;
export interface D1SaveCapture<T> {
  readonly format: "charitology-d1-save-capture";
  readonly version: 1;
  readonly key: D1StandaloneKey;
  readonly value: T;
  readonly formGeneration: number;
  readonly recoveryGeneration: number;
  readonly [D1_CAPTURE_OWNER]: true;
}
export declare const D1_RECOVERY_OWNER: unique symbol;
export interface D1RecoveryPreview<T> {
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
export type D1RestorePreview<T> = D1RecoveryPreview<T> & {
  readonly kind: "restore";
};
export type D1ClearPreview<T> = D1RecoveryPreview<T> & {
  readonly kind: "clear";
};

export interface D1SaveResult<T> {
  readonly outcome: "saved" | "unsaved" | "no-op" | "superseded";
  readonly formGeneration: number;
  readonly snapshot: D1Snapshot<T>;
}
export interface D1ReloadOptions {
  discardUnsaved?: boolean;
} //explicitly covers failed-memory AND unsubmitted DOM loss
export interface D1ToolSession<T> {
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

export interface D1IndividualBackup<T> {
  format: "charitology-local-draft";
  version: 1;
  key: D1Key;
  exportedAt: string;
  value: T;
}
export interface D1RawRecovery {
  format: "charitology-raw-saved-copy";
  version: 1;
  key: D1Key;
  copy: "protected" | "observed";
  raw: string;
}

export interface D1RecoveryControls {
  refresh(): void; //snapshot/status render only; no generation change or disk adoption
  noteFileChoice(): void; //immediate authority invalidation, before any file await
  noteViewMutation(): void;
  dispose(): void;
}
export interface D1RecoveryControlsOptions<T> {
  host: HTMLElement;
  session: D1ToolSession<T>;
  view: D1ViewTracker;
}

export interface D1GrantRecoveryControlsOptions {
  host: HTMLElement;
  editor: HTMLElement; //ordinary grant writer controls; shared recovery stays outside it
  coordinator: D1GrantCoordinator;
  view: D1ViewTracker;
}

//engine export for controls only; application components cannot import it
export type D1DependencyReader =
  "portfolio-builder" | "one-click-split" | "charitology-wrapped";
export type D1DependencyKey<R extends D1DependencyReader> =
  R extends "portfolio-builder"
    ? "compass"
    : R extends "one-click-split"
      ? "portfolio"
      : "gifts";
export type D1DependencyRead<T> =
  | {
      readonly code: "saved";
      readonly value: T;
      readonly rawHash: D1Hash | null;
    }
  | {
      readonly code: "absent" | "corrupt" | "read_error";
      readonly message: string;
    };

export interface D1GrantProposal {
  id: string;
  name: string;
  savedAt?: string;
  scores: Record<string, 0 | 1 | 2 | 3 | 4 | null>;
  notes: Record<string, string>;
}
export type D1GrantValues = {
  "grant-proposals": D1GrantProposal[];
  "grant-weights": Record<string, number>;
  "grant-draft": D1GrantProposal | null;
};
export type D1GrantKey = keyof D1GrantValues;
export type D1GrantMember = {
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
export interface D1GrantBundle {
  format: "charitology-grant-workspace";
  version: 1;
  exportedAt: string;
  members: readonly D1GrantMember[]; //exact three keys, fixed library/weights/draft order
}
export type D1GrantVector = Readonly<{
  [K in D1GrantKey]: {
    readonly generation: number;
    readonly hasState: boolean;
    readonly memoryHash: D1Hash | null;
    readonly observedRawHash: D1Hash | null;
  };
}>;
export type D1GrantWriteSet = Readonly<Partial<D1GrantValues>>; //one or more own known keys; value null may be meaningful
export type D1GrantIntent = {
  [K in D1GrantKey]:
    | {
        readonly key: K;
        readonly operation: "set";
        readonly value: D1GrantValues[K];
      }
    | { readonly key: K; readonly operation: "remove" };
}[D1GrantKey];
export interface D1GrantPending {
  readonly origin: "save" | "restore" | "remove";
  readonly remaining: readonly D1GrantIntent[];
  readonly completed: readonly D1GrantKey[];
  readonly sourceHash: D1Hash | null;
}
export type D1GrantMemberOutcome =
  "saved" | "unsaved" | "no-op" | "not-attempted";
export interface D1GrantSnapshot {
  readonly members: {
    readonly [K in D1GrantKey]: D1Snapshot<D1GrantValues[K]>;
  };
  readonly pending: D1GrantPending | null;
  readonly partial: boolean;
  readonly consistency:
    "consistent" | "partial" | "inconsistent" | "unreadable";
  readonly message: string;
}
export interface D1GrantWriteResult {
  readonly outcomes: Readonly<
    Partial<Record<D1GrantKey, D1GrantMemberOutcome>>
  >;
  readonly formGeneration: number;
  readonly snapshot: D1GrantSnapshot;
}

export declare const D1_GRANT_CAPTURE_OWNER: unique symbol;
export interface D1GrantSaveCapture {
  readonly format: "charitology-d1-grant-save-capture";
  readonly version: 1;
  readonly values: D1GrantWriteSet;
  readonly formGeneration: number;
  readonly recoveryGeneration: number;
  readonly [D1_GRANT_CAPTURE_OWNER]: true;
}
export declare const D1_GRANT_PLAN_OWNER: unique symbol;
export interface D1GrantRestorePlan {
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
export declare const D1_GRANT_STEP_OWNER: unique symbol;
export interface D1GrantStep<K extends D1GrantKey = D1GrantKey> {
  readonly format: "charitology-d1-grant-restore-step";
  readonly version: 1;
  readonly kind: "restore" | "remove";
  readonly key: K;
  readonly sourceHash: D1Hash;
  readonly vector: D1GrantVector;
  readonly candidate: D1Present<D1GrantValues[K]>;
  readonly [D1_GRANT_STEP_OWNER]: true;
}
export type D1GrantRestoreStep<K extends D1GrantKey = D1GrantKey> =
  D1GrantStep<K> & {
    readonly kind: "restore";
  };
export type D1GrantRemoveStep<K extends D1GrantKey = D1GrantKey> =
  D1GrantStep<K> & {
    readonly kind: "remove";
  };
export interface D1GrantStepResult {
  readonly outcome: "saved" | "unsaved" | "no-op";
  readonly plan: D1GrantRestorePlan;
  readonly snapshot: D1GrantSnapshot;
  readonly complete: boolean; //only final fresh locked comparison can establish true
}
export interface D1GrantOpenOptions extends D1Dependencies {
  view: D1ViewTracker; //fixed canonical grant schemas/defaults, no caller validation override
}
export interface D1GrantCoordinator {
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

interface ViewInternal {
  formGeneration: number;
  recoveryGeneration: number;
  hasUnsubmittedForm: boolean;
  closed: boolean;
}
const views = new WeakMap<object, ViewInternal>();
const bindings = new WeakMap<object, D1ViewTracker>();
function viewState(view: D1ViewTracker): D1ViewState {
  const v = views.get(view);
  if (!v || v.closed)
    d1Fail("foreign_owner", "Use the live owned view tracker.");
  return Object.freeze({
    formGeneration: v.formGeneration,
    recoveryGeneration: v.recoveryGeneration,
    hasUnsubmittedForm: v.hasUnsubmittedForm,
  });
}
function assertView(view: D1ViewTracker, expected: D1ViewState) {
  const now = viewState(view);
  if (
    now.formGeneration !== expected.formGeneration ||
    now.recoveryGeneration !== expected.recoveryGeneration
  )
    d1Fail(
      "stale_view",
      "The form or recovery choice changed. Review this action again.",
    );
}
export function createD1ViewTracker(): D1ViewTracker {
  const v: ViewInternal = {
    formGeneration: 0,
    recoveryGeneration: 0,
    hasUnsubmittedForm: false,
    closed: false,
  };
  let tracker: D1ViewTracker;
  const live = () => {
    if (v.closed) d1Fail("closed", "This view tracker is closed.");
  };
  const bump = (k: "formGeneration" | "recoveryGeneration") => {
    if (!Number.isSafeInteger(v[k] + 1))
      d1Fail("closed", "Reopen this view before continuing.");
    v[k]++;
  };
  tracker = Object.freeze({
    snapshot: () => {
      live();
      return viewState(tracker);
    },
    changedForm: () => {
      live();
      bump("formGeneration");
      v.hasUnsubmittedForm = true;
      return viewState(tracker);
    },
    changedRecovery: () => {
      live();
      bump("recoveryGeneration");
      return viewState(tracker);
    },
    markFormSaved: (n: number) => {
      live();
      if (n !== v.formGeneration) return false;
      v.hasUnsubmittedForm = false;
      return true;
    },
    discardedForm: () => {
      live();
      bump("formGeneration");
      v.hasUnsubmittedForm = false;
      return viewState(tracker);
    },
    dispose: () => {
      v.closed = true;
      bump("recoveryGeneration");
    },
  }) as D1ViewTracker;
  views.set(tracker, v);
  return tracker;
}
export function assertD1ControlBinding(
  target: D1ToolSession<unknown> | D1GrantCoordinator,
  view: D1ViewTracker,
): void {
  viewState(view);
  if (bindings.get(target) !== view)
    d1Fail(
      "foreign_owner",
      "Controls require the exact target and its owned view tracker.",
    );
}
function openOptions(input: D1OpenOptions): D1OpenOptions {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype)
    d1Fail("invalid_data", "Use explicit recovery options.");
  const allowed = ["view", "storage", "locks", "cryptoAvailable", "digest"];
  const result: Record<string, unknown> = {};
  for (const k of Reflect.ownKeys(input)) {
    if (typeof k !== "string" || !allowed.includes(k))
      d1Fail("invalid_data", "Unknown recovery option.");
    const d = Object.getOwnPropertyDescriptor(input, k)!;
    if (!("value" in d))
      d1Fail("invalid_data", "Recovery options cannot contain getters.");
    result[k] = d.value;
  }
  viewState(result.view as D1ViewTracker);
  if (
    result.cryptoAvailable !== undefined &&
    typeof result.cryptoAvailable !== "boolean"
  )
    d1Fail("invalid_data", "Use a boolean capability override.");
  if (result.digest !== undefined && typeof result.digest !== "function")
    d1Fail("invalid_data", "Invalid hashing dependency.");
  return Object.freeze(result) as unknown as D1OpenOptions;
}
function reloadChoice(input: D1ReloadOptions | undefined) {
  const watched = d1Watch(input ?? {}, 1024);
  if (
    Object.keys(watched.value).some((k) => k !== "discardUnsaved") ||
    (Object.hasOwn(watched.value, "discardUnsaved") &&
      typeof watched.value.discardUnsaved !== "boolean")
  )
    d1Fail("invalid_data", "Use only an explicit boolean discard choice.");
  return {
    discard: watched.value.discardUnsaved === true,
    assert: watched.assert,
  };
}
function discardGuard(discard: boolean, dirty: boolean, unsaved: boolean) {
  if (!discard && (dirty || unsaved))
    d1Fail(
      "discard_required",
      "This action would discard current work. Export the saved record and any raw form fields, then explicitly confirm that loss.",
    );
}
function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(run: () => Promise<T>): Promise<T> => {
    const result = tail.then(run, run);
    tail = result.catch(() => {});
    return result;
  };
}
export async function openD1ToolSession<K extends D1StandaloneKey>(
  key: K,
  input: D1OpenOptions,
): Promise<D1ToolSession<D1ValueMap[K]>> {
  if (
    typeof key !== "string" ||
    ![
      "gifts",
      "portfolio",
      "legacy",
      "gift-card",
      "ce-models",
      "due-diligence",
      "impact-drafts",
      "split",
      "compass",
      "disaster-plan",
      "wrapped",
    ].includes(key)
  )
    d1Fail(
      "invalid_data",
      "Only a fixed standalone tool key may be opened here.",
    );
  const options = openOptions(input),
    view = options.view,
    env = d1Environment(options),
    cell = createD1Cell(key, env),
    enqueue = serialQueue();
  if (env.supported) {
    try {
      await env.lock([cell.fullKey], () => cell.initialize());
    } catch (e) {
      if (e instanceof D1RecoveryError && e.code === "unsupported")
        await cell.initialize();
      else throw e;
    }
  } else await cell.initialize();
  type T = D1ValueMap[K];
  type Recovery = {
    kind: "restore" | "clear";
    candidate: D1Intent<T>;
    binding: D1Binding;
    view: D1ViewState;
    discard: boolean;
  };
  const captures = new WeakMap<object, { value: T; view: D1ViewState }>(),
    previews = new WeakMap<object, Recovery>();
  const checkEntry = () => {
    env.entry();
    viewState(view);
    if (cell.snapshot().code === "closed")
      d1Fail("closed", "This view is closed.");
  };
  const locked = <R>(run: () => Promise<R>) => env.lock([cell.fullKey], run);
  const preview = async (
    kind: "restore" | "clear",
    raw: string | Uint8Array | undefined,
    settings?: D1ReloadOptions,
  ): Promise<D1RecoveryPreview<T>> => {
    checkEntry();
    const choice = reloadChoice(settings),
      vs = viewState(view),
      b = cell.binding(),
      owned =
        raw === undefined
          ? null
          : d1OwnRaw(raw, D1_LIMITS.individualBackupBytes);
    const value = owned ? parseD1IndividualBackup(owned.raw, key) : undefined;
    discardGuard(
      choice.discard,
      vs.hasUnsubmittedForm,
      cell.snapshot().unsaved,
    );
    return enqueue(() =>
      locked(async () => {
        choice.assert();
        owned?.assert();
        assertView(view, vs);
        cell.requireRecover();
        cell.assertMemory(b);
        const baseline = cell.previewBaseline(b);
        const c = kind === "restore" ? await cell.checked(value) : null;
        choice.assert();
        owned?.assert();
        assertView(view, vs);
        cell.assertMemory(baseline);
        cell.assertDisk(baseline.raw);
        choice.assert();
        owned?.assert();
        assertView(view, vs);
        const p = d1Freeze({
          format: "charitology-d1-recovery-preview",
          version: 1,
          kind,
          key,
          candidate: c ? { present: true, value: c.value } : { present: false },
          candidateHash: c?.hash ?? null,
          expectedGeneration: baseline.generation,
          expectedMemoryHash: baseline.hash,
          expectedObservedRawHash: d1RawHash(baseline.raw),
          formGeneration: vs.formGeneration,
          recoveryGeneration: vs.recoveryGeneration,
        }) as unknown as D1RecoveryPreview<T>;
        previews.set(p, {
          kind,
          candidate: c
            ? { operation: "set", candidate: c }
            : { operation: "remove" },
          binding: baseline,
          view: vs,
          discard: choice.discard,
        });
        return p;
      }),
    );
  };
  const apply = (p: D1RecoveryPreview<T>, kind: "restore" | "clear") => {
    checkEntry();
    const owned = previews.get(p);
    if (!owned || owned.kind !== kind)
      d1Fail("preview_required", "Use the fresh preview from this tool.");
    previews.delete(p);
    return enqueue(() =>
      locked(async () => {
        assertView(view, owned.view);
        cell.requireRecover();
        cell.assertMemory(owned.binding);
        cell.assertDisk(owned.binding.raw);
        assertView(view, owned.view);
        discardGuard(
          owned.discard,
          viewState(view).hasUnsubmittedForm,
          cell.snapshot().unsaved,
        );
        cell.assign(owned.candidate, true);
        return cell.snapshot();
      }),
    );
  };
  const saves = createD1ReplacementQueue<
    { value: T; view: D1ViewState },
    D1SaveResult<T>
  >(
    enqueue,
    async (own) => {
      try {
        assertView(view, own.view);
        cell.requireWrite();
        const b = cell.binding(),
          c = await cell.checked(own.value);
        assertView(view, own.view);
        cell.assertMemory(b);
        return await locked(async () => {
          assertView(view, own.view);
          cell.requireWrite();
          cell.assertMemory(b);
          cell.assertDisk(b.raw);
          assertView(view, own.view);
          const s = cell.snapshot();
          if (
            s.persistence === "saved" &&
            !s.unsaved &&
            s.hasState &&
            canonicalD1Json(s.value) === canonicalD1Json(c.value)
          )
            return {
              outcome: "no-op",
              formGeneration: own.view.formGeneration,
              snapshot: s,
            };
          cell.assign({ operation: "set", candidate: c }, true);
          const next = cell.snapshot();
          return {
            outcome: next.unsaved ? "unsaved" : "saved",
            formGeneration: own.view.formGeneration,
            snapshot: next,
          };
        });
      } catch (error) {
        if (
          error instanceof D1RecoveryError &&
          error.code === "stale_view" &&
          viewState(view).formGeneration !== own.view.formGeneration
        )
          return {
            outcome: "superseded",
            formGeneration: own.view.formGeneration,
            snapshot: cell.snapshot(),
          };
        throw error;
      }
    },
    (own) => ({
      outcome: "superseded",
      formGeneration: own.view.formGeneration,
      snapshot: cell.snapshot(),
    }),
  );
  const session: D1ToolSession<T> = {
    snapshot: cell.snapshot,
    captureSave(value) {
      checkEntry();
      cell.requireWrite();
      const vs = viewState(view),
        clean = validateD1Value(key, value);
      d1IndividualBackup(key, clean, D1_STAMP);
      const c = d1Freeze({
        format: "charitology-d1-save-capture",
        version: 1,
        key,
        value: clean,
        formGeneration: vs.formGeneration,
        recoveryGeneration: vs.recoveryGeneration,
      }) as unknown as D1SaveCapture<T>;
      captures.set(c, { value: clean as T, view: vs });
      return c;
    },
    saveCaptured(capture) {
      checkEntry();
      const own = captures.get(capture);
      if (!own) d1Fail("foreign_owner", "Use this tool's unused save capture.");
      captures.delete(capture);
      return saves.submit(own);
    },
    retryPersist() {
      checkEntry();
      const vs = viewState(view),
        b = cell.binding();
      return enqueue(() =>
        locked(async () => {
          assertView(view, vs);
          cell.requireRecover();
          cell.assertMemory(b);
          cell.assertDisk(b.raw);
          assertView(view, vs);
          cell.retry();
          return cell.snapshot();
        }),
      );
    },
    previewRestore: (raw, settings) =>
      preview("restore", raw, settings) as Promise<D1RestorePreview<T>>,
    restore: (p) => apply(p, "restore"),
    previewRemove: (settings) =>
      preview("clear", undefined, settings) as Promise<D1ClearPreview<T>>,
    remove: (p) => apply(p, "clear"),
    undo(settings) {
      checkEntry();
      const choice = reloadChoice(settings),
        vs = viewState(view),
        b = cell.binding(),
        target = cell.undoIntent();
      discardGuard(
        choice.discard,
        vs.hasUnsubmittedForm,
        cell.snapshot().unsaved,
      );
      return enqueue(() =>
        locked(async () => {
          choice.assert();
          assertView(view, vs);
          cell.requireRecover();
          if (
            ["external_change", "corrupt", "read_error"].includes(
              cell.snapshot().code,
            )
          )
            d1Fail(
              cell.snapshot().code,
              "Reload or preview recovery before undo after a saved-data conflict.",
            );
          cell.assertMemory(b);
          cell.assertDisk(b.raw);
          choice.assert();
          assertView(view, vs);
          cell.clearUndo();
          cell.assign(target, false);
          return cell.snapshot();
        }),
      );
    },
    reload(settings) {
      checkEntry();
      const choice = reloadChoice(settings),
        vs = viewState(view),
        before = cell.snapshot();
      discardGuard(choice.discard, vs.hasUnsubmittedForm, before.unsaved);
      return enqueue(async () => {
        const run = async () => {
          choice.assert();
          assertView(view, vs);
          const s = cell.snapshot();
          if (s.generation !== before.generation)
            d1Fail("stale_view", "The record changed before reload.");
          return cell.load(choice.discard, vs.hasUnsubmittedForm, () => {
            choice.assert();
            assertView(view, vs);
          });
        };
        return env.supported ? locked(run) : run();
      });
    },
    noticeExternalChange() {
      env.entry();
      return cell.notice();
    },
    async backup() {
      checkEntry();
      const s = cell.snapshot();
      if (!s.hasState)
        d1Fail(
          "corrupt",
          "No validated current record is available; download raw recovery.",
        );
      return d1IndividualBackup(key, s.value, new Date().toISOString());
    },
    protectedRawCopy: cell.protectedRaw,
    observedRawCopy: cell.observedRaw,
    dispose() {
      env.entry();
      cell.dispose();
    },
  };
  bindings.set(session, view);
  return Object.freeze(session);
}
export async function readD1Dependency<R extends D1DependencyReader>(
  reader: R,
  input: Pick<D1Dependencies, "storage" | "cryptoAvailable" | "digest"> = {},
): Promise<D1DependencyRead<D1ValueMap[D1DependencyKey<R>]>> {
  const key = (
    {
      "portfolio-builder": "compass",
      "one-click-split": "portfolio",
      "charitology-wrapped": "gifts",
    } as const
  )[reader];
  if (!key) d1Fail("invalid_data", "Unknown read-only dependency.");
  if (!input || Object.getPrototypeOf(input) !== Object.prototype)
    d1Fail("invalid_data", "Use plain read-only dependency options.");
  const copied: Record<string, unknown> = {};
  for (const k of Reflect.ownKeys(input)) {
    if (
      typeof k !== "string" ||
      !["storage", "cryptoAvailable", "digest"].includes(k)
    )
      d1Fail("invalid_data", "Unknown dependency option.");
    const d = Object.getOwnPropertyDescriptor(input, k)!;
    if (!("value" in d))
      d1Fail("invalid_data", "Dependency options cannot contain getters.");
    copied[k] = d.value;
  }
  const options = openOptions({ ...copied, view: createD1ViewTracker() });
  const env = d1Environment({ ...options, locks: null });
  let raw: string | null;
  try {
    raw = env.get("charitology." + key);
  } catch {
    return {
      code: "read_error",
      message: "The saved dependency could not be read.",
    };
  }
  if (raw === null)
    return { code: "absent", message: "No saved dependency is available." };
  try {
    const value = validateD1Value(
      key,
      strictD1Json(raw, D1_LIMITS.individualBackupBytes),
    );
    d1IndividualBackup(key, value, D1_STAMP);
    const h =
      options.cryptoAvailable === false ||
      (!options.digest && !globalThis.crypto?.subtle)
        ? null
        : await env.hash(raw);
    return d1Freeze({ code: "saved", value, rawHash: h }) as D1DependencyRead<
      D1ValueMap[D1DependencyKey<R>]
    >;
  } catch {
    return {
      code: "corrupt",
      message:
        "The saved dependency failed its producer schema. Nothing was changed.",
    };
  }
}

const GRANT_ORDER: readonly D1GrantKey[] = [
  "grant-proposals",
  "grant-weights",
  "grant-draft",
];
const GRANT_LOCKS = [...GRANT_ORDER].sort().map((k) => "charitology." + k);
type GrantValue = D1GrantValues[D1GrantKey];
type GrantCell = D1Cell<GrantValue>;
type GrantBindings = Record<D1GrantKey, D1Binding>;
type GrantDesired = Record<D1GrantKey, D1Present<GrantValue>>;
interface GrantPlanData {
  bundle: D1GrantBundle;
  sourceHash: string;
  desired: GrantDesired;
  keys: D1GrantKey[];
  done: D1GrantKey[];
  failed: D1GrantKey | null;
  changed: boolean;
  full: boolean;
  origin: "restore" | "remove";
  view: D1ViewState;
  bindings: GrantBindings;
  discard: boolean;
  public: D1GrantRestorePlan | null;
}
export async function openD1GrantCoordinator(
  input: D1GrantOpenOptions,
): Promise<D1GrantCoordinator> {
  const options = openOptions(input),
    view = options.view,
    env = d1Environment(options),
    enqueue = serialQueue();
  const cells = Object.fromEntries(
    GRANT_ORDER.map((k) => [k, createD1Cell(k, env)]),
  ) as unknown as Record<D1GrantKey, GrantCell>;
  const liveLeases = new WeakMap<object, ReadonlySet<GrantCell>>();
  let lease: object | null = null;
  const locked = <R>(run: () => Promise<R>) =>
    env.lock(GRANT_LOCKS, async () => {
      const own = {};
      liveLeases.set(own, new Set(Object.values(cells)));
      lease = own;
      try {
        return await run();
      } finally {
        liveLeases.delete(own);
        lease = null;
      }
    });
  const assertLease = (cell: GrantCell) => {
    if (!lease || !liveLeases.get(lease)?.has(cell))
      d1Fail(
        "foreign_owner",
        "Grant mutation requires the live private three-key lease.",
      );
  };
  const grantAssign = (
    cell: GrantCell,
    intent: D1Intent<GrantValue>,
    undo: boolean,
  ) => {
    assertLease(cell);
    cell.assign(intent, undo);
  };
  const grantRetry = (cell: GrantCell) => {
    assertLease(cell);
    cell.retry();
  };
  const initialize = async () => {
    for (const k of GRANT_ORDER) await cells[k].initialize();
  };
  if (env.supported) {
    try {
      await locked(initialize);
    } catch (e) {
      if (e instanceof D1RecoveryError && e.code === "unsupported")
        await initialize();
      else throw e;
    }
  } else await initialize();
  const captures = new WeakMap<
    object,
    { values: D1GrantWriteSet; view: D1ViewState }
  >();
  const plans = new WeakMap<object, GrantPlanData>();
  const steps = new WeakMap<
    object,
    {
      data: GrantPlanData;
      key: D1GrantKey;
      kind: "restore" | "remove";
      view: D1ViewState;
      bindings: GrantBindings;
      intent: D1Intent<GrantValue>;
    }
  >();
  let currentPlan: GrantPlanData | null = null,
    activeStep: object | null = null,
    pending: D1GrantPending | null = null,
    pendingBindings: GrantBindings | null = null;
  const entry = () => {
    env.entry();
    viewState(view);
    if (cells["grant-draft"].snapshot().code === "closed")
      d1Fail("closed", "This grant view is closed.");
  };
  const keyCheck = (key: D1GrantKey) => {
    if (!GRANT_ORDER.includes(key))
      d1Fail("invalid_data", "Choose one fixed grant member.");
  };
  const bind = (): GrantBindings =>
    Object.fromEntries(
      GRANT_ORDER.map((k) => [k, cells[k].binding()]),
    ) as GrantBindings;
  const assertMemory = (b: GrantBindings) => {
    for (const k of GRANT_ORDER) cells[k].assertMemory(b[k]);
  };
  const assertDisk = (b: GrantBindings) => {
    for (const k of GRANT_ORDER) cells[k].assertDisk(b[k].raw);
  };
  const previewBaseline = (b: GrantBindings) => {
    for (const k of GRANT_ORDER) cells[k].previewBaseline(b[k]);
    return b;
  };
  const desiredCurrent = (): GrantDesired =>
    Object.fromEntries(
      GRANT_ORDER.map((k) => {
        const s = cells[k].snapshot();
        if (!s.hasState)
          d1Fail(
            "corrupt",
            "A grant member has no validated current value. Keep its raw copy or review a complete valid bundle.",
          );
        return [
          k,
          cells[k].present()
            ? { present: true, value: s.value }
            : { present: false },
        ];
      }),
    ) as GrantDesired;
  const memberFor = (
    key: D1GrantKey,
    d: D1Present<GrantValue>,
    persistence: "saved" | "unsaved-memory",
  ): D1GrantMember =>
    (d.present
      ? { key, presence: "value", persistence, value: d.value }
      : { key, presence: "absent", persistence }) as D1GrantMember;
  const sameDesired = (key: D1GrantKey, d: D1Present<GrantValue>) => {
    const s = cells[key].snapshot();
    return (
      !s.unsaved &&
      (s.code === "ready" || s.code === "unsupported") &&
      s.observedRaw !== undefined &&
      (d.present
        ? s.persistence === "saved" &&
          s.hasState &&
          canonicalD1Json(s.value) === canonicalD1Json(d.value)
        : s.observedRaw === null)
    );
  };
  const buildBundle = (desired: GrantDesired, at: string): D1GrantBundle => ({
    format: "charitology-grant-workspace",
    version: 1,
    exportedAt: at,
    members: GRANT_ORDER.map((k) =>
      memberFor(
        k,
        desired[k],
        sameDesired(k, desired[k]) ? "saved" : "unsaved-memory",
      ),
    ),
  });
  const checkDesired = (desired: GrantDesired) => {
    const bundle = buildBundle(desired, D1_STAMP);
    assertD1GrantReferences(bundle.members as FormatGrantBundle["members"]);
    d1GrantBundle(bundle as FormatGrantBundle);
  };
  const overlayPending = (
    base: GrantDesired,
    which: readonly D1GrantIntent[],
  ) => {
    const next = { ...base };
    for (const i of which)
      next[i.key] =
        i.operation === "set"
          ? { present: true, value: i.value }
          : { present: false };
    return next;
  };
  const fullDesired = (): GrantDesired =>
    currentPlan
      ? currentPlan.desired
      : pending
        ? overlayPending(desiredCurrent(), pending.remaining)
        : desiredCurrent();
  const vector = (b: GrantBindings): D1GrantVector =>
    d1Freeze(
      Object.fromEntries(
        GRANT_ORDER.map((k) => [
          k,
          {
            generation: b[k].generation,
            hasState: b[k].hasState,
            memoryHash: b[k].hash,
            observedRawHash: d1RawHash(b[k].raw),
          },
        ]),
      ) as D1GrantVector,
    );
  const snapshot = (): D1GrantSnapshot => {
    const members = Object.fromEntries(
      GRANT_ORDER.map((k) => [k, cells[k].snapshot()]),
    ) as D1GrantSnapshot["members"];
    const incomplete =
      GRANT_ORDER.some((k) => members[k].unsaved) ||
      (!!currentPlan &&
        (currentPlan.done.length > 0 || currentPlan.failed !== null) &&
        currentPlan.done.length < currentPlan.keys.length);
    let consistency: D1GrantSnapshot["consistency"] = "consistent";
    if (
      GRANT_ORDER.some(
        (k) =>
          !members[k].hasState ||
          members[k].observedRaw === undefined ||
          members[k].code === "corrupt",
      )
    )
      consistency = "unreadable";
    else if (pending || incomplete) consistency = "partial";
    else {
      try {
        assertD1GrantReferences(
          buildBundle(desiredCurrent(), D1_STAMP)
            .members as FormatGrantBundle["members"],
        );
      } catch {
        consistency = "inconsistent";
      }
    }
    const message =
      consistency === "partial"
        ? "Grant recovery is partial. Resolve the exact pending operation or review each remaining source member separately."
        : consistency === "inconsistent"
          ? "The current draft does not match the proposal library. IDs are preserved. Review a complete valid bundle or explicitly remove the draft key."
          : consistency === "unreadable"
            ? "A grant member is unreadable or invalid. Preserve its raw text before reviewing complete recovery."
            : "Grant members are consistent. No shared approval or atomic three-key save is implied.";
    return d1Freeze({
      members,
      pending,
      partial: consistency === "partial",
      consistency,
      message,
    });
  };
  const requireNormal = () => {
    if (
      pending ||
      (currentPlan && currentPlan.done.length < currentPlan.keys.length)
    )
      d1Fail(
        "pending_operation",
        "Finish or explicitly reload the current grant operation first.",
      );
    if (snapshot().consistency !== "consistent")
      d1Fail(
        "invalid_data",
        "Resolve the current grant relationship through recovery before ordinary writes.",
      );
    for (const k of GRANT_ORDER) cells[k].requireWrite();
  };
  const currentPlanCheck = (p: D1GrantRestorePlan) => {
    const d = plans.get(p);
    if (!d || d !== currentPlan || d.public !== p)
      d1Fail(
        "foreign_owner",
        "Use the current plan from this grant coordinator.",
      );
    if (d.changed)
      d1Fail("external_change", "This plan changed; select the source again.");
    return d;
  };
  const publish = (d: GrantPlanData): D1GrantRestorePlan => {
    const p = d1Freeze({
      format: "charitology-d1-grant-restore-plan",
      version: 1,
      sourceHash: d.sourceHash,
      bundle: d.bundle,
      steps: d.keys.map((key) => ({
        key,
        state: d.changed
          ? "changed"
          : d.done.includes(key)
            ? "applied"
            : d.failed === key
              ? "failed"
              : "ready",
        message: d.done.includes(key)
          ? "This member matched after its explicit step."
          : d.failed === key
            ? "Only this exact failed member may be retried."
            : "A separate preview and confirmation are required.",
      })),
      vector: vector(d.bindings),
    }) as unknown as D1GrantRestorePlan;
    if (d.public) plans.delete(d.public);
    d.public = p;
    plans.set(p, d);
    currentPlan = d;
    activeStep = null;
    return p;
  };
  const failPlan = (d: GrantPlanData, error: unknown): never => {
    if (
      error instanceof D1RecoveryError &&
      ["external_change", "stale_view"].includes(error.code)
    ) {
      d.changed = true;
      activeStep = null;
    }
    throw error;
  };
  const intentFor = async (
    key: D1GrantKey,
    d: D1Present<GrantValue>,
  ): Promise<D1Intent<GrantValue>> =>
    d.present
      ? { operation: "set", candidate: await cells[key].checked(d.value) }
      : { operation: "remove" };
  const executeRemaining = (
    remaining: readonly D1GrantIntent[],
    origin: "save" | "restore" | "remove",
    completed: readonly D1GrantKey[],
    sourceHash: string | null,
    onlyOne = false,
  ): Partial<Record<D1GrantKey, D1GrantMemberOutcome>> => {
    const outcomes: Partial<Record<D1GrantKey, D1GrantMemberOutcome>> = {};
    for (const i of remaining) outcomes[i.key] = "not-attempted";
    let done = [...completed];
    for (let idx = 0; idx < remaining.length; idx++) {
      const i = remaining[idx],
        cell = cells[i.key],
        target: D1Present<GrantValue> =
          i.operation === "set"
            ? { present: true, value: i.value }
            : { present: false };
      if (sameDesired(i.key, target)) {
        outcomes[i.key] = "no-op";
        done.push(i.key);
        continue;
      }
      const candidate =
        i.operation === "set"
          ? {
              operation: "set" as const,
              candidate: {
                value: d1Freeze(i.value),
                hash: d1Hash(i.value),
                raw: canonicalD1Json(i.value),
              },
            }
          : { operation: "remove" as const };
      grantAssign(cell, candidate, true);
      if (cell.snapshot().unsaved) {
        outcomes[i.key] = "unsaved";
        pending = d1Freeze({
          origin,
          remaining: remaining.slice(idx),
          completed: done,
          sourceHash,
        });
        pendingBindings = bind();
        return outcomes;
      }
      outcomes[i.key] = "saved";
      done.push(i.key);
      if (onlyOne) break;
    }
    pending = null;
    pendingBindings = null;
    return outcomes;
  };
  const previewPlan = (
    raw: string | Uint8Array,
    settings: D1ReloadOptions | undefined,
    individual?: D1GrantKey,
    removeKey?: D1GrantKey,
  ): Promise<GrantPlanData> => {
    entry();
    if (individual) keyCheck(individual);
    if (removeKey) keyCheck(removeKey);
    if (
      (individual || removeKey) &&
      pending &&
      pending.remaining.some((i) => i.key !== (individual ?? removeKey))
    )
      d1Fail(
        "pending_operation",
        "Resolve pending other members or review a complete source bundle.",
      );
    const choice = reloadChoice(settings),
      vs = viewState(view),
      before = bind(),
      owned = d1OwnRaw(
        raw,
        individual
          ? D1_LIMITS.individualBackupBytes
          : D1_LIMITS.grantBundleBytes,
      );
    const source = individual
      ? parseD1IndividualBackup(owned.raw, individual)
      : removeKey
        ? null
        : parseD1GrantBundle(owned.raw);
    discardGuard(
      choice.discard,
      vs.hasUnsubmittedForm,
      !!pending || GRANT_ORDER.some((k) => cells[k].snapshot().unsaved),
    );
    return enqueue(() =>
      locked(async () => {
        choice.assert();
        owned.assert();
        assertView(view, vs);
        for (const k of GRANT_ORDER) cells[k].requireRecover();
        assertMemory(before);
        previewBaseline(before);
        let desired: GrantDesired;
        if (!individual && !removeKey) {
          const bundle = source as D1GrantBundle;
          desired = Object.fromEntries(
            bundle.members.map((m) => [
              m.key,
              m.presence === "value"
                ? { present: true, value: m.value }
                : { present: false },
            ]),
          ) as GrantDesired;
        } else {
          desired = desiredCurrent();
          const key = individual ?? removeKey!;
          desired[key] = removeKey
            ? { present: false }
            : { present: true, value: source as GrantValue };
        }
        checkDesired(desired);
        for (const k of GRANT_ORDER)
          if (desired[k].present) await cells[k].checked(desired[k].value);
        choice.assert();
        owned.assert();
        assertView(view, vs);
        assertMemory(before);
        assertDisk(before);
        const bundle = d1Freeze(
            !individual && !removeKey
              ? (source as D1GrantBundle)
              : buildBundle(desired, D1_STAMP),
          ),
          sourceHash = await env.hash(bundle);
        choice.assert();
        owned.assert();
        assertView(view, vs);
        assertMemory(before);
        assertDisk(before);
        choice.assert();
        owned.assert();
        assertView(view, vs);
        const data: GrantPlanData = {
          bundle,
          sourceHash,
          desired,
          keys: individual
            ? [individual]
            : removeKey
              ? [removeKey]
              : [...GRANT_ORDER],
          done: [],
          failed: null,
          changed: false,
          full: !individual && !removeKey,
          origin: removeKey ? "remove" : "restore",
          view: vs,
          bindings: before,
          discard: choice.discard,
          public: null,
        };
        publish(data);
        return data;
      }),
    );
  };
  const makeStep = async (
    data: GrantPlanData,
    key: D1GrantKey,
    kind: "restore" | "remove",
  ): Promise<D1GrantStep> => {
    if (
      data !== currentPlan ||
      data.public === null ||
      plans.get(data.public) !== data
    )
      d1Fail("foreign_owner", "Use the current source plan.");
    if (data.failed)
      d1Fail(
        "pending_operation",
        "Retry only the failed member before reviewing a later step.",
      );
    if (data.keys.find((k) => !data.done.includes(k)) !== key)
      d1Fail("preview_required", "Review only the next unapplied member.");
    assertView(view, data.view);
    assertMemory(data.bindings);
    assertDisk(data.bindings);
    const target = await intentFor(key, data.desired[key]);
    assertView(view, data.view);
    assertMemory(data.bindings);
    assertDisk(data.bindings);
    const p = d1Freeze({
      format: "charitology-d1-grant-restore-step",
      version: 1,
      kind,
      key,
      sourceHash: data.sourceHash,
      vector: vector(data.bindings),
      candidate: data.desired[key],
    }) as unknown as D1GrantStep;
    steps.set(p, {
      data,
      key,
      kind,
      view: data.view,
      bindings: data.bindings,
      intent: target,
    });
    activeStep = p;
    return p;
  };
  const apply = (
    p: D1GrantStep,
    kind: "restore" | "remove",
  ): Promise<D1GrantStepResult> => {
    entry();
    const own = steps.get(p);
    if (
      !own ||
      own.kind !== kind ||
      activeStep !== p ||
      own.data !== currentPlan
    )
      d1Fail(
        "preview_required",
        "Use this coordinator's fresh next-member preview.",
      );
    steps.delete(p);
    activeStep = null;
    return enqueue(() =>
      locked(async () => {
        const d = own.data;
        try {
          assertView(view, own.view);
          assertMemory(own.bindings);
          assertDisk(own.bindings);
          assertView(view, own.view);
          for (const k of GRANT_ORDER) cells[k].requireRecover();
          discardGuard(
            d.discard,
            viewState(view).hasUnsubmittedForm,
            !!pending || GRANT_ORDER.some((k) => cells[k].snapshot().unsaved),
          );
          let outcome: D1GrantStepResult["outcome"] = "no-op";
          if (!sameDesired(own.key, d.desired[own.key])) {
            grantAssign(cells[own.key], own.intent, true);
            outcome = cells[own.key].snapshot().unsaved ? "unsaved" : "saved";
          }
          if (outcome === "unsaved") {
            d.failed = own.key;
            const desired = d.desired[own.key];
            pending = d1Freeze({
              origin: d.origin,
              remaining: [
                desired.present
                  ? { key: own.key, operation: "set", value: desired.value }
                  : { key: own.key, operation: "remove" },
              ] as D1GrantIntent[],
              completed: [...d.done],
              sourceHash: d.sourceHash,
            });
          } else {
            d.done.push(own.key);
            d.failed = null;
            pending = null;
          }
          d.bindings = bind();
          pendingBindings = pending ? d.bindings : null;
          const all =
            d.keys.every((k) => d.done.includes(k)) &&
            GRANT_ORDER.every((k) => sameDesired(k, d.desired[k]));
          const plan = publish(d);
          return d1Freeze({
            outcome,
            plan,
            snapshot: snapshot(),
            complete: d.full && all,
          });
        } catch (e) {
          return failPlan(d, e);
        }
      }),
    );
  };
  const saves = createD1ReplacementQueue<
    { values: D1GrantWriteSet; view: D1ViewState },
    D1GrantWriteResult
  >(
    enqueue,
    async (own) => {
      assertView(view, own.view);
      requireNormal();
      const before = bind(),
        desired = desiredCurrent();
      for (const k of GRANT_ORDER)
        if (Object.hasOwn(own.values, k))
          desired[k] = { present: true, value: own.values[k] as GrantValue };
      checkDesired(desired);
      for (const k of GRANT_ORDER)
        if (Object.hasOwn(own.values, k)) await cells[k].checked(own.values[k]);
      assertView(view, own.view);
      assertMemory(before);
      return locked(async () => {
        assertView(view, own.view);
        requireNormal();
        assertMemory(before);
        assertDisk(before);
        assertView(view, own.view);
        const intents = GRANT_ORDER.filter((k) =>
          Object.hasOwn(own.values, k),
        ).map((k) => ({
          key: k,
          operation: "set",
          value: own.values[k],
        })) as D1GrantIntent[];
        currentPlan = null;
        const outcomes = executeRemaining(intents, "save", [], null);
        return d1Freeze({
          outcomes,
          formGeneration: own.view.formGeneration,
          snapshot: snapshot(),
        });
      });
    },
    (own) => ({
      outcomes: {},
      formGeneration: own.view.formGeneration,
      snapshot: snapshot(),
    }),
  );
  const coordinator: D1GrantCoordinator = {
    snapshot,
    captureSave(values) {
      entry();
      requireNormal();
      if (!values || Object.getPrototypeOf(values) !== Object.prototype)
        d1Fail("invalid_data", "Capture a plain grant write set.");
      const keys = Reflect.ownKeys(values);
      if (
        keys.some(
          (k) =>
            typeof k !== "string" ||
            !("value" in Object.getOwnPropertyDescriptor(values, k)!),
        )
      )
        d1Fail("invalid_data", "Grant captures require own data fields.");
      if (
        !keys.length ||
        keys.some((k) => !GRANT_ORDER.includes(k as D1GrantKey))
      )
        d1Fail(
          "invalid_data",
          "Capture one or more complete grant members only.",
        );
      const clean: Record<string, unknown> = {};
      for (const k of keys as D1GrantKey[]) {
        clean[k] = validateD1Value(k, values[k]);
        d1IndividualBackup(k, clean[k] as D1ValueMap[typeof k], D1_STAMP);
      }
      const vs = viewState(view),
        capture = d1Freeze({
          format: "charitology-d1-grant-save-capture",
          version: 1,
          values: clean,
          formGeneration: vs.formGeneration,
          recoveryGeneration: vs.recoveryGeneration,
        }) as unknown as D1GrantSaveCapture;
      captures.set(capture, { values: clean as D1GrantWriteSet, view: vs });
      return capture;
    },
    saveCaptured(capture) {
      entry();
      const own = captures.get(capture);
      if (!own)
        d1Fail("foreign_owner", "Use this coordinator's unused save capture.");
      captures.delete(capture);
      return saves.submit(own);
    },
    retryPending() {
      entry();
      if (!pending || pending.origin !== "save" || !pendingBindings)
        d1Fail(
          "pending_operation",
          "Only an ordinary saved-value operation may use this retry. Restore/remove require their failed plan.",
        );
      const own = pending,
        b = pendingBindings,
        vs = viewState(view);
      return enqueue(() =>
        locked(async () => {
          assertView(view, vs);
          if (pending !== own)
            d1Fail("stale_view", "The pending grant operation changed.");
          assertMemory(b);
          assertDisk(b);
          assertView(view, vs);
          const desired = overlayPending(desiredCurrent(), own.remaining);
          checkDesired(desired);
          for (const k of GRANT_ORDER)
            if (cells[k].pending()) grantRetry(cells[k]);
          if (GRANT_ORDER.some((k) => cells[k].snapshot().unsaved)) {
            pendingBindings = bind();
            return {
              outcomes: Object.fromEntries(
                own.remaining.map((i) => [
                  i.key,
                  cells[i.key].snapshot().unsaved ? "unsaved" : "not-attempted",
                ]),
              ) as D1GrantWriteResult["outcomes"],
              formGeneration: vs.formGeneration,
              snapshot: snapshot(),
            };
          }
          const outcomes = executeRemaining(
            own.remaining,
            "save",
            own.completed,
            own.sourceHash,
          );
          return d1Freeze({
            outcomes,
            formGeneration: vs.formGeneration,
            snapshot: snapshot(),
          });
        }),
      );
    },
    async bundle(at) {
      entry();
      const when = d1Watch(at, 1024).value;
      return d1GrantBundle(
        buildBundle(desiredCurrent(), when) as FormatGrantBundle,
      );
    },
    async desiredBundle(at) {
      entry();
      const when = d1Watch(at, 1024).value;
      const desired = fullDesired();
      checkDesired(desired);
      return d1GrantBundle(buildBundle(desired, when) as FormatGrantBundle);
    },
    async individual(key, at) {
      entry();
      keyCheck(key);
      const when = d1Watch(at, 1024).value,
        s = cells[key].snapshot();
      if (!s.hasState)
        d1Fail(
          "corrupt",
          "No validated current member exists. Use raw recovery.",
        );
      return d1IndividualBackup(key, s.value as D1ValueMap[typeof key], when);
    },
    async previewBundle(raw, settings) {
      return (await previewPlan(raw, settings)).public!;
    },
    previewStep(plan, key) {
      entry();
      keyCheck(key);
      const d = currentPlanCheck(plan),
        vs = viewState(view),
        before = bind();
      activeStep = null;
      return enqueue(() =>
        locked(async () => {
          assertView(view, vs);
          currentPlanCheck(plan);
          assertMemory(before);
          assertDisk(before);
          return makeStep(d, key, "restore") as Promise<
            D1GrantRestoreStep<typeof key>
          >;
        }),
      );
    },
    applyStep: (p) => apply(p, "restore"),
    retryStep(plan) {
      entry();
      const d = currentPlanCheck(plan);
      if (!d.failed || !pending || pending.origin === "save")
        d1Fail("pending_operation", "Use the current failed member plan only.");
      const vs = viewState(view),
        b = d.bindings,
        key = d.failed;
      return enqueue(() =>
        locked(async () => {
          try {
            assertView(view, vs);
            currentPlanCheck(plan);
            assertMemory(b);
            assertDisk(b);
            assertView(view, vs);
            grantRetry(cells[key]);
            const outcome = cells[key].snapshot().unsaved
              ? ("unsaved" as const)
              : ("saved" as const);
            if (outcome === "saved") {
              d.done.push(key);
              d.failed = null;
              pending = null;
              pendingBindings = null;
            }
            d.bindings = bind();
            if (pending) pendingBindings = d.bindings;
            const all =
              d.keys.every((k) => d.done.includes(k)) &&
              GRANT_ORDER.every((k) => sameDesired(k, d.desired[k]));
            const fresh = publish(d);
            return d1Freeze({
              outcome,
              plan: fresh,
              snapshot: snapshot(),
              complete: d.full && all,
            });
          } catch (e) {
            return failPlan(d, e);
          }
        }),
      );
    },
    async previewIndividual(key, raw, settings) {
      const d = await previewPlan(raw, settings, key);
      return enqueue(() =>
        locked(() => makeStep(d, key, "restore")),
      ) as Promise<D1GrantRestoreStep<typeof key>>;
    },
    async previewRemove(key, settings) {
      entry();
      keyCheck(key);
      const d = await previewPlan("null", settings, undefined, key);
      return enqueue(() => locked(() => makeStep(d, key, "remove"))) as Promise<
        D1GrantRemoveStep<typeof key>
      >;
    },
    remove: (p) => apply(p, "remove"),
    reload(settings) {
      entry();
      const choice = reloadChoice(settings),
        vs = viewState(view),
        before = Object.fromEntries(
          GRANT_ORDER.map((k) => [k, cells[k].snapshot().generation]),
        );
      discardGuard(
        choice.discard,
        vs.hasUnsubmittedForm,
        !!pending || GRANT_ORDER.some((k) => cells[k].snapshot().unsaved),
      );
      return enqueue(async () => {
        const run = async () => {
          choice.assert();
          assertView(view, vs);
          if (
            GRANT_ORDER.some(
              (k) => cells[k].snapshot().generation !== before[k],
            )
          )
            d1Fail("stale_view", "Grant members changed before reload.");
          for (const k of GRANT_ORDER)
            await cells[k].load(choice.discard, vs.hasUnsubmittedForm, () => {
              choice.assert();
              assertView(view, vs);
            });
          activeStep = null;
          if (
            GRANT_ORDER.every((k) => {
              const s = cells[k].snapshot();
              return (
                (s.code === "ready" || s.code === "unsupported") && !s.unsaved
              );
            })
          ) {
            currentPlan = null;
            pending = null;
            pendingBindings = null;
          } else if (currentPlan) currentPlan.changed = true;
          return snapshot();
        };
        return env.supported ? locked(run) : run();
      });
    },
    noticeExternalChange(key) {
      env.entry();
      if (key !== null) keyCheck(key);
      for (const k of key ? [key] : GRANT_ORDER) cells[k].notice();
      if (currentPlan) currentPlan.changed = true;
      activeStep = null;
      return snapshot();
    },
    protectedRawCopy(key) {
      keyCheck(key);
      return cells[key].protectedRaw();
    },
    observedRawCopy(key) {
      keyCheck(key);
      return cells[key].observedRaw();
    },
    dispose() {
      env.entry();
      for (const k of GRANT_ORDER) cells[k].dispose();
      activeStep = null;
      currentPlan = null;
    },
  };
  bindings.set(coordinator, view);
  return Object.freeze(coordinator);
}
