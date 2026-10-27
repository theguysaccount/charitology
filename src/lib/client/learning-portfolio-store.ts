/** Companion-only portfolio key, with opaque course/file capture coordination. */
import {
  canonicalLearningJson,
  blankLearningPortfolio,
  hashLearningValue,
  learningPortfolioStateHash,
  validateLearningPortfolio,
  validateCourseCriteria,
  evaluateCourseProgress,
  makeLearningBackup,
  parseLearningBackup,
  parseCourseProgressExport,
  prepareLearningCommand,
  LEARNING_LIMITS,
  type Hash,
  type Id,
  type Instant,
  type CourseState,
  type CourseCriteria,
  type CourseSnapshotInput,
  type CourseEvaluation,
  type LearningPortfolioState,
  type PreparedLearningMutation,
} from "./learning-portfolio-model";
import {
  createLearningCell,
  watchLearningValue,
  ownLearningRaw,
  freezeLearningStoreValue,
  learningStoreFail,
  learningRawHash,
  withCourseCaptureRead,
  type LearningCell,
  type LearningCellCandidate,
  type LearningCellBinding,
  type LearningStoreStatus,
  type LearningStoreDependencies,
  type StoreReloadOptions,
  type CourseProgressStore,
  type CourseCaptureReadBinding,
  type CourseCaptureReadLease,
} from "./course-progress-store";
export type {
  LearningStorage,
  LearningLocks,
  LearningStoreStatus,
  LearningStoreDependencies,
  LearningStoreCode,
  StoreReloadOptions,
} from "./course-progress-store";
export const LEARNING_PORTFOLIO_STORAGE_KEY =
  "charitology.learning-portfolio.v1";
