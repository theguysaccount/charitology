# Publication edition interfaces

R5 interfaces · October 27, 2026 · AI-assisted · review: draft. **Publicly frozen after coordinator and independent agent review. Runtime implementation follows these interfaces; production migration/provider acceptance remains a separate release gate. No send is authorized here.** Read [the plan](PUBLICATION_EDITIONS_PLAN.md). All objects below are strict plain JSON with closed versioned adapter schemas, not permission to accept arbitrary nested data.

## Admission, identity and hashes

```ts
type Hash = string; // 64 lowercase SHA-256 hex
type Commit = string; // 40 lowercase Git hex, committed input baseline
type Id = string; // [a-z][a-z0-9-]{0,79}; no paths, colon, query or latest alias
type Instant = string; // real canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ, 1900..2200
type Day = string; // real YYYY-MM-DD calendar date, no invented publication instant
type Family =
  "state-of-charity" | "progress-report" | "principles" | "journal" | "letter";
type Pin = { id: Id; hash: Hash };
type Source = {
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
type Coverage = {
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
type Member = {
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
type Citation = {
  title: string;
  url: string;
  publisher: string | null;
  year: number | null;
  note: string | null;
};
type QualificationRef = {
  recordId: string;
  version: number;
  subjectHash: Hash;
  ledgerEditionId: string;
  ledgerEditionHash: Hash;
};
type MemberPayload =
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
```

`MemberPayload` is implemented by the five family adapters; it is not an unrestricted `Record<string,unknown>`. Member kind must match its payload discriminator. Versioned definitions fix field mappings, ordering/defaults, complete source inventories and render semantics. Unknown current frontmatter fields fail inventory classification. Retain original source tokens in archived bytes; financial comparison values are explicit source decimals, never guessed minor-unit currency precision. Source-description values may remain null with explanatory text. Do not invent a denominator/currency from a missing field. Census availability counts pages/functions, not institutions. declaredProblemStatuses are only literal frontmatter assertions; effective problemStates come from the same pinned validated R4 projection used by Progress, never an independent solved/review reducer. State and Journal pin their needed R4 closure as well; an unqualified source declaration cannot upgrade their research/review display. Review declarations are source assertions; qualifying display needs the exact validated R4 reference. `progressJson` is canonical existing R4 output reproduced from the pinned closed R4 edition, checked with that model and its own byte hash, not accepted arbitrary JSON or a second reducer. Legacy HTML is stored/rendered as inert text, not executed.

All JSON inputs use fatal UTF-8, decoded duplicate-key refusal, maximum container depth 32 and pre-decode byte bounds. Root container is depth 1; braces in strings do not count. Reject unknown keys, nonfinite numbers, accessors, cycles and unsupported versions. Source and edition IDs are globally unique in their respective object families; `(family,sequence)` is unique, consecutive and immutable. Member IDs are stable logical slots unique within an edition, paired with exact content hashes across editions; the same ID/hash cannot assert different payloads. Member content hash covers its payload, while the enclosing edition also binds source pins and member order. Source paths are explicit adapter allowlists, repository-relative regular files, with no symlinks or traversal. The public, byte-frozen services/newsletter/lib/content.mjs is explicitly allowlisted for legacy Letter 1; configuration, env, subscriber/account data and all other private service material are excluded. Source snapshot IDs bind the enclosing object hash; raw hashes remain separate. Same commit/path cannot assert different raw bytes. `Source.commit` retains that immutable snapshot's original committed pin. A later capture may reuse it only after its explicit new baseline proves identical path/raw/projection/method bytes; `Edition.core.sourceCommit` records the newly inspected complete baseline. Closed archive validation alone does not imply a later external retrieval.

```ts
type EditionCore = {
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
type Artifact = {
  id: Id;
  fileName: string;
  mediaType: "text/markdown;charset=utf-8" | "text/plain;charset=utf-8";
  byteLength: number;
  sha256: Hash;
};
type Edition = {
  format: "charitology-publication-edition";
  schemaVersion: 1;
  core: EditionCore;
  coreHash: Hash;
  artifacts: Artifact[];
  hash: Hash;
};
type Registry = {
  format: "charitology-publication-registry";
  schemaVersion: 1;
  editionPins: Pin[];
  sourcePins: Pin[];
  current: Record<Family, Id>;
  hash: Hash;
};
```

Hashes use sorted object keys and exact array/string order. `coreHash=SHA256(canonical(core))`; artifacts are rendered only from that core/hash and fixed renderer. `Edition.hash` excludes only its own hash. Registry hash excludes only its own hash and uses sorted unique pins. An artifact never embeds the final enclosing edition hash. Edition JSON downloads contain the manifest but are not self-listed artifact hashes. Artifact filenames are allowlisted basenames, no code-bearing extension. New server mail bindings are computed downstream of the final edition and are not hashed back into it.

Source/edition/artifact objects are file-per-object and closed over all referenced historical dependencies. Five initial entries are exactly four new captures plus one preserved legacy mail artifact; no reconstruction is seeded. Journal/Principles count their actual three/ten members; Progress uses a closed R4 edition, not mutable source labels. Current pointers select one edition per family but never alter old objects. A correction needs a new sequence/ID, same-family earlier `supersedes`, reason and evidence; reject cycles, duplicate identities or removal/mutation of prior pins.

The capture CLI has a default no-write preview. Writes require explicit committed source baseline, canonical capture instant and a reviewed proposal hash; prove current covered bytes match that commit before writing. Source A and edition B are separate commits. No build clock, provider call, remote fetch, implicit latest selection or historical artifact replacement.

Append-only release validation is a separate mandatory Node/Git gate, not optional previousRegistry semantic checking. checkCommittedPublicationAppendOnly resolves the exact supplied head/base commits from the local object database, proves base ancestry, reads the full previous reserved registry tree and every historical referenced object/artifact, and compares exact old Git-blob bytes plus monotonic registry rules. It never accepts a caller-supplied JSON substitute as proof of a committed base and never fetches Git. Missing commit/object/closure, partial registry, unknown files, changed/deleted old bytes or an invalid source/edition chain throws; the CLI exits nonzero. The registry itself may append new pins and advance current pointers under validated same-family sequence rules; existing source/edition/artifact bytes cannot be reformatted.

Modes ci and release require an explicit available 40-hex baseCommit, and may return only verified or bootstrap-verified. Local mode alone may return unavailable for an absent base, with null prior hash and zero checkedHistoricalFiles; that result is neither append-only acceptance nor a releasable artifact. A first-registry bootstrap still proves an exact available base commit whose reserved registry root is wholly absent. A nonempty/partial prior root is never treated as empty bootstrap. Ordinary shallow/offline builds may validate checked-in hash closure without Git, but cannot satisfy this separate PR/release gate.

