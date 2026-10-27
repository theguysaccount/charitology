/** Six fixed local records. Saved bytes, unfinished forms and native backups stay distinct. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  canonicalProgramRecordJson as canonical,
  copyProgramRecordPlain,
  validateProgramRecordValue,
  defaultProgramRecordValue,
  requireProgramRecordKey,
  programForRecordKey,
  programRecordFormFields,
  prCanonicalInstant,
  type PRKey,
  type PRValueMap,
  type PRNative,
  type PRReadonly,
  type PRFormId,
} from "./program-record-recovery-schemas";
import {
  PROGRAM_RECORD_LIMITS,
  parseProgramRecordBackup,
  programRecordBackup,
} from "./program-record-recovery-formats";
export { PROGRAM_RECORD_LIMITS };
export type {
  PRKey,
  PRProgram,
  PRProgramKey,
  PRValueMap,
  PRNative,
  PRReadonly,
  PROsEnvelope,
  PRCollection,
  PROsKind,
  PRFormId,
  PRRawForm,
  PRFormArchive,
} from "./program-record-recovery-schemas";

export type PRHash = string;
export type PRCode =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
export type PRErrorCode =
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
export class PRRecordError extends Error {
  constructor(
    public readonly code: PRErrorCode,
    message: string,
    public readonly path: string | null = null,
  ) {
    super(message);
    this.name = "PRRecordError";
  }
}
function fail(code: PRErrorCode, message: string): never {
  throw new PRRecordError(code, message);
}
export type PRCurrent<T> =
  | { readonly hasCurrent: false; readonly value: null; readonly hash: null }
  | {
      readonly hasCurrent: true;
      readonly value: PRReadonly<T>;
      readonly hash: PRHash;
    };
export type PRSnapshot<K extends PRKey> = Readonly<
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
export declare const prViewToken: unique symbol;
export interface PRViewToken {
  readonly [prViewToken]: true;
  readonly generation: number;
}
export interface PRViewTracker {
  readonly key: PRKey;
  changedForm(form: PRFormId): void;
  changedView(): void;
  capture(): PRViewToken;
  isCurrent(token: PRViewToken): boolean;
  markClean(form: PRFormId, token: PRViewToken): boolean;
  snapshot(): Readonly<{ generation: number; dirtyForms: readonly PRFormId[] }>;
  dispose(): void;
}
export declare const prCapture: unique symbol;
export declare const prRestore: unique symbol;
export declare const prRemove: unique symbol;
export interface PRCapturedSave<K extends PRKey> {
  readonly [prCapture]: true;
  readonly key: K;
  readonly view: PRViewToken;
  readonly form: PRFormId | null;
}
export interface PRPreviewSummary {
  readonly title: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly replacesCurrent: true;
  readonly discardsLocal: boolean;
}
export interface PRRestorePreview<K extends PRKey> {
  readonly [prRestore]: true;
  readonly key: K;
  readonly kind: "restore" | "example" | "replace";
  readonly view: PRViewToken;
  readonly reviewHash: PRHash;
  readonly summary: PRPreviewSummary;
}
export interface PRRemovePreview<K extends PRKey> {
  readonly [prRemove]: true;
  readonly key: K;
  readonly kind: "remove";
  readonly view: PRViewToken;
  readonly reviewHash: PRHash;
  readonly summary: PRPreviewSummary;
}
export interface PRWriteResult<K extends PRKey> {
  readonly outcome: "saved" | "no-op" | "unsaved" | "superseded";
  readonly snapshot: PRSnapshot<K>;
  readonly viewCurrent: boolean;
}
export interface PRNativeExport {
  readonly text: string;
  readonly persistence: PRSnapshot<PRKey>["persistence"];
  readonly unfinishedFormsIncluded: false;
}
export interface PRRawSavedCopy {
  readonly copy: "protected" | "observed";
  readonly raw: string;
}
export interface PRSession<K extends PRKey> {
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
    options: { kind: "example" | "replace"; at: string; discardLocal: boolean },
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

type ViewState = {
  key: PRKey;
  generation: number;
  dirty: Set<PRFormId>;
  closed: boolean;
  owner: object | null;
};
const views = new WeakMap<object, ViewState>();
const tokens = new WeakMap<
  object,
  { view: PRViewTracker; generation: number }
>();
const bindings = new WeakMap<object, PRViewTracker>();
// Internal revocation only; the public tracker accepts no application callbacks.
const viewRevocations = new WeakMap<object, () => void>();
const viewState = (view: PRViewTracker): ViewState => {
  const state = views.get(view);
  if (!state) fail("foreign_owner", "Use the exact owned view tracker.");
  if (state.closed) fail("closed", "This view is closed.");
  return state;
};
function assertView(view: PRViewTracker, token: PRViewToken): void {
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
export function createProgramRecordView(key: PRKey): PRViewTracker {
  requireProgramRecordKey(key);
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
  const view: PRViewTracker = Object.freeze({
    key,
    changedForm(form: PRFormId) {
      programRecordFormFields(key, form);
      bump();
      state.dirty.add(form);
    },
    changedView: bump,
    capture() {
      viewState(view);
      const token = Object.freeze({
        generation: state.generation,
      }) as PRViewToken;
      tokens.set(token, { view, generation: state.generation });
      return token;
    },
    isCurrent(token: PRViewToken) {
      const own = tokens.get(token);
      return (
        !state.closed &&
        own?.view === view &&
        own.generation === state.generation
      );
    },
    markClean(form: PRFormId, token: PRViewToken) {
      programRecordFormFields(key, form);
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
export function assertProgramRecordControlBinding<K extends PRKey>(
  session: PRSession<K>,
  view: PRViewTracker,
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
const rawHash = (raw: string | null) =>
  raw === null ? null : bytesToHex(sha256(new TextEncoder().encode(raw)));
function watch<T>(
  value: T,
  cap: number = PROGRAM_RECORD_LIMITS.nativeBackupBytes,
) {
  // All caller reflection ends synchronously before any await or held lock.
  // Later caller mutation cannot retarget this owned detached value.
  return {
    value: freeze(copyProgramRecordPlain(value, cap)) as T,
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
function ownedRaw(raw: string | Uint8Array) {
  const cap = PROGRAM_RECORD_LIMITS.nativeBackupBytes;
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
  Uint8Array.prototype.set.call(copy, raw);
  return {
    raw: copy,
    assert() {
      let actual;
      try {
        actual = length.call(raw);
      } catch {
        fail("input_changed", "The selected file bytes changed.");
      }
      if (actual !== n)
        fail("input_changed", "The selected file bytes changed.");
      for (let i = 0; i < n; i++)
        if (raw[i] !== copy[i])
          fail("input_changed", "The selected file bytes changed.");
    },
  };
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
      const bytes = new TextEncoder().encode(canonical(value));
      if (!digest) return hash(value);
      let result: ArrayBuffer;
      try {
        result = await call(() => digest("SHA-256", bytes));
      } catch (error) {
        if (error instanceof PRRecordError) throw error;
        // Valid local records stay recoverable if the browser denies secure hashing.
        // Every mutation still sees supported=false before its final lock/write.
        supported = false;
        return hash(value);
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
type Candidate<K extends PRKey> = {
  value: PRReadonly<PRValueMap[K]>;
  native: PRReadonly<PRNative<K>> | null;
  raw: string | null;
  hash: PRHash;
};
type Intent<K extends PRKey> =
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
function logical<K extends PRKey>(
  key: K,
  native: PRReadonly<PRNative<K>>,
): PRReadonly<PRValueMap[K]> {
  return (
    key === "charitology.charity-os"
      ? (native as unknown as { workspace: PRReadonly<PRValueMap[K]> })
          .workspace
      : native
  ) as PRReadonly<PRValueMap[K]>;
}
function nativeFrom<K extends PRKey>(
  key: K,
  value: PRReadonly<PRValueMap[K]>,
  at: string,
): PRReadonly<PRNative<K>> {
  return (
    key === "charitology.charity-os"
      ? {
          format: "charitology.charity-os",
          version: 1,
          exportedAt: at,
          workspace: value,
        }
      : value
  ) as PRReadonly<PRNative<K>>;
}
function semantic<K extends PRKey>(
  key: K,
  value: PRReadonly<PRValueMap[K]>,
): string {
  if (!programForRecordKey(key)) return canonical(value);
  const own = { ...(copyProgramRecordPlain(value) as Record<string, unknown>) };
  delete own.updated;
  return canonical(own);
}
function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(run: () => Promise<T>): Promise<T> => {
    const result = tail.then(run, run);
    tail = result.catch(() => {});
    return result;
  };
}

export async function openProgramRecordSession<K extends PRKey>(
  key: K,
  input: { view: PRViewTracker },
): Promise<PRSession<K>> {
  requireProgramRecordKey(key);
  if (
    !input ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).length !== 1 ||
    !Object.getOwnPropertyDescriptor(input, "view") ||
    !("value" in Object.getOwnPropertyDescriptor(input, "view")!)
  )
    fail("invalid_data", "Use only the exact owned view option.");
  const view = Object.getOwnPropertyDescriptor(input, "view")!
      .value as PRViewTracker,
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
    code: PRCode = env.supported ? "ready" : "unsupported",
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
  const snapshot = (): PRSnapshot<K> =>
    freeze({
      key,
      generation,
      observedRaw: observed,
      persistence:
        observed === undefined
          ? current
            ? "unsaved-memory"
            : "unreadable"
          : unsaved || (blocked && !!current)
            ? "unsaved-memory"
            : blocked
              ? "unreadable"
              : observed === null
                ? "absent"
                : "saved",
      code:
        closed || vs.closed
          ? "closed"
          : !env.supported && code === "ready"
            ? "unsupported"
            : code,
      message:
        closed || vs.closed
          ? "This record session is closed."
          : message ||
            (!env.supported
              ? "This browser is read-only: Web Locks and secure hashing are required."
              : ""),
      unsaved,
      pendingOperation: pending?.operation ?? null,
      hasUndo: !closed && !vs.closed && undo !== null,
      canWrite:
        env.supported &&
        !closed &&
        !vs.closed &&
        !blocked &&
        !!current &&
        observed !== undefined &&
        !pending,
      canRecover:
        env.supported && !closed && !vs.closed && observed !== undefined,
      canRetryPersist:
        env.supported &&
        !closed &&
        !vs.closed &&
        !blocked &&
        !!pending &&
        observed !== undefined,
      ...(current
        ? {
            hasCurrent: true as const,
            value: current.value,
            hash: current.hash,
          }
        : { hasCurrent: false as const, value: null, hash: null }),
    }) as PRSnapshot<K>;
  const protect = (raw: string | null | undefined) => {
    if (protectedRaw === undefined && typeof raw === "string")
      protectedRaw = raw;
  };
  const block = (next: PRCode, why: string) => {
    blocked = true;
    code = next;
    message = why;
  };
  const read = () => {
    try {
      return env.get(key);
    } catch (error) {
      if (error instanceof PRRecordError) throw error;
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
      s.unsaved ||
      s.pendingOperation !== null ||
      (s.hasCurrent && s.persistence === "unsaved-memory")
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
    const value = defaultProgramRecordValue(key);
    const native =
      key === "charitology.charity-os"
        ? null
        : (value as unknown as PRReadonly<PRNative<K>>);
    const raw = native === null ? null : programRecordBackup(key, native);
    return { value, native, raw, hash: hash(native ?? value) };
  };
  const candidate = async (
    native: PRReadonly<PRNative<K>>,
  ): Promise<Candidate<K>> => {
    const raw = programRecordBackup(key, native),
      own = parseProgramRecordBackup(raw, key);
    return {
      value: logical(key, own),
      native: own,
      raw,
      hash: await env.digest(own),
    };
  };
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
      if (error instanceof PRRecordError) throw error;
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
    token: PRViewToken,
    outcome: PRWriteResult<K>["outcome"] = unsaved ? "unsaved" : "saved",
  ): PRWriteResult<K> =>
    freeze({
      outcome,
      snapshot: snapshot(),
      viewCurrent: view.isCurrent(token),
    });
  const load = async (
    discard: boolean,
    token: PRViewToken,
  ): Promise<PRSnapshot<K>> => {
    discardGuard(discard);
    const before = { generation, current },
      raw = (() => {
        try {
          return read();
        } catch (error) {
          if (error instanceof PRRecordError && error.code === "read_error")
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
          : await candidate(parseProgramRecordBackup(raw, key));
    } catch (error) {
      if (error instanceof PRRecordError) throw error;
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
      if (error instanceof PRRecordError && error.code === "unsupported")
        await load(true, initialToken);
      else throw error;
    }
  } else await load(true, initialToken);
  let captures = new WeakMap<
    object,
    {
      native: PRReadonly<PRNative<K>>;
      view: PRViewToken;
      binding: Binding;
    }
  >();
  type Recovery = {
    intent: Intent<K>;
    view: PRViewToken;
    binding: Binding;
    discard: boolean;
    kind: "restore" | "example" | "replace" | "remove";
  };
  let previews = new WeakMap<object, Recovery>();
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
  const counts = (value: PRReadonly<PRValueMap[K]>) => {
    const v = value as unknown as Record<string, unknown>,
      collections = programForRecordKey(key)
        ? (v.records as Record<string, unknown[]>)
        : v;
    return Object.fromEntries(
      Object.entries(collections)
        .filter(([, x]) => Array.isArray(x))
        .map(([k, x]) => [k, (x as unknown[]).length]),
    );
  };
  const summary = (intent: Intent<K>, discards: boolean): PRPreviewSummary => {
    const v = intent.candidate.value as unknown as Record<string, unknown>,
      context = v.context as Record<string, unknown> | undefined;
    return freeze({
      title:
        intent.operation === "remove"
          ? "Remove this saved key only"
          : String(context?.name ?? v.organization ?? "Program records"),
      counts: counts(intent.candidate.value),
      replacesCurrent: true as const,
      discardsLocal: discards,
    });
  };
  function preview(
    kind: Recovery["kind"],
    token: PRViewToken,
    allowed: boolean,
    native: PRReadonly<PRNative<K>> | null,
    sourceAssert: () => void,
  ): Promise<PRRestorePreview<K> | PRRemovePreview<K>> {
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
        // Mutable file bytes are checked after digest and outside the held lock.
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
          }) as unknown as PRRestorePreview<K> | PRRemovePreview<K>;
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
    visible: PRRestorePreview<K> | PRRemovePreview<K>,
    remove: boolean,
  ): Promise<PRWriteResult<K>> => {
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
    native: PRReadonly<PRNative<K>>;
    view: PRViewToken;
    binding: Binding;
  };
  const runSave = async (own: Save): Promise<PRWriteResult<K>> => {
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
        error instanceof PRRecordError &&
        error.code === "stale_view" &&
        !view.isCurrent(own.view)
      )
        return result(own.view, "superseded");
      throw error;
    }
  };
  const session: PRSession<K> = {
    key,
    snapshot,
    captureSave(value, settings) {
      const token = begin();
      requireWrite();
      const opts = options(settings, ["at", "form"]);
      prCanonicalInstant(opts.value.at);
      if (opts.value.form !== null)
        programRecordFormFields(key, opts.value.form);
      const source = watch(value),
        clean = validateProgramRecordValue(key, source.value),
        b = binding();
      if (
        programForRecordKey(key) &&
        (clean as unknown as { updated: string }).updated !==
          (current!.value as unknown as { updated: string }).updated
      )
        fail(
          "invalid_data",
          "The engine alone manages the current updated timestamp.",
        );
      let final = clean;
      const unchanged = semantic(key, clean) === semantic(key, current!.value);
      if (programForRecordKey(key) && (!unchanged || observed === null))
        final = validateProgramRecordValue(key, {
          ...clean,
          updated: opts.value.at,
        });
      const native =
        unchanged && observed !== null && current!.native
          ? current!.native
          : nativeFrom(key, final, opts.value.at);
      programRecordBackup(key, native);
      assertView(view, token);
      const visible = freeze({
        key,
        view: token,
        form: opts.value.form,
      }) as PRCapturedSave<K>;
      captures.set(visible, {
        native,
        view: token,
        binding: b,
      });
      issued.add(visible);
      return visible;
    },
    saveCaptured(visible) {
      live();
      const own = captures.get(visible);
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
        source = ownedRaw(raw),
        native = parseProgramRecordBackup(source.raw, key);
      return preview("restore", token, opts.value.discardLocal, native, () => {
        opts.assert();
        source.assert();
      }) as Promise<PRRestorePreview<K>>;
    },
    previewReplace(value, settings) {
      const token = begin(),
        opts = options(settings, ["kind", "at", "discardLocal"]),
        source = watch(value);
      if (
        !["example", "replace"].includes(opts.value.kind) ||
        typeof opts.value.discardLocal !== "boolean"
      )
        fail(
          "invalid_data",
          "Choose the exact replacement and discard options.",
        );
      prCanonicalInstant(opts.value.at);
      let clean = validateProgramRecordValue(key, source.value);
      if (programForRecordKey(key))
        clean = validateProgramRecordValue(key, {
          ...clean,
          updated: opts.value.at,
        });
      const native = nativeFrom(key, clean, opts.value.at);
      programRecordBackup(key, native);
      return preview(
        opts.value.kind,
        token,
        opts.value.discardLocal,
        native,
        () => {
          opts.assert();
          source.assert();
        },
      ) as Promise<PRRestorePreview<K>>;
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
      ) as Promise<PRRemovePreview<K>>;
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
          if (error instanceof PRRecordError && error.code === "read_error")
            return snapshot();
          throw error;
        }
        assertView(view, token);
        if (raw !== observed) foreign(raw);
        return snapshot();
      });
    },
    exportNative(settings) {
      live();
      const opts = options(settings, ["at"]);
      prCanonicalInstant(opts.value.at);
      if (!current)
        fail(
          "corrupt",
          "No validated current records are available. Download the protected saved copy.",
        );
      const native =
        current.native ?? nativeFrom(key, current.value, opts.value.at);
      return freeze({
        text: programRecordBackup(key, native),
        persistence: snapshot().persistence,
        unfinishedFormsIncluded: false as const,
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
      revokeQueued();
      revokeAuthorities();
    },
  };
  bindings.set(session, view);
  return Object.freeze(session);
}
