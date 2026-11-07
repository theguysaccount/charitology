import test from "node:test";
import assert from "node:assert/strict";
import { stable } from "../lib/security.mjs";
import { learningMappedFixture, buildLearningFixture } from "./learning-fixtures.mjs";
import { restoredLearningBridge, measureLearningBackup, learningJSONBBytes, learningReportReserveBytes,
  isLearningReportFamily, selectRecoveredLearningHistory } from "../lib/learning-backup.mjs";

const empty = () => ({ format: "charitology-learning-backup", version: 1, method: "learning-review-v1",
  sources: [], approvedEvidence: [], events: [], reports: [] });
const clone = value => JSON.parse(JSON.stringify(value));
const mappedBackup = fixture => ({ ...empty(), sources: fixture.sources, events: fixture.events });

test("old v1 absence is distinct from a present malformed or authority-bearing learning block", () => {
  assert.equal(restoredLearningBridge(undefined), null);
  assert.deepEqual(restoredLearningBridge(empty()), empty());
  for (const bad of [null, false, [], {}, { ...empty(), version: 2 }, { ...empty(), receipts: [] },
    { ...empty(), previews: [] }, { ...empty(), sessionSha256: "a".repeat(64) }])
    assert.throws(() => restoredLearningBridge(bad));
});

test("the legacy report inventory cannot carry any supported or unknown learning family", () => {
  for (const payload of [{ kind: "learning-review" }, { methodVersion: "learning-unknown-v99" },
    { kind: "grant-period", methodVersion: "learning-review-v1" }]) {
    assert.equal(isLearningReportFamily(payload), true);
    assert.throws(() => restoredLearningBridge(undefined, { legacyReports: [{ id: "old", payload }] }));
    assert.throws(() => restoredLearningBridge(empty(), { legacyReports: [{ id: "old", payload }] }));
  }
  assert.equal(isLearningReportFamily({ kind: "grant-period", methodVersion: "grant-report-v1" }), false);
  assert.deepEqual(restoredLearningBridge(empty(), { legacyReports: [{ id: "legacy", payload: { modules: [] } }] }), empty());
});

test("PostgreSQL byte estimation expands exponent numbers and preserves quoted/multibyte text", () => {
  for (const [value, rendered] of [[1e21, "1000000000000000000000"], [1e-7, "0.0000001"],
    [-1.25e-8, "-0.0000000125"], [5e-324, "0." + "0".repeat(323) + "5"],
    [{ a: "界\n\"\\", b: [0, null, true] }, '{"a": "界\\n\\\"\\\\", "b": [0, null, true]}']])
    assert.equal(learningJSONBBytes(value), Buffer.byteLength(rendered));
  assert.throws(() => learningJSONBBytes({ value: Infinity }));
  assert.throws(() => learningJSONBBytes({ value: "\ud800" }));
  assert.throws(() => learningJSONBBytes({ value: "\0" }));
});

test("empty exact destination projection performs no storage writes or invented report charge", async () => {
  const client = { query: async () => { throw new Error("An empty projection must not query or write."); } };
  const measured = await measureLearningBackup(client, empty());
  assert.deepEqual(measured, { nonreportCount: 0, nonreportBytes: 0, evidenceCount: 0,
    reportCount: 0, reportBytes: 0, totalBytes: 0, rows: [] });
  assert.ok(Object.isFrozen(measured));
});

test("standalone selected reports and pasted recovered heads cannot become full-backup authority", () => {
  assert.throws(() => restoredLearningBridge({ format: "charitology-os-report", kind: "learning-review", version: 1 }));
  assert.throws(() => selectRecoveredLearningHistory(empty(), "a".repeat(64)), error => error.status === 404);
  for (const hash of [null, "", 1, "A".repeat(64)])
    assert.throws(() => selectRecoveredLearningHistory(empty(), hash), error => error.status === 404);
});

test("report relocation reserve is the actual JSONB payload plus one fixed allowance", () => {
  const payload = { value: 1e-7, text: "界" };
  const expected = Buffer.byteLength('{"value": 0.0000001, "text": "界"}') + 4096;
  assert.equal(learningReportReserveBytes(payload), expected);
  assert.notEqual(learningReportReserveBytes(payload), Buffer.byteLength(stable(payload)) + 4096);
});

test("full retained mapping admission detaches bytes and crosschecks current records and trash", () => {
  const fixture = learningMappedFixture(), input = clone(mappedBackup(fixture));
  const context = { records: fixture.records, sourceOrgId: fixture.orgId };
  const admitted = restoredLearningBridge(input, context);
  assert.deepEqual(admitted, input);
  assert.notEqual(admitted, input);
  assert.ok(Object.isFrozen(admitted.events[0].payload.mapping));
  input.events[0].payload.mapping.protocol.title = "Changed caller-owned bytes";
  assert.equal(admitted.events[0].payload.mapping.protocol.title, fixture.mapping.protocol.title);
  assert.deepEqual(restoredLearningBridge(mappedBackup(fixture), {
    records: [fixture.program.record], trash: [fixture.definition.record, fixture.protocol.record], sourceOrgId: fixture.orgId,
  }), mappedBackup(fixture));
  // A program's later working content need not equal its old mapping-time hash.
  const later = clone(fixture.records);
  later[0].data.title = "A later program title";
  later[0].revision++;
  assert.deepEqual(restoredLearningBridge(mappedBackup(fixture), { ...context, records: later }), mappedBackup(fixture));
  const altered = clone(fixture.records);
  altered[1].data.title = "An altered bridge-created definition";
  assert.throws(() => restoredLearningBridge(mappedBackup(fixture), { ...context, records: altered }));
  assert.throws(() => restoredLearningBridge(mappedBackup(fixture), { ...context, records: fixture.records.slice(0, 2) }));
  assert.throws(() => restoredLearningBridge(mappedBackup(fixture), { ...context, trash: [fixture.definition.record] }));
  const wrongModule = clone(fixture.records);
  wrongModule[1].moduleId = "evaluation";
  assert.throws(() => restoredLearningBridge(mappedBackup(fixture), { ...context, records: wrongModule }));
  const wrongProgram = clone(fixture.records);
  wrongProgram[1].data.programId = "other-program";
  assert.throws(() => restoredLearningBridge(mappedBackup(fixture), { ...context, records: wrongProgram }));
  // Historic recovered rows can outlive the current workspace's ordinary rows.
  assert.deepEqual(restoredLearningBridge(mappedBackup(fixture), { sourceOrgId: "later-workspace" }), mappedBackup(fixture));
});

