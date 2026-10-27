# Artifact and results interfaces

Exact interface contract frozen before runtime work · October 27, 2026 · AI-assisted · review: draft. Read with [the implementation plan](ARTIFACT_RESULTS_PLAN.md). The implementation is bounded to: Methods/Replication only; chosen legacy JSON files only; exact saved-record/schema snapshots; explicit amendments; no old-key reads, upload, execution, public result or independent-review authority.

## Ownership and files

Root: frozen adapter data/extraction, Astro component/mounts, package/check wiring and public docs. Model agent: new `src/lib/client/artifact-results-model.ts`, `artifact-results-import.ts`, `scripts/check-artifact-results.mjs` and synthetic fixtures. Storage agent: new `artifact-results-store.ts` and `scripts/check-artifact-results-store.mjs`. UI agent: new `artifact-results-ui.ts`, `artifact-results-ui-helpers.ts`, `src/styles/artifact-results.css`, `scripts/check-artifact-results-ui.mjs` and actual browser acceptance. No OS/service/provider files change. R2 files/keys stay untouched.

Root adds `src/data/research-artifact-adapters.ts` exporting inert frozen `RESEARCH_ARTIFACT_ADAPTERS` and reuses the extracted field arrays in the two existing `.astro` files. This must preserve every existing label, required flag, type, group, hint, option value/label/order and numeric rule; no label cleanup while extracting. Keep the seven Methods questions as page content. Existing ResearchWorkspace behavior, events, storage keys and scenario formulas do not change.

## Exact common types and adapter definition

```ts
type Id=string; //1..100 ASCII letters/digits/_/-, globally unique top-level state entity IDs
type Hash=string; //64 lowercase SHA256 hex
type Instant=string; //canonical actual UTC YYYY-MM-DDTHH:mm:ss.sssZ
type Day=string; //real YYYY-MM-DD,1900..2200
type Program='methods-lab'|'replication-program';
type Kind='method-comparison'|'replication';
type ResultsKnown='unknown'|'not-known'|'partly-known'|'known';
interface SourceRef {url:string; locator:string|null} //URL≤1200,locator≤500; HTTPS,no fetch
interface RegistrationRef {url:string; reference:string; declaredOn:Day|null}
interface AdapterField {
 key:string;label:string;type:'text'|'textarea'|'number'|'date'|'url'|'select';
 required:boolean;group:string|null;hint:string|null;maxLength:number;
 options:{value:string;label:string}[];min:number|null;max:number|null;step:string|null;
}
interface Adapter {
 id:'methods-research-v1'|'replication-research-v1';version:1;program:Program;
 kind:Kind;legacyFreeze:boolean;fields:AdapterField[];hash:Hash;
}
interface LegacyRecord {id:string;createdAt:string;updatedAt:string;values:Record<string,string>}
interface LegacyExport {
 version:1;program:Program;records:LegacyRecord[];
 draft:Record<string,string>;editing:string|null; //same bounded legacy-ID domain
}
```

Real export shape is exactly the ResearchState object above, pretty-serialized by `research-programs.ts`'s `[data-json]` action. It is **not** wrapped in `{state:...}` or a checksum envelope. Export first copies current DOM values into `draft`; `draft` is unfinished even if all fields happen to be complete. Imported protocols come only from explicitly selected `records`.

Normalize omitted current field properties into explicit null/defaults for the adapter snapshot: type=text, required=false, maxLength=8000, options=[], min/max/step/group/hint=null. Adapter hash covers the normalized object excluding `hash`. Historical state contains the actual adapter definition; validation accepts only the known published v1 adapter hashes, never an arbitrary user-supplied schema. Future adapters are additive versions, not edits of old definitions.

Exact Methods keys/order: `title,problem,unit,horizon,currency,method,chain,costLow,costHigh,probabilityLow,probabilityHigh,unitsLow,unitsHigh,assumptions,source,harm,next`. Required: title/problem/unit/horizon/currency/method/chain/assumptions/harm. Numeric costs and units have min 0; probabilities min 0/max 100; all six optional numbers allow blank unknown and explicit zero. Low≤high when both supplied. `source` is optional HTTPS, method options in current order: cash/advocacy/research/mutual-aid/volunteering/investing/prizes. `chain,assumptions,harm,next` are textarea; others retain current types/labels. No currency-code parser or new price-year meaning is imposed on the existing free-text currency field. Freeze captures assumptions, not observed outcomes.

