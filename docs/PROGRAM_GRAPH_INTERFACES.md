# Program graph interfaces

Pre-implementation interface proposal · October 27, 2026 · AI-assisted · review: draft. Read the [plan](PROGRAM_GRAPH_PLAN.md). Root approval and separate runtime assignments are required before implementation. This contract describes a private companion graph, not live source enforcement or shared approval.

## Boundary and exact adapters

Final graph key and lock: `charitology.program-graph.v1`. No writes to source keys. No source discovery. Only these partner programs are accepted: `the-charitology-fund`, `charity-incubator`, `question-bounties`, `the-charitology-prize`, `charitology-fellowship`, `charitology-summit`, `donor-advisory`, `nonprofit-advisory`, `field-verification`.

```ts
type Id = string; //1..100 ASCII A-Z/a-z/0-9/_/-, top-level graph IDs globally unique
type Hash = string; //64 lowercase SHA256 hex
type Instant = string; //real canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ,1900..2200
type Program =
  | "the-charitology-fund"
  | "charity-incubator"
  | "question-bounties"
  | "the-charitology-prize"
  | "charitology-fellowship"
  | "charitology-summit"
  | "donor-advisory"
  | "nonprofit-advisory"
  | "field-verification";
type SourceRecordId = string; //actual partner ASCII Id domain; not a graph entity ID
interface PartnerSource {
  version: 1;
  program: Program;
  updated: string; //original <=100 chars; empty or current Date.parse-valid
  context: Record<string, string>;
  records: Record<
    string,
    { id: SourceRecordId; values: Record<string, string> }[]
  >;
}
interface AdapterField {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "date" | "url" | "select";
  optional: boolean;
  options: string[];
  min: number | null;
  max: number | null;
  value: string | null;
  hint: string | null;
  maxLength: 500 | 5000;
}
interface AdapterCollection {
  key: string;
  label: string;
  singular: string;
  description: string;
  fields: AdapterField[];
}
interface ProgramGraphAdapter {
  id: string;
  version: 1;
  program: Program;
  context: AdapterField[];
  collections: AdapterCollection[];
  hash: Hash;
}
```

Normalize omitted field definitions to exact defaults; preserve source field/option ordering and labels. Adapter hash covers the normalized definition excluding only its own hash. The known v1 definitions reproduce the actual partner validator, including special `amount|budget` decimal precision, integral minutes, UTC `start`, real dates, HTTPS/no credentials, temporary trim validation and context draft mode. Do not reuse a generic number parser that silently changes those rules. A compatibility checker compares all 46 collections and context definitions to current source configs. Incoming custom schemas or altered known hashes are rejected.

Reject unknown root, context, collection, record and values keys; all configured values must be strings. Preserve exact accepted strings rather than the old parser's trimmed output. Each source collection has at most 250 rows/500 total; duplicate source IDs across any collections fail. Validate `updated` using the current source envelope rule and preserve it verbatim; it is a source assertion, not an independent receipt or graph command clock. File bound 8,000,000 bytes is checked before decode/parse/hash/clone. Strict JSON admission then decodes UTF-8 fatally, checks a maximum container nesting depth of 32 before recursive parsing, and refuses duplicate object keys after decoding their JSON escapes. Count the root object as depth 1; braces or brackets inside strings do not increase depth. These rules also apply to graph backups before checksum validation or canonical traversal. Never let JSON.parse's last-key overwrite decide provenance. A readable error path retains a private raw recovery download, never assigns a partially valid graph.

## State and histories

