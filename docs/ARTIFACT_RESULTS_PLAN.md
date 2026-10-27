# R3 local artifact and results register

Implementation plan frozen before runtime work · October 27, 2026 · AI-assisted · review: draft. This plan creates no public research result, independent review or provider operation. Read the exact [interfaces](ARTIFACT_RESULTS_INTERFACES.md) before implementation.

## Bounded recommendation

Add one origin-local register that turns a selected research plan into an exact protocol snapshot, a versioned artifact manifest, a dated self-recorded result and an explicit comparison or follow-up. Mount the same register on Replication Program and Methods Lab only in this first slice. Keep the current legacy desks usable and untouched. Failure Lab and History of Charity remain source-linked retrospective notebooks; extending their intake into this register is deferred.

The useful first journey is **snapshot a Methods/Replication plan → describe and locally hash chosen artifacts → record an observed, inconclusive or unavailable result → compare the original and later report → export the complete evidence packet and restore it elsewhere**. A hash identifies bytes; it does not establish truth, execution, consent, independence or public registration. No actual study or review should be seeded. Synthetic workflows belong only in excluded test fixtures.

This implements a modest R3 software slice. It does not execute uploaded code, store datasets, recruit people, synthesize effects, supply a registry receipt, publish research, determine whether a named charity is good or establish that a replication succeeded.

## Actual boundaries inspected

| Existing file/function | Current behavior and consequence |
| --- | --- |
| `src/components/programs/replication-program.astro` | A full claim/design/analysis/access/ethics/review plan uses `ResearchWorkspace` with `freeze=true`. Saved versions can be forked, exported and deleted. It has no artifact manifest, execution result or original/result comparison. Its browser time is explicitly not independent registration. |
| `src/components/programs/methods-lab.astro`; `research-programs.ts::methodRange` | Entered low/high assumptions produce scenarios. They are not observations or confidence intervals. An imported scenario must retain that classification and cannot become empirical evidence by acquiring a file hash. |
| `src/components/programs/failure-lab.astro` | A source-linked failure/mixed case can prefill a mutable local postmortem. Observation, alternative explanations, mechanism, lesson and follow-up result are text fields. The initial Record summary is explicitly a draft. |
| `src/components/programs/history-of-charity.astro` | A selective 13-case timeline and mutable two-case comparison notebook. Ordering extracts a year from a period label; it is not a causal analysis. Neither source dates nor notebook times are experiment dates. |
| `src/components/programs/ResearchWorkspace.astro`; `research-programs.ts` | Per-program `ResearchState` holds saved `{id,createdAt,updatedAt,values}` plus raw draft. `validateResearchState`, `upsertResearchRecord`, `editResearchRecord`, `researchMarkdown` and `researchStorage` define the actual v1 format. Storage is `charitology.research-program.<program>.v1`; no cross-program graph exists. |
| `src/lib/forecast-model.ts`; `ForecastDrafter.astro`; `src/content.config.ts` | F1 already enforces cutoffs, resolution provenance, annulment and latest eligible scoring. The five checked-in forecast lists are empty. R3 may cite a question/version and its public resolution source; it must not write forecast entries, invent outcomes or change scoring. Forecasts remain PR-based public records. |
| New R2 model/store/helpers | Strong patterns exist for immutable prepared commands, canonical hashes, exact complete-backup admission, dirty/raw drafts, Web Locks and separate current-memory/saved-byte CAS. Their concrete state/key validators are R2-specific, not a generic adapter that can simply be pointed at R3. |
| `docs/MEGA_LIST_ACCEPTANCE.md`, ticket R3 | Acceptance asks for exact protocol assumptions/source/version, separately dated result/artifact checksum and deviations, without independent-preregistration or study-outcome claims. R4 owns public review and disposition; this register does not. |

The source checks above are local code inspections. This plan has not checked any study's actual data, independently interviewed anyone or established new historical facts.

## One state, explicit provenance

Proposed new key and lock: `charitology.artifact-results.v1`. No reads or writes of legacy, R2 or OS keys. The first bridge accepts only a deliberately chosen Methods/Replication JSON export file; the user selects saved records from that file in a preview. Only selected, validated saved records cross the bridge. The raw legacy draft may contain unfinished typed inputs; it is explicitly ignored and never imported as a frozen protocol. A later legacy edit cannot mutate the captured copy. Exact DTOs and function signatures are in `ARTIFACT_RESULTS_INTERFACES.md`.

