// Large bounded recovery wrappers generated from fictional text only.
import assert from "node:assert/strict";
import {
  actual,
  STAMP,
  KEY,
  clone,
} from "../test-fixtures/remaining-record-recovery/harness.mjs";
const m = await actual();
let groups = 0;
async function check(name, fn) {
  await fn();
  console.log("PASS " + name);
  groups++;
}
const bytes = (s) => Buffer.byteLength(s),
  bad = (fn) => assert.throws(fn, (e) => e.code === "input_limit");
await check(
  "exact128MB lossless raw archive and+1 refusal preserve original raw string",
  () => {
    const v = {
        format: "charitology-remaining-record-raw-copy",
        version: 1,
        key: KEY,
        copy: "protected",
        raw: "",
      },
      overhead = bytes(JSON.stringify(v, null, 2)),
      left = 128000000 - overhead;
    v.raw = '"'.repeat(Math.floor(left / 2)) + (left % 2 ? "x" : "");
    let text = m.remainingRecordRawArchive(v);
    assert.equal(bytes(text), 128000000);
    const restored = m.parseRemainingRecordRawArchive(text);
    assert.equal(restored.raw, v.raw);
    text = null;
    const exact = v.raw;
    v.raw += "x";
    bad(() => m.remainingRecordRawArchive(v));
    assert.equal(v.raw, exact + "x");
  },
);
await check(
  "maximal rawform has no authority, and unknown/future/duplicate/disguised native wrappers refuse",
  () => {
    for (const raw of [
      '{"format":"charitology-remaining-record-forms","format":"charitology-remaining-record-forms"}',
      '{"format":"charitology-remaining-record-raw-copy","version":2,"key":"charitology-manuscript-v1","copy":"protected","raw":""}',
    ])
      assert.throws(() => m.parseRemainingRecordRawArchive(raw));
    const native = m.defaultRemainingRecordValue(KEY);
    assert.throws(() =>
      m.parseRemainingRecordFormArchive(JSON.stringify(native)),
    );
    const archive = {
      format: "charitology-remaining-record-forms",
      version: 1,
      key: KEY,
      exportedAt: STAMP,
      forms: [{ form: "manuscript", editingId: null, values: clone(native) }],
    };
    const text = m.remainingRecordFormArchive(archive);
    assert.throws(() => m.parseRemainingRecordBackup(text, KEY));
    archive.forms[0].editingId = "not a manuscript field";
    assert.throws(() => m.remainingRecordFormArchive(archive));
  },
);
console.log(`Remaining-record large formats: ${groups} groups passed.`);
