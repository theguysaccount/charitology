/** Explicit local JSON/file checksum bridge. It never reads storage or uploads. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  ARTIFACT_LIMITS,
  artifactFail,
  artifactPlain,
  exactArtifactObject,
  artifactText,
  artifactHash,
  artifactClone,
  artifactFreeze,
  canonicalArtifactJson,
  hashArtifactSync,
  artifactStateHash,
  validateArtifactState,
  validateArtifactValues,
  adapterForProgram,
  legacyArtifactInstant,
  artifactInstant,
  appendArtifactProtocol,
  artifactBackupBytes,
  type Id,
  type Hash,
  type Instant,
  type Program,
  type Adapter,
  type LegacyExport,
  type Origin,
  type ProtocolContent,
  type ArtifactState,
  type ArtifactIssue,
} from "./artifact-results-model";

export interface ProtocolImportInput {
  kind: "legacy-research-json";
  bytes: Uint8Array;
  fileName: string;
  program: Program;
  selectedRecordIds: string[];
}
export interface ProtocolImportRow {
  recordId: string;
  title: string;
  origin: Origin;
  content: ProtocolContent;
  existingProtocolId: Id | null;
  existingProjectId: Id | null;
  changedSourceProjectIds: Id[];
  issues: ArtifactIssue[];
}
export interface ProtocolImportPreview {
  version: 1;
  expectedStateHash: Hash;
  sourceFileHash: Hash;
  reviewHash: Hash;
  input: ProtocolImportInput;
  adapterId: string;
  adapterHash: Hash;
  rows: ProtocolImportRow[];
  ignoredDraft: boolean;
  capacity: {
    projectsAfterMinimum: number;
    protocolsAfter: number;
    backupBytesMinimum: number;
  };
}
export type ImportAssignment = {
  recordId: string;
  target:
    | { kind: "new" }
    | {
        kind: "amend";
        projectId: Id;
        expectedProtocolId: Id;
        expectedProtocolHash: Hash;
        reason: string;
      };
};
const rawHash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
function bytesCheck(
  bytes: unknown,
  max: number,
  code: string,
): asserts bytes is Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length > max)
    artifactFail(
      code,
      `Choose actual local file bytes no larger than ${max} bytes.`,
    );
}
function legacyId(v: unknown, path: string): asserts v is string {
  artifactText(v, 100, path);
  if (/[\u0000-\u001f\u007f]/.test(v as string))
    artifactFail(
      "legacy_id",
      "Legacy record identity contains control characters.",
      path,
    );
}
function inputStamp(input: ProtocolImportInput): unknown {
  if (!artifactPlain(input))
    artifactFail("import", "Choose an explicit legacy file import.");
  bytesCheck(input.bytes, ARTIFACT_LIMITS.legacyBytes, "legacy_limit");
  return {
    ...input,
    bytes: { length: input.bytes.length, hash: rawHash(input.bytes) },
  };
}
export function readLegacyResearchExport(
  bytes: Uint8Array,
  program: Program,
): { export: LegacyExport; adapter: Adapter } {
  bytesCheck(bytes, ARTIFACT_LIMITS.legacyBytes, "legacy_limit");
  const adapter = adapterForProgram(program);
  let data: unknown;
  try {
    let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice());
    if (text.startsWith("\uFEFF")) text = text.slice(1);
    data = JSON.parse(text);
  } catch {
    artifactFail(
      "legacy_json",
      "The chosen file must contain valid UTF-8 legacy JSON.",
    );
  }
  exactArtifactObject(
    data,
    ["version", "program", "records", "draft", "editing"],
    "legacy",
  );
  if (data.version !== 1 || data.program !== program)
    artifactFail(
      "legacy_program",
      "Choose a version 1 JSON export for this program.",
    );
  if (!Array.isArray(data.records) || data.records.length > 200)
    artifactFail(
      "legacy_limit",
      "Legacy export holds at most 200 saved records.",
    );
  const ids = new Set<string>();
  for (const r of data.records) {
    exactArtifactObject(
      r,
      ["id", "createdAt", "updatedAt", "values"],
      "legacy.record",
    );
    legacyId(r.id, "legacy.record.id");
    if (ids.has(r.id))
      artifactFail("duplicate_id", "Legacy saved record IDs must be unique.");
    ids.add(r.id);
    legacyArtifactInstant(r.createdAt, "legacy.createdAt");
    legacyArtifactInstant(r.updatedAt, "legacy.updatedAt");
    validateArtifactValues(r.values, adapter);
  }
  validateArtifactValues(data.draft, adapter, false);
  if (data.editing !== null) {
    legacyId(data.editing, "legacy.editing");
    if (!ids.has(data.editing))
      artifactFail(
        "legacy_editing",
        "Editing must identify a saved source record.",
      );
  }
  return { export: artifactClone(data) as unknown as LegacyExport, adapter };
}
function previewBasis(
  preview: Omit<ProtocolImportPreview, "reviewHash"> | ProtocolImportPreview,
): unknown {
  const { reviewHash, ...other } = preview as ProtocolImportPreview;
  return { ...other, input: inputStamp(preview.input) };
}
export async function previewProtocolImport(
  state: ArtifactState,
  input: ProtocolImportInput,
  expectedStateHash: Hash,
): Promise<ProtocolImportPreview> {
  const inputJson = canonicalArtifactJson(inputStamp(input)),
    stateJson = canonicalArtifactJson(state);
  artifactHash(expectedStateHash, "expectedStateHash");
  exactArtifactObject(
    input,
    ["kind", "bytes", "fileName", "program", "selectedRecordIds"],
    "import",
  );
  if (input.kind !== "legacy-research-json")
    artifactFail("import", "Choose a deliberate legacy research JSON file.");
  artifactText(input.fileName, 200, "fileName");
  if (
    !Array.isArray(input.selectedRecordIds) ||
    input.selectedRecordIds.length < 1 ||
    input.selectedRecordIds.length > 20 ||
    new Set(input.selectedRecordIds).size !== input.selectedRecordIds.length
  )
    artifactFail("selection", "Choose 1–20 unique saved source records.");
  input.selectedRecordIds.forEach((x) => legacyId(x, "selectedRecordId"));
  const copied = artifactClone(input),
    valid = await validateArtifactState(state);
  if ((await artifactStateHash(valid)) !== expectedStateHash)
    artifactFail("stale_state", "Read the current register before previewing.");
  const parsed = readLegacyResearchExport(copied.bytes, copied.program),
    sourceFileHash = rawHash(copied.bytes),
    a = parsed.adapter;
  const rows: ProtocolImportRow[] = copied.selectedRecordIds.map((recordId) => {
    const r = parsed.export.records.find((r) => r.id === recordId);
    if (!r) artifactFail("selection", "A selected saved record is missing.");
    const values = validateArtifactValues(r.values, a),
      snapshotHash = hashArtifactSync({
        program: a.program,
        adapterHash: a.hash,
        values,
      }),
      identityHash = hashArtifactSync({
        program: a.program,
        recordId,
        snapshotHash,
      });
    const existing = valid.protocols.find(
        (p) => p.origin?.identityHash === identityHash,
      ),
      changedSourceProjectIds = [
        ...new Set(
          valid.protocols
            .filter(
              (p) =>
                p.origin?.program === a.program &&
                p.origin.recordId === recordId &&
                p.origin.identityHash !== identityHash,
            )
            .map((p) => p.projectId),
        ),
      ].sort();
    return {
      recordId,
      title: values.title,
      origin: {
        program: a.program,
        recordId,
        adapterId: a.id,
        adapterHash: a.hash,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdAtUtc: legacyArtifactInstant(r.createdAt, "createdAt"),
        updatedAtUtc: legacyArtifactInstant(r.updatedAt, "updatedAt"),
        snapshotHash,
        identityHash,
        sourceFileHash,
      },
      content: {
        adapterId: a.id,
        adapterHash: a.hash,
        values,
        resultsKnown: "unknown",
        registration: null,
      },
      existingProtocolId: existing?.id ?? null,
      existingProjectId: existing?.projectId ?? null,
      changedSourceProjectIds,
      issues: [],
    };
  });
  const estimate = artifactClone(valid);
  let n = 0;
  const used = new Set([
    estimate.id,
    ...estimate.projects.map((x) => x.id),
    ...estimate.protocols.map((x) => x.id),
    ...estimate.manifests.map((x) => x.id),
    ...estimate.results.map((x) => x.id),
    ...estimate.comparisons.map((x) => x.id),
    ...estimate.packets.map((x) => x.id),
  ]);
  const newId = () => {
    let id: string;
    do {
      id = (++n).toString(36);
    } while (used.has(id));
    used.add(id);
    return id;
  };
  for (const row of rows)
    if (!row.existingProtocolId) {
      const target = estimate.projects.find((p) =>
          row.changedSourceProjectIds.includes(p.id),
        ),
        prev = target
          ? estimate.protocols.find((p) => p.id === target.currentProtocolId)
          : null;
      appendArtifactProtocol(
        estimate,
        row.content,
        row.origin,
        {
          projectId: target?.id ?? null,
          expectedProtocolId: prev?.id ?? null,
          expectedProtocolHash: prev?.hash ?? null,
          reason:
            "Import capacity estimate; actual assignments are reviewed separately.",
        },
        valid.updatedAt,
        newId,
      );
    }
  const p: Omit<ProtocolImportPreview, "reviewHash"> = {
    version: 1,
    expectedStateHash,
    sourceFileHash,
    input: copied,
    adapterId: a.id,
    adapterHash: a.hash,
    rows,
    ignoredDraft: Object.values(parsed.export.draft).some(Boolean),
    capacity: {
      projectsAfterMinimum: estimate.projects.length,
      protocolsAfter: estimate.protocols.length,
      backupBytesMinimum: artifactBackupBytes(estimate),
    },
  };
  const result = { ...p, reviewHash: hashArtifactSync(previewBasis(p)) };
  await artifactStateHash(valid);
  if (
    canonicalArtifactJson(inputStamp(input)) !== inputJson ||
    canonicalArtifactJson(state) !== stateJson
  )
    artifactFail(
      "input_changed",
      "Source input or workspace changed while previewing.",
    );
  return artifactFreeze(result);
}
export async function applyProtocolImport(
  s: ArtifactState,
  preview: ProtocolImportPreview,
  assignments: ImportAssignment[],
  context: { expectedStateHash: Hash; at: Instant; newId: () => Id },
): Promise<{ noOp: boolean; message: string }> {
  exactArtifactObject(
    preview,
    [
      "version",
      "expectedStateHash",
      "sourceFileHash",
      "reviewHash",
      "input",
      "adapterId",
      "adapterHash",
      "rows",
      "ignoredDraft",
      "capacity",
    ],
    "preview",
  );
  const fresh = await previewProtocolImport(
    s,
    preview.input,
    context.expectedStateHash,
  );
  if (
    preview.reviewHash !== fresh.reviewHash ||
    canonicalArtifactJson(previewBasis(preview)) !==
      canonicalArtifactJson(previewBasis(fresh))
  )
    artifactFail(
      "preview_changed",
      "Review the exact current file and selected records again.",
    );
  if (
    !Array.isArray(assignments) ||
    assignments.length !== fresh.rows.length ||
    new Set(assignments.map((x) => x.recordId)).size !== assignments.length
  )
    artifactFail(
      "assignment",
      "Every selected row needs exactly one assignment.",
    );
  const touched = new Set<Id>();
  let changed = 0;
  for (const row of fresh.rows) {
    const assignment = assignments.find((x) => x.recordId === row.recordId);
    if (!assignment)
      artifactFail("assignment", "A selected record assignment is missing.");
    exactArtifactObject(assignment, ["recordId", "target"], "assignment");
    const t = assignment.target;
    if (!artifactPlain(t))
      artifactFail("assignment", "Use an explicit new/amend assignment.");
    if (t.kind === "new") exactArtifactObject(t, ["kind"], "assignment.target");
    else {
      exactArtifactObject(
        t,
        [
          "kind",
          "projectId",
          "expectedProtocolId",
          "expectedProtocolHash",
          "reason",
        ],
        "assignment.target",
      );
      if (t.kind !== "amend")
        artifactFail("assignment", "Choose new or amend.");
      artifactText(t.reason, 2000, "assignment.reason");
    }
    if (row.existingProtocolId) continue;
    if (t.kind === "new" && row.changedSourceProjectIds.length)
      artifactFail(
        "amendment_required",
        "This saved source identity changed. Choose an exact current amendment target and reason.",
      );
    if (t.kind === "amend") {
      if (!row.changedSourceProjectIds.includes(t.projectId as string))
        artifactFail(
          "amendment_target",
          "Choose a project from this exact source lineage.",
        );
      if (touched.has(t.projectId as string))
        artifactFail(
          "amendment_batch",
          "Review one current amendment per project at a time.",
        );
      touched.add(t.projectId as string);
    }
    appendArtifactProtocol(
      s,
      row.content,
      row.origin,
      t.kind === "new"
        ? {
            projectId: null,
            expectedProtocolId: null,
            expectedProtocolHash: null,
            reason:
              "Imported saved local record; no independent registration claimed.",
          }
        : {
            projectId: t.projectId as Id,
            expectedProtocolId: t.expectedProtocolId as Id,
            expectedProtocolHash: t.expectedProtocolHash as Hash,
            reason: t.reason as string,
          },
      context.at,
      context.newId,
    );
    changed++;
  }
  return {
    noOp: changed === 0,
    message: changed
      ? "Selected saved plans were captured with exact provenance; source files and old keys were unchanged."
      : "These exact imported identities already exist. Current protocol selection and history were unchanged.",
  };
}
export async function hashSelectedArtifact(
  bytes: Uint8Array,
  at: Instant,
): Promise<{
  kind: "local-bytes";
  sha256: Hash;
  byteLength: number;
  hashedAt: Instant;
}> {
  bytesCheck(bytes, ARTIFACT_LIMITS.localFileBytes, "local_file_limit");
  artifactInstant(at, "hashedAt");
  const copied = bytes.slice(),
    before = rawHash(copied),
    digest = bytesToHex(
      new Uint8Array(await crypto.subtle.digest("SHA-256", copied.buffer)),
    );
  if (rawHash(bytes) !== before)
    artifactFail(
      "input_changed",
      "Selected local file bytes changed while hashing.",
    );
  return artifactFreeze({
    kind: "local-bytes",
    sha256: digest,
    byteLength: copied.length,
    hashedAt: at,
  });
}
