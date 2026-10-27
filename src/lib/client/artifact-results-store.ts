/** One browser-origin register. Every write uses a Web Lock plus exact saved-byte comparison. */
import {
  ARTIFACT_LIMITS,
  canonicalArtifactJson,
  makeArtifactBackup,
  parseArtifactBackup,
  artifactStateHash,
  validateArtifactState,
  type PreparedArtifactMutation,
  type ArtifactState,
} from "./artifact-results-model";

export const ARTIFACT_STORAGE_KEY = "charitology.artifact-results.v1";
export const ARTIFACT_LOCK_NAME = ARTIFACT_STORAGE_KEY;

export interface ArtifactStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface ArtifactLocks {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    action: () => Promise<T>,
  ): Promise<T>;
}
export type StoreCode =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
export class ArtifactStoreError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ArtifactStoreError";
  }
}
export interface StoreSnapshot {
  state: ArtifactState | null;
  hash: string | null;
  generation: number;
  observedRaw: string | null | undefined;
  unsaved: boolean;
  blocked: string;
  message: string;
  code: StoreCode;
  readOnly: boolean;
  canWrite: boolean;
  canRecover: boolean;
  canRetryPersist: boolean;
  canUndo: boolean;
}
interface RecoveryPreview {
  readonly state: ArtifactState;
  readonly stateHash: string;
  readonly generation: number;
  readonly expectedStateHash: string | null;
}
export interface RestorePreview extends RecoveryPreview {
  readonly kind: "restore";
}
export interface ClearPreview extends RecoveryPreview {
  readonly kind: "clear";
}
export interface ArtifactResultsStore {
  snapshot(): StoreSnapshot;
  commitPrepared(prepared: PreparedArtifactMutation): Promise<StoreSnapshot>;
  retryPersist(): Promise<StoreSnapshot>;
  previewRestore(raw: string | Uint8Array): Promise<RestorePreview>;
  restore(preview: RestorePreview): Promise<StoreSnapshot>;
  previewClear(blank: ArtifactState): Promise<ClearPreview>;
  clear(preview: ClearPreview): Promise<StoreSnapshot>;
  undo(): Promise<StoreSnapshot>;
  reload(options?: { discardUnsaved?: boolean }): Promise<StoreSnapshot>;
  noticeExternalChange(): StoreSnapshot;
  backup(exportedAt: string): Promise<string>;
  /** Exact protected bytes, not a claim that corrupt text is a valid backup. */
  rawSavedCopy(): string | null | undefined;
  dispose(): void;
}
export interface ArtifactStoreOptions {
  initialState: ArtifactState;
  storage?: ArtifactStorage;
  locks?: ArtifactLocks | null;
  cryptoAvailable?: boolean;
}
const hashShape = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function error(code: string, message: string): never {
  throw new ArtifactStoreError(code, message);
}
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const unsupported =
  "This browser cannot safely save this register. Web Locks and secure-context hashing are required. Readable records and protected raw-copy download remain available.";
const external =
  "Another tab changed the saved register. Your current work is untouched. Download it before explicitly reloading or reviewing a replacement.";