The planned `scripts/check-publication-editions-append-only.mjs` invokes that function with `--mode local|ci|release --head-ref <exact-40-hex> --base-ref <exact-40-hex>`. CI uses an exact checked-out PR head and the trusted `github.event.pull_request.base.sha`; it records both resolved commits. The workflow makes their complete objects available first (`actions/checkout` with `fetch-depth: 0`, or an explicit workflow fetch of those exact refs), then requires base ancestry and the gate's verified result. A moved base needs a rerun against the new event base; no merge-base/HEAD~1 guess, current branch name, caller JSON or fallback empty registry can replace it. Missing objects after checkout fail the job. The checker itself remains offline and never fetches.

A main push/release job uses the exact nonzero `github.event.before` and exact pushed head; a manual release requires an explicit recorded previously accepted main commit and exact release head, with the same ancestry/full-closure proof. A zero/missing event base cannot silently bootstrap; an initial registry release must deliberately supply a real earlier committed base whose reserved roots are absent. CI/release uploads the bounded report containing exact head/base, previous registry/inventory hashes and historical file count, and refuses publication when that gate is missing/unavailable. Local checked-in closure validation remains useful but does not waive this workflow.

The gate covers both `src/data/publication-editions/**` and `services/newsletter/editions/**`, including every historical public source/edition/text artifact and immutable mail issue/lineage object. Known registry indexes may change only by validated monotonic append/current-pointer rules; all previously referenced objects retain exact committed bytes. It also compares the fixed legacy `services/newsletter/lib/content.mjs` bytes with the registered golden baseline. It validates the full previous public and mail closures before comparing the head; missing historical files or an unreadable prior registry is an error, not bootstrap. `previousRegistry`/`previousObjects` in the pure validator are supplementary semantic checks, never proof that this committed-base gate ran. The initial bootstrap status requires both reserved roots wholly absent at the exact base, with the legacy golden check still satisfied.

Recommended public limits: 100 editions; 1,000 shared source snapshots; 1,000 member/source pins per edition; raw source 2 MiB and complete pretty source-snapshot JSON 2 MiB; complete pretty edition JSON plus terminal newline 2,097,152 bytes; textual artifact 2,097,152 bytes; 20 MiB total registry/source/artifact files. Measure the real five-entry candidate before acceptance. Reject whole over-limit proposals before writes, with no pruning/truncation.

## Pure projection and public routes

```ts
type RegistryInput = {
  registry: Registry;
  sources: Source[];
  editions: Edition[];
  artifacts: {
    editionId: Id;
    fileName: string;
    mediaType: Artifact["mediaType"];
    text: string;
  }[];
};
type ValidatedRegistry = Readonly<RegistryInput>;
type PublicationProjection = {
  edition: Edition;
  supersededBy: Pin[];
  artifacts: Artifact[];
};
type PublicationComparison = {
  from: Pin;
  to: Pin;
  differences: {
    memberId: Id;
    code:
      | "count-change"
      | "qualified-r4-disposition"
      | "editorial-change"
      | "unknown-baseline"
      | "not-comparable";
    before: string | null;
    after: string | null;
    reason: string;
    r4EventIds: string[];
  }[];
};
declare function validatePublicationRegistry(
  input: unknown,
  options?: {
    previousRegistry?: Registry;
    previousObjects?: RegistryInput;
  },
): ValidatedRegistry;
declare function projectPublicationEdition(
  validated: ValidatedRegistry,
  id: Id,
): PublicationProjection;
declare function comparePublicationEditions(
  validated: ValidatedRegistry,
  selection: { fromId: Id; toId: Id },
): PublicationComparison;
declare function makePublicationDownload(
  validated: ValidatedRegistry,
  id: Id,
  options: { format: "json" | "markdown" },
): Uint8Array;

type PublicationAppendOnlyReport = {
  mode: "local" | "ci" | "release";
  status: "verified" | "bootstrap-verified" | "unavailable";
  headCommit: Commit;
  baseCommit: Commit | null;
  previousRegistryHash: Hash | null;
  previousInventoryHash: Hash | null;
  checkedHistoricalFiles: number;
};
declare function checkCommittedPublicationAppendOnly(options: {
  repositoryRoot: string;
  headCommit: Commit;
  baseCommit: Commit | null;
  mode: "local" | "ci" | "release";
}): Promise<PublicationAppendOnlyReport>;
```

The registry validation/projection/comparison/download functions take explicit plain inputs and fixed adapter/renderer versions with no I/O or current time. checkCommittedPublicationAppendOnly is the distinct Node/Git gate described above; it never belongs in a browser bundle. Projections/downloads are detached and deeply frozen where ordinary objects permit it. Never promise frozen typed arrays; callers own byte copies. Comparison returns typed differences with reasons: comparable project count change, R4-supported dated disposition, editorial change, unknown baseline or not comparable. It never pools causal effects, converts currencies or counts a draft as research.

Proposed static routes: `/record/editions/`, `/record/editions/<id>/`, `/record/editions/<id>/edition.json`, `/record/editions/<id>/edition.md` and inert source-text routes ending `source.txt`. Use ordinary final filenames, not namespaced-ID endpoint basenames. Root-relative href helpers add the current base path exactly once. All edition content is readable without JavaScript. Render text/inert code, sanitize the existing Markdown subset with raw HTML/images/embeds disabled, allow only explicit HTTPS or internal links and never fetch sources.

Add `publication-editions` as a metadata API endpoint, using the existing wrapper with explicit build-metadata wording and a factual registry hash. Per-edition JSON has pinned capture/data and no wall-clock wrapper. Do not change existing endpoint shapes/issue 1 feed identity. Recount actual endpoint names at integration. No subscriber, provider operation ID, private draft, OS record or local register enters these endpoints.

## Local proposal model and store

```ts
type Proposal = {
  id: Id;
  family: Family;
  currentVersionId: Id;
};
type ProposalMemberSelection = {
  editionId: Id;
  memberId: Id;
  contentHash: Hash;
};
type ProposalBasisInput = { edition: Edition; sources: Source[] };
type ProposalVersion = {
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
type PublicationBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "links"; items: { label: string; url: string }[] };
type ProposalState = {
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
```

Each retained basis is the complete immutable public edition manifest with all of its exact source snapshots. Its manifest/core/member/source hashes and closed schemas are checked against the known public catalog; server adapter/R4 semantic validation remains pinned upstream; artifact descriptors are retained, but artifact bytes are not copied into local storage, so the desk does not claim to have rechecked their downloaded bytes. Global source IDs and edition IDs cannot be rebound to different hashes. Sources are deduplicated by exact ID/hash; every historical proposal retains its declared closure. A version pins one to five retained editions. Every selected member is resolved by edition ID plus member ID/content hash, preventing collisions between families. Nothing is accepted from an arbitrary remote URL or a private source key.