Exact Replication keys/order: `title,source,claim,kind,change,hypotheses,sample,outcome,estimand,analysis,missing,multiple,access,ethics,review,due,amendments`. All except due/amendments are required. Source is HTTPS URL; due is optional real calendar date; kind options reproduce/reanalyse/direct/context in current order. All narrative fields from claim through review, plus amendments, are textarea except kind. Existing maxLength defaults 8000. Preserve exact current labels/options from the source, not abbreviated labels from this paragraph. `legacyFreeze=true` records local UI behavior only.

The old validator accepts some noncanonical Date.parse strings and ignores unknown keys. The new bridge does not silently normalize them: reject unknown root/record/value keys and invalid dates with a clear issue. Where an actual old timestamp is a valid ISO instant with offset, preserve its original text in origin metadata, derive canonical UTC explicitly and hash both representation fields; do not relabel local browser times independent. Source record IDs accept the actual bounded legacy ID syntax (nonempty≤100 without controls), while newly generated register entity IDs use Id. Duplicate legacy record IDs fail. File cap is checked before text/JSON/clone/hash.

Legacy editing uses that same legacy string-ID domain and, when nonnull, must reference a saved record. It is validated as source metadata but never imports editing authority or a draft protocol.

## State graph and immutable entries

```ts
interface Origin {
 program:Program;recordId:string;adapterId:string;adapterHash:Hash;
 createdAt:string;updatedAt:string; //unchanged original source timestamp text
 createdAtUtc:Instant;updatedAtUtc:Instant;
 snapshotHash:Hash;identityHash:Hash; //definitions below
 sourceFileHash:Hash; //actual chosen bytes, provenance only
}
interface ProtocolContent {
 adapterId:string;adapterHash:Hash;values:Record<string,string>;
 resultsKnown:ResultsKnown;registration:RegistrationRef|null;
}
interface Project {id:Id;program:Program;kind:Kind;title:string;currentProtocolId:Id}
interface Protocol {
 id:Id;projectId:Id;version:number;previousId:Id|null;recordedAt:Instant;
 content:ProtocolContent;contentHash:Hash;origin:Origin|null;
 amendmentReason:string;hash:Hash;
}
type Checksum = {kind:'local-bytes';sha256:Hash;byteLength:number;hashedAt:Instant}
 |{kind:'declared';sha256:Hash}|null;
interface Artifact {
 id:Id;role:'protocol'|'data'|'code'|'environment'|'analysis'|'output'|'report';
 title:string;fileName:string|null;url:string|null;
 access:'public'|'restricted'|'not-shared'|'unknown';license:string|null;
 note:string|null;checksum:Checksum;
}
interface ManifestContent {
 artifacts:Artifact[];environment:string;runInstructions:string;deviations:string;
}
interface Manifest {
 id:Id;projectId:Id;protocolId:Id;protocolHash:Hash;version:number;
 previousId:Id|null;recordedAt:Instant;content:ManifestContent;hash:Hash;
}
interface Estimate {
 estimate:number|null;lower:number|null;upper:number|null;intervalLevel:number|null;
 unit:string|null;measure:string|null;population:string|null;timeHorizon:string|null;
 denominator:number|null;source:SourceRef|null;
}
type ResultKind='observed'|'reported-null'|'inconclusive'|'stopped'|'not-observed';
interface ResultContent {
 kind:ResultKind;observedOn:Day|null;summary:string;
 original:Estimate|null;reported:Estimate|null;
 deviations:string;limitations:string;sourceReferences:SourceRef[];
 conflicts:{state:'unknown'|'declared-none'|'declared';note:string|null};
}
interface Result {
 id:Id;projectId:Id;protocolId:Id;protocolHash:Hash;manifestId:Id;manifestHash:Hash;
 supersedesId:Id|null;recordedAt:Instant;content:ResultContent;hash:Hash;
}
interface ComparisonContent {
 compatible:boolean;compatibilityReason:string;showDifference:boolean;
 interpretation:string;limitations:string;nextCheck:string;
}
interface Comparison {
 id:Id;resultId:Id;resultHash:Hash;supersedesId:Id|null;recordedAt:Instant;
 content:ComparisonContent;hash:Hash;
}
interface Packet {id:Id;recordedAt:Instant;projectIds:Id[];inputHash:Hash}
type Tab='projects'|'import'|'protocol'|'artifacts'|'results'|'compare'|'exports';
type FormKind='protocol'|'manifest'|'result'|'comparison'|'import';
interface Draft {
 tab:Tab;selectedProjectId:Id|null;
 form:null|{kind:FormKind;targetId:Id|null;fields:Record<string,string>};dirty:boolean;
}
interface ArtifactState {
 version:1;id:Id;revision:number;updatedAt:Instant;
 adapters:Adapter[];projects:Project[];protocols:Protocol[];manifests:Manifest[];
 results:Result[];comparisons:Comparison[];packets:Packet[];draft:Draft;
}
```

