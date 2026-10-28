/** Closed DTO admission; these checks confer no tenant/session/approval authority. */
import { getModule, validateRecord } from "./modules.mjs";
import {
  learningOwned as own,
  learningObject as obj,
  learningArray as arr,
  learningText as text,
  learningId as id,
  learningHashValue as hash,
  learningNumber as num,
  learningEnum as en,
  learningInstant as instant,
  learningDay as day,
  learningSame as same,
  learningCheckedHash as checked,
  learningFail as fail,
  learningFreeze as freeze,
  learningHash as H,
  LEARNING_LIMITS,
} from "./learning-json.mjs";
import {
  validateLearningSourceCapture,
  validateLearningSourcePin,
} from "./learning-native.mjs";
export { validateLearningSourcePin };
export const MODULES = Object.freeze([
  "programs",
  "outcomes",
  "evaluation",
  "reporting",
]);
export const ACTIONS = Object.freeze(["continue", "modify", "test", "stop"]);
export const METHODS = Object.freeze([
  "unknown",
  "before-after",
  "comparison",
  "randomized",
  "contribution-analysis",
  "qualitative",
]);
export const OBS_METHODS = Object.freeze([
  "unknown",
  "administrative",
  "survey",
  "observation",
  "experiment",
]);
export const OBS_EVIDENCE = Object.freeze([
  "unknown",
  "self-reported",
  "source-linked",
]);
const T = (v, max, p = "", nonblank = false, nullable = false) =>
  text(v, max, p, { nonblank, nullable });
const N = (v, fn) => (v === null ? null : fn(v));
/** Structural reference identities only, never current-row/approval authority.
 * Full graph compilation proves the referenced learning data; live callers pass actual tenant rows. */
