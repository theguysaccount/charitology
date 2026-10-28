/** Proof-local lifecycle for a selected packet with explicitly omitted event parents. */
import {
  learningFail as fail,
  learningHash as H,
  learningSame as same,
} from "./learning-json.mjs";
import { learningEvidenceFor } from "./learning-validation.mjs";
import { compileLearningMeasurement } from "./learning-model.mjs";

export function validateLearningSelectedProof(report, mapping, decision) {
  const s = report.selection.selection,
    events = report.events;
  const required = new Set([mapping.sha256, decision.sha256]);
  const points = new Map(),
    attempts = new Map(),
    reservations = new Map(),
    edges = new Map(),
    questioned = new Set();
  const context = {
    source: report.sources[0],
    mappingEvent: mapping,
    evidence: report.approvedEvidence,
    events,
  };
  let priorSequence = 0;
  for (const e of events) {
    if (e.sequence <= priorSequence)
      fail(
        "learning_order",
        "Selected event sequences must be unique and increasing.",
      );
    priorSequence = e.sequence;
    const p = e.payload;
    if (["measured", "corrected"].includes(p.kind)) {
      if (points.has(p.record.recordId))
        fail(
          "learning_identity",
          "A selected proof cannot create an ordinary record twice.",
        );
      const input = p.kind === "measured" ? p.input : p.input.measurement;
      if (input.mappingEventSha256 !== mapping.sha256)
        fail(
          "learning_mapping",
          "Selected measurement ancestry must retain the selected mapping.",
        );
      const compiled = compileLearningMeasurement(input, context);
      if (H("data", compiled.data) !== p.record.dataSha256)
        fail(
          "learning_compiled",
          "Selected measurement ancestry does not reproduce its created data.",
        );
      if (p.kind === "corrected") {
        const old = points.get(p.input.replaces.recordId);
        if (
          !old ||
          edges.has(old.recordId) ||
          reservations.has(old.recordId) ||
          (old.attempt && attempts.get(old.attempt).state !== "applied")
        )
          fail(
            "learning_correction",
            "Correction ancestry has no available effective leaf.",
          );
        const proof = learningEvidenceFor(
          report.approvedEvidence,
          p.input.replaces,
        );
        if (
          proof.snapshot.data.kind !== "observation" ||
          proof.snapshot.files.length ||
          H("data", proof.snapshot.data) !== old.dataHash ||
          proof.snapshot.data.indicatorId !== compiled.data.indicatorId ||
          proof.snapshot.data.unit !== compiled.data.unit ||
          proof.snapshot.data.geography !== compiled.data.geography
        )
          fail(
            "learning_correction",
            "Correction ancestry changes the prior compiled definition/unit.",
          );
        attempts.set(e.sha256, {
          event: e,
          candidateId: p.record.recordId,
          replaces: p.input.replaces,
          state: "pending",
          terminal: null,
        });
        reservations.set(old.recordId, e.sha256);
        questioned.add(old.recordId);
      }
      points.set(p.record.recordId, {
        recordId: p.record.recordId,
        event: e,
        input,
        dataHash: p.record.dataSha256,
        attempt: p.kind === "corrected" ? e.sha256 : null,
      });
    } else if (
      ["correction-applied", "correction-abandoned"].includes(p.kind)
    ) {
      const a = attempts.get(p.correctionEventSha256);
      if (
        !a ||
        a.state !== "pending" ||
        reservations.get(a.replaces.recordId) !== a.event.sha256
      )
        fail(
          "learning_correction",
          "A terminal proof requires its exact pending attempt.",
        );
      if (p.kind === "correction-applied") {
        if (
          !same(a.replaces, p.replaces) ||
          p.replacement.recordId !== a.candidateId ||
          edges.has(a.replaces.recordId)
        )
          fail(
            "learning_correction",
            "Applied edge differs from its correction attempt.",
          );
        const proof = learningEvidenceFor(
          report.approvedEvidence,
          p.replacement,
        );
        if (
          proof.snapshot.data.kind !== "observation" ||
          proof.snapshot.files.length ||
          !["approved", "included"].includes(proof.snapshot.status) ||
          H("data", proof.snapshot.data) !== points.get(a.candidateId).dataHash
        )
          fail(
            "learning_correction",
            "Only the exact approved replacement can establish an edge.",
          );
        edges.set(a.replaces.recordId, a.candidateId);
        questioned.delete(a.replaces.recordId);
        a.state = "applied";
      } else {
        if (p.candidateRecordId !== a.candidateId)
          fail("learning_correction", "Abandoned candidate differs.");
        a.state = "abandoned";
      }
      a.terminal = e;
      reservations.delete(a.replaces.recordId);
    }
  }
  const ancestors = new Set();
  const include = (id) => {
    if (ancestors.has(id)) return;
    const point = points.get(id);
    if (!point)
      fail(
        "learning_reference",
        "A selected point or correction ancestor is missing.",
      );
    ancestors.add(id);
    required.add(point.event.sha256);
    if (point.attempt) {
      const a = attempts.get(point.attempt);
      if (a.state !== "applied")
        fail(
          "learning_correction",
          "A selected replacement must have been applied.",
        );
      required.add(a.terminal.sha256);
      include(a.replaces.recordId);
    }
  };
  for (const p of s.observations) {
    const point = points.get(p.recordId);
    if (
      !point ||
      edges.has(p.recordId) ||
      questioned.has(p.recordId) ||
      (point.attempt && attempts.get(point.attempt).state !== "applied")
    )
      fail(
        "learning_correction",
        "Select only effective leaves without unresolved concerns.",
      );
    include(p.recordId);
  }
  for (const a of attempts.values())
    if (ancestors.has(a.replaces.recordId)) {
      required.add(a.event.sha256);
      if (a.terminal) required.add(a.terminal.sha256);
    }
  if (
    events.length !== required.size ||
    events.some((e) => !required.has(e.sha256))
  )
    fail(
      "learning_closure",
      "A selected report includes unrelated event bodies.",
    );
  return required;
}
