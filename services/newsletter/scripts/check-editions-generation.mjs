#!/usr/bin/env node
// Root/build checker, never imported by the deployed service or its isolated tests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  makeActualPublicationFixture,
  authoredFutureRequest,
  authoredFutureRaw,
  FIXTURE_COMMIT,
  FIXTURE_CAPTURE_AT,
} from "../../../test-fixtures/publication-editions/factory.mjs";
import {
  capturePublicationEditions,
  publicationCapturePaths,
} from "../../../src/lib/publication-editions-capture.mjs";
import { generateMailIssueRegistry } from "../lib/generate-editions.mjs";
import {
  mailIssueFiles,
  validateMailIssueFiles,
  resolveMailIssueCorrectionAncestors,
} from "../lib/editions.mjs";
import { edition } from "../lib/content.mjs";
const first = makeActualPublicationFixture();
const old = generateMailIssueRegistry(first.input, {
  selections: [
    { publicationId: "letter-edition-one-preserved", issueId: "edition-1" },
  ],
});
assert.equal(old.issues[0].hash, edition.hash);
assert.equal(old.issues[0].html, edition.html);
assert.equal(old.issues[0].text, edition.text);
const request = authoredFutureRequest(),
  rawSources = publicationCapturePaths([request])
    .filter((p) => p !== request.authoredLetterPath)
    .map((path) => ({
      path,
      rawUtf8: readFileSync(
        new URL("../../../" + path, import.meta.url),
        "utf8",
      ),
    }));
rawSources.push({
  path: request.authoredLetterPath,
  rawUtf8: authoredFutureRaw(),
});
const next = capturePublicationEditions({
  sourceCommit: FIXTURE_COMMIT,
  capturedAt: FIXTURE_CAPTURE_AT,
  requests: [request],
  rawSources,
  previousInput: first.input,
});
const registry = generateMailIssueRegistry(next.input, {
  previousRegistry: old,
  selections: [{ publicationId: request.id, issueId: "fictional-future" }],
});
const issue = registry.issues.find((x) => x.id === "fictional-future");
assert.match(issue.html, /Fictional test only/);
assert.equal(issue.hashAlgorithm, "canonical-mail-v1");
assert.deepEqual(
  resolveMailIssueCorrectionAncestors(registry, issue.id).map(
    (x) => x.publicationId,
  ),
  ["letter-edition-one-preserved"],
);
validateMailIssueFiles(mailIssueFiles(registry), {
  previousFiles: mailIssueFiles(old),
});
assert.throws(() =>
  generateMailIssueRegistry(next.input, {
    previousRegistry: old,
    selections: [
      {
        publicationId: "letter-edition-one-preserved",
        issueId: "another-legacy-alias",
      },
    ],
  }),
);
console.log(
  "3 actual public-source→mail generator groups passed; fictional capture labels only, no send.",
);
