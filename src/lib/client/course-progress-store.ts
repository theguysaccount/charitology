/** Exact legacy course key and loss-aware guarded cells. No clock, discovery or other-key writes. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  canonicalLearningJson,
  strictLearningJson,
  hashLearningValue,
  emptyCourseProgress,
  validateCourseProgress,
  makeCourseProgressExport,
  parseCourseProgressExport,
  LEARNING_LIMITS,
  type CourseState,
  type LegacyDay,
  type Hash,
  type LearningDigest,
} from "./learning-portfolio-model";

export const COURSE_PROGRESS_STORAGE_KEY = "charitology.principles-course-v1";
export const COURSE_PROGRESS_LOCK_NAME = COURSE_PROGRESS_STORAGE_KEY;
export interface LearningStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface LearningLocks {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    action: () => Promise<T>,
  ): Promise<T>;
}
export type LearningStoreCode =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
export interface LearningStoreStatus {
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
export interface LearningStoreDependencies {
  storage?: LearningStorage;
  locks?: LearningLocks | null;
  cryptoAvailable?: boolean;
  digest?: LearningDigest;
}
export interface CourseStoreSnapshot extends LearningStoreStatus {
  readonly state: CourseState | null;
  readonly hash: Hash | null;
}
export interface CourseStoreOptions extends LearningStoreDependencies {
  initialState: CourseState;
}
export interface CourseMutationBinding {
  expectedGeneration: number;
  expectedStateHash: Hash;
}
export interface StoreReloadOptions {
  discardUnsaved?: boolean;
}
declare const COURSE_PREPARED_OWNER: unique symbol;
export interface PreparedCourseReplacement {
  readonly format: "charitology-course-replacement";
  readonly version: 1;
  readonly action: "replace" | "completion-day";
  readonly expectedGeneration: number;
  readonly expectedStateHash: Hash;
  readonly expectedObservedRawHash: Hash | null;
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
export type CourseRestorePreview = CourseRecoveryPreview & {
  readonly kind: "restore";
};
export type CourseClearPreview = CourseRecoveryPreview & {
  readonly kind: "clear";
};
declare const COURSE_READ_OWNER: unique symbol;
export interface CourseCaptureReadBinding {
  readonly format: "charitology-course-capture-read";
  readonly version: 1;
  readonly generation: number;
  readonly stateHash: Hash;
  readonly observedRawHash: Hash | null;
  readonly input: CourseState;
  readonly persistence: "saved" | "unsaved-memory";
  readonly [COURSE_READ_OWNER]: true;
}
export interface CourseCaptureReadLease {
  readonly binding: CourseCaptureReadBinding;
  assertCurrent(): void;
}
export interface CourseProgressStore {
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
  backup(): Promise<string>;
  rawSavedCopy(): string | null | undefined;
  previewCaptureRead(): Promise<CourseCaptureReadBinding>;
  dispose(): void;
}
export class LearningStoreError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "LearningStoreError";
  }
}
export function learningStoreFail(code: string, message: string): never {
  throw new LearningStoreError(code, message);
}
export function freezeLearningStoreValue<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const child of Object.values(v)) freezeLearningStoreValue(child);
    Object.freeze(v);
  }
  return v;
}
export const learningRawHash = (raw: string | null): Hash | null =>
  raw === null ? null : bytesToHex(sha256(new TextEncoder().encode(raw)));

/** Internal shared admission; capture own data synchronously before the first await. */
export function watchLearningValue<T>(
  value: T,
  limit = LEARNING_LIMITS.backupBytes + 8192,
): { value: T; assert(): void } {
  const stamp = canonicalLearningJson(value);
  if (
    stamp.length > limit ||
    new TextEncoder().encode(stamp).byteLength > limit
  )
    learningStoreFail(
      "input_limit",
      "The requested value exceeds its recovery-compatible bound.",
    );
  // canonicalLearningJson has already refused accessors, reserved keys, depth, cycles and unsupported shapes; this string was generated here, so it cannot contain duplicate JSON keys.
  const owned = freezeLearningStoreValue(JSON.parse(stamp)) as T;
  return {
    value: owned,
    assert() {
      let current: string;
      try {
        current = canonicalLearningJson(value);
      } catch {
        learningStoreFail(
          "input_changed",
          "The requested input changed. Review it again.",
        );
      }
      if (current !== stamp)
        learningStoreFail(
          "input_changed",
          "The requested input changed. Review it again.",
        );
    },
  };
}
export function ownLearningRaw(
  raw: string | Uint8Array,
  limit: number,
): { raw: string | Uint8Array; assert(): void } {
  if (typeof raw === "string") {
    if (raw.length > limit || new TextEncoder().encode(raw).byteLength > limit)
      learningStoreFail("input_limit", "Selected data exceeds its byte bound.");
    return { raw, assert() {} };
  }
  const lengthGetter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype),
    "byteLength",
  )!.get!;
  let length: number;
  try {
    length = lengthGetter.call(raw);
  } catch {
    learningStoreFail("input_shape", "Choose UTF-8 text or bytes.");
  }
  if (length > limit)
    learningStoreFail("input_limit", "Selected data exceeds its byte bound.");
  const copy = new Uint8Array(length);
  Uint8Array.prototype.set.call(copy, raw);
  return {
    raw: copy,
    assert() {
      let n: number;
      try {
        n = lengthGetter.call(raw);
      } catch {
        learningStoreFail("input_changed", "Selected bytes changed.");
      }
      if (n !== length)
        learningStoreFail("input_changed", "Selected bytes changed.");
      for (let i = 0; i < length; i++)
        if (raw[i] !== copy[i])
          learningStoreFail("input_changed", "Selected bytes changed.");
    },
  };
}
export interface LearningCellCandidate<T> {
  state: T;
  hash: Hash;
  raw: string;
}
export interface LearningCellBinding {
  generation: number;
  hash: Hash | null;
  raw: string | null;
}
export interface LearningCell<T> {
  snapshot(): LearningStoreStatus & { state: T | null; hash: Hash | null };
  requireWrite(): void;
  requireRecover(): void;
  bind(): LearningCellBinding;
  assertMemory(b: LearningCellBinding): void;
  assertDisk(raw: string | null): void;
  checked(input: unknown): Promise<LearningCellCandidate<T>>;
  exclusive<R>(run: () => Promise<R>): Promise<R>;
  previewBaseline(b: LearningCellBinding): LearningCellBinding;
  assign(
    candidate: LearningCellCandidate<T>,
    mode: "write" | "remove",
    undo: boolean,
  ): void;
  retryPersist(): Promise<
    LearningStoreStatus & { state: T | null; hash: Hash | null }
  >;
  undo(): Promise<LearningStoreStatus & { state: T | null; hash: Hash | null }>;
  reload(
    options?: StoreReloadOptions,
  ): Promise<LearningStoreStatus & { state: T | null; hash: Hash | null }>;
  noticeExternalChange(): LearningStoreStatus & {
    state: T | null;
    hash: Hash | null;
  };
  rawSavedCopy(): string | null | undefined;
  dispose(): void;
}
/** Internal generic cell; each invocation owns an independent key, lock and memory. */
export async function createLearningCell<T>(
  options: LearningStoreDependencies & {
    key: string;
    initialState: T;
    limit: number;
    checked: (input: unknown) => Promise<LearningCellCandidate<T>>;
    dirty: (state: T) => boolean;
  },
): Promise<LearningCell<T>> {
  const key = options.key,
    limit = options.limit,
    check = options.checked,
    dirty = options.dirty;
  const initial = watchLearningValue(options.initialState, limit).value;
  let storage: LearningStorage;
  try {
    storage = options.storage ?? globalThis.localStorage;
  } catch {
    storage = {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
      removeItem() {
        throw Error();
      },
    };
  }
  const get = storage.getItem.bind(storage),
    set = storage.setItem.bind(storage),
    remove = storage.removeItem.bind(storage);
  const locks =
    options.locks === undefined
      ? typeof navigator === "undefined"
        ? null
        : (navigator.locks as unknown as LearningLocks)
      : options.locks;
  const request =
    locks && typeof locks.request === "function"
      ? locks.request.bind(locks)
      : null;
  const cryptoAvailable =
    options.cryptoAvailable ??
    (typeof globalThis.crypto?.subtle?.digest === "function" &&
      globalThis.isSecureContext !== false);
  let supported = !!request && cryptoAvailable,
    closed = false,
    state: T | null = null,
    hash: Hash | null = null;
  let observed: string | null | undefined,
    recoveryRaw: string | undefined,
    generation = 0,
    unsaved = false,
    blocked = false;
  let pending: "write" | "remove" = "write",
    undo: T | null = null;
  let code: LearningStoreCode = supported ? "ready" : "unsupported",
    message = "";
  const unsupported =
    "This browser cannot safely save this workspace. Web Locks and secure-context hashing are required. Readable data and raw recovery remain available.";
  const external =
    "Another tab changed the saved workspace. Your current work is untouched. Download it before explicitly reloading or reviewing a replacement.";
  const snapshot = () =>
    Object.freeze({
      state,
      hash,
      generation,
      observedRaw: observed,
      unsaved,
      blocked: message,
      message,
      code,
      readOnly: !supported || blocked || closed,
      canWrite:
        supported &&
        !blocked &&
        !closed &&
        state !== null &&
        observed !== undefined,
      canRecover: supported && !closed && observed !== undefined,
      canRetryPersist:
        supported &&
        !blocked &&
        !closed &&
        unsaved &&
        state !== null &&
        observed !== undefined,
      canUndo: supported && !blocked && !closed && undo !== null,
    });
  const block = (next: LearningStoreCode, text: string) => {
    blocked = true;
    code = next;
    message = text;
  };
  const requireSupport = () => {
    if (closed) learningStoreFail("closed", "This workspace view is closed.");
    if (!supported) learningStoreFail("unsupported", unsupported);
  };
  const requireWrite = () => {
    requireSupport();
    if (blocked || observed === undefined || !state || !hash)
      learningStoreFail(
        code,
        message || "Use Recovery before saving this workspace.",
      );
  };
  const read = () => {
    try {
      const raw = get(key);
      if (raw !== null && typeof raw !== "string") throw Error();
      return raw;
    } catch {
      observed = undefined;
      generation++;
      block(
        "read_error",
        "Saved bytes could not be read. Nothing was overwritten; export current work and try an explicit reload.",
      );
      learningStoreFail("read_error", message);
    }
  };
  const bind = (): LearningCellBinding => {
    if (observed === undefined)
      learningStoreFail(
        "read_error",
        "Saved bytes are unavailable; reload before recovery.",
      );
    return { generation, hash, raw: observed };
  };
  const assertMemory = (b: LearningCellBinding) => {
    if (generation !== b.generation || hash !== b.hash)
      learningStoreFail(
        "stale_memory",
        "This workspace changed while the action was pending. Review it again.",
      );
  };
  const markForeign = (
    raw: string | null,
    previous: string | null | undefined = observed,
  ) => {
    // Keep the original protected text AND expose the newly read baseline.
    // Updating observed bytes grants no write authority: memory stays unchanged and blocked.
    if (
      recoveryRaw === undefined &&
      previous !== undefined &&
      previous !== null
    )
      recoveryRaw = previous;
    observed = raw;
    generation++;
    block("external_change", external);
  };
  const assertDisk = (raw: string | null) => {
    const actual = read();
    if (actual !== raw) {
      markForeign(actual, raw);
      learningStoreFail("external_change", external);
    }
  };
  const checked = async (input: unknown) => {
    const c = await check(input);
    return {
      state: freezeLearningStoreValue(c.state),
      hash: c.hash,
      raw: c.raw,
    };
  };
  const exclusive = async <R>(run: () => Promise<R>): Promise<R> => {
    requireSupport();
    let entered = false;
    try {
      return await request!(key, { mode: "exclusive" }, async () => {
        entered = true;
        return run();
      });
    } catch (e) {
      if (!entered) {
        supported = false;
        block("unsupported", unsupported);
        learningStoreFail("unsupported", unsupported);
      }
      throw e;
    }
  };
  const persist = (raw: string, mode: "write" | "remove") => {
    try {
      if (mode === "write") set(key, raw);
      else remove(key);
      observed = mode === "write" ? raw : null;
      unsaved = false;
      blocked = false;
      code = "ready";
      message = "";
    } catch {
      unsaved = true;
      code = "persist_failed";
      message =
        "This valid change exists only in memory. Saved bytes are unchanged. Download it or retry saving this exact candidate; retry does not repeat a command.";
    }
  };
  const assign = (
    c: LearningCellCandidate<T>,
    mode: "write" | "remove",
    keepUndo: boolean,
  ) => {
    if (keepUndo) undo = state;
    state = c.state;
    hash = c.hash;
    pending = mode;
    unsaved = true;
    generation++;
    persist(c.raw, mode);
  };
  const load = async (discard: boolean, assert: () => void = () => {}) => {
    if (closed) learningStoreFail("closed", "This workspace view is closed.");
    if (!discard && (unsaved || (state !== null && dirty(state))))
      learningStoreFail(
        "discard_required",
        "Download current work, then explicitly confirm discarding it before reload.",
      );
    const before = { generation, hash };
    let raw: string | null;
    try {
      raw = read();
    } catch {
      return snapshot();
    }
    if (!cryptoAvailable) {
      assert();
      observed = raw;
      state = null;
      hash = null;
      undo = null;
      generation++;
      code = "unsupported";
      message = unsupported;
      return snapshot();
    }
    try {
      const input = raw === null ? initial : strictLearningJson(raw, limit);
      const c = await checked(input);
      assert();
      if (generation !== before.generation || hash !== before.hash)
        learningStoreFail(
          "stale_memory",
          "This workspace changed while reload was pending.",
        );
      const actual = read();
      if (actual !== raw) {
        markForeign(actual, raw);
        return snapshot();
      }
      state = c.state;
      hash = c.hash;
      observed = raw;
      recoveryRaw = undefined;
      undo = null;
      unsaved = false;
      blocked = false;
      pending = "write";
      generation++;
      code = supported ? "ready" : "unsupported";
      message = supported ? "" : unsupported;
    } catch (e) {
      if (e instanceof LearningStoreError) throw e;
      observed = raw;
      if (raw !== null) recoveryRaw = raw;
      undo = null;
      generation++;
      block(
        "corrupt",
        "Saved data could not be validated. Its raw bytes are protected. Download them before previewing an explicit replacement or clear.",
      );
    }
    return snapshot();
  };
  const cell: LearningCell<T> = {
    snapshot,
    requireWrite,
    requireRecover() {
      requireSupport();
      if (observed === undefined)
        learningStoreFail(
          "read_error",
          "Saved bytes are unavailable. Explicitly reload before recovery.",
        );
    },
    bind,
    assertMemory,
    assertDisk,
    checked,
    exclusive,
    previewBaseline(b) {
      assertMemory(b);
      const raw = read();
      if (raw !== b.raw) {
        markForeign(raw, b.raw);
        learningStoreFail("external_change", external);
      }
      return { ...b, raw };
    },
    assign,
    async retryPersist() {
      requireWrite();
      const b = bind();
      return exclusive(async () => {
        requireWrite();
        assertMemory(b);
        assertDisk(b.raw);
        if (!unsaved) return snapshot();
        const c = await checked(state);
        assertMemory(b);
        assertDisk(b.raw);
        if (c.hash !== b.hash)
          learningStoreFail(
            "candidate_hash",
            "Current memory changed before retry.",
          );
        persist(c.raw, pending);
        if (!unsaved) generation++;
        return snapshot();
      });
    },
    async undo() {
      requireWrite();
      if (!undo)
        learningStoreFail(
          "undo_unavailable",
          "No guarded undo is available; reload invalidates earlier undo.",
        );
      const b = bind(),
        target = undo;
      return exclusive(async () => {
        requireWrite();
        assertMemory(b);
        assertDisk(b.raw);
        const c = await checked(target);
        assertMemory(b);
        assertDisk(b.raw);
        undo = null;
        assign(c, "write", false);
        return snapshot();
      });
    },
    async reload(settings = {}) {
      const watch = watchLearningValue(settings, 1024);
      if (
        Object.keys(watch.value).some((k) => k !== "discardUnsaved") ||
        (Object.hasOwn(watch.value, "discardUnsaved") &&
          typeof watch.value.discardUnsaved !== "boolean")
      )
        learningStoreFail(
          "reload_options",
          "Use only an explicit boolean discard choice.",
        );
      const discard = watch.value.discardUnsaved === true,
        before = { generation, hash };
      const run = async () => {
        watch.assert();
        if (generation !== before.generation || hash !== before.hash)
          learningStoreFail(
            "stale_memory",
            "This workspace changed before reload.",
          );
        const result = await load(discard, watch.assert);
        watch.assert();
        return result;
      };
      return supported ? exclusive(run) : run();
    },
    noticeExternalChange() {
      if (!closed) {
        generation++;
        block("external_change", external);
      }
      return snapshot();
    },
    rawSavedCopy() {
      if (recoveryRaw !== undefined) return recoveryRaw;
      try {
        const raw = get(key);
        if (raw === null || typeof raw === "string") return raw;
      } catch {
        return undefined;
      }
      return observed;
    },
    dispose() {
      closed = true;
      generation++;
      undo = null;
      code = "closed";
      message = "This workspace view is closed.";
    },
  };
  if (supported) {
    try {
      await exclusive(() => load(true));
    } catch (e) {
      if (e instanceof LearningStoreError && e.code === "unsupported")
        await load(true);
      else throw e;
    }
  } else await load(true);
  return cell;
}
const courseReaders = new WeakMap<
  CourseProgressStore,
  (
    binding: CourseCaptureReadBinding,
    action: (lease: CourseCaptureReadLease) => Promise<unknown>,
  ) => Promise<unknown>
