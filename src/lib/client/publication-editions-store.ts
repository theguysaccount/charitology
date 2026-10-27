/** One owned proposal cell; no legacy-key construction or browser research qualification. */
import {
  createLearningCell,
  watchLearningValue,
  ownLearningRaw,
  learningRawHash,
  freezeLearningStoreValue,
  type LearningCell,
  type LearningCellBinding,
  type LearningCellCandidate,
} from "./course-progress-store";
import {
  canonicalPublicationProposalJson,
  blankPublicationProposals,
  validateProposalCatalog,
  validatePublicationProposalState,
  preparePublicationProposalCommand,
  publicationProposalStateHash,
  makePublicationProposalBackup,
  parsePublicationProposalBackup,
  PUBLICATION_PROPOSAL_LIMITS,
  proposalFail,
} from "./publication-editions-model";
import type {
  ProposalState,
  ProposalCatalog,
  ProposalDigest,
  ProposalCommand,
  PreparedProposalMutation,
  Hash,
  Id,
  Instant,
} from "../publication-editions-types";
export type * from "../publication-editions-types";
export type ProposalStoreCode =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
export interface ProposalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface ProposalLocks {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    action: () => Promise<T>,
  ): Promise<T>;
}
export interface ProposalStoreSnapshot {
  readonly state: ProposalState | null;
  readonly hash: Hash | null;
  readonly generation: number;
  readonly observedRaw: string | null | undefined;
  readonly unsaved: boolean;
  readonly blocked: string;
  readonly message: string;
  readonly code: ProposalStoreCode;
  readonly readOnly: boolean;
  readonly canWrite: boolean;
  readonly canRecover: boolean;
  readonly canRetryPersist: boolean;
  readonly canUndo: boolean;
}
export interface ProposalStoreOptions {
  initialState: ProposalState; // exact blank; used only for actual absent key
  knownCatalog: ProposalCatalog; // detached, validated and fixed for this instance
  storage?: ProposalStorage;
  locks?: ProposalLocks | null;
  cryptoAvailable?: boolean;
  digest?: ProposalDigest;
}
export interface ProposalMutationBinding {
  expectedGeneration: number;
  expectedStateHash: Hash;
  expectedRevision: number;
}
export interface ProposalPrepareOptions {
  at: Instant;
  makeId(): Id;
}
export interface ProposalCommitOptions {
  assertUiCurrent(): undefined; // synchronous exact form/selection epoch check
}
export interface ProposalReloadOptions {
  discardUnsaved?: boolean; // sole allowed key; snapshot before queuing
}
declare const PROPOSAL_PREPARED_OWNER: unique symbol;
export interface OwnedProposalPrepared {
  readonly format: "charitology-publication-proposal-prepared";
  readonly version: 1;
  readonly mutation: PreparedProposalMutation;
  readonly expectedGeneration: number;
  readonly expectedObservedRawHash: Hash | null;
  readonly [PROPOSAL_PREPARED_OWNER]: true;
}
declare const PROPOSAL_RECOVERY_OWNER: unique symbol;
export interface ProposalRecoveryPreview {
  readonly format: "charitology-publication-proposal-recovery-preview";
  readonly version: 1;
  readonly kind: "restore" | "clear";
  readonly state: ProposalState;
  readonly stateHash: Hash;
  readonly expectedGeneration: number;
  readonly expectedStateHash: Hash | null;
  readonly expectedRevision: number | null;
  readonly expectedObservedRawHash: Hash | null;
  readonly [PROPOSAL_RECOVERY_OWNER]: true;
}
export type ProposalRestorePreview = ProposalRecoveryPreview & {
  readonly kind: "restore";
};
export type ProposalClearPreview = ProposalRecoveryPreview & {
  readonly kind: "clear";
};
export interface PublicationProposalStore {
  snapshot(): ProposalStoreSnapshot;
  prepareCommand(
    command: ProposalCommand,
    binding: ProposalMutationBinding,
    options: ProposalPrepareOptions,
  ): Promise<OwnedProposalPrepared>;
  commitPrepared(
    prepared: OwnedProposalPrepared,
    options: ProposalCommitOptions,
  ): Promise<ProposalStoreSnapshot>;
  retryPersist(): Promise<ProposalStoreSnapshot>;
  previewRestore(raw: string | Uint8Array): Promise<ProposalRestorePreview>;
  restore(preview: ProposalRestorePreview): Promise<ProposalStoreSnapshot>;
  previewClear(blank: ProposalState): Promise<ProposalClearPreview>;
  clear(preview: ProposalClearPreview): Promise<ProposalStoreSnapshot>;
  undo(): Promise<ProposalStoreSnapshot>;
  reload(options?: ProposalReloadOptions): Promise<ProposalStoreSnapshot>;
  noticeExternalChange(): ProposalStoreSnapshot;
  backup(exportedAt: Instant): Promise<string>;
  rawSavedCopy(): string | null | undefined;
  dispose(): void;
}