Keep interpretation/follow-up in Comparison instead of adding a second review/note subsystem. No review approval, reviewer identity, standing review queue, result public status, PR receipt, rating or inferred fieldwork appears in this DTO. The optional external registration reference is explicitly user-supplied/unverified.

All entry `hash` fields cover the exact entry excluding only their own hash. `Protocol.contentHash` covers content only. Protocol versions are contiguous per project; each new protocol references the exact current predecessor. Project.currentProtocolId must equal the latest accepted version. There is no command selecting an older version as current; a history-view selection is transient UI state. Old protocol/manifests/results/comparisons remain historical even when inspected. Native protocol.freeze is a no-op only when content equals the CURRENT protocol. An explicit amendment returning to ancestor-identical assumptions creates a NEW latest protocol ID/version, with required exact current binding and nonempty reason; it never selects or reuses the historical ID. Repeated contentHash values across distinct protocol versions are therefore valid. New version starts with no manifest/result carry-forward. Exact imported identity replay remains a no-op preserving the actual current version; UI may advise a deliberate manual amendment to return to earlier assumptions.

Embedded artifact IDs are unique within a manifest, not top-level graph entities. A later manifest may retain the same artifact ID to show its revised descriptor/checksum; it still has a new manifest hash and never edits the earlier line. No result references an artifact ID without its exact manifest binding. Count retained artifact descriptors in every manifest toward the global2,000 bound, including repeated IDs across versions.

Manifest chain is per exact protocol binding; version starts1 and increments. Current manifest is its latest member. A new protocol starts with no manifest; an old manifest is not copied to it. Result chains are per exact protocol+manifest binding; `supersedesId` must equal the current last result for that binding (null initially). Comparison chains are per exact result ID/hash. New result/manifest/protocol makes earlier dependent entries historical in the current project view; nothing is erased or silently rebound. New manifest/result/comparison writes require the project's current protocol/current manifest/latest result respectively. Historical corrections therefore need an explicit new current plan/amendment and new bound outputs, not editing a historical entry.

Known numeric values must be finite; denominator is a nonnegative safe integer. Bounds order and estimate-within-known-bounds are checked; intervalLevel, if known, is >0 and<1. Missing interval endpoint is unknown, not zero. A reported-null result is the user's sourced interpretation and never automatically forces estimate0 or means “no effect.” `not-observed` cannot supply a reported numeric estimate, bounds or denominator; it can retain the original source estimate and explain missing evidence. observedOn is known day/null, distinct from recordedAt. Results require nonempty deviations/limitations (an explicit “none reported” is a user statement). For kind observed/reported-null, later-result source qualification is exactly `sourceReferences.length>=1 || reported?.source!==null`; `reported` must exist for the second branch. An original.source alone never qualifies the later result. Every qualifying ref must pass the same HTTPS/locator validation; existence is self-recorded provenance, not proof that the source was read or supports the result. not-observed/stopped/inconclusive may instead explain unavailable material in summary/limitations.

