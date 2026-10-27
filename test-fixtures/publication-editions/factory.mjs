// Excluded test inputs. Fixture clocks/commit labels do not attest a publication.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  publicationCapturePaths,
  capturePublicationEditions,
} from "../../src/lib/publication-editions-capture.mjs";
export const FIXTURE_CAPTURE_AT = "2026-10-27T12:00:00.000Z";
export const FIXTURE_COMMIT = "a".repeat(40);
export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const editorial = {
  label: "editorial-draft",
  aiAssistance:
    "Prepared with AI assistance. Independent human review has not been completed.",
  limitations: [
    "A fixed edition records its stated sources and scope; it does not establish a staffed institution, independently reviewed research or an annual publication cadence.",
  ],
};
const coverage = (scope, geography = "Charitology project", period = null) => ({
  scope,
  geography,
  period,
  completeness: "declared-scope-only",
  limitations: [
    "Unknown historical baselines stay unknown. Capture time is not a source measurement or a historical served-edition timestamp.",
  ],
});
export function initialPublicationRequests() {
  return [
    {
      id: "state-of-charity-initial-capture",
      family: "state-of-charity",
      sequence: 1,
      title: "State of Charity: a new source capture",
      declaredPublicationDate: null,
      sourceLabel: "Edition 0 source label",
      provenance: "new-source-capture",
      methodId: "state-of-charity-capture-v1",
      coverage: coverage(
        "Dated U.S. financial estimates and a census of the Charitology project; not a worldwide charity census.",
        "United States and the Charitology project",
      ),
      editorial: structuredClone(editorial),
      r4EditionId: "edition:2026-10-27-initial",
      supersedes: null,
      correction: null,
      authoredLetterPath: null,
    },
    {
      id: "progress-report-initial-capture",
      family: "progress-report",
      sequence: 1,
      title: "Open Problems Progress: pinned initial ledger",
      declaredPublicationDate: null,
      sourceLabel: "Initial closed R4 edition",
      provenance: "new-source-capture",
      methodId: "progress-report-capture-v1",
      coverage: coverage(
        "The exact closed research ledger and its explicitly dated progress, with no known January baseline.",
        "Charitology project",
        {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-10-27T08:31:31.000Z",
          convention: "utc-half-open",
        },
      ),
      editorial: structuredClone(editorial),
      r4EditionId: "edition:2026-10-27-initial",
      supersedes: null,
      correction: null,
      authoredLetterPath: null,
    },
    {
      id: "principles-initial-capture",
      family: "principles",
      sequence: 1,
      title: "Principles of Charitology: ten fixed chapters",
      declaredPublicationDate: null,
      sourceLabel: "Edition 0 source label",
      provenance: "new-source-capture",
      methodId: "principles-capture-v1",
      coverage: coverage(
        "The complete text and source lists of the ten current textbook chapters.",
      ),
      editorial: structuredClone(editorial),
      r4EditionId: null,
      supersedes: null,
      correction: null,
      authoredLetterPath: null,
    },
    {
      id: "journal-volume-zero-capture",
      family: "journal",
      sequence: 1,
      title: "Journal of Charitology: Volume 0 source capture",
      declaredPublicationDate: null,
      sourceLabel: "Volume 0; three editorial drafts",
      provenance: "new-source-capture",
      methodId: "journal-capture-v1",
      coverage: coverage(
        "Three exact draft manuscripts and their pinned R4 qualification references.",
      ),
      editorial: structuredClone(editorial),
      r4EditionId: "edition:2026-10-27-initial",
      supersedes: null,
      correction: null,
      authoredLetterPath: null,
    },
    {
      id: "letter-edition-one-preserved",
      family: "letter",
      sequence: 1,
      title: "The Charitology Letter: preserved Edition 1 mail",
      declaredPublicationDate: "2026-10-25",
      sourceLabel: "Edition 1",
      provenance: "preserved-artifact",
      methodId: "letter-capture-v1",
      coverage: coverage(
        "The original public Edition 1 mail artifact, declared date, feed identity and original ordered content hash.",
      ),
      editorial: structuredClone(editorial),
      r4EditionId: null,
      supersedes: null,
      correction: null,
      authoredLetterPath: null,
    },
  ];
}
export function readActualPublicationFixtureSources(
  requests = initialPublicationRequests(),
) {
  return publicationCapturePaths(requests).map((path) => ({
    path,
    rawUtf8: readFileSync(join(repositoryRoot, path), "utf8"),
  }));
}
export function makeActualPublicationFixture() {
  const requests = initialPublicationRequests();
  return capturePublicationEditions({
    sourceCommit: FIXTURE_COMMIT,
    capturedAt: FIXTURE_CAPTURE_AT,
    requests,
    rawSources: readActualPublicationFixtureSources(requests),
    previousInput: null,
  });
}
export function authoredFutureRequest() {
  return {
    id: "letter-fictional-test-correction",
    family: "letter",
    sequence: 2,
    title: "Fictional future Letter fixture",
    declaredPublicationDate: "2026-10-28",
    sourceLabel: "Fictional test only",
    provenance: "new-source-capture",
    methodId: "letter-authored-capture-v1",
    coverage: coverage(
      "Fictional test payload; not a published issue or a send authorization.",
    ),
    editorial: structuredClone(editorial),
    r4EditionId: null,
    supersedes: "letter-edition-one-preserved",
    correction: {
      reason: "Fictional correction fixture tests immutable public ancestry.",
      sourceRefs: ["Excluded automated test fixture."],
    },
    authoredLetterPath:
      "src/data/publication-letter-drafts/fictional-test.json",
  };
}
export function authoredFutureRaw() {
  return (
    JSON.stringify(
      {
        kind: "authored-letter-v1",
        title: "Fictional test only",
        summary: "This excluded test data is not a real publication.",
        blocks: [
          {
            kind: "paragraph",
            text: "A future source-linked draft can be captured without accepting request HTML.",
          },
        ],
        sources: [],
        publicByline: "Fictional test fixture",
        aiAssistance: "AI-assisted test data.",
        declaredDate: "2026-10-28",
      },
      null,
      2,
    ) + "\n"
  );
}