export const PUBLICATION_PROPOSAL_STORAGE_KEY =
  "charitology.publication-editions.v1" as const;
export const PUBLICATION_PROPOSAL_LOCK_NAME = PUBLICATION_PROPOSAL_STORAGE_KEY;
const same = (a: unknown, b: unknown) =>
  canonicalPublicationProposalJson(a) === canonicalPublicationProposalJson(b);
function functionOptions<T extends Record<string, unknown>>(
  value: T,
  names: string[],
  functions: string[],
) {
  const read = () => {
    if (
      !value ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== names.length ||
      Reflect.ownKeys(value).some(
        (k) => typeof k !== "string" || !names.includes(k),
      )
    )
      proposalFail("options_shape", "Use the exact explicit command options.");
    const d = Object.getOwnPropertyDescriptors(value);
    if (names.some((k) => !("value" in d[k])))
      proposalFail("options_shape", "Options cannot contain accessors.");
    const data: Record<string, unknown> = {};
    for (const n of names) if (!functions.includes(n)) data[n] = d[n].value;
    for (const n of functions)
      if (typeof d[n].value !== "function")
        proposalFail("options_shape", "Use synchronous command functions.");
    return { d, data };
  };
  const first = read(),
    w = watchLearningValue(first.data, 8192),
    refs = Object.fromEntries(functions.map((n) => [n, first.d[n].value]));
  return {
    data: w.value,
    refs,
    assert() {
      const current = read();
      if (
        !same(current.data, w.value) ||
        functions.some((n) => current.d[n].value !== refs[n])
      )
        proposalFail("input_changed", "Command options changed while pending.");
    },
  };
}
export async function createPublicationProposalStore(
  options: ProposalStoreOptions,
): Promise<PublicationProposalStore> {
  const known = validateProposalCatalog(
      watchLearningValue(options.knownCatalog, 1_048_576).value,
    ),
    initial = watchLearningValue(options.initialState).value,
    digest = options.digest;
  if (!same(initial, blankPublicationProposals(initial.id, initial.createdAt)))
    proposalFail(
      "blank_required",
      "Initial memory must be the exact blank workspace; saved data is loaded separately.",
    );
  const checked = async (value: unknown) => {
    const state = validatePublicationProposalState(value, known);
    await makePublicationProposalBackup(state, state.updatedAt, known, digest);
    const hash = await publicationProposalStateHash(state, digest);
    return { state, hash, raw: canonicalPublicationProposalJson(state) };
  };
  const cell: LearningCell<ProposalState> = await createLearningCell({
    ...options,
    key: PUBLICATION_PROPOSAL_STORAGE_KEY,
    initialState: initial,
    limit: PUBLICATION_PROPOSAL_LIMITS.backupBytes,
    checked,
    dirty: (s) => s.draft.dirty,
  });
  let guardRunning = false;
  const active = () => {
    if (guardRunning)
      proposalFail(
        "reentrant_guard",
        "A final controller guard cannot reenter store actions.",
      );
  };
  const snapshot = () => cell.snapshot() as ProposalStoreSnapshot;
  type Saved = {
    binding: LearningCellBinding;
    mutation: PreparedProposalMutation;
    stamp: string;
    command: ProposalCommand;
  };
  const prepared = new WeakMap<object, Saved>();
  const recovery = new WeakMap<
    object,
    {
      candidate: LearningCellCandidate<ProposalState>;
      binding: LearningCellBinding;
      kind: "restore" | "clear";
      stamp: string;
    }
  >();
  const checkBinding = (
    binding: ProposalMutationBinding,
    b: LearningCellBinding,
  ) => {
    if (
      Object.keys(binding).sort().join(",") !==
        "expectedGeneration,expectedRevision,expectedStateHash" ||
      binding.expectedGeneration !== b.generation ||
      binding.expectedStateHash !== b.hash ||
      binding.expectedRevision !== snapshot().state?.revision
    )
      proposalFail(
        "stale_memory",
        "Review this exact current workspace generation/revision.",
      );
  };
  async function recoveryPreview(
    kind: "restore" | "clear",
    input: ProposalState,
    assert: () => void,
    b: LearningCellBinding,
  ) {
    const c = await cell.checked(input);
    assert();
    cell.assertMemory(b);
    return cell.exclusive(async () => {
      assert();
      cell.requireRecover();
      const baseline = cell.previewBaseline(b);
      const p = freezeLearningStoreValue({
        format: "charitology-publication-proposal-recovery-preview",
        version: 1,
        kind,
        state: c.state,
        stateHash: c.hash,
        expectedGeneration: b.generation,
        expectedStateHash: b.hash,
        expectedRevision: snapshot().state?.revision ?? null,
        expectedObservedRawHash: learningRawHash(baseline.raw),
      }) as ProposalRecoveryPreview;
      recovery.set(p, {
        candidate: c,
        binding: baseline,
        kind,
        stamp: canonicalPublicationProposalJson(p),
      });
      return p;
    });
  }
  function applyRecovery(
    p: ProposalRecoveryPreview,
    kind: "restore" | "clear",
  ) {
    active();
    cell.requireRecover();
    const saved = recovery.get(p);
    if (!saved || saved.kind !== kind)
      proposalFail(
        "preview_required",
        "Review a fresh replacement in this view.",
      );
    recovery.delete(p);
    return cell.exclusive(async () => {
      if (canonicalPublicationProposalJson(p) !== saved.stamp)
        proposalFail("preview_changed", "Replacement preview changed.");
      cell.assertMemory(saved.binding);
      cell.assertDisk(saved.binding.raw);
      const c = await cell.checked(saved.candidate.state);
      cell.assertMemory(saved.binding);
      cell.assertDisk(saved.binding.raw);
      if (c.hash !== saved.candidate.hash)
        proposalFail("candidate_hash", "Replacement contents changed.");
      cell.assign(c, kind === "clear" ? "remove" : "write", true);
      return snapshot();
    });
  }
  return {
    snapshot,
    async prepareCommand(command, binding, options) {
      active();
      const cmd = watchLearningValue(command),
        wb = watchLearningValue(binding, 8192),
        opt = functionOptions(
          options as unknown as Record<string, unknown>,
          ["at", "makeId"],
          ["makeId"],
        );
      cell.requireWrite();
      const b = cell.bind();
      checkBinding(wb.value, b);
      return cell.exclusive(async () => {
        const assert = () => {
          cmd.assert();
          wb.assert();
          opt.assert();
          cell.requireWrite();
          cell.assertMemory(b);
          checkBinding(wb.value, b);
          cell.assertDisk(b.raw);
        };
        assert();
        const mutation = await preparePublicationProposalCommand(
          snapshot().state!,
          cmd.value,
          {
            expectedStateHash: b.hash!,
            expectedRevision: snapshot().state!.revision,
            at: opt.data.at as Instant,
            makeId: opt.refs.makeId as () => Id,
            knownCatalog: known,
            digest,
          },
        );
        assert();
        const c = await cell.checked(mutation.candidate);
        assert();
        if (c.hash !== mutation.candidateHash)
          proposalFail(
            "candidate_hash",
            "Prepared contents differ from full candidate.",
          );
        const p = freezeLearningStoreValue({
          format: "charitology-publication-proposal-prepared",
          version: 1,
          mutation,
          expectedGeneration: b.generation,
          expectedObservedRawHash: learningRawHash(b.raw),
        }) as OwnedProposalPrepared;
        prepared.set(p, {
          binding: b,
          mutation,
          command: cmd.value,
          stamp: canonicalPublicationProposalJson(p),
        });
        return p;
      });
    },
    commitPrepared(p, options) {
      active();
      const opt = functionOptions(
        options as unknown as Record<string, unknown>,
        ["assertUiCurrent"],
        ["assertUiCurrent"],
      );
      cell.requireWrite();
      const saved = prepared.get(p);
      if (!saved)
        proposalFail(
          "prepared_required",
          "Use a fresh prepared command issued by this exact view.",
        );
      prepared.delete(p);
      return cell.exclusive(async () => {
        const assert = () => {
          opt.assert();
          cell.requireWrite();
          cell.assertMemory(saved.binding);
          cell.assertDisk(saved.binding.raw);
          if (canonicalPublicationProposalJson(p) !== saved.stamp)
            proposalFail("prepared_changed", "Prepared review changed.");
        };
        assert();
        const m = saved.mutation;
        if (
          m.catalogHash !== known.hash ||
          m.expectedStateHash !== saved.binding.hash ||
          m.expectedRevision !== snapshot().state!.revision
        )
          proposalFail("stale_prepared", "Prepared command is stale.");
        const c = await cell.checked(m.candidate);
        assert();
        if (c.hash !== m.candidateHash)
          proposalFail("candidate_hash", "Prepared candidate hash differs.");
        if (m.noOp && c.hash !== saved.binding.hash)
          proposalFail("invalid_noop", "A no-op cannot replace memory.");
        if (!m.noOp && c.state.revision !== snapshot().state!.revision + 1)
          proposalFail(
            "candidate_revision",
            "A command advances revision exactly once.",
          );
        const guard = opt.refs.assertUiCurrent as () => unknown;
        if (guard.constructor.name === "AsyncFunction")
          proposalFail("async_ui_guard", "Use a synchronous controller guard.");
        let result: unknown;
        guardRunning = true;
        try {
          result = guard();
        } finally {
          guardRunning = false;
        }
        if (result !== undefined) {
          if (
            result &&
            typeof (result as { then?: unknown }).then === "function"
          )
            void Promise.resolve(result).catch(() => {});
          proposalFail(
            "async_ui_guard",
            "Controller guard must return undefined synchronously.",
          );
        }
        assert();
        if (!m.noOp) cell.assign(c, "write", true);
        return snapshot();
      });
    },
    retryPersist() {
      active();
      return cell.retryPersist() as Promise<ProposalStoreSnapshot>;
    },
    async previewRestore(raw) {
      active();
      const w = ownLearningRaw(raw, PUBLICATION_PROPOSAL_LIMITS.backupBytes);
      cell.requireRecover();
      const b = cell.bind();
      const state = await parsePublicationProposalBackup(w.raw, known, digest);
      w.assert();
      cell.assertMemory(b);
      return recoveryPreview(
        "restore",
        state,
        w.assert,
        b,
      ) as Promise<ProposalRestorePreview>;
    },
    restore: (p) => applyRecovery(p, "restore"),
    previewClear(blank) {
      active();
      const w = watchLearningValue(blank);
      cell.requireRecover();
      const b = cell.bind();
      if (
        !same(w.value, blankPublicationProposals(w.value.id, w.value.createdAt))
      )
        proposalFail(
          "blank_required",
          "Clear requires an exact new blank workspace.",
        );
      return recoveryPreview(
        "clear",
        w.value,
        w.assert,
        b,
      ) as Promise<ProposalClearPreview>;
    },
    clear: (p) => applyRecovery(p, "clear"),
    undo() {
      active();
      return cell.undo() as Promise<ProposalStoreSnapshot>;
    },
    reload(o) {
      active();
      return cell.reload(o) as Promise<ProposalStoreSnapshot>;
    },
    noticeExternalChange() {
      active();
      return cell.noticeExternalChange() as ProposalStoreSnapshot;
    },
    async backup(exportedAt) {
      active();
      const s = snapshot();
      if (!s.state)
        proposalFail(
          "backup_unavailable",
          "No valid current state is available; copy protected raw data.",
        );
      return makePublicationProposalBackup(s.state, exportedAt, known, digest);
    },
    rawSavedCopy: () => cell.rawSavedCopy(),
    dispose() {
      active();
      cell.dispose();
    },
  };
}
