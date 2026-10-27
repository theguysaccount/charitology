/** Explicit whole-partner-v1 capture. No storage, DOM, network or legacy writes. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { PROGRAM_GRAPH_ADAPTERS } from "../../data/program-graph-adapters";
import {
  graphFail,
  exactGraphObject,
  graphText,
  graphId,
  graphHash,
  graphInstant,
  graphClone,
  graphFreeze,
  canonicalProgramGraphJson,
  hashProgramGraphSync,
  programGraphStateHash,
  validateProgramGraphState,
  type Program,
  type Hash,
  type Id,
  type Instant,
  type AdapterField,
  type ProgramGraphAdapter,
  type PartnerSource,
  type ProgramGraphState,
  type CaptureInput,
  type CapturePreview,
  type CaptureSelection,
  type NodeVersion,
  type GraphNode,
  type SourceCapture,
} from "./program-graph-model";

const SOURCE_BYTES = 8_000_000;
const rawHash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const enc = new TextEncoder();
const nativeByteLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  "byteLength",
)!.get!;
function ownBytes(value: unknown, maxBytes: number): Uint8Array {
  if (!(value instanceof Uint8Array) || nativeByteLength.call(value) > maxBytes)
    graphFail("byte_limit", `Choose at most ${maxBytes} actual UTF-8 bytes.`);
  // Plain allocation avoids input subclass slice, iterator and @@species hooks.
  try {
    const copy = new Uint8Array(nativeByteLength.call(value));
    Uint8Array.prototype.set.call(copy, value);
    return copy;
  } catch {
    graphFail(
      "bytes",
      "Source bytes are unavailable; reselect the original file.",
    );
  }
}

/** Strict synchronous admission shared by legacy sources and graph recovery. */
export function strictProgramGraphJson(
  raw: string | Uint8Array,
  maxBytes: number,
): unknown {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > SOURCE_BYTES
  )
    graphFail("byte_limit", "Use a bounded JSON input size.");
  let text: string;
  if (typeof raw === "string") {
    if (raw.length > maxBytes || enc.encode(raw).byteLength > maxBytes)
      graphFail("byte_limit", `JSON exceeds ${maxBytes} UTF-8 bytes.`);
    text = raw;
  } else {
    const bytes = ownBytes(raw, maxBytes);
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      graphFail(
        "utf8",
        "Choose valid UTF-8 JSON; keep the original bytes for recovery.",
      );
    }
  }
  // A leading UTF-8 BOM is accepted as encoding metadata, never part of a key.
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  type Frame = { object: boolean; keys: Set<string>; key: boolean };
  const stack: Frame[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      const start = i++;
      let closed = false;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i++] === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) graphFail("json", "JSON has an unfinished string.");
      const top = stack.at(-1);
      if (top?.object && top.key) {
        let key: unknown;
        try {
          key = JSON.parse(text.slice(start, i));
        } catch {
          graphFail("json", "JSON has an invalid object key.");
        }
        if (typeof key !== "string") graphFail("json", "Use JSON object keys.");
        if (top.keys.has(key))
          graphFail(
            "duplicate_key",
            "JSON repeats an object key after escape decoding.",
          );
        top.keys.add(key);
        top.key = false;
      }
      continue;
    }
    if (ch === "{" || ch === "[") {
      if (stack.length >= 32)
        graphFail("depth", "JSON container depth exceeds 32.");
      stack.push({ object: ch === "{", keys: new Set(), key: ch === "{" });
    } else if (ch === "}" || ch === "]") {
      const top = stack.pop();
      if (!top || top.object !== (ch === "}"))
        graphFail("json", "JSON container boundaries do not match.");
    } else if (ch === ",") {
      const top = stack.at(-1);
      if (top?.object) top.key = true;
    }
    i++;
  }
  if (stack.length) graphFail("json", "JSON has an unfinished container.");
  try {
    return JSON.parse(text);
  } catch {
    graphFail(
      "json",
      "Choose complete valid JSON without comments or trailing content.",
    );
  }
}