test("recovered detail returns the admitted complete inventory with no receipt or live authority", () => {
  const first = learningMappedFixture(), second = learningMappedFixture({ bindingId: "binding-two", programId: "program-two", indicatorId: "indicator-two", protocolId: "protocol-two" });
  const input = { ...empty(), sources: [...first.sources, ...second.sources], events: [...first.events, ...second.events] };
  const detail = selectRecoveredLearningHistory(input, first.root.sha256);
  assert.deepEqual(Object.keys(detail).sort(), ["binding", "history", "mapping", "source"]);
  assert.equal(detail.binding.originMode, "recovered");
  assert.equal(detail.binding.disposition, "historical-only");
  assert.equal(detail.binding.bindingId, first.bindingId);
  assert.deepEqual(detail.history, input);
  assert.equal(detail.history.events.length, 2);
  assert.deepEqual(detail.mapping, first.root);
  assert.deepEqual(detail.source, first.source);
  assert.ok(Object.isFrozen(detail.history.events));
  assert.throws(() => restoredLearningBridge({ ...input, receipts: [] }));
  assert.throws(() => restoredLearningBridge({ ...input, events: [...input.events, input.events[0]] }));
  const broken = clone(input);
  broken.events[0].payload.program.recordId = "pasted-program";
  assert.throws(() => restoredLearningBridge(broken));
});

test("destination category measurement uses exact SQL payload sizes and separate row reserves", async () => {
  const fixture = learningMappedFixture(), input = mappedBackup(fixture), statements = [];
  const client = { query: async (sql, params) => {
    statements.push(sql);
    assert.equal(sql, "SELECT octet_length($1::jsonb::text) AS bytes");
    return { rows: [{ bytes: learningJSONBBytes(JSON.parse(params[0])) }] };
  } };
  const measured = await measureLearningBackup(client, input);
  assert.equal(statements.length, 2);
  assert.equal(measured.nonreportCount, 2);
  assert.equal(measured.evidenceCount, 0);
  assert.equal(measured.reportCount, 0);
  assert.equal(measured.reportBytes, 0);
  assert.equal(measured.nonreportBytes, learningJSONBBytes(fixture.source) + learningJSONBBytes(fixture.root) + 8192);
  assert.equal(measured.totalBytes, measured.nonreportBytes);
  assert.ok(measured.rows.every(row => row.budgetBytes === row.payloadBytes + 4096));
  await assert.rejects(measureLearningBackup({ query: async () => ({ rows: [{ bytes: 1 }] }) }, input), error => error.code === "learning_size");
});

test("complete selected report closure has one report inventory and a separate recovery-sized category", async () => {
  const fixture = buildLearningFixture(), input = fixture.backup;
  const context = { records: fixture.records, sourceOrgId: fixture.orgId };
  assert.deepEqual(restoredLearningBridge(input, context), input);
  const client = { query: async (_sql, params) => ({ rows: [{ bytes: learningJSONBBytes(JSON.parse(params[0])) }] }) };
  const measured = await measureLearningBackup(client, input);
  assert.equal(measured.reportCount, 1);
  assert.equal(measured.nonreportCount, input.sources.length + input.approvedEvidence.length + input.events.length);
  assert.equal(measured.evidenceCount, input.approvedEvidence.length);
  assert.equal(measured.reportBytes, learningReportReserveBytes(fixture.report));
  assert.equal(measured.totalBytes, measured.nonreportBytes + measured.reportBytes);
  assert.equal(measured.rows.filter(row => row.rowKind === "recovered-report").length, 1);
  for (const legacy of [{ id: fixture.report.id, checksum: "a".repeat(64), payload: { modules: [] } },
    { id: "different-id", checksum: fixture.report.checksum, payload: { modules: [] } },
    { id: fixture.report.id, org_id: fixture.orgId, checksum: fixture.report.checksum, payload: fixture.report }])
    assert.throws(() => restoredLearningBridge(input, { ...context, legacyReports: [legacy] }));
  assert.throws(() => restoredLearningBridge({ ...input, reports: [] }, context));
  assert.throws(() => restoredLearningBridge({ ...input, events: input.events.slice(0, -1) }, context));
  let queried = false;
  await assert.rejects(measureLearningBackup({ query: async () => { queried = true; throw new Error("Should not query"); } },
    { ...input, reports: Array(21).fill(fixture.report) }));
  assert.equal(queried, false);
});
