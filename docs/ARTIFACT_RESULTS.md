# Artifact and results register

Implementation and acceptance record · October 27, 2026 · review: draft · AI-assisted

The R3 register connects an exact local plan to artifact descriptions, a dated self-recorded result and a descriptive comparison. Methods Lab and the Replication Program open the same register on one browser origin. The [plan](ARTIFACT_RESULTS_PLAN.md) and [exact interfaces](ARTIFACT_RESULTS_INTERFACES.md) were committed before implementation; later draft-capacity clarifications are recorded explicitly.

The bounded local workflow is implemented. Exact runtime CI and controlled Chrome checks passed; publication and the native-file acceptance gap are recorded below. It supplies software for recording research work, not an executed study, independent registration, verified artifact, peer review or a public research result. Production starts with no projects or results.

## Follow a plan through to its record

1. **Create or capture a protocol.** Use the frozen Methods or Replication fields, or deliberately choose an existing research-desk JSON export and select saved records. The unfinished source draft is excluded. Inspect the complete preview before importing. Original field definitions, values and source metadata remain available in the snapshot.
2. **Amend explicitly.** Each project points to its latest protocol. A changed protocol requires the exact current version/hash and a reason; earlier outputs stay historical. An identical current native freeze changes nothing. Returning to an ancestor's assumptions creates a new latest amendment, while reimporting an already captured source identity changes nothing and never moves the project backward.
3. **Freeze an artifact manifest.** Describe code, data, environment, analysis, output or report artifacts; retain access/license unknowns and inspection instructions. Select a local file to record its SHA-256 and byte length. File contents stay on the device and are not stored, uploaded, downloaded from a supplied URL or executed by the register. A declared checksum remains distinct from self-recorded local-byte provenance; neither proves that research ran or is correct.
4. **Record the later result.** Bind it to the exact current protocol and manifest. Keep the original estimate, later estimate, source references, deviations, limitations and conflicts. Observed, reported-null, inconclusive, stopped and not-observed remain distinct. A known observation day is separate from the local entry timestamp. Later-result sources cannot be satisfied by an original-study reference alone.
5. **Compare with stated limits.** View original and later estimates side by side. An optional arithmetic difference requires a comparability statement and matching known units, measures, populations and time horizons. Missing values and overflow block the difference. There is no currency conversion, interval subtraction, pooling, significance test or automatic successful-replication verdict.
6. **Keep an exit copy.** Export full JSON for recovery, or selected-project CSV and Markdown for inspection. Restore through a validated preview and explicit replacement. Keep original files separately: a descriptor or checksum cannot recreate them.

All labels, knowledge-of-results statements, dates, registrations and conflicts are user-entered. No saved label supplies a reviewer identity, trustworthy clock, external receipt or public evidence qualification. Methods scenario assumptions remain assumptions after being captured.

## Exact source and history boundaries

The original Methods and Replication desks retain their storage keys and behavior. The new register never reads or writes those keys, the study-register key or OS data. Its import bridge reads only a deliberately selected JSON file. Frozen adapters preserve both original 17-field configurations, including labels, hints, groups, required rules, options and numeric bounds. Known v1 adapters remain retained when future versions are added.

Import identity covers program, legacy record ID and exact field/schema snapshot. Filename, original timestamp, unselected records and unfinished source draft do not create a second protocol. The actual chosen-file hash and original/normalized timestamp representations remain provenance. A changed snapshot of an already imported source record requires an explicit amendment target and reason. The register neither guesses version order from source times nor silently creates another project for the changed record.

Manifest versions bind a protocol; result chains bind a protocol and manifest; comparison chains bind a result. Commands require the current write basis. History remains inspectable, but inspecting an old node cannot retarget a new write or make older results current. Immutable entries and chained hashes describe the local graph; they are not a tamper-proof or independently certified public ledger.

Unknown numbers use null, while an entered zero remains zero. Not observed cannot supply reported numeric results. A reported null is an entered interpretation with a later-result source, not a value automatically set to zero. Denominators remain separate from estimates and must be nonnegative safe integers. Intervals preserve missing endpoints and confidence level unknowns.