Difference is exactly `reported.estimate-original.estimate`, only when showDifference+compatible are true, compatibilityReason is nonempty, both estimates are known and unit/measure/population/timeHorizon are all known and match exactly after trim (case-sensitive). Neither values nor intervals are converted. Reject nonfinite subtraction, even when both operands are individually finite. No percentage/ratio, inferred confidence or significance, interval subtraction, pooling, scenario-to-empirical promotion or causal label. `artifactDifference` returns null plus reasons if unavailable; a command asking to enable an invalid difference fails before assignment.

## Pure public exports and commands

```ts
interface ArtifactIssue {path:string;code:string;message:string}
class ArtifactError extends Error {code:string;issues:ArtifactIssue[]}
interface ArtifactContext {
 expectedStateHash:Hash;at:Instant;makeId:()=>Id;
 digest?:(bytes:Uint8Array)=>Promise<Hash>;
}
interface PreparedArtifactMutation {
 format:'charitology-artifact-mutation';version:1;
 expectedStateHash:Hash;expectedRevision:number;
 nextStateHash:Hash;nextState:ArtifactState;commandHash:Hash;noOp:boolean;
 summary:{kind:ArtifactCommand['kind'];message:string};
}
type ArtifactCommand =
 |{kind:'protocol.freeze';projectId:Id|null;expectedProtocolId:Id|null;
   expectedProtocolHash:Hash|null;content:ProtocolContent;amendmentReason:string}
 |{kind:'protocol.import';preview:ProtocolImportPreview;assignments:ImportAssignment[]}
 |{kind:'manifest.freeze';projectId:Id;protocolId:Id;protocolHash:Hash;
   previousId:Id|null;content:ManifestContent}
 |{kind:'result.record';projectId:Id;protocolId:Id;protocolHash:Hash;
   manifestId:Id;manifestHash:Hash;supersedesId:Id|null;content:ResultContent}
 |{kind:'comparison.record';resultId:Id;resultHash:Hash;
   supersedesId:Id|null;content:ComparisonContent}
 |{kind:'packet.record';projectIds:Id[]}
 |{kind:'draft.replace';draft:Draft};
blankArtifactState(id:Id,at:Instant):ArtifactState;
canonicalArtifactJson(value:unknown):string;
hashArtifactValue(value:unknown):Promise<Hash>;
artifactStateHash(state:ArtifactState):Promise<Hash>;
artifactInputHash(state:ArtifactState,projectIds:Id[]):Promise<Hash>;
validateArtifactState(value:unknown):Promise<ArtifactState>;
prepareArtifactCommand(state:ArtifactState,command:ArtifactCommand,
 context:ArtifactContext):Promise<PreparedArtifactMutation>;
artifactProjectView(state:ArtifactState,projectId:Id):ProjectView;
artifactDifference(result:Result,comparison:ComparisonContent):
 {value:number|null;reasons:string[]};
makeArtifactBackup(state:ArtifactState,exportedAt:Instant):Promise<string>;
parseArtifactBackup(raw:string|Uint8Array):Promise<ArtifactState>;
artifactBackupBytes(state:ArtifactState):number;
artifactCsvExports(state:ArtifactState,projectIds:Id[]):
 {protocols:string;artifacts:string;results:string;comparisons:string};
artifactMarkdownPacket(state:ArtifactState,projectIds:Id[]):string;
makeArtifactPacket(state:ArtifactState,packetId:Id,exportedAt:Instant):
 Promise<{json:string;csv:ReturnType<typeof artifactCsvExports>;markdown:string}>;
```

`protocol.freeze` with null project/expected refs atomically creates project+first protocol from the chosen known adapter. Project title is the first protocol's values.title and remains its identity label; currentProtocol title is separately rendered. An amendment requires current project ID/exact predecessor hash+ID and nonempty reason; program cannot change. There is no empty project.create command. New protocol content may begin with cloned old values, but its draft is not active until validated freeze. All mutations clear only a matching relevant saved raw form; unrelated draft remains. Exact no-op preserves the whole state, including draft/revision/history.

