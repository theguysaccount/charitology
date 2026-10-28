/** Pure learning compiler and immutable lifecycle. No database, clock, IDs or access grants. */
import { validateRecord } from "./modules.mjs";
import {
  learningOwned as own,
  learningCanonical,
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
} from "./learning-json.mjs";
import {
  validateLearningSourceCapture,
  sourcePin,
} from "./learning-native.mjs";
import {
  validateLearningMapping,
  mappingShape,
  validateLearningMeasurement,
  validateLearningCorrection,
  validateLearningDecision,
  validateLearningSelection,
  validateLearningFinalSelection,
  validateLearningEvidence,
  validateLearningHeadPin,
  validateLearningSourcePin,
  validateLearningWorkingPin,
  validateLearningRecordPin,
  learningEvidenceFor,
  validateLearningCorrectionApply,
  validateLearningCorrectionAbandon,
  learningReferenceRows,
} from "./learning-validation.mjs";
export {
  validateLearningMapping,
  validateLearningMeasurement,
  validateLearningCorrection,
  validateLearningDecision,
  validateLearningSelection,
  validateLearningFinalSelection,
  validateLearningEvidence,
  validateLearningHeadPin,
  validateLearningSourcePin,
  validateLearningWorkingPin,
  validateLearningRecordPin,
  validateLearningCorrectionApply,
  validateLearningCorrectionAbandon,
};
export const headPin = (e) => {
  const v = validateLearningEvent(e);
  return freeze({
    originOrgId: v.originOrgId,
    bindingId: v.bindingId,
    sequence: v.sequence,
    eventSha256: v.sha256,
  });
};
export const workingPin = (r) =>
  validateLearningWorkingPin({
    moduleId: r.moduleId,
    recordId: r.id,
    revision: r.revision,
    dataSha256: H("data", r.data),
  });
export const recordPin = (e) => validateLearningEvidence(e).pin;
const block = (name, value) =>
  "LEARNING-" + name + "-V1\n" + learningCanonical(value);
