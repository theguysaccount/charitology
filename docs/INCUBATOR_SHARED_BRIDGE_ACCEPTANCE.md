# Incubator shared planning bridge acceptance

Review: draft. This records a bounded local implementation and its automated checks. It does not establish production publication, a real charity pilot, independent human review or completion of the full mega list.

## Source and behavior

The [finite contract](INCUBATOR_SHARED_BRIDGE_PLAN.md) supports one existing native producer: `/programs/charity-incubator/`, key `charitology.partner-workspace-v1.charity-incubator`, native version 1. It selects one saved project ID and one saved milestone ID. Equal titles and the milestone’s free-text project reference do not establish a relationship. The user must deliberately confirm the relationship and author a reason.

Pure admission/compiler commits `9a8b88fd0816c13af8336e5d8f1559ebddbe8c30` and `437d95d96d87b113f06356b2bd46d5739c1581dc` precede backend commit `22ee003be9c6cd8adf2b9346febcb8d347ab537e` and frontend commit `07a306a7ed51692395294946a8a60fc7bdd3a9f4`. The frontend uses the checked `incubator-native-admission.js` exports, including the exact `incubatorHash('program-data', data)` implementation. It introduces no alternate native decoder or program canonicalizer. Incubator registry version 1 is pinned to `9f7b99ebf552b116e33d8dda78bb463bb4dfd09da9da5cec2fa888fc690ff4bc`.

The shared OS pane at `#incubator` requires current staff access to Programs read and Projects read/write, with server-enforced scope. Loading programs and histories, inspecting a file, previewing and committing each require an explicit action. The constructor reads no native browser storage and sends no requests.

Before transmission, the user sees that the **complete original file** goes to the server for transient validation. Successful inspection retains only the selected project, milestone and all five context fields for authorized program staff. Unselected rows are excluded from history and backups. Temporary chunks are removed after successful inspection or expire; an interrupted or refused request is not a promise of immediate deletion. The transport sends no filename or browser file path.

Each accepted copy creates exactly two ordinary editable planned records, with fresh IDs and the milestone linked to the new project. The outgoing review shows the exact selected source, current program pin, authored mapping, fixed candidate IDs and every normalized target field. Source strings stay separate from ordinary text normalization. Blank or unknown facts stay blank or null. Local status, dates, owner prose and consent do not become account authority or approval. Later ordinary approval can make authored target fields visible through the normal record APIs.

Refresh-copy requires an explicitly read current live head, the same two saved IDs, a current program pin and complete-file admission. A changed whole-file hash may leave selected text unchanged; the pane says so and still requires review of two additional planned records. An already captured identical file offers no extra pair. Separate duplicate copying requires an explicit acknowledgment and a new inspection. Matching live histories are readable from the warning.

Administrator adoption uses an explicitly read inactive historical head, a deliberately selected current program and fresh authored mapping. Its review says “Historical retained selection; original full file not present.” It creates a new live binding and pair without pretending to have revalidated a discarded complete file. It revives no imported account, receipt, approval or command authority.

## File, command and lifecycle boundaries

The checked codec admits the whole file before any row choice, including unselected rows. File reading, server responses and outgoing reviews are bound to the current pane generation. A new, cancelled, empty or failed chooser interaction invalidates old inspection/review authority while preserving literal writing and the previously admitted file. A different valid file clears authored mapping only after a deliberate discard confirmation. The actual file control is cleared before opening, permitting a same-path retry.

An interrupted or malformed commit response leaves one exact command in page memory. Retry uses the same preview ID, review hash and UUIDv4 key. A later 429 or definitive refusal does not unlock a fresh command after an uncertain result. There is no automatic retry, background synchronization or storage-based command replay. Authorized history can be opened separately for reconciliation. A verified accepted result remains visible if the shell’s subsequent navigation refresh fails.

The server enforces preview expiry and current authority. The pane displays the returned server expiry; it does not compare that authority with the known-skewed local wall clock. Current errors focus the connected pane status. Detached, moved, revoked or disposed views cannot steal focus or repopulate private content from a late response. Pagehide/disposal clears visible private source, writing and command authority; browser history cannot revive it automatically. This is a user-visible lifecycle boundary, not a claim of forensic memory erasure.