```ts
interface SourceInstance {
  id: Id;
  program: Program;
  adapterId: string;
  adapterHash: Hash;
  alias: string; //1..160, project alias, no private identity
  currentCaptureId: Id;
  retirement: null | { at: Instant; reason: string; captureId: Id };
}
interface InventoryRef {
  collection: string;
  recordId: SourceRecordId;
}
interface SourceCapture {
  id: Id;
  sourceId: Id;
  sequence: number;
  previousId: Id | null;
  capturedAt: Instant;
  sourceUpdated: string;
  sourceRawHash: Hash;
  sourceCanonicalHash: Hash;
  byteLength: number;
  origin:
    { kind: "file"; fileName: string } | { kind: "saved-key"; key: string };
  context: Record<string, string>;
  inventory: InventoryRef[]; //all rows of all known collections, sorted collection/id
  nodeVersions: { nodeId: Id; versionId: Id }[]; //all tracked nodes of this source at this capture
  hash: Hash;
}
interface GraphNode {
  id: Id;
  sourceId: Id;
  collection: string;
  recordId: SourceRecordId;
  firstCaptureId: Id;
  currentVersionId: Id;
}
interface NodeVersion {
  id: Id;
  nodeId: Id;
  version: number;
  previousId: Id | null;
  captureId: Id;
  presence: "present" | "missing";
  values: Record<string, string> | null;
  contextHash: Hash; //exact context of its originating capture
  reappeared: boolean; //present after a missing predecessor only
  hash: Hash;
}
type RelationKind =
  | "related-to"
  | "depends-on"
  | "planned-work-for"
  | "evidence-note-for"
  | "decision-note-for"
  | "conflict-note-for";
interface GraphLink {
  id: Id;
  from: Id;
  to: Id;
  kind: RelationKind;
  currentVersionId: Id;
}
interface LinkVersion {
  id: Id;
  linkId: Id;
  version: number;
  previousId: Id | null;
  recordedAt: Instant;
  action: "review" | "retire";
  fromVersionId: Id;
  toVersionId: Id;
  reason: string;
  legacyField: null | { nodeId: Id; field: string; rawValueHash: Hash };
  reappearanceAcknowledged: Id[]; //endpoints crossing missing/reappeared history since prior review
  hash: Hash;
}
type Tab =
  | "sources"
  | "records"
  | "links"
  | "connected"
  | "import"
  | "exports"
  | "recovery";
interface GraphDraft {
  tab: Tab;
  sourceId: Id | null;
  nodeId: Id | null;
  form: null | {
    kind:
      | "capture"
      | "link"
      | "review"
      | "retire-source"
      | "retire-link"
      | "rename-source";
    targetId: Id | null;
    binding: Record<string, string>;
    fields: Record<string, string>;
  };
  dirty: boolean;
}
interface ProgramGraphState {
  version: 1;
  id: Id;
  revision: number;
  updatedAt: Instant;
  adapters: ProgramGraphAdapter[];
  sources: SourceInstance[];
  captures: SourceCapture[];
  nodes: GraphNode[];
  nodeVersions: NodeVersion[];
  links: GraphLink[];
  linkVersions: LinkVersion[];
  draft: GraphDraft;
}
```

Source creation and its first capture/nodes are one atomic command; no empty instance. Alias edits change no source/record ID. IDs are not reused after retirement; source/record node identities are unique. Refresh uses the same adapter, never another program or schema version. If an existing source ID moves collections, fail with a source-identity conflict. Distinct graph source instances may intentionally contain identical source IDs/values; never collapse them.

Captures sequence contiguously per source, with exact current predecessor. Every capture includes the complete source ID inventory and all tracked nodes of that instance at that point, plus newly selected nodes. The source canonical hash covers the whole validated original source object, retaining exact strings, using canonical object-key ordering. Original bytes and unselected values are not embedded: this hash cannot later independently reconstruct or authenticate their contents. Inventory/context/snapshots are self-recorded capture provenance, not server attestations.

For each tracked node: present unchanged raw values and unchanged contextHash reuse the previous version; changed values or context append a present version; absence in inventory appends one missing version with `values:null`; repeated absence reuses it only if contextHash also matches. ContextHash covers the exact source context strings, so a changed scope, donor constraint or authority statement invalidates the prior endpoint review. Reappearance appends a present version with `reappeared:true`. First version is present. Present values validate against the captured adapter; missing values are always null, and previous present values remain historical. A missing node cannot receive a link review. For each newly reviewed endpoint, scan the node chain since the prior reviewed endpoint version (or the entire chain for a new link): if it crosses missing→present, require its exact node ID in reappearanceAcknowledged. A later edit cannot erase the warning. Reject extra/unnecessary acknowledgement IDs. No user statement converts it to independently established identity.