```text
ArtifactState {version:1,id,revision,updatedAt,adapters[],projects[],protocols[],
  manifests[],results[],comparisons[],packets[],draft}
Project {id,program,kind:replication|method-comparison,title,currentProtocolId}
Protocol {id,projectId,version,previousId|null,recordedAt,origin|null,
  content:{adapterId,adapterHash,values,resultsKnown,registration|null},
  amendmentReason,contentHash,hash}
Manifest {id,projectId,protocolId,protocolHash,version,previousId|null,
  recordedAt,content:{artifacts[],environment,runInstructions,deviations},hash}
Result {id,projectId,protocolId,protocolHash,manifestId,manifestHash,
  supersedesId|null,recordedAt,content:{observedOn|null,kind,summary,
  original|null,reported|null,deviations,limitations,sourceReferences[],conflicts},hash}
Comparison {id,resultId,resultHash,supersedesId|null,recordedAt,
  content:{compatible,compatibilityReason,showDifference,interpretation,
  limitations,nextCheck},hash}
Packet {id,recordedAt,inputHash,projectIds}
```

- Snapshot known legacy field definitions as bounded inert adapters, including labels, types, required rules and select choices. Reject unknown fields and invalid saved-record values using the frozen program/schema adapter. Hash exact selected values/field definitions and source identity. A changed form definition needs a new adapter version; do not silently reinterpret an old snapshot against the latest `.astro` fields.
- Program/adapter distinguishes proposed replication plans from Methods scenarios. `resultsKnown` is `unknown|not-known|partly-known|known`, self-declared. A local timestamp never proves that results were unknown then. Project.currentProtocolId is always its latest accepted version; earlier UI history selection cannot change it. Amendments bind the exact current predecessor and explain what changed. Native freeze of CURRENT-identical content is a no-op; an explicit amendment back to ancestor-identical assumptions makes a NEW latest ID/version with reason, never selects the historical ID or carries its outputs forward. Exact imported identity replays remain no-op/current unchanged. Retrospective case-note ingestion is deferred rather than renamed a protocol.
- Optional external registration is a **user-supplied reference**, not verified registration. HTTPS URL/reference/date may be unknown. A public registry's actual independent receipt is a separate future editorial source check. Browser `recordedAt` cannot substitute for it.
- Manifest artifacts: opaque ID, role (`protocol|data|code|environment|analysis|output|report`), bounded filename/title, public HTTPS URL or null, access (`public|restricted|not-shared|unknown`), license or null, source note, and optional checksum observation. Do not require confidential data to be made public to record its unavailability.
- Distinguish `checksum:{kind:'local-bytes',sha256,byteLength,hashedAt}` from `checksum:{kind:'declared',sha256}` and null. The ordinary UI creates the first from a deliberately selected local file; raw JSON/backup can also assert it. Label it self-recorded local-byte checksum, never independently verified selection/provenance. Hash at most8 MiB per file, one at a time; store descriptors only, never file bytes. No URL fetch, filename path, code execution or ZIP extraction. A later local file mismatch is a new manifest, not replacement of the old one.
- Result kinds: `observed|reported-null|inconclusive|stopped|not-observed`. Unavailable/not-observed is not a null effect. An observed/reported-null result requires a valid later-result source: nonempty sourceReferences or reported.source; original.source alone does not qualify it. This is a self-recorded source/explanation, not an automatically inferred significance test. Zero is an explicit known estimate; numeric null means unknown. `observedOn` is a genuine known calendar date or null, separate from local entry time.
- Typed original/later estimates: finite estimate or null, lower/upper or null, interval level or null, unit/measure/population/time horizon or null, nonnegative integer denominator or null, exact source/page or null. Bounds must agree where known. There is no precision invented from prose, no denominator substitution and no combining results.
- The original claim and later result remain side by side. Optional arithmetic difference is allowed only after an explicit comparability assertion and matching known measure/unit/population/time horizon. Refuse missing estimates or nonfinite subtraction, including overflow from individually finite operands. No interval arithmetic/conversion/pooling. Label the result descriptive arithmetic under the entered assertion, never a causal effect or automatic replication verdict. Byte-identical output is labeled byte identity only.
- Comparison contains self-recorded interpretation/follow-up; there is no extra note/review subsystem. Do not expose approved/peer-reviewed states or enable public problem status changes. Conflicts stay unknown/declared-none/declared with explanatory text; this is a local declaration, not verified clearance.

## Pure commands and API proposal

Freeze exact TypeScript DTOs before implementation. Proposed public exports:

