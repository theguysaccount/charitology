/** D1-only guarded storage primitive. Public application authority lives in donor-recovery.ts. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  canonicalD1Json,
  validateD1Value,
  d1DefaultValue,
  type D1Key,
  type D1ValueMap,
} from "./donor-recovery-schemas";
import {
  d1IndividualBackup,
  D1_LIMITS,
  strictD1Json,
} from "./donor-recovery-formats";
import type {
  D1Dependencies,
  D1Locks,
  D1Code,
  D1Snapshot,
  D1ViewState,
} from "./donor-recovery";

export class D1RecoveryError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "D1RecoveryError";
  }
}
export function d1Fail(code: string, message: string): never {
  throw new D1RecoveryError(code, message);
}
export function d1Freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) d1Freeze(x);
    Object.freeze(v);
  }
  return v;
}
export const d1Hash = (v: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(canonicalD1Json(v))));
export const d1RawHash = (v: string | null | undefined) =>
  typeof v === "string"
    ? bytesToHex(sha256(new TextEncoder().encode(v)))
    : null;
export const D1_STAMP = "2000-01-01T00:00:00.000Z";
export function d1Watch<T>(
  value: T,
  limit: number = D1_LIMITS.individualBackupBytes,
): { value: T; assert(): void } {
  const raw = canonicalD1Json(value);
  if (raw.length > limit || new TextEncoder().encode(raw).byteLength > limit)
    d1Fail("input_limit", "The complete value exceeds its backup limit.");
  const owned = d1Freeze(JSON.parse(raw)) as T;
  return {
    value: owned,
    assert() {
      let now;
      try {
        now = canonicalD1Json(value);
      } catch {
        d1Fail("input_changed", "The supplied input changed. Review it again.");
      }
      if (now !== raw)
        d1Fail("input_changed", "The supplied input changed. Review it again.");
    },
  };
}
export function d1OwnRaw(
  raw: string | Uint8Array,
  limit: number,
): { raw: string | Uint8Array; assert(): void } {
  if (typeof raw === "string") {
    if (raw.length > limit || new TextEncoder().encode(raw).byteLength > limit)
      d1Fail("input_limit", "The selected file exceeds its whole-file bound.");
    return { raw, assert() {} };
  }
  const get = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype),
    "byteLength",
  )!.get!;
  let n: number;
  try {
    n = get.call(raw);
  } catch {
    d1Fail("invalid_data", "Choose text or UTF-8 bytes.");
  }
  if (n > limit)
    d1Fail("input_limit", "The selected file exceeds its whole-file bound.");
  if (
    Object.getPrototypeOf(raw) !== Uint8Array.prototype ||
    Reflect.ownKeys(raw).length !== n
  )
    d1Fail("invalid_data", "Choose undecorated UTF-8 bytes.");
  const owned = new Uint8Array(n);
  Uint8Array.prototype.set.call(owned, raw);
  return {
    raw: owned,
    assert() {
      let length;
      try {
        length = get.call(raw);
      } catch {
        d1Fail("input_changed", "Selected bytes changed.");
      }
      if (length !== n) d1Fail("input_changed", "Selected bytes changed.");
      for (let i = 0; i < n; i++)
        if (raw[i] !== owned[i])
          d1Fail("input_changed", "Selected bytes changed.");
    },
  };
}
export interface D1Environment {
  supported: boolean;
  activeDependency: boolean;
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  hash(value: unknown): Promise<string>;
  lock<R>(keys: readonly string[], run: () => Promise<R>): Promise<R>;
  entry(): void;
}
let d1DependencyDepth = 0;
function dependencyMethod<T extends (...args: never[]) => unknown>(
  target: unknown,
  key: string,
): T | null {
  if (target === null || target === undefined) return null;
  let at = target as object;
  while (at) {
    const d = Object.getOwnPropertyDescriptor(at, key);
    if (d) {
      if (!("value" in d))
        d1Fail("invalid_data", "Dependency methods cannot be getters.");
      return typeof d.value === "function" ? (d.value.bind(target) as T) : null;
    }
    at = Object.getPrototypeOf(at);
  }
  return null;
}
export function d1Environment(deps: D1Dependencies): D1Environment {
  let storage;
  try {
    storage = deps.storage ?? globalThis.localStorage;
  } catch {
    storage = undefined;
  }
  const locks =
    deps.locks === undefined
      ? typeof navigator === "undefined"
        ? null
        : (navigator.locks as unknown as D1Locks)
      : deps.locks;
  const cryptoAvailable =
    deps.cryptoAvailable ??
    (typeof globalThis.crypto?.subtle?.digest === "function" &&
      globalThis.isSecureContext !== false);
  const request = dependencyMethod<D1Locks["request"]>(locks, "request");
  const getter = dependencyMethod<(key: string) => string | null>(
    storage,
    "getItem",
  );
  const setter = dependencyMethod<(key: string, value: string) => void>(
    storage,
    "setItem",
  );
  const remover = dependencyMethod<(key: string) => void>(
    storage,
    "removeItem",
  );
  const digest = deps.digest;
  const call = <T>(fn: () => T): T => {
    if (d1DependencyDepth > 0)
      d1Fail(
        "reentrant_call",
        "A storage dependency cannot reenter this operation.",
      );
    e.activeDependency = true;
    d1DependencyDepth++;
    try {
      return fn();
    } finally {
      e.activeDependency = false;
      d1DependencyDepth--;
    }
  };
  const e: D1Environment = {
    supported: !!request && cryptoAvailable,
    activeDependency: false,
    entry() {
      if (d1DependencyDepth > 0)
        d1Fail(
          "reentrant_call",
          "A storage dependency cannot reenter this operation.",
        );
    },
    get(key) {
      return call(() => {
        if (!getter) throw Error();
        const x = getter(key);
        if (x !== null && typeof x !== "string") throw Error();
        return x;
      });
    },
    set(key, value) {
      call(() => {
        if (!setter) throw Error();
        setter(key, value);
      });
    },
    remove(key) {
      call(() => {
        if (!remover) throw Error();
        remover(key);
      });
    },
    async hash(value) {
      const bytes = new TextEncoder().encode(canonicalD1Json(value));
      const result = await (digest
        ? call(() => digest(bytes.slice()))
        : globalThis.crypto?.subtle
          ? globalThis.crypto.subtle
              .digest("SHA-256", bytes)
              .then((x) => bytesToHex(new Uint8Array(x)))
          : Promise.resolve(d1Hash(value)));
      if (typeof result !== "string" || !/^[0-9a-f]{64}$/.test(result))
        d1Fail("invalid_data", "Hashing returned an invalid value.");
      return result;
    },
    async lock<R>(keys: readonly string[], run: () => Promise<R>) {
      if (!e.supported || !request)
        d1Fail(
          "unsupported",
          "Web Locks and secure hashing are required for changes.",
        );
      const acquire = async (i: number): Promise<R> => {
        if (i === keys.length) return run();
        let entered = false;
        try {
          return await call(() =>
            request(keys[i], { mode: "exclusive" }, () =>
              Promise.resolve().then(() => {
                entered = true;
                return acquire(i + 1);
              }),
            ),
          );
        } catch (error) {
          if (!entered) {
            e.supported = false;
            d1Fail(
              "unsupported",
              "Web Locks are unavailable. Nothing was written.",
            );
          }
          throw error;
        }
      };
      return acquire(0);
    },
  };
  return e;
}
export interface D1Binding {
  generation: number;
  hash: string | null;
  hasState: boolean;
  raw: string | null;
  present: boolean;
}
export interface D1Candidate<T> {
  value: T;
  hash: string;
  raw: string;
}
export type D1Intent<T> =
  { operation: "set"; candidate: D1Candidate<T> } | { operation: "remove" };
export interface D1Cell<T> {
  key: D1Key;
  fullKey: string;
  env: D1Environment;
  snapshot(): D1Snapshot<T>;
  initialize(): Promise<void>;
  checked(v: unknown): Promise<D1Candidate<T>>;
  binding(): D1Binding;
  assertMemory(b: D1Binding): void;
  assertDisk(raw: string | null): void;
  previewBaseline(b: D1Binding): D1Binding;
  requireWrite(): void;
  requireRecover(): void;
  assign(intent: D1Intent<T>, undo: boolean): void;
  retry(): void;
  undoIntent(): D1Intent<T>;
  clearUndo(): void;
  load(
    discard: boolean,
    dirty: boolean,
    assert?: () => void,
  ): Promise<D1Snapshot<T>>;
  pending(): D1Intent<T> | null;
  present(): boolean;
  protectedRaw(): string | null | undefined;
  observedRaw(): string | null | undefined;
  notice(): D1Snapshot<T>;
  dispose(): void;
}
const external =
  "Another tab changed the saved record. Current work and protected bytes remain available. Review the newly observed copy before a replacement.";
export function createD1Cell<K extends D1Key>(
  key: K,
  env: D1Environment,
): D1Cell<D1ValueMap[K]> {
  type T = D1ValueMap[K];
  let hasState = false,
    value: T | null = null,
    hash: string | null = null,
    observed: string | null | undefined,
    protectedRaw: string | undefined,
    generation = 0,
    unsaved = false,
    blocked = false,
    closed = false,
    present = false;
  let intent: D1Intent<T> | null = null,
    undo: { hasState: boolean; value: T | null; present: boolean } | null =
      null;
  let code: D1Code = env.supported ? "ready" : "unsupported",
    message = env.supported
      ? ""
      : "This browser is read-only: Web Locks and secure hashing are required.";
  const block = (c: D1Code, m: string) => {
    blocked = true;
    code = c;
    message = m;
  };
  const read = () => {
    try {
      return env.get("charitology." + key);
    } catch (e) {
      if (e instanceof D1RecoveryError) throw e;
      if (protectedRaw === undefined && typeof observed === "string")
        protectedRaw = observed;
      observed = undefined;
      generation++;
      block(
        "read_error",
        "Saved bytes could not be read. Export current work and try an explicit reload.",
      );
      d1Fail("read_error", message);
    }
  };
  const foreign = (raw: string | null, prior = observed) => {
    if (protectedRaw === undefined && typeof prior === "string")
      protectedRaw = prior;
    observed = raw;
    generation++;
    block("external_change", external);
  };
  const support = () => {
    if (closed) d1Fail("closed", "This view is closed.");
    if (!env.supported)
      d1Fail(
        "unsupported",
        "This browser is read-only: Web Locks and secure hashing are required.",
      );
  };
  const snapshot = (): D1Snapshot<T> =>
    d1Freeze({
      key,
      generation,
      observedRaw: observed,
      persistence:
        observed === undefined
          ? "unreadable"
          : unsaved
            ? "unsaved-memory"
            : blocked
              ? hasState
                ? "unsaved-memory"
                : "unreadable"
              : observed === null
                ? "absent"
                : "saved",
      code,
      message,
      unsaved,
      pendingOperation: intent?.operation ?? null,
      hasUndo: undo !== null && undo.hasState,
      canWrite:
        env.supported &&
        !blocked &&
        !closed &&
        hasState &&
        observed !== undefined &&
        !intent,
      canRecover: env.supported && !closed && observed !== undefined,
      canRetryPersist:
        env.supported &&
        !blocked &&
        !closed &&
        !!intent &&
        observed !== undefined,
      ...(hasState
        ? { hasState: true as const, value: value as T, hash: hash! }
        : { hasState: false as const, value: null, hash: null }),
    });
  const checked = async (v: unknown): Promise<D1Candidate<T>> => {
    const clean = validateD1Value(key, v);
    d1IndividualBackup(key, clean as D1ValueMap[K], D1_STAMP);
    const raw = canonicalD1Json(clean);
    const h = await env.hash(clean);
    return { value: d1Freeze(clean) as T, hash: h, raw };
  };
  const persist = () => {
    if (!intent) return;
    try {
      if (intent.operation === "set")
        env.set("charitology." + key, intent.candidate.raw);
      else env.remove("charitology." + key);
      observed = intent.operation === "set" ? intent.candidate.raw : null;
      present = intent.operation === "set";
      intent = null;
      unsaved = false;
      blocked = false;
      code = env.supported ? "ready" : "unsupported";
      message = "";
    } catch (e) {
      if (e instanceof D1RecoveryError) throw e;
      unsaved = true;
      code = "persist_failed";
      message =
        "This change is only in memory. Saved bytes were not replaced. Export it or retry this exact operation.";
    }
  };
  const binding = (): D1Binding => {
    if (observed === undefined)
      d1Fail(
        "read_error",
        "Saved bytes are unavailable; reload before recovery.",
      );
    return { generation, hash, hasState, raw: observed, present };
  };
  const assertMemory = (b: D1Binding) => {
    if (
      generation !== b.generation ||
      hash !== b.hash ||
      hasState !== b.hasState ||
      present !== b.present
    )
      d1Fail(
        "stale_view",
        "The record changed while the action was pending. Review it again.",
      );
  };
  const assertDisk = (raw: string | null) => {
    const actual = read();
    if (actual !== raw) {
      foreign(actual, raw);
      d1Fail("external_change", external);
    }
  };
  const load = async (
    discard: boolean,
    dirty: boolean,
    assert: () => void = () => {},
  ) => {
    if (closed) d1Fail("closed", "This view is closed.");
    if (!discard && (unsaved || dirty))
      d1Fail(
        "discard_required",
        "Export work, then explicitly confirm discarding unsaved work before reload.",
      );
    const before = { generation, hash };
    let raw: string | null;
    try {
      raw = read();
    } catch (e) {
      if (e instanceof D1RecoveryError && e.code === "read_error")
        return snapshot();
      throw e;
    }
    try {
      const input =
        raw === null
          ? d1DefaultValue(key)
          : strictD1Json(raw, D1_LIMITS.individualBackupBytes);
      const c = await checked(input);
      assert();
      if (generation !== before.generation || hash !== before.hash)
        d1Fail("stale_view", "The record changed before reload completed.");
      const actual = read();
      assert();
      if (actual !== raw) {
        foreign(actual, raw);
        return snapshot();
      }
      value = c.value;
      hash = c.hash;
      hasState = true;
      present = raw !== null;
      observed = raw;
      protectedRaw = undefined;
      intent = null;
      undo = null;
      unsaved = false;
      blocked = false;
      generation++;
      code = env.supported ? "ready" : "unsupported";
      message = env.supported
        ? ""
        : "This browser is read-only: Web Locks and secure hashing are required.";
    } catch (e) {
      if (e instanceof D1RecoveryError) throw e;
      assert();
      if (generation !== before.generation || hash !== before.hash)
        d1Fail("stale_view", "The record changed before reload completed.");
      observed = raw;
      if (protectedRaw === undefined && raw !== null) protectedRaw = raw;
      generation++;
      undo = null;
      block(
        "corrupt",
        "Saved data could not be validated. Its original text is protected. Review an explicit replacement or key removal.",
      );
    }
    return snapshot();
  };
  const cell: D1Cell<T> = {
    key,
    fullKey: "charitology." + key,
    env,
    snapshot,
    checked,
    binding,
    assertMemory,
    assertDisk,
    requireWrite() {
      support();
      if (blocked || observed === undefined || !hasState)
        d1Fail(code, message || "Use recovery before saving.");
      if (intent)
        d1Fail(
          "pending_operation",
          "Retry the exact pending operation or explicitly resolve it before new work.",
        );
    },
    requireRecover() {
      support();
      if (observed === undefined)
        d1Fail(
          "read_error",
          "Saved bytes are unavailable. Try an explicit reload.",
        );
    },
    previewBaseline(b) {
      assertMemory(b);
      const raw = read();
      if (raw !== b.raw) {
        foreign(raw, b.raw);
        d1Fail("external_change", external);
      }
      return { ...b, raw };
    },
    assign(next, keepUndo) {
      if (keepUndo) undo = { hasState, value, present };
      if (next.operation === "set") {
        value = next.candidate.value;
        hash = next.candidate.hash;
        hasState = true;
        present = true;
      } else {
        const fallback = validateD1Value(key, d1DefaultValue(key));
        value = d1Freeze(fallback) as T;
        hash = d1Hash(fallback);
        hasState = true;
        present = false;
      }
      intent = next;
      unsaved = true;
      blocked = false;
      generation++;
      persist();
    },
    retry() {
      support();
      if (blocked || observed === undefined) d1Fail(code, message);
      if (intent) {
        persist();
        if (!unsaved) generation++;
      }
    },
    undoIntent() {
      if (!undo || !undo.hasState)
        d1Fail("preview_required", "No valid guarded undo is available.");
      return undo.present
        ? {
            operation: "set",
            candidate: {
              value: undo.value as T,
              hash: d1Hash(undo.value),
              raw: canonicalD1Json(undo.value),
            },
          }
        : { operation: "remove" };
    },
    clearUndo() {
      undo = null;
    },
    load,
    pending: () => intent,
    present: () => present,
    protectedRaw: () => protectedRaw ?? observed,
    observedRaw: () => observed,
    notice() {
      if (!closed) {
        generation++;
        block("external_change", external);
      }
      return snapshot();
    },
    dispose() {
      closed = true;
      generation++;
      undo = null;
      code = "closed";
      message = "This view is closed.";
    },
    async initialize() {
      await load(true, false);
    },
  };
  return cell;
}

/** One running owned value and one replaceable pending slot. No per-input queued closures. */
export function createD1ReplacementQueue<T, R>(
  enqueue: <V>(run: () => Promise<V>) => Promise<V>,
  run: (value: T) => Promise<R>,
  superseded: (value: T) => R,
) {
  type Job = {
    value: T;
    resolve: (result: R) => void;
    reject: (error: unknown) => void;
  };
  let pending: Job | null = null,
    running = false,
    scheduled = false;
  const schedule = () => {
    if (running || scheduled || !pending) return;
    scheduled = true;
    void enqueue(async () => {
      scheduled = false;
      const job = pending;
      pending = null;
      if (!job) return;
      running = true;
      try {
        job.resolve(await run(job.value));
      } catch (error) {
        job.reject(error);
      } finally {
        running = false;
        schedule();
      }
    });
  };
  return Object.freeze({
    submit(value: T): Promise<R> {
      if (pending) {
        const old = pending;
        pending = null;
        old.resolve(superseded(old.value));
      }
      const result = new Promise<R>((resolve, reject) => {
        pending = { value, resolve, reject };
      });
      schedule();
      return result;
    },
    // Internal checker visibility only, with no values, callbacks or mutation authority.
    counts: () =>
      Object.freeze({
        running: running ? 1 : 0,
        pending: pending ? 1 : 0,
        scheduled: scheduled ? 1 : 0,
      }),
  });
}