`ProjectView` is exact derived `{project,currentProtocol,currentManifest,latestResult,latestComparison,history:{protocols,manifests,results,comparisons},counts:{protocols,manifests,artifacts,results,comparisons},notices}`. No synthetic statuses or review claim. Arrays include history under explicit versions; latestResult/currentManifest selection follows chains above. UI may inspect a historical node by ID but cannot substitute it for the current write binding.

All pure functions are network/DOM/storage/clock/random free. Capture input state, command and supplied file bytes before awaits, compare again after async work (including no-op), validate full references/hashes and exact future backup bytes before returning deep-frozen candidates. Persistent validation/hash uses WebCrypto; audited @noble/hashes 2.4.0 can supply synchronous projection hashes with UTF8/multiblock cross-checks. Never add handwritten crypto. IDs/time are context-owned; local time carries no independent authority.

Raw draft total capacity is 256 KiB, retaining40 fields and8,000 chars/field. This covers the actual supported17 × 8,000-character legacy protocol values plus binding/registration/reason fields without a new48 KiB canonical protocol restriction. Preserve the original field semantics; do not reject a valid legacy protocol merely to fit the old64 KiB proposal. The complete future2 MiB backup cap still applies to the whole candidate. Saving a raw duplicate near full capacity may fail while the canonical protocol itself remains valid/exportable; refuse the mutation without shortening anything.

## File-only legacy bridge

```ts
interface ProtocolImportInput {
 kind:'legacy-research-json';bytes:Uint8Array;fileName:string;program:Program;
 selectedRecordIds:string[];
}
interface ProtocolImportRow {
 recordId:string;title:string;origin:Origin;content:ProtocolContent;
 existingProtocolId:Id|null;existingProjectId:Id|null;changedSourceProjectIds:Id[];
 issues:ArtifactIssue[];
}
interface ProtocolImportPreview {
 version:1;expectedStateHash:Hash;sourceFileHash:Hash;reviewHash:Hash;
 input:ProtocolImportInput;adapterId:string;adapterHash:Hash;
 rows:ProtocolImportRow[];ignoredDraft:boolean;
 capacity:{projectsAfterMinimum:number;protocolsAfter:number;backupBytesMinimum:number};
}
type ImportAssignment={recordId:string;target:
 {kind:'new'}|{kind:'amend';projectId:Id;expectedProtocolId:Id;
 expectedProtocolHash:Hash;reason:string}};
previewProtocolImport(state:ArtifactState,input:ProtocolImportInput,
 expectedStateHash:Hash):Promise<ProtocolImportPreview>;
readLegacyResearchExport(bytes:Uint8Array,program:Program):
 {export:LegacyExport;adapter:Adapter};
```

The file must match the selected program, exact finite envelope and frozen adapter field semantics. Cap2 MiB and fatal UTF8 decode before JSON/clone/hash. Up to200 saved records in a legacy file; require1..20 selected unique saved IDs per preview. No arbitrary citation CSV or custom schema import. Never read even one old localStorage key. Raw draft is allowed invalid typed inputs within bounded known string fields, shown as excluded, never promoted. Validate all record envelopes/unique IDs and known saved field values; invalid rows block the preview with explicit issues, never partial silent truncation.

`snapshotHash=hash({program,adapterHash,values})`; `identityHash=hash({program,recordId,snapshotHash})`. Exclude filename, file hash, source timestamps, unselected records and source draft from identity. The actual file hash remains provenance in the first captured origin. A renamed/reserialized file, unselected/draft change or timestamp-only change cannot mint another protocol when identity is unchanged. Preview reviewHash binds only the exact chosen file, selection/rows and expected state; changing file/selection/state requires a fresh preview. Assignment changes do not need a new file preview: the exact assignments are bound by PreparedArtifactMutation.commandHash and checked against current rows/state during preparation, then committed through the guarded adapter. UI generation prevents a changed assignment arriving during preparation from committing an older command. Do not claim a preview hash covers input it never receives.