```ts
type ProposalDraft = ProposalState["draft"];
type ProposalDigest = (bytes: Uint8Array) => Promise<Hash>;
type ProposalBasisOffer = {
  editionId: Id;
  editionHash: Hash;
  href: string; // fixed base-aware /record/editions/<id>/basis.json only
  byteLength: number; // exact complete transfer wrapper bytes, including newline
  sha256: Hash; // raw bytes; downstream of edition/source hashes, no cycle
};
type ProposalCatalog = {
  format: "charitology-publication-proposal-catalog";
  version: 1;
  registryHash: Hash;
  entries: Pin[]; // known edition ID -> exact final edition hash
  basisOffers: ProposalBasisOffer[]; // one sorted offer per entry; metadata only
  hash: Hash;
};
type ProposalCommand =
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
type ProposalModelContext = {
  expectedStateHash: Hash;
  expectedRevision: number;
  at: Instant;
  makeId(): Id;
  knownCatalog: ProposalCatalog;
  digest?: ProposalDigest; // actual SHA-256 bytes -> lowercase hex
};
type PreparedProposalMutation = {
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
declare function canonicalPublicationProposalJson(value: unknown): string;
declare function hashPublicationProposalSync(value: unknown): Hash;
declare function strictPublicationProposalJson(
  raw: string | Uint8Array,
  maxBytes: number,
): unknown;
declare function validateProposalCatalog(value: unknown): ProposalCatalog;
declare function makeProposalCatalog(
  registry: ValidatedRegistry,
): ProposalCatalog; // SERVER module only; not a browser runtime export
declare function blankPublicationProposals(id: Id, at: Instant): ProposalState;
declare function preparePublicationProposalCommand(
  current: ProposalState,
  command: ProposalCommand,
  context: ProposalModelContext,
): Promise<PreparedProposalMutation>;
declare function validatePublicationProposalState(
  input: unknown,
  knownCatalog: ProposalCatalog,
): ProposalState;
declare function publicationProposalStateHash(
  state: ProposalState,
  digest?: ProposalDigest,
): Promise<Hash>;
declare function publicationProposalCommandForm(
  command: ProposalCommand,
  context: { catalogHash: Hash },
): ProposalDraft["form"];
declare function publicationProposalFormMatchesCommand(
  form: ProposalDraft["form"],
  command: ProposalCommand,
  context: { catalogHash: Hash },
): boolean;
declare function makePublicationProposalBackup(
  state: ProposalState,
  exportedAt: Instant,
  knownCatalog: ProposalCatalog,
  digest?: ProposalDigest,
): Promise<string>;
declare function parsePublicationProposalBackup(
  input: string | Uint8Array,
  knownCatalog: ProposalCatalog,
  digest?: ProposalDigest,
): Promise<ProposalState>;
type ProposalPacketOptions = {
  versionId: Id;
  includeOperatorNotes: boolean; // unchecked by default
};
declare function makePublicationProposalPacket(
  state: ProposalState,
  options: ProposalPacketOptions,
  knownCatalog: ProposalCatalog,
  digest?: ProposalDigest,
): Promise<{
  json: string;
  markdown: string;
  selectionHash: Hash;
}>;
```

Server `src/lib/publication-editions-model.mjs` validates every family adapter and the complete pinned R4 projection using the existing R4 implementation. Its Node-only canonical/model imports must never enter the browser bundle. The browser `src/lib/client/publication-editions-model.ts` validates strict proposal/basis schemas, canonical hashes, source/member/manifest closure and exact known catalog pins; it neither imports nor copies the R4 qualification reducer. Qualification/progress fields are retained server-validated assertions bound to those public hashes. They are not recalculated or upgraded by a local proposal. `makeProposalCatalog` belongs only to the server module; the browser exports `validateProposalCatalog` and the local command/storage/packet helpers. Shared declarations may live in a type-only inert module with no runtime server import.

The server emits only the small catalog/offer metadata in the initial desk page. Each explicit selected capture fetches its one known same-origin, base-aware `basis.json` route; no caller URL, remote proxy, automatic discovery or all-editions payload. The strict wrapper is exactly `{format:'charitology-publication-proposal-basis',version:1,edition,sources}` plus newline, with every Source referenced by that edition and no unrelated artifacts/private data. It includes the complete R4 source closure needed by that edition; source snapshots remain inert strings. An offer's bytes/hash are calculated from this wrapper after its edition/source roots, then the catalog hash covers the offers. Artifact text is not in the wrapper. UI copies response bytes, applies a deadline and <=2,097,152-byte transfer cap before decode, checks exact offered byteLength/SHA-256, then passes the detached `{edition,sources}` to the model. A too-large offer is visibly unavailable for local capture; its public archive remains readable. Passing transfer admission does not guarantee the complete future backup fits: model and store must still admit the whole candidate before memory assignment. Fetch/body failure preserves current state and unfinished form. Generated basis downloads are measured separately and counted in the public 20 MiB shipped-output budget; no proof/source trimming is allowed to meet it.

The pure command model snapshots and bounds mutable caller inputs synchronously before its first await, then rechecks their stamps after asynchronous digests. It never reads the DOM, clock, storage or network. Basis capture is an explicit selected public-bundle command, not automatic page discovery. Proposal creation supplies null ID/hash; amendments require the current proposal ID/hash and a bounded reason. Same-current complete identity is no-op; an explicit ancestor-identical amendment still creates a new latest version with its new provenance, without carrying review/publication authority forward. Freeze clears only an exactly matching unfinished form; draft replacement is explicit. The store separately checks exact observed saved bytes and current in-memory hash; a prepared command never acquires replacement authority merely by supplying matching strings.

Closed forms are discriminated; every name below is allowlisted and other names are refused.

