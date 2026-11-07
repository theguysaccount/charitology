import test from "node:test";
import assert from "node:assert/strict";
import {
  parseLearningJSON,
  learningCanonical,
  learningHash,
  learningOwned,
} from "../lib/learning-json.mjs";
test("strict JSON refuses decoded aliases, hostile objects, malformed transport and extra text", () => {
  for (const s of [
    '{"x":1,"\\u0078":2}',
    '{"a":{"x":1,"x":2}}',
    '{"__proto__":{}}',
    "1e999",
    "[1] false",
    '"\\ud800"',
    '"\\u0000"',
    "[".repeat(33) + "0" + "]".repeat(33),
  ])
    assert.throws(() => parseLearningJSON(new TextEncoder().encode(s), 4096));
  const a = {};
  Object.defineProperty(a, "x", {
    enumerable: true,
    get() {
      throw Error("must not execute");
    },
  });
  assert.throws(() => learningOwned(a), /Accessors/);
  assert.throws(() => learningOwned([, 1]), /Sparse/);
});
test("canonical JSON preserves array order/strings and source-vs-record hash domains", () => {
  assert.equal(
    learningCanonical({ b: 2, a: [0, null, "\ufffd", "🧭"] }),
    '{"a":[0,null,"�","🧭"],"b":2}',
  );
  assert.notEqual(
    learningHash("source", { a: 1 }),
    learningHash("event", { a: 1 }),
  );
  assert.notEqual(learningHash("data", [1, 2]), learningHash("data", [2, 1]));
  assert.throws(() => learningHash("unknown", { a: 1 }));
});
test("actual UTF8 whole byte limits override shorter code-unit length", () => {
  const s = JSON.stringify({ x: "🧭".repeat(10) }),
    n = Buffer.byteLength(s);
  assert.deepEqual(parseLearningJSON(new TextEncoder().encode(s), n), {
    x: "🧭".repeat(10),
  });
  assert.throws(
    () => parseLearningJSON(new TextEncoder().encode(s), n - 1),
    /byte bound/,
  );
});