function normalized(module, data, records) {
  for (const [k, v] of Object.entries(data))
    if (typeof v === "string" && v.length > (k === "title" ? 240 : 4000))
      fail(
        "learning_composed",
        "The complete generated field exceeds its ordinary bound.",
        k,
      );
  return validateRecord(module, data, {
    status: "draft",
    records: records ?? learningReferenceRows(module, data),
  });
}
export function compileLearningMapping(
  source,
  value,
  programId,
  { records } = {},
) {
  const s = validateLearningSourceCapture(source),
    m = validateLearningMapping(value, s);
  id(programId);
  const p = sourcePin(s);
  const indicators = m.indicators.map((x) => ({
    slot: x.slot,
    data: normalized(
      "outcomes",
      {
        title: x.title,
        kind: "indicator",
        programId,
        indicatorId: null,
        value: null,
        unit: x.unit.kind === "defined" ? x.unit.text : null,
        denominator: null,
        startDate:
          x.plannedPeriod.kind === "closed-days"
            ? x.plannedPeriod.startDate
            : null,
        endDate:
          x.plannedPeriod.kind === "closed-days"
            ? x.plannedPeriod.endDate
            : null,
        geography: x.geography,
        method: "unknown",
        evidence: "unknown",
        sourceUrl: null,
        limitations: block("DEFINITION", {
          source: p,
          slot: x.slot,
          origin: x.origin,
          unit: x.unit,
          population: x.population,
          geography: x.geography,
          plannedPeriod: x.plannedPeriod,
          limitations: x.limitations,
        }),
      },
      records,
    ),
  }));
  const protocol = normalized(
    "evaluation",
    {
      title: m.protocol.title,
      kind: "protocol",
      programId,
      outcomeIds: [],
      question: block("INTENT", {
        source: p,
        question: m.protocol.question,
        basis: { intendedOutcome: m.basis.intendedOutcome, rule: m.basis.rule },
      }),
      method: m.protocol.method,
      counterfactual: block("COMPARISON", {
        source: p,
        comparison: m.basis.comparison,
      }),
      evidenceStrength: "unknown",
      uncertainty: block("FEEDBACK", {
        source: p,
        feedback: m.basis.feedback,
        uncertainty: m.protocol.uncertainty,
      }),
      harms: m.protocol.harms || null,
      decision: "undecided",
      reviewDate: m.protocol.reviewDate,
    },
    records,
  );
  return freeze({ mapping: m, indicators, protocol });
}
function mappingContext(ctx) {
  const source = validateLearningSourceCapture(ctx.source),
    event = validateLearningEvent(ctx.mappingEvent);
  if (
    !["mapped", "adopted"].includes(event.payload.kind) ||
    !same(event.payload.source, sourcePin(source))
  )
    fail("learning_mapping", "Use the exact source and mapping event.");
  const compiled = compileLearningMapping(
    source,
    event.payload.mapping,
    event.programId,
    { records: ctx.records },
  );
  return {
    source,
    event,
    compiled,
    evidence: ctx.evidence.map(validateLearningEvidence),
  };
}
function expectedProof(evidence, p, module, statuses) {
  const e = learningEvidenceFor(evidence, p);
  if (
    e.pin.moduleId !== module ||
    !statuses.includes(e.snapshot.status) ||
    (module !== "programs" && e.snapshot.files.length)
  )
    fail("learning_approval", "Use an exact final-state ordinary approval.");
  return e;
}
function measurementContext(input, ctx) {
  const c = mappingContext(ctx),
    x = input;
  if (
    x.mappingEventSha256 !== c.event.sha256 ||
    x.head.originOrgId !== c.event.originOrgId ||
    x.head.bindingId !== c.event.bindingId ||
    x.head.sequence < c.event.sequence ||
    [x.program, x.protocol, x.definition].some(
      (p) => p.originOrgId !== c.event.originOrgId,
    )
  )
    fail(
      "learning_mapping",
      "The selected mapping changed or a pin leaves its organization.",
    );
  const program = expectedProof(c.evidence, x.program, "programs", [
    "approved",
    "active",
  ]);
  if (
    program.snapshot.data.kind !== "program" ||
    program.snapshot.id !== c.event.programId ||
    H("data", program.snapshot.data) !== c.event.payload.program.dataSha256
  )
    fail("learning_program", "Program data changed after mapping.");
  const definitions = c.event.payload.records.filter(
      (r) => r.moduleId === "outcomes",
    ),
    i = definitions.findIndex((r) => r.recordId === x.definition.recordId);
  if (i < 0)
    fail("learning_definition", "The definition is not in this mapping.");
  const def = expectedProof(c.evidence, x.definition, "outcomes", [
      "approved",
      "included",
    ]),
    protocol = expectedProof(c.evidence, x.protocol, "evaluation", [
      "registered",
    ]);
  const pr = c.event.payload.records.find((r) => r.moduleId === "evaluation");
  if (
    !pr ||
    protocol.snapshot.id !== pr.recordId ||
    !same(protocol.snapshot.data, c.compiled.protocol) ||
    !same(def.snapshot.data, c.compiled.indicators[i].data)
  )
    fail(
      "learning_compiled",
      "Approved definition or protocol differs from the exact mapping.",
    );
  return { ...c, index: i, definition: def, protocol, program };
}
export function compileLearningMeasurement(value, ctx) {
  const x = validateLearningMeasurement(value),
    c = measurementContext(x, ctx),
    choice = c.event.payload.mapping.indicators[c.index],
    u = choice.unit;
  if (u.kind !== "defined")
    fail(
      "learning_unit",
      "Define the approved unit through a new mapping before measurement.",
    );
  if (x.value !== null) {
    if (
      u.quantityKind === "count" &&
      (!Number.isSafeInteger(x.value) || x.value < 0)
    )
      fail("learning_quantity", "Counts are nonnegative whole quantities.");
    if (u.quantityKind === "percentage" && (x.value < 0 || x.value > 100))
      fail("learning_quantity", "Percentage means a share from 0 to 100.");
    if (u.quantityKind === "rate" && x.value < 0)
      fail("learning_quantity", "Rates are nonnegative.");
  }
  if (["rate", "percentage"].includes(u.quantityKind) && !(x.denominator > 0))
    fail(
      "learning_denominator",
      "This approved quantity requires a positive measured denominator, including missing values.",
    );
  const data = normalized(
    "outcomes",
    {
      title: x.title,
      kind: "observation",
      programId: c.event.programId,
      indicatorId: x.definition.recordId,
      value: x.value,
      unit: u.text,
      denominator: x.denominator,
      startDate: x.period.startDate,
      endDate: x.period.endDate,
      geography: choice.geography,
      method: x.method,
      evidence: x.evidence,
      sourceUrl: x.sourceUrl,
      limitations: block("MEASUREMENT", {
        definition: x.definition,
        locator: x.locator,
        missingReason: x.missingReason,
        limitations: x.limitations,
      }),
    },
    ctx.records,
  );
  return freeze({ input: x, data });
}
function decisionLifecycle(input, events) {
  const attempts = new Map(),
    edges = new Set(),
    questioned = new Set(),
    candidates = new Map();
  for (const e of events) {
    if (
      e.originOrgId !== input.head.originOrgId ||
      e.bindingId !== input.head.bindingId ||
      e.sequence > input.head.sequence
    )
      continue;
    const p = e.payload;
    if (p.kind === "corrected") {
      attempts.set(e.sha256, {
        candidate: p.record.recordId,
        replaces: p.input.replaces.recordId,
        state: "pending",
      });
      candidates.set(p.record.recordId, e.sha256);
      questioned.add(p.input.replaces.recordId);
    } else if (p.kind === "correction-applied") {
      const a = attempts.get(p.correctionEventSha256);
      if (!a)
        fail("learning_correction", "The exact correction attempt is missing.");
      a.state = "applied";
      edges.add(a.replaces);
      questioned.delete(a.replaces);
    } else if (p.kind === "correction-abandoned") {
      const a = attempts.get(p.correctionEventSha256);
      if (!a)
        fail("learning_correction", "The exact correction attempt is missing.");
      a.state = "abandoned";
    }
  }
  for (const pin of input.observations)
    if (
      edges.has(pin.recordId) ||
      questioned.has(pin.recordId) ||
      (candidates.has(pin.recordId) &&
        attempts.get(candidates.get(pin.recordId)).state !== "applied")
    )
      fail(
        "learning_correction",
        "Select only effective unchallenged observations.",
      );
}
function originFor(events, p) {
  for (const e of events) {
    if (
      e.payload.kind === "measured" &&
      e.payload.record.recordId === p.recordId
    )
      return { event: e, input: e.payload.input };
    if (
      e.payload.kind === "corrected" &&
      e.payload.record.recordId === p.recordId
    )
      return { event: e, input: e.payload.input.measurement };
  }
  fail("learning_reference", "The exact observation origin event is missing.");
}
export function compileLearningDecision(value, ctx) {
  const x = validateLearningDecision(value),
    c = mappingContext(ctx);
  decisionLifecycle(x, ctx.events);
  if (
    x.mappingEventSha256 !== c.event.sha256 ||
    x.head.originOrgId !== c.event.originOrgId ||
    x.head.bindingId !== c.event.bindingId ||
    [x.program, x.protocol, ...x.discussedDefinitions, ...x.observations].some(
      (p) => p.originOrgId !== c.event.originOrgId,
    )
  )
    fail("learning_mapping", "The selected mapping differs.");
  const program = expectedProof(c.evidence, x.program, "programs", [
    "approved",
    "active",
  ]);
  if (
    program.snapshot.id !== c.event.programId ||
    H("data", program.snapshot.data) !== c.event.payload.program.dataSha256
  )
    fail("learning_program", "Program data changed after mapping.");
  const protocol = expectedProof(c.evidence, x.protocol, "evaluation", [
    "registered",
  ]);
  const pc = c.event.payload.records.find((r) => r.moduleId === "evaluation");
  if (
    !pc ||
    pc.recordId !== protocol.snapshot.id ||
    !same(protocol.snapshot.data, c.compiled.protocol)
  )
    fail(
      "learning_compiled",
      "The approved protocol differs from its exact compiler.",
    );
  const ids = c.event.payload.records
      .filter((r) => r.moduleId === "outcomes")
      .map((r) => r.recordId),
    definitions = x.discussedDefinitions.map((p) => {
      const e = expectedProof(c.evidence, p, "outcomes", [
          "approved",
          "included",
        ]),
        i = ids.indexOf(p.recordId);
      if (i < 0 || !same(e.snapshot.data, c.compiled.indicators[i].data))
        fail("learning_definition", "Use an exact mapped approved definition.");
      return p;
    });
  if (
    definitions.some(
      (p, i) =>
        i &&
        ids.indexOf(p.recordId) <= ids.indexOf(definitions[i - 1].recordId),
    )
  )
    fail(
      "learning_definition",
      "Discussed definitions must follow mapping-slot order.",
    );
  const derived = [];
  for (const p of x.observations) {
    const e = expectedProof(c.evidence, p, "outcomes", [
        "approved",
        "included",
      ]),
      o = originFor(ctx.events, p);
    if (
      o.input.mappingEventSha256 !== c.event.sha256 ||
      !same(o.input.protocol, x.protocol) ||
      !same(e.snapshot.data, compileLearningMeasurement(o.input, ctx).data)
    )
      fail(
        "learning_observation",
        "The observation does not use these exact mapping/approval pins.",
      );
    if (!derived.some((q) => same(q, o.input.definition)))
      derived.push(o.input.definition);
  }
  derived.sort((a, b) => ids.indexOf(a.recordId) - ids.indexOf(b.recordId));
  if (x.observations.length && !same(derived, definitions))
    fail(
      "learning_definition",
      "Discussion pins must equal the exact observation definition set.",
    );
  const rule = c.event.payload.mapping.basis.rule,
    dis = rule.basis.disposition,
    a = x.assessment;
  if (
    (dis === "not-adopted" && a.result !== "not-adopted") ||
    (dis === "uncollected" && a.result !== "unassessable") ||
    (["adopted", "adapted"].includes(dis) &&
      !["met", "not-met", "unassessable"].includes(a.result))
  )
    fail(
      "learning_rule",
      "The authored assessment does not match the adopted rule disposition.",
    );
  const expected =
    a.result === "met"
      ? rule.whenMet
      : a.result === "not-met"
        ? rule.whenNotMet
        : null;
  if (
    (expected !== null && expected !== x.action) !==
    (a.departureReason !== null)
  )
    fail(
      "learning_rule",
      "Explain only a departure from an explicit planned action.",
    );
  const data = normalized(
    "evaluation",
    {
      title: x.title,
      kind: "decision",
      programId: c.event.programId,
      outcomeIds: x.observations.map((p) => p.recordId),
      question: protocol.snapshot.data.question,
      method: protocol.snapshot.data.method,
      counterfactual: protocol.snapshot.data.counterfactual,
      evidenceStrength: "unknown",
      uncertainty: block("DECISION", {
        protocol: x.protocol,
        discussedDefinitions: x.discussedDefinitions,
        assessment: x.assessment,
        feedback: x.feedback,
        uncertainty: x.uncertainty,
        noEvidenceReason: x.noEvidenceReason,
      }),
      harms: x.harms || null,
      decision: x.action,
      reviewDate: x.followUp,
    },
    ctx.records,
  );
  return freeze({ input: x, data });
}
function created(v) {
  obj(v, ["moduleId", "recordId", "revision", "dataSha256"]);
  en(v.moduleId, ["outcomes", "evaluation"]);
  id(v.recordId);
  if (v.revision !== 1)
    fail("learning_revision", "Created drafts start at revision 1.");
  hash(v.dataSha256);
  return v;
}
export function validateLearningEvent(value) {
  const e = own(value, { bytes: 131072 });
  obj(e, [
    "format",
    "version",
    "originOrgId",
    "bindingId",
    "sequence",
    "previous",
    "actorId",
    "recordedAt",
    "programId",
    "payload",
    "sha256",
  ]);
  en(e.format, ["charitology-learning-event"]);
  en(e.version, [1]);
  id(e.originOrgId);
  id(e.bindingId);
  num(e.sequence, 1, 1000);
  id(e.actorId);
  id(e.programId);
  instant(e.recordedAt);
  if (e.sequence === 1) {
    if (e.previous !== null)
      fail("learning_event_chain", "A root event has no predecessor.");
  } else {
    const p = validateLearningHeadPin(e.previous);
    if (
      p.originOrgId !== e.originOrgId ||
      p.bindingId !== e.bindingId ||
      p.sequence !== e.sequence - 1
    )
      fail(
        "learning_event_chain",
        "Event sequence/predecessor identity differs.",
      );
  }
  const p = e.payload;
  switch (p?.kind) {
    case "mapped":
    case "adopted":
      obj(
        p,
        p.kind === "mapped"
          ? [
              "kind",
              "mode",
              "source",
              "program",
              "mapping",
              "mappingNumber",
              "records",
            ]
          : [
              "kind",
              "recoveredHead",
              "source",
              "program",
              "mapping",
              "mappingNumber",
              "records",
            ],
      );
      if (p.kind === "mapped") en(p.mode, ["new", "refresh", "remap"]);
      else validateLearningHeadPin(p.recoveredHead);
      validateLearningSourcePin(p.source);
      validateLearningWorkingPin(p.program);
      if (
        p.program.moduleId !== "programs" ||
        p.program.recordId !== e.programId
      )
        fail("learning_program", "Mapping program identity differs.");
      mappingShape(p.mapping);
      num(p.mappingNumber, 1, 8);
      arr(p.records, 11, "records", 2);
      if (p.records.length !== p.mapping.indicators.length + 1)
        fail(
          "learning_records",
          "Map one draft per indicator and one protocol.",
        );
      for (const [r, i] of p.records.map((r, i) => [r, i])) {
        created(r);
        if (
          r.moduleId !==
          (i === p.records.length - 1 ? "evaluation" : "outcomes")
        )
          fail(
            "learning_records",
            "Created records must follow slot order, then protocol.",
          );
      }
      if (new Set(p.records.map((r) => r.recordId)).size !== p.records.length)
        fail("learning_records", "Created draft IDs must be unique.");
      break;
    case "measured":
      obj(p, ["kind", "input", "record"]);
      validateLearningMeasurement(p.input);
      created(p.record);
      if (p.record.moduleId !== "outcomes")
        fail("learning_records", "Measurement must create an outcome.");
      break;
    case "corrected":
      obj(p, ["kind", "input", "record"]);
      validateLearningCorrection(p.input);
      created(p.record);
      if (p.record.moduleId !== "outcomes")
        fail("learning_records", "Correction must create an outcome.");
      break;
    case "correction-applied":
      obj(p, ["kind", "correctionEventSha256", "replaces", "replacement"]);
      hash(p.correctionEventSha256);
      validateLearningRecordPin(p.replaces);
      validateLearningRecordPin(p.replacement);
      if (
        p.replaces.moduleId !== "outcomes" ||
        p.replacement.moduleId !== "outcomes"
      )
        fail("learning_records", "Correction pins must identify observations.");
      break;
    case "correction-abandoned":
      obj(p, ["kind", "correctionEventSha256", "candidateRecordId", "reason"]);
      hash(p.correctionEventSha256);
      id(p.candidateRecordId);
      text(p.reason, 2000, "reason", { nonblank: true });
      break;
    case "decided":
      obj(p, ["kind", "input", "record"]);
      validateLearningDecision(p.input);
      created(p.record);
      if (p.record.moduleId !== "evaluation")
        fail("learning_records", "Decision must create an evaluation record.");
      break;
    case "report-frozen":
      obj(p, [
        "kind",
        "selection",
        "reportId",
        "reportChecksum",
        "frozenManifest",
      ]);
      validateLearningFinalSelection(p.selection);
      id(p.reportId);
      hash(p.reportChecksum);
      validateLearningWorkingPin(p.frozenManifest);
      if (
        p.frozenManifest.moduleId !== "reporting" ||
        p.frozenManifest.recordId !== p.selection.selection.manifestRecordId
      )
        fail("learning_manifest", "Frozen manifest differs.");
      break;
    default:
      fail("learning_event", "Unknown learning event kind.");
  }
  checked("event", e);
  return e;
}
export function makeLearningEvent(core) {
  return validateLearningEvent(seal("event", core));
}
export function learningEventRecordPins(event) {
  const p = event.payload;
  switch (p.kind) {
    case "measured":
      return [p.input.program, p.input.protocol, p.input.definition];
    case "corrected":
      return [
        p.input.measurement.program,
        p.input.measurement.protocol,
        p.input.measurement.definition,
        p.input.replaces,
      ];
    case "correction-applied":
      return [p.replaces, p.replacement];
    case "decided":
      return [
        p.input.program,
        p.input.protocol,
        ...p.input.observations,
        ...p.input.discussedDefinitions,
      ];
    case "report-frozen":
      return [
        p.selection.selection.program,
        p.selection.selection.protocol,
        ...p.selection.selection.definitions,
        ...p.selection.selection.observations,
        p.selection.selection.decision,
        p.selection.manifest,
      ];
    default:
      return [];
  }
}
export function foldLearningHistory(value) {
  const v = own(value, { bytes: 67108864 });
  obj(v, ["sources", "approvedEvidence", "events"]);
  arr(v.sources, 160);
  arr(v.approvedEvidence, 600);
  arr(v.events, 1000);
  const sources = v.sources.map(validateLearningSourceCapture),
    evidence = v.approvedEvidence.map(validateLearningEvidence),
    events = v.events.map(validateLearningEvent);
  const sm = new Map(),
    em = new Map(),
    groups = new Map(),
    createdIds = new Set(),
    programIds = new Set(events.map((e) => e.programId)),
    evidencePins = new Set();
  for (const s of sources) {
    if (sm.has(s.sha256))
      fail("learning_duplicate", "Repeated retained sources.");
    sm.set(s.sha256, s);
  }
  for (const s of sources)
    if (
      s.previousSource &&
      !same(sourcePin(sm.get(s.previousSource.sha256) ?? {}), s.previousSource)
    )
      fail(
        "learning_source_chain",
        "A complete local source parent is missing.",
      );
  for (const e of evidence) {
    const identity = learningCanonical(e.pin);
    if (evidencePins.has(identity))
      fail(
        "learning_duplicate",
        "One approval pin cannot have competing evidence bodies.",
      );
    evidencePins.add(identity);
    if (em.has(e.sha256))
      fail("learning_duplicate", "Repeated retained approval evidence.");
    em.set(e.sha256, e);
  }
  const eventHashes = new Set();
  for (const e of events) {
    if (eventHashes.has(e.sha256))
      fail("learning_duplicate", "Repeated retained events.");
    eventHashes.add(e.sha256);
    const k = e.originOrgId + "\0" + e.bindingId;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  if (groups.size > 20) fail("learning_limit", "Retained bindings exceed 20.");
  const bindings = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.sequence - b.sequence);
    const root = list[0],
      b = {
        originOrgId: root.originOrgId,
        bindingId: root.bindingId,
        programId: root.programId,
        head: null,
        source: null,
        mappingEvent: null,
        mappingNumber: 0,
        sources: sources.filter(
          (s) =>
            s.originOrgId === root.originOrgId &&
            s.bindingId === root.bindingId,
        ),
        events: list,
        measurements: [],
        decisions: [],
        corrections: [],
        effectiveEdges: [],
        effectiveLeafRecordIds: [],
        questionedRecordIds: [],
      };
    const allMeasurements = new Map(),
      attempts = new Map(),
      outgoing = new Map(),
      reserved = new Map(),
      questions = new Set(),
      usedSources = new Set();
    let previous = null,
      localSourceVersion = 0,
      localSource = null;
    for (const e of list) {
      if (
        e.sequence !== (previous?.sequence ?? 0) + 1 ||
        !same(e.previous, previous ? headPin(previous) : null) ||
        e.programId !== b.programId
      )
        fail(
          "learning_event_chain",
          "The full binding history has a gap, fork or changed program.",
        );
      for (const p of learningEventRecordPins(e))
        learningEvidenceFor(evidence, p);
      const p = e.payload;
      if (["mapped", "adopted"].includes(p.kind)) {
        if (!previous && !(p.kind === "adopted" || p.mode === "new"))
          fail(
            "learning_event_chain",
            "A live root must map a new source or adopt recovered provenance.",
          );
        if (previous && (p.kind === "adopted" || p.mode === "new"))
          fail(
            "learning_event_chain",
            "An existing binding cannot acquire another root.",
          );
        if (p.mappingNumber !== b.mappingNumber + 1)
          fail("learning_mapping", "Mapping numbers must be contiguous.");
        const s = sm.get(p.source.sha256);
        if (!s || !same(sourcePin(s), p.source))
          fail(
            "learning_source",
            "The exact selected source capture is missing.",
          );
        if (b.source) {
          const old = sm.get(b.source.sha256);
          if (
            old.adapter !== s.adapter ||
            old.nativeIdentity !== s.nativeIdentity ||
            !same(old.selection, s.selection)
          )
            fail(
              "learning_source",
              "Refresh/remap cannot relink a different native identity.",
            );
        }
        if (
          p.kind === "mapped" &&
          p.mode !== "remap" &&
          (s.originOrgId !== e.originOrgId || s.bindingId !== e.bindingId)
        )
          fail(
            "learning_source",
            "A new upload belongs to its own live binding.",
          );
        if (p.kind === "mapped" && p.mode !== "remap") {
          if (
            s.sourceVersion !== localSourceVersion + 1 ||
            !same(s.previousSource, localSource)
          )
            fail(
              "learning_source_chain",
              "A new upload must advance the exact local capture chain once.",
            );
          localSourceVersion = s.sourceVersion;
          localSource = sourcePin(s);
        } else if (p.kind === "mapped" && !usedSources.has(s.sha256))
          fail(
            "learning_source_chain",
            "Remap only a previously accepted source in this binding.",
          );
        usedSources.add(s.sha256);
        const c = compileLearningMapping(s, p.mapping, e.programId);
        for (const [r, i] of p.records.map((r, i) => [r, i])) {
          if (createdIds.has(r.recordId) || programIds.has(r.recordId))
            fail(
              "learning_identity",
              "Created record IDs are globally unique.",
            );
          createdIds.add(r.recordId);
          if (
            r.dataSha256 !==
            H(
              "data",
              i < c.indicators.length ? c.indicators[i].data : c.protocol,
            )
          )
            fail("learning_compiled", "Created mapping data hash differs.");
        }
        b.source = p.source;
        b.mappingEvent = e;
        b.mappingNumber = p.mappingNumber;
      } else if (!b.mappingEvent)
        fail("learning_mapping", "A mapping root is required.");
      else if (["measured", "corrected"].includes(p.kind)) {
        const input = p.kind === "measured" ? p.input : p.input.measurement;
        if (
          !same(input.head, headPin(previous)) ||
          input.mappingEventSha256 !== b.mappingEvent.sha256
        )
          fail(
            "learning_head",
            "The command did not name its exact current head/mapping.",
          );
        const ctx = {
          source: sm.get(b.source.sha256),
          mappingEvent: b.mappingEvent,
          evidence,
          events: list.filter((x) => x.sequence < e.sequence),
        };
        const c = compileLearningMeasurement(input, ctx);
        if (
          p.record.dataSha256 !== H("data", c.data) ||
          createdIds.has(p.record.recordId) ||
          programIds.has(p.record.recordId)
        )
          fail(
            "learning_compiled",
            "Created observation identity/data differs.",
          );
        createdIds.add(p.record.recordId);
        if (p.kind === "corrected") {
          const old = allMeasurements.get(p.input.replaces.recordId);
          if (
            !old ||
            outgoing.has(p.input.replaces.recordId) ||
            reserved.has(p.input.replaces.recordId) ||
            (old.correctionEventSha256 &&
              attempts.get(old.correctionEventSha256)?.state !== "applied")
          )
            fail(
              "learning_correction",
              "Correct only an effective leaf with no pending reservation.",
            );
          const oldProof = learningEvidenceFor(evidence, p.input.replaces);
          if (
            oldProof.snapshot.data.kind !== "observation" ||
            oldProof.snapshot.files.length ||
            oldProof.snapshot.data.indicatorId !== c.data.indicatorId ||
            old.input.mappingEventSha256 !== input.mappingEventSha256 ||
            oldProof.snapshot.data.unit !== c.data.unit ||
            oldProof.snapshot.data.geography !== c.data.geography ||
            H("data", oldProof.snapshot.data) !== old.record.dataSha256
          )
            fail(
              "learning_correction",
              "Replacement must retain the exact compatible definition/data provenance.",
            );
          const a = {
            eventSha256: e.sha256,
            candidateRecordId: p.record.recordId,
            replaces: p.input.replaces,
            state: "pending",
            terminalEvent: null,
          };
          attempts.set(e.sha256, a);
          reserved.set(a.replaces.recordId, e.sha256);
          questions.add(a.replaces.recordId);
          b.corrections.push(a);
        }
        const entry = {
          event: e,
          record: p.record,
          input,
          correctionEventSha256: p.kind === "corrected" ? e.sha256 : null,
        };
        allMeasurements.set(p.record.recordId, entry);
        b.measurements.push(entry);
      } else if (
        ["correction-applied", "correction-abandoned"].includes(p.kind)
      ) {
        const a = attempts.get(p.correctionEventSha256);
        if (
          !a ||
          a.state !== "pending" ||
          reserved.get(a.replaces.recordId) !== a.eventSha256
        )
          fail(
            "learning_correction",
            "This correction attempt is not pending.",
          );
        if (p.kind === "correction-abandoned") {
          if (p.candidateRecordId !== a.candidateRecordId)
            fail("learning_correction", "Abandonment candidate differs.");
          a.state = "abandoned";
        } else {
          if (
            !same(a.replaces, p.replaces) ||
            p.replacement.recordId !== a.candidateRecordId ||
            outgoing.has(p.replaces.recordId)
          )
            fail(
              "learning_correction",
              "Applied correction identity or effective leaf differs.",
            );
          const candidate = allMeasurements.get(a.candidateRecordId),
            proof = learningEvidenceFor(evidence, p.replacement);
          if (
            proof.snapshot.data.kind !== "observation" ||
            proof.snapshot.files.length ||
            !["approved", "included"].includes(proof.snapshot.status) ||
            H("data", proof.snapshot.data) !== candidate.record.dataSha256 ||
            candidate.input.mappingEventSha256 !== b.mappingEvent.sha256
          )
            fail(
              "learning_correction",
              "Apply only the exact ordinarily approved current mapping candidate.",
            );
          outgoing.set(p.replaces.recordId, p.replacement.recordId);
          b.effectiveEdges.push({
            replaces: p.replaces,
            replacement: p.replacement,
            correctionEventSha256: a.eventSha256,
            eventSha256: e.sha256,
          });
          questions.delete(p.replaces.recordId);
          a.state = "applied";
        }
        a.terminalEvent = e;
        reserved.delete(a.replaces.recordId);
      } else if (p.kind === "decided") {
        if (!same(p.input.head, headPin(previous)))
          fail("learning_head", "Decision head differs.");
        for (const pin of p.input.observations) {
          const point = allMeasurements.get(pin.recordId);
          if (
            !point ||
            outgoing.has(pin.recordId) ||
            questions.has(pin.recordId) ||
            (point.correctionEventSha256 &&
              attempts.get(point.correctionEventSha256)?.state !== "applied")
          )
            fail(
              "learning_correction",
              "Select only effective unchallenged observations.",
            );
        }
        const c = compileLearningDecision(p.input, {
          source: sm.get(b.source.sha256),
          mappingEvent: b.mappingEvent,
          evidence,
          events: list.filter((x) => x.sequence < e.sequence),
        });
        if (
          createdIds.has(p.record.recordId) ||
          programIds.has(p.record.recordId) ||
          p.record.dataSha256 !== H("data", c.data)
        )
          fail("learning_compiled", "Created decision identity/data differs.");
        createdIds.add(p.record.recordId);
        b.decisions.push({ event: e, record: p.record, input: p.input });
      } else if (p.kind === "report-frozen") {
        if (!same(p.selection.selection.head, headPin(previous)))
          fail("learning_head", "A report must bind its pre-freeze head.");
        const mp = learningEvidenceFor(evidence, p.selection.manifest);
        if (
          p.frozenManifest.revision !== p.selection.manifest.revision + 1 ||
          p.frozenManifest.dataSha256 !== H("data", mp.snapshot.data)
        )
          fail(
            "learning_manifest",
            "A frozen manifest advances one revision without changing approved data.",
          );
      }
      previous = e;
      b.head = headPin(e);
    }
    b.effectiveLeafRecordIds = [...allMeasurements]
      .filter(
        ([k, x]) =>
          !outgoing.has(k) &&
          (!x.correctionEventSha256 ||
            attempts.get(x.correctionEventSha256)?.state === "applied"),
      )
      .map(([k]) => k);
    b.questionedRecordIds = [...questions];
    bindings.push(b);
  }
  // An adopted root's foreign head must resolve in this full retained inventory.
  for (const e of events)
    if (e.payload.kind === "adopted") {
      const p = e.payload.recoveredHead,
        target = events.find((x) => same(headPin(x), p));
      if (
        !target ||
        (target.originOrgId === e.originOrgId &&
          target.bindingId === e.bindingId)
      )
        fail(
          "learning_adoption",
          "The recovered source head is missing or self-referential.",
        );
      const sourceWasUsed = events.some(
        (x) =>
          x.originOrgId === p.originOrgId &&
          x.bindingId === p.bindingId &&
          x.sequence <= p.sequence &&
          ["mapped", "adopted"].includes(x.payload.kind) &&
          same(x.payload.source, e.payload.source),
      );
      if (!sourceWasUsed)
        fail(
          "learning_adoption",
          "The selected source is not provenance of the recovered head.",
        );
    }
  if (bindings.reduce((n, b) => n + b.measurements.length, 0) > 200)
    fail("learning_limit", "Retained measurement candidates exceed 200.");
  if (bindings.some((b) => b.decisions.length > 20))
    fail("learning_limit", "Retained decisions exceed their binding bound.");
  return freeze({ bindings, evidence });
}