## Local checks observed

Using Node `v24.22.1`, the integrated service source containing merge `ae93c39abd2d94fd47b9827323049cbe03cf0d59` plus the narrow cleanup-order correction passed the complete `services/charity-os` **790-test** suite. This is unit, mounted DOM, pure-model and mocked-transport coverage, not authenticated browser or actual PostgreSQL evidence.

Twenty new mounted/transport groups exercise exact native/ProgramPin admission, literal versus normalized review, author edits, cancelled/empty/failed/same-path choices, superseded file reads, deliberate source switching, selected unsupported text, refresh with an unselected-only change, historical adoption without upload, malformed response refusal, imported-owner/program mismatch, known success preservation, response loss followed by 429/409 and exact Retry, cancelled navigation, pagehide, error focus, unbound-form fallback prevention and transport limits. The 8,000,000-byte transport case reconstructs every original byte from six bounded parts and checks the pointer checksum. The +1-byte refusal and abort-between-parts case send no unsupported inspection.

The focused set also passed 95 groups spanning these new checks and existing API, Learning, checked native and pure Incubator compiler tests. The native tests exercise the actual existing native exporter and strict codec. They are distinct from an actual browser chooser or HTTP/SQL workflow.

Both explicit deterministic checks passed without regenerating files:

- `node scripts/build-learning-native.mjs --check`: 254,934 bytes, 14 actual source/dependency files.
- `node scripts/build-incubator-native.mjs --check`: 209,641 bytes, 10 actual source/dependency files.

Normal OS CI already invokes the new freshness check: `.github/workflows/charity-os-check.yml` runs `npm test`, whose `test/*.test.mjs` glob includes the Incubator native test. That test invokes the current Node executable with `scripts/build-incubator-native.mjs --check` and requires exit zero. The service test command checks the frozen Learning build first. No freshness assertion was removed or relaxed.

The first complete integrated service run had 789 passes and one failure: the recurrence lifecycle test requires `setContent` to dispose the existing recurrence panel first. The forward correction moved only the added Incubator cleanup below that existing first statement. The assertion stayed unchanged; the subsequent complete suite passed all 790 groups. This history is retained rather than described as one uninterrupted successful run.

## Actual isolated PostgreSQL checks

The backend owner separately reports 536 server-unit tests and nine actual guarded PostgreSQL journeys at its complete predecessor checkpoint. A later narrow expiry correction passes eight affected unit checks and all ten actual PostgreSQL journeys, including a nearly expired inspection followed by a fresh preview with exactly matching server SQL expiry, plus refusal of an older expired preview. These are distinct checkpoints, not a claimed repeat of all 536 checks after the correction. The complete integrated 790-test run above includes the final backend source.

The constrained-role database cases cover source and program/member authority, exact durable receipts under retries and later ordinary edits, actor races, history/source/version bounds, mixed interval/Learning/Incubator capacity and actual full native backup → inactive SQL restore → re-export. They use fictional records in random owned schemas on a guarded local PostgreSQL 17 cluster. All owned test schemas were removed in finally and pools/processes settled. They establish neither hosted authentication nor a real charity outcome. The backend sealed receipt has SHA-256 `cc9ce2be81fa88233acd046d5b7260a3601107e69987810434f640d4db0c8a2e`; its 21-file source vector is `532e936312992aaf5b73f2935b272b9486039136e7aabee91bc27dda8534897c`.

## Separate acceptance still required

The backend results above remain separate from UI testing; UI tests do not supply SQL or hosted authentication proof. Controlled actual browser work must still cover the real chooser, outgoing review, ordinary editors, refresh, response-loss Retry, recovery, keyboard and narrow light/dark layouts. Final integrated repository checks, exact-head CI, staged service identity, hosted byte checks and production/schema publication must be recorded before a release claim.

No provider, email, payment, account-grant or production migration operation was performed by these frontend checks. No real charity adoption or independent approval is inferred from fictional fixtures. This slice implements one additional deliberate native-to-shared planning adapter; it does not close every remaining bridge, operating program or original mega-list requirement.

AI assistance authored the frontend and this draft. Root review, real-browser observations and later release evidence remain separately identified.