>();
/** Coordinator-only course lease. Takes course lock, never a companion lock/write. */
export function withCourseCaptureRead<T>(
  store: CourseProgressStore,
  binding: CourseCaptureReadBinding,
  action: (lease: CourseCaptureReadLease) => Promise<T>,
): Promise<T> {
  const reader = courseReaders.get(store);
  if (!reader)
    learningStoreFail("foreign_store", "Use the issuing course store.");
  return reader(binding, action) as Promise<T>;
}
export async function createCourseProgressStore(
  options: CourseStoreOptions,
): Promise<CourseProgressStore> {
  const initial = watchLearningValue(
    options.initialState,
    LEARNING_LIMITS.courseBytes,
  ).value;
  if (
    canonicalLearningJson(initial) !==
    canonicalLearningJson(emptyCourseProgress())
  )
    learningStoreFail(
      "blank_required",
      "The initial course must be the exact empty v1 shape.",
    );
  const digest = options.digest;
  const checked = async (value: unknown) => {
    const state = validateCourseProgress(value),
      raw = makeCourseProgressExport(state),
      hash = await hashLearningValue(state, digest);
    return { state, raw, hash };
  };
  const cell = await createLearningCell({
    ...options,
    initialState: initial,
    key: COURSE_PROGRESS_STORAGE_KEY,
    limit: LEARNING_LIMITS.courseBytes,
    checked,
    dirty: () => false,
  });
  const prepared = new WeakMap<
    object,
    {
      candidate: LearningCellCandidate<CourseState>;
      binding: LearningCellBinding;
      stamp: string;
      noOp: boolean;
    }
  >();
  const recovery = new WeakMap<
    object,
    {
      candidate: LearningCellCandidate<CourseState>;
      binding: LearningCellBinding;
      kind: "restore" | "clear";
      stamp: string;
    }
  >();
  const reads = new WeakMap<
    object,
    { binding: LearningCellBinding; stamp: string }
  >();
  const snapshot = () => cell.snapshot() as CourseStoreSnapshot;
  async function prepare(
    input: CourseState,
    binding: CourseMutationBinding,
    action: "replace" | "completion-day",
  ) {
    const w = watchLearningValue(input, LEARNING_LIMITS.courseBytes),
      wb = watchLearningValue(binding, 1024);
    cell.requireWrite();
    const b = cell.bind();
    return cell.exclusive(async () => {
      w.assert();
      wb.assert();
      cell.requireWrite();
      cell.assertMemory(b);
      cell.assertDisk(b.raw);
      if (
        Object.keys(wb.value).sort().join(",") !==
        "expectedGeneration,expectedStateHash"
      )
        learningStoreFail(
          "binding_shape",
          "Use the exact current generation/hash binding.",
        );
      if (
        wb.value.expectedGeneration !== b.generation ||
        wb.value.expectedStateHash !== b.hash
      )
        learningStoreFail(
          "stale_binding",
          "The course changed since this form opened.",
        );
      const c = await cell.checked(w.value);
      w.assert();
      wb.assert();
      cell.assertMemory(b);
      cell.assertDisk(b.raw);
      if (
        action === "replace" &&
        c.state.completedAt !== snapshot().state!.completedAt
      )
        learningStoreFail(
          "completion_day_separate",
          "Change the declared completion day through its separate explicit action.",
        );
      const p = freezeLearningStoreValue({
        format: "charitology-course-replacement",
        version: 1,
        action,
        expectedGeneration: b.generation,
        expectedStateHash: b.hash!,
        expectedObservedRawHash: learningRawHash(b.raw),
        candidate: c.state,
        candidateHash: c.hash,
        noOp: c.hash === b.hash,
      }) as PreparedCourseReplacement;
      prepared.set(p, {
        candidate: c,
        binding: b,
        stamp: canonicalLearningJson(p),
        noOp: p.noOp,
      });
      return p;
    });
  }
  async function preview(
    kind: "restore" | "clear",
    value: CourseState,
    assert: () => void,
  ) {
    cell.requireRecover();
    const b = cell.bind(),
      c = await cell.checked(value);
    assert();
    cell.assertMemory(b);
    return cell.exclusive(async () => {
      assert();
      const baseline = cell.previewBaseline(b);
      const p = freezeLearningStoreValue({
        format: "charitology-course-recovery-preview",
        version: 1,
        kind,
        state: c.state,
        stateHash: c.hash,
        expectedGeneration: b.generation,
        expectedStateHash: b.hash,
        expectedObservedRawHash: learningRawHash(baseline.raw),
      }) as CourseRecoveryPreview;
      recovery.set(p, {
        candidate: c,
        binding: baseline,
        kind,
        stamp: canonicalLearningJson(p),
      });
      return p;
    });
  }
  function apply(p: CourseRecoveryPreview, kind: "restore" | "clear") {
    cell.requireRecover();
    const saved = recovery.get(p);
    if (!saved || saved.kind !== kind)
      learningStoreFail(
        "preview_required",
        "Review a fresh replacement in this course view.",
      );
    recovery.delete(p);
    return cell.exclusive(async () => {
      if (canonicalLearningJson(p) !== saved.stamp)
        learningStoreFail("preview_changed", "The recovery preview changed.");
      cell.assertMemory(saved.binding);
      cell.assertDisk(saved.binding.raw);
      const c = await cell.checked(saved.candidate.state);
      cell.assertMemory(saved.binding);
      cell.assertDisk(saved.binding.raw);
      if (c.hash !== saved.candidate.hash)
        learningStoreFail("preview_changed", "The recovery candidate changed.");
      cell.assign(c, kind === "clear" ? "remove" : "write", true);
      return snapshot();
    });
  }
  const store: CourseProgressStore = {
    snapshot,
    prepareReplace: (input, binding) => prepare(input, binding, "replace"),
    prepareCompletionDay(day, binding) {
      cell.requireWrite();
      const wb = watchLearningValue(binding, 1024),
        s = snapshot();
      const value = { ...s.state!, completedAt: day };
      return prepare(value, wb.value, "completion-day").then((result) => {
        wb.assert();
        return result;
      });
    },
    commitPrepared(p) {
      cell.requireWrite();
      const saved = prepared.get(p);
      if (!saved)
        learningStoreFail(
          "prepared_required",
          "Use the issuing course view's prepared replacement.",
        );
      prepared.delete(p);
      return cell.exclusive(async () => {
        if (canonicalLearningJson(p) !== saved.stamp)
          learningStoreFail(
            "input_changed",
            "The prepared replacement changed.",
          );
        cell.requireWrite();
        cell.assertMemory(saved.binding);
        cell.assertDisk(saved.binding.raw);
        const c = await cell.checked(saved.candidate.state);
        cell.assertMemory(saved.binding);
        cell.assertDisk(saved.binding.raw);
        if (c.hash !== saved.candidate.hash)
          learningStoreFail("candidate_hash", "The course candidate changed.");
        if (!saved.noOp) cell.assign(c, "write", true);
        return snapshot();
      });
    },
    retryPersist: () => cell.retryPersist() as Promise<CourseStoreSnapshot>,
    async previewRestore(raw) {
      const w = ownLearningRaw(raw, LEARNING_LIMITS.courseBytes);
      cell.requireRecover();
      const b = cell.bind();
      const parsed = await parseCourseProgressExport(w.raw, digest);
      w.assert();
      cell.assertMemory(b);
      return preview(
        "restore",
        parsed.input,
        w.assert,
      ) as Promise<CourseRestorePreview>;
    },
    restore: (p) => apply(p, "restore"),
    previewClear(blank) {
      const w = watchLearningValue(blank, LEARNING_LIMITS.courseBytes);
      if (
        canonicalLearningJson(w.value) !==
        canonicalLearningJson(emptyCourseProgress())
      )
        learningStoreFail(
          "blank_required",
          "Clear requires the exact empty v1 course.",
        );
      return preview("clear", w.value, w.assert) as Promise<CourseClearPreview>;
    },
    clear: (p) => apply(p, "clear"),
    undo: () => cell.undo() as Promise<CourseStoreSnapshot>,
    reload: (o) => cell.reload(o) as Promise<CourseStoreSnapshot>,
    noticeExternalChange: () =>
      cell.noticeExternalChange() as CourseStoreSnapshot,
    async backup() {
      const s = snapshot();
      if (!s.state)
        learningStoreFail(
          "backup_unavailable",
          "No validated course is available; download protected raw bytes.",
        );
      return makeCourseProgressExport(s.state);
    },
    rawSavedCopy: () => cell.rawSavedCopy(),
    async previewCaptureRead() {
      cell.requireWrite();
      const b = cell.bind();
      return cell.exclusive(async () => {
        cell.requireWrite();
        cell.assertMemory(b);
        cell.assertDisk(b.raw);
        const c = await cell.checked(snapshot().state);
        cell.assertMemory(b);
        cell.assertDisk(b.raw);
        if (c.hash !== b.hash)
          learningStoreFail("candidate_hash", "Current course changed.");
        const s = snapshot(),
          p = freezeLearningStoreValue({
            format: "charitology-course-capture-read",
            version: 1,
            generation: b.generation,
            stateHash: c.hash,
            observedRawHash: learningRawHash(b.raw),
            input: c.state,
            persistence:
              !s.unsaved && b.raw !== null ? "saved" : "unsaved-memory",
          }) as CourseCaptureReadBinding;
        reads.set(p, { binding: b, stamp: canonicalLearningJson(p) });
        return p;
      });
    },
    dispose() {
      cell.dispose();
    },
  };
  courseReaders.set(store, async (p, action) => {
    const saved = reads.get(p);
    if (!saved)
      learningStoreFail(
        "capture_read_required",
        "Review a fresh capture from the issuing course view.",
      );
    if (typeof action !== "function")
      learningStoreFail("lease_action", "A coordinator callback is required.");
    reads.delete(p);
    const originalAction = action;
    return cell.exclusive(async () => {
      if (canonicalLearningJson(p) !== saved.stamp)
        learningStoreFail(
          "input_changed",
          "The course capture binding changed.",
        );
      cell.requireWrite();
      cell.assertMemory(saved.binding);
      cell.assertDisk(saved.binding.raw);
      let active = true;
      const lease = Object.freeze({
        binding: p,
        assertCurrent() {
          if (!active)
            learningStoreFail(
              "lease_expired",
              "The course read lease has ended.",
            );
          cell.requireWrite();
          cell.assertMemory(saved.binding);
          cell.assertDisk(saved.binding.raw);
          if (snapshot().hash !== p.stateHash)
            learningStoreFail("stale_source", "The course input changed.");
        },
      });
      try {
        return await originalAction(lease);
      } finally {
        active = false;
      }
    });
  });
  return store;
}
