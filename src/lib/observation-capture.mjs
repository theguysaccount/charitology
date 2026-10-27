import {
  observationClone,
  observationFreeze,
  observationFail,
  observationRawHash,
  observationObjectHash,
  canonicalObservationJson,
  observationPrettyJson,
  strictObservationJson,
} from "./observation-canonical.mjs";
import {
  validateObservationFiles,
  observationFileTexts,
  observationProjection,
  observationFactualClosure,
  observationExport,
  observationHistoryExport,
} from "./observation-model.mjs";
import {
  OBSERVATION_BASELINE_PATHS,
  observationMethodPins,
} from "./observation-baseline.mjs";
import {
  assembleObservationRecords,
  copyPreparedObservationInputs,
  copyObservationBytes,
  observationPin,
  observationRecordKey,
  observationRecordPath,
} from "./observation-sources.mjs";

const candidates = new WeakMap();
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const pinCompare = (a, b) =>
  compare(a.kind, b.kind) || compare(a.id, b.id) || a.version - b.version;
const same = (a, b) =>
  canonicalObservationJson(a) === canonicalObservationJson(b);
const fail = (message) => observationFail("invalid_capture", message);
const exact = (o, keys) => {
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    !same(Object.keys(o).sort(), [...keys].sort())
  )
    fail("Unknown/missing capture fields");
};

export function observationRequestHash(request) {
  const value = observationClone(request);
  delete value.requestHash;
  return observationRawHash(canonicalObservationJson(value));
}
export function makeObservationCaptureRequest(input) {
  const value = observationClone(input);
  delete value.requestHash;
  return observationFreeze({
    ...value,
    requestHash: observationRequestHash(value),
  });
}
export function copyObservationBaseline(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype)
    fail("Plain source baseline required");
  const root = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(root).length !== 2 ||
    !Object.hasOwn(root.commit ?? {}, "value") ||
    !Object.hasOwn(root.files ?? {}, "value")
  )
    fail("Closed source baseline required");
  const files = root.files.value;
  if (
    !Array.isArray(files) ||
    Object.getPrototypeOf(files) !== Array.prototype ||
    files.length !== OBSERVATION_BASELINE_PATHS.length
  )
    fail("Complete source baseline required");
  const arrayDescriptors = Object.getOwnPropertyDescriptors(files);
  if (Reflect.ownKeys(arrayDescriptors).length !== files.length + 1)
    fail("Decorated baseline array");
  const owned = [];
  for (let i = 0; i < files.length; i++) {
    const itemDescriptor = arrayDescriptors[String(i)];
    if (!itemDescriptor?.enumerable || !Object.hasOwn(itemDescriptor, "value"))
      fail("Sparse/accessor baseline");
    const item = itemDescriptor.value;
    if (!item || Object.getPrototypeOf(item) !== Object.prototype)
      fail("Plain baseline file required");
    const d = Object.getOwnPropertyDescriptors(item);
    if (
      Reflect.ownKeys(d).length !== 3 ||
      ["path", "sha256", "bytes"].some(
        (k) => !d[k]?.enumerable || !Object.hasOwn(d[k], "value"),
      )
    )
      fail("Closed baseline file required");
    owned.push({
      path: d.path.value,
      sha256: d.sha256.value,
      bytes: copyObservationBytes(d.bytes.value, 5 * 1024 * 1024),
    });
  }
  const result = { commit: root.commit.value, files: owned };
  observationMethodPins(result);
  return result;
}
function requestCopy(input, baseline, prepared) {
  const request = observationClone(input);
  exact(request, [
    "format",
    "version",
    "sourceCommit",
    "previousCommit",
    "capturedAt",
    "editionId",
    "expectedPrevious",
    "previousRegistryHash",
    "preparedInputManifestHash",
    "requestHash",
  ]);
  if (
    request.format !== "charitology-observation-capture-request" ||
    request.version !== 1 ||
    request.sourceCommit !== baseline.commit ||
    !/^[0-9a-f]{40}$/.test(request.previousCommit) ||
    /^0+$/.test(request.previousCommit) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(request.capturedAt) ||
    new Date(request.capturedAt).toISOString() !== request.capturedAt ||
    !/^[a-z][a-z0-9-]{0,99}$/.test(request.editionId)
  )
    fail("Invalid exact capture request");
  if (
    request.preparedInputManifestHash !== prepared.manifest.hash ||
    request.requestHash !== observationRequestHash(request)
  )
    fail("Capture request hash/input manifest disagrees");
  if (
    prepared.manifest.inputs.some(
      (input) => input.retrievedAt > request.capturedAt,
    )
  )
    fail("Capture cannot precede a retained input retrieval");
  return request;
}
function recordFromPin(files, pin) {
  return strictObservationJson(files[observationRecordPath(pin)]);
}
function filePins(files) {
  return Object.keys(files)
    .sort()
    .map((path) => ({
      path,
      sha256: observationRawHash(files[path]),
      bytes: Buffer.byteLength(files[path]),
    }));
}
function captureDiff(previous, current, report) {
  const before = new Map(previous.map((r) => [`${r.kind}/${r.id}`, r])),
    added = [],
    changed = [],
    unchanged = [];
  for (const next of current) {
    const old = before.get(`${next.kind}/${next.id}`);
    if (!old) added.push(observationPin(next));
    else if (old.hash === next.hash) unchanged.push(observationPin(next));
    else {
      const keys = new Set([...Object.keys(old), ...Object.keys(next)]);
      const fields = [...keys]
        .filter(
          (k) =>
            !["hash", "version", "previous"].includes(k) &&
            !same(old[k], next[k]),
        )
        .sort();
      changed.push({
        before: observationPin(old),
        after: observationPin(next),
        fields,
      });
    }
  }
  const missing = current
    .filter((r) => r.kind === "coverage")
    .flatMap((r) =>
      r.cells
        .filter((c) => c.state === "missing")
        .map((c) => ({
          entity: c.entity,
          measure: c.measure,
          reason: c.reason,
        })),
    );
  return {
    added: added.sort(pinCompare),
    changed: changed.sort((a, b) => pinCompare(a.after, b.after)),
    missing,
    identityChanges: changed
      .filter((c) => c.after.kind === "entity")
      .map((c) => c.after.id),
    definitionChanges: changed
      .filter((c) => c.after.kind === "measure")
      .map((c) => c.after.id),
    unchanged: unchanged.sort(pinCompare),
  };
}