```text
blankArtifactState(id,at)
validateArtifactState(unknown) -> Promise<deeply frozen ArtifactState>
artifactStateHash(state), artifactInputHash(state) -> Promise<SHA256>
previewProtocolImport(state,{kind,program,bytes,fileName,selectedRecordIds},expectedStateHash)
  -> immutable ProtocolImportPreview with sourceFileHash/reviewHash/rows
prepareArtifactCommand(state,command,{expectedStateHash,at,makeId})
  -> immutable {baseHash,nextState,nextHash,noOp,message}
artifactProjectView(state,projectId) -> exact bound versions/current/history
artifactDifference(result,comparisonContent) -> {value:null|number,reasons[]}
makeArtifactBackup(state,exportedAt), parseArtifactBackup(raw)
artifactCsvExports(state,projectIds), artifactMarkdownPacket(state,projectIds)
makeArtifactPacket(state,packetId,exportedAt) -> complete JSON + CSV + Markdown
```

Commands: protocol.import, protocol.freeze, manifest.freeze, result.record, comparison.record, packet.record and draft.replace. Protocol.freeze/import atomically creates a project with its first valid protocol; there is no empty project.create or note.record command. No general object patch. A correction appends a superseding record bound to the exact prior version/hash. Deleting referenced entities or archival is not offered in this release.

Protocol.import recomputes preview/source/state hashes and every selected saved record. Identity is program +legacy record ID +exact snapshot values/schema hash, excluding filename/file hash/source timestamps/unselected records/raw draft. Exact replay is no-op; a changed same-source snapshot requires an explicit current amendment target/hash+reason and cannot silently make a new project. Unknown/oversized/invalid saved JSON fails before assignment. A bounded unfinished legacy raw draft is explicitly ignored, not imported or a reason to pretend the saved records disappeared. Import never reads or changes any source key.

All mutation candidates capture immutable input before awaits, check the expected whole-state hash before and after asynchronous work and verify full byte admission before assignment. Web Locks plus current-memory hash and exact observed saved-byte CAS are required for writes. A quota failure keeps the valid newer candidate exportable; retry persists that candidate without replaying its command. Unsupported locks/hash is read-only. No synchronous noble hash implementation needs to be invented; use the already pinned library and WebCrypto cross-checks.

Raw `draft` follows the R2 bounded pattern: selected tab/project plus `{kind,targetId,fields:Record<string,string>}`. Invalid unfinished strings remain raw. A restored manifest/result/comparison form retains exact protocol/manifest/result bindings; it cannot silently bind to a later version. Guard late file reads/hashes with UI generation and retain raw inputs on errors. Saving only an artifact descriptor or import mapping cannot claim that the original file or reviewed import assignments have been saved.

Raw draft capacity is 256 KiB with unchanged40 fields/8,000 chars-per-field limits, allowing the actual full legacy protocol shapes without an artificial48 KiB canonical cap. Complete future2 MiB backup admission still applies. If the current raw form cannot fit beside the full workspace, preserve it in memory and always offer a separate exact plain raw-form recovery text download, visibly not a valid workspace backup. Offer the canonical workspace separately when it fits; never clear unsaved warnings or truncate fields. Preview metadata is frozen but copied typed byte input is not falsely promised immutable; commit recomputes hashes and rejects mutation. Raw saved bytes are downloadable only when readable/captured; read denial stays unavailable rather than inventing an empty copy.

## New files and narrow integrations

| Owner boundary | Proposed files/integration |
| --- | --- |
| Pure graph and import | New `src/lib/client/artifact-results-model.ts`, `artifact-results-import.ts`; no DOM, storage, filesystem or network. A pure program snapshot adapter uses frozen field definitions supplied by Astro. |
| Local persistence/recovery | New `src/lib/client/artifact-results-store.ts`; reuse the proven R2 CAS/lock semantics with the new key and validator. Do not refactor the released R2 adapter merely to accelerate this slice; a later shared-core extraction needs both full suites. |
| UI | New `src/components/ArtifactResults.astro`, `src/lib/client/artifact-results-ui.ts`, `artifact-results-ui-helpers.ts` and scoped CSS. Single mount entry; program props choose initial filter, not a different register. All record text/filenames render as text. |
| Program adapter | New `src/lib/artifact-results-catalog.ts` supplies current public intervention references and inert known Methods/Replication legacy schemas. Prefer extracting only those two current research field definitions into `src/data/research-program-fields.ts` without semantic edits, with compatibility tests, rather than scraping rendered forms. |
| Existing pages | Narrow additions to `replication-program.astro` and `methods-lab.astro` only. Current `ResearchWorkspace` and its keys remain unchanged. No Failure/History form migration or forecast writes/scoring integration. Their existing sources can still be cited through an ordinary public source URL; a richer bridge is deferred. |
| Tests | New `scripts/check-artifact-results.mjs`, `check-artifact-results-store.mjs`, `check-artifact-results-ui.mjs`, excluded `test-fixtures/artifact-results/`. Root build/type/link checker wiring after pure API freeze. |
| Documentation after implementation | New `docs/ARTIFACT_RESULTS.md`, exact R3 acceptance/HANDOFF updates. Do not relabel the whole R3 ticket or original mega list complete from a prototype or passing pure tests. |