Preview metadata is copied and deeply frozen, but `input.bytes` is an owned copied Uint8Array and deliberately not promised Object.freeze-immutable (nonempty typed arrays cannot be frozen). Callers may mutate that returned byte buffer; this invalidates its source/review hash and commit must reject it. Preparation snapshots the complete command/bytes before any await and rechecks the original at completion. Private validated nextState contains plain JSON only and is fully deeply frozen. No writable byte buffer enters state/store/backup. Preview copies never retain an alias to the caller's original selected input buffer.

Each selected row has exactly one assignment. Exact existing identity is a no-op regardless of the file name; report its existing IDs and do not change current selection/history. A new source record may target new. A changed snapshot for an already imported program+recordId **cannot** use new: require an explicit amend target among changedSourceProjectIds, exact current predecessor and reason. If several saved source versions from one project are selected, reject competing amendments in the same preview and ask for one version at a time. Do not guess version ordering from legacy timestamps. Commit recomputes bytes/preview/state/references/assignments atomically; any issue rejects all selected rows. Reimport cannot overwrite a result. Imported resultsKnown defaultsunknown and registration=null; enrich it via a later explicit local amendment, not guessed source prose.

## Deliberate local file checksum helper

```ts
hashSelectedArtifact(bytes:Uint8Array,at:Instant):Promise<
 {kind:'local-bytes';sha256:Hash;byteLength:number;hashedAt:Instant}>;
```

Put this pure helper in import.ts. Reject> 8 MiB before clone/hash; snapshot original bytes and reject input mutation across awaits. UI checks File.size first, reads one local file with30 s timeout and generation guard, then uses helper. Metadata stores descriptor/checksum only; no File/Blob/base64/raw byte arrays enter state/backup/draft. fileName is a bounded basename string, no filesystem path. The ordinary UI helper creates local-bytes only from that explicit selection; manually entered external checksums use declared. However raw descriptor JSON or a restored backup can also assert `kind:'local-bytes'`, and hashes are not authenticated history. Always label it **self-recorded local-byte checksum**, never independently verified file selection, execution or provenance. No remote URL fetch or server upload. Changing a file/checksum after manifest freeze creates a new manifest; compare output hashes as byte identity only, not evidence that code ran correctly.

## Store and recovery interface

New key/lock is exactly `charitology.artifact-results.v1`. Mirror released R2 semantics while using this validator/state, without changing R2 itself:

```ts
createArtifactResultsStore({initialState,storage?,locks?,cryptoAvailable?})
 ->Promise<ArtifactResultsStore>;
ArtifactResultsStore={snapshot,commitPrepared,retryPersist,previewRestore,restore,
 previewClear,clear,undo,reload,noticeExternalChange,backup,rawSavedCopy,dispose};
```

Snapshot fields/types exactly mirror R2 StoreSnapshot with ArtifactState: state/hash/generation/observedRaw/unsaved/blocked/message/code/readOnly/canWrite/canRecover/canRetryPersist/canUndo. Restore/Clear previews are deeply immutable `{kind,state,stateHash,generation,expectedStateHash}` and adapter-local trusted identity. Same signatures as R2 for method arguments/results. Only new-key bytes are read; no automatic import from a related key. No write during initial read.

Every mutation/replacement/retry obtains exclusive Web Lock on the exact key, rechecks latest memory hash+observed saved bytes and validates exact complete backup before assigning. Memory may be newer than disk after failed persistence; do not re-read old saved state as the source for a new command or retry. Retry persists same candidate without repeating events/revisions. A foreign saved write detected before a clear/restore preview, even without a storage event, first blocks and requires a second explicit recovery review against the newly observed bytes; the first preview must not silently rebase authority. External change retains current work export; confirmed reload discards it and clears undo. Corrupt bytes are downloadable only when captured/readable. Read denial leaves observedRaw undefined and raw recovery unavailable; never offer empty text as the protected copy. Recovery requires validated preview plus explicit confirmation. Missing Locks/secure hash is visibly read-only, no optimistic fallback. Clearing/restoring/undoing never touches source/other keys.