## Storage, drafts and recovery

The final key and exclusive Web Lock name are **`charitology.artifact-results.v1`**. Writes require secure hashing and Web Locks. The adapter separately tracks the in-memory state hash and exact observed saved bytes; another tab cannot silently replace newer cooperating work. Unsupported capability is read-only, with no optimistic fallback writer.

A failed write retains its valid newer candidate in memory with an unsaved warning. Retry persists that same candidate against the unchanged saved bytes, without repeating the operation or adding history. Corrupt/oversized saved text stays protected and downloadable when readable. A read failure reports raw bytes unavailable; it never substitutes an empty protected copy.

Restore, clear and undo are guarded whole-state replacements. Preview identity, memory generation/hash and exact disk bytes are rechecked. A previously unseen foreign write discovered before a preview first blocks and asks for another explicit recovery review. Reload requires deliberate discard and clears old undo/file-preview authority. These operations affect only the new key.

Raw forms preserve invalid unfinished strings and exact protocol/manifest/result bindings. They do not become canonical research records until validated submission. An unrelated command or no-op does not erase the saved raw form. Reopened drafts cannot silently attach to a changed current version. Delayed file reads and hashes lose authority when the form, selection or saved state changes.

The raw draft limit is 512 KiB, with at most forty fields and 16,384 characters per raw field. Canonical legacy field limits remain 8,000. The larger raw allowance covers escaped descriptor/reference JSON and multibyte protocol prose; the whole two-MiB backup cap still applies. If a raw form cannot fit beside the workspace, a separate plain raw-form recovery download retains its text and is visibly **not a valid workspace backup**. Nothing is truncated to make room.

Browser storage and downloaded files are not encrypted by this feature. Avoid participant, beneficiary or sensitive case details. Review filenames, source references and notes before sharing.

## Export scope and checksums

The full backup envelope is:

```text
{format:"charitology-artifact-results", version:1, exportedAt, state, checksum}
```

Its SHA-256 covers canonical format/version/exportedAt/state data. Unlike the study register's separate format, this checksum includes the export timestamp. Restore validates the exact envelope, checksum, limits, known adapters and graph/history bindings. A checksum detects changed bytes; it cannot verify what a source reports or who made an entry.

**Packet JSON contains the entire private register**, including unselected projects and saved raw form fields. The UI warns before download. Selected CSV, Markdown and descriptor hash cover only the sorted selected-project closure. That descriptor does not pin unselected work, contain an earlier full workspace or reconstruct one after edits. Keep the actual complete JSON download for that snapshot. This is not a project-only JSON export or public submission.

CSV preserves stable IDs, versions, sources, missingness and bindings; formula-leading user text is neutralized before quoting. JSON retains original strings. Markdown separates assumptions, artifacts, estimates, conflicts and entered interpretations. No export claims independent verification or completed execution.

## Bounds

| Resource | Limit |
| --- | --- |
| Projects | 100 |
| Protocols, manifests, results, comparisons | 400 of each |
| Artifact descriptors | 10 per manifest; 2,000 retained across versions |
| Packet descriptors | 20 |
| Combined immutable history | 5,000 entries |
| Visible rows | 25 per page |
| Chosen legacy JSON | 2 MiB; 200 saved records; select at most 20 |
| Local file checksum input | 8 MiB, one file at a time; bytes never stored |
| Complete future pretty JSON backup | 2,097,152 UTF-8 bytes, including checksum, timestamp and draft |
| Raw draft | 524,288 canonical UTF-8 bytes; forty fields; 16,384 characters each |

Every mutation checks the complete future export before assigning a candidate. Count limits do not override that byte ceiling. A browser can exhaust its shared quota earlier; the recovery behavior above still applies. Unknown fields, unsafe object keys, invalid URLs/dates, nonfinite numbers, scalar coercion, edited hashes and broken references fail explicitly.

