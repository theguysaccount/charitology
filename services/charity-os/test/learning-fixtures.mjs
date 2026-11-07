// Fictional pure fixtures. No database, browser, clocks, storage or real observations.
import { validateRecord } from "../lib/modules.mjs";
import {
  inspectLearningNative,
  makeLearningSourceCapture,
  sourcePin,
} from "../lib/learning-native.mjs";
import {
  learningHash as H,
  learningSeal,
  learningFreeze,
} from "../lib/learning-json.mjs";
import {
  compileLearningMapping,
  compileLearningMeasurement,
  compileLearningDecision,
  makeLearningEvent,
  headPin,
  workingPin,
  validateLearningEvidence,
} from "../lib/learning-model.mjs";
import {
  selectLearningReportClosure,
  learningSelectionDigest,
  makeLearningReport,
  validateLearningBackup,
} from "../lib/learning-report-model.mjs";
export const LEARNING_TEST_AT = "2026-10-27T00:00:00.000Z";
export function learningNativeToC(overrides = {}) {
  return {
    format: "charitology-theory-of-change",
    version: 1,
    exportedAt: LEARNING_TEST_AT,
    draft: {
      id: "fictional-toc",
      name: "Fictional learning source",
      problem: "Fictional access problem",
      source: "Fictional administrative mechanism",
      depth: null,
      activities: "",
      outputs: "",
      outcomeShort: "People can use the service",
      outcomeMedium: "",
      outcomeLong: "",
      indicators: [
        {
          what: "Completed visits",
          how: "Administrative count",
          when: "Monthly",
          baseline: "0",
          target: "",
        },
      ],
      assumptions: "",
      feedbackMethod: "Ask about access",
      feedbackFrequency: "Monthly",
      comparison: "",
      stopRule: "Review access barriers before continuing",
      reviewer: "",
      reviewDate: "2026-02-30",
      example: true,
      createdAt: LEARNING_TEST_AT,
      updatedAt: LEARNING_TEST_AT,
      ...overrides,
    },
  };
}
export function makeLearningTestEvidence(
  moduleId,
  id,
  data,
  {
    orgId = "org-one",
    actorId = "reviewer-one",
    revision = 1,
    status = moduleId === "programs"
      ? "approved"
      : moduleId === "evaluation"
        ? data.kind === "protocol"
          ? "registered"
          : "decided"
        : "approved",
    auditId = "1",
    at = LEARNING_TEST_AT,
  } = {},
) {
  const snapshot = {
    id,
    orgId,
    moduleId,
    data,
    status,
    ownerId: "writer-one",
    revision,
    createdAt: at,
    updatedAt: at,
    files: [],
  };
  const approval = {
    status: "approved",
    revision,
    actorId,
    reason: "Fictional independent review",
    at,
  };
  const record = {
    id,
    orgId,
    moduleId,
    data,
    status,
    ownerId: "writer-one",
    lastEditedBy: "writer-one",
    revision,
    approval,
    snapshot,
    source: null,
    createdAt: at,
    updatedAt: at,
  };
  const pin = {
    originOrgId: orgId,
    moduleId,
    recordId: id,
    revision,
    snapshotSha256: H("snapshot", snapshot),
    approvalEventId: auditId,
    approvalSha256: H("approval", approval),
  };
  const evidence = validateLearningEvidence(
    learningSeal("evidence", {
      format: "charitology-learning-approved-evidence",
      version: 1,
      pin,
      snapshot,
      approval,
      approvalEvent: {
        id: auditId,
        action: "record.approved",
        actorId,
        createdAtExact: at.replace(".000Z", ".000000Z"),
        recordSha256: H("audit-record", record),
      },
    }),
  );
  return { record, evidence };
}
export function learningMappedFixture({
  orgId = "org-one",
  actorId = "writer-one",
  bindingId = "binding-one",
  programId = "program-one",
  indicatorId = "indicator-one",
  protocolId = "protocol-one",
  native = learningNativeToC(),
} = {}) {
  const inspection = inspectLearningNative(
    new TextEncoder().encode(JSON.stringify(native)),
    {
      adapter: "theory-of-change-native-v1",
      selection: { kind: "whole-draft" },
    },
  );
  const source = makeLearningSourceCapture(inspection, {
    originOrgId: orgId,
    bindingId,
    sourceVersion: 1,
    previousSource: null,
    receivedAt: LEARNING_TEST_AT,
  });
  const program = makeLearningTestEvidence(
    "programs",
    programId,
    validateRecord(
      "programs",
      { title: "Fictional program", kind: "program" },
      { status: "approved", records: [] },
    ),
    { orgId, auditId: "1" },
  );
  const adopted = (field, text) => ({
    disposition: "adopted",
    sourceFields: [field],
    text,
    reason: null,
  });
  const unknown = {
    disposition: "uncollected",
    sourceFields: [],
    text: null,
    reason: "Not collected in this fictional example",
  };
  const mapping = {
    mappingVersion: "learning-mapping-v1",
    basis: {
      intendedOutcome: adopted("toc.outcomeShort", native.draft.outcomeShort),
      rule: {
        basis: adopted("toc.stopRule", native.draft.stopRule),
        whenMet: "continue",
        whenNotMet: "modify",
      },
      comparison: unknown,
      feedback: {
        disposition: "adapted",
        sourceFields: ["toc.feedbackMethod"],
        text: "Ask about access; frequency is unknown",
        reason: "Explicit authored plan",
      },
    },
    indicators: [
      {
        slot: 1,
        origin: { kind: "toc-indicator", index: 0 },
        title: "Completed visits",
        unit: {
          kind: "defined",
          text: "visits",
          quantityKind: "count",
          definition: "Number of completed visits",
          denominatorDefinition: null,
        },
        population: "Fictional service users",
        geography: null,
        plannedPeriod: { kind: "unknown" },
        limitations: "Fictional software test, not collected evidence",
      },
    ],
    protocol: {
      title: "Fictional review protocol",
      question: "How is access changing?",
      method: "qualitative",
      uncertainty: "Selection and missing reporting",
      harms: "Possible reporting burden",
      reviewDate: null,
    },
  };
  const compiled = compileLearningMapping(source, mapping, programId, {
    records: [program.record],
  });
  const definition = makeLearningTestEvidence(
      "outcomes",
      indicatorId,
      compiled.indicators[0].data,
      { orgId, auditId: "2" },
    ),
    protocol = makeLearningTestEvidence(
      "evaluation",
      protocolId,
      compiled.protocol,
      { orgId, auditId: "3" },
    );
  const createdRecords = [
    {
      moduleId: "outcomes",
      recordId: indicatorId,
      revision: 1,
      dataSha256: H("data", definition.record.data),
    },
    {
      moduleId: "evaluation",
      recordId: protocolId,
      revision: 1,
      dataSha256: H("data", protocol.record.data),
    },
  ];
  const root = makeLearningEvent({
    format: "charitology-learning-event",
    version: 1,
    originOrgId: orgId,
    bindingId,
    sequence: 1,
    previous: null,
    actorId,
    recordedAt: LEARNING_TEST_AT,
    programId,
    payload: {
      kind: "mapped",
      mode: "new",
      source: sourcePin(source),
      program: workingPin(program.record),
      mapping,
      mappingNumber: 1,
      records: createdRecords,
    },
  });
  return {
    orgId,
    actorId,
    bindingId,
    programId,
    source,
    mapping,
    root,
    head: headPin(root),
    program,
    definition,
    protocol,
    sources: [source],
    approvedEvidence: [
      program.evidence,
      definition.evidence,
      protocol.evidence,
    ],
    events: [root],
    records: [program.record, definition.record, protocol.record],
  };
}
export function learningMeasurementInput(
  f,
  value = 0,
  {
    head = f.head,
    period = {
      kind: "closed-days",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    },
    title = "Fictional measurement",
  } = {},
) {
  return {
    head,
    mappingEventSha256: f.root.sha256,
    program: f.program.evidence.pin,
    protocol: f.protocol.evidence.pin,
    definition: f.definition.evidence.pin,
    title,
    value,
    denominator: null,
    period,
    method: "administrative",
    evidence: "unknown",
    sourceUrl: null,
    locator: { kind: "not-collected" },
    missingReason: value === null ? "Not collected" : null,
    limitations: "Fictional software test",
  };
}
export function learningTestContext(f) {
  return {
    source: f.source,
    mappingEvent: f.root,
    evidence: f.approvedEvidence,
    events: f.events,
    records: f.records,
  };
}
export function appendLearningTestEvent(f, payload) {
  const event = makeLearningEvent({
    format: "charitology-learning-event",
    version: 1,
    originOrgId: f.orgId,
    bindingId: f.bindingId,
    sequence: f.events.length + 1,
    previous: f.head,
    actorId: f.actorId,
    recordedAt: LEARNING_TEST_AT,
    programId: f.programId,
    payload,
  });
  f.events.push(event);
  f.head = headPin(event);
  return event;
}
export function appendLearningTestMeasurement(
  f,
  value,
  {
    recordId = "measurement-" + f.events.length,
    approved = true,
    period,
    correction = null,
  } = {},
) {
  const input = learningMeasurementInput(f, value, {
      head: f.head,
      ...(period ? { period } : {}),
    }),
    data = compileLearningMeasurement(input, learningTestContext(f)).data,
    record = {
      moduleId: "outcomes",
      recordId,
      revision: 1,
      dataSha256: H("data", data),
    },
    payload = correction
      ? {
          kind: "corrected",
          input: {
            measurement: input,
            replaces: correction,
            reason: "Correct the fictional point",
          },
          record,
        }
      : { kind: "measured", input, record };
  const event = appendLearningTestEvent(f, payload);
  let proof = null;
  if (approved) {
    proof = makeLearningTestEvidence("outcomes", recordId, data, {
      orgId: f.orgId,
      auditId: String(10 + f.approvedEvidence.length),
    });
    f.approvedEvidence.push(proof.evidence);
    f.records.push(proof.record);
  } else
    f.records.push({
      id: recordId,
      moduleId: "outcomes",
      orgId: f.orgId,
      data,
      status: "draft",
      revision: 1,
      approval: null,
      snapshot: null,
    });
  return { input, data, event, proof, record };
}
export function appendLearningTestDecision(
  f,
  points,
  { recordId = "decision-one" } = {},
) {
  const input = {
    head: f.head,
    mappingEventSha256: f.root.sha256,
    program: f.program.evidence.pin,
    protocol: f.protocol.evidence.pin,
    observations: points.map((x) => x.proof.evidence.pin),
    discussedDefinitions: [f.definition.evidence.pin],
    title: "Fictional learning decision",
    action: "test",
    assessment: {
      result: "unassessable",
      explanation: "This fixture contains no collected evidence",
      departureReason: null,
    },
    feedback: {
      status: "not-collected",
      summary: "No feedback was collected in this fictional software fixture",
      sourceUrl: null,
    },
    uncertainty: "No real observations",
    harms: "Avoid unsupported claims",
    followUp: "2026-12-01",
    noEvidenceReason: points.length ? null : "No observations selected",
  };
  const data = compileLearningDecision(input, learningTestContext(f)).data,
    record = {
      moduleId: "evaluation",
      recordId,
      revision: 1,
      dataSha256: H("data", data),
    },
    event = appendLearningTestEvent(f, { kind: "decided", input, record }),
    proof = makeLearningTestEvidence("evaluation", recordId, data, {
      orgId: f.orgId,
      auditId: "100",
    });
  f.approvedEvidence.push(proof.evidence);
  f.records.push(proof.record);
  return { input, data, event, proof, record };
}
export function buildLearningFixture({
  zeroObservations = false,
  ...options
} = {}) {
  const f = learningMappedFixture(options);
  const points = zeroObservations
    ? []
    : [
        appendLearningTestMeasurement(f, 0, {
          period: {
            kind: "closed-days",
            startDate: "2026-01-01",
            endDate: "2026-01-31",
          },
        }),
        appendLearningTestMeasurement(f, null, {
          period: {
            kind: "closed-days",
            startDate: "2026-02-01",
            endDate: "2026-02-28",
          },
        }),
        appendLearningTestMeasurement(f, 7, {
          period: {
            kind: "closed-days",
            startDate: "2026-03-01",
            endDate: "2026-03-31",
          },
        }),
      ];
  return finishLearningFixture(f, points, { zeroObservations });
}
export function finishLearningFixture(
  f,
  points,
  { zeroObservations = points.length === 0 } = {},
) {
  const decision = appendLearningTestDecision(f, points);
  const selection = {
      head: f.head,
      mappingEventSha256: f.root.sha256,
      program: f.program.evidence.pin,
      source: sourcePin(f.source),
      protocol: f.protocol.evidence.pin,
      definitions: [f.definition.evidence.pin],
      observations: points.map((x) => x.proof.evidence.pin),
      decision: decision.proof.evidence.pin,
      manifestRecordId: "manifest-one",
    },
    manifest = {
      title: "Fictional selected learning report",
      kind: "template",
      programId: f.programId,
      agreementId: null,
      outcomeIds: points.map((x) => x.record.recordId),
      financeIds: [],
      receiptIds: [],
      assemblyMethod: "learning-review-v1",
      sourceDigest: null,
      supersedesReportId: null,
      revisionReason: null,
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      summary: "Fictional software acceptance; no real measured outcomes",
      missingness: zeroObservations
        ? "No observations were selected"
        : "The February value is missing; data are fictional",
      visibility: "private",
      issueDate: null,
    };
  const ctx = {
      sources: f.sources,
      approvedEvidence: f.approvedEvidence,
      events: f.events,
      records: f.records,
      reports: [],
    },
    closure = selectLearningReportClosure(selection, ctx);
  manifest.sourceDigest = learningSelectionDigest({
    selection,
    sources: closure.sources,
    approvedEvidence: closure.approvedEvidence,
    manifest,
  });
  const manifestProof = makeLearningTestEvidence(
    "reporting",
    "manifest-one",
    manifest,
    { orgId: f.orgId, status: "approved", auditId: "101" },
  );
  f.approvedEvidence.push(manifestProof.evidence);
  f.records.push(manifestProof.record);
  const finalSelection = {
      selection,
      manifest: manifestProof.evidence.pin,
      sourceDigest: manifest.sourceDigest,
    },
    report = makeLearningReport(
      {
        id: "report-one",
        orgId: f.orgId,
        title: manifest.title,
        createdBy: f.actorId,
        createdAt: LEARNING_TEST_AT,
        selection: finalSelection,
        manifest,
        supersedes: null,
      },
      ctx,
    );
  appendLearningTestEvent(f, {
    kind: "report-frozen",
    selection: finalSelection,
    reportId: report.id,
    reportChecksum: report.checksum,
    frozenManifest: {
      moduleId: "reporting",
      recordId: "manifest-one",
      revision: 2,
      dataSha256: H("data", manifest),
    },
  });
  const backup = validateLearningBackup({
    format: "charitology-learning-backup",
    version: 1,
    method: "learning-review-v1",
    sources: f.sources,
    approvedEvidence: [...f.approvedEvidence].sort((a, b) =>
      a.sha256 < b.sha256 ? -1 : 1,
    ),
    events: f.events,
    reports: [report],
  });
  return {
    ...f,
    points,
    decision,
    manifest,
    manifestProof,
    selection: finalSelection,
    report,
    backup,
  };
}