NodeVersion hash includes its capture ID but not that capture's hash. Capture hash includes version references, not a hash cycle. Each entry hash excludes only its own hash. Replay validation checks sequence, ownership, inventory membership/absence, coverage of tracked nodes, values, current pointers, reappearance flags and immutable references. Merely recomputing outer checksums must not make an impossible history valid. Validation cannot revalidate discarded unselected source values; the importer validated them at capture time, and the retained source hash is only an assertion after manual backup editing.

Link kind/from/to never change. Review/retire versions form one contiguous chain; review pins the current present versions from active sources. A retirement retains the last reviewed endpoint versions and requires a reason. Reopening a retired link requires a new review of both current endpoints. Link duplication uses nonretired `(kind,from,to)`; symmetric related-to endpoints use lexicographically ordered graph node IDs. `depends-on` refuses cycles across all nonretired dependency links, even when a node is missing/retired. Historical retired links do not participate.

`legacyField` is optional provenance for an existing free-text reference, not a source write. It must belong to one endpoint, exist in that bound version's known schema, and hash the exact retained string. Do not parse its title/code or claim that text and chosen endpoint have been externally reconciled. Review changes to the endpoint version refresh this binding explicitly.

## Relation source roles

Targets may be any distinct known node, including across programs. `related-to` and `depends-on` accept any source collection. The remaining source roles are a closed v1 table; they classify notebook use, not actual performance:

| Kind                | Allowed program/collection sources                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planned-work-for`  | Fund/`ledger`; Incubator/`projects`,`experiments`,`milestones`; Fellowship/`projects`,`curriculum`,`milestones`; Summit/`roles`,`production`,`followup`; Nonprofit Advisory/`actions`; Field Verification/`actions`; any program/`readiness` |
| `evidence-note-for` | Donor Advisory/`evidence`; Nonprofit Advisory/`evidence`; Field Verification/`findings`; Incubator/`experiments`; Question Bounties/`claims`; Summit/`followup`                                                                              |
| `decision-note-for` | Fund/`allocations`; Question Bounties/`decisions`; Prize/`deliberations`; Fellowship/`reviews`; Donor Advisory/`followup`; Nonprofit Advisory/`learning`; Field Verification/`responses`                                                     |
| `conflict-note-for` | Fund/`conflicts`; Prize/`conflicts`                                                                                                                                                                                                          |

Program shorthand above means only the exact slug listed at the start. No status such as Recorded decision, Evidence recorded locally, Conditional recommendation or Done supplies independent authority. There is no graph permission, rating, outcome or money calculation inferred from these fields.

## Pure functions and commands

```ts
interface GraphIssue {
  path: string;
  code: string;
  message: string;
}
declare class ProgramGraphError extends Error {
  code: string;
  issues: GraphIssue[];
}
interface GraphContext {
  expectedStateHash: Hash;
  at: Instant;
  makeId: () => Id;
  digest?: (bytes: Uint8Array) => Promise<Hash>;
}
interface PreparedGraphMutation {
  format: "charitology-program-graph-mutation";
  version: 1;
  expectedStateHash: Hash;
  expectedRevision: number;
  nextStateHash: Hash;
  nextState: ProgramGraphState;
  commandHash: Hash;
  noOp: boolean;
  summary: { kind: GraphCommand["kind"]; message: string };
}
type GraphCommand =
  | {
      kind: "source.capture";
      preview: CapturePreview;
      selection: CaptureSelection;
    }
  | { kind: "source.rename"; sourceId: Id; alias: string }
  | {
      kind: "source.retire";
      sourceId: Id;
      expectedCaptureId: Id;
      reason: string;
    }
  | {
      kind: "link.review";
      linkId: Id | null;
      expectedLinkVersionId: Id | null;
      from: Id;
      to: Id;
      kindOfRelation: RelationKind;
      fromVersionId: Id;
      toVersionId: Id;
      reason: string;
      legacyField: LinkVersion["legacyField"];
      reappearanceAcknowledged: Id[];
    }
  | {
      kind: "link.retire";
      linkId: Id;
      expectedLinkVersionId: Id;
      reason: string;
    }
  | { kind: "draft.replace"; draft: GraphDraft };
