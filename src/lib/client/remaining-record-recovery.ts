/** Twenty fixed local records. Saved bytes, unfinished forms and native backups stay distinct. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  canonicalRemainingRecordJson as canonical,
  copyRemainingRecordPlain,
  validateRemainingRecordValue,
  defaultRemainingRecordValue,
  requireRemainingRecordKey,
  partnerForRemainingKey,
  researchForRemainingKey,
  remainingRecordCapacity,
  remainingRecordFormFields,
  type RRKey,
  type RRValueMap,
  type RRNative,
  type RRReadonly,
  type RRFormId,
} from "./remaining-record-recovery-schemas";
import {
  REMAINING_RECORD_LIMITS,
  parseRemainingRecordBackup,
  remainingRecordBackup,
} from "./remaining-record-recovery-formats";
export { REMAINING_RECORD_LIMITS };
export type {
  RRKey,
  RRResearchProgram,
  RRPartnerProgram,
  RRResearchKey,
  RRPartnerKey,
  RROtherKey,
  RRValueMap,
  RRNative,
  RRReadonly,
  RRManuscriptField,
  RRManuscript,
  RRCountryNotes,
  RRPartnerCollection,
  RRFormId,
  RRRawForm,
  RRFormArchive,
  RRRawArchive,
  RRHydratedString,
  RRCapacity,
} from "./remaining-record-recovery-schemas";
export {
  remainingRecordCapacity,
  remainingRecordHydratedString,
} from "./remaining-record-recovery-schemas";
export type RRHash = string;
export type RRCode =
  "ready" | "read-only" | "corrupt" | "conflict" | "unavailable" | "disposed";
export type RRFailureCode =
  | "invalid_data"
  | "input_limit"
  | "unavailable"
  | "stale_view"
  | "foreign_owner"
  | "used_preview"
  | "superseded"
  | "conflict"
  | "unsaved_intent"
  | "discard_required"
  | "disposed";
type InternalCode =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
type InternalError =
  | InternalCode
  | RRFailureCode
  | "input_changed"
  | "used_authority"
  | "pending_operation"
  | "reentrant_call";
export class RRRecordError extends Error {
  constructor(
    public readonly code: RRFailureCode,
    message: string,
    public readonly path?: string,
  ) {
    super(message);
    this.name = "RRRecordError";
  }
}
function failureCode(code: InternalError): RRFailureCode {
  if (
    code === "unsupported" ||
    code === "read_error" ||
    code === "reentrant_call"
  )
    return "unavailable";
  if (code === "external_change") return "conflict";
  if (code === "closed") return "disposed";
  if (code === "used_authority") return "used_preview";
  if (code === "pending_operation" || code === "persist_failed")
    return "unsaved_intent";
  if (code === "corrupt" || code === "input_changed" || code === "ready")
    return "invalid_data";
  return code;
}
function fail(code: InternalError, message: string): never {
  throw new RRRecordError(failureCode(code), message);
}
export type RRCurrent<T> =
  | { readonly hasCurrent: true; readonly value: RRReadonly<T> }
  | { readonly hasCurrent: false; readonly value: null };
export type RRSnapshot<K extends RRKey> = Readonly<
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
export declare const rrViewToken: unique symbol;
export interface RRViewToken {
  readonly [rrViewToken]: true;
  readonly generation: number;
}
export interface RRViewTracker {
  readonly key: RRKey;
  changedForm(form: RRFormId): void;
  changedView(): void;
  capture(): RRViewToken;
  isCurrent(token: RRViewToken): boolean;
  markClean(form: RRFormId, token: RRViewToken): boolean;
  snapshot(): Readonly<{ generation: number; dirtyForms: readonly RRFormId[] }>;
  dispose(): void;
}
export declare const rrCapture: unique symbol;
export declare const rrRestore: unique symbol;
export declare const rrRemove: unique symbol;
export interface RRCapturedSave<K extends RRKey> {
  readonly [rrCapture]: true;
  readonly key: K;
  readonly view: RRViewToken;
  readonly form: RRFormId | null;
}
export interface RRPreviewSummary {
  readonly title: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly replacesCurrent: true;
  readonly discardsLocal: boolean;
}
export interface RRRestorePreview<K extends RRKey> {
  readonly [rrRestore]: true;
  readonly key: K;
  readonly kind: "restore" | "example" | "replace";
  readonly view: RRViewToken;
  readonly reviewHash: RRHash;
  readonly summary: RRPreviewSummary;
}
export interface RRRemovePreview<K extends RRKey> {
  readonly [rrRemove]: true;
  readonly key: K;
  readonly kind: "remove";
  readonly view: RRViewToken;
  readonly reviewHash: RRHash;
  readonly summary: RRPreviewSummary;
}
export interface RRWriteResult<K extends RRKey> {
  readonly outcome: "saved" | "no-op" | "unsaved" | "superseded";
  readonly snapshot: RRSnapshot<K>;
  readonly viewCurrent: boolean;
  readonly view: RRViewToken;
}
export interface RRNativeExport {
  readonly text: string;
  readonly persistence: RRSnapshot<RRKey>["persistence"];
  readonly formOrigin: "current-model";
}
export interface RRRawSavedCopy {
  readonly copy: "protected" | "observed";
  readonly raw: string;
}
export interface RRSession<K extends RRKey> {
  readonly key: K;
  snapshot(): RRSnapshot<K>;
  captureSave(
    value: RRValueMap[K] | RRReadonly<RRValueMap[K]>,
    options: { form: RRFormId | null },
  ): RRCapturedSave<K>;
  saveCaptured(captured: RRCapturedSave<K>): Promise<RRWriteResult<K>>;
  retryPersist(): Promise<RRWriteResult<K>>;
  previewRestore(
    raw: string | Uint8Array,
    options: { discardLocal: boolean },
  ): Promise<RRRestorePreview<K>>;
  previewReplace(
    value: RRValueMap[K] | RRReadonly<RRValueMap[K]>,
    options: { kind: "example" | "replace"; discardLocal: boolean },
  ): Promise<RRRestorePreview<K>>;
  applyRestore(preview: RRRestorePreview<K>): Promise<RRWriteResult<K>>;
  previewRemove(options: {
    discardLocal: boolean;
  }): Promise<RRRemovePreview<K>>;
  applyRemove(preview: RRRemovePreview<K>): Promise<RRWriteResult<K>>;
  undo(options: { discardLocal: boolean }): Promise<RRWriteResult<K>>;
  reload(options: { discardLocal: boolean }): Promise<RRSnapshot<K>>;
  noticeExternalChange(): Promise<RRSnapshot<K>>;
  exportNative(): RRNativeExport;
  rawSavedCopy(copy: "protected" | "observed"): RRRawSavedCopy | null;
  dispose(): void;
}

type ViewState = {
  key: RRKey;
  generation: number;
  dirty: Set<RRFormId>;
  closed: boolean;
  owner: object | null;
};
const views = new WeakMap<object, ViewState>();
const tokens = new WeakMap<
  object,
  { view: RRViewTracker; generation: number }
>();
const bindings = new WeakMap<object, RRViewTracker>();
// Internal revocation only; the public tracker accepts no application callbacks.
const viewRevocations = new WeakMap<object, () => void>();
const viewState = (view: RRViewTracker): ViewState => {
  const state = views.get(view);
  if (!state) fail("foreign_owner", "Use the exact owned view tracker.");
  if (state.closed) fail("closed", "This view is closed.");
  return state;
};
function assertView(view: RRViewTracker, token: RRViewToken): void {
  const state = viewState(view),
    owned = tokens.get(token);
  if (!owned || owned.view !== view)
    fail("foreign_owner", "Use this view's exact token.");
  if (state.generation !== owned.generation)
    fail(
      "stale_view",
      "The form or source choice changed. Review this action again.",
    );
}
export function createRemainingRecordView(key: RRKey): RRViewTracker {
  requireRemainingRecordKey(key);
  const state: ViewState = {
    key,
    generation: 0,
    dirty: new Set(),
    closed: false,
    owner: null,
  };
  const bump = () => {
    viewState(view);
    if (!Number.isSafeInteger(state.generation + 1))
      fail("closed", "Reopen this view before continuing.");
    state.generation++;
    viewRevocations.get(view)?.();
  };
  const view: RRViewTracker = Object.freeze({
    key,
    changedForm(form: RRFormId) {
      remainingRecordFormFields(key, form);
      bump();
      state.dirty.add(form);
    },
    changedView: bump,
    capture() {
      viewState(view);
      const token = Object.freeze({
        generation: state.generation,
      }) as RRViewToken;
      tokens.set(token, { view, generation: state.generation });
      return token;
    },
    isCurrent(token: RRViewToken) {
      const own = tokens.get(token);
      return (
        !state.closed &&
        own?.view === view &&
        own.generation === state.generation
      );
    },
    markClean(form: RRFormId, token: RRViewToken) {
      remainingRecordFormFields(key, form);
      if (!view.isCurrent(token)) return false;
      state.dirty.delete(form);
      return true;
    },
    snapshot() {
      viewState(view);
      return Object.freeze({
        generation: state.generation,
        dirtyForms: Object.freeze([...state.dirty]),
      });
    },
    dispose() {
      if (!state.closed) {
        state.closed = true;
        state.generation++;
        state.dirty.clear();
        viewRevocations.get(view)?.();
        viewRevocations.delete(view);
      }
    },
  });
  views.set(view, state);
  return view;
}
export function assertRemainingRecordControlBinding<K extends RRKey>(
  session: RRSession<K>,
  view: RRViewTracker,
): void {
  viewState(view);
  if (bindings.get(session) !== view)
    fail(
      "foreign_owner",
      "Controls require the exact session and its owned tracker.",
    );
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
const hash = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(canonical(value))));
const rawHash = (raw: string | null) => (raw === null ? null : hash({ raw }));
function watch<T>(value: T, cap: number = 128_000_000) {
  // All caller reflection ends synchronously before any await or held lock.
  // Later caller mutation cannot retarget this owned detached value.
  return {
    value: freeze(copyRemainingRecordPlain(value, cap)) as T,
    assert() {},
  };
}
function options<T extends object>(input: T, names: readonly string[]) {
  const watched = watch(input, 2048);
  if (
    !watched.value ||
    typeof watched.value !== "object" ||
    Array.isArray(watched.value) ||
    Object.keys(watched.value).length !== names.length ||
    names.some((k) => !Object.hasOwn(watched.value, k))
  )
    fail("invalid_data", "Use the exact explicit options for this action.");
  return watched;
}
function choice(input: { discardLocal: boolean }) {
  const own = options(input, ["discardLocal"]);
  if (typeof own.value.discardLocal !== "boolean")
    fail(
      "invalid_data",
      "Choose whether to discard this local version explicitly.",
    );
  return own;
}
function ownedRaw(raw: string | Uint8Array, key: RRKey) {
  const cap = remainingRecordCapacity(key).nativeBytes;
  if (typeof raw === "string") {
    // Parse before copying/traversal; this also rejects nonrepresentable raw UTF-16.
    if (raw.length > cap || new TextEncoder().encode(raw).byteLength > cap)
      fail("input_limit", "The complete native file exceeds its limit.");
    return { raw, assert() {} };
  }
  const proto = Object.getPrototypeOf(Uint8Array.prototype),
    length = Object.getOwnPropertyDescriptor(proto, "byteLength")!.get!,
    buffer = Object.getOwnPropertyDescriptor(proto, "buffer")!.get!;
  let n: number, backing: ArrayBuffer;
  try {
    if (!ArrayBuffer.isView(raw))
      fail("invalid_data", "Choose genuine native bytes.");
    n = length.call(raw);
    backing = buffer.call(raw);
  } catch {
    fail("invalid_data", "Choose ordinary detached UTF-8 file bytes.");
  }
  if (n > cap)
    fail("input_limit", "The complete native file exceeds its limit.");
  if (
    Object.getPrototypeOf(raw) !== Uint8Array.prototype ||
    Object.getPrototypeOf(backing) !== ArrayBuffer.prototype ||
    Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      "resizable",
    )?.get?.call(backing)
  )
    fail("invalid_data", "Choose undecorated nonshared UTF-8 bytes.");
  const copy = new Uint8Array(n);
  try {
    Uint8Array.prototype.set.call(copy, raw);
  } catch {
    fail("invalid_data", "Detached byte storage is unsupported.");
  }
  // Source decorations are inert transport metadata, never consulted. The owned
  // exact bytes cannot be retargeted by a later caller mutation.
  return { raw: copy, assert() {} };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface LocksLike {
  request<T>(
    key: string,
    options: { mode: "exclusive" },
    run: () => Promise<T>,
  ): Promise<T>;
}
let dependencyDepth = 0;
function method<T extends (...args: never[]) => unknown>(
  target: unknown,
  name: string,
): T | null {
  if (!target) return null;
  let at = target as object;
  while (at) {
    const d = Object.getOwnPropertyDescriptor(at, name);
    if (d) {
      if (!("value" in d))
        fail("invalid_data", "Dependency methods must be data functions.");
      return typeof d.value === "function" ? (d.value.bind(target) as T) : null;
    }
    at = Object.getPrototypeOf(at);
  }
  return null;
}
function environment() {
  let storage: StorageLike | undefined,
    locks: LocksLike | undefined,
    crypto: Crypto | undefined;
  try {
    storage = globalThis.localStorage;
  } catch {
    /* denied storage is not absence */
  }
  try {
    locks =
      typeof navigator === "undefined"
        ? undefined
        : (navigator.locks as unknown as LocksLike);
  } catch {
    /* read-only */
  }
  try {
    crypto = globalThis.crypto;
  } catch {
    /* read-only */
  }
  const get = method<StorageLike["getItem"]>(storage, "getItem"),
    set = method<StorageLike["setItem"]>(storage, "setItem"),
    remove = method<StorageLike["removeItem"]>(storage, "removeItem"),
    request = method<LocksLike["request"]>(locks, "request");
  const digest = crypto?.subtle
    ? method<SubtleCrypto["digest"]>(crypto.subtle, "digest")
    : null;
  let supported = !!request && !!digest && globalThis.isSecureContext !== false;
  const entry = () => {
    if (dependencyDepth)
      fail(
        "reentrant_call",
        "Storage and lock dependencies cannot reenter this operation.",
      );
  };
  const call = <T>(fn: () => T): T => {
    entry();
    dependencyDepth++;
    try {
      return fn();
    } finally {
      dependencyDepth--;
    }
  };
  return {
    get supported() {
      return supported;
    },
    entry,
    get(key: string) {
      return call(() => {
        if (!get) throw Error("Read denied");
        const value = get(key);
        if (value !== null && typeof value !== "string")
          throw Error("Invalid storage response");
        return value;
      });
    },
    set(key: string, value: string) {
      call(() => {
        if (!set) throw Error("Write denied");
        set(key, value);
      });
    },
    remove(key: string) {
      call(() => {
        if (!remove) throw Error("Removal denied");
        remove(key);
      });
    },
    async digest(value: unknown) {
      return this.digestBytes(new TextEncoder().encode(canonical(value)));
    },
    async digestBytes(bytes: Uint8Array) {
      if (!digest) return bytesToHex(sha256(bytes));
      let result: ArrayBuffer;
      try {
        result = await call(() => digest("SHA-256", bytes as BufferSource));
      } catch (error) {
        if (error instanceof RRRecordError) throw error;
        // Valid local records stay recoverable if the browser denies secure hashing.
        // Every mutation still sees supported=false before its final lock/write.
        supported = false;
        return bytesToHex(sha256(bytes));
      }
      const hex = bytesToHex(new Uint8Array(result));
      if (!/^[0-9a-f]{64}$/.test(hex))
        fail("invalid_data", "Hashing returned an invalid digest.");
      return hex;
    },
    async lock<T>(key: string, run: () => Promise<T>): Promise<T> {
      if (!supported || !request)
        fail(
          "unsupported",
          "Web Locks and secure hashing are required for changes.",
        );
      let entered = false;
      try {
        return await call(() =>
          request(key, { mode: "exclusive" }, () =>
            Promise.resolve().then(() => {
              entered = true;
              return run();
            }),
          ),
        );
      } catch (error) {
        if (!entered) {
          supported = false;
          fail(
            "unsupported",
            "Web Locks are unavailable. Nothing was written.",
          );
        }
        throw error;
      }
    },
  };
}
type Candidate<K extends RRKey> = {
  value: RRReadonly<RRValueMap[K]>;
  native: RRReadonly<RRNative<K>> | null;
  raw: string | null;
  hash: RRHash;
};
type Intent<K extends RRKey> =
  | { operation: "set"; candidate: Candidate<K> }
  | { operation: "remove"; candidate: Candidate<K> };