Proposed finite limits:100 projects,400 protocols,400 manifests,10 artifacts/manifest and 2,000 retained descriptors globally,400 results,400 comparisons,20 compact packets,5,000 combined immutable history entries,25 rows/page and 256 KiB raw draft. Legacy selection is 1..20 saved records/file; source files max 2 MiB, local hash input max 8 MiB. Raw import review uses assignment0..19, one JSON assignment per≤8,000-char field, so twenty 2,000-char reasons are not forced into one oversized field. Complete future pretty backup including wrapper/checksum/24char timestamp≤ 2 MiB; checksum intentionally includes exportedAt. Per-field/count limits do not override byte admission. No truncation/history pruning.

CSV exports carry stable IDs, exact version/hash references, provenance kind, missingness and source/reference fields. Neutralize formula-leading text before quoting; the generic `files.ts::csvCell` alone is not enough. JSON is lossless; Markdown uses the established escaping rules. Compact packet descriptors do not embed previous packets or promise reconstruction of an earlier state after edits; a complete downloaded JSON is the actual archive. No export says files, external sources or calculations were independently verified.

Packet selection is sorted unique project IDs, independent of checkbox order. Selected CSV/Markdown/hash cover only that project closure, but packet JSON is explicitly a full-workspace backup including unselected projects and saved raw draft. Show that privacy warning before download. A descriptor cannot prove unchanged unselected work or reconstruct an earlier full workspace; keep the actual downloaded JSON. Preview hashes bind file/selected rows/state; prepared command hashes separately bind reviewed assignments.

## Acceptance and sequencing

1. Freeze schemas/import rules for Methods and Replication only and capture actual legacy fixtures without personal data. Implement pure graph/typed comparison/strict bridge first, then guarded store, then the two program mounts and exports. Keep all human-work datasets empty in production. The public reference catalog can contain only existing actual source entries, labeled with their current draft status.
2. Actual-module tests: immutable source capture; amendment/source drift; exact manifest/result supersession; malformed/unknown/prototype keys; unsafe or credential URLs; mismatched hashes/refs; duplicate import replay; stale state and async input mutation; explicit zero versus unknown; null finding versus unavailable; incompatible comparison refusal; no pooling or automatic replication verdict; formula-safe CSV with lossless JSON.
3. Store/UI tests: two-tab lock contenders; memory newer than disk; unchanged-key retry; corrupt/read-denied storage; exact 2 MiB round trip and one-byte refusal before assignment; invalid raw forms preserved; dirty file/group edits not relabeled saved; changed protocol/manifest does not retarget a restored result draft; late/timeout file reads cannot overwrite newer forms. Legacy and R2 keys remain byte-identical throughout.
4. Actual browser: create a clearly synthetic protocol, hash a known small synthetic file, record explicit zero plus a not-observed result, inspect deviations/side-by-side comparison, provoke an incompatible comparison and a stale tab, download complete JSON/CSV/Markdown, restore the JSON in the other mounted program and compare hashes. Check keyboard and 390-pixel layout. Record exact downloaded bytes and distinguish mock/controller tests from browser proof.
5. Only then call the **bounded local R3 artifact/result workflow** implemented. External registration, real research execution, public dataset licensing, independent source checks, human review and public result acceptance remain separate work.

Recommend this smaller R3 slice first: it adds a complete local workflow without requiring a public research operator. R4 can then ship independently using its genuine editorial-correction seed; it must not wait for a nonexistent empirical result. Agree only a future untrusted bridge now: export a PR-ready `research-result-proposal` descriptor with local result/protocol/manifest IDs/hashes, declared sources, type and limitations; no reviewer, accepted status, public receipt or problem-state authority. R4 must validate/review any actual submitted public artifacts independently and assign its own stable public IDs. Local IDs and hashes are provenance, never public evidence qualification by themselves. Do not add automatic publication, runtime GitHub calls or an R4 import gate in this first R3 slice. Failure/History structured response trails belong with R4 rather than expanding this build.
