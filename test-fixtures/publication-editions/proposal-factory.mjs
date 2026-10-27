// Fictional public roots for private proposal checks; never claimed publication or human review.
import { createHash } from "node:crypto";
export const at = "2026-10-27T12:00:00.000Z";
export const sha = (s) => createHash("sha256").update(s).digest("hex");
export function fixture(m, body = "Fictional chapter bytes.", suffix = "one") {
  const H = m.hashPublicationProposalSync;
  const source = {
    id: "source-" + suffix,
    adapterId: "synthetic-chapter",
    adapterVersion: 1,
    commit: "a".repeat(40),
    path: "src/content/principles/fictional-" + suffix + ".md",
    rawUtf8: body,
    rawSha256: sha(body),
    projectionHash: H({ body }),
  };
  source.hash = H(source);
  const payload = {
    kind: "chapter-v1",
    chapter: 1,
    title: "Fictional chapter",
    summary: "Synthetic only",
    body,
    sources: [],
    declaredReview: "draft",
    qualification: null,
    license: "CC BY 4.0",
  };
  const core = {
    format: "charitology-publication-edition-core",
    schemaVersion: 1,
    id: "edition-" + suffix,
    family: "principles",
    sequence: 1,
    title: "Fictional fixed basis",
    declaredPublicationDate: null,
    sourceLabel: null,
    provenance: "new-source-capture",
    capturedAt: at,
    sourceCommit: "a".repeat(40),
    method: {
      id: "synthetic-chapter",
      version: 1,
      definitionHash: "b".repeat(64),
    },
    coverage: {
      scope: "One fictional chapter",
      geography: "Project only",
      period: null,
      completeness: "declared-scope-only",
      limitations: ["Synthetic software fixture."],
    },
    sourcePins: [{ id: source.id, hash: source.hash }],
    members: [
      {
        id: "chapter-one",
        kind: "chapter",
        sourcePins: [{ id: source.id, hash: source.hash }],
        contentHash: H(payload),
        payload,
      },
    ],
    editorial: {
      label: "editorial-draft",
      aiAssistance: "Synthetic test fixture",
      limitations: [],
    },
    r4: null,
    legacyMail: null,
    supersedes: null,
    correction: null,
  };
  const edition = {
    format: "charitology-publication-edition",
    schemaVersion: 1,
    core,
    coreHash: H(core),
    artifacts: [],
  };
  edition.hash = H(edition);
  const basis = { edition, sources: [source] },
    bundle =
      JSON.stringify(
        {
          format: "charitology-publication-proposal-basis",
          version: 1,
          ...basis,
        },
        null,
        2,
      ) + "\n";
  const catalog = {
    format: "charitology-publication-proposal-catalog",
    version: 1,
    registryHash: "c".repeat(64),
    entries: [{ id: core.id, hash: edition.hash }],
    basisOffers: [
      {
        editionId: core.id,
        editionHash: edition.hash,
        href: "/record/editions/" + core.id + "/basis.json",
        byteLength: Buffer.byteLength(bundle),
        sha256: sha(bundle),
      },
    ],
  };
  catalog.hash = H(catalog);
  return { source, edition, basis, bundle, catalog };
}
export function command(m, basis, extra = {}) {
  return {
    kind: "proposal.freeze",
    proposalId: null,
    expectedVersionId: null,
    expectedVersionHash: null,
    basisPins: [{ id: basis.edition.core.id, hash: basis.edition.hash }],
    selectedMembers: basis.edition.core.members.map((x) => ({
      editionId: basis.edition.core.id,
      memberId: x.id,
      contentHash: x.contentHash,
    })),
    family: "principles",
    title: "Fictional proposal",
    summary: "Self-recorded",
    declaredPublicationDate: null,
    blocks: [{ kind: "paragraph", text: "Draft only." }],
    correction: null,
    operatorNotes: "PRIVATE OPERATOR NOTE",
    amendmentReason: null,
    ...extra,
  };
}
let sequence = 0;
export const makeId = () => "private-" + ++sequence;
export const context = (m, state, catalog, extra = {}) => ({
  expectedStateHash: m.hashPublicationProposalSync(state),
  expectedRevision: state.revision,
  at,
  makeId,
  knownCatalog: catalog,
  ...extra,
});
export async function captured(m, f = fixture(m)) {
  let state = m.blankPublicationProposals("synthetic-workspace", at);
  return (
    await m.preparePublicationProposalCommand(
      state,
      { kind: "basis.capture", basis: f.basis },
      context(m, state, f.catalog),
    )
  ).candidate;
}
export function wrapper(m, state) {
  return (
    JSON.stringify(
      {
        format: "charitology-publication-proposals-backup",
        version: 1,
        exportedAt: at,
        state,
        checksum: m.hashPublicationProposalSync(state),
      },
      null,
      2,
    ) + "\n"
  );
}
export async function exactBoundaryState(m) {
  let lo = 1,
    hi = 1_048_576,
    best;
  while (lo <= hi) {
    const n = Math.floor((lo + hi) / 2),
      f = fixture(m, "x".repeat(n), "large");
    const state = structuredClone(
      m.blankPublicationProposals("boundary-workspace", at),
    );
    state.bases = [f.edition];
    state.sources = f.basis.sources;
    state.revision = 1;
    state.draft.form = {
      kind: "basis",
      targetId: null,
      binding: {},
      fields: { editionId: "" },
    };
    const size = Buffer.byteLength(wrapper(m, state));
    if (size <= 2_097_152) {
      best = { state, f };
      lo = n + 1;
    } else hi = n - 1;
  }
  best.state.draft.form.fields.editionId = "x".repeat(
    2_097_152 - Buffer.byteLength(wrapper(m, best.state)),
  );
  return { ...best, catalog: best.f.catalog };
}