export function learningReferenceRows(moduleId, data) {
  const result = new Map();
  for (const f of getModule(moduleId).fields.filter((f) =>
    ["reference", "references"].includes(f.type),
  )) {
    for (const k of f.type === "references"
      ? (data[f.key] ?? [])
      : data[f.key]
        ? [data[f.key]]
        : []) {
      id(k);
      const row = {
        id: k,
        moduleId: f.target,
        data: {
          kind:
            f.key === "indicatorId"
              ? "indicator"
              : f.target === "programs"
                ? "program"
                : "observation",
          ...(f.key === "indicatorId" ? { unit: data.unit } : {}),
        },
      };
      if (result.has(k) && result.get(k).moduleId !== f.target)
        fail(
          "learning_reference",
          "A reference identity cannot belong to two modules.",
        );
      result.set(k, row);
    }
  }
  return [...result.values()];
}
export function validateLearningHeadPin(v) {
  const p = own(v, { bytes: 2048 });
  obj(p, ["originOrgId", "bindingId", "sequence", "eventSha256"]);
  id(p.originOrgId);
  id(p.bindingId);
  num(p.sequence, 1, 1000);
  hash(p.eventSha256);
  return p;
}
export function validateLearningWorkingPin(v) {
  const p = own(v, { bytes: 2048 });
  obj(p, ["moduleId", "recordId", "revision", "dataSha256"]);
  en(p.moduleId, MODULES);
  id(p.recordId);
  num(p.revision, 1, 2147483647);
  hash(p.dataSha256);
  return p;
}
export function validateLearningRecordPin(v) {
  const p = own(v, { bytes: 2048 });
  obj(p, [
    "originOrgId",
    "moduleId",
    "recordId",
    "revision",
    "snapshotSha256",
    "approvalEventId",
    "approvalSha256",
  ]);
  id(p.originOrgId);
  en(p.moduleId, MODULES);
  id(p.recordId);
  num(p.revision, 1, 2147483647);
  hash(p.snapshotSha256);
  hash(p.approvalSha256);
  if (
    typeof p.approvalEventId !== "string" ||
    !/^[1-9]\d{0,18}$/.test(p.approvalEventId) ||
    BigInt(p.approvalEventId) > 9223372036854775807n
  )
    fail("learning_audit", "Use an exact positive bigint audit identity.");
  return p;
}
function pin(v, module) {
  const p = validateLearningRecordPin(v);
  if (module && p.moduleId !== module)
    fail("learning_reference", "The pin belongs to a different module.");
  return p;
}
function uniquePins(v, max, module, min = 0) {
  arr(v, max, "pins", min);
  const seen = new Set();
  for (const p of v) {
    pin(p, module);
    const k = p.originOrgId + ":" + p.moduleId + ":" + p.recordId;
    if (seen.has(k))
      fail("learning_reference", "Repeated record pins are unsupported.");
    seen.add(k);
  }
  return v;
}
export function learningPeriod(v, known = false) {
  obj(v, v?.kind === "unknown" ? ["kind"] : ["kind", "startDate", "endDate"]);
  en(v.kind, known ? ["closed-days"] : ["unknown", "closed-days"]);
  if (v.kind === "closed-days") {
    day(v.startDate);
    day(v.endDate);
    if (v.endDate < v.startDate)
      fail("learning_period", "The period ends before it starts.");
  }
  return v;
}
function unit(v) {
  obj(
    v,
    v?.kind === "unknown"
      ? ["kind"]
      : ["kind", "text", "quantityKind", "definition", "denominatorDefinition"],
  );
  en(v.kind, ["unknown", "defined"]);
  if (v.kind === "defined") {
    T(v.text, 240, "unit.text", true);
    en(v.quantityKind, ["count", "amount", "percentage", "rate", "other"]);
    T(v.definition, 700, "unit.definition", true);
    T(v.denominatorDefinition, 700, "unit.denominatorDefinition", true, true);
    if (
      ["rate", "percentage"].includes(v.quantityKind) &&
      v.denominatorDefinition === null
    )
      fail(
        "learning_unit",
        "Define the denominator before mapping this quantity.",
      );
  }
  return v;
}
export function learningUrl(v, path = "sourceUrl") {
  if (v === null) return null;
  T(v, 1200, path, true);
  try {
    const u = new URL(v);
    if (
      u.protocol !== "https:" ||
      !u.hostname ||
      u.username ||
      u.password ||
      /[\u0000-\u0020\u007f]/.test(v)
    )
      throw Error();
  } catch {
    fail("learning_url", "Use an explicit HTTPS source URL.", path);
  }
  return v;
}
const sourceFields = {
  toc: {
    outcome: ["toc.outcomeShort", "toc.outcomeMedium", "toc.outcomeLong"],
    rule: ["toc.stopRule"],
    comparison: ["toc.comparison"],
    feedback: ["toc.feedbackMethod", "toc.feedbackFrequency"],
  },
  np: {
    outcome: ["np.learning.outcome", "np.context.change"],
    rule: ["np.learning.rule"],
    comparison: [],
    feedback: ["np.learning.feedback"],
  },
};
export function learningSourceField(source, field) {
  const s = source.selected;
  if (s.kind === "theory-of-change") {
    const k = field.slice(4);
    return field.startsWith("toc.") && Object.hasOwn(s.value.draft, k)
      ? s.value.draft[k]
      : undefined;
  }
  const k = field.split(".");
  if (k[0] !== "np" || k.length !== 3) return undefined;
  const fields =
    k[1] === "learning"
      ? s.value.learning.values
      : k[1] === "context"
        ? s.value.context
        : null;
  return fields && Object.hasOwn(fields, k[2]) ? fields[k[2]] : undefined;
}
function basis(v, slot, source) {
  obj(v, ["disposition", "sourceFields", "text", "reason"]);
  en(v.disposition, ["adopted", "adapted", "uncollected", "not-adopted"]);
  arr(v.sourceFields, 3);
  if (new Set(v.sourceFields).size !== v.sourceFields.length)
    fail("learning_basis", "Repeated source fields are unsupported.");
  const allowed = source
    ? sourceFields[
        source.adapter === "theory-of-change-native-v1" ? "toc" : "np"
      ][slot]
    : [...sourceFields.toc[slot], ...sourceFields.np[slot]];
  for (const f of v.sourceFields) en(f, allowed);
  T(v.text, 700, "basis.text", true, true);
  T(v.reason, 2000, "basis.reason", true, true);
  if (["uncollected", "not-adopted"].includes(v.disposition)) {
    if (v.text !== null || v.reason === null)
      fail(
        "learning_basis",
        "Unknown or unadopted intent requires a reason and no adopted text.",
      );
  } else {
    if (v.text === null)
      fail("learning_basis", "Write the adopted interpretation.");
    if (v.disposition === "adapted" && v.reason === null)
      fail("learning_basis", "Explain the authored adaptation.");
    if (v.disposition === "adopted") {
      if (!v.sourceFields.length)
        fail(
          "learning_basis",
          "An adopted statement needs its exact native field.",
        );
      if (source) {
        let expected;
        if (
          slot === "feedback" &&
          same(v.sourceFields, ["toc.feedbackMethod", "toc.feedbackFrequency"])
        )
          expected =
            "Method: " +
            learningSourceField(source, v.sourceFields[0]) +
            "\nFrequency: " +
            learningSourceField(source, v.sourceFields[1]);
        else if (v.sourceFields.length === 1)
          expected = learningSourceField(source, v.sourceFields[0]);
        if (
          typeof expected !== "string" ||
          !expected.trim() ||
          v.text !== expected
        )
          fail(
            "learning_basis",
            "Adopted text must equal its exact selected native field.",
          );
      }
    }
  }
  return v;
}
export function mappingShape(value, source = null) {
  const m = own(value, { bytes: 131072 });
  obj(m, ["mappingVersion", "basis", "indicators", "protocol"]);
  en(m.mappingVersion, ["learning-mapping-v1"]);
  obj(m.basis, ["intendedOutcome", "rule", "comparison", "feedback"]);
  basis(m.basis.intendedOutcome, "outcome", source);
  if (!["adopted", "adapted"].includes(m.basis.intendedOutcome.disposition))
    fail(
      "learning_basis",
      "Adopt or adapt an intended outcome before creating live drafts.",
    );
  obj(m.basis.rule, ["basis", "whenMet", "whenNotMet"]);
  basis(m.basis.rule.basis, "rule", source);
  N(m.basis.rule.whenMet, (v) => en(v, ACTIONS));
  N(m.basis.rule.whenNotMet, (v) => en(v, ACTIONS));
  if (
    ["uncollected", "not-adopted"].includes(m.basis.rule.basis.disposition) &&
    (m.basis.rule.whenMet !== null || m.basis.rule.whenNotMet !== null)
  )
    fail("learning_basis", "An unknown/unadopted rule has no inferred action.");
  basis(m.basis.comparison, "comparison", source);
  basis(m.basis.feedback, "feedback", source);
  arr(m.indicators, 10, "indicators", 1);
  for (const [i, x] of m.indicators.entries()) {
    obj(x, [
      "slot",
      "origin",
      "title",
      "unit",
      "population",
      "geography",
      "plannedPeriod",
      "limitations",
    ]);
    if (x.slot !== i + 1)
      fail("learning_slot", "Indicator slots must be contiguous and ordered.");
    const o = x.origin;
    obj(
      o,
      o?.kind === "toc-indicator"
        ? ["kind", "index"]
        : o?.kind === "author-defined"
          ? ["kind", "reason"]
          : ["kind"],
    );
    en(o.kind, ["toc-indicator", "learning-checkpoint", "author-defined"]);
    if (o.kind === "toc-indicator") {
      num(o.index, 0, 29);
      if (
        source &&
        (source.adapter !== "theory-of-change-native-v1" ||
          o.index >= source.selected.value.draft.indicators.length)
      )
        fail("learning_origin", "Choose the exact selected native indicator.");
    } else if (o.kind === "author-defined")
      T(o.reason, 2000, "origin.reason", true);
    else if (source && source.adapter !== "nonprofit-learning-native-v1")
      fail("learning_origin", "This source has no native learning checkpoint.");
    T(x.title, 180, "title", true);
    unit(x.unit);
    T(x.population, 700, "population", true);
    T(x.geography, 240, "geography", true, true);
    learningPeriod(x.plannedPeriod);
    T(x.limitations, 4000, "limitations");
  }
  const p = m.protocol;
  obj(p, ["title", "question", "method", "uncertainty", "harms", "reviewDate"]);
  T(p.title, 180, "title", true);
  T(p.question, 500, "question", true);
  en(p.method, METHODS);
  T(p.uncertainty, 4000, "uncertainty");
  T(p.harms, 4000, "harms");
  N(p.reviewDate, day);
  return m;
}
export function validateLearningMapping(v, source) {
  return mappingShape(v, validateLearningSourceCapture(source));
}
export function validateLearningMeasurement(value) {
  const x = own(value, { bytes: 131072 });
  obj(x, [
    "head",
    "mappingEventSha256",
    "program",
    "protocol",
    "definition",
    "title",
    "value",
    "denominator",
    "period",
    "method",
    "evidence",
    "sourceUrl",
    "locator",
    "missingReason",
    "limitations",
  ]);
  validateLearningHeadPin(x.head);
  hash(x.mappingEventSha256);
  pin(x.program, "programs");
  pin(x.protocol, "evaluation");
  pin(x.definition, "outcomes");
  T(x.title, 180, "title", true);
  N(x.value, (v) => num(v, -1e12, 1e12, "value", false));
  N(x.denominator, (v) => num(v, 0, 1e12, "denominator", false));
  learningPeriod(x.period, true);
  en(x.method, OBS_METHODS);
  en(x.evidence, OBS_EVIDENCE);
  learningUrl(x.sourceUrl);
  if (x.evidence === "source-linked" && x.sourceUrl === null)
    fail("learning_source", "Source-linked measurements need a source URL.");
  obj(x.locator, x.locator?.kind === "known" ? ["kind", "text"] : ["kind"]);
  en(x.locator.kind, ["known", "not-collected"]);
  if (x.locator.kind === "known") T(x.locator.text, 512, "locator", true);
  T(x.missingReason, 2000, "missingReason", true, true);
  if ((x.value === null) !== (x.missingReason !== null))
    fail(
      "learning_missing",
      "Distinguish an explicit missing value/reason from measured zero.",
    );
  T(x.limitations, 4000, "limitations");
  return x;
}
export function validateLearningCorrection(v) {
  const x = own(v, { bytes: 131072 });
  obj(x, ["measurement", "replaces", "reason"]);
  validateLearningMeasurement(x.measurement);
  pin(x.replaces, "outcomes");
  T(x.reason, 2000, "reason", true);
  return x;
}
export function validateLearningCorrectionApply(v) {
  const x = own(v, { bytes: 131072 });
  obj(x, ["head", "correctionEventSha256", "replacement"]);
  validateLearningHeadPin(x.head);
  hash(x.correctionEventSha256);
  pin(x.replacement, "outcomes");
  return x;
}
export function validateLearningCorrectionAbandon(v) {
  const x = own(v, { bytes: 131072 });
  obj(x, ["head", "correctionEventSha256", "reason"]);
  validateLearningHeadPin(x.head);
  hash(x.correctionEventSha256);
  T(x.reason, 2000, "reason", true);
  return x;
}
export function ruleAssessment(x) {
  obj(x, ["result", "explanation", "departureReason"]);
  en(x.result, ["met", "not-met", "unassessable", "not-adopted"]);
  T(x.explanation, 2000, "assessment.explanation", true);
  T(x.departureReason, 2000, "departureReason", true, true);
  return x;
}
export function feedbackAssessment(x) {
  obj(x, ["status", "summary", "sourceUrl"]);
  en(x.status, ["collected", "not-collected", "unknown"]);
  T(x.summary, 4000, "feedback.summary", true);
  learningUrl(x.sourceUrl);
  return x;
}
export function validateLearningDecision(v) {
  const x = own(v, { bytes: 131072 });
  obj(x, [
    "head",
    "mappingEventSha256",
    "program",
    "protocol",
    "observations",
    "discussedDefinitions",
    "title",
    "action",
    "assessment",
    "feedback",
    "uncertainty",
    "harms",
    "followUp",
    "noEvidenceReason",
  ]);
  validateLearningHeadPin(x.head);
  hash(x.mappingEventSha256);
  pin(x.program, "programs");
  pin(x.protocol, "evaluation");
  uniquePins(x.observations, 100, "outcomes");
  uniquePins(x.discussedDefinitions, 10, "outcomes", 1);
  T(x.title, 180, "title", true);
  en(x.action, ACTIONS);
  ruleAssessment(x.assessment);
  feedbackAssessment(x.feedback);
  T(x.uncertainty, 4000);
  T(x.harms, 4000);
  day(x.followUp);
  T(x.noEvidenceReason, 2000, "noEvidenceReason", true, true);
  if ((x.observations.length === 0) !== (x.noEvidenceReason !== null))
    fail(
      "learning_missing",
      "Zero selected observations require an explicit no-evidence reason.",
    );
  return x;
}
export function validateLearningSelection(v) {
  const s = own(v, { bytes: 131072 });
  obj(s, [
    "head",
    "mappingEventSha256",
    "program",
    "source",
    "protocol",
    "definitions",
    "observations",
    "decision",
    "manifestRecordId",
  ]);
  validateLearningHeadPin(s.head);
  hash(s.mappingEventSha256);
  pin(s.program, "programs");
  validateLearningSourcePin(s.source);
  pin(s.protocol, "evaluation");
  uniquePins(s.definitions, 10, "outcomes", 1);
  uniquePins(s.observations, 100, "outcomes");
  pin(s.decision, "evaluation");
  id(s.manifestRecordId);
  return s;
}
export function validateLearningFinalSelection(v) {
  const s = own(v, { bytes: 131072 });
  obj(s, ["selection", "manifest", "sourceDigest"]);
  validateLearningSelection(s.selection);
  pin(s.manifest, "reporting");
  hash(s.sourceDigest);
  if (s.manifest.recordId !== s.selection.manifestRecordId)
    fail("learning_manifest", "The approved manifest identity differs.");
  return s;
}
export function validateLearningManifest(v) {
  const d = own(v, { bytes: 65536 });
  obj(
    d,
    getModule("reporting").fields.map((f) => f.key),
  );
  if (
    d.kind !== "template" ||
    d.agreementId !== null ||
    !Array.isArray(d.financeIds) ||
    d.financeIds.length ||
    !Array.isArray(d.receiptIds) ||
    d.receiptIds.length ||
    d.assemblyMethod !== "learning-review-v1" ||
    d.visibility !== "private"
  )
    fail("learning_manifest", "Use the exact private learning manifest.");
  id(d.programId);
  arr(d.outcomeIds, 100);
  d.outcomeIds.forEach(id);
  if (new Set(d.outcomeIds).size !== d.outcomeIds.length)
    fail("learning_manifest", "Repeated selected outcomes are unsupported.");
  T(d.title, 180, "title", true);
  day(d.startDate);
  day(d.endDate);
  if (d.endDate < d.startDate)
    fail("learning_period", "The period ends before it starts.");
  T(d.summary, 4000, "summary", true);
  T(d.missingness, 4000, "missingness", true);
  N(d.sourceDigest, hash);
  N(d.supersedesReportId, id);
  T(d.revisionReason, 2000, "revisionReason", true, true);
  if ((d.supersedesReportId !== null) !== (d.revisionReason !== null))
    fail(
      "learning_manifest",
      "A previous report needs an explicit revision reason.",
    );
  N(d.issueDate, day);
  return d;
}
export function validateLearningSnapshot(v) {
  const s = own(v, { bytes: 262144 });
  obj(s, [
    "id",
    "orgId",
    "moduleId",
    "data",
    "status",
    "ownerId",
    "revision",
    "createdAt",
    "updatedAt",
    "files",
  ]);
  id(s.id);
  id(s.orgId);
  en(s.moduleId, MODULES);
  id(s.ownerId);
  num(s.revision, 1, 2147483647);
  instant(s.createdAt);
  instant(s.updatedAt);
  if (s.updatedAt < s.createdAt)
    fail("learning_instant", "Snapshot time order differs.");
  en(
    s.status,
    getModule(s.moduleId).workflow.states.map((x) => x.id),
  );
  obj(
    s.data,
    getModule(s.moduleId).fields.map((f) => f.key),
  );
  if (
    s.moduleId === "reporting" &&
    s.data.assemblyMethod === "learning-review-v1"
  )
    validateLearningManifest(s.data);
  const d = validateRecord(s.moduleId, s.data, {
    status: s.status,
    records: learningReferenceRows(s.moduleId, s.data),
  });
  if (!same(d, s.data))
    fail(
      "learning_snapshot",
      "Retained ordinary data must already be exactly normalized.",
    );
  arr(s.files, 100);
  const ids = new Set();
  for (const f of s.files) {
    obj(f, ["id", "name", "mime", "size", "checksum"]);
    id(f.id);
    if (ids.has(f.id)) fail("learning_file", "Repeated file metadata.");
    ids.add(f.id);
    T(f.name, 240, "file.name", true);
    T(f.mime, 160, "file.mime", true);
    num(f.size, 0, 2147483647);
    hash(f.checksum);
  }
  return s;
}
export function validateLearningEvidence(v) {
  const e = own(v, { bytes: LEARNING_LIMITS.evidenceBytes });
  obj(e, [
    "format",
    "version",
    "pin",
    "snapshot",
    "approval",
    "approvalEvent",
    "sha256",
  ]);
  en(e.format, ["charitology-learning-approved-evidence"]);
  en(e.version, [1]);
  const p = pin(e.pin),
    s = validateLearningSnapshot(e.snapshot);
  obj(e.approval, ["status", "revision", "actorId", "reason", "at"]);
  const a = e.approval;
  en(a.status, ["approved"]);
  num(a.revision, 1, 2147483647);
  id(a.actorId);
  T(a.reason, 2000, "approval.reason", true);
  instant(a.at);
  obj(e.approvalEvent, [
    "id",
    "action",
    "actorId",
    "createdAtExact",
    "recordSha256",
  ]);
  const ev = e.approvalEvent;
  en(ev.action, ["record.approved"]);
  id(ev.actorId);
  instant(ev.createdAtExact, "createdAtExact", true);
  hash(ev.recordSha256);
  if (
    ev.id !== p.approvalEventId ||
    ev.actorId !== a.actorId ||
    p.originOrgId !== s.orgId ||
    p.moduleId !== s.moduleId ||
    p.recordId !== s.id ||
    p.revision !== s.revision ||
    a.revision !== s.revision ||
    p.snapshotSha256 !== H("snapshot", s) ||
    p.approvalSha256 !== H("approval", a)
  )
    fail(
      "learning_evidence",
      "The exact snapshot, approval and audit pins disagree.",
    );
  checked("evidence", e);
  return e;
}
export const learningRecordPin = (e) => validateLearningEvidence(e).pin;
export function learningEvidenceFor(evidence, p) {
  pin(p);
  const e = evidence.find((e) => same(e.pin, p));
  if (!e)
    fail("learning_reference", "An exact retained approval proof is missing.");
  return validateLearningEvidence(e);
}
