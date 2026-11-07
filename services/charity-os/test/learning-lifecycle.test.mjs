import test from "node:test";
import assert from "node:assert/strict";
import {
  learningMappedFixture,
  appendLearningTestMeasurement,
  appendLearningTestEvent,
  appendLearningTestDecision,
  makeLearningTestEvidence,
  learningTestContext,
} from "./learning-fixtures.mjs";
import {
  foldLearningHistory,
  compileLearningMeasurement,
  compileLearningDecision,
  makeLearningEvent,
  headPin,
} from "../lib/learning-model.mjs";
import { selectLearningReportClosure } from "../lib/learning-report-model.mjs";
import { sourcePin } from "../lib/learning-native.mjs";
const fold = (f) =>
  foldLearningHistory({
    sources: f.sources,
    approvedEvidence: f.approvedEvidence,
    events: f.events,
  }).bindings[0];
test("wrong draft abandonment releases reservation without approving wrong data or reviving old value", () => {
  const f = learningMappedFixture(),
    old = appendLearningTestMeasurement(f, 2, { recordId: "original" }),
    bad = appendLearningTestMeasurement(f, 99, {
      recordId: "wrong-candidate",
      approved: false,
      correction: old.proof.evidence.pin,
    });
  let b = fold(f);
  assert.equal(b.corrections[0].state, "pending");
  assert.deepEqual(b.questionedRecordIds, ["original"]);
  assert(!b.effectiveLeafRecordIds.includes("wrong-candidate"));
  appendLearningTestEvent(f, {
    kind: "correction-abandoned",
    correctionEventSha256: bad.event.sha256,
    candidateRecordId: "wrong-candidate",
    reason: "The candidate was entered incorrectly",
  });
  b = fold(f);
  assert.equal(b.corrections[0].state, "abandoned");
  assert.deepEqual(b.questionedRecordIds, ["original"]);
  const good = appendLearningTestMeasurement(f, 3, {
    recordId: "supported-candidate",
    correction: old.proof.evidence.pin,
  });
  appendLearningTestEvent(f, {
    kind: "correction-applied",
    correctionEventSha256: good.event.sha256,
    replaces: old.proof.evidence.pin,
    replacement: good.proof.evidence.pin,
  });
  b = fold(f);
  assert.equal(b.corrections[1].state, "applied");
  assert.deepEqual(b.effectiveLeafRecordIds, ["supported-candidate"]);
  assert.deepEqual(b.questionedRecordIds, []);
  assert(!f.approvedEvidence.some((e) => e.pin.recordId === "wrong-candidate"));
});
test("second pending claim, abandoned apply and repeated terminal events refuse resealed histories", () => {
  for (const mode of ["second-pending", "apply-abandoned", "second-terminal"]) {
    const f = learningMappedFixture(),
      old = appendLearningTestMeasurement(f, 2, { recordId: "old" }),
      bad = appendLearningTestMeasurement(f, 5, {
        recordId: "bad",
        correction: old.proof.evidence.pin,
      });
    if (mode === "second-pending")
      appendLearningTestMeasurement(f, 6, {
        recordId: "other",
        correction: old.proof.evidence.pin,
      });
    else {
      appendLearningTestEvent(f, {
        kind: "correction-abandoned",
        correctionEventSha256: bad.event.sha256,
        candidateRecordId: "bad",
        reason: "Wrong candidate",
      });
      appendLearningTestEvent(
        f,
        mode === "apply-abandoned"
          ? {
              kind: "correction-applied",
              correctionEventSha256: bad.event.sha256,
              replaces: old.proof.evidence.pin,
              replacement: bad.proof.evidence.pin,
            }
          : {
              kind: "correction-abandoned",
              correctionEventSha256: bad.event.sha256,
              candidateRecordId: "bad",
              reason: "Again",
            },
      );
    }
    assert.throws(() => fold(f), /pending|reservation|effective leaf/);
  }
});
test("decision and selected closure reject questioned original and pending candidate, then retain full applied ancestry", () => {
  const f = learningMappedFixture(),
    old = appendLearningTestMeasurement(f, 0, { recordId: "old" }),
    candidate = appendLearningTestMeasurement(f, 4, {
      recordId: "candidate",
      correction: old.proof.evidence.pin,
    });
  const copy = {
    ...f,
    events: [...f.events],
    approvedEvidence: [...f.approvedEvidence],
    records: [...f.records],
  };
  assert.throws(
    () => appendLearningTestDecision(copy, [old]),
    /effective unchallenged/,
  );
  assert.throws(
    () => appendLearningTestDecision(copy, [candidate]),
    /effective unchallenged/,
  );
  appendLearningTestEvent(f, {
    kind: "correction-applied",
    correctionEventSha256: candidate.event.sha256,
    replaces: old.proof.evidence.pin,
    replacement: candidate.proof.evidence.pin,
  });
  const decision = appendLearningTestDecision(f, [candidate]),
    selection = {
      head: f.head,
      mappingEventSha256: f.root.sha256,
      program: f.program.evidence.pin,
      source: sourcePin(f.source),
      protocol: f.protocol.evidence.pin,
      definitions: [f.definition.evidence.pin],
      observations: [candidate.proof.evidence.pin],
      decision: decision.proof.evidence.pin,
      manifestRecordId: "manifest",
    };
  const closure = selectLearningReportClosure(selection, {
    sources: f.sources,
    approvedEvidence: f.approvedEvidence,
    events: f.events,
    records: f.records,
  });
  assert(closure.events.some((e) => e.sha256 === old.event.sha256));
  assert(closure.events.some((e) => e.payload.kind === "correction-applied"));
  assert.equal(
    closure.exclusions.find((x) => x.recordId === "old").reason,
    "replaced",
  );
  assert(!closure.approvedEvidence.some((e) => e.pin.recordId === "manifest"));
});
test("explicit zero-point decision structurally fixes definition pins without parsing prose", () => {
  const f = learningMappedFixture(),
    d = appendLearningTestDecision(f, []);
  const input = structuredClone(d.input);
  input.discussedDefinitions = [];
  assert.throws(
    () => compileLearningDecision(input, learningTestContext(f)),
    /array/,
  );
  input.discussedDefinitions = [f.protocol.evidence.pin];
  assert.throws(
    () => compileLearningDecision(input, learningTestContext(f)),
    /different module/,
  );
});
test("full corrected report retains abandoned draft provenance, applied ancestry and exact exclusions", async () => {
  const { finishLearningFixture } = await import("./learning-fixtures.mjs"),
    { validateLearningReport, validateLearningBackup } =
      await import("../lib/learning-report-model.mjs"),
    { learningSeal } = await import("../lib/learning-json.mjs");
  const f = learningMappedFixture(),
    old = appendLearningTestMeasurement(f, 0, { recordId: "old" }),
    wrong = appendLearningTestMeasurement(f, 91, {
      recordId: "wrong",
      approved: false,
      correction: old.proof.evidence.pin,
    });
  appendLearningTestEvent(f, {
    kind: "correction-abandoned",
    correctionEventSha256: wrong.event.sha256,
    candidateRecordId: "wrong",
    reason: "Mistyped draft, not approved",
  });
  const replacement = appendLearningTestMeasurement(f, 4, {
    recordId: "replacement",
    correction: old.proof.evidence.pin,
  });
  appendLearningTestEvent(f, {
    kind: "correction-applied",
    correctionEventSha256: replacement.event.sha256,
    replaces: old.proof.evidence.pin,
    replacement: replacement.proof.evidence.pin,
  });
  const full = finishLearningFixture(f, [replacement]);
  assert.deepEqual(full.report.manifest.outcomeIds, ["replacement"]);
  assert.deepEqual(
    full.report.exclusions.map((x) => [x.recordId, x.reason, x.replacedBy]),
    [
      ["old", "replaced", "replacement"],
      ["wrong", "abandoned-correction", null],
    ],
  );
  assert.equal(
    full.report.events.filter((e) => e.payload.kind === "corrected").length,
    2,
  );
  assert(!full.report.approvedEvidence.some((e) => e.pin.recordId === "wrong"));
  assert.deepEqual(validateLearningReport(full.report), full.report);
  assert.deepEqual(validateLearningBackup(full.backup), full.backup);
  for (const change of [
    (r) =>
      (r.events = r.events.filter(
        (e) => e.payload.kind !== "correction-applied",
      )),
    (r) =>
      (r.events = r.events.filter(
        (e) => e.payload.kind !== "correction-abandoned",
      )),
    (r) => (r.exclusions = []),
  ]) {
    const raw = structuredClone(full.report);
    change(raw);
    delete raw.checksum;
    const sealed = learningSeal("report", raw);
    assert.throws(() => validateLearningReport(sealed, full.backup));
  }
});
