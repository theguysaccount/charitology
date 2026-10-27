import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { edition } from "../lib/content.mjs";
import {
  issueJson,
  issueHash,
  canonicalIssueJson,
  plainIssueValue,
} from "../lib/issue-json.mjs";
import {
  LEGACY_CONTENT_HASH,
  LEGACY_FILE_HASH,
  getMailIssue,
  issueContentPreview,
  mailIssueFiles,
  validateMailIssueFiles,
  validateMailIssueRegistry,
  resolveMailIssueCorrectionAncestors,
} from "../lib/editions.mjs";
import { legacyRegistry, syntheticRegistry } from "../test-fixtures/issues.mjs";
const clone = structuredClone;
function rehash(v) {
  delete v.hash;
  v.hash = issueHash(v);
  return v;
}
test("Legacy file, ordered mail hash and frozen service binding remain byte-identical", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync(new URL("../lib/content.mjs", import.meta.url)))
      .digest("hex"),
    LEGACY_FILE_HASH,
  );
  assert.equal(edition.hash, LEGACY_CONTENT_HASH);
  const r = legacyRegistry(),
    x = getMailIssue(r, "edition-1");
  for (const k of ["title", "subject", "html", "text", "hash"])
    assert.equal(x[k], edition[k]);
  assert.equal(x.hashAlgorithm, "ordered-json-mail-v1");
  assert.equal(issueContentPreview(r, x.id).editorialLabel, "editorial-draft");
  assert.equal(Buffer.byteLength(x.html), 4640);
  assert.equal(Buffer.byteLength(x.text), 2857);
});
test("Synthetic fixed formats retain native footer and complete correction lineage", () => {
  const registry = syntheticRegistry(2),
    issue = getMailIssue(registry, "fixture-002");
  assert.equal(issue.hashAlgorithm, "canonical-mail-v1");
  assert.equal(issue.html.split("{{{RESEND_UNSUBSCRIBE_URL}}}").length, 2);
  assert.deepEqual(
    resolveMailIssueCorrectionAncestors(registry, issue.id).map(
      (x) => x.publicationId,
    ),
    ["fictional-preserved-letter"],
  );
  assert.ok(Object.isFrozen(registry.issues[0]));
});
test("Complete registry files round-trip and refuse partial, added, changed and reencoded blobs", () => {
  const r = syntheticRegistry(3),
    files = mailIssueFiles(r);
  assert.equal(validateMailIssueFiles(files).hash, r.hash);
  for (const mutate of [
    (v) => delete v["edition-1.json"],
    (v) => (v["unknown.json"] = "{}\n"),
    (v) => (v["edition-1.json"] = v["edition-1.json"].trim()),
    (v) => (v["registry.json"] = '{"format":"one","format":"two"}'),
  ]) {
    const f = clone(files);
    mutate(f);
    assert.throws(() => validateMailIssueFiles(f));
  }
  assert.throws(
    () =>
      validateMailIssueFiles(mailIssueFiles(legacyRegistry()), {
        previousFiles: files,
      }),
    /Historical/,
  );
  assert.equal(
    validateMailIssueFiles(files, {
      previousFiles: mailIssueFiles(legacyRegistry()),
    }).hash,
    r.hash,
  );
});
test("Closed lineage rejects dangling, cyclic, orphan, duplicate sequence and mismatched publication pins", () => {
  for (const mutate of [
    (v) => v.lineage.pop(),
    (v) => {
      v.lineage[1].supersedes = {
        id: v.lineage[1].publicationId,
        hash: v.lineage[1].publicationHash,
      };
      rehash(v.lineage[1]);
    },
    (v) => {
      v.lineage[1].sequence = 1;
      rehash(v.lineage[1]);
    },
    (v) => {
      v.issues[1].publicationHash = "f".repeat(64);
      rehash(v.issues[1]);
    },
    (v) =>
      v.lineage.push(
        rehash({
          format: "charitology-letter-publication-lineage",
          version: 1,
          publicationId: "orphan",
          publicationHash: "e".repeat(64),
          sequence: 50,
          supersedes: null,
        }),
      ),
  ]) {
    const v = clone(syntheticRegistry(3));
    mutate(v);
    rehash(v);
    assert.throws(() => validateMailIssueRegistry(v));
  }
});
test("Issue aliases, reserved index ID, changed history and identical content are rejected", () => {
  const r = syntheticRegistry(2);
  for (const mutate of [
    (v) => {
      v.issues[1].id = "registry";
      rehash(v.issues[1]);
    },
    (v) => {
      for (const k of ["subject", "title", "html", "text"])
        v.issues[1][k] = v.issues[0][k];
      rehash(v.issues[1]);
    },
    (v) => {
      v.issues[1].publicationId = v.issues[0].publicationId;
      v.issues[1].publicationHash = v.issues[0].publicationHash;
      rehash(v.issues[1]);
    },
  ]) {
    const v = clone(r);
    mutate(v);
    rehash(v);
    assert.throws(() => validateMailIssueRegistry(v));
  }
  const changed = clone(r);
  changed.issues[1].text += "Changed";
  rehash(changed.issues[1]);
  rehash(changed);
  assert.throws(
    () => validateMailIssueRegistry(changed, { previousRegistry: r }),
    /Historical/,
  );
});
test("Strict JSON and plain admission refuse decoded duplicate keys, depth, Unicode, decorations and nonfinite values", () => {
  for (const v of [
    '{"a":1,"\\u0061":2}',
    "[".repeat(33) + "0" + "]".repeat(33),
    "1e999",
    '{"a":"' + String.fromCharCode(0xd800) + '"}',
    '{"a":"\\ud800"}',
    "{} true",
  ])
    assert.throws(() => issueJson(v));
  assert.throws(() => issueJson(new Uint8Array([0xff])));
  assert.throws(() => issueJson(" ".repeat(17), 16));
  let gets = 0;
  const decorated = {
    get value() {
      gets++;
      return 1;
    },
  };
  assert.throws(() => plainIssueValue(decorated));
  assert.equal(gets, 0);
  for (const v of [
    new Date(),
    [, , 1],
    { a: undefined },
    { a: Infinity },
    { [Symbol("s")]: 1 },
  ])
    assert.throws(() => plainIssueValue(v));
  assert.equal(canonicalIssueJson({ b: 2, a: 1 }), "{" + '"a":1,"b":2}');
});
test("Mail HTML cannot add scripts, remote images, alternate template tokens or header injection", () => {
  for (const mutate of [
    (v) => (v.html += "<script>x</script>"),
    (v) => (v.html += '<img src="https://example.invalid/pixel">'),
    (v) => (v.subject += "\r\nBcc: x"),
    (v) => (v.text += "{{{RESEND_UNSUBSCRIBE_URL}}}"),
  ]) {
    const v = clone(syntheticRegistry(2));
    mutate(v.issues[1]);
    rehash(v.issues[1]);
    rehash(v);
    assert.throws(() => validateMailIssueRegistry(v));
  }
});
