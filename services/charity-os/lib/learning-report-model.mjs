/** Selected private report and complete inactive-backup admission. Never access control. */
import {
  learningOwned as own,
  learningObject as obj,
  learningArray as arr,
  learningText as text,
  learningId as id,
  learningNumber as num,
  learningEnum as en,
  learningInstant as instant,
  learningHashValue as hash,
  learningHash as H,
  learningSame as same,
  learningCheckedHash as checked,
  learningSeal as seal,
  learningFreeze as freeze,
  learningFail as fail,
  learningCanonical,
  LEARNING_LIMITS,
} from "./learning-json.mjs";
import {
  validateLearningSourceCapture,
  sourcePin,
} from "./learning-native.mjs";
import {
  validateLearningEvidence,
  validateLearningSelection,
  validateLearningFinalSelection,
  validateLearningManifest,
  validateLearningHeadPin,
  validateLearningSourcePin,
  ruleAssessment,
  feedbackAssessment,
  learningEvidenceFor,
} from "./learning-validation.mjs";
import {
  validateLearningEvent,
  foldLearningHistory,
  learningEventRecordPins,
  headPin,
  compileLearningDecision,
  compileLearningMeasurement,
} from "./learning-model.mjs";
import { validateLearningSelectedProof } from "./learning-selected-proof.mjs";
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const eventSort = (a, b) =>
  cmp(a.originOrgId, b.originOrgId) ||
  cmp(a.bindingId, b.bindingId) ||
  a.sequence - b.sequence;
const sourceSort = (a, b) =>
  cmp(a.originOrgId, b.originOrgId) ||
  cmp(a.bindingId, b.bindingId) ||
  a.sourceVersion - b.sourceVersion;