/** Browser dependencies may be injected for tests; no global listeners or legacy keys are touched. */
export async function createArtifactResultsStore(
  options: ArtifactStoreOptions,
): Promise<ArtifactResultsStore> {
  let storage: ArtifactStorage;
  try {
    storage = options.storage ?? globalThis.localStorage;
  } catch {
    storage = {
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
      removeItem: () => {
        throw Error();
      },
    };
  }
  const locks =
    options.locks === undefined
      ? typeof navigator === "undefined"
        ? null
        : (navigator.locks as unknown as ArtifactLocks)
      : options.locks;
  const cryptoAvailable =
    options.cryptoAvailable ??
    (typeof globalThis.crypto?.subtle?.digest === "function" &&
      globalThis.isSecureContext !== false);
  let supported =
    !!locks && typeof locks.request === "function" && cryptoAvailable;
  let state: ArtifactState | null = null,
    currentHash: string | null = null;
  let observed: string | null | undefined, recoveryRaw: string | undefined;
  let generation = 0,
    unsaved = false,
    hardBlocked = false,
    closed = false;
  let code: StoreCode = supported ? "ready" : "unsupported",
    message = supported ? "" : unsupported;
  let undoState: ArtifactState | null = null;
  let pendingMode: "write" | "remove" = "write";
  let previews = new WeakMap<
    object,
    {
      state: ArtifactState;
      hash: string;
      raw: string | null;
      generation: number;
      currentHash: string | null;
      kind: "restore" | "clear";
    }
  >();

  const snapshot = (): StoreSnapshot => ({
    // Validated states are deeply frozen and replaced wholesale. Reuse that
    // immutable reference so each button/status read does not copy up to 2 MiB.
    state,
    hash: currentHash,
    generation,
    observedRaw: observed,
    unsaved,
    blocked: message,
    message,
    code,
    readOnly: !supported || hardBlocked || closed,
    canWrite:
      supported &&
      !hardBlocked &&
      !closed &&
      state !== null &&
      observed !== undefined,
    canRecover: supported && !closed,
    canRetryPersist:
      supported &&
      !hardBlocked &&
      !closed &&
      unsaved &&
      state !== null &&
      observed !== undefined,
    canUndo: supported && !hardBlocked && !closed && undoState !== null,
  });
  function markBlocked(nextCode: StoreCode, text: string) {
    hardBlocked = true;
    code = nextCode;
    message = text;
  }
  function requireSupported() {
    if (closed) error("closed", "This register view is closed.");
    if (!supported) error("unsupported", unsupported);
  }
  function requireWritable() {
    requireSupported();
    if (hardBlocked || observed === undefined)
      error(
        code,
        message || "The protected saved copy must be recovered explicitly.",
      );
    if (!state || !currentHash)
      error("unavailable", "A valid register could not be loaded.");
  }
  function readRaw(): string | null {
    try {
      const raw = storage.getItem(ARTIFACT_STORAGE_KEY);
      if (raw !== null && typeof raw !== "string") throw Error();
      return raw;
    } catch {
      markBlocked(
        "read_error",
        "The saved register could not be read. Nothing was overwritten; keep an export of current work and try an explicit reload later.",
      );
      error("read_error", message);
    }
  }
  function sameMemory(epoch: number, expected: string | null) {
    if (generation !== epoch || currentHash !== expected)
      error(
        "stale_memory",
        "The register changed while this operation was being prepared. Review the current version and try again.",
      );
  }
  function sameDisk(expected: string | null) {
    const raw = readRaw();
    if (raw !== expected) {
      // Keep memory separate; expose the exact newly observed saved copy for
      // recovery without granting an ordinary write against it.
      observed = raw;
      generation++;
      markBlocked("external_change", external);
      error("external_change", external);
    }
  }
  async function lock<T>(action: () => Promise<T>): Promise<T> {
    requireSupported();
    let entered = false;
    try {
      return await locks!.request(
        ARTIFACT_LOCK_NAME,
        { mode: "exclusive" },
        async () => {
          entered = true;
          return action();
        },
      );
    } catch (cause) {
      if (!entered) {
        supported = false;
        markBlocked("unsupported", unsupported);
        error("unsupported", unsupported);
      }
      throw cause;
    }
  }
  async function checked(
    value: unknown,
  ): Promise<{ state: ArtifactState; hash: string; raw: string }> {
    const valid = await validateArtifactState(value);
    // The exact complete pretty backup includes a fixed-length canonical timestamp.
    // Check it BEFORE assigning even a memory candidate or touching saved bytes.
    await makeArtifactBackup(valid, valid.updatedAt);
    const hash = await artifactStateHash(valid);
    return { state: frozen(valid), hash, raw: canonicalArtifactJson(valid) };
  }
  function persist(raw: string, mode: "write" | "remove") {
    try {
      if (mode === "remove") storage.removeItem(ARTIFACT_STORAGE_KEY);
      else storage.setItem(ARTIFACT_STORAGE_KEY, raw);
      observed = mode === "remove" ? null : raw;
      unsaved = false;
      code = "ready";
      message = "";
      hardBlocked = false;
    } catch {
      unsaved = true;
      code = "persist_failed";
      message =
        "This valid register is only in memory because saving failed. Download a complete backup before leaving. Retry save writes this same candidate; it does not repeat your last command.";
    }
  }
  async function replace(
    candidate: { state: ArtifactState; hash: string; raw: string },
    mode: "write" | "remove",
    keepUndo: boolean,
  ) {
    if (keepUndo) undoState = state;
    state = candidate.state;
    currentHash = candidate.hash;
    pendingMode = mode;
    unsaved = true;
    generation++;
    persist(candidate.raw, mode);
    return snapshot();
  }
  async function load(discard: boolean) {
    if (closed) error("closed", "This register view is closed.");
    if (!discard && (unsaved || state?.draft.dirty))
      error(
        "discard_required",
        "Download current work first, then explicitly confirm discarding unsaved work before reloading.",
      );
    const epoch = generation,
      expected = currentHash;
    let raw: string | null;
    try {
      raw = readRaw();
    } catch {
      if (!state && cryptoAvailable) {
        try {
          const initial = await checked(options.initialState);
          state = initial.state;
          currentHash = initial.hash;
          generation++;
        } catch {
          state = null;
          currentHash = null;
        }
      }
      return snapshot();
    }
    // Keep exact bytes available even when their shape or checksum cannot be verified.
    if (!cryptoAvailable) {
      observed = raw;
      state = null;
      currentHash = null;
      undoState = null;
      unsaved = false;
      generation++;
      code = "unsupported";
      message = unsupported;
      return snapshot();
    }
    try {
      // Corrupt/oversized storage remains a raw recovery copy. Reject its size
      // before JSON parsing instead of admitting an expensive unbounded graph.
      if (
        raw !== null &&
        (raw.length > ARTIFACT_LIMITS.backupBytes ||
          new TextEncoder().encode(raw).byteLength >
            ARTIFACT_LIMITS.backupBytes)
      )
        throw Error(
          "Saved register exceeds its recovery-compatible byte bound.",
        );
      const candidate = await checked(
        raw === null ? options.initialState : JSON.parse(raw),
      );
      sameMemory(epoch, expected);
      const currentRaw = readRaw();
      if (currentRaw !== raw) {
        observed = currentRaw;
        generation++;
        markBlocked("external_change", external);
        return snapshot();
      }
      state = candidate.state;
      currentHash = candidate.hash;
      observed = raw;
      recoveryRaw = undefined;
      undoState = null;
      unsaved = false;
      hardBlocked = false;
      pendingMode = "write";
      generation++;
      previews = new WeakMap();
      code = supported ? "ready" : "unsupported";
      message = supported ? "" : unsupported;
    } catch (cause) {
      if (cause instanceof ArtifactStoreError) throw cause;
      // Do not replace valid current/unsaved work with a blank after a bad reload.
      observed = raw;
      if (raw !== null) recoveryRaw = raw;
      if (!state) {
        try {
          const initial = await checked(options.initialState);
          state = initial.state;
          currentHash = initial.hash;
        } catch {
          state = null;
          currentHash = null;
        }
      }
      undoState = null;
      generation++;
      markBlocked(
        "corrupt",
        "The saved register could not be validated. Its exact raw bytes are protected. Download them before explicitly previewing a valid replacement or clearing this key.",
      );
    }
    return snapshot();
  }
  const initialLoad = async () => {
    if (!supported) return load(true);
    try {
      return await lock(() => load(true));
    } catch (cause) {
      if (cause instanceof ArtifactStoreError && cause.code === "unsupported")
        return load(true);
      throw cause;
    }
  };

  async function makePreview(
    kind: "restore" | "clear",
    input: unknown,
  ): Promise<RestorePreview | ClearPreview> {
    requireSupported();
    const epoch = generation,
      expected = currentHash;
    const candidate = await checked(input);
    sameMemory(epoch, expected);
    return lock(async () => {
      sameMemory(epoch, expected);
      const raw = readRaw();
      // An undelivered storage event must not turn a routine preview into
      // permission to discard a newer copy the user has not seen yet.
      if (raw !== observed) {
        // A corrupt/read-blocked copy is not permission to discard a different
        // unseen saved value. Retain protected original text separately, warn
        // on every newly observed value, then require a fresh preview.
        observed = raw;
        generation++;
        markBlocked("external_change", external);
        error("external_change", external);
      }
      const preview = frozen({
        kind,
        state: clone(candidate.state),
        stateHash: candidate.hash,
        generation: epoch,
        expectedStateHash: expected,
      });
      previews.set(preview, {
        state: candidate.state,
        hash: candidate.hash,
        raw,
        generation: epoch,
        currentHash: expected,
        kind,
      });
      return preview as RestorePreview | ClearPreview;
    });
  }
  async function applyPreview(
    preview: RestorePreview | ClearPreview,
    kind: "restore" | "clear",
  ) {
    requireSupported();
    const saved = previews.get(preview);
    if (!saved || saved.kind !== kind)
      error(
        "preview_required",
        "Review a fresh replacement preview from this register view first.",
      );
    return lock(async () => {
      sameMemory(saved.generation, saved.currentHash);
      sameDisk(saved.raw);
      const candidate = await checked(saved.state);
      sameMemory(saved.generation, saved.currentHash);
      sameDisk(saved.raw);
      if (candidate.hash !== saved.hash)
        error(
          "preview_changed",
          "The reviewed replacement changed. Preview it again.",
        );
      // A deliberate preview/confirmation may recover corrupt or externally changed bytes.
      // This is never the ordinary save path and never trusts a stale recovery preview.
      if (saved.raw !== null && hardBlocked && recoveryRaw === undefined)
        recoveryRaw = saved.raw;
      observed = saved.raw;
      hardBlocked = false;
      previews = new WeakMap();
      return replace(candidate, kind === "clear" ? "remove" : "write", true);
    });
  }
  await initialLoad();
  return {
    snapshot,
    async commitPrepared(prepared) {
      requireWritable();
      const epoch = generation,
        expected = currentHash;
      return lock(async () => {
        requireWritable();
        sameMemory(epoch, expected);
        sameDisk(observed!);
        if (
          !plain(prepared) ||
          Object.keys(prepared).some(
            (key) =>
              ![
                "format",
                "version",
                "expectedStateHash",
                "expectedRevision",
                "nextStateHash",
                "nextState",
                "commandHash",
                "noOp",
                "summary",
              ].includes(key),
          ) ||
          prepared.format !== "charitology-artifact-mutation" ||
          prepared.version !== 1 ||
          !hashShape(prepared.expectedStateHash) ||
          !hashShape(prepared.nextStateHash) ||
          !hashShape(prepared.commandHash) ||
          typeof prepared.noOp !== "boolean" ||
          prepared.expectedStateHash !== currentHash ||
          prepared.expectedRevision !== state!.revision
        )
          error(
            "stale_prepared",
            "Use a prepared command for this exact current register.",
          );
        const candidate = await checked(prepared.nextState);
        sameMemory(epoch, expected);
        sameDisk(observed!);
        if (candidate.hash !== prepared.nextStateHash)
          error(
            "candidate_hash",
            "The prepared candidate hash does not match its complete contents.",
          );
        if (prepared.noOp) {
          if (candidate.hash !== currentHash)
            error("invalid_noop", "A no-op cannot replace register contents.");
          return snapshot();
        }
        if (candidate.state.revision !== state!.revision + 1)
          error(
            "candidate_revision",
            "A prepared command must advance the workspace revision exactly once.",
          );
        previews = new WeakMap();
        return replace(candidate, "write", true);
      });
    },
    async retryPersist() {
      requireWritable();
      const epoch = generation,
        expected = currentHash;
      return lock(async () => {
        requireWritable();
        sameMemory(epoch, expected);
        sameDisk(observed!);
        if (!unsaved) return snapshot();
        const candidate = await checked(state);
        sameMemory(epoch, expected);
        sameDisk(observed!);
        if (candidate.hash !== expected)
          error("candidate_hash", "Current memory changed before retry.");
        persist(candidate.raw, pendingMode);
        if (!unsaved) {
          generation++;
          previews = new WeakMap();
        }
        return snapshot();
      });
    },
    async previewRestore(raw) {
      requireSupported();
      const epoch = generation,
        expected = currentHash;
      const restored = await parseArtifactBackup(raw);
      sameMemory(epoch, expected);
      return makePreview("restore", restored) as Promise<RestorePreview>;
    },
    restore: (preview) => applyPreview(preview, "restore"),
    async previewClear(blank) {
      requireSupported();
      // Known inert adapter definitions may remain in an empty register.
      // The model validates them; only research entities must be absent.
      const arrays = [
        "projects",
        "protocols",
        "manifests",
        "results",
        "comparisons",
        "packets",
      ] as const;
      if (
        !plain(blank) ||
        !plain(blank.draft) ||
        arrays.some((key) => !Array.isArray(blank[key]) || blank[key].length) ||
        blank.draft.form !== null ||
        blank.draft.dirty ||
        blank.draft.selectedProjectId !== null
      )
        error(
          "blank_required",
          "Clear requires a new empty workspace, not a partial replacement.",
        );
      return makePreview("clear", blank) as Promise<ClearPreview>;
    },
    clear: (preview) => applyPreview(preview, "clear"),
    async undo() {
      requireWritable();
      if (!undoState)
        error(
          "undo_unavailable",
          "There is no guarded undo in this view. Reload clears earlier undo history.",
        );
      const epoch = generation,
        expected = currentHash,
        target = undoState;
      return lock(async () => {
        requireWritable();
        sameMemory(epoch, expected);
        sameDisk(observed!);
        const candidate = await checked(target);
        sameMemory(epoch, expected);
        sameDisk(observed!);
        undoState = null;
        previews = new WeakMap();
        return replace(candidate, "write", false);
      });
    },
    async reload(settings = {}) {
      const epoch = generation,
        expected = currentHash;
      if (supported)
        return lock(() => {
          sameMemory(epoch, expected);
          return load(settings.discardUnsaved === true);
        });
      return load(settings.discardUnsaved === true);
    },
    noticeExternalChange() {
      if (!closed) {
        generation++;
        markBlocked("external_change", external);
      }
      return snapshot();
    },
    async backup(exportedAt) {
      if (!state)
        error(
          "backup_unavailable",
          "The register cannot be verified here. Download its protected raw saved bytes instead.",
        );
      return makeArtifactBackup(state, exportedAt);
    },
    rawSavedCopy() {
      if (recoveryRaw !== undefined) return recoveryRaw;
      // An explicit raw download may read the newer protected copy without
      // adopting it as this editor's save baseline or granting write authority.
      try {
        const raw = storage.getItem(ARTIFACT_STORAGE_KEY);
        if (raw === null || typeof raw === "string") return raw;
      } catch {
        /* The last successfully read bytes remain exportable. */
      }
      return observed;
    },
    dispose() {
      closed = true;
      generation++;
      code = "closed";
      message = "This register view is closed.";
      previews = new WeakMap();
      undoState = null;
    },
  };
}
