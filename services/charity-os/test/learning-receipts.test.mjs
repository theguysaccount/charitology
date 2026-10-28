import test from "node:test";
import assert from "node:assert/strict";
import { validateAcceptedLearningReceipt } from "../lib/learning-commands.mjs";
import { headPin } from "../lib/learning-model.mjs";
import { learningHash as H } from "../lib/learning-json.mjs";
import {
  learningMappedFixture,
  appendLearningTestMeasurement,
  appendLearningTestEvent,
  finishLearningFixture,
} from "./learning-fixtures.mjs";
const f = learningMappedFixture(),
  old = appendLearningTestMeasurement(f, 0, { recordId: "original" }),
  bad = appendLearningTestMeasurement(f, 5, {
    recordId: "bad",
    approved: false,
    correction: old.proof.evidence.pin,
  });
appendLearningTestEvent(f, {
  kind: "correction-abandoned",
  correctionEventSha256: bad.event.sha256,
  candidateRecordId: "bad",
  reason: "Fictional mistaken candidate",
});
const good = appendLearningTestMeasurement(f, 4, {
  recordId: "good",
  correction: old.proof.evidence.pin,
});
appendLearningTestEvent(f, {
  kind: "correction-applied",
  correctionEventSha256: good.event.sha256,
  replaces: old.proof.evidence.pin,
  replacement: good.proof.evidence.pin,
});
const full = finishLearningFixture(f, [good]);
function receipt(event) {
  const p = event.payload,
    operation = {
      mapped: "map",
      adopted: "adopt",
      measured: "measure",
      corrected: "correct",
      "correction-applied": "apply-correction",
      "correction-abandoned": "abandon-correction",
      decided: "decide",
      "report-frozen": "freeze",
    }[p.kind];
  let records = ["mapped", "adopted"].includes(p.kind)
    ? p.records
    : ["measured", "corrected", "decided"].includes(p.kind)
      ? [p.record]
      : p.kind === "report-frozen"
        ? [p.frozenManifest]
        : [];
  if (p.kind === "correction-applied") {
    const proof = f.approvedEvidence.find(
      (e) => e.pin.recordId === p.replacement.recordId,
    );
    records = [
      {
        moduleId: "outcomes",
        recordId: proof.pin.recordId,
        revision: proof.pin.revision,
        dataSha256: H("data", proof.snapshot.data),
      },
    ];
  }
  return {
    payload: event,
    receipt: {
      version: 1,
      operation,
      commandHash: "1".repeat(64),
      requestHash: "2".repeat(64),
      actorBindingHash: "3".repeat(64),
      actorId: event.actorId,
      sessionSha256: "4".repeat(64),
      membershipSha256: "5".repeat(64),
      memberCreatedAtExact: "2026-10-27T00:00:00.000000Z",
      restoreEpochSha256: "6".repeat(64),
      previewId: "fictional-preview",
      reviewSha256: "7".repeat(64),
      acceptedAt: "2026-10-27T00:00:01.000Z",
      result: {
        outcome: p.kind === "report-frozen" ? "frozen" : p.kind,
        head: headPin(event),
        records,
        report:
          p.kind === "report-frozen"
            ? { id: p.reportId, checksum: p.reportChecksum }
            : null,
      },
    },
  };
}
test("every actual lifecycle payload has one closed durable result, including approved replacement WorkingPin", () => {
  for (const event of full.events) {
    const input = receipt(event),
      admitted = validateAcceptedLearningReceipt(input, {
        approvedEvidence: f.approvedEvidence,
      });
    assert.deepEqual(admitted.event, event);
    assert.deepEqual(admitted.receipt, input.receipt);
    assert(Buffer.byteLength(JSON.stringify(input.receipt)) <= 8192);
    if (event.payload.kind === "correction-applied")
      assert.equal(admitted.receipt.result.records[0].recordId, "good");
    if (event.payload.kind === "correction-abandoned")
      assert.deepEqual(admitted.receipt.result.records, []);
  }
});
test("malformed or cross-event copied result authority refuses exact closed receipt validation", () => {
  const event = full.events.find(
    (e) => e.payload.kind === "correction-applied",
  );
  for (const mutate of [
    (x) => (x.receipt.result.records = []),
    (x) => (x.receipt.result.records[0].dataSha256 = "0".repeat(64)),
    (x) => (x.receipt.result.head.eventSha256 = "0".repeat(64)),
    (x) => (x.receipt.actorId = "copied-actor"),
    (x) => (x.receipt.operation = "abandon-correction"),
    (x) => (x.receipt.result.outcome = "corrected"),
    (x) => (x.receipt.extra = "untrusted"),
    (x) => (x.receipt.membershipSha256 = "not-a-hash"),
    (x) => (x.receipt.memberCreatedAtExact = "2026-10-27T00:00:00Z"),
    (x) =>
      (x.receipt.result.report = { id: "invented", checksum: "0".repeat(64) }),
  ]) {
    const input = structuredClone(receipt(event));
    mutate(input);
    assert.throws(() =>
      validateAcceptedLearningReceipt(input, {
        approvedEvidence: f.approvedEvidence,
      }),
    );
  }
  const copied = receipt(full.events[1]);
  copied.receipt = receipt(full.events[2]).receipt;
  assert.throws(() =>
    validateAcceptedLearningReceipt(copied, {
      approvedEvidence: f.approvedEvidence,
    }),
  );
  assert.throws(() =>
    validateAcceptedLearningReceipt(receipt(event), { approvedEvidence: [] }),
  );
});
