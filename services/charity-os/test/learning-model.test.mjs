import test from "node:test";
import assert from "node:assert/strict";
import {
  learningMappedFixture,
  learningMeasurementInput,
} from "./learning-fixtures.mjs";
import {
  foldLearningHistory,
  compileLearningMeasurement,
  compileLearningDecision,
  makeLearningEvent,
  headPin,
} from "../lib/learning-model.mjs";
import { learningHash as H } from "../lib/learning-json.mjs";
test("actual mapping compiler and complete root fold allow no fabricated program evidence", () => {
  const f = learningMappedFixture();
  const g = foldLearningHistory({
    sources: f.sources,
    approvedEvidence: [],
    events: f.events,
  });
  assert.equal(g.bindings[0].head.eventSha256, f.root.sha256);
  assert.equal(g.bindings[0].mappingNumber, 1);
  assert.equal(f.program.record.data.evidence, null);
});
test("measurement keeps actual zero/null and exact approved definition", () => {
  const f = learningMappedFixture();
  for (const value of [0, null, 7]) {
    const result = compileLearningMeasurement(
      learningMeasurementInput(f, value),
      {
        source: f.source,
        mappingEvent: f.root,
        evidence: f.approvedEvidence,
        records: f.records,
      },
    );
    assert.equal(result.data.value, value);
    assert.equal(result.data.indicatorId, f.definition.record.id);
    assert.equal(result.data.unit, "visits");
    assert.match(result.data.limitations, /LEARNING-MEASUREMENT-V1/);
  }
});
test("composed mapping/measurement payloads refuse truncation and source mutation", () => {
  const f = learningMappedFixture();
  const input = learningMeasurementInput(f);
  input.limitations = "x".repeat(4000);
  assert.throws(
    () =>
      compileLearningMeasurement(input, {
        source: f.source,
        mappingEvent: f.root,
        evidence: f.approvedEvidence,
        records: f.records,
      }),
    /complete generated field/,
  );
  assert.equal(input.limitations.length, 4000);
});
test("closed event own hash and exact head stop resealed forks", () => {
  const f = learningMappedFixture(),
    input = learningMeasurementInput(f);
  const c = compileLearningMeasurement(input, {
    source: f.source,
    mappingEvent: f.root,
    evidence: f.approvedEvidence,
    records: f.records,
  });
  const e = makeLearningEvent({
    format: "charitology-learning-event",
    version: 1,
    originOrgId: f.orgId,
    bindingId: f.bindingId,
    sequence: 2,
    previous: f.head,
    actorId: f.actorId,
    recordedAt: "2026-10-27T00:00:01.000Z",
    programId: f.programId,
    payload: {
      kind: "measured",
      input,
      record: {
        moduleId: "outcomes",
        recordId: "measurement-one",
        revision: 1,
        dataSha256: H("data", c.data),
      },
    },
  });
  const g = foldLearningHistory({
    sources: f.sources,
    approvedEvidence: f.approvedEvidence,
    events: [e, f.root],
  });
  assert.equal(g.bindings[0].measurements.length, 1);
  assert.deepEqual(g.bindings[0].effectiveLeafRecordIds, ["measurement-one"]);
  assert.throws(
    () =>
      foldLearningHistory({
        sources: f.sources,
        approvedEvidence: f.approvedEvidence,
        events: [f.root, e, e],
      }),
    /Repeated retained events/,
  );
});
