/** Inert publication/proposal DTOs only; no runtime, provider or research qualification. */
export type Hash = string; // 64 lowercase SHA-256 hex
export type Commit = string; // 40 lowercase Git hex, committed input baseline
export type Id = string; // [a-z][a-z0-9-]{0,79}; no paths, colon, query or latest alias
export type Instant = string; // real canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ, 1900..2200
export type Day = string; // real YYYY-MM-DD calendar date, no invented publication instant
export type Family =
  "state-of-charity" | "progress-report" | "principles" | "journal" | "letter";
export type Pin = { id: Id; hash: Hash };
export type Source = {
  id: Id;
  adapterId: Id;
  adapterVersion: 1;
  commit: Commit;
  path: string;
  rawUtf8: string;
  rawSha256: Hash;
  projectionHash: Hash;
  hash: Hash;
};
export type Coverage = {
  scope: string;
  geography: string;
  period: null | {
    from: string;
    to: string;
    convention: "calendar-period" | "utc-half-open";
  };
  completeness: "declared-scope-only";
  limitations: string[];
};
export type Member = {
  id: Id;
  kind:
    | "figure-input"
    | "project-census"
    | "chapter"
    | "manuscript"
    | "r4-progress"
    | "authored-letter"
    | "legacy-letter";
  sourcePins: Pin[];
  contentHash: Hash;
  payload: MemberPayload;
};
export type Citation = {
  title: string;
  url: string;
  publisher: string | null;
  year: number | null;
  note: string | null;
};
export type QualificationRef = {
  recordId: string;
  version: number;
  subjectHash: Hash;
  ledgerEditionId: string;
  ledgerEditionHash: Hash;
};
export type MemberPayload =
  | {
      kind: "figure-input-v1";
      key: string;
      label: string;
      value: string | null;
      unit: string;
      currency: string | null;
      geography: string;
      sourcePeriodLabel: string | null;
      measure: "stock" | "flow" | "count" | "ratio" | "source-description";
      denominator: string | null;
      sources: Citation[];
      limitations: string[];
    }
  | {
      kind: "project-census-v1";
      collections: { collection: string; entries: number; drafts: number }[];
      evidence: { code: string; label: string; count: number }[];
      availability: { status: string; count: number }[];
      declaredProblemStatuses: { status: string; count: number }[];
      problemStates: {
        basis: "pinned-r4-projection";
        ledgerEditionId: string;
        ledgerEditionHash: Hash;
        counts: { state: string; count: number }[];
      };
    }
  | {
      kind: "chapter-v1";
      chapter: number;
      title: string;
      summary: string;
      body: string;
      sources: Citation[];
      declaredReview: "draft" | "reviewed";
      qualification: QualificationRef | null;
      license: "CC BY 4.0";
    }
  | {
      kind: "manuscript-v1";
      title: string;
      summary: string;
      body: string;
      attribution: string;
      declaredDate: Day;
      volume: number;
      issue: number;
      sources: Citation[];
      declaredReview: "draft" | "reviewed";
      qualification: QualificationRef;
    }
  | {
      kind: "r4-progress-v1";
      ledgerEditionId: string;
      ledgerEditionHash: Hash;
      from: Instant;
      to: Instant;
      progressJson: string;
      progressSha256: Hash;
    }
  | {
      kind: "authored-letter-v1";
      title: string;
      summary: string;
      blocks: PublicationBlock[];
      sources: Citation[];
      publicByline: string;
      aiAssistance: string;
      declaredDate: Day;
    }
  | {
      kind: "legacy-letter-v1";
      id: "edition-1";
      title: string;
      subject: string;
      html: string;
      text: string;
      legacyContentHash: Hash;
    };

export type EditionCore = {
  format: "charitology-publication-edition-core";
  schemaVersion: 1;
  id: Id;
  family: Family;
  sequence: number;
  title: string;
  declaredPublicationDate: Day | null;
  sourceLabel: string | null;
  provenance: "new-source-capture" | "preserved-artifact" | "reconstruction";
  capturedAt: Instant;
  sourceCommit: Commit;
  method: { id: Id; version: 1; definitionHash: Hash };
  coverage: Coverage;
  sourcePins: Pin[];
  members: Member[];
  editorial: {
    label: "editorial-draft";
    aiAssistance: string;
    limitations: string[];
  };
  r4: null | {
    editionId: string;
    editionHash: Hash;
    factualHash: Hash;
    progressInputHash: Hash;
  };
  legacyMail: null | {
    id: "edition-1";
    algorithm: "ordered-json-mail-v1";
    contentHash: Hash;
  };
  supersedes: Id | null;
  correction: null | { reason: string; sourceRefs: string[] };
};
export type Artifact = {
  id: Id;
  fileName: string;
  mediaType: "text/markdown;charset=utf-8" | "text/plain;charset=utf-8";
  byteLength: number;
  sha256: Hash;
};
export type Edition = {
  format: "charitology-publication-edition";
  schemaVersion: 1;
  core: EditionCore;
  coreHash: Hash;
  artifacts: Artifact[];
  hash: Hash;
};
export type Registry = {
  format: "charitology-publication-registry";
  schemaVersion: 1;
  editionPins: Pin[];
  sourcePins: Pin[];
  current: Record<Family, Id>;
  hash: Hash;
};