## UI mount, forms and export

Root `ArtifactResults.astro` props `{program:Program}`; same key in both pages, initial program filter only. It renders a fixed heading, privacy/no-publication note, escaped inert adapter JSON if needed, `.artifact-results-mount`, fallback raw recovery and noscript text. `mountArtifactResults(root:HTMLElement):Promise<void>` is exported by UI. `data-artifact-program` chooses initial filter; `data-base` handles GitHub Pages base. Schemas come from the known frozen module, not arbitrary DOM/user input. No hidden direct source-key read. Legacy desk button remains “Export JSON”; the new desk says “Choose a Methods/Replication JSON export.”

Tabs: Projects, Import plan, Protocol, Artifact manifest, Results, Comparison, Export/recovery. Distinct “current version” and history panels; counts are retained local records, never studies executed/successful replications. Results forms display bound protocol/manifest IDs/hashes and original/later estimates with explicit unknowns. Artifact access, checksum origin and registration reference status remain visible. Per-page rows25.

Exact allowed raw draft fields:

- protocol: `adapterId,adapterHash,projectId,expectedProtocolId,expectedProtocolHash,resultsKnown,registration,amendmentReason` plus the exact selected adapter's existing field keys (including its own source/title/kind/review fields). Store values individually, never a single oversized `content` object. Registration is JSON text. Adapter selection is explicit; changing it starts a separately guarded form, not reinterpretation of the old fields.
- manifest: `projectId,protocolId,protocolHash,previousId,environment,runInstructions,deviations` plus `artifact0`..`artifact9`. Each artifact is JSON text; absence is represented by empty string. Preserve exact raw text, including invalid JSON and gaps, until explicit submit requires a contiguous0..N−1 list of 1..10 artifacts.
- result: `projectId,protocolId,protocolHash,manifestId,manifestHash,supersedesId,kind,observedOn,summary,original,reported,deviations,limitations,sourceReferences,conflicts`. Original/reported/refs/conflicts use JSON text; null is the exact JSON literal, while other fields remain strings. At most4 source refs keeps one raw references field within8,000 chars. An estimate's unit/measure/population/timeHorizon are each≤500chars.
- comparison: `resultId,resultHash,supersedesId,compatible,compatibilityReason,showDifference,interpretation,limitations,nextCheck`. Booleans are raw `true`/`false` strings; malformed text stays raw and submit rejects it.
- import: `program,sourceFileHash,selectedRecordIds` plus `assignment0`..`assignment19`. Selected IDs are raw JSON text; each assignment field holds one ImportAssignment JSON object, not a combined potentially>8,000-char list. Empty unused slots are retained as raw strings; submit requires a contiguous0..N−1 sequence matching the selected row order and exact IDs. Each reason≤2,000 chars fits its own field; total 256 KiB admission still applies. File must be reselected and freshly previewed; a different sourceFileHash cannot inherit saved reviewed assignments without explicit discard/review. No file bytes are saved.

Structured form inputs may generate these strings but must preserve malformed restored text in a repair view; never coerce it during render. At most40 fields, each key80/value8000, total 256 KiB. Relevant successful commands clear the matching form; no-op does not. Input bindings are never refreshed merely because a draft is reopened. The result/manifest command's typed `content` is assembled only after deliberate submit parsing/validation.

All async actions carry a generation token and exact form bindings; changing selection/form, any raw edit or external storage event invalidates completion. Busy controls are restored after final render. Save raw draft does not freeze canonical entities. Saving only mapping/descriptor metadata never clears the warning for still-unsaved reviewed assignments/file selection. Successful canonical action clears its relevant saved draft; unrelated dirty form is saved/exported/discarded explicitly. Header backup includes latest bounded unsaved raw form from DOM/memory when the complete backup fits. beforeunload warns for raw dirty state or unsaved valid candidate.

