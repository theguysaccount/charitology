import test from "node:test";
import assert from "node:assert/strict";
import { buildLearningFixture } from "./learning-fixtures.mjs";
import {
  validateLearningReport,
  validateLearningBackup,
} from "../lib/learning-report-model.mjs";
import { learningSeal } from "../lib/learning-json.mjs";
import { learningHash as H } from "../lib/learning-json.mjs";
import {
  makeLearningEvent,
  compileLearningMapping,
} from "../lib/learning-model.mjs";
import { sourcePin } from "../lib/learning-native.mjs";
test("actual complete compiler produces a selected three-period report and strict full backup", () => {
  const f = buildLearningFixture();
  assert.equal(f.report.selection.selection.observations.length, 3);
  assert.equal(f.points[0].data.value, 0);
  assert.equal(f.points[1].data.value, null);
  assert.equal(f.report.manifest.missingness, f.manifest.missingness);
  assert.deepEqual(validateLearningReport(f.report), f.report);
  assert.deepEqual(validateLearningBackup(f.backup), f.backup);
});
test("zero-observation report still binds explicit approved discussed definitions", () => {
  const f = buildLearningFixture({ zeroObservations: true });
  assert.equal(f.report.selection.selection.observations.length, 0);
  assert.equal(f.report.selection.selection.definitions.length, 1);
  assert.equal(f.decision.input.noEvidenceReason, "No observations selected");
  assert.deepEqual(validateLearningBackup(f.backup), f.backup);
});
test("resealed report cannot strip decision discussion/source or invent proof boundaries", () => {
  const f = buildLearningFixture();
  for (const mutate of [
    (r) => (r.selection.selection.definitions = []),
    (r) => (r.sources = []),
    (r) =>
      (r.boundaries = [
        {
          kind: "event-parent",
          pin: { ...r.selection.selection.head, eventSha256: "a".repeat(64) },
        },
      ]),
  ]) {
    const r = structuredClone(f.report);
    mutate(r);
    delete r.checksum;
    assert.throws(() => validateLearningReport(learningSeal("report", r)));
  }
});
test("full backup rejects omitted freeze event, duplicate report and orphan evidence", () => {
  const f = buildLearningFixture();
  assert.throws(
    () =>
      validateLearningBackup({
        ...f.backup,
        events: f.backup.events.slice(0, -1),
      }),
    /freeze event/,
  );
  assert.throws(
    () =>
      validateLearningBackup({ ...f.backup, reports: [f.report, f.report] }),
    /Repeated complete learning reports/,
  );
  const b = structuredClone(f.backup);
  b.approvedEvidence.reverse();
  assert.throws(
    () => validateLearningBackup(b),
    /deterministic canonical order/,
  );
});
test("old selected report remains valid after a later cross-binding adoption references its later freeze head", () => {
  const f = buildLearningFixture(),
    c = compileLearningMapping(f.source, f.mapping, f.programId),
    adopt = makeLearningEvent({
      format: "charitology-learning-event",
      version: 1,
      originOrgId: f.orgId,
      bindingId: "later-binding",
      sequence: 1,
      previous: null,
      actorId: f.actorId,
      recordedAt: "2026-10-27T00:00:01.000Z",
      programId: f.programId,
      payload: {
        kind: "adopted",
        recoveredHead: f.head,
        source: sourcePin(f.source),
        program: f.root.payload.program,
        mapping: f.mapping,
        mappingNumber: 1,
        records: [
          {
            moduleId: "outcomes",
            recordId: "adopted-indicator",
            revision: 1,
            dataSha256: H("data", c.indicators[0].data),
          },
          {
            moduleId: "evaluation",
            recordId: "adopted-protocol",
            revision: 1,
            dataSha256: H("data", c.protocol),
          },
        ],
      },
    }),
    b = { ...f.backup, events: [...f.backup.events, adopt] };
  assert.deepEqual(validateLearningBackup(b), b);
  assert.deepEqual(
    validateLearningReport(f.report, {
      sources: b.sources,
      approvedEvidence: b.approvedEvidence,
      events: b.events,
      reports: b.reports,
    }),
    f.report,
  );
});
