import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  inspectLearningNativeValue,
  listLearningNativeSelections,
} from "../lib/learning-native-admission.mjs";
import {
  inspectLearningNative,
  makeLearningSourceCapture,
  validateLearningSourceCapture,
} from "../lib/learning-native.mjs";
import { learningNativeToC, LEARNING_TEST_AT } from "./learning-fixtures.mjs";
const enc = (v) => new TextEncoder().encode(JSON.stringify(v));
function nonprofit() {
  return {
    version: 1,
    program: "nonprofit-advisory",
    updated: LEARNING_TEST_AT,
    context: {
      name: "Fictional organization",
      activity: "",
      decision: "",
      change: "",
      baseline: "",
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
          id: "learning-one",
          values: {
            title: "Fictional checkpoint",
            outcome: "Access",
            method: "Administrative description",
            rule: "Review access",
            feedback: "Ask about barriers",
            result: "Not collected",
            date: "",
            status: "Draft",
          },
        },
      ],
      readiness: [],
    },
  };
}
const tocChoice = {
    adapter: "theory-of-change-native-v1",
    selection: { kind: "whole-draft" },
  },
  npChoice = {
    adapter: "nonprofit-learning-native-v1",
    selection: { kind: "learning-row", recordId: "learning-one" },
  };
test("actual complete native adapters retain source mechanisms, narrative zero and shape-only calendar text", () => {
  const value = inspectLearningNativeValue(enc(learningNativeToC()), tocChoice);
  assert.equal(
    value.selected.value.draft.source,
    "Fictional administrative mechanism",
  );
  assert.equal(value.selected.value.draft.indicators[0].baseline, "0");
  assert.equal(value.selected.value.draft.reviewDate, "2026-02-30");
  assert.equal(value.selected.value.draft.example, true);
  const n = inspectLearningNativeValue(enc(nonprofit()), npChoice);
  assert.deepEqual(Object.keys(n.selected.value.context), [
    "activity",
    "baseline",
    "capacity",
    "change",
    "decision",
    "name",
    "period",
    "privacy",
    "voice",
  ]);
  assert.equal(n.selected.value.learning.values.result, "Not collected");
});
for (const [name, supported, value] of [
  ["high", false, "\ud800"],
  ["low", false, "\udc00"],
  ["nul", false, "\0"],
  ["replacement", true, "\ufffd"],
  ["pair", true, "🧭"],
  ["escape-text", true, "\\ud800"],
]) {
  for (const adapter of ["toc", "np"])
    test(`actual native ${adapter} ${name}: complete discovery then explicit retained-string policy`, () => {
      const v =
        adapter === "toc" ? learningNativeToC({ problem: value }) : nonprofit();
      if (adapter === "np") v.context.voice = value;
      const bytes = enc(v),
        choice = adapter === "toc" ? tocChoice : npChoice;
      assert.equal(
        listLearningNativeSelections(bytes, { adapter: choice.adapter }).length,
        1,
      );
      if (supported) {
        const x = inspectLearningNativeValue(bytes, choice);
        assert.equal(
          adapter === "toc"
            ? x.selected.value.draft.problem
            : x.selected.value.context.voice,
          value,
        );
      } else
        assert.throws(
          () => inspectLearningNativeValue(bytes, choice),
          (e) =>
            e.code === "learning_native_text_unsupported" &&
            /Valid native source/.test(e.message),
        );
    });
  test(`unsupported ${name} in validated but unretained nonprofit rows is not rewritten or rejected`, () => {
    const v = nonprofit();
    v.records.diagnostics.push({
      id: "diagnostic-one",
      values: {
        title: "Fictional diagnostic",
        area: "Voice and access",
        current: value,
        gap: "Unknown gap",
        consequence: "Not collected",
        depth: "Unclassified",
        status: "Draft",
      },
    });
    const b = enc(v),
      x = inspectLearningNativeValue(b, npChoice);
    assert.equal(x.selected.value.learning.id, "learning-one");
    assert(!Object.hasOwn(x.selected.value, "records"));
    assert.equal(x.originalBytes, b.length);
  });
}
test("complete nonlinear native shape is validated before selected scope", () => {
  const v = nonprofit();
  v.records.readiness.push({
    id: "bad-readiness",
    values: {
      title: "Bad row",
      owner: "",
      status: "not-a-native-choice",
      source: "",
      date: "",
      notes: "Not checked",
    },
  });
  assert.throws(() => inspectLearningNativeValue(enc(v), npChoice));
  const wrong = learningNativeToC();
  wrong.extra = "no";
  assert.throws(() => inspectLearningNativeValue(enc(wrong), tocChoice));
});
test("native byte/duplicate/depth/schema boundaries refuse before capture", () => {
  for (const bytes of [
    new Uint8Array([0xc0, 0xaf]),
    new TextEncoder().encode('{"format":1,"\\u0066ormat":2}'),
    new Uint8Array([0xef, 0xbb, 0xbf, 123, 125]),
    new TextEncoder().encode("[".repeat(33) + "0" + "]".repeat(33)),
    new Uint8Array(1000001),
  ])
    assert.throws(() => inspectLearningNativeValue(bytes, tocChoice));
});
test("capture requires owned server inspection, retains exact file receipt and validates hash/registry", () => {
  const inspection = inspectLearningNative(enc(learningNativeToC()), tocChoice),
    settings = {
      originOrgId: "org-one",
      bindingId: "binding-one",
      sourceVersion: 1,
      previousSource: null,
      receivedAt: LEARNING_TEST_AT,
    };
  const s = makeLearningSourceCapture(inspection, settings);
  assert.deepEqual(validateLearningSourceCapture(s), s);
  assert.throws(
    () => makeLearningSourceCapture(structuredClone(inspection), settings),
    /actual owned/,
  );
  assert.throws(
    () =>
      validateLearningSourceCapture({ ...s, registrySha256: "a".repeat(64) }),
    /unsupported/,
  );
});
test("deterministic generated browser/server entry matches actual TS source closure", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const r = spawnSync(
    process.execPath,
    ["services/charity-os/scripts/build-learning-native.mjs", "--check"],
    { cwd: root, encoding: "utf8", timeout: 30000 },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