declare function blankProgramGraphState(id: Id, at: Instant): ProgramGraphState;
declare function canonicalProgramGraphJson(value: unknown): string;
declare function hashProgramGraphValue(value: unknown): Promise<Hash>;
declare function programGraphStateHash(state: ProgramGraphState): Promise<Hash>;
declare function validateProgramGraphState(
  value: unknown,
): Promise<ProgramGraphState>;
declare function prepareProgramGraphCommand(
  state: ProgramGraphState,
  command: GraphCommand,
  context: GraphContext,
): Promise<PreparedGraphMutation>;
```

All mutation inputs are captured before any await. Recheck expected state/input hashes before and after async validation/hashing, including no-op paths. IDs/clocks are injected. Blank state contains no adapters/entities; first capture adds its exact known adapter. Deeply freeze ordinary returned objects; never promise to freeze mutable typed arrays. Exact replay of the current same-source raw capture/selection that adds no new tracked nodes is a no-op; a logical copy with different whitespace may append provenance but does not create new node versions. A new source-instance enrollment is intentionally different even with identical bytes. Repeated identical current link review is a no-op. No-op and failed commands never clear a raw draft. A successful changing command may clear only its exact corresponding form under the matching rules below; otherwise retain it unchanged.

### Exact raw form recovery

The following are closed name allowlists for `GraphDraft.form.binding` and `.fields`. Either map may be partial and may contain malformed strings so a failed form can be saved and repaired. Unknown names fail validation; the absence of a required command value does not. These maps never supply command authority, a usable capture preview or permission to skip revalidation. `targetId` remains `Id | null`; an unfinished or malformed identifier belongs in its named raw binding string instead of being silently normalized into a graph reference.

| Form kind       | `targetId` for a matching committed form                               | Allowed `binding` names                                                                                                                                                 | Allowed `fields` names                                                                              |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `capture`       | `null` for enrollment; exact `preview.target.sourceId` for refresh     | `program`, `targetSourceId`, `expectedCaptureId`, `expectedCaptureHash`, `stateHash`, `sourceRawHash`, `sourceCanonicalHash`, `reviewHash`, `originKind`, `originValue` | `alias`, `selectedIndexes`, `completeCopyAcknowledged`, `separateCopyAcknowledged`, `resumeRetired` |
| `link`          | `null`; command `linkId` and `expectedLinkVersionId` must both be null | `linkId`, `expectedLinkVersionId`, `from`, `to`, `fromVersionId`, `toVersionId`                                                                                         | `kindOfRelation`, `reason`, `legacyField`, `reappearanceAcknowledged`                               |
| `review`        | Exact existing `command.linkId`                                        | `linkId`, `expectedLinkVersionId`, `from`, `to`, `fromVersionId`, `toVersionId`                                                                                         | `kindOfRelation`, `reason`, `legacyField`, `reappearanceAcknowledged`                               |
| `retire-source` | Exact `command.sourceId`                                               | `sourceId`, `expectedCaptureId`                                                                                                                                         | `reason`                                                                                            |
| `retire-link`   | Exact `command.linkId`                                                 | `linkId`, `expectedLinkVersionId`                                                                                                                                       | `reason`                                                                                            |
| `rename-source` | Exact `command.sourceId`                                               | `sourceId`                                                                                                                                                              | `alias`                                                                                             |

For draft comparison only, serialize null command bindings as the empty string, booleans as exactly `"true"` or `"false"`, and `selectedIndexes`, `legacyField` and `reappearanceAcknowledged` with `canonicalProgramGraphJson` using the command's already validated value. Selection indexes and acknowledgement IDs must already have their required sorted unique order. A null `legacyField` therefore matches the literal string `"null"`; a blank, malformed or merely equivalent JSON spelling does not match. Other values match their exact strings without trimming, case folding or repairing JSON. Related-to command endpoints and their version bindings use the canonical endpoint order presented for review, not an implicit reversal while clearing a form.

Capture bindings match the exact recomputed preview, with `targetSourceId`/`expectedCaptureId`/`expectedCaptureHash` all empty for a new source. `originKind` is `"file"` or `"saved-key"`; `originValue` is the exact corresponding `fileName` or `key`. Its `alias` field matches `selection.alias`, using the empty string for null. All three acknowledgement fields match their exact selection booleans. Saved capture form strings do not retain file bytes or revive an expired preview: reselect the file or explicitly recapture the known key, then review the new preview and bindings.

Automatic clearing requires the corresponding form kind, exact target, **every** listed binding and field name present, no additional names, and every value equal to the committed command under these rules. A partial, malformed, stale, unrelated or newer form remains intact even if its target overlaps. Never clear a new-link or new-source form merely because its target is null. Clear only the form and dirty flag, preserving navigation selection. The UI may offer a separate deliberate discard action; it must not turn a failed comparison into automatic `draft.replace`. Rename forms receive the same plain raw-form recovery and dirty-warning protection as every other form. The existing combined 40-key, 16,384-character and 512 KiB draft bounds remain unchanged.

```ts
interface CaptureInput {
  bytes: Uint8Array;
  program: Program;
  origin:
    { kind: "file"; fileName: string } | { kind: "saved-key"; key: string };
  target: null | {
    sourceId: Id;
    expectedCaptureId: Id;
    expectedCaptureHash: Hash;
  };
}
interface CaptureRow {
  index: number;
  collection: string;
  recordId: SourceRecordId;
  title: string;
  trackedNodeId: Id | null;
  change: "new" | "same" | "changed" | "reappeared";
}
interface CapturePreview {
  format: "charitology-program-graph-capture";
  version: 1;
  stateHash: Hash;
  program: Program;
  adapterId: string;
  adapterHash: Hash;
  sourceRawHash: Hash;
  sourceCanonicalHash: Hash;
  origin: CaptureInput["origin"];
  target: CaptureInput["target"];
  byteLength: number;
  context: Record<string, string>; //exact accepted raw source context strings
  rows: CaptureRow[];
  missingNodeIds: Id[];
  overlap: { sourceId: Id; count: number }[];
  reviewHash: Hash;
  bytes: Uint8Array;
}
interface CaptureSelection {
  selectedIndexes: number[]; //sorted unique integers0..499; new nodes to track
  alias: string | null; //required only for new instance
  completeCopyAcknowledged: true;
  separateCopyAcknowledged: boolean; //required true for new overlapping instance
  resumeRetired: boolean; //required true if refreshing retired instance
}
declare function previewProgramCapture(
  state: ProgramGraphState,
  input: CaptureInput,
  expectedStateHash: Hash,
): Promise<CapturePreview>;
```

Rows enumerate every valid source record in sorted collection/id order, with contiguous zero-based index; previously tracked nodes are always refreshed, regardless of selection. New source needs at least one selected record. Existing source may refresh with no new selection, including a completely empty valid source, preserving missing-node history. The exact `context` map appears in preview without trimming; complete inventory is recomputed from bytes. `reviewHash` binds state, input bytes, program/schema, target, the complete context map and displayed row/missing/overlap facts, excluding later selection. `commandHash` additionally binds exact selection/acknowledgements/alias. Commit owns a new copied byte buffer and recomputes source/preview facts; mutated context/arrays/target/selection or stale state fail. UI guards file-read/hash generations. For saved-key capture the UI also checks the exact observed source bytes again before submitting; a known change invalidates preview. A null/unreadable key is an unavailable source, not synthesized empty JSON. This is a source snapshot check, not a cross-key transaction guarantee.

Source retirement retains its current reason/time/capture reference. Rename is a current display alias, with no historical-alias promise. Resuming clears current retirement metadata only in a fresh complete source.capture command; it retains all captured source/node/link histories. This first slice has no source lifecycle event log and must not claim to reconstruct earlier retirement intervals or alias history. A historical link review is validated against its pinned versions/known schema, not falsely treated as proof of past source activity or real authorization.

## Views, exports and capacity

```ts
type LinkState = "current" | "stale" | "unresolved" | "retired";
declare function programGraphLinkState(
  state: ProgramGraphState,
  linkId: Id,
): {
  state: LinkState;
  reasons: string[];
  fromVersionId: Id;
  toVersionId: Id;
};
declare function programGraphNodeView(
  state: ProgramGraphState,
  nodeId: Id,
): {
  node: GraphNode;
  source: SourceInstance;
  current: NodeVersion;
  lastPresent: NodeVersion;
  history: NodeVersion[];
  incoming: Id[];
  outgoing: Id[];
};
declare function programGraphCounts(state: ProgramGraphState): {
  sources: number;
  nodes: number;
  present: number;
  missing: number;
  links: number;
  current: number;
  stale: number;
  unresolved: number;
  retired: number;
};
declare function makeProgramGraphBackup(
  state: ProgramGraphState,
  exportedAt: Instant,
): Promise<string>;
declare function parseProgramGraphBackup(
  raw: string | Uint8Array,
): Promise<ProgramGraphState>;
declare function programGraphPacket(
  state: ProgramGraphState,
  selection: { nodeIds: Id[]; linkIds: Id[] },
): Promise<{
  selectionHash: Hash;
  csv: string;
  markdown: string;
  omissions: string[];
}>;
```

Source count includes retired; node count includes missing. Link counts partition current/stale/unresolved/retired exactly once, with retired first, then unresolved, then stale, then current. A missing node is not an invented empty record; lastPresent always exists. If a source is retired, its currently present copies remain stored but cannot make a link current. Counts are notebook records, not unique organizations/people/verified decisions. No graph arithmetic parses or sums legacy amount/depth/result strings.

Complete backup wrapper is `{format:'charitology-program-graph-backup',version:1,exportedAt,state,checksum}`. Checksum is SHA256 of the canonical whole wrapper excluding only checksum. Serialize pretty two-space JSON plus one terminal newline; enforce exact 2,097,152 UTF-8 bytes before assignment. Wrapper values are validated, not silently stripped. Check input byte bound first, then apply fatal UTF-8 admission, maximum container depth 32 and decoded duplicate-key refusal before recursive parsing, checksum validation or canonical traversal. No legacy partner backup is accepted by this restore parser; use capture/import preview instead. Graph backup cannot be loaded in an old partner reader (no compatible `program`/records-map envelope), and no down-converter hides links. Unsupported graph versions fail with raw recovery and no state assignment. Future explicit graph migrations need a new versioned validator and preview; do not edit historical schema hashes or implicitly rewrite readable v1 data on open.

Bounds: 20 sources, 100 captures, 500 nodes, 2,000 node versions, 500 links, 2,000 link versions. Every retained historical/retired entry counts. Source raw file bound 8,000,000; original 250/500 rows and field constraints unchanged. Graph reasons 1..2,000 chars; aliases 1..160; filename 1..255 basename only/no controls. Draft has at most 40 keys per fields/binding map together, field values <=16,384 chars, whole canonical draft <=524,288 UTF-8 bytes; binding identifiers/hashes must be plain strings, never JSON authority. Full backup bound also applies. Reject whole over-capacity candidates; keep previous valid state and exact raw form recoverable. Connected view is at most two hops/200 nodes with explicit truncation of the view only; all list views page 25. View caps never truncate stored/exported data.

Packet selection IDs are sorted unique and explicitly checked; selected links add their two endpoint nodes and exact reviewed historical versions to export closure. Include the exact source context for those captured versions and declare that context may contain additional user-entered text. Export reasons/current-state warnings, source/adapter/capture hashes and the selected nodes' presence/absence assertions; do not copy unrelated inventory IDs into a selected packet. An exported absence assertion is self-recorded, not an independently proved nonmembership result. Declare omitted source values and graph records; no hidden inclusion of unrelated nodes/raw draft. Full JSON backup intentionally includes all stored graph nodes, context, complete inventories and draft and is labeled accordingly. Render user text as text; CSV formula defense applies; public source URLs stay HTTPS/no credentials and are never fetched by this feature.

## Storage and UI integration handshake

The new store mirrors the released R3 contract with graph types, using a separately implemented adapter rather than changing R2/R3:

```ts
type StoreCode =
  | "ready"
  | "external_change"
  | "corrupt"
  | "read_error"
  | "unsupported"
  | "persist_failed"
  | "closed";