const reportSort = (a, b) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
function pinEvidence(es, p) {
  return learningEvidenceFor(es, p);
}
const selectedPins = (s) => [
  s.program,
  s.protocol,
  ...s.definitions,
  ...s.observations,
  s.decision,
];
function eventHeadPins(e) {
  const p = e.payload,
    result = e.previous ? [e.previous] : [];
  if (p.kind === "adopted") result.push(p.recoveredHead);
  if (["measured", "decided"].includes(p.kind)) result.push(p.input.head);
  if (p.kind === "corrected") result.push(p.input.measurement.head);
  if (p.kind === "report-frozen") result.push(p.selection.selection.head);
  return result;
}
function boundariesFor(s, sources, events) {
  const result = new Map(),
    eventMap = new Map(
      events.map((e) => [
        e.originOrgId + "\0" + e.bindingId + "\0" + e.sequence,
        e,
      ]),
    ),
    sourceMap = new Map(
      sources.map((x) => [
        x.originOrgId + "\0" + x.bindingId + "\0" + x.sourceVersion,
        x,
      ]),
    );
  const addHead = (p) => {
    validateLearningHeadPin(p);
    const found = eventMap.get(
      p.originOrgId + "\0" + p.bindingId + "\0" + p.sequence,
    );
    if (found) {
      if (!same(headPin(found), p))
        fail(
          "learning_boundary",
          "An internal event pin has a different identity/hash.",
        );
    } else
      result.set("event:" + learningCanonical(p), {
        kind: "event-parent",
        pin: p,
      });
  };
  const addSource = (p) => {
    validateLearningSourcePin(p);
    const found = sourceMap.get(
      p.originOrgId + "\0" + p.bindingId + "\0" + p.version,
    );
    if (found) {
      if (!same(sourcePin(found), p))
        fail(
          "learning_boundary",
          "An internal source pin has a different identity/hash.",
        );
    } else
      result.set("source:" + learningCanonical(p), {
        kind: "source-parent",
        pin: p,
      });
  };
  addHead(s.head);
  for (const e of events) for (const p of eventHeadPins(e)) addHead(p);
  for (const source of sources)
    if (source.previousSource) addSource(source.previousSource);
  return [...result.values()].sort((a, b) =>
    cmp(learningCanonical(a), learningCanonical(b)),
  );
}
function causalInventory(head, context) {
  const included = new Map(),
    needHeads = [head],
    expanded = new Map();
  while (needHeads.length) {
    const p = needHeads.pop(),
      key = p.originOrgId + "\0" + p.bindingId,
      limit = expanded.get(key) ?? 0;
    if (limit >= p.sequence) continue;
    const endpoint = context.events.find((e) => same(headPin(e), p));
    if (!endpoint)
      fail(
        "learning_reference",
        "The exact causal history endpoint is missing.",
      );
    expanded.set(key, p.sequence);
    for (const e of context.events.filter(
      (e) =>
        e.originOrgId === p.originOrgId &&
        e.bindingId === p.bindingId &&
        e.sequence <= p.sequence,
    )) {
      included.set(e.sha256, e);
      if (e.payload.kind === "adopted") needHeads.push(e.payload.recoveredHead);
    }
  }
  const events = [...included.values()].sort(eventSort),
    sourceSet = new Map(),
    queue = events
      .filter((e) => ["mapped", "adopted"].includes(e.payload.kind))
      .map((e) => e.payload.source);
  while (queue.length) {
    const p = queue.pop();
    if (sourceSet.has(p.sha256)) continue;
    const source = context.sources.find((s) => same(sourcePin(s), p));
    if (!source)
      fail("learning_source", "The complete causal source chain is missing.");
    sourceSet.set(source.sha256, source);
    if (source.previousSource) queue.push(source.previousSource);
  }
  const evidenceSet = new Map();
  for (const p of events.flatMap(learningEventRecordPins)) {
    const e = pinEvidence(context.approvedEvidence, p);
    evidenceSet.set(e.sha256, e);
  }
  return {
    sources: [...sourceSet.values()].sort(sourceSort),
    approvedEvidence: [...evidenceSet.values()],
    events,
  };
}
function expectedExclusions(binding, s, records) {
  const selected = new Set(s.observations.map((x) => x.recordId)),
    edges = new Map(
      binding.effectiveEdges.map((x) => [
        x.replaces.recordId,
        x.replacement.recordId,
      ]),
    ),
    attempts = new Map(
      binding.corrections.map((x) => [x.candidateRecordId, x]),
    ),
    questioned = new Set(binding.questionedRecordIds);
  return binding.measurements
    .filter((x) => !selected.has(x.record.recordId))
    .map((x) => {
      const record = records?.find((r) => r.id === x.record.recordId),
        a = attempts.get(x.record.recordId);
      let reason = "not-selected",
        replacedBy = null;
      if (edges.has(x.record.recordId)) {
        reason = "replaced";
        replacedBy = edges.get(x.record.recordId);
      } else if (a && a.state !== "applied")
        reason =
          a.state === "pending" ? "pending-correction" : "abandoned-correction";
      else if (questioned.has(x.record.recordId))
        reason = "unresolved-correction";
      else if (x.input.mappingEventSha256 !== s.mappingEventSha256)
        reason = "different-mapping";
      else if (record?.deletedAt || record?.deleted_at) reason = "deleted";
      else if (
        record &&
        (!record.approval ||
          !record.snapshot ||
          !["approved", "included"].includes(record.status))
      )
        reason = "unapproved";
      return {
        recordId: x.record.recordId,
        revision: record?.revision ?? 1,
        reason,
        replacedBy,
      };
    });
}
export function selectLearningReportClosure(
  selection,
  context,
  { manifestPin = null } = {},
) {
  const s = validateLearningSelection(selection),
    inventory = {
      sources: context.sources,
      approvedEvidence: context.approvedEvidence,
      events: context.events,
    };
  const full = foldLearningHistory(inventory),
    binding = full.bindings.find(
      (b) =>
        b.originOrgId === s.head.originOrgId &&
        b.bindingId === s.head.bindingId,
    );
  if (!binding)
    fail("learning_selection", "The selected binding is unavailable.");
  const cutoff = binding.events.find((e) => same(headPin(e), s.head));
  if (!cutoff)
    fail(
      "learning_selection",
      "The exact selected pre-freeze head is missing.",
    );
  const prefix = foldLearningHistory(
    causalInventory(s.head, context),
  ).bindings.find(
    (b) =>
      b.originOrgId === s.head.originOrgId && b.bindingId === s.head.bindingId,
  );
  if (
    prefix.mappingEvent.sha256 !== s.mappingEventSha256 ||
    !same(prefix.source, s.source)
  )
    fail(
      "learning_selection",
      "Select one exact current mapping/source at that historical head.",
    );
  const source = context.sources.find((x) => same(sourcePin(x), s.source));
  if (!source)
    fail("learning_source", "The selected primary source is missing.");
  const decision = prefix.decisions.find(
    (x) => x.record.recordId === s.decision.recordId,
  );
  if (
    !decision ||
    !same(decision.input.observations, s.observations) ||
    !same(decision.input.discussedDefinitions, s.definitions) ||
    !same(decision.input.protocol, s.protocol) ||
    !same(decision.input.program, s.program)
  )
    fail(
      "learning_selection",
      "The exact approved decision does not discuss these selected pins.",
    );
  const byId = new Map(prefix.measurements.map((x) => [x.record.recordId, x])),
    eventSet = new Map([
      [prefix.mappingEvent.sha256, prefix.mappingEvent],
      [decision.event.sha256, decision.event],
    ]),
    ancestry = new Set();
  const include = (id) => {
    if (ancestry.has(id)) return;
    ancestry.add(id);
    const p = byId.get(id);
    if (!p)
      fail("learning_reference", "Selected observation provenance is missing.");
    eventSet.set(p.event.sha256, p.event);
    if (p.correctionEventSha256) {
      const a = prefix.corrections.find(
        (x) => x.eventSha256 === p.correctionEventSha256,
      );
      if (a.state !== "applied")
        fail(
          "learning_correction",
          "Pending/abandoned candidates cannot be selected.",
        );
      eventSet.set(a.terminalEvent.sha256, a.terminalEvent);
      include(a.replaces.recordId);
    }
  };
  for (const p of s.observations) {
    if (
      !prefix.effectiveLeafRecordIds.includes(p.recordId) ||
      prefix.questionedRecordIds.includes(p.recordId)
    )
      fail(
        "learning_correction",
        "A selected point has been replaced or remains questioned.",
      );
    include(p.recordId);
  }
  for (const a of prefix.corrections)
    if (ancestry.has(a.replaces.recordId)) {
      const e = prefix.events.find((e) => e.sha256 === a.eventSha256);
      eventSet.set(e.sha256, e);
      if (a.terminalEvent)
        eventSet.set(a.terminalEvent.sha256, a.terminalEvent);
    }
  const events = [...eventSet.values()].sort(eventSort),
    proofs = new Map();
  for (const p of [
    ...selectedPins(s),
    ...(manifestPin ? [manifestPin] : []),
    ...events.flatMap(learningEventRecordPins),
  ]) {
    const e = pinEvidence(context.approvedEvidence, p);
    proofs.set(e.sha256, e);
  }
  const approvedEvidence = [...proofs.values()].sort((a, b) =>
    cmp(a.sha256, b.sha256),
  );
  if (approvedEvidence.length > 600)
    fail(
      "learning_limit",
      "The exact approval proof closure exceeds 600 entries.",
    );
  const sources = [validateLearningSourceCapture(source)],
    boundaries = boundariesFor(s, sources, events);
  if (boundaries.length > 64)
    fail(
      "learning_limit",
      "The exact parent boundary closure exceeds 64 entries.",
    );
  return freeze({
    sources,
    approvedEvidence,
    events,
    exclusions: expectedExclusions(prefix, s, context.records),
    boundaries,
    basis: prefix.mappingEvent.payload.mapping.basis,
    assessment: decision.input.assessment,
    feedback: decision.input.feedback,
  });
}
export function learningSelectionDigest({
  selection,
  sources,
  approvedEvidence,
  manifest,
}) {
  const s = validateLearningSelection(selection),
    m = validateLearningManifest(manifest),
    without = { ...m };
  delete without.sourceDigest;
  const sourceCaptureHashes = sources
    .map(validateLearningSourceCapture)
    .map((x) => x.sha256)
    .sort();
  const approvedEvidenceHashesExceptManifest = approvedEvidence
    .map(validateLearningEvidence)
    .filter(
      (e) =>
        !(
          e.pin.moduleId === "reporting" &&
          e.pin.recordId === s.manifestRecordId
        ),
    )
    .map((x) => x.sha256)
    .sort();
  return H("digest", {
    methodVersion: "learning-review-v1",
    selectionSha256: H("selection", s),
    sourceCaptureHashes,
    approvedEvidenceHashesExceptManifest,
    manifestDataWithoutSourceDigest: without,
  });
}
function validateSupersedes(v) {
  if (v === null) return null;
  obj(v, ["reportId", "checksum", "reason"]);
  id(v.reportId);
  hash(v.checksum);
  text(v.reason, 2000, "revisionReason", { nonblank: true });
  return v;
}
function reportShape(value) {
  const r = own(value, { bytes: 4194304 });
  obj(r, [
    "format",
    "kind",
    "version",
    "methodVersion",
    "id",
    "orgId",
    "title",
    "createdBy",
    "createdAt",
    "audience",
    "selection",
    "manifest",
    "basis",
    "assessment",
    "feedback",
    "sources",
    "approvedEvidence",
    "events",
    "exclusions",
    "boundaries",
    "supersedes",
    "checksum",
  ]);
  en(r.format, ["charitology-os-report"]);
  en(r.kind, ["learning-review"]);
  en(r.version, [1]);
  en(r.methodVersion, ["learning-review-v1"]);
  id(r.id);
  id(r.orgId);
  text(r.title, 180, "title", { nonblank: true });
  id(r.createdBy);
  instant(r.createdAt);
  en(r.audience, ["private-staff"]);
  validateLearningFinalSelection(r.selection);
  validateLearningManifest(r.manifest);
  if (
    r.title !== r.manifest.title ||
    r.orgId !== r.selection.selection.head.originOrgId ||
    r.orgId !== r.selection.manifest.originOrgId ||
    r.orgId !== r.selection.selection.program.originOrgId
  )
    fail(
      "learning_report",
      "Report organization/title differs from its live selected manifest.",
    );
  arr(r.sources, 1, "sources", 1);
  r.sources.forEach(validateLearningSourceCapture);
  arr(r.approvedEvidence, 600);
  r.approvedEvidence.forEach(validateLearningEvidence);
  arr(r.events, 1000);
  r.events.forEach(validateLearningEvent);
  arr(r.exclusions, 200);
  const ex = new Set();
  for (const x of r.exclusions) {
    obj(x, ["recordId", "revision", "reason", "replacedBy"]);
    id(x.recordId);
    num(x.revision, 1, 2147483647);
    en(x.reason, [
      "not-selected",
      "replaced",
      "outside-period",
      "unapproved",
      "different-mapping",
      "deleted",
      "pending-correction",
      "abandoned-correction",
      "unresolved-correction",
    ]);
    if (x.replacedBy !== null) id(x.replacedBy);
    if (
      (x.reason === "replaced") !== (x.replacedBy !== null) ||
      ex.has(x.recordId)
    )
      fail(
        "learning_exclusion",
        "Exclusion identities/replacement reasons differ.",
      );
    ex.add(x.recordId);
  }
  arr(r.boundaries, 64);
  for (const b of r.boundaries) {
    obj(b, ["kind", "pin"]);
    en(b.kind, ["source-parent", "event-parent"]);
    if (b.kind === "source-parent") validateLearningSourcePin(b.pin);
    else validateLearningHeadPin(b.pin);
  }
  ruleAssessment(r.assessment);
  feedbackAssessment(r.feedback);
  validateSupersedes(r.supersedes);
  checked("report", r);
  return r;
}
export function validateLearningReport(value, context) {
  const r = reportShape(value),
    s = r.selection.selection,
    es = r.approvedEvidence;
  if (!same(sourcePin(r.sources[0]), s.source))
    fail("learning_source", "The report primary source differs.");
  const mapping = r.events.find((e) => e.sha256 === s.mappingEventSha256);
  if (
    !mapping ||
    !["mapped", "adopted"].includes(mapping.payload.kind) ||
    !same(mapping.payload.source, s.source) ||
    !same(mapping.payload.mapping.basis, r.basis)
  )
    fail("learning_mapping", "The report mapping/basis is missing or changed.");
  const ds = r.events.find(
    (e) =>
      e.payload.kind === "decided" &&
      e.payload.record.recordId === s.decision.recordId,
  );
  if (
    !ds ||
    !same(ds.payload.input.observations, s.observations) ||
    !same(ds.payload.input.discussedDefinitions, s.definitions) ||
    !same(ds.payload.input.assessment, r.assessment) ||
    !same(ds.payload.input.feedback, r.feedback) ||
    !same(ds.payload.input.program, s.program) ||
    !same(ds.payload.input.protocol, s.protocol)
  )
    fail(
      "learning_decision",
      "The report selection/assessment differs from its explicit decision.",
    );
  const proofMap = new Map(),
    pinSet = new Set(),
    requiredProofs = new Set();
  for (const e of es) {
    const key = learningCanonical(e.pin);
    if (proofMap.has(e.sha256) || pinSet.has(key))
      fail(
        "learning_duplicate",
        "Repeated or competing report approval evidence.",
      );
    proofMap.set(e.sha256, e);
    pinSet.add(key);
  }
  for (const p of [
    ...selectedPins(s),
    r.selection.manifest,
    ...r.events.flatMap(learningEventRecordPins),
  ])
    requiredProofs.add(pinEvidence(es, p).sha256);
  if (requiredProofs.size !== es.length)
    fail(
      "learning_closure",
      "A selected report includes unrelated approval evidence.",
    );
  for (const e of r.events) {
    if (
      e.originOrgId !== s.head.originOrgId ||
      e.bindingId !== s.head.bindingId ||
      e.sequence > s.head.sequence
    )
      fail("learning_event", "Report events leave the selected binding/head.");
  }
  const headIds = new Set();
  for (const e of r.events) {
    if (headIds.has(e.sha256))
      fail("learning_duplicate", "Repeated report events.");
    headIds.add(e.sha256);
  }
  if (
    !same([...r.events].sort(eventSort), r.events) ||
    !same(
      [...es].sort((a, b) => cmp(a.sha256, b.sha256)),
      es,
    )
  )
    fail(
      "learning_order",
      "Report proof arrays must retain their deterministic order.",
    );
  if (!same(boundariesFor(s, r.sources, r.events), r.boundaries))
    fail(
      "learning_boundary",
      "Enumerate exactly every omitted source/event parent pin.",
    );
  validateLearningSelectedProof(r, mapping, ds);
  const mproof = pinEvidence(es, r.selection.manifest);
  if (
    mproof.snapshot.status !== "approved" ||
    mproof.snapshot.files.length ||
    !same(mproof.snapshot.data, r.manifest) ||
    r.manifest.programId !== mapping.programId ||
    !same(
      r.manifest.outcomeIds,
      s.observations.map((p) => p.recordId),
    ) ||
    r.manifest.sourceDigest !== r.selection.sourceDigest
  )
    fail("learning_manifest", "The approved manifest differs from its report.");
  if (
    (r.supersedes === null) !== (r.manifest.supersedesReportId === null) ||
    (r.supersedes &&
      (r.supersedes.reportId !== r.manifest.supersedesReportId ||
        r.supersedes.reason !== r.manifest.revisionReason))
  )
    fail("learning_supersedes", "The prior report/reason differs.");
  const ctx = {
    source: r.sources[0],
    mappingEvent: mapping,
    evidence: es,
    events: r.events,
  };
  const dec = compileLearningDecision(ds.payload.input, ctx),
    dp = pinEvidence(es, s.decision);
  if (
    dp.snapshot.status !== "decided" ||
    dp.snapshot.files.length ||
    !same(dp.snapshot.data, dec.data) ||
    ds.payload.record.dataSha256 !== H("data", dec.data)
  )
    fail(
      "learning_decision",
      "The approved decision does not reproduce its exact compiler.",
    );
  for (const p of s.observations) {
    const e = pinEvidence(es, p),
      origin = r.events.find(
        (x) =>
          ["measured", "corrected"].includes(x.payload.kind) &&
          x.payload.record.recordId === p.recordId,
      );
    if (!origin)
      fail("learning_reference", "A selected point origin is missing.");
    const input =
      origin.payload.kind === "measured"
        ? origin.payload.input
        : origin.payload.input.measurement;
    const data = compileLearningMeasurement(input, ctx).data;
    if (
      e.snapshot.files.length ||
      !["approved", "included"].includes(e.snapshot.status) ||
      !same(e.snapshot.data, data) ||
      input.period.startDate < r.manifest.startDate ||
      input.period.endDate > r.manifest.endDate
    )
      fail(
        "learning_observation",
        "Selected observations require exact approval, compiler and contained actual period.",
      );
  }
  if (!s.observations.length && !r.manifest.missingness.trim())
    fail(
      "learning_missing",
      "A zero-observation report must retain explicit missingness.",
    );
  if (
    learningSelectionDigest({
      selection: s,
      sources: r.sources,
      approvedEvidence: es,
      manifest: r.manifest,
    }) !== r.selection.sourceDigest
  )
    fail("learning_digest", "The exact selected source digest differs.");
  if (context) {
    const closure = selectLearningReportClosure(s, context, {
      manifestPin: r.selection.manifest,
    });
    for (const k of [
      "sources",
      "approvedEvidence",
      "events",
      "boundaries",
      "basis",
      "assessment",
      "feedback",
    ])
      if (!same(closure[k], r[k]))
        fail(
          "learning_closure",
          "The report is not the exact selected immutable proof closure.",
        );
    if (
      !same(
        closure.exclusions.map((x) => x.recordId),
        r.exclusions.map((x) => x.recordId),
      )
    )
      fail(
        "learning_exclusion",
        "Exclusions must enumerate every unselected historical binding measurement in order.",
      );
    for (let i = 0; i < closure.exclusions.length; i++) {
      const expected = closure.exclusions[i],
        actual = r.exclusions[i];
      if (
        [
          "replaced",
          "pending-correction",
          "abandoned-correction",
          "unresolved-correction",
          "different-mapping",
        ].includes(expected.reason) &&
        (expected.reason !== actual.reason ||
          expected.replacedBy !== actual.replacedBy)
      )
        fail(
          "learning_exclusion",
          "Exclusion correction/mapping provenance differs.",
        );
    }
    const old = context.reports ?? [];
    if (r.supersedes) {
      const p = old.find(
        (p) =>
          p.id === r.supersedes.reportId &&
          p.checksum === r.supersedes.checksum,
      );
      if (
        !p ||
        p.selection.selection.program.recordId !== s.program.recordId ||
        p.id === r.id
      )
        fail(
          "learning_supersedes",
          "The prior exact report must exist internally for this program.",
        );
    }
  }
  return r;
}
export function makeLearningReport(core, context) {
  const c = own(core, { bytes: 131072 });
  obj(c, [
    "id",
    "orgId",
    "title",
    "createdBy",
    "createdAt",
    "selection",
    "manifest",
    "supersedes",
  ]);
  const selected = validateLearningFinalSelection(c.selection),
    closure = selectLearningReportClosure(selected.selection, context, {
      manifestPin: selected.manifest,
    });
  return validateLearningReport(
    seal("report", {
      format: "charitology-os-report",
      kind: "learning-review",
      version: 1,
      methodVersion: "learning-review-v1",
      ...c,
      audience: "private-staff",
      ...closure,
    }),
    context,
  );
}
export function validateLearningBackup(value) {
  const b = own(value, { bytes: 67108864 });
  obj(b, [
    "format",
    "version",
    "method",
    "sources",
    "approvedEvidence",
    "events",
    "reports",
  ]);
  en(b.format, ["charitology-learning-backup"]);
  en(b.version, [1]);
  en(b.method, ["learning-review-v1"]);
  arr(b.sources, 160);
  arr(b.approvedEvidence, 600);
  arr(b.events, 1000);
  arr(b.reports, 20);
  if (b.sources.length + b.approvedEvidence.length + b.events.length > 1000)
    fail(
      "learning_limit",
      "The combined nonreport history exceeds 1000 entries.",
    );
  const ctx = {
    sources: b.sources,
    approvedEvidence: b.approvedEvidence,
    events: b.events,
    reports: b.reports,
  };
  foldLearningHistory({
    sources: b.sources,
    approvedEvidence: b.approvedEvidence,
    events: b.events,
  });
  if (
    !same([...b.sources].sort(sourceSort), b.sources) ||
    !same(
      [...b.approvedEvidence].sort((a, b) => cmp(a.sha256, b.sha256)),
      b.approvedEvidence,
    ) ||
    !same([...b.events].sort(eventSort), b.events) ||
    !same([...b.reports].sort(reportSort), b.reports)
  )
    fail(
      "learning_order",
      "Full learning arrays must have their deterministic canonical order.",
    );
  const reports = new Set();
  for (const r of b.reports) {
    validateLearningReport(r, ctx);
    if (reports.has(r.id))
      fail("learning_duplicate", "Repeated complete learning reports.");
    reports.add(r.id);
    const e = b.events.find(
      (e) =>
        e.payload.kind === "report-frozen" &&
        e.payload.reportId === r.id &&
        e.payload.reportChecksum === r.checksum &&
        same(e.payload.selection, r.selection),
    );
    if (!e || e.actorId !== r.createdBy)
      fail(
        "learning_report",
        "A full backup report needs its exact accepted freeze event.",
      );
  }
  for (const e of b.events)
    if (
      e.payload.kind === "report-frozen" &&
      !b.reports.some(
        (r) =>
          r.id === e.payload.reportId &&
          r.checksum === e.payload.reportChecksum,
      )
    )
      fail("learning_report", "A retained report-frozen event has no report.");
  const referencedSources = new Set(
    b.events
      .filter((e) => ["mapped", "adopted"].includes(e.payload.kind))
      .map((e) => e.payload.source.sha256),
  );
  for (const s of b.sources)
    if (!referencedSources.has(s.sha256))
      fail(
        "learning_orphan",
        "A retained source has no accepted mapping/adoption.",
      );
  const referencedEvidence = new Set();
  for (const e of b.events)
    for (const p of learningEventRecordPins(e))
      referencedEvidence.add(pinEvidence(b.approvedEvidence, p).sha256);
  for (const e of b.approvedEvidence)
    if (!referencedEvidence.has(e.sha256))
      fail(
        "learning_orphan",
        "Approval evidence is not referenced by retained history.",
      );
  return b;
}