export type Proposal = {
  id: Id;
  family: Family;
  currentVersionId: Id;
};
export type ProposalMemberSelection = {
  editionId: Id;
  memberId: Id;
  contentHash: Hash;
};
export type ProposalBasisInput = { edition: Edition; sources: Source[] };
export type ProposalVersion = {
  id: Id;
  proposalId: Id;
  version: number;
  previousId: Id | null;
  previousHash: Hash | null;
  recordedAt: Instant;
  title: string;
  summary: string;
  declaredPublicationDate: Day | null;
  basisPins: Pin[];
  selectedMembers: ProposalMemberSelection[];
  blocks: PublicationBlock[];
  correction: null | { supersedes: Id; reason: string };
  amendmentReason: string | null;
  operatorNotes: string;
  hash: Hash;
};
export type PublicationBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "links"; items: { label: string; url: string }[] };
export type ProposalState = {
  format: "charitology-publication-proposals";
  version: 1;
  id: Id;
  revision: number;
  createdAt: Instant;
  updatedAt: Instant;
  bases: Edition[];
  sources: Source[];
  proposals: Proposal[];
  versions: ProposalVersion[];
  draft: {
    tab: "proposals" | "sources" | "preview" | "exports" | "recovery";
    proposalId: Id | null;
    form: null | {
      kind: "proposal" | "basis";
      targetId: Id | null;
      binding: Record<string, string>;
      fields: Record<string, string>;
    };
    dirty: boolean;
  };
};

export type ProposalDraft = ProposalState["draft"];
export type ProposalDigest = (bytes: Uint8Array) => Promise<Hash>;
export type ProposalBasisOffer = {
  editionId: Id;
  editionHash: Hash;
  href: string; // fixed base-aware /record/editions/<id>/basis.json only
  byteLength: number; // exact complete transfer wrapper bytes, including newline
  sha256: Hash; // raw bytes; downstream of edition/source hashes, no cycle
};
export type ProposalCatalog = {
  format: "charitology-publication-proposal-catalog";
  version: 1;
  registryHash: Hash;
  entries: Pin[]; // known edition ID -> exact final edition hash
  basisOffers: ProposalBasisOffer[]; // one sorted offer per entry; metadata only
  hash: Hash;
};
export type ProposalCommand =
  | { kind: "basis.capture"; basis: ProposalBasisInput }
  | {
      kind: "proposal.freeze";
      proposalId: Id | null;
      expectedVersionId: Id | null;
      expectedVersionHash: Hash | null;
      basisPins: Pin[];
      selectedMembers: ProposalMemberSelection[];
      title: string;
      summary: string;
      family: Family;
      declaredPublicationDate: Day | null;
      blocks: PublicationBlock[];
      correction: ProposalVersion["correction"];
      operatorNotes: string;
      amendmentReason: string | null;
    }
  | { kind: "draft.replace"; draft: ProposalDraft };
export type ProposalModelContext = {
  expectedStateHash: Hash;
  expectedRevision: number;
  at: Instant;
  makeId(): Id;
  knownCatalog: ProposalCatalog;
  digest?: ProposalDigest; // actual SHA-256 bytes -> lowercase hex
};
export type PreparedProposalMutation = {
  format: "charitology-publication-proposal-mutation";
  version: 1;
  commandKind: ProposalCommand["kind"];
  expectedStateHash: Hash;
  expectedRevision: number;
  catalogHash: Hash;
  candidateHash: Hash;
  candidate: ProposalState;
  commandHash: Hash;
  noOp: boolean;
  summary: { message: string; proposalId: Id | null; versionId: Id | null };
};

export type ProposalPacketOptions = {
  versionId: Id;
  includeOperatorNotes: boolean;
};