| Form kind  | Target and bindings                                                                                                                      | Raw fields                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basis`    | targetId null; binding `catalogHash`                                                                                                     | `editionId`, `editionHash`                                                                                                                                              |
| `proposal` | targetId equals proposalId (null for new); bindings `proposalId`, `expectedVersionId`, `expectedVersionHash`, `basisHash`, `catalogHash` | `family`, `title`, `summary`, `declaredPublicationDate`, `basisPins`, `selectedMembers`, `blocks`, `supersedes`, `correctionReason`, `operatorNotes`, `amendmentReason` |

`basisHash` is the canonical hash of the exact sorted basisPins. ID/hash bindings use their exact strings; nullable ID bindings use the literal string null. Array/object fields use exact canonical JSON, while title/summary/notes/reasons retain exact raw text. Nullable day/supersedes/reason editor fields use the empty string only for null; valid nonnull values must be nonempty. Partial maps and malformed bounded strings are retained for repair, never filled from current selection. The matcher requires the exact kind/target, all required bindings and fields, catalog context, canonical values and no unmatched extra supplied names. A partial, malformed, unrelated, newer or old-catalog form cannot clear; error/no-op clears nothing. A basis form is only a choice of registered identity, not copied file authority.

The known catalog is derived from an already validated checked-in registry and injected by the server adapter. Its entries are sorted unique final edition pins, and its one-to-one basisOffers carry only fixed routes and exact transfer hashes/sizes. The canonical catalog hash covers all fields except its own hash. Incoming retained Edition/source closures must validate internally and match those registered IDs/hashes exactly; custom/local claims cannot become public provenance merely by recomputing their own hashes. The model snapshots this catalog, compares an optional async digest to pinned synchronous SHA-256, and binds expected state hash/revision. Catalog growth does not rewrite an old proposal; a store instance keeps a fixed catalog until explicit reload/reopen. Backups using a not-yet-offered public edition fail as unsupported while their raw bytes remain recoverable.

Version 1 of a proposal has null previousId/previousHash and amendmentReason; later versions pin the exact current predecessor ID/hash and a nonempty reason, with no branch/orphan/skipped sequence or changed family. The comparison for a current-identical freeze uses all authored payload fields, exact basis/member selections and private operator notes, excluding only version identity, predecessor, recording instant and amendment reason. It is no-op even if a different reason alone was typed; preserve that unfinished reason. An ancestor-identical payload differs from the current head and creates a new version with its current provenance/reason. Null dates stay unknown; recordedAt never witnesses publication or research review.

Explicitly discarding a raw form in this tab must say that its saved copy remains. A separate normal revisioned `draft.replace` is the only way to save an empty form; it never clears other proposals or sources.
One new key and Web Lock: `charitology.publication-editions.v1`. At most 20 retained basis manifests, 1,000 shared retained source snapshots, 20 proposals/100 retained versions, one to five basis pins and 100 selected members per proposal version; title 180, summary 2,000, operator notes 5,000 and amendment reason 2,000 characters. At most 100 authored blocks, 5,000 characters per text/list item, 20 list items or 20 links per block, link labels 180 and HTTPS/no-credential URLs 500 characters. The complete canonical blocks JSON must fit 65,536 characters, in addition to those field limits. Whole raw form <=512 KiB, at most 40 fields/bindings total, 65,536 characters each. This accommodates the largest valid selected-member/block JSON strings without making a valid typed proposal impossible to reopen as a raw form. Complete pretty backup wrapper `{format:'charitology-publication-proposals-backup',version:1,exportedAt,state,checksum}` plus newline <=2,097,152 UTF-8 bytes. Exact limits apply before memory assignment.

### Exact store and controller handshake

```ts
type ProposalStoreCode =
  | "ready"
  | "unsupported"
  | "read_error"
  | "corrupt"
  | "external_change"
  | "persist_failed"
  | "closed";