export function buildObservationCandidate(
  previousInput,
  preparedInput,
  baselineInput,
  requested,
) {
  // Detach caller-owned typed arrays/Map/JSON before any subsequent operation.
  const prepared = copyPreparedObservationInputs(preparedInput),
    baseline = copyObservationBaseline(baselineInput),
    request = requestCopy(requested, baseline, prepared);
  let previous = null,
    oldFiles = {},
    oldRegistry = null,
    previousRecords = [],
    previousHistoricalRecords = [];
  if (previousInput !== null) {
    previous = validateObservationFiles(previousInput);
    oldFiles = observationFileTexts(previous);
    oldRegistry = previous.registry;
    const edition = strictObservationJson(
      oldFiles[`editions/${oldRegistry.current.id}.json`],
    );
    previousRecords = edition.records.map((p) => recordFromPin(oldFiles, p));
    previousHistoricalRecords = oldRegistry.records.map((p) =>
      recordFromPin(oldFiles, p),
    );
  }
  if (
    !same(request.expectedPrevious, oldRegistry?.current ?? null) ||
    request.previousRegistryHash !== (oldRegistry?.hash ?? null)
  )
    fail("Previous edition/registry is stale");
  if (oldRegistry?.editions.some((e) => e.id === request.editionId))
    fail("Edition ID already exists");
  const assembled = assembleObservationRecords(
      prepared,
      baseline,
      previousHistoricalRecords,
    ),
    files = { ...oldFiles, ...assembled.files };
  // An adapter must never overwrite even one already published immutable byte.
  for (const [path, text] of Object.entries(oldFiles))
    if (path !== "registry.json" && files[path] !== text)
      fail("Adapter attempted to rewrite immutable history");
  for (const record of assembled.records)
    if (!Object.hasOwn(files, observationRecordPath(record)))
      fail("Selected record has no exact retained file");
  const method = observationMethodPins(baseline),
    definition = assembled.definitions;
  const editionCore = {
    format: "charitology-observation-edition",
    version: 1,
    id: request.editionId,
    sequence: (oldRegistry?.editions.length ?? 0) + 1,
    capturedAt: request.capturedAt,
    sourceCommit: request.sourceCommit,
    method,
    supersedes: oldRegistry?.current ?? null,
    records: assembled.records.map(observationPin).sort(pinCompare),
    coverage: assembled.records
      .filter((r) => r.kind === "coverage")
      .map(observationPin)
      .sort(pinCompare),
    legacyComparison: definition.legacyComparison,
    countryProjection: definition.countryProjection,
    limitations: definition.limitations,
    review: "draft",
  };
  const edition = { ...editionCore, hash: observationObjectHash(editionCore) },
    editionPin = {
      id: edition.id,
      hash: edition.hash,
      sequence: edition.sequence,
    };
  files[`editions/${edition.id}.json`] = observationPrettyJson(edition);
  const allRecords = new Map(
    (oldRegistry?.records ?? []).map((p) => [observationRecordKey(p), p]),
  );
  for (const record of assembled.records)
    allRecords.set(observationRecordKey(record), observationPin(record));
  delete files["registry.json"];
  const registryCore = {
    format: "charitology-observation-registry",
    version: 1,
    current: editionPin,
    editions: [...(oldRegistry?.editions ?? []), editionPin],
    records: [...allRecords.values()].sort(pinCompare),
    files: filePins(files),
  };
  files["registry.json"] = observationPrettyJson({
    ...registryCore,
    hash: observationObjectHash(registryCore),
  });
  // Admission and exports are mandatory: byte-count estimates are not authority.
  const validated = validateObservationFiles(files),
    owned = observationFileTexts(validated);
  const filter = { entityIds: [], measureIds: [], state: "all" };
  const json = observationExport(validated, {
      editionId: edition.id,
      filter,
      format: "json",
    }),
    csv = observationExport(validated, {
      editionId: edition.id,
      filter,
      format: "csv",
    }),
    history = observationHistoryExport(validated);
  const previewCore = {
    format: "charitology-observation-capture-preview",
    version: 1,
    request,
    candidateRegistryHash: validated.registry.hash,
    files: filePins(owned),
    editionBytes: observationFactualClosure(validated, edition.id).reduce(
      (n, f) => n + f.bytes,
      0,
    ),
    historyBytes: validated.historyBytes,
    editionJsonBytes: json.bytes,
    editionCsvBytes: csv.bytes,
    historyJsonBytes: history.bytes,
    diff: captureDiff(previousRecords, assembled.records, assembled.report),
  };
  const proposalCore = {
    ...previewCore,
    preparedManifest: prepared.manifest,
    baseline: {
      commit: baseline.commit,
      files: baseline.files.map((f) => ({
        path: f.path,
        sha256: f.sha256,
        bytes: f.bytes.byteLength,
      })),
    },
  };
  const preview = observationFreeze({
    ...previewCore,
    proposalHash: observationRawHash(canonicalObservationJson(proposalCore)),
  });
  candidates.set(preview, {
    files: owned,
    validated,
    prepared,
    baseline,
    report: observationFreeze(assembled.report),
  });
  return preview;
}

export function observationCandidateFiles(preview) {
  const candidate = candidates.get(preview);
  if (!candidate) fail("Only an owned admitted candidate can be written");
  return candidate.files;
}
export function observationCandidateReport(preview) {
  const candidate = candidates.get(preview);
  if (!candidate) fail("Only an owned admitted candidate has a source report");
  return candidate.report;
}
