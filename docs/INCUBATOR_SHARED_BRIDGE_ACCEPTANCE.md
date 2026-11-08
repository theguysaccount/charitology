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

## November 7 follow-up: guarded backend and actual local browser

This follow-up records later candidate evidence. The preceding 536/9, expiry-only 8/10, integrated 790 and 95-focused checkpoints keep their original scope. Incubator remains an unreleased candidate; the results below do not establish a real charity pilot or complete the original 66-item brief.

### Four reviewed backend corrections

Commit `5d0aaf93b3b51f01686f9dbf975d6fea8fa77d60` closes four findings from root and AI-assisted independent source review:

- An initial pending source inspection independently triggers existing operational and inactive-restore projection, before any durable Incubator history exists. It measures the actual pending payload without reserving unwritten mapping fields or a future pair.
- An optional `backup.exported` journal is omitted when the actual complete packet plus its bounded audit row cannot fit. Existing version 3 participation safety and no-Incubator legacy behavior remain unchanged; no cap or ordinary reserve is relaxed.
- Adoption preview and commit require scope for the historical recovered-source program as well as the current destination program. Knowing denied-source pins cannot disclose that source through a POST.
- Current disposition uses the ordinary current-record scope, including trash. After a copied target moves to another program, an out-of-scope reader receives `unavailable` without its current revision. The immutable original receipt and permitted exact Retry remain intact.

The affected server profile passed **62/62** checks and actual guarded PostgreSQL passed **13/13**, with no skips. These include hidden-source adoption refusal with no writes, allowed/global controls, moved/trash-target reads and accepted Retry, and Learning plus interval plus Incubator inactive restore/re-export. The bounded source reviewer reported the reviewed findings closed; that review executed no tests, database or browser work and supplies no independent human approval. The retained forward receipt has SHA-256 `3a4c0e6fb17a57fcf5deb077d50aac3da304939afe58eff4171111fc3a7bbee2`.

The near-wire export regression is a **closed SQL exporter witness** around the actual handler, same constrained PostgreSQL client/transaction and final hard checks. Only the fixed comment-export query projects a padded fictional body. Pending and durable Incubator cases each return a complete **67,108,863-byte** packet while omitting the optional journal; sufficient-headroom controls retain the actual audit. The unchanged participation-only gate would permit the pressure case. No naturally authored near-64-MiB workspace or stored oversized comment is claimed.

### Corrected real-DOM behavior and final local checks

Browser attempt 1 on `15084492845526061fc0b691530078ee836f17e7` stopped after mounting: the action select contained stringified option objects because an array reached native `replaceChildren` without spreading. No source upload, preview, copy or ordinary edit occurred. Disposal, listener shutdown and helper cleanup completed. Its retained failure receipt has SHA-256 `44003cd5e2d632e803834869ba1f91024e5f9137781d4e91937743366cd98547`.

Forward `9a0065d55896e1d95d583f7b09287744bdf33ef1` changes two spreads: actual option nodes and actual ordinary-record anchors in history. Feature-local tests now model native select admission and array-to-text behavior. The original option negative control and the intermediate choices-only live/recovered-history negative control both remain retained; their receipt hashes are `c5798fac0507be0b28e406852afc8bbb1a08d9ef1b97e7bb2143bdf0098bfd61` and `651a5866e8d5f9d7a69b09249b61b55f377b963c236b9982927881415d31e173`. The earlier 790-test harness did not catch the browser defect.

The corrected source passed **793/793** complete local service checks, including **23 feature groups**, and both native freshness checks: Learning remains 254,934 bytes/14 inputs and Incubator 209,641 bytes/10 inputs. The forward-check receipt has SHA-256 `42075bd39058984fb06b249aebb71d0f6ab12eafbf67bc75057bd89d707ebc66`. These are local automated results; final candidate CI remains separate.

### Actual browser, HTTP and PostgreSQL attempt 2

The corrected source completed the finite actual in-app-browser journey using the actual controller/API transport, actual handler and constrained PostgreSQL. Sign-in was an explicit synthetic session projection with fictional migrated session/member rows. Only the primary fictional organization was exposed; the unchanged initializer's unused empty destination and inert role/session seeds were disclosed. Incidental browser cookies were discarded unread. No real account sign-in or human approval is established.

The log contains **36 local HTTP entries**: 34 responses were 200, one incidental favicon request received an out-of-scope 404, and one response was deliberately lost after a real handler 200/commit. There were 21 actual-handler invocations; static assets and fixture/session checkpoints account for the remaining requests. Fixture failure stayed false and its pre-request error list stayed empty. HTTP proof SHA-256: `bb0e45cc8bd8ff1470c21af68c942a6b2a5ecb6f24d0a452eaff2c53069e8bbc`.

Actual file selection, outgoing review and first copy created two planned records. A separately labeled fixture control then exercised the real ordinary GET/PATCH API and preserved that edited original project through refresh. Same-source inspection offered no additional pair. Declining the changed file kept literal writing and invalidated the local preview; a later same-path selection with explicit discard cleared writing before a newly authored refresh. The final history displayed four actual ordinary-record anchors. Server conflict refusal retains its separate PostgreSQL evidence; this browser log contains no server stale-refusal response.

The refresh transaction committed before its response was dropped. Explicit Retry sent the identical **182-byte request body**, with SHA-256 `1be7f17f031f497272d3c01d919f72632b876b4e5ba6a7e5d7f993700e9262df` and matching command-key digest, and returned `already-committed` with the exact original result. All observed business rows after the drop, after Retry and in the final snapshot were identical. Retry proof SHA-256: `bbee781184aa08930d173f29a5dedd1eef3241297d23a00535c783b0c7509e21`.

Final state was five ordinary records: one draft program and two planned project/milestone pairs. The older edited project remained revision 2; the other three copied records remained revision 1. Approvals and snapshots stayed null. Two native sources and two copy events remained; uploads, jobs, job tenants and participation outbox were zero. Fixture provider/mail counters stayed zero. Final database proof SHA-256: `e4931cb57a12eccc562d979b86591925958d5ee84562a96d715e42486599fbe3`.

Visible facts recorded a **1,280-pixel** viewport with no page overflow, plus visible keyboard link focus in the retained screenshot. Disposal left zero private controls and empty private text, facts and ordinary-edit input. All owned attempt tabs, listeners and launchers closed; the attempt 2 launcher exited 0 and listener requests/sockets reached zero. The helper reported completed schema/pool cleanup, then root independently confirmed through a fresh read-only catalog check that both attempt schemas were absent. The exact owned PostgreSQL cluster was subsequently stopped and its PID file was absent. Launcher proof SHA-256: `79d567cf315a75579fa3adf9ab19247ccc603c2ae07dd53d61edb4c807f7076a`; fresh schema-absence proof: `310457a8cd83da78e79822e8cd5962671618c83e2fd084f4f3d148d3d78c3143`; stopped-cluster proof: `91e80fa83ab6c0ed9392901d10e5a2c4d1940923353d2bd586f96335789d196d`.

This closes the stated local chooser/copy/ordinary-API-edit/refresh/unknown-result Retry journey. Actual 390-pixel light/dark reading, the full application record editor, browser recovery/adoption and hosted authentication were not exercised here. Final integrated repository checks, exact-head CI, compatible stage, additive schema readback and canonical publication remain pending. This Incubator journey added no provider, mail, payment, production migration or real operating-charity outcome.