interface ProposalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface ProposalLocks {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    action: () => Promise<T>,
  ): Promise<T>;
}
interface ProposalStoreSnapshot {
  readonly state: ProposalState | null;
  readonly hash: Hash | null;
  readonly generation: number;
  readonly observedRaw: string | null | undefined;
  readonly unsaved: boolean;
  readonly blocked: string;
  readonly message: string;
  readonly code: ProposalStoreCode;
  readonly readOnly: boolean;
  readonly canWrite: boolean;
  readonly canRecover: boolean;
  readonly canRetryPersist: boolean;
  readonly canUndo: boolean;
}
interface ProposalStoreOptions {
  initialState: ProposalState; // exact blank; used only for actual absent key
  knownCatalog: ProposalCatalog; // detached, validated and fixed for this instance
  storage?: ProposalStorage;
  locks?: ProposalLocks | null;
  cryptoAvailable?: boolean;
  digest?: ProposalDigest;
}
interface ProposalMutationBinding {
  expectedGeneration: number;
  expectedStateHash: Hash;
  expectedRevision: number;
}
interface ProposalPrepareOptions {
  at: Instant;
  makeId(): Id;
}
interface ProposalCommitOptions {
  assertUiCurrent(): undefined; // synchronous exact form/selection epoch check
}
interface ProposalReloadOptions {
  discardUnsaved?: boolean; // sole allowed key; snapshot before queuing
}
declare const PROPOSAL_PREPARED_OWNER: unique symbol;
interface OwnedProposalPrepared {
  readonly format: "charitology-publication-proposal-prepared";
  readonly version: 1;
  readonly mutation: PreparedProposalMutation;
  readonly expectedGeneration: number;
  readonly expectedObservedRawHash: Hash | null;
  readonly [PROPOSAL_PREPARED_OWNER]: true;
}
declare const PROPOSAL_RECOVERY_OWNER: unique symbol;
interface ProposalRecoveryPreview {
  readonly format: "charitology-publication-proposal-recovery-preview";
  readonly version: 1;
  readonly kind: "restore" | "clear";
  readonly state: ProposalState;
  readonly stateHash: Hash;
  readonly expectedGeneration: number;
  readonly expectedStateHash: Hash | null;
  readonly expectedRevision: number | null;
  readonly expectedObservedRawHash: Hash | null;
  readonly [PROPOSAL_RECOVERY_OWNER]: true;
}
type ProposalRestorePreview = ProposalRecoveryPreview & {
  readonly kind: "restore";
};
type ProposalClearPreview = ProposalRecoveryPreview & {
  readonly kind: "clear";
};
interface PublicationProposalStore {
  snapshot(): ProposalStoreSnapshot;
  prepareCommand(
    command: ProposalCommand,
    binding: ProposalMutationBinding,
    options: ProposalPrepareOptions,
  ): Promise<OwnedProposalPrepared>;
  commitPrepared(
    prepared: OwnedProposalPrepared,
    options: ProposalCommitOptions,
  ): Promise<ProposalStoreSnapshot>;
  retryPersist(): Promise<ProposalStoreSnapshot>;
  previewRestore(raw: string | Uint8Array): Promise<ProposalRestorePreview>;
  restore(preview: ProposalRestorePreview): Promise<ProposalStoreSnapshot>;
  previewClear(blank: ProposalState): Promise<ProposalClearPreview>;
  clear(preview: ProposalClearPreview): Promise<ProposalStoreSnapshot>;
  undo(): Promise<ProposalStoreSnapshot>;
  reload(options?: ProposalReloadOptions): Promise<ProposalStoreSnapshot>;
  noticeExternalChange(): ProposalStoreSnapshot;
  backup(exportedAt: Instant): Promise<string>;
  rawSavedCopy(): string | null | undefined;
  dispose(): void;
}
declare const PUBLICATION_PROPOSAL_STORAGE_KEY: "charitology.publication-editions.v1";
declare const PUBLICATION_PROPOSAL_LOCK_NAME: "charitology.publication-editions.v1";
declare function createPublicationProposalStore(
  options: ProposalStoreOptions,
): Promise<PublicationProposalStore>;
```

The browser pure model exports the DTOs, constants, catalog validation, hashing, command preparation and packet helpers above, except the explicitly server-only makeProposalCatalog/Git gate. The store module exports the store/options/snapshot/opaque preview types in this block. There are no API shims or shared mutable cells with earlier tools. Symbols express types only; private per-instance WeakMaps/WeakSets enforce ownership at runtime.

`prepareCommand` synchronously owns and stamps command, binding, clock and ID-function reference before its first await. Under the one final-key Web Lock it checks current generation/hash/revision and exact saved string/null, runs the actual pure command, verifies the actual complete future backup and retains the command/candidate/context privately. It writes nothing. Its visible mutation is deeply frozen. A pure `PreparedProposalMutation`, parsed clone, foreign-store object or consumed object cannot be committed through this API.

`commitPrepared` accepts only the issuing store's exact one-use object. It rechecks private metadata, candidate/current/catalog hashes, expected revision, observed bytes and full backup admission after asynchronous validation. Only the actual model-issued `draft.replace` semantics are permitted: immutable workspace ID/createdAt/bases/sources/proposals/versions stay equal, unchanged draft is exact no-op, a changing draft advances once with nonbackdated updatedAt, and no metadata-only or forged commandHash candidate can be treated as a draft write. The model-prepared envelope is rederived for draft commands if any generic shortcut is used; a label alone grants nothing.

Immediately before assignment, call the captured `assertUiCurrent` once. It must be synchronous, return exactly undefined and compare the controller's current form/selection/preview epoch; async, thenable or other returns fail. A controller guard must not reenter store methods. Recheck caller stamps, generation/hash/revision and actual saved string/null after that callback, then assign/persist with no intervening await or callback. A newer raw form is never cleared by an older completion. Error/no-op retains raw work. The UI opens no second command while final commit runs.

Owned restore/clear previews similarly capture actual raw bytes privately, current memory generation/hash/revision and exact candidate, using a fresh locked read. Descriptors/hashes do not replace actual-string equality. Copy, mutation, reuse, foreign ownership or changed memory/disk refuses the attempt. Clear requires the exact new blank state, removes only this key and never prunes an old edition or another tool. Successful reload invalidates undo and outstanding previews. Snapshot every reload option before awaiting; unknown options or a later discard-choice change cannot acquire authority.

Recovery must include the final L1 corruption safeguard, not the older blocked-state exemption. If corrupt A is already protected and an unseen writer installs B, the first preview still refuses: preserve A in `rawSavedCopy()`, expose newly read B in `snapshot.observedRaw`, increment generation and remain blocked without adopting valid memory. A fresh explicit preview may bind B; B-to-C repeats the warning. Render separate protected-original and latest-observed downloads when they differ, using a JSON text wrapper so malformed JavaScript UTF-16 is preserved. Current read denial means observedRaw is undefined; a previously protected copy, if available, is labeled last captured text rather than current storage. Never substitute blank or silently replace protected A with B. Explicit validated reload may release the older recovery copy only after ordinary preserve/discard guidance.

Quota failure assigns one valid unsaved candidate with its pending write/remove mode; prior saved bytes stay unchanged. Retry checks the new current memory hash plus exact saved baseline and persists that same candidate, without replaying command/IDs/clock or invoking a stale controller callback. A later command invalidates an older queued retry. A failed clear retries removal, not writing an apparent saved blank. Missing Web Locks allows validated read/export only; unavailable hashing allows raw recovery only. File/restore bytes are copied intrinsically before decode, unrepresentable raw UTF-16 is refused before encoding, escaped surrogate JSON remains lossless, and malformed/oversized source bytes stay available for explicit plain recovery.

Native freeze of identical current proposal is no-op; an explicit amendment creates the next version with a reason, without publishing or claiming review. Offered-source changes never reinterpret an old basis; selecting a new basis is deliberate. Full backup warns about all proposals/versions/private notes/raw forms. A selected proposal packet excludes unrelated versions/notes/raw draft by default, includes the selected members plus complete pinned public basis manifests/source closure needed to check their hashes, and says whether optional operator notes were deliberately included. It explicitly identifies unselected public proof/context retained inside those manifests. This context is not unrelated private proposal work. Its selection hash is separate from a full restore checksum. Plain raw-form recovery remains available if a complete backup cannot fit the form.

## Immutable server issue registry

Keep `services/newsletter/lib/content.mjs::edition` byte-identical. New `lib/editions.mjs` is a closed lookup over generated `editions/<id>.json` service-root files. No runtime read outside that deployment root. Build/check generates and byte-compares artifacts from deliberately selected fixed public Letter editions; no arbitrary request data becomes mail.

```ts
type LetterLineageNode = {
  format: "charitology-letter-publication-lineage";
  version: 1;
  publicationId: Id;
  publicationHash: Hash;
  sequence: number; // positive source Letter sequence
  supersedes: Pin | null; // exact ancestor publication ID + final hash
  hash: Hash; // canonical all fields above excluding only this hash
};
type MailIssue = {
  schemaVersion: 1;
  id: Id;
  publicationId: Id;
  publicationHash: Hash;
  hashAlgorithm: "canonical-mail-v1" | "ordered-json-mail-v1";
  rendererVersion: 1 | "legacy";
  title: string;
  subject: string;
  html: string;
  text: string;
  hash: Hash;
};
```

Legacy ID stays `edition-1`, delegates directly to the old object/hash algorithm, and maps to exactly one public legacy entry. Do not hash a new wrapper as though it were the old mail hash. New issue hash covers every immutable field above excluding only hash, with a declared renderer/hash version. New renderer uses escaped plain blocks, fixed Charitology sender/reply/postal/privacy/native-unsubscribe footer, script-free HTML and plain text. Raw HTML, remote images, arbitrary template substitutions and alternate unsubscribe links are refused. Actual native placeholder remains `{{{RESEND_UNSUBSCRIBE_URL}}}`. HTML/text each <=256 KiB, with the complete issue JSON <=512 KiB; registry <=100 issues/10 MiB. Publishing an artifact never queues a campaign.

Duplicate logical Letter sequence, duplicate alias to accepted Edition 1 or exact mail content moved to another ID is refused. Compute a separate exact-content fingerprint over canonical `{subject,title,html,text}` without the wrapper identity fields; this detects byte-identical content, not every semantic paraphrase. A real correction is a distinct public edition with a visible reason.

The server build generator resolves each mail-enabled Letter edition's complete immutable public `Edition.core.supersedes` chain in the validated public registry, recording each ancestor's exact final publication hash in `LetterLineageNode`. It emits the closed metadata lineage into the service-root mail registry, including non-mailed intermediate ancestors. Every MailIssue resolves to exactly one node by publication ID/hash; each publication may bind at most one immutable MailIssue. Existing issues cannot be removed or rebound to a different publication/content hash. Nodes contain public lineage only. An exact publication ID/hash index over `MailIssueRegistry.issues` resolves whether an ancestor has a registered campaign ID; a currently non-mailed ancestor does not need a mutable null mail binding on its node. No runtime public-registry fetch is required. Registry validation rejects missing/dangling ancestors, self/cycles, duplicate nodes/sequence, non-earlier ancestor sequence, mismatched publication pins, mail aliases and removed/changed historical nodes. Sequence is the source Letter family's strictly increasing sequence, not a new independent counter. At most 100 lineage nodes cover all registered issues/ancestors, within the same 10 MiB service registry/artifact budget.

Hash order is noncircular: final public edition first; its MailIssue content hash and each public-only lineage node are independently downstream; then the enclosing MailIssueRegistry hash covers issues plus sorted lineage. MailIssue binds publicationId/publicationHash but never hashes the downstream lineage/registry back into itself. Registering mail for a previously non-mailed exact public ancestor appends its one immutable issue binding; it cannot edit the historical lineage node, bypass duplicate/content checks or clear any campaign stop. The generator checks node facts against exact public editions; the service validates and resolves this closed checked-in lineage. `resolveMailIssueCorrectionAncestors` returns nearest ancestor through root, rejecting incomplete closure rather than treating it as no predecessor. Review facts bind the full mailRegistryHash, so any registry growth, including a newly registered ancestor issue, invalidates pending proofs and needs fresh operational review.

Under the same provider lock, before a genuinely new prepare or send checkpoint, the gateway resolves that chain from its `IssueOperationDependencies.registry` and reads each mail-enabled ancestor's existing durable campaign row. A predecessor in `creating`, `create_unknown`, `sending` or `send_unknown` blocks a new native attempt in that correction chain, even with a new issue ID or acknowledgement. Traversal crosses non-mailed nodes; an absent ancestor campaign means only no recorded application attempt, not a provider-wide absence guarantee. An ancestor's accepted/draft history is retained and does not itself authorize a send of either issue. Public correction publication is still permitted; it does not resolve uncertain mail. Rendered content may say editorial draft; operational acknowledgement never means independently reviewed.

## Protected operator API

Legacy `/api/admin/preview` and `/api/admin/campaign/{prepare,send,reconcile}` remain Edition 1 aliases and preserve compatible response shapes. Retained accepted/ambiguous history cannot be recreated through them. Any route that could start a new native operation must use the same proof-bound gateway; a fresh installation cannot bypass the new acknowledgement by calling an old alias without a proof. Existing read-existing requests do not acquire new mutating authority. New operations never select newest/latest implicitly. Existing constant-time admin bearer, exact configured Origin policy, no-store/private headers and 16 KiB JSON body bound apply. Only one exact harmless Vercel `path` rewrite capture may be removed; reject other private query fields. Hosting may normalize wrong/duplicate raw captures before the function, so test staged behavior without claiming raw-query rejection that the host hides. Lists allow only a returned cursor.

| Method/path                                 | Exact intent                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/issues?cursor`              | Up to 20 metadata/local-state rows; readable while sending disabled; no addresses or arbitrary provider payload.                                                                                                                                                                                  |
| `GET /api/admin/issues/:id/preview`         | Fixed title/subject/HTML/text, public edition/content hashes and limits; no provider mutation.                                                                                                                                                                                                    |
| `POST /api/admin/issues/:id/review-preview` | Body `{phase,contentHash}`, with phase exactly `prepare` or `send`. Read current bounded native/audience facts and return exact candidate/hash/count plus a signed transient preview token; no provider mutation. Send phase also binds saved native draft fields.                                |
| `POST /api/admin/issues/:id/review`         | Body `{phase,previewHash,previewToken,contentHash,acknowledgement:'I CHECKED THIS EXACT ISSUE AND INTENDED NEWSLETTER AUDIENCE'}`. Verify token/time and recompute same facts; if unchanged, persist the bounded proof. Shared bearer proves authenticated operational use, not a named reviewer. |
| `POST /api/admin/issues/:id/prepare`        | `{contentHash,reviewId,reviewHash}` with prepare proof; create at most one native unsent draft after all guards.                                                                                                                                                                                  |
| `POST /api/admin/issues/:id/send`           | `{contentHash,reviewId,reviewHash,confirm:'SEND THIS REVIEWED ISSUE'}` with fresh send proof; exact native/recipient check then durable send checkpoint.                                                                                                                                          |
| `POST /api/admin/issues/:id/reconcile`      | Empty body; read only saved provider ID/status, never create/send/adopt/reset.                                                                                                                                                                                                                    |