interface StoreSnapshot {
  state: ProgramGraphState | null;
  hash: Hash | null;
  generation: number;
  observedRaw: string | null | undefined; //null means absent; undefined means unreadable/unavailable
  unsaved: boolean;
  blocked: string;
  message: string;
  code: StoreCode;
  readOnly: boolean;
  canWrite: boolean;
  canRecover: boolean;
  canRetryPersist: boolean;
  canUndo: boolean;
}
interface GraphStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface GraphLocks {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    action: () => Promise<T>,
  ): Promise<T>;
}
interface GraphStoreOptions {
  initialState: ProgramGraphState;
  storage?: GraphStorage;
  locks?: GraphLocks | null;
  cryptoAvailable?: boolean;
}
interface RecoveryPreview {
  readonly state: ProgramGraphState;
  readonly stateHash: Hash;
  readonly generation: number;
  readonly expectedStateHash: Hash | null;
}
interface RestorePreview extends RecoveryPreview {
  readonly kind: "restore";
}
interface ClearPreview extends RecoveryPreview {
  readonly kind: "clear";
}
declare function createProgramGraphStore(
  options: GraphStoreOptions,
): Promise<ProgramGraphStore>;
interface ProgramGraphStore {
  snapshot(): StoreSnapshot;
  commitPrepared(prepared: PreparedGraphMutation): Promise<StoreSnapshot>;
  retryPersist(): Promise<StoreSnapshot>;
  previewRestore(raw: string | Uint8Array): Promise<RestorePreview>;
  restore(preview: RestorePreview): Promise<StoreSnapshot>;
  previewClear(blank: ProgramGraphState): Promise<ClearPreview>;
  clear(preview: ClearPreview): Promise<StoreSnapshot>;
  undo(): Promise<StoreSnapshot>;
  reload(options?: { discardUnsaved?: boolean }): Promise<StoreSnapshot>;
  noticeExternalChange(): StoreSnapshot;
  backup(exportedAt: Instant): Promise<string>;
  rawSavedCopy(): string | null | undefined;
  dispose(): void;
}
```

`GraphStoreOptions` injects storage/locks/hash capabilities for actual-key tests; no source storage is part of the store. These names/preview tokens align with released `artifact-results-store.ts`; do not introduce a second implicit overwrite path. A preview binds whole current-memory hash, generation, exact observed saved bytes (including absent vs unreadable), candidate hash and private one-use capability. Ordinary unseen foreign change first blocks; only a subsequent explicit recovery preview can capture the new bytes. Read denial cannot authorize overwrite. Failed writes retain valid current memory/undo/raw draft and update unsaved state; retry is not command replay. Queued reload/undo cannot supersede a later command. Unsupported locks permit validated read/export only; no lock-free fallback.

UI `mountProgramGraph(root)` gets initialProgram from inert known config. It owns explicit source reading: known page key only on click, file bytes only after file choice. Pass captured copies to the importer; it performs no network, storage or DOM access. Do not retain raw source bytes after a successful real capture or explicit discard; retain them on failed/no-op capture until the user chooses otherwise. Beforeunload warns for unsaved state, dirty raw form and uncommitted selected file/preview. No-op, failed recovery and source errors must not erase those warnings. Plain raw-form recovery remains available when the complete backup cannot accommodate a newer form.

## Required first test cases

1. Execute the actual 9 partner configs/empty/sample exports and all 46 schemas; compare every definition/constraint without repairing source fields. Demonstrate the old optional-field rejection/unknown-field loss while the companion changes no original bytes.
2. Capture two cloned sources sharing IDs; explicitly refresh one; rename and remove one row; retain old version/link and show stale/unresolved; reappearance requires acknowledgement. Changing source ID/collection never silently retargets.
3. Exercise actual typed Fund, Incubator and Field chains, one cross-program edge, duplicate/cycle rejection and link review against exact versions. A rehashed bad graph history still fails.
4. Test whole-source validation, unknown future fields, malformed UTF-8, decoded duplicate JSON keys/IDs, depth-33 rejection before recursive traversal for sources/backups, blank vs0, unselected private values excluded from snapshots, oversize before hash, preview context/byte/selection mutation and async input changes.
5. Test actual final key under simultaneous locks, unseen foreign write before preview, stale recovery token, queued reload, corrupt/read-denied bytes, quota candidate/retry, guarded undo/clear and exact 2 MiB/+1 boundary.
6. Test all six raw form allowlists, partial/malformed/rename recovery, exact successful-command cleanup and unrelated/newer/no-op preservation; mounted UI failed/no-op imports and raw recovery, then actual browser and downloaded-byte checks. Include selected packet closure vs complete backup privacy. Existing partner/R2/R3 checks and static build/check must pass before release claims.