## Acceptance record

All automated examples are synthetic. They cannot establish actual research, independent review or organization adoption.

| Area | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Pure model and file bridge | Final aggregate rerun: 31 actual-module groups pass, including lineage, current/history, exact import replay/amendments, async guards, numeric missingness, overflow, Unicode/escaped raw forms and exact two-MiB export. | [Exact runtime CI](https://github.com/theguysaccount/charitology/actions/runs/40470749883) passed for `dee0342b72422640597b3619707a5e8e1cc0dc6f`. |
| Local persistence | Final aggregate and independent reruns: 20 actual-model storage groups pass, including contenders, separate memory/disk, recovery, byte admission and read failures. | Controlled stale-tab, clear/undo and reload passed; actual downloaded-file restore remains pending. |
| Existing-field compatibility | Source checks and actual built configurations match the captured two 17-field legacy forms and pinned normalized adapter hashes. Full build: 447 pages; strict actual-module and inline-script TypeScript: zero diagnostics. | [Exact runtime CI](https://github.com/theguysaccount/charitology/actions/runs/40470749883) passed for `dee0342b72422640597b3619707a5e8e1cc0dc6f`. |
| Interface | 24 helper and actual mounted-controller groups pass for structured controls, raw repair, import/file guards, focus and recovery. | Controlled Chrome journey and both 390-pixel theme views passed; broader accessibility and adoption remain open. |
| Browser downloads and usability | Synthetic selected legacy-file import, amendment, actual local file hash, historical unknown → current zero, comparison refusal/correction, both mounts, stale-tab, clear/undo/reload, native Tab and 390-pixel light/dark checks passed. | Actual file-save bytes and restore from that download remain pending: the documented download wait timed out, and native Chrome reported the Mac locked. No saved file or successful restore is claimed. |
| Publication | Exact runtime CI passed, including 447 pages, 25,991 links/assets with none broken, 244 OS + 69 actual OS PostgreSQL checks and 75 mail + 9 actual mail PostgreSQL checks. | Merge, Pages publication and live checks pending. |

The core Chrome journey used runtime `0bcb41ed5275bcc429ec2ba73d1b6289a484390b`; the visual repair and final theme checks used `dee0342b72422640597b3619707a5e8e1cc0dc6f` with unchanged model/controller. The chosen source was a synthesized valid Methods export with two fictional saved records and an ignored unfinished draft, not an export saved through the older UI. A real chosen three-byte `abc` file produced SHA-256 `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`. The first result remained historical and not observed; later superseding results retained an explicit zero estimate and zero denominator with unknown bounds. An incompatible-unit difference was refused without discarding text; a corrected result with compatible fields produced difference zero.

Both program mounts read the same register. A stale tab preserved its unsaved interpretation while disabling writes; explicit clear/undo and native reload retained saved raw text and exact bindings. Actual narrow-frame document and scroll widths were both 390 in light and dark. A fixed-light-surface contrast defect found during that pass was repaired with site theme tokens, followed by a 4.5:1 automated palette regression and actual visual retest. One native Tab flow passed; no comprehensive accessibility audit is claimed. Application-origin warnings/errors were absent; unrelated installed-extension warnings were excluded.

Actual browser-downloaded JSON/CSV/Markdown bytes and restore from the saved JSON are **not yet verified**. A requested download is not a saved-file proof. Model/store/controller checks cover export contents, hashes, scope and preview/restore, but do not substitute for that native-file step. No database, authentication or provider call was needed by this fixture.

Use `npm run check:artifact-results` after a build. It invokes the model/import, store, mounted-controller, actual-adapter and strict TypeScript checks. The full site check includes both this workflow and the previously published study register. Shared OS and newsletter suites remain separate and must stay green.

Real study execution, data licensing, independent registration/source review, ethics and participant safeguards, authenticated collaboration, public results and scientific interpretation remain human work. The R4 public research ledger is separate; no local result or hash can automatically change a public problem or review status. No named-charity rating is produced.
