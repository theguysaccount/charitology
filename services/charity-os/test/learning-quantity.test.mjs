import test from "node:test";
import assert from "node:assert/strict";
import {
  learningMappedFixture,
  learningMeasurementInput,
  makeLearningTestEvidence,
} from "./learning-fixtures.mjs";
import {
  compileLearningMapping,
  compileLearningMeasurement,
  makeLearningEvent,
  headPin,
} from "../lib/learning-model.mjs";
import { learningHash as H, learningSeal } from "../lib/learning-json.mjs";
function fixture(kind) {
  const f = learningMappedFixture(),
    mapping = structuredClone(f.mapping);
  mapping.indicators[0].unit.quantityKind = kind;
  mapping.indicators[0].unit.denominatorDefinition = [
    "rate",
    "percentage",
  ].includes(kind)
    ? "People eligible during the stated period"
    : null;
  const c = compileLearningMapping(f.source, mapping, f.programId),
    definition = makeLearningTestEvidence(
      "outcomes",
      f.definition.record.id,
      c.indicators[0].data,
      { auditId: "21" },
    ),
    protocol = makeLearningTestEvidence(
      "evaluation",
      f.protocol.record.id,
      c.protocol,
      { auditId: "22" },
    ),
    root = structuredClone(f.root);
  delete root.sha256;
  root.payload.mapping = mapping;
  root.payload.records[0].dataSha256 = H("data", c.indicators[0].data);
  root.payload.records[1].dataSha256 = H("data", c.protocol);
  const event = makeLearningEvent(root);
  return {
    ...f,
    mapping,
    root: event,
    head: headPin(event),
    definition,
    protocol,
    approvedEvidence: [
      f.program.evidence,
      definition.evidence,
      protocol.evidence,
    ],
    records: [f.program.record, definition.record, protocol.record],
  };
}
const run = (f, value, denominator = null) => {
  const input = learningMeasurementInput(f, value);
  input.denominator = denominator;
  return compileLearningMeasurement(input, {
    source: f.source,
    mappingEvent: f.root,
    evidence: f.approvedEvidence,
    records: f.records,
  }).data;
};
test("explicit share/rate denominators preserve zero and null while refusing negative/missing denominator", () => {
  for (const kind of ["percentage", "rate"]) {
    const f = fixture(kind);
    for (const value of [0, null, kind === "percentage" ? 100 : 1e12]) {
      const d = run(f, value, 12);
      assert.equal(d.value, value);
      assert.equal(d.denominator, 12);
    }
    for (const [value, denominator] of [
      [0, null],
      [null, null],
      [0, 0],
      [-1, 12],
    ])
      assert.throws(() => run(f, value, denominator));
  }
  assert.throws(() => run(fixture("percentage"), 100.0000001, 12), /share/);
});
test("counts reject fractions and negatives; signed amount/other never invent a measurement", () => {
  const count = fixture("count");
  for (const value of [-1, 0.5, 1e12 + 1, Infinity, NaN])
    assert.throws(() => run(count, value));
  for (const kind of ["amount", "other"])
    for (const value of [-1e12, 0, null, 1e12])
      assert.equal(run(fixture(kind), value).value, value);
});
test("real dates and bridge-owned snapshot file metadata refuse without mutating source", () => {
  const f = fixture("count"),
    input = learningMeasurementInput(f);
  input.period = {
    kind: "closed-days",
    startDate: "2026-02-30",
    endDate: "2026-03-01",
  };
  assert.throws(() =>
    compileLearningMeasurement(input, {
      source: f.source,
      mappingEvent: f.root,
      evidence: f.approvedEvidence,
    }),
  );
  const raw = structuredClone(f.definition.evidence);
  raw.snapshot.files = [
    {
      id: "unexpected-file",
      name: "file.txt",
      mime: "text/plain",
      size: 0,
      checksum: "0".repeat(64),
    },
  ];
  delete raw.sha256;
  raw.pin.snapshotSha256 = H("snapshot", raw.snapshot);
  const proof = learningSeal("evidence", raw),
    next = learningMeasurementInput(f);
  next.definition = proof.pin;
  assert.throws(
    () =>
      compileLearningMeasurement(next, {
        source: f.source,
        mappingEvent: f.root,
        evidence: [f.program.evidence, f.protocol.evidence, proof],
      }),
    /final-state/,
  );
  assert.deepEqual(f.definition.evidence.snapshot.files, []);
});
