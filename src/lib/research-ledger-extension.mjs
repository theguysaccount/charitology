// Pure preparation of one additive, source-bound encyclopedia coverage edition.
// No filesystem, Git, network, clock, browser state or publication authority.
import { captureResearchSource, ENCYCLOPEDIA_ADAPTER } from "./research-ledger-capture.mjs";
import { canonicalResearchJson, researchObjectHash, researchRawHash, researchSubjectHash, validateResearchLedger, projectResearchLedger, researchLedgerExport } from "./research-ledger-model.mjs";
import { exact, id, instant, text, frozen, fail, LEDGER_LIMITS } from "./research-ledger-canonical.mjs";
const LEDGER_GROUPS = ["records", "versions", "events", "reviews", "actors", "observations", "editions", "sources"];

export const ENCYCLOPEDIA_INITIAL_SLUGS = Object.freeze([
  "beneficiary-feedback", "charity-as-a-system", "cost-effectiveness-analysis",
  "counterfactual-impact", "discounting", "donor-advised-funds", "effective-altruism",
  "expected-value", "identifiable-victim-effect", "impact-investing", "moral-uncertainty",
  "mutual-aid", "neglectedness", "outputs-and-outcomes", "overhead-ratio",
  "participatory-grantmaking", "private-foundations", "psychic-numbing",
  "randomized-controlled-trials", "restricted-and-unrestricted-funding",
  "scale-neglectedness-tractability", "source-depth", "symptoms-and-sources",
  "systemic-change", "theory-of-change", "warm-glow-giving",
]);
export const ENCYCLOPEDIA_INITIAL_PATHS = Object.freeze(ENCYCLOPEDIA_INITIAL_SLUGS.map((slug) => `src/content/encyclopedia/${slug}.md`));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const byId = (a, b) => compare(a.id, b.id);
const object = (value) => ({ ...value, hash: researchObjectHash(value) });
const reference = (value) => ({ recordId: value.recordId, version: value.version, subjectHash: value.subjectHash });
const unknown = () => ({ state: "unknown", complete: false, actorIds: [], refs: [] });
const pin = (values) => values.map(({ id, hash }) => ({ id, hash })).sort(byId);
const json = (value) => JSON.stringify(value, null, 2) + "\n";
export function researchArchiveOptions(input) {
  return {
    currentContent: input.manifest.currentSources.map((binding) => {
      const snapshot = input.sources.find((source) => source.id === binding.sourceId);
      if (!snapshot) fail("reference", "Current source snapshot is missing.");
      return { sourceKey: binding.sourceKey, href: binding.href, rawText: snapshot.text,
        ...captureResearchSource({ sourceKey: binding.sourceKey, rawText: snapshot.text }) };
    }),
    uncoveredReviews: [],
  };
}
export function researchLedgerFiles(input) {
  return [
    { path: "manifest.json", text: json(input.manifest) },
    ...LEDGER_GROUPS.flatMap((group) => input[group].map((value) => ({ path: `${group}/${value.id.replace(":", "--")}.json`, text: json(value) }))),
  ].map((file) => ({ ...file, bytes: Buffer.byteLength(file.text), sha256: researchRawHash(file.text) }))
    .sort((a, b) => compare(a.path, b.path));
}
export function prepareEncyclopediaCoverage(prior, options) {
  exact(options, ["sourceCommit", "captureAt", "captureId", "editionId", "sourceFiles"]);
  if (!/^[a-f0-9]{40}$/.test(options.sourceCommit)) fail("source", "Use an exact committed source SHA.");
  instant(options.captureAt); id(options.captureId); id(options.editionId);
  const previousGraph = validateResearchLedger(prior, researchArchiveOptions(prior));
  if (prior.manifest.adapterVersion !== "research-content-v1" || options.captureAt <= prior.manifest.capture.at)
    fail("source", "This extension requires original coverage and a later explicit recording instant.");
  if (prior.editions.some((edition) => edition.id === options.editionId) || options.captureId === prior.manifest.capture.id)
    fail("reference", "Capture and edition identities cannot be reused.");
  if (!Array.isArray(options.sourceFiles) || options.sourceFiles.length !== ENCYCLOPEDIA_INITIAL_PATHS.length)
    fail("source", "Capture the complete explicit encyclopedia inventory.");
  const sourceFiles = [...options.sourceFiles].sort((a, b) => compare(a.path, b.path));
  if (canonicalResearchJson(sourceFiles.map((source) => source.path)) !== canonicalResearchJson(ENCYCLOPEDIA_INITIAL_PATHS))
    fail("source", "The complete encyclopedia path inventory changed.");
  const input = structuredClone(prior);
  const priorProjection = projectResearchLedger(previousGraph, { editionId: prior.manifest.currentEditionId });
  const heads = structuredClone(priorProjection.edition.heads);
  for (const item of sourceFiles) {
    exact(item, ["path", "rawText"]);
    text(item.rawText, LEDGER_LIMITS.sourceBytes, "raw source", false, true);
    const sourceKey = item.path.slice("src/content/".length, -3), slug = sourceKey.split("/")[1];
    const captured = captureResearchSource({ sourceKey, rawText: item.rawText });
    if (captured.declaredReview !== "draft") fail("qualification", "Do not capture an uninspected source as reviewed.");
    const recordId = `concept:${slug}`, sourceId = `source:encyclopedia-${slug}-v1`;
    const record = object({ id: recordId, kind: "concept" });
    const source = object({ id: sourceId, commit: options.sourceCommit, path: item.path,
      sha256: researchRawHash(item.rawText), byteLength: Buffer.byteLength(item.rawText), text: item.rawText });
    const version = object({ id: `version:concept-${slug}-v1`, recordId, version: 1, previousId: null,
      adapterVersion: ENCYCLOPEDIA_ADAPTER, subject: captured.subject,
      subjectHash: researchSubjectHash(captured.subject), authorship: unknown(),
      sources: [{ sourceId, selector: { kind: "entry" } }] });
    const event = object({ id: `event:concept-${slug}-1`, ordinal: input.events.length + 1,
      recordId, sequence: 1, previousId: null, previousHash: null, occurredAt: null,
      timeBasis: "undated", recordedAt: options.captureAt, actorIds: [], refs: [],
      observationIds: [], reason: "Additional exact-source encyclopedia coverage. Earlier authorship, source reading, independent review and historical event dates remain unknown.",
      type: "baseline", version: reference(version), initialProblemState: null });
    input.records.push(record); input.sources.push(source); input.versions.push(version); input.events.push(event);
    input.manifest.currentSources.push({ sourceKey, recordId, sourceId, currentVersion: reference(version), href: `/record/encyclopedia/${slug}/` });
    heads.push({ recordId, version: reference(version), eventId: event.id, eventHash: event.hash });
  }
  for (const group of ["records", "versions", "sources", "events"]) input[group].sort(byId);
  input.manifest.adapterVersion = "research-content-v2";
  input.manifest.currentEditionId = options.editionId;
  input.manifest.capture = { id: options.captureId, at: options.captureAt, commit: options.sourceCommit };
  input.manifest.currentSources.sort((a, b) => compare(a.sourceKey, b.sourceKey));
  const sourceKeys = input.manifest.currentSources.map((source) => source.sourceKey);
  const limitations = [...prior.manifest.coverage.limitations,
    "The encyclopedia extension records exact draft wording at its separate capture. It supplies no independent source review, documented complete human authorship or earlier history."];
  input.manifest.coverage.includedSourceKeys = sourceKeys;
  input.manifest.coverage.limitations = limitations;
  input.editions.push(object({ id: options.editionId, capturedAt: options.captureAt,
    period: { from: priorProjection.edition.period.from, to: options.captureAt },
    recordPins: pin(input.records), versionPins: pin(input.versions), eventPins: pin(input.events),
    reviewPins: pin(input.reviews), sourcePins: pin(input.sources), actorPins: pin(input.actors),
    observationPins: pin(input.observations), heads: heads.sort((a, b) => compare(a.recordId, b.recordId)),
    currentSources: structuredClone(input.manifest.currentSources),
    coverage: { sourceKeys, baselineKnownFrom: priorProjection.edition.coverage.baselineKnownFrom, limitations } }));
  input.editions.sort(byId);
  const graph = validateResearchLedger(input, researchArchiveOptions(input));
  const projection = projectResearchLedger(graph, { editionId: options.editionId });
  // Admission includes the actual complete saved export, not just the new objects.
  const exported = researchLedgerExport(projection, { format: "json", eventIds: null });
  if (Buffer.byteLength(exported.text) > LEDGER_LIMITS.exportBytes) fail("limit", "The complete export exceeds its existing bound.");
  const oldFiles = researchLedgerFiles(prior), previous = new Map(oldFiles.map((file) => [file.path, file]));
  const allFiles = researchLedgerFiles(input);
  for (const file of allFiles) if (previous.has(file.path) && file.path !== "manifest.json" && previous.get(file.path).text !== file.text)
    fail("source", "An immutable historical object changed.");
  if (oldFiles.some((file) => !allFiles.some((next) => next.path === file.path)))
    fail("source", "An immutable historical object disappeared.");
  const payload = {
    format: "charitology-encyclopedia-coverage-preparation", version: 1,
    sourceCommit: options.sourceCommit, capture: input.manifest.capture, editionId: options.editionId,
    priorManifestSha256: previous.get("manifest.json").sha256,
    priorFiles: oldFiles.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    sourceInventory: sourceFiles.map(({ path, rawText }) => ({ path, bytes: Buffer.byteLength(rawText), sha256: researchRawHash(rawText) })),
    addedFiles: allFiles.filter((file) => !previous.has(file.path)),
    replacementManifest: allFiles.find((file) => file.path === "manifest.json"),
    counts: Object.fromEntries(LEDGER_GROUPS.map((group) => [group, input[group].length])),
    canonicalInputBytes: Buffer.byteLength(canonicalResearchJson(input)), completeExportBytes: Buffer.byteLength(exported.text),
    inputHash: researchSubjectHash(input), editionHash: projection.edition.hash,
    factualHash: projection.factualHash,
  };
  return frozen({ ...payload, checksum: researchSubjectHash(payload) });
}