Transient preview hash binds explicit issue/publication/content/registry/transport/native-draft fields, intended-set keyed digest/count and phase. A <=2,048-character signed token carries only those hashes/IDs/count, issuedAt and expiresAt, with domain-separated HMAC under the existing private rate secret; no address, provider ID or secret is embedded. Strict bounded decoding/constant-time MAC verification precedes use. Token expires after 15 minutes and is not a send capability. The stable facts hash excludes the recomputation clock; the server verifies the original token's times and compares newly read facts instead of hashing a new current clock into the comparison. Persisted proof has random 32-byte ID, schema/method, same hashes, native-draft binding when applicable, count/digest, acknowledgement hash, createdAt and the token's expiresAt. Do not record a human actor name inferred from the shared bearer. Changes in any bound fact need a new preview/acknowledgement. Domain-separate audience/bearer-instance hashes; key rotation invalidates pending proofs, never accepted history. New routes use a strict JSON body reader with this explicit token bound; do not loosen the legacy `fields()` 1,000-character value policy globally.

Current intended set is exact normalized active local email plus consent generation, compared with the native dedicated Segment; pending preference sync or any mismatch stops. Unexpected/duplicate/invalid native members and known global unsubscribe stop a new attempt without mutation. Never return addresses or store their plain list in proofs. Native Topic/global suppression still filters final processing; count is intended membership, not delivery. Shared-provider changes after the final read are a documented race, not an atomically frozen audience or permission to override purpose-specific consent.

Durable request limits under the shared bearer: 120 new reads/hour and 20 review/prepare/send commands/hour globally/per bearer-instance hash, not per named person. Reconcile 20/hour, no send quota use. Repeated accepted history reads are not permission to attempt. At most 20 unexpired unconsumed proofs and 2 MiB actual PostgreSQL proof rows; proofs referenced by campaign tombstones remain retained. Schema stores no raw recipient list/token/request body. Limit exhaustion fails before provider mutation.

### Backend handoff and safe DTOs

