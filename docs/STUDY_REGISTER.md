# Study register

Implementation and acceptance record · October 27, 2026 · review: draft · AI-assisted

The R2 study register implements one browser-local citation-to-screening workflow, shared between the [Evidence Library](https://charitology.org/record/evidence-library/) and [Evidence Reviews](https://charitology.org/programs/evidence-reviews/). A person can freeze a protocol, preview citation imports, reconcile duplicates, record two labeled screening lanes, resolve disagreements, record retrieval and extraction inputs, inspect exact flow counts and export a recoverable workspace.

Runtime `aabda643276d76a11b6e2a5b11f17e82354b2c30` passed [exact-commit CI](https://github.com/theguysaccount/charitology/actions/runs/40463548875), including the final UI fixes. Controlled Chrome acceptance is recorded below. [PR #14](https://github.com/theguysaccount/charitology/pull/14) merged as `975bbbbbd198d4b3c4e1777013d0410588a838b3`; [Pages run 40465324474](https://github.com/theguysaccount/charitology/actions/runs/40465324474) succeeded. The [frozen plan](STUDY_REGISTER_PLAN.md) and [exact interfaces](STUDY_REGISTER_INTERFACES.md) preserve the decisions made before implementation.

The register records user-entered work. It does not conduct searches, retrieve or verify papers, authenticate reviewers, establish independent preregistration, perform statistical synthesis or publish research conclusions. Both reviewer labels can be entered by the same person. A local label, timestamp, checksum, inclusion decision or packet cannot change Charitology's public review or evidence status. No study results or reviewer activity are seeded.

## Use the register

1. **Browse the public bibliography.** Search or filter sources, then deliberately select entries to preview adding. A source can be a homepage, method guide, discussion or report; its classification and design start unknown. Browsing results does not import them or count them as screened studies. The full bibliography remains readable without JavaScript.
2. **Freeze a local protocol.** Enter the question, population, intervention/comparison, outcomes, eligibility rules and planned searches. A frozen version is immutable and content-hashed. Identical content selects the existing protocol rather than creating another apparent registration. Record actual searches separately as unknown or self-reported; a planned query or imported file does not establish that a search occurred.
3. **Preview a citation import.** Use mapped UTF-8 CSV or explicitly selected site citations. Map the title column and any optional metadata, inspect every row and its provenance, then confirm assignments and a reason. One invalid row blocks the whole commit. The software does not silently skip or truncate it. JSON import is the register's complete versioned backup, not an arbitrary citation format.
4. **Reconcile reports.** Inspect DOI, PMID, exact safe-URL or title/year suggestions. Default assignments keep rows separate; grouping, attachment, merge and split require explicit choices. Conflicting nonempty DOI or PMID values block grouping until a deliberate metadata correction resolves them. Multiple reports of one study are not automatically duplicate articles. Original occurrences, earlier metadata revisions and grouping history remain retained.
5. **Screen title/abstract, then the full report.** Each stage has lanes A and B with self-recorded labels. One lane, an undecided outcome or an unresolved disagreement stays pending. Exclusion requires a code and reason. A resolution binds the exact decision pair and records a resolver label and explanation; it does not establish independent review.
6. **Record retrieval and optional extraction.** A title advance is not final inclusion. Record pending, obtained or not retrieved; not retrieved requires a reason. Full-report screening requires the exact current obtained record. Extraction requires current inclusion and can retain comparison, population, outcome, unit, follow-up, estimate/interval, denominator, source reference and bias/limitations. Missing numeric values remain null and explicit zero stays zero. These inputs are not verified empirical findings and are never pooled.
7. **Inspect flow and export.** Choose a protocol to inspect the report counts, pending work and conflicts. Download the full JSON backup, separate CSV tables and a Markdown memo. A compact packet descriptor pins the current research-input hash, protocol and counts. Keep the downloaded full JSON independently if that exact earlier state must be recoverable.

Decisions bind the protocol ID/hash and report revision. Retrieval also binds the exact title-advance basis; extraction binds the exact inclusion. Changing a protocol, metadata revision or relevant decision prevents an old decision, resolution, retrieval or extraction from silently becoming current. Earlier history remains available in the backup.

The existing narrative extraction desk remains separate at `charitology.research-program.evidence-reviews.v1`. This feature does not migrate, prefill or overwrite that workspace. RIS, BibTeX, XML, PDFs, full-text access, network metadata/DOI lookups, unique-study grouping and shared authenticated review are outside this slice.

## What the counts mean

Counts use the selected protocol and current nonempty report revisions, before display filtering or pagination. Retired merge sources retain their IDs and history but are absent from the current canonical-report denominator. The model enforces:

```text
occurrences = collapsedOccurrences + canonicalReports
canonicalReports = titleExcluded + titleAdvanced + titlePending
titleAdvanced = includedReports + fullExcluded + notRetrieved + fullPending
```

Title conflicts are a subset of title pending; full-report conflicts are a subset of full pending. Included reports with extraction cannot exceed included reports. With no selected protocol, the UI asks for a protocol rather than presenting zero as a completed review.

These are **report counts**, not counts of unique studies, participants or sample size. Imported bibliography entries do not become database search results. Missing or unretrieved reports do not become exclusions or evidence of no effect. Searching the UI changes the view, not the denominators. Classification and design remain unknown until a person records them.

## Local storage and recovery

Both views use the final key and Web Lock name **`charitology.study-register.v1`**. The register stays in that browser profile on that origin; another device, profile or origin has a different workspace. There is no OS account, shared organization, private server database, upload, provider call or public write API for these records. Browser storage and downloaded backups are not encrypted by this feature. Avoid importing private case, beneficiary or participant data; unmapped CSV cells are retained in the full backup too.

The dedicated adapter validates the complete graph asynchronously and uses an exclusive Web Lock. It separately tracks the current in-memory state hash and the exact saved bytes it observed. Every save checks both. Another tab's save blocks a stale write rather than replacing it. A foreign write discovered before a restore/clear preview first produces an external-change warning; it is not silently adopted as the replacement baseline.

If a write fails because browser storage is full or unavailable, the valid candidate stays in memory with a visible unsaved warning. Export it or deliberately retry persistence. Retry writes that same candidate against the unchanged saved bytes; it does not replay the command or add another history entry. A storage conflict requires recovery, not an automatic retry over the newer copy.

Corrupt or unreadable saved data blocks ordinary saving. Where possible, the UI retains a validated current/initial in-memory copy for export and offers exact raw saved-byte recovery. That fallback is not presented as a successfully loaded empty saved workspace. If the saved bytes cannot be read, the UI says so rather than inventing a recovered copy. Missing Web Locks or required cryptographic capability makes mutation unavailable; there is no unguarded fallback writer.

Restore and clear require an explicit preview and confirmation bound to the current generation, memory hash and exact saved bytes. A later tab change invalidates the preview. Successful reload clears the unrelated undo snapshot and requires deliberate discard of unsaved work. Undo is one guarded whole-state replacement, not selective removal of historical research events. Clear affects only this register's key; it does not clear the earlier narrative extraction desk or other tools. A failed clear retains an unsaved in-memory result and does not claim that protected saved bytes were removed.

The bounded raw form draft can be included in a full backup without treating invalid form strings as accepted research data. CSV/file previews remain temporary memory and are not saved as whole original files. Raw parsed cells, mapping, source-file hash, physical row references and backlinks are retained; original CSV quoting and line-ending bytes are not. Keep the original file separately when byte-for-byte reproduction matters.

## Exports and integrity

The complete backup has this envelope:

```text
{format:"charitology-study-register", version:1, exportedAt, checksum, workspace}
```

Its checksum covers canonical format/version/workspace data; the export timestamp is separate. Restore validates the entire reference graph, entity hashes, revision and grouping history, current bindings, limits and checksum. The checksum detects changed content. It does not prove source truth, reviewer identity, a trustworthy clock or independent registration.

CSV exports separate reports, occurrences, decisions, exclusions and extractions. They include bindings, revisions, current/superseded context and reasons. Extraction exports distinguish missing numbers from zero. Spreadsheet formula strings are neutralized before quoting; the full JSON preserves original strings. The Markdown memo discloses local labels, incomplete work, absent source verification and no statistical pooling.

At most twenty compact packet descriptors are stored. A descriptor does not embed an earlier full workspace. It can generate a packet only while its research-input hash, protocol and counts match current input. Later edits do not rewrite it or let it recreate missing earlier data. The earlier downloaded complete JSON is the recoverable evidence copy.

## Bounds and implementation

| Bound | Enforced limit |
| --- | --- |
| Retained report identities | 1,000, including retired merge sources |
| Retained source occurrences | 2,000 |
| Import batches, search runs, frozen protocols | 20 of each |
| Combined retained history | 8,000 protocol/report revisions, search runs, grouping actions, decisions, resolutions, retrievals, extractions and packet descriptors |
| Packet descriptors | 20 |
| Visible rows | 25 per page |
| Source CSV | 1,048,576 UTF-8 bytes and 30 columns |
| Complete pretty-printed JSON backup | 2,097,152 UTF-8 bytes, including wrapper, draft and full export timestamp |
| Raw form draft | 65,536 canonical bytes; at most forty bounded string fields |

Fields have additional bounds: title 500 characters, authors 1,000, abstract 8,000, HTTPS source URL 1,200, DOI/PMID text 200 and ordinary notes/reasons 2,000. There are at most twenty tags of eighty characters. Raw cells are bounded at 2,000 characters except a mapped abstract, which permits 8,000. Unknown canonical fields, unsafe/prototype keys, dangling references, edited historical hashes, impossible dates, nonfinite numbers and invalid intervals are rejected.

Every mutation checks the complete future pretty backup before assigning its candidate, including its full timestamp. No pruning or truncation makes room. The exact two-MiB boundary is tested as an export/restore round trip; one byte over is rejected. A browser may still run out of its shared quota below these product bounds, which uses the unsaved recovery path above.

| Responsibility | Source |
| --- | --- |
| Protocols, graph validation, commands, reductions and exports | [study-register-model.ts](../src/lib/client/study-register-model.ts) |
| CSV/catalog preview, mapping, provenance and duplicate suggestions | [study-register-import.ts](../src/lib/client/study-register-import.ts) |
| Exact-byte guarded persistence and recovery | [study-register-store.ts](../src/lib/client/study-register-store.ts) |
| Browser workflow and bounded raw forms | [study-register-ui.ts](../src/lib/client/study-register-ui.ts) and [helpers](../src/lib/client/study-register-ui-helpers.ts) |
| Public bibliography adapter and mount | [study-catalog.ts](../src/lib/study-catalog.ts) and [StudyRegister.astro](../src/components/StudyRegister.astro) |

The source adapter reads structured citations, including journal sources, and retains citing-page backlinks. It explicitly lists citations omitted for invalid or oversized register fields rather than silently shortening them. It does not fetch the linked source or verify its contents. The **31 existing dataset names and dataset count are retained**. The public sources API bibliography/backlinks and journal source metadata have been updated; those public payloads are not byte-for-byte unchanged. No local private register data enters the build or a public API.

## Acceptance record and remaining gates

All automated scenarios use synthetic records and local labels. They do not establish that an actual search, independent review or empirical study occurred.

| Acceptance area | Current evidence | Remaining gate |
| --- | --- | --- |
| Import, provenance and grouping | Model/import checks cover strict UTF-8, malformed/oversized CSV, explicit assignments, identifier conflicts, original-cell replay and merge/split lineage. Actual Chrome passed catalog search/selection/import, an 818-byte six-row CSV file chooser/mapping/preview/commit and explicit merge/split. | No real literature search or source verification occurred. |
| Protocol, screening and supersession | Model checks cover exact bindings and supersession. Chrome froze a fictional protocol shared between both views, resolved title and full-report A/B conflicts, retained a separate pending conflict, excluded a nonstudy source and recorded obtained/not-retrieved states. | Labels and resolutions are self-recorded, without independent reviewer authentication. |
| Numeric missingness and exports | Model checks cover null/zero, intervals, safe CSV, stale packets and the exact two-MiB round trip. Actual downloaded JSON and two CSVs were parsed and compared with model outputs; zero estimate/bounds and null denominator survived restore/reload. | No spreadsheet execution, effect synthesis or empirical result is claimed. |
| Stale writers and recovery | Lock/CAS, corruption, quota failure, retry, undo and guarded replacements pass actual store/controller checks. Real two-tab Chrome blocked a stale dirty form, downloaded its unfinished question, then explicitly reloaded, cleared, restored and reloaded the packet. | Browser undo, corrupt/unsupported-store and quota-failure journeys were not exercised; their evidence is automated. |
| Public catalog integration | All **410 offered citations** passed an exact whole-catalog import without field repair, with classification unknown. Exact-commit CI passed the final 447-page build, 25,987 internal links/assets with none broken and zero strict diagnostics. | This is compatibility evidence, not source verification. |
| Focused automated total | Exact-commit CI passed **23 model/import groups, 16 storage groups and 11 mounted-controller scenarios**, plus catalog and strict checks. Existing OS checks passed 244 unit/browser-model and 69 actual PostgreSQL tests; mail checks passed 75 unit and 9 actual PostgreSQL tests. | Controller scenarios and isolated database fixtures are distinct from browser or production participant evidence. |
| Browser usability | Native keyboard search and Tab from Protocol title to Question passed. A real 390 × 844 same-origin iframe showed wrapped responsive content; the no-JavaScript bibliography is asserted from server-rendered HTML. | No numeric child-overflow measurement, native-device emulation, comprehensive keyboard/screen-reader audit or JavaScript-disabled Chrome run is claimed. |
| Publication | PR #14 merged; exact-main Pages run 40465324474 succeeded. Four public HTTPS checks passed, seven live JS/CSS assets matched the tested build byte-for-byte and actual Chrome showed both views ready with no application-origin warning/errors. | This release introduces no OS/mail deployment, provider change or public research record. |

Run the focused suite with `npm run check:study-register`; it invokes model/import, storage, UI, catalog and type checks. Its local result must be recorded separately from an exact-commit CI or public browser result.

### Controlled browser and downloaded bytes

The actual built runtime ran on a fresh private origin with fictional citations and one unverified public bibliography entry. Seven retained occurrences became seven current reports after an explicit merge and split. Title counts conserved **7 = 1 excluded + 2 advanced + 4 pending**; the advanced partition conserved **2 = 1 included + 0 full exclusions + 1 not retrieved + 0 full pending**. One title conflict remained pending. The included report retained estimate/lower/upper `0` and denominator `null`.

The actual packet download was **37,266 bytes**, file SHA-256 `764ca0f5d0c60615182a047038404101e05148e1da1e6b27213e0586817cc1a3`. Its canonical envelope-content checksum was `dd6fd7063b9536d6b4a44d843e3dd85fcef5b2ef8c1d944d6a1d7dfebdcbe8a5`; a separate Node crypto calculation reproduced it without application hash helpers. Extraction CSV (859 bytes) and occurrence CSV (6,944 bytes) equaled the model outputs exactly. The 27,110-byte stale-tab backup validated and retained the unfinished question without the newer tab's decisions being overwritten. Restoring the packet through the real file chooser and reloading recovered the same protocol and counts.

All six runtime source hashes matched the browser-test baseline. The new register was cleared through reviewed UI controls; three own tabs closed, the temporary server exited successfully and its port was confirmed closed. No provider, database, authentication or production record was used. The old narrative desk appeared unchanged; its storage bytes were not separately inspected in Chrome. No-JavaScript, corruption, quota and other evidence limits in the table remain explicit.

Passing this bounded software workflow does not complete systematic reviews of all interventions, authenticate reviewers, confer a public evidence label or establish a research institution. Actual source checking, a consenting research pilot, independent accessibility/security review, authenticated collaboration and any public research correction or results process remain separate work. No named-charity rating is produced.