type Binding = {
  generation: number;
  hash: string | null;
  raw: string | null;
  present: boolean;
  hasCurrent: boolean;
};
const external =
  "Another tab changed the saved record. Current work and the protected original remain available. Review the newly observed copy before replacing it.";
function logical<K extends RRKey>(
  _key: K,
  native: RRReadonly<RRNative<K>>,
): RRReadonly<RRValueMap[K]> {
  return native;
}
function semantic<K extends RRKey>(
  _key: K,
  value: RRReadonly<RRValueMap[K]>,
): string {
  return canonical(value);
}
function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(run: () => Promise<T>): Promise<T> => {
    const result = tail.then(run, run);
    tail = result.catch(() => {});
    return result;
  };
}

export async function openRemainingRecordSession<K extends RRKey>(
  key: K,
  input: { view: RRViewTracker },
): Promise<RRSession<K>> {
  requireRemainingRecordKey(key);
  if (
    !input ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).length !== 1 ||
    !Object.getOwnPropertyDescriptor(input, "view") ||
    !("value" in Object.getOwnPropertyDescriptor(input, "view")!)
  )
    fail("invalid_data", "Use only the exact owned view option.");
  const view = Object.getOwnPropertyDescriptor(input, "view")!
      .value as RRViewTracker,
    vs = viewState(view);
  if (vs.key !== key || vs.owner)
    fail("foreign_owner", "One session owns this exact fixed-key tracker.");
  const owner = Object.freeze({});
  vs.owner = owner;
  const env = environment(),
    enqueue = serialQueue();
  let current: Candidate<K> | null = null,
    observed: string | null | undefined,
    protectedRaw: string | undefined,
    generation = 0,
    present = false,
    unsaved = false,
    blocked = false,
    closed = false,
    code: InternalCode = env.supported ? "ready" : "unsupported",
    message = env.supported
      ? ""
      : "This browser is read-only: Web Locks and secure hashing are required.";
  let pending: Intent<K> | null = null,
    undo: { candidate: Candidate<K>; present: boolean } | null = null,
    clearUndoOnSuccess = false;
  const live = () => {
    env.entry();
    viewState(view);
    if (closed) fail("closed", "This record session is closed.");
  };
  let revokeQueued = () => {};
  let revokeAuthorities = () => {};
  const begin = () => {
    live();
    view.changedView();
    revokeQueued();
    revokeAuthorities();
    return view.capture();
  };
  const support = () => {
    live();
    if (!env.supported)
      fail(
        "unsupported",
        "This browser is read-only: Web Locks and secure hashing are required.",
      );
  };
  const snapshot = (): RRSnapshot<K> =>
    freeze({
      key,
      generation,
      persistence:
        observed === undefined
          ? current
            ? "unsaved"
            : "unavailable"
          : unsaved || (blocked && !!current)
            ? "unsaved"
            : blocked
              ? "unavailable"
              : observed === null
                ? "absent"
                : "saved",
      observedPresence:
        observed === undefined
          ? "unreadable"
          : observed === null
            ? "absent"
            : "present",
      code:
        closed || vs.closed
          ? "disposed"
          : !env.supported
            ? "read-only"
            : code === "corrupt"
              ? "corrupt"
              : code === "external_change"
                ? "conflict"
                : code === "read_error"
                  ? "unavailable"
                  : "ready",
      message:
        closed || vs.closed
          ? "This record session is closed."
          : message ||
            (!env.supported
              ? "This browser is read-only: Web Locks and secure hashing are required."
              : ""),
      pendingPersist: pending !== null,
      canUndo: !closed && !vs.closed && undo !== null,
      hasProtectedRaw: protectedRaw !== undefined,
      hasObservedRaw: typeof observed === "string",
      canWrite:
        env.supported &&
        !closed &&
        !vs.closed &&
        !blocked &&
        !!current &&
        observed !== undefined &&
        !pending,
      ...(current
        ? { hasCurrent: true as const, value: current.value }
        : { hasCurrent: false as const, value: null }),
    }) as RRSnapshot<K>;
  const protect = (raw: string | null | undefined) => {
    if (protectedRaw === undefined && typeof raw === "string")
      protectedRaw = raw;
  };
  const block = (next: InternalCode, why: string) => {
    blocked = true;
    code = next;
    message = why;
  };
  const read = () => {
    try {
      return env.get(key);
    } catch (error) {
      if (error instanceof RRRecordError) throw error;
      protect(observed);
      observed = undefined;
      generation++;
      block(
        "read_error",
        "Saved bytes could not be read. Export current work and try an explicit reload.",
      );
      fail("read_error", message);
    }
  };
  const foreign = (raw: string | null, prior = observed) => {
    protect(prior);
    observed = raw;
    generation++;
    block("external_change", external);
  };
  const binding = (): Binding => {
    if (observed === undefined)
      fail(
        "read_error",
        "Saved bytes are unavailable; reload before recovery.",
      );
    return {
      generation,
      hash: current?.hash ?? null,
      raw: observed,
      present,
      hasCurrent: !!current,
    };
  };
  const assertMemory = (b: Binding) => {
    if (
      generation !== b.generation ||
      (current?.hash ?? null) !== b.hash ||
      !!current !== b.hasCurrent ||
      present !== b.present
    )
      fail("stale_view", "The record changed while this action was pending.");
  };
  const assertDisk = (b: Binding, guard: () => void) => {
    const actual = read();
    guard();
    assertMemory(b);
    if (actual !== b.raw) {
      foreign(actual, b.raw);
      fail("external_change", external);
    }
  };
  const requireWrite = () => {
    support();
    if (blocked || observed === undefined || !current)
      fail(code, message || "Use recovery before saving.");
    if (pending)
      fail(
        "pending_operation",
        "Retry the exact pending operation or explicitly recover before new work.",
      );
  };
  const requireRecover = () => {
    support();
    if (observed === undefined)
      fail(
        "read_error",
        "Saved bytes are unavailable. Try an explicit reload.",
      );
  };
  const discarded = () => {
    const s = snapshot();
    return (
      unsaved ||
      s.pendingPersist ||
      (s.hasCurrent && s.persistence === "unsaved")
    );
  };
  const discardGuard = (allowed: boolean) => {
    if (!allowed && (viewState(view).dirty.size > 0 || discarded()))
      fail(
        "discard_required",
        "Export records and unfinished forms, then explicitly confirm discarding this local version.",
      );
  };
  const defaultCandidate = (): Candidate<K> => {
    const value = defaultRemainingRecordValue(key);
    return {
      value,
      native: value,
      raw: JSON.stringify(value),
      hash: hash(value),
    };
  };
  const candidate = async (
    native: RRReadonly<RRNative<K>>,
  ): Promise<Candidate<K>> => ({
    value: native,
    native,
    raw: JSON.stringify(native),
    hash: await env.digest(native),
  });
  const persist = () => {
    if (!pending) return;
    try {
      if (pending.operation === "set") env.set(key, pending.candidate.raw!);
      else env.remove(key);
      observed = pending.operation === "set" ? pending.candidate.raw! : null;
      present = pending.operation === "set";
      pending = null;
      unsaved = false;
      blocked = false;
      code = env.supported ? "ready" : "unsupported";
      message = "";
      if (clearUndoOnSuccess) undo = null;
      clearUndoOnSuccess = false;
    } catch (error) {
      if (error instanceof RRRecordError) throw error;
      unsaved = true;
      code = "persist_failed";
      message =
        "This exact change is only in memory. Export it or retry this operation.";
    }
  };
  const assign = (intent: Intent<K>, keepUndo: boolean, clearAfter = false) => {
    if (keepUndo && current) undo = { candidate: current, present };
    current = intent.candidate;
    present = intent.operation === "set";
    pending = intent;
    clearUndoOnSuccess = clearAfter;
    generation++;
    unsaved = true;
    blocked = false;
    persist();
  };
  const result = (
    token: RRViewToken,
    outcome: RRWriteResult<K>["outcome"] = unsaved ? "unsaved" : "saved",
  ): RRWriteResult<K> =>
    freeze({
      outcome,
      snapshot: snapshot(),
      viewCurrent: view.isCurrent(token),
      view: token,
    });
  const load = async (
    discard: boolean,
    token: RRViewToken,
  ): Promise<RRSnapshot<K>> => {
    discardGuard(discard);
    const before = { generation, current },
      raw = (() => {
        try {
          return read();
        } catch (error) {
          if (error instanceof RRRecordError && error.code === "unavailable")
            return undefined;
          throw error;
        }
      })();
    if (raw === undefined) return snapshot();
    const guard = () => {
      assertView(view, token);
      if (generation !== before.generation || current !== before.current)
        fail("stale_view", "The record changed before reload completed.");
    };
    let next: Candidate<K>;
    try {
      next =
        raw === null
          ? defaultCandidate()
          : await candidate(parseRemainingRecordBackup(raw, key));
    } catch (error) {
      if (error instanceof RRRecordError) throw error;
      guard();
      observed = raw;
      protect(raw);
      generation++;
      block(
        "corrupt",
        "Saved data failed its native schema. Its original text is protected; review a replacement or key removal.",
      );
      return snapshot();
    }
    guard();
    const actual = read();
    guard();
    if (actual !== raw) {
      foreign(actual, raw);
      return snapshot();
    }
    current = next;
    present = raw !== null;
    observed = raw;
    // Loading a valid newly observed copy does not silently discard protected A.
    // Only this explicit captured discard choice may release it after success.
    if (discard) protectedRaw = undefined;
    pending = null;
    undo = null;
    clearUndoOnSuccess = false;
    generation++;
    unsaved = false;
    blocked = false;
    code = env.supported ? "ready" : "unsupported";
    message = env.supported
      ? ""
      : "This browser is read-only: Web Locks and secure hashing are required.";
    return snapshot();
  };
  const initialToken = view.capture();
  if (env.supported) {
    try {
      await env.lock(key, () => load(true, initialToken));
    } catch (error) {
      if (error instanceof RRRecordError && error.code === "unavailable")
        await load(true, initialToken);
      else throw error;
    }
  } else await load(true, initialToken);
  let captures = new WeakMap<
    object,
    {
      native: RRReadonly<RRNative<K>>;
      view: RRViewToken;
      binding: Binding;
    }
  >();
  type Recovery = {
    intent: Intent<K>;
    view: RRViewToken;
    binding: Binding;
    discard: boolean;
    kind: "restore" | "example" | "replace" | "remove";
  };
  let previews = new WeakMap<object, Recovery>();
  const saveMetadata = new WeakMap<object, { view: RRViewToken }>();
  const consumed = new WeakSet<object>(),
    issued = new WeakSet<object>();
  revokeAuthorities = () => {
    captures = new WeakMap();
    previews = new WeakMap();
  };
  type FullJob = { run(): Promise<void>; supersede(): void };
  let slot: FullJob | null = null,
    running = false,
    scheduled = false;
  revokeQueued = () => {
    const old = slot;
    slot = null;
    old?.supersede();
  };
  const schedule = () => {
    if (running || scheduled || !slot) return;
    scheduled = true;
    void enqueue(async () => {
      scheduled = false;
      const job = slot;
      slot = null;
      if (!job) return;
      running = true;
      try {
        await job.run();
      } finally {
        running = false;
        schedule();
      }
    });
  };
  function fullReplacement<R>(
    run: () => Promise<R>,
    superseded: () => R,
  ): Promise<R> {
    revokeQueued();
    const result = new Promise<R>((resolve, reject) => {
      slot = {
        async run() {
          try {
            resolve(await run());
          } catch (error) {
            reject(error);
          }
        },
        supersede() {
          try {
            resolve(superseded());
          } catch (error) {
            reject(error);
          }
        },
      };
    });
    schedule();
    return result;
  }
  viewRevocations.set(view, () => {
    revokeQueued();
    revokeAuthorities();
  });
  const counts = (value: RRReadonly<RRValueMap[K]>): Record<string, number> => {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(value)) return { packets: value.length };
    if (researchForRemainingKey(key))
      return {
        records: (v.records as unknown[]).length,
        draftFields: Object.keys(v.draft as object).length,
      };
    if (partnerForRemainingKey(key))
      return Object.fromEntries(
        Object.entries(v.records as Record<string, unknown[]>).map(
          ([k, rows]) => [k, rows.length],
        ),
      );
    if (key === "charitology-depth-census-v1")
      return { activities: (v.rows as unknown[]).length };
    if (key === "charitology-country-notes-v1")
      return { countries: Object.keys(v).length };
    return { fields: Object.keys(v).length };
  };
  const summary = (intent: Intent<K>, discards: boolean): RRPreviewSummary => {
    const v = intent.candidate.value as unknown as Record<string, unknown>,
      context = v.context as Record<string, unknown> | undefined;
    return freeze({
      title:
        intent.operation === "remove"
          ? "Remove this saved key only"
          : String(context?.name ?? v.title ?? "Local records"),
      counts: counts(intent.candidate.value),
      replacesCurrent: true as const,
      discardsLocal: discards,
    });
  };
  function preview(
    kind: Recovery["kind"],
    token: RRViewToken,
    allowed: boolean,
    native: RRReadonly<RRNative<K>> | null,
    sourceAssert: () => void,
    sourceRaw: string | Uint8Array | null = null,
  ): Promise<RRRestorePreview<K> | RRRemovePreview<K>> {
    requireRecover();
    discardGuard(allowed);
    const b = binding();
    assertView(view, token);
    return fullReplacement(
      async () => {
        assertView(view, token);
        requireRecover();
        assertMemory(b);
        const c =
          native === null ? defaultCandidate() : await candidate(native);
        assertView(view, token);
        assertMemory(b);
        const sourceHash =
          sourceRaw === null
            ? null
            : await env.digestBytes(
                typeof sourceRaw === "string"
                  ? new TextEncoder().encode(sourceRaw)
                  : sourceRaw,
              );
        // Bytes/options were detached before queueing. Recheck only owned authority.
        sourceAssert();
        assertView(view, token);
        assertMemory(b);
        return env.lock(key, async () => {
          const guard = () => assertView(view, token);
          guard();
          requireRecover();
          assertMemory(b);
          assertDisk(b, guard);
          const intent: Intent<K> = {
            operation: kind === "remove" ? "remove" : "set",
            candidate: c,
          };
          const reviewHash = hash({
            key,
            kind,
            candidateHash: c.hash,
            sourceHash,
            observedRawHash: rawHash(b.raw),
            generation: b.generation,
            viewGeneration: token.generation,
          });
          const visible = freeze({
            key,
            kind,
            view: token,
            reviewHash,
            summary: summary(
              intent,
              viewState(view).dirty.size > 0 || discarded(),
            ),
          }) as unknown as RRRestorePreview<K> | RRRemovePreview<K>;
          previews.set(visible, {
            intent,
            kind,
            view: token,
            binding: b,
            discard: allowed,
          });
          issued.add(visible);
          return visible;
        });
      },
      () =>
        fail(
          "superseded",
          "A newer source choice replaced this unstarted preview.",
        ),
    );
  }
  const apply = (
    visible: RRRestorePreview<K> | RRRemovePreview<K>,
    remove: boolean,
  ): Promise<RRWriteResult<K>> => {
    live();
    const own = previews.get(visible);
    if (!own)
      fail(
        consumed.has(visible)
          ? "used_authority"
          : issued.has(visible)
            ? "stale_view"
            : "foreign_owner",
        "Use this session's fresh unused preview.",
      );
    if ((own.kind === "remove") !== remove)
      fail("invalid_data", "Apply the exact kind that was reviewed.");
    previews.delete(visible);
    consumed.add(visible);
    revokeQueued();
    revokeAuthorities();
    return enqueue(() =>
      env.lock(key, async () => {
        const guard = () => assertView(view, own.view);
        guard();
        requireRecover();
        assertMemory(own.binding);
        assertDisk(own.binding, guard);
        discardGuard(own.discard);
        assign(own.intent, true);
        return result(own.view);
      }),
    );
  };
  type Save = {
    native: RRReadonly<RRNative<K>>;
    view: RRViewToken;
    binding: Binding;
  };
  const runSave = async (own: Save): Promise<RRWriteResult<K>> => {
    try {
      const guard = () => {
        assertView(view, own.view);
      };
      guard();
      requireWrite();
      assertMemory(own.binding);
      const c = await candidate(own.native);
      guard();
      assertMemory(own.binding);
      return await env.lock(key, async () => {
        guard();
        requireWrite();
        assertMemory(own.binding);
        assertDisk(own.binding, guard);
        if (
          snapshot().persistence === "saved" &&
          !unsaved &&
          !pending &&
          current &&
          semantic(key, current.value) === semantic(key, c.value)
        )
          return result(own.view, "no-op");
        assign({ operation: "set", candidate: c }, true);
        return result(own.view);
      });
    } catch (error) {
      if (
        error instanceof RRRecordError &&
        error.code === "stale_view" &&
        !view.isCurrent(own.view)
      )
        return result(own.view, "superseded");
      throw error;
    }
  };
  const session: RRSession<K> = {
    key,
    snapshot,
    captureSave(value, settings) {
      const token = begin();
      requireWrite();
      const opts = options(settings, ["form"]);
      if (opts.value.form !== null)
        remainingRecordFormFields(key, opts.value.form);
      const native = validateRemainingRecordValue(key, value),
        b = binding();
      assertView(view, token);
      const visible = freeze({
        key,
        view: token,
        form: opts.value.form,
      }) as RRCapturedSave<K>;
      captures.set(visible, { native, view: token, binding: b });
      saveMetadata.set(visible, { view: token });
      issued.add(visible);
      return visible;
    },
    saveCaptured(visible) {
      live();
      const own = captures.get(visible);
      if (!own && !consumed.has(visible) && saveMetadata.has(visible))
        return Promise.resolve(
          result(saveMetadata.get(visible)!.view, "superseded"),
        );
      if (!own)
        fail(
          consumed.has(visible)
            ? "used_authority"
            : issued.has(visible)
              ? "stale_view"
              : "foreign_owner",
          "Use this session's unused save capture.",
        );
      captures.delete(visible);
      consumed.add(visible);
      if (!view.isCurrent(own.view))
        return Promise.resolve(result(own.view, "superseded"));
      return fullReplacement(
        () => runSave(own),
        () => result(own.view, "superseded"),
      );
    },
    retryPersist() {
      const token = begin(),
        b = binding();
      requireRecover();
      if (!pending)
        fail(
          "pending_operation",
          "No exact failed operation is waiting to be retried.",
        );
      return enqueue(() =>
        env.lock(key, async () => {
          const guard = () => assertView(view, token);
          guard();
          requireRecover();
          assertMemory(b);
          assertDisk(b, guard);
          if (blocked) fail(code, message);
          if (pending) {
            persist();
            if (!pending) generation++;
          }
          return result(token, pending ? "unsaved" : "saved");
        }),
      );
    },
    previewRestore(raw, settings) {
      const token = begin(),
        opts = choice(settings),
        source = ownedRaw(raw, key),
        native = parseRemainingRecordBackup(source.raw, key);
      return preview(
        "restore",
        token,
        opts.value.discardLocal,
        native,
        () => {
          opts.assert();
          source.assert();
        },
        source.raw,
      ) as Promise<RRRestorePreview<K>>;
    },
    previewReplace(value, settings) {
      const token = begin(),
        opts = options(settings, ["kind", "discardLocal"]);
      if (
        !["example", "replace"].includes(opts.value.kind) ||
        typeof opts.value.discardLocal !== "boolean"
      )
        fail("invalid_data", "Choose exact replacement and discard options.");
      const native = validateRemainingRecordValue(key, value);
      return preview(
        opts.value.kind,
        token,
        opts.value.discardLocal,
        native,
        opts.assert,
      ) as Promise<RRRestorePreview<K>>;
    },
    applyRestore: (p) => apply(p, false),
    previewRemove(settings) {
      const token = begin(),
        opts = choice(settings);
      return preview(
        "remove",
        token,
        opts.value.discardLocal,
        null,
        opts.assert,
      ) as Promise<RRRemovePreview<K>>;
    },
    applyRemove: (p) => apply(p, true),
    undo(settings) {
      const token = begin(),
        opts = choice(settings);
      requireRecover();
      discardGuard(opts.value.discardLocal);
      if (!undo)
        fail(
          "invalid_data",
          "No previous valid model is available for guarded undo.",
        );
      const target = undo,
        b = binding();
      return enqueue(() =>
        env.lock(key, async () => {
          const guard = () => {
            opts.assert();
            assertView(view, token);
          };
          guard();
          requireRecover();
          if (blocked)
            fail(
              code,
              "Review recovery before undo after a saved-data conflict.",
            );
          assertMemory(b);
          assertDisk(b, guard);
          discardGuard(opts.value.discardLocal);
          assign(
            {
              operation: target.present ? "set" : "remove",
              candidate: target.candidate,
            },
            false,
            true,
          );
          return result(token);
        }),
      );
    },
    reload(settings) {
      const token = begin(),
        opts = choice(settings),
        before = generation;
      discardGuard(opts.value.discardLocal);
      return enqueue(async () => {
        const run = async () => {
          opts.assert();
          assertView(view, token);
          if (generation !== before)
            fail("stale_view", "The record changed before reload.");
          return load(opts.value.discardLocal, token);
        };
        return env.supported ? env.lock(key, run) : run();
      });
    },
    noticeExternalChange() {
      const token = begin();
      return enqueue(async () => {
        assertView(view, token);
        let raw;
        try {
          raw = read();
        } catch (error) {
          if (error instanceof RRRecordError && error.code === "unavailable")
            return snapshot();
          throw error;
        }
        assertView(view, token);
        if (raw !== observed) foreign(raw);
        return snapshot();
      });
    },
    exportNative() {
      live();
      if (!current)
        fail(
          "corrupt",
          "No admitted current model is available; keep the protected copy.",
        );
      return freeze({
        text: remainingRecordBackup(key, current.value),
        persistence: snapshot().persistence,
        formOrigin: "current-model" as const,
      });
    },
    rawSavedCopy(copy) {
      live();
      if (copy !== "protected" && copy !== "observed")
        fail("invalid_data", "Choose the protected or observed saved copy.");
      const raw = copy === "protected" ? (protectedRaw ?? observed) : observed;
      return typeof raw === "string" ? Object.freeze({ copy, raw }) : null;
    },
    dispose() {
      env.entry();
      if (closed) return;
      closed = true;
      generation++;
      code = "closed";
      message = "This record session is closed.";
      view.dispose();
      undo = null;
      pending = null;
      current = null;
      protectedRaw = undefined;
      observed = undefined;
      revokeQueued();
      revokeAuthorities();
    },
  };
  bindings.set(session, view);
  return Object.freeze(session);
}