Always offer **Download raw form recovery text**, including after a full-backup/Save draft size failure. UI snapshots the current exact raw kind/target/field strings and emits inert plain text with an unmistakable prefix “Unfinished raw form recovery; not a valid workspace backup or research record,” the actual export time and JSON text of that raw form. It includes no selected file bytes or auto-publication/restore command. Do not pass this through makeArtifactBackup or claim parseArtifactBackup accepts it. This is a separate non-lossy manual repair copy; it does not clear dirty/unsaved warnings. If the full workspace without the unsaved raw form can still export, offer that separately with explicit labeling so both copies can be retained.

Full backup exact wrapper is `{format:'charitology-artifact-results',version:1,exportedAt,state,checksum}`. checksum covers canonical `{format,version,exportedAt,state}`. Validate incoming UTF8 bytes, exact root keys/checksum, graph/history/hash semantics and actual full pretty UTF8 envelope≤2,097,152. Future admission reserves a canonical24char timestamp and64 chars checksum including indentation/newlines, not raw state length. Packet descriptors never contain backup text/other packets. projectIds is an unordered unique nonempty selection; normalize/sort IDs before hashing, descriptor storage and traversal so checkbox order cannot mint a different packet. artifactInputHash excludes draft/packets/workspace identity+revision/time and includes exactly chosen project closure+adapters.

makeArtifactPacket JSON is the **complete whole-workspace backup**, including unselected projects and the saved raw draft, while its CSV/Markdown views cover selected projects. The UI must warn before download: “Packet JSON contains the whole private register, including unselected projects and saved form fields.” The descriptor certifies only the selected closure hash, never that unselected work/drafts remain unchanged or that a past entire workspace is reconstructable from it. Header current-work backup may additionally substitute current unsaved bounded DOM draft after validation; packet generation uses the saved/current canonical state.draft as supplied. Changed selected closure requires a new packet or the earlier actual downloaded JSON; unchanged selected closure can still coexist with a changed full-workspace backup. CSV/text claims remain limited to self-recorded sourced observations and declared checksums; formula-leading strings are neutralized before quote escaping. JSON is lossless. No ZIP/file storage, result publishing, executing analysis or independent validation is implied.

## Bounds and required proof before freeze

Bounds: projects100, protocols400, manifests400,10 artifacts/manifest (2,000 retained globally), results400, comparisons400, packets20, combined immutable history5,000, raw draft 256 KiB, legacy file2 MiB, local hash8 MiB, full backup2 MiB, import selection20. All retained historical entries count; no pruning. General text 2,000/title 500/source URL 1,200/filename 200/artifact license 200; legacy values preserve frozen field max 8000. Hash/history/input validation rejects unknown/prototype keys, malformed URLs/dates, dangling refs, duplicate IDs/revision entries, scalar coercion and invalid chain/version transitions. Bounds precede expensive clone/hash/parsing; full export bound precedes assignment.

Three-agent proof: model/import actual-module strictTS+graph/arithmetic/bridge/full backup checks; store actual-key contender/memory-vs-disk/recovery/exact2 MiB checks; UI actual-controller+real browser/download proof. Root separately checks adapter equality against both current forms, all root types/build/routes/base paths and legacy module suite. A synthetic source demonstrates protocol→manifest known local SHA→explicit observed zero and unavailable result→comparison/deviation→download+restore across both mounts. Wrong/old bindings, changed same-source import, finite subtraction overflow and stale-tab writes fail without replacing work. Real research/public review/provider/mail/OS databases remain unchanged. Only after this evidence may the bounded local R3 workflow be called implemented.

Required amendment/replay regressions distinguish three paths: current-identical native freeze is an exact no-op; current-bound explicit amendment to ancestor-identical content appends a new latest ID/version with no old output carry-forward; exact imported ancestor identity replay is an exact no-op/current unchanged. Also execute source qualification with original.source alone rejected, reported.source accepted, explicit later sourceReferences accepted; twenty separate amendment reasons survive raw draft save/restore; the largest valid legacy protocol can become an amendment draft within 256 KiB; full-backup size failure leaves plain raw-form recovery available and dirty warnings intact. Packet tests select the same IDs in different orders, show unchanged selected hash despite changed unselected work, and prove full JSON still contains the unselected project/saved draft under its own whole-backup checksum.