```ts
type IssuePhase = "prepare" | "send";
type IssueCampaignState =
  | "none"
  | "creating"
  | "draft"
  | "create_unknown"
  | "sending"
  | "accepted"
  | "send_unknown"
  | "unsupported";
type IssueSafeCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden_origin"
  | "issue_unknown"
  | "content_mismatch"
  | "review_required"
  | "review_expired"
  | "facts_changed"
  | "preference_sync_pending"
  | "audience_mismatch"
  | "native_draft_mismatch"
  | "configuration_unavailable"
  | "operation_busy"
  | "limit_reached"
  | "stopped_uncertain"
  | "provider_unavailable"
  | "provider_ambiguous"
  | "legacy_preflight_failed";
type IssueCampaignSummary = {
  issueId: Id;
  publicationId: Id;
  publicationHash: Hash;
  contentHash: Hash;
  state: IssueCampaignState; // local durable state, not an inbox outcome
  safeCode: IssueSafeCode | null;
  creatingAt: Instant | null;
  sendAttemptedAt: Instant | null;
  acceptedAt: Instant | null;
  providerObservation: null | {
    classification: "draft" | "reported-sent" | "other";
    observedAt: Instant; // polling time, not an event/delivery timestamp
  };
};
type IssueContentPreview = {
  ok: true;
  issueId: Id;
  publicationId: Id;
  publicationHash: Hash;
  contentHash: Hash;
  hashAlgorithm: MailIssue["hashAlgorithm"];
  rendererVersion: MailIssue["rendererVersion"];
  title: string;
  subject: string;
  html: string;
  text: string;
  editorialLabel: "editorial-draft";
};
type IssueReviewFacts = {
  method: "newsletter-issue-review-v1";
  phase: IssuePhase;
  issueId: Id;
  publicationId: Id;
  publicationHash: Hash;
  contentHash: Hash;
  mailRegistryHash: Hash;
  transportHash: Hash; // private-field binding; no credential in this hash input
  audienceHash: Hash; // domain-separated HMAC, never a plain email-set hash
  intendedRecipientCount: number;
  nativeDraftHash: Hash | null; // null in prepare; keyed exact saved-ID+fields in send
};
type IssueReviewPreview = {
  ok: true;
  facts: IssueReviewFacts;
  previewHash: Hash; // hash of stable facts only
  previewToken: string; // signed opaque <=2048 chars; no address or provider ID
  issuedAt: Instant;
  expiresAt: Instant;
};
type IssueReviewProof = {
  ok: true;
  reviewId: string; // random 32-byte base64url token, not a named human
  reviewHash: Hash;
  phase: IssuePhase;
  previewHash: Hash;
  contentHash: Hash;
  intendedRecipientCount: number;
  createdAt: Instant;
  expiresAt: Instant;
};
type IssueReviewRequest = {
  phase: IssuePhase;
  previewHash: Hash;
  previewToken: string;
  contentHash: Hash;
  acknowledgement: "I CHECKED THIS EXACT ISSUE AND INTENDED NEWSLETTER AUDIENCE";
};
type IssueOperationInput = {
  contentHash: Hash;
  reviewId: string;
  reviewHash: Hash;
};
type IssueSendInput = IssueOperationInput & {
  confirm: "SEND THIS REVIEWED ISSUE";
};
type IssueOperationResponse =
  | {
      ok: true;
      result: "prepared" | "accepted" | "retained" | "observed";
      campaign: IssueCampaignSummary;
      intendedRecipientCount: number | null; // not a delivered count
    }
  | {
      ok: false;
      error: { code: IssueSafeCode; message: string }; // fixed message map only
      campaign: IssueCampaignSummary | null;
    };
type IssueListResponse = {
  ok: true;
  issues: IssueCampaignSummary[]; // <=20, fixed ID order
  nextCursor: string | null;
};
type MailIssueRegistry = {
  format: "charitology-mail-issue-registry";
  version: 1;
  issues: MailIssue[];
  lineage: LetterLineageNode[]; // closed ancestors, metadata only, <=100
  hash: Hash;
};
declare function validateMailIssueRegistry(input: unknown): MailIssueRegistry;
declare function getMailIssue(registry: MailIssueRegistry, id: Id): MailIssue;
declare function resolveMailIssueCorrectionAncestors(
  registry: MailIssueRegistry,
  issueId: Id,
): LetterLineageNode[]; // nearest ancestor first; excludes the selected issue node
declare function issueContentPreview(
  registry: MailIssueRegistry,
  id: Id,
): IssueContentPreview;
interface IssueSqlClient {
  query<Row = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}
interface IssueDatabase {
  tx<T>(action: (client: IssueSqlClient) => Promise<T>): Promise<T>;
  exclusive<T>(action: (client: IssueSqlClient) => Promise<T>): Promise<T>;
}
interface IssueMail {
  // Same existing fixed provider methods; all unknown wire data is validated.
  ready(options: { campaign: true }): Promise<unknown>;
  segmentContacts(): Promise<unknown>;
  getBroadcast(providerId: string): Promise<unknown>;
  createBroadcast(issue: MailIssue): Promise<unknown>;
  sendBroadcast(providerId: string): Promise<unknown>;
}
interface IssueSettings {
  origin: string;
  enabled: boolean;
  testOnly: boolean;
  testRecipient: string; // private server configuration, never a response field
  adminToken: string;
  rateSecret: string;
  domainId: string;
  segmentId: string;
  topicId: string;
}
type IssueOperationDependencies = {
  db: IssueDatabase;
  mail: IssueMail; // deadline-scoped facade over existing provider only
  settings: IssueSettings;
  registry: MailIssueRegistry;
  deadline: number; // server monotonic/wall-clock budget, never hashed content
  now(): Instant;
  makeReviewId(): string;
  makeOperationId(): string;
};
declare function previewIssueReview(
  deps: IssueOperationDependencies,
  issueId: Id,
  input: { phase: IssuePhase; contentHash: Hash },
): Promise<IssueReviewPreview>;
declare function acknowledgeIssueReview(
  deps: IssueOperationDependencies,
  issueId: Id,
  input: IssueReviewRequest,
): Promise<IssueReviewProof>;
declare function operateIssue(
  deps: IssueOperationDependencies,
  issueId: Id,
  command:
    | { action: "prepare"; input: IssueOperationInput }
    | { action: "send"; input: IssueSendInput }
    | { action: "reconcile"; input: Record<string, never> },
): Promise<IssueOperationResponse>;
declare function listIssueCampaigns(
  deps: Pick<IssueOperationDependencies, "db" | "registry">,
  cursor: string | null,
): Promise<IssueListResponse>;
```

All new success/error responses are these closed shapes. No recipient, provider/operation ID, token, raw request, raw provider body, suppressed address or database row is spread into them. Public content preview is authenticated and private/no-store despite containing published material. `unsupported` is a read-only local-history classification for an unexpected saved legacy state; it never authorizes a transition. Provider observations are deliberately narrower than the native status string: only exact observed draft/sent status maps to those two labels, all other bounded statuses map to other, and no delivered/read result is invented. Legacy local provider_status='accepted' is not recast as a fetched provider event.

Module ownership is explicit: new service `lib/editions.mjs` validates the closed registry and legacy binding; new `lib/issue-operations.mjs` owns facts, preview signing, proof acknowledgement, durable once transitions and safe projections; narrow `handler.mjs` wiring owns exact route/query/body admission, existing bearer/Origin gate, rate checks and fixed response/status mapping. `database.mjs`/`schema.sql` own additive DDL and retention, while `provider.mjs` supplies a deadline-scoped version of its existing fixed methods. Current `operations.mjs::campaign` becomes a compatibility delegation, not a second independent send path. No route module independently calls create/send. New public edition/static/local-proposal owners never import server configuration or subscriber data.

`IssueMail` is an internal adapter, not a new provider API. Validate the actual already-used fields at the boundary: segment members id/email/unsubscribed; saved Broadcast id/status/segment_id/topic_id/from/reply_to/subject/html/text and documented scheduling fields when returned; create acknowledgements must return one valid new provider ID from that original call, which is bound exactly once to its creating row; a fresh create has no preexisting provider ID to compare. Send acknowledgements must return the exact saved ID. No caller/reconcile payload can supply an ID for adoption. Reject malformed/oversize bodies and non-draft/scheduled drafts. Do not assume an undocumented Broadcast idempotency key, snapshot audience, sent timestamp, callback aggregate or remote retry guarantee.

