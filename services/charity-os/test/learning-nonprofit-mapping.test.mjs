import test from "node:test";
import assert from "node:assert/strict";
import {
  learningMappedFixture,
  LEARNING_TEST_AT,
} from "./learning-fixtures.mjs";
import {
  inspectLearningNative,
  makeLearningSourceCapture,
  sourcePin,
  validateLearningSourceCapture,
} from "../lib/learning-native.mjs";
import {
  compileLearningMapping,
  makeLearningEvent,
  foldLearningHistory,
  workingPin,
} from "../lib/learning-model.mjs";
import { learningSourceField } from "../lib/learning-validation.mjs";
import { learningHash as H } from "../lib/learning-json.mjs";
function fixture() {
  const native = {
      version: 1,
      program: "nonprofit-advisory",
      updated: LEARNING_TEST_AT,
      context: {
        name: "Fictional organization",
        activity: "",
        decision: "",
        change: "Context change",
        baseline: "0",
        capacity: "",
        voice: "",
        privacy: "",
        period: "",
      },
      records: {
        diagnostics: [],
        evidence: [],
        actions: [],
        learning: [
          {
            id: "selected-learning",
            values: {
              title: "Selected checkpoint",
              outcome: "Access",
              method: "Narrative only",
              rule: "Review access",
              feedback: "Ask about barriers",
              result: "0",
              date: "",
              status: "Draft",
            },
          },
          {
            id: "unselected-learning",
            values: {
              title: "Valid unretained \u0000",
              outcome: "Unknown",
              method: "Unknown",
              rule: "Unknown",
              feedback: "Unknown",
              result: "Unknown",
              date: "",
              status: "Draft",
            },
          },
        ],
        readiness: [],
      },
    },
    bytes = new TextEncoder().encode(JSON.stringify(native)),
    inspection = inspectLearningNative(bytes, {
      adapter: "nonprofit-learning-native-v1",
      selection: { kind: "learning-row", recordId: "selected-learning" },
    }),
    source = makeLearningSourceCapture(inspection, {
      originOrgId: "org-one",
      bindingId: "nonprofit-binding",
      sourceVersion: 1,
      previousSource: null,
      receivedAt: LEARNING_TEST_AT,
    }),
    toc = learningMappedFixture(),
    mapping = structuredClone(toc.mapping);
  mapping.basis.intendedOutcome = {
    disposition: "adopted",
    sourceFields: ["np.learning.outcome"],
    text: "Access",
    reason: null,
  };
  mapping.basis.rule.basis = {
    disposition: "adopted",
    sourceFields: ["np.learning.rule"],
    text: "Review access",
    reason: null,
  };
  mapping.basis.feedback = {
    disposition: "adopted",
    sourceFields: ["np.learning.feedback"],
    text: "Ask about barriers",
    reason: null,
  };
  mapping.indicators[0].origin = { kind: "learning-checkpoint" };
  return { native, bytes, source, mapping, program: toc.program };
}
test("actual selected NP values supply exact adopted outcome/rule/feedback and strict mapping history", () => {
  const f = fixture(),
    before = new TextDecoder().decode(f.bytes),
    source = validateLearningSourceCapture(f.source),
    compiled = compileLearningMapping(source, f.mapping, f.program.record.id);
  for (const [field, value] of [
    ["np.learning.outcome", "Access"],
    ["np.learning.rule", "Review access"],
    ["np.learning.feedback", "Ask about barriers"],
    ["np.context.change", "Context change"],
  ])
    assert.equal(learningSourceField(source, field), value);
  assert.equal(source.selected.value.learning.values.result, "0");
  assert(!JSON.stringify(source).includes("unselected-learning"));
  assert.equal(compiled.indicators[0].data.value, null);
  assert.equal(compiled.indicators[0].data.method, "unknown");
  const root = makeLearningEvent({
    format: "charitology-learning-event",
    version: 1,
    originOrgId: "org-one",
    bindingId: "nonprofit-binding",
    sequence: 1,
    previous: null,
    actorId: "writer-one",
    recordedAt: LEARNING_TEST_AT,
    programId: f.program.record.id,
    payload: {
      kind: "mapped",
      mode: "new",
      source: sourcePin(source),
      program: workingPin(f.program.record),
      mapping: f.mapping,
      mappingNumber: 1,
      records: [
        {
          moduleId: "outcomes",
          recordId: "np-definition",
          revision: 1,
          dataSha256: H("data", compiled.indicators[0].data),
        },
        {
          moduleId: "evaluation",
          recordId: "np-protocol",
          revision: 1,
          dataSha256: H("data", compiled.protocol),
        },
      ],
    },
  });
  assert.equal(
    foldLearningHistory({
      sources: [source],
      approvedEvidence: [],
      events: [root],
    }).bindings[0].source.sha256,
    source.sha256,
  );
  assert.equal(new TextDecoder().decode(f.bytes), before);
});
test("NP context field remains direct; changed adopted native text refuses explicit adaptation requirement", () => {
  const f = fixture(),
    mapping = structuredClone(f.mapping);
  mapping.basis.intendedOutcome = {
    disposition: "adopted",
    sourceFields: ["np.context.change"],
    text: "Context change",
    reason: null,
  };
  assert.equal(
    compileLearningMapping(f.source, mapping, f.program.record.id).mapping.basis
      .intendedOutcome.text,
    "Context change",
  );
  for (const key of ["intendedOutcome", "feedback"]) {
    const changed = structuredClone(f.mapping);
    changed.basis[key].text += " changed";
    assert.throws(
      () => compileLearningMapping(f.source, changed, f.program.record.id),
      /exact selected native field/,
    );
  }
  const changed = structuredClone(f.mapping);
  changed.basis.rule.basis.text = "Invented action";
  assert.throws(
    () => compileLearningMapping(f.source, changed, f.program.record.id),
    /exact selected native field/,
  );
  assert.equal(learningSourceField(f.source, "np.learning.extra"), undefined);
});