export function adapterForProgram(program: Program): ProgramGraphAdapter {
  const adapter = PROGRAM_GRAPH_ADAPTERS.find((a) => a.program === program);
  if (!adapter)
    graphFail("program", "Choose one of the nine supported partner programs.");
  return adapter;
}

/** Match old validation, but retain every accepted original string. */
export function validateGraphValues(
  value: unknown,
  fields: AdapterField[],
  draft = false,
): Record<string, string> {
  exactGraphObject(
    value,
    fields.map((f) => f.key),
    "values",
  );
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    fields.map((field) => {
      const raw = input[field.key];
      if (typeof raw !== "string" || raw.length > field.maxLength)
        graphFail(
          "field",
          `${field.label}: use a string within its exact v1 bound.`,
          field.key,
        );
      const v = raw.trim();
      if (!v) {
        if (!draft && !field.optional)
          graphFail("required", `${field.label} is required.`, field.key);
        return [field.key, raw];
      }
      if (field.kind === "number") {
        const n = Number(v),
          max = Math.min(field.max ?? 1e9, 1e9);
        if (!Number.isFinite(n) || n < (field.min ?? 0) || n > max)
          graphFail(
            "number",
            `${field.label}: value is outside the v1 numeric bound.`,
            field.key,
          );
        if (
          ["amount", "budget"].includes(field.key) &&
          !/^(?:\d+|\d*\.\d{1,2})$/.test(v)
        )
          graphFail(
            "number",
            `${field.label}: use no more than two decimal places.`,
            field.key,
          );
        if (field.key === "minutes" && !Number.isInteger(n))
          graphFail(
            "number",
            "Session duration must be whole minutes.",
            field.key,
          );
      }
      if (field.kind === "date") {
        const d = new Date(`${v}T12:00:00Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          !Number.isFinite(d.getTime()) ||
          d.toISOString().slice(0, 10) !== v
        )
          graphFail(
            "date",
            `${field.label}: use a real v1 calendar date.`,
            field.key,
          );
      }
      if (field.kind === "select" && !field.options.includes(v))
        graphFail(
          "option",
          `${field.label}: choose an existing v1 option.`,
          field.key,
        );
      if (field.kind === "url") {
        try {
          const url = new URL(v);
          if (
            url.protocol !== "https:" ||
            !url.hostname ||
            url.username ||
            url.password
          )
            throw Error();
        } catch {
          graphFail(
            "url",
            `${field.label}: use HTTPS without credentials.`,
            field.key,
          );
        }
      }
      if (field.key === "start" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
        graphFail("time", "Use a UTC HH:MM start time.", field.key);
      return [field.key, raw];
    }),
  );
}

export function readProgramGraphSource(
  bytes: Uint8Array,
  program: Program,
): { source: PartnerSource; adapter: ProgramGraphAdapter } {
  const adapter = adapterForProgram(program);
  const raw = strictProgramGraphJson(bytes, SOURCE_BYTES);
  exactGraphObject(
    raw,
    ["version", "program", "updated", "context", "records"],
    "source",
  );
  const source = raw as unknown as PartnerSource;
  if (source.version !== 1 || source.program !== program)
    graphFail(
      "source_version",
      "Choose the complete matching version 1 partner backup.",
    );
  if (
    typeof source.updated !== "string" ||
    source.updated.length > 100 ||
    (source.updated && !Number.isFinite(Date.parse(source.updated)))
  )
    graphFail(
      "source_date",
      "Source updated must match its legacy envelope rule.",
    );
  validateGraphValues(source.context, adapter.context, true);
  exactGraphObject(
    source.records,
    adapter.collections.map((c) => c.key),
    "source.records",
  );
  const seen = new Set<string>();
  for (const collection of adapter.collections) {
    const rows = source.records[collection.key];
    if (!Array.isArray(rows) || rows.length > 250)
      graphFail(
        "source_limit",
        "Each source collection contains at most 250 rows.",
      );
    for (const row of rows) {
      exactGraphObject(row, ["id", "values"], "source.record");
      if (
        typeof row.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(row.id) ||
        seen.has(row.id)
      )
        graphFail(
          "source_identity",
          "Source record IDs must be present and unique across the entire file.",
        );
      seen.add(row.id);
      if (seen.size > 500)
        graphFail("source_limit", "A whole source contains at most 500 rows.");
      validateGraphValues(row.values, collection.fields);
    }
  }
  return { source, adapter };
}

function copyInput(input: CaptureInput): CaptureInput {
  exactGraphObject(input, ["bytes", "program", "origin", "target"], "capture");
  const bytes = ownBytes(input.bytes, SOURCE_BYTES);
  adapterForProgram(input.program);
  if (input.origin?.kind === "file") {
    exactGraphObject(input.origin, ["kind", "fileName"], "origin");
    graphText(input.origin.fileName, 255, "fileName");
    if (
      /[\\/\u0000-\u001f\u007f]/.test(input.origin.fileName) ||
      [".", ".."].includes(input.origin.fileName)
    )
      graphFail(
        "file_name",
        "Choose a bounded basename without paths or controls.",
      );
  } else if (input.origin?.kind === "saved-key") {
    exactGraphObject(input.origin, ["kind", "key"], "origin");
    if (
      input.origin.key !== `charitology.partner-workspace-v1.${input.program}`
    )
      graphFail(
        "source_key",
        "Only the exact known partner key can be captured explicitly.",
      );
  } else
    graphFail("origin", "Choose a file or explicit known saved-key capture.");
  if (input.target !== null) {
    exactGraphObject(
      input.target,
      ["sourceId", "expectedCaptureId", "expectedCaptureHash"],
      "target",
    );
    graphId(input.target.sourceId);
    graphId(input.target.expectedCaptureId);
    graphHash(input.target.expectedCaptureHash);
  }
  return {
    bytes,
    program: input.program,
    origin: graphClone(input.origin),
    target: graphClone(input.target),
  };
}
function inputStamp(input: CaptureInput): string {
  const value = copyInput(input);
  return canonicalProgramGraphJson({
    ...value,
    bytes: { byteLength: value.bytes.byteLength, hash: rawHash(value.bytes) },
  });
}
function previewBasis(
  preview: Omit<CapturePreview, "reviewHash"> | CapturePreview,
): unknown {
  const { bytes: _bytes, ...rest } = preview;
  const { reviewHash: _reviewHash, ...basis } = rest as CapturePreview;
  return basis;
}
const pair = (collection: string, id: string) => `${collection}\u0000${id}`;
function sourceRows(source: PartnerSource) {
  return Object.entries(source.records)
    .flatMap(([collection, rows]) =>
      rows.map((row) => ({ collection, ...row })),
    )
    .sort((a, b) =>
      a.collection < b.collection
        ? -1
        : a.collection > b.collection
          ? 1
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0,
    );
}
function targetSource(state: ProgramGraphState, input: CaptureInput) {
  if (input.target === null) return null;
  const source = state.sources.find((s) => s.id === input.target!.sourceId);
  const capture = state.captures.find((c) => c.id === source?.currentCaptureId);
  if (
    !source ||
    !capture ||
    source.program !== input.program ||
    capture.id !== input.target.expectedCaptureId ||
    capture.hash !== input.target.expectedCaptureHash
  )
    graphFail(
      "stale_capture",
      "The chosen source instance or capture changed. Review a fresh preview.",
    );
  return source;
}

export async function previewProgramCapture(
  state: ProgramGraphState,
  input: CaptureInput,
  expectedStateHash: Hash,
): Promise<CapturePreview> {
  // Copy source bytes before the first await; reject oversize before hashing.
  const copied = copyInput(input),
    stamp = inputStamp(input);
  graphHash(expectedStateHash);
  const stateJson = canonicalProgramGraphJson(state);
  const valid = await validateProgramGraphState(graphClone(state));
  if ((await programGraphStateHash(valid)) !== expectedStateHash)
    graphFail(
      "stale_state",
      "The graph changed. Review a new capture preview.",
    );
  const { source, adapter } = readProgramGraphSource(
    copied.bytes,
    copied.program,
  );
  const instance = targetSource(valid, copied);
  const rows = sourceRows(source),
    contextHash = hashProgramGraphSync(source.context);
  const inventory = new Set(rows.map((r) => pair(r.collection, r.id)));
  const tracked = valid.nodes.filter((n) => n.sourceId === instance?.id);
  const priorInventory = valid.captures
    .filter((c) => c.sourceId === instance?.id)
    .flatMap((c) => c.inventory);
  if (instance)
    for (const node of priorInventory) {
      const moved = rows.find(
        (r) => r.id === node.recordId && r.collection !== node.collection,
      );
      if (moved)
        graphFail(
          "source_identity",
          "A tracked source ID moved collections; use a separate source instance.",
        );
    }
  const result: Omit<CapturePreview, "reviewHash"> = {
    format: "charitology-program-graph-capture",
    version: 1,
    stateHash: expectedStateHash,
    program: copied.program,
    adapterId: adapter.id,
    adapterHash: adapter.hash,
    sourceRawHash: rawHash(copied.bytes),
    sourceCanonicalHash: hashProgramGraphSync(source),
    origin: copied.origin,
    target: copied.target,
    byteLength: copied.bytes.byteLength,
    context: graphClone(source.context),
    rows: rows.map((row, index) => {
      const node = tracked.find(
        (n) => n.recordId === row.id && n.collection === row.collection,
      );
      const previous = valid.nodeVersions.find(
        (v) => v.id === node?.currentVersionId,
      );
      return {
        index,
        collection: row.collection,
        recordId: row.id,
        title:
          row.values.title ??
          row.values.name ??
          adapter.collections.find((c) => c.key === row.collection)!.singular,
        trackedNodeId: node?.id ?? null,
        change: !previous
          ? "new"
          : previous.presence === "missing"
            ? "reappeared"
            : previous.contextHash === contextHash &&
                canonicalProgramGraphJson(previous.values) ===
                  canonicalProgramGraphJson(row.values)
              ? "same"
              : "changed",
      };
    }),
    missingNodeIds: tracked
      .filter((n) => !inventory.has(pair(n.collection, n.recordId)))
      .map((n) => n.id)
      .sort(),
    overlap: valid.sources
      .filter((s) => s.program === copied.program && s.id !== instance?.id)
      .map((s) => {
        const ids = new Set(rows.map((r) => r.id));
        const knownIds = new Set(
          valid.captures
            .filter((c) => c.sourceId === s.id)
            .flatMap((c) => c.inventory.map((ref) => ref.recordId)),
        );
        return {
          sourceId: s.id,
          count: [...knownIds].filter((id) => ids.has(id)).length,
        };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1)),
    bytes: copied.bytes,
  };
  const preview = {
    ...result,
    reviewHash: hashProgramGraphSync(previewBasis(result)),
  };
  if (
    canonicalProgramGraphJson(state) !== stateJson ||
    inputStamp(input) !== stamp
  )
    graphFail(
      "input_changed",
      "Source bytes, input or graph changed while previewing.",
    );
  return graphFreeze(preview);
}

export async function applyProgramCapture(
  state: ProgramGraphState,
  preview: CapturePreview,
  selection: CaptureSelection,
  context: {
    at: Instant;
    makeId: () => Id;
    digest?: (bytes: Uint8Array) => Promise<Hash>;
  },
): Promise<ProgramGraphState> {
  exactGraphObject(
    preview,
    [
      "format",
      "version",
      "stateHash",
      "program",
      "adapterId",
      "adapterHash",
      "sourceRawHash",
      "sourceCanonicalHash",
      "origin",
      "target",
      "byteLength",
      "context",
      "rows",
      "missingNodeIds",
      "overlap",
      "reviewHash",
      "bytes",
    ],
    "preview",
  );
  exactGraphObject(
    selection,
    [
      "selectedIndexes",
      "alias",
      "completeCopyAcknowledged",
      "separateCopyAcknowledged",
      "resumeRetired",
    ],
    "selection",
  );
  if (
    !Array.isArray(selection.selectedIndexes) ||
    selection.selectedIndexes.length > 500
  )
    graphFail("selection", "Select at most 500 source rows.");
  const copiedInput = copyInput({
    bytes: preview.bytes,
    program: preview.program,
    origin: preview.origin,
    target: preview.target,
  });
  const previewJson = canonicalProgramGraphJson(previewBasis(preview));
  const reviewedHash = preview.reviewHash;
  const previewStamp = inputStamp(copiedInput);
  const selectionJson = canonicalProgramGraphJson(selection);
  const chosen = graphClone(selection);
  const stateJson = canonicalProgramGraphJson(state);
  const at = context.at,
    makeId = context.makeId,
    digest = context.digest;
  graphInstant(at);
  if (typeof makeId !== "function")
    graphFail("id", "Use an injected graph ID source.");
  const fresh = await previewProgramCapture(
    state,
    copiedInput,
    preview.stateHash,
  );
  if (
    fresh.reviewHash !== reviewedHash ||
    canonicalProgramGraphJson(previewBasis(fresh)) !== previewJson
  )
    graphFail(
      "preview_changed",
      "Capture facts changed; review a fresh complete preview.",
    );
  if (
    !Array.isArray(chosen.selectedIndexes) ||
    chosen.selectedIndexes.some(
      (n, i, a) =>
        !Number.isSafeInteger(n) ||
        n < 0 ||
        n >= fresh.rows.length ||
        (i > 0 && a[i - 1] >= n),
    )
  )
    graphFail(
      "selection",
      "Select sorted unique source-row indexes in the complete preview.",
    );
  if (
    chosen.completeCopyAcknowledged !== true ||
    typeof chosen.separateCopyAcknowledged !== "boolean" ||
    typeof chosen.resumeRetired !== "boolean"
  )
    graphFail("acknowledgement", "Acknowledge complete-copy scope explicitly.");
  const existing = targetSource(state, copiedInput);
  if (!existing) {
    graphText(chosen.alias, 160, "alias");
    if (!chosen.selectedIndexes.length)
      graphFail("selection", "A new source needs at least one selected row.");
    if (fresh.overlap.length && !chosen.separateCopyAcknowledged)
      graphFail(
        "clone_acknowledgement",
        "Overlapping IDs need a deliberately separate source instance.",
      );
    if (chosen.resumeRetired)
      graphFail("acknowledgement", "A new source is not a retired instance.");
  } else {
    if (chosen.alias !== null)
      graphFail("alias", "Refresh keeps the existing instance alias.");
    if (existing.retirement && !chosen.resumeRetired)
      graphFail("resume", "Acknowledge resuming this retired source.");
    if (!existing.retirement && chosen.resumeRetired)
      graphFail("resume", "This source is not retired.");
  }
  const parsed = readProgramGraphSource(copiedInput.bytes, copiedInput.program);
  // Optional injected digest is checked, not allowed to substitute another hash.
  if (
    digest &&
    (await digest(ownBytes(copiedInput.bytes, SOURCE_BYTES))) !==
      fresh.sourceRawHash
  )
    graphFail(
      "hash",
      "The capture byte digest does not match the reviewed source.",
    );
  const unchanged = () => {
    if (
      context.at !== at ||
      context.makeId !== makeId ||
      context.digest !== digest ||
      preview.reviewHash !== reviewedHash ||
      canonicalProgramGraphJson(state) !== stateJson ||
      canonicalProgramGraphJson(selection) !== selectionJson ||
      canonicalProgramGraphJson(previewBasis(preview)) !== previewJson ||
      inputStamp({
        bytes: preview.bytes,
        program: preview.program,
        origin: preview.origin,
        target: preview.target,
      }) !== previewStamp
    )
      graphFail(
        "input_changed",
        "Preview, selection or graph changed during capture.",
      );
  };
  unchanged();
  const rows = sourceRows(parsed.source);
  const previouslyTracked = state.nodes.filter(
    (n) => n.sourceId === existing?.id,
  );
  const newlySelected = chosen.selectedIndexes
    .map((i) => rows[i])
    .filter(
      (row) =>
        !previouslyTracked.some(
          (n) => n.collection === row.collection && n.recordId === row.id,
        ),
    );
  const previous = state.captures.find(
    (c) => c.id === existing?.currentCaptureId,
  );
  if (
    previous &&
    previous.sourceRawHash === fresh.sourceRawHash &&
    canonicalProgramGraphJson(previous.origin) ===
      canonicalProgramGraphJson(fresh.origin) &&
    newlySelected.length === 0 &&
    !existing?.retirement
  )
    return state;
  const next = graphClone(state);
  const sourceId = existing?.id ?? makeId(),
    captureId = makeId();
  const contextHash = hashProgramGraphSync(parsed.source.context);
  const currentRefs: SourceCapture["nodeVersions"] = [];
  const tracked: GraphNode[] = next.nodes.filter(
    (n) => n.sourceId === sourceId,
  );
  for (const row of newlySelected) {
    const node: GraphNode = {
      id: makeId(),
      sourceId,
      collection: row.collection,
      recordId: row.id,
      firstCaptureId: captureId,
      currentVersionId: "",
    };
    tracked.push(node);
    next.nodes.push(node);
  }
  for (const node of tracked) {
    const row = rows.find(
      (r) => r.collection === node.collection && r.id === node.recordId,
    );
    const previousVersion = next.nodeVersions.find(
      (v) => v.id === node.currentVersionId,
    );
    const presence = row ? "present" : "missing";
    const values = row ? graphClone(row.values) : null;
    if (
      previousVersion &&
      previousVersion.presence === presence &&
      previousVersion.contextHash === contextHash &&
      canonicalProgramGraphJson(previousVersion.values) ===
        canonicalProgramGraphJson(values)
    ) {
      currentRefs.push({ nodeId: node.id, versionId: previousVersion.id });
      continue;
    }
    const value = {
      id: makeId(),
      nodeId: node.id,
      version: (previousVersion?.version ?? 0) + 1,
      previousId: previousVersion?.id ?? null,
      captureId,
      presence,
      values,
      contextHash,
      reappeared:
        presence === "present" && previousVersion?.presence === "missing",
    };
    const version = {
      ...value,
      hash: hashProgramGraphSync(value),
    } as NodeVersion;
    next.nodeVersions.push(version);
    node.currentVersionId = version.id;
    currentRefs.push({ nodeId: node.id, versionId: version.id });
  }
  currentRefs.sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1));
  const value = {
    id: captureId,
    sourceId,
    sequence: (previous?.sequence ?? 0) + 1,
    previousId: previous?.id ?? null,
    capturedAt: at,
    sourceUpdated: parsed.source.updated,
    sourceRawHash: fresh.sourceRawHash,
    sourceCanonicalHash: fresh.sourceCanonicalHash,
    byteLength: fresh.byteLength,
    origin: graphClone(fresh.origin),
    context: graphClone(parsed.source.context),
    inventory: rows.map((r) => ({ collection: r.collection, recordId: r.id })),
    nodeVersions: currentRefs,
  };
  next.captures.push({ ...value, hash: hashProgramGraphSync(value) });
  if (existing) {
    const source = next.sources.find((s) => s.id === sourceId)!;
    source.currentCaptureId = captureId;
    source.retirement = null;
  } else
    next.sources.push({
      id: sourceId,
      program: parsed.adapter.program,
      adapterId: parsed.adapter.id,
      adapterHash: parsed.adapter.hash,
      alias: chosen.alias!,
      currentCaptureId: captureId,
      retirement: null,
    });
  if (!next.adapters.some((a) => a.id === parsed.adapter.id))
    next.adapters.push(graphClone(parsed.adapter));
  unchanged();
  return next;
}