`previewIssueReview` and acknowledgement serialize through the existing nonblocking provider lock, read bounded exact native/local facts and never create/send. Acknowledgement verifies original token times/MAC, recomputes stable facts, then writes a proof; unchanged repeat acknowledgement of the same token returns the same proof via a unique keyed token-hash binding. Token bodies and recipient lists are never stored. A proof cannot change phase/issue/content/transport/audience or outlive its original expiry. Its random ID and shared bearer instance are operational identity only.

`operateIssue` loads exact registered issue and retained row before delivery gates. Read-existing responses are safe retained history, not a new receipt or permission. A genuinely new prepare/send checks current gates, proof phase/body/current facts and quota under the provider lock. In one separate committed durable transaction, consume that exact unexpired proof and write the creating/sending checkpoint; never hold a proof row lock in the outer transaction and then wait for its own durable update. Only after that transaction commits may the corresponding single native call occur. Reconcile is a bounded saved-ID read with no create/send path. All route/compatibility aliases call this same gateway.

Proposed proof table `newsletter_issue_reviews` has id, method, issue_id, phase, preview_hash, proof_hash, facts JSON, acknowledgement_hash, bearer_hash, preview_token_hash, created_at, expires_at, consumed_at and consumed_operation_id. Facts contain hashes/count only and are <=4 KiB; actual PostgreSQL row bytes count toward the 2 MiB total. preview_token_hash is a domain-separated keyed digest with a unique constraint, never the raw signed token. Consumption and campaign checkpoint share the durable transaction, and a referenced consumed proof is retained. Add separate nullable columns to the existing campaigns table as listed below; do not create a competing send identity or backfill unknown legacy evidence.

HTTP mapping is fixed: 400 malformed request, 401 missing/invalid bearer, 403 wrong Origin, 404 unknown registered issue, 409 stale proof/facts/native mismatch or stopped uncertain state, 429 durable rate/quota, and 503 unready provider/configuration or an ambiguous post-checkpoint failure. A post-checkpoint error carries the retained safe campaign state; it never reports a retryable no-attempt proof. Existing accepted history is 200 retained without another provider mutation. Unexpected failures use a fixed generic message and safe code, never provider text. Deadline exhaustion is not permission to reattempt.

## Campaign schema, state and failure contract

Reuse `newsletter_campaigns(edition PK,content_hash,state,broadcast_id,provider_status,operation_id,updated_at)`. Add nullable publication ID/hash, registry/transport hashes, prepare/send proof IDs/hashes, creating_at/send_attempted_at/accepted_at, safe_error_code and bounded provider_observation JSON<=2 KiB. Legacy null is unknown, not a fabricated receipt. Add a partial unique provider ID constraint after checking populated history; protect edition/content/operation identity and terminal state from ordinary update/delete. New `newsletter_issue_reviews` holds the bounded proofs. No parallel send ledger, unbounded callback archive or automatic restore of campaigns/consent is added.

Transport hash covers fixed sender, exact reply array and configured domain/Segment/Topic IDs privately; it contains no bearer/token. A changed transport requires fresh review and cannot silently retarget an existing native draft. Finalization capacity is reserved before a new creating checkpoint (bounded row/proof budget plus 8 KiB final safe facts); quota failure cannot delete an attempt stop. Minimal campaign and referenced proof tombstones remain indefinitely, including after registry growth or secret rotation.

Under the existing nonblocking provider lock, use only these mutating transitions. Each proof/checkpoint is committed before its one external operation. Finalization has the reserved byte capacity and does not consume a new proof.

| From       | To               | Only permitted cause                                                                                                                                                                                                                  |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No row     | `creating`       | Exact current prepare facts/gates plus one unexpired prepare proof consumed atomically with immutable issue/content/operation identity.                                                                                               |
| `creating` | `draft`          | Successful validated response of that same original in-flight `createBroadcast(send:false)`; bind its returned new provider ID exactly once. Conditional finalization matches operation ID, issue/content and consumed prepare proof. |
| `creating` | `create_unknown` | That original call/response/finalization failed or became ambiguous; no new provider call. A process crash may leave `creating` instead.                                                                                              |
| `draft`    | `sending`        | Exact saved native ID/fields/current audience and a new unexpired send-phase proof consumed atomically with the send checkpoint.                                                                                                      |
| `sending`  | `accepted`       | Successful validated response from that same original in-flight send, returning the exact saved provider ID; conditional finalization matches operation/content and consumed send proof.                                              |
| `sending`  | `send_unknown`   | That original send/response/finalization failed or became ambiguous; no new call. A crash may leave `sending`.                                                                                                                        |

The proof must be valid at checkpoint consumption; expiry during the external call does not prevent recording its factual successful result. `operation_id` is the campaign's stable identity and the two consumed proof references bind the original phase; finalization never substitutes a fresh proof/key. If a conditional finalization no longer matches its original checkpoint, preserve the stop rather than overwrite another state. An error/unknown terminalization cannot later become `draft`/`accepted` through a delayed response or reconciliation. The legitimate `creating`→`draft` finalization above is the only exception to the otherwise stopped creating state; it is not a reset/retry/adoption path.

Prepare on any existing row returns retained state without another create; sending is possible only from its already-finalized `draft`. Reconcile updates observation fields only, leaving the local state unchanged. Accepted/creating/create_unknown/sending/send_unknown cannot be deleted, reset, re-created, made sendable by reconciliation or escaped with another key. There is no `create_unknown`→`draft` recovery transition. Reading a saved accepted or stopped row adds no mutation permission.

Provider calls use the existing Connect identity only: 8-second individual ceiling and shared 45-second operation deadline; bound credential acquisition, response streaming and database statements/rollback. Native ready/draft/create/send success replies <=2 MiB and error replies <=16 KiB; Segment pagination <=30 pages of 100 with 512 KiB/page, unique validated IDs/emails and a 45-second shared deadline. Unknown/malformed/oversize/non-draft/scheduled provider responses fail closed. Never assume native Broadcast idempotency because transactional email has a 24-hour key cache. No timer or key expiry reauthorizes a stopped operation.

Reconciliation updates only bounded observed status/time against the saved ID. Unknown statuses remain unknown. The polling instant is an observation time, not a delivery event. Native reported-sent status or signed per-email delivery evidence does not prove all intended recipients received/read mail, and never makes another send eligible. Unknown create without ID has no automated adoption/retry path. Provider/dashboard edits and Segment evaluation after final inspection cannot be made atomic by the local lock.

Migration runs twice over isolated populated synthetic schemas in tests, preserving accepted Edition 1/hash/ID, ambiguous rows, subscriber consent/unsubscribe, tokens, webhook IDs and all OS purposes. Real production comparison/deployment is coordinator work after implementation checks. No campaign to unspecified recipients, owner resubscription, accepted issue reset, provider configuration or live send is authorized by these interfaces.