export const LEARNING_PORTFOLIO_LOCK_NAME = LEARNING_PORTFOLIO_STORAGE_KEY;
export interface LearningStoreSnapshot extends LearningStoreStatus {
  readonly state: LearningPortfolioState | null;
  readonly hash: Hash | null;
}
export interface LearningStoreOptions extends LearningStoreDependencies {
  initialState: LearningPortfolioState;
  knownCriteria: readonly CourseCriteria[];
}
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
export type LearningRestorePreview = LearningRecoveryPreview & {
  readonly kind: "restore";
};
export type LearningClearPreview = LearningRecoveryPreview & {
  readonly kind: "clear";
};
export interface CaptureTarget {
  recordId: Id;
  recordHash: Hash;
}
export interface CaptureIntent {
  criteriaId: Id;
  criteriaHash: Hash;
  target: CaptureTarget | null;
}
interface CaptureReview {
  readonly intent: CaptureIntent;
  readonly source: CourseSnapshotInput;
  readonly inputHash: Hash;
  readonly evaluation: CourseEvaluation;
  readonly expectedGeneration: number;
  readonly expectedStateHash: Hash;
  readonly expectedRevision: number;
  readonly expectedObservedRawHash: Hash | null;
}
declare const LIVE_CAPTURE_OWNER: unique symbol;
export interface LiveCourseCapturePreview extends CaptureReview {
  readonly format: "charitology-live-course-capture";
  readonly version: 1;
  readonly kind: "live";
  readonly course: CourseCaptureReadBinding;
  readonly [LIVE_CAPTURE_OWNER]: true;
}
declare const FILE_CAPTURE_OWNER: unique symbol;
export interface FileCourseCapturePreview extends CaptureReview {
  readonly format: "charitology-file-course-capture";
  readonly version: 1;
  readonly kind: "file";
  readonly sourceByteLength: number;
  readonly [FILE_CAPTURE_OWNER]: true;
}
export interface CaptureCommitOptions {
  criteriaAffirmed: true;
  reason: string | null;
  at: Instant;
  makeId(): Id;
  assertUiCurrent(): undefined;
}
export interface LearningPortfolioStore {
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
interface SavedCapture {
  binding: LearningCellBinding;
  preview: LiveCourseCapturePreview | FileCourseCapturePreview;
  stamp: string;
  courseStore: CourseProgressStore | null;
  raw: { raw: string | Uint8Array; assert(): void } | null;
}
function optionsBinding(options: CaptureCommitOptions) {
  const keys = [
      "criteriaAffirmed",
      "reason",
      "at",
      "makeId",
      "assertUiCurrent",
    ],
    descriptors = Object.getOwnPropertyDescriptors(options);
  if (
    Object.getPrototypeOf(options) !== Object.prototype ||
    Reflect.ownKeys(options).some(
      (k) => typeof k !== "string" || !keys.includes(k),
    ) ||
    keys.some((k) => !descriptors[k] || !("value" in descriptors[k]))
  )
    learningStoreFail(
      "options_shape",
      "Use explicit capture options with a synchronous controller guard.",
    );
  const data = () => {
    const d = Object.getOwnPropertyDescriptors(options);
    if (
      Reflect.ownKeys(options).length !== keys.length ||
      Reflect.ownKeys(options).some(
        (k) => typeof k !== "string" || !keys.includes(k),
      ) ||
      keys.some((k) => !d[k] || !("value" in d[k]))
    )
      learningStoreFail("input_changed", "Capture options changed.");
    return {
      criteriaAffirmed: d.criteriaAffirmed.value,
      reason: d.reason.value,
      at: d.at.value,
    };
  };
  const watched = watchLearningValue(data(), 8192),
    makeId = descriptors.makeId.value as CaptureCommitOptions["makeId"],
    guard = descriptors.assertUiCurrent
      .value as CaptureCommitOptions["assertUiCurrent"];
  if (
    watched.value.criteriaAffirmed !== true ||
    typeof makeId !== "function" ||
    typeof guard !== "function"
  )
    learningStoreFail(
      "affirmation_required",
      "Explicitly affirm the exact reviewed criteria before recording.",
    );
  const stamp = canonicalLearningJson(watched.value);
  const assert = () => {
    const d = Object.getOwnPropertyDescriptors(options);
    if (
      canonicalLearningJson(data()) !== stamp ||
      d.makeId?.value !== makeId ||
      d.assertUiCurrent?.value !== guard
    )
      learningStoreFail(
        "input_changed",
        "Capture options changed while pending.",
      );
  };
  return {
    ...watched.value,
    at: watched.value.at as Instant,
    reason: watched.value.reason as string | null,
    makeId,
    guard,
    assert,
  };
}
export async function createLearningPortfolioStore(
  options: LearningStoreOptions,
): Promise<LearningPortfolioStore> {
  const known = watchLearningValue(
    options.knownCriteria,
    LEARNING_LIMITS.criteriaBytes * LEARNING_LIMITS.criteria + 8192,
  ).value;
  if (!Array.isArray(known) || known.length > LEARNING_LIMITS.criteria)
    learningStoreFail(
      "criteria_limit",
      "Choose the bounded known criteria registry.",
    );
  for (const criteria of known) validateCourseCriteria(criteria, known);
  const initial = watchLearningValue(options.initialState).value;
  if (
    canonicalLearningJson(initial) !==
    canonicalLearningJson(blankLearningPortfolio(initial.id, initial.createdAt))
  )
    learningStoreFail(
      "blank_required",
      "Initial portfolio memory must be the exact new blank workspace.",
    );
  const digest = options.digest;
  const checked = async (value: unknown) => {
    const state = validateLearningPortfolio(value, known);
    await makeLearningBackup(state, state.updatedAt, known, digest);
    const hash = await learningPortfolioStateHash(state, digest);
    return { state, hash, raw: canonicalLearningJson(state) };
  };
  const cell: LearningCell<LearningPortfolioState> = await createLearningCell({
    ...options,
    key: LEARNING_PORTFOLIO_STORAGE_KEY,
    initialState: initial,
    limit: LEARNING_LIMITS.backupBytes,
    checked,
    dirty: (s) => s.draft.dirty,
  });
  const snapshot = () => cell.snapshot() as LearningStoreSnapshot;
  const recovery = new WeakMap<
    object,
    {
      candidate: LearningCellCandidate<LearningPortfolioState>;
      binding: LearningCellBinding;
      kind: "restore" | "clear";
      stamp: string;
    }
  >();
  const captures = new WeakMap<object, SavedCapture>();
  function criteriaFor(intent: CaptureIntent) {
    if (
      !intent ||
      Object.keys(intent).sort().join(",") !==
        "criteriaHash,criteriaId,target" ||
      typeof intent.criteriaId !== "string" ||
      typeof intent.criteriaHash !== "string"
    )
      learningStoreFail(
        "intent_shape",
        "Choose an exact criteria and record target.",
      );
    const criteria = known.find(
      (c) => c.id === intent.criteriaId && c.hash === intent.criteriaHash,
    );
    if (!criteria)
      learningStoreFail(
        "criteria_unknown",
        "Choose an offered known criteria version.",
      );
    if (intent.target !== null) {
      if (Object.keys(intent.target).sort().join(",") !== "recordHash,recordId")
        learningStoreFail("intent_shape", "Choose an exact amendment target.");
      const s = snapshot().state!,
        r = s.records.find(
          (r) =>
            r.id === intent.target!.recordId &&
            r.hash === intent.target!.recordHash,
        );
      if (
        !r ||
        s.records.some((other) => other.previousId === r.id) ||
        r.criteriaId !== criteria.id ||
        r.criteriaHash !== criteria.hash
      )
        learningStoreFail(
          "stale_record",
          "Amend only the exact current record of this criteria series.",
        );
    }
    return criteria;
  }
  async function makePreview(
    source: CourseSnapshotInput,
    intent: CaptureIntent,
    b: LearningCellBinding,
    extra:
      | { courseStore: CourseProgressStore; course: CourseCaptureReadBinding }
      | {
          raw: { raw: string | Uint8Array; assert(): void };
          byteLength: number;
        },
    assert: () => void,
  ) {
    const criteria = criteriaFor(intent),
      inputHash = await hashLearningValue(source.input, digest);
    assert();
    cell.assertMemory(b);
    const evaluation = evaluateCourseProgress(source.input, criteria);
    return cell.exclusive(async () => {
      assert();
      cell.requireWrite();
      cell.assertMemory(b);
      criteriaFor(intent);
      cell.assertDisk(b.raw);
      const common = {
        intent,
        source,
        inputHash,
        evaluation,
        expectedGeneration: b.generation,
        expectedStateHash: b.hash!,
        expectedRevision: snapshot().state!.revision,
        expectedObservedRawHash: learningRawHash(b.raw),
      };
      const p = freezeLearningStoreValue(
        "course" in extra
          ? {
              ...common,
              format: "charitology-live-course-capture",
              version: 1,
              kind: "live",
              course: extra.course,
            }
          : {
              ...common,
              format: "charitology-file-course-capture",
              version: 1,
              kind: "file",
              sourceByteLength: extra.byteLength,
            },
      ) as LiveCourseCapturePreview | FileCourseCapturePreview;
      captures.set(p, {
        binding: b,
        preview: p,
        stamp: canonicalLearningJson(p),
        courseStore: "courseStore" in extra ? extra.courseStore : null,
        raw: "raw" in extra ? extra.raw : null,
      });
      return p;
    });
  }
  async function recoveryPreview(
    kind: "restore" | "clear",
    input: LearningPortfolioState,
    assert: () => void,
    b: LearningCellBinding,
  ) {
    cell.requireRecover();
    const c = await cell.checked(input);
    assert();
    cell.assertMemory(b);
    return cell.exclusive(async () => {
      assert();
      const baseline = cell.previewBaseline(b);
      const p = freezeLearningStoreValue({
        format: "charitology-learning-recovery-preview",
        version: 1,
        kind,
        state: c.state,
        stateHash: c.hash,
        expectedGeneration: b.generation,
        expectedStateHash: b.hash,
        expectedRevision: snapshot().state?.revision ?? null,
        expectedObservedRawHash: learningRawHash(baseline.raw),
      }) as LearningRecoveryPreview;
      recovery.set(p, {
        candidate: c,
        binding: baseline,
        kind,
        stamp: canonicalLearningJson(p),
      });
      return p;
    });
  }
  function applyRecovery(
    p: LearningRecoveryPreview,
    kind: "restore" | "clear",
  ) {
    cell.requireRecover();
    const saved = recovery.get(p);
    if (!saved || saved.kind !== kind)
      learningStoreFail(
        "preview_required",
        "Review a fresh replacement in this portfolio view.",
      );
    recovery.delete(p);
    return cell.exclusive(async () => {
      if (canonicalLearningJson(p) !== saved.stamp)
        learningStoreFail(
          "preview_changed",
          "The replacement preview changed.",
        );
      cell.assertMemory(saved.binding);
      cell.assertDisk(saved.binding.raw);
      const c = await cell.checked(saved.candidate.state);
      cell.assertMemory(saved.binding);
      cell.assertDisk(saved.binding.raw);
      if (c.hash !== saved.candidate.hash)
        learningStoreFail(
          "preview_changed",
          "The replacement candidate changed.",
        );
      cell.assign(c, kind === "clear" ? "remove" : "write", true);
      return snapshot();
    });
  }
  function capture(
    p: LiveCourseCapturePreview | FileCourseCapturePreview,
    options: CaptureCommitOptions,
    kind: "live" | "file",
  ) {
    const opt = optionsBinding(options);
    cell.requireWrite();
    const saved = captures.get(p);
    if (!saved || saved.preview.kind !== kind)
      learningStoreFail(
        "capture_required",
        "Review a fresh capture in this portfolio view.",
      );
    if (canonicalLearningJson(p) !== saved.stamp)
      learningStoreFail("preview_changed", "The capture preview changed.");
    captures.delete(p);
    const final = async (lease: CourseCaptureReadLease | null) => {
      return cell.exclusive(async () => {
        const assert = () => {
          opt.assert();
          saved.raw?.assert();
          if (canonicalLearningJson(p) !== saved.stamp)
            learningStoreFail("preview_changed", "The capture changed.");
          cell.requireWrite();
          cell.assertMemory(saved.binding);
          cell.assertDisk(saved.binding.raw);
          lease?.assertCurrent();
        };
        assert();
        criteriaFor(p.intent);
        if (p.intent.target === null && opt.reason !== null)
          learningStoreFail(
            "reason_shape",
            "A new series has no amendment reason.",
          );
        const source = p.source;
        const command =
          p.intent.target === null
            ? {
                kind: "record.capture" as const,
                criteriaId: p.intent.criteriaId,
                criteriaHash: p.intent.criteriaHash,
                source,
                criteriaAffirmed: true as const,
              }
            : {
                kind: "record.amend" as const,
                criteriaId: p.intent.criteriaId,
                criteriaHash: p.intent.criteriaHash,
                expectedRecordId: p.intent.target.recordId,
                expectedRecordHash: p.intent.target.recordHash,
                source,
                criteriaAffirmed: true as const,
                reason: opt.reason!,
              };
        const before = snapshot();
        const prepared = await prepareLearningCommand(before.state!, command, {
          expectedStateHash: before.hash!,
          expectedRevision: before.state!.revision,
          at: opt.at,
          makeId: opt.makeId,
          knownCriteria: known,
          digest,
        });
        assert();
        const c = await cell.checked(prepared.candidate);
        assert();
        if (
          c.hash !== prepared.candidateHash ||
          prepared.expectedStateHash !== saved.binding.hash ||
          prepared.expectedRevision !== before.state!.revision
        )
          learningStoreFail(
            "candidate_hash",
            "The capture candidate does not match its complete contents.",
          );
        if (prepared.noOp && c.hash !== before.hash)
          learningStoreFail(
            "invalid_noop",
            "A no-op cannot replace portfolio contents.",
          );
        if (!prepared.noOp && c.state.revision !== before.state!.revision + 1)
          learningStoreFail(
            "candidate_revision",
            "A capture advances the portfolio exactly once.",
          );
        if (opt.guard.constructor.name === "AsyncFunction")
          learningStoreFail(
            "async_ui_guard",
            "The controller guard must be synchronous.",
          );
        const result = opt.guard();
        if (result !== undefined) {
          if (
            result &&
            typeof (result as unknown as { then?: unknown }).then === "function"
          )
            void Promise.resolve(result).catch(() => {});
          learningStoreFail(
            "async_ui_guard",
            "The controller guard must return undefined synchronously.",
          );
        }
        // No await/callback between the final authority checks and candidate assignment/write.
        opt.assert();
        saved.raw?.assert();
        lease?.assertCurrent();
        cell.requireWrite();
        cell.assertMemory(saved.binding);
        cell.assertDisk(saved.binding.raw);
        if (!prepared.noOp) cell.assign(c, "write", true);
        return snapshot();
      });
    };
    return kind === "live"
      ? withCourseCaptureRead(
          saved.courseStore!,
          (p as LiveCourseCapturePreview).course,
          (lease) => final(lease),
        )
      : final(null);
  }
  return {
    snapshot,
    commitPrepared(prepared) {
      const w = watchLearningValue(prepared);
      cell.requireWrite();
      const b = cell.bind();
      return cell.exclusive(async () => {
        w.assert();
        cell.requireWrite();
        cell.assertMemory(b);
        cell.assertDisk(b.raw);
        const input = w.value,
          current = snapshot().state!;
        if (
          input.format !== "charitology-learning-mutation" ||
          input.version !== 1 ||
          input.commandKind !== "draft.replace" ||
          input.expectedStateHash !== b.hash ||
          input.expectedRevision !== current.revision ||
          typeof input.noOp !== "boolean"
        )
          learningStoreFail(
            "stale_prepared",
            "Only an exact prepared draft replacement may use this path.",
          );
        const c = await cell.checked(input.candidate);
        w.assert();
        cell.assertMemory(b);
        cell.assertDisk(b.raw);
        if (c.hash !== input.candidateHash)
          learningStoreFail(
            "candidate_hash",
            "The prepared candidate hash is invalid.",
          );
        const protectedFields = (s: LearningPortfolioState) => ({
          format: s.format,
          version: s.version,
          id: s.id,
          createdAt: s.createdAt,
          criteria: s.criteria,
          records: s.records,
        });
        if (
          canonicalLearningJson(protectedFields(c.state)) !==
          canonicalLearningJson(protectedFields(current))
        )
          learningStoreFail(
            "protected_records",
            "Record/criteria changes require a reviewed course/file capture.",
          );
        const derived = await prepareLearningCommand(
          current,
          { kind: "draft.replace", draft: c.state.draft },
          {
            expectedStateHash: b.hash!,
            expectedRevision: current.revision,
            at: c.state.updatedAt,
            makeId: () =>
              learningStoreFail(
                "unexpected_id",
                "A draft command cannot allocate record IDs.",
              ),
            knownCriteria: known,
            digest,
          },
        );
        w.assert();
        cell.assertMemory(b);
        cell.assertDisk(b.raw);
        if (canonicalLearningJson(input) !== canonicalLearningJson(derived))
          learningStoreFail(
            "draft_semantics",
            "Use the exact model-prepared draft replacement; metadata alone is not a mutation.",
          );
        if (input.noOp) {
          if (c.hash !== b.hash)
            learningStoreFail("invalid_noop", "A no-op cannot replace state.");
          return snapshot();
        }
        if (c.state.revision !== current.revision + 1)
          learningStoreFail(
            "candidate_revision",
            "A draft replacement advances revision exactly once.",
          );
        w.assert();
        cell.assign(c, "write", true);
        return snapshot();
      });
    },
    retryPersist: () => cell.retryPersist() as Promise<LearningStoreSnapshot>,
    async previewRestore(raw) {
      const w = ownLearningRaw(raw, LEARNING_LIMITS.backupBytes);
      cell.requireRecover();
      const b = cell.bind();
      const state = await parseLearningBackup(w.raw, known, digest);
      w.assert();
      cell.assertMemory(b);
      return recoveryPreview(
        "restore",
        state,
        w.assert,
        b,
      ) as Promise<LearningRestorePreview>;
    },
    restore: (p) => applyRecovery(p, "restore"),
    previewClear(blank) {
      const w = watchLearningValue(blank);
      cell.requireRecover();
      const b = cell.bind();
      if (
        canonicalLearningJson(w.value) !==
        canonicalLearningJson(
          blankLearningPortfolio(w.value.id, w.value.createdAt),
        )
      )
        learningStoreFail(
          "blank_required",
          "Clear requires an exact new empty portfolio.",
        );
      return recoveryPreview(
        "clear",
        w.value,
        w.assert,
        b,
      ) as Promise<LearningClearPreview>;
    },
    clear: (p) => applyRecovery(p, "clear"),
    undo: () => cell.undo() as Promise<LearningStoreSnapshot>,
    reload: (o) => cell.reload(o) as Promise<LearningStoreSnapshot>,
    noticeExternalChange: () =>
      cell.noticeExternalChange() as LearningStoreSnapshot,
    async backup(exportedAt) {
      const s = snapshot();
      if (!s.state)
        learningStoreFail(
          "backup_unavailable",
          "No valid portfolio is available; download protected raw bytes.",
        );
      return makeLearningBackup(s.state, exportedAt, known, digest);
    },
    rawSavedCopy: () => cell.rawSavedCopy(),
    async previewCourseCapture(courseStore, intent) {
      const wi = watchLearningValue(intent, 8192);
      cell.requireWrite();
      const b = cell.bind(),
        read = courseStore.previewCaptureRead;
      if (typeof read !== "function")
        learningStoreFail(
          "foreign_store",
          "Choose an actual guarded course view.",
        );
      const course = await read.call(courseStore);
      wi.assert();
      if (courseStore.previewCaptureRead !== read)
        learningStoreFail("input_changed", "The selected course view changed.");
      cell.assertMemory(b);
      const source: CourseSnapshotInput = {
        input: course.input,
        origin: {
          kind: "course-memory",
          persistence: course.persistence,
          rawHash:
            course.persistence === "saved" ? course.observedRawHash : null,
          fileName: null,
          declaredCompletedAt: course.input.completedAt,
          historicalCriteria: "unknown",
        },
      };
      return makePreview(source, wi.value, b, { courseStore, course }, () => {
        wi.assert();
        if (courseStore.previewCaptureRead !== read)
          learningStoreFail(
            "input_changed",
            "The selected course view changed.",
          );
      }) as Promise<LiveCourseCapturePreview>;
    },
    commitCourseCapture: (p, o) => capture(p, o, "live"),
    async previewFileCapture(raw, fileName, intent) {
      const w = ownLearningRaw(raw, LEARNING_LIMITS.courseBytes),
        wi = watchLearningValue(intent, 8192);
      if (
        typeof fileName !== "string" ||
        fileName.length < 1 ||
        fileName.length > 255 ||
        /[\\/\u0000-\u001f\u007f]/.test(fileName) ||
        fileName === "." ||
        fileName === ".."
      )
        learningStoreFail("filename", "Choose a safe source filename.");
      cell.requireWrite();
      const b = cell.bind(),
        parsed = await parseCourseProgressExport(w.raw, digest);
      w.assert();
      wi.assert();
      cell.assertMemory(b);
      const source: CourseSnapshotInput = {
        input: parsed.input,
        origin: {
          kind: "course-file",
          persistence: "selected-file",
          rawHash: parsed.rawHash,
          fileName,
          declaredCompletedAt: parsed.input.completedAt,
          historicalCriteria: "unknown",
        },
      };
      return makePreview(
        source,
        wi.value,
        b,
        {
          raw: w,
          byteLength:
            typeof w.raw === "string"
              ? new TextEncoder().encode(w.raw).byteLength
              : w.raw.byteLength,
        },
        () => {
          w.assert();
          wi.assert();
        },
      ) as Promise<FileCourseCapturePreview>;
    },
    commitFileCapture: (p, o) => capture(p, o, "file"),
    dispose() {
      cell.dispose();
    },
  };
}
