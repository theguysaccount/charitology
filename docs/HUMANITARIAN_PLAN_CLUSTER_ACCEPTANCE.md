# One Education plan-cluster observation

This extension adds a fixed source path for the Education cluster in Afghanistan's 2024 humanitarian plan: plan `1185`, code `HAFG24`, cluster `7415`. It does not estimate all education funding, all national need or the depth of charity. The cause association remains a draft interpretation.

The source adapter preserves the original CSV row, including blank fields, signed adjustments, original numeric text and the publisher's percentage. A separately computed funding-to-requirements ratio uses exact arithmetic. Missing values remain unknown; a zero requirement has no defined funding percentage. Requirements minus funding can be negative when reported funding exceeds the plan requirement.

## Source and rights

The fixed dataset, resource and licensing fields are declared in [the source definition](../src/lib/humanitarian-plan-cluster/definition.json). The explicit acquisition command makes at most four HTTPS requests: metadata, the resource redirect, its fixed S3 CSV target and metadata again. It refuses changed descriptors, different licensing, unexpected statuses, encodings, hosts, paths or oversized bodies. It has no fallback, retry, credentials or caller-provided source URL.

Complete metadata wrappers stay in the maintainer's private capture directory. Public source records retain a bounded excerpt of the selected resource and licensing fields, with exact locations and separate hashes. The licensed original CSV is retained separately. A checksum does not independently prove an external retrieval or its clock. Client response completion, HTTP Date, publisher timestamps and the later local assembly time keep their distinct meanings.

## Source before data

Commit the reviewed interpreting code as source A before acquiring the actual inputs. The new method has a separate 26-file source vector; the historical 14-file method remains unchanged. Source A must retain exactly the previous observation inventory. The actual capture binds that inventory, A and all 26 source-file byte hashes.

From the repository, run the explicit acquisition once, using a new private output directory outside the checkout:

```sh
node scripts/acquire-humanitarian-plan-cluster.mjs --source-commit SOURCE_A --out /absolute/private/capture
```

Prepare one private request after the source and retained inputs have been checked. This assigns the actual local assembly time; subsequent review and writing reuse the same request bytes:

```sh
node scripts/append-humanitarian-plan-cluster.mjs --retained-root /absolute/private/capture --source-commit SOURCE_A --previous-commit PREVIOUS_DATA_COMMIT --edition-id EDITION_ID --prepare-request /absolute/private/request.json
node scripts/append-humanitarian-plan-cluster.mjs --retained-root /absolute/private/capture --request /absolute/private/request.json
node scripts/append-humanitarian-plan-cluster.mjs --retained-root /absolute/private/capture --request /absolute/private/request.json --write-reviewed-hash REVIEWED_PROPOSAL_SHA256
```

Review the complete proposal before the final command. The writer requires its own verified preview, a fresh source/input/history check and the exact reviewed hash. It uses the shared exclusive observation lock, adds immutable files and replaces the registry last. Changed cleanup paths are preserved and reported. This is not a multi-file transaction or a guarantee against power loss or hostile concurrent filesystem changes.

The first append retains every previously selected record, country projection, financial panel and immutable file. Any earlier retained plan-cluster append prevents a second first-append operation, even if a later old-method edition no longer selects it. A refresh requires a separately reviewed method extension.

## Public reading and exports

The Gap Map shows the fixed observation with its scope, original row, missingness, provenance and source links. The Cause Atlas links to it; the Depth Census explains why the financial observation does not classify depth. Country-only views retain their earlier country-selection capture time.

Selected JSON and CSV downloads are edition-specific. CSV text fields use a disclosed, reversible formula-protection rule; original numeric strings remain exact. The original licensed CSV is a separate byte-preserving download. Historical editions without this selection do not acquire a new value or selected export.

## Current verification boundary

Private preparation passes 32 generic integration cases, six public projection/export cases, seventeen acquisition/offline-writer cases and one real local 45-second deadline case with mocked HTTPS. Strict declaration checks and six installed Astro component transforms pass. The existing one-edition corpus also passed a 608-page build with the optional new view empty. These checks use fictional source inputs and disposable Git fixtures where stated; they do not prove a real new capture, source rights review by a person, browser downloads or publication.

The first generic append implementation admitted a fully rehashed history that dropped earlier selected records. A later version also allowed a second append after an old-method refresh. Preserved counterexamples fail those predecessors; the current selected-closure and retained-history guards refuse them. Acquisition repair checks cover partial lock writes, post-link faults, failed registry activation, changed stage contents, failed evidence persistence and incomplete cleanup. The command-line test also runs with ordinary Node from a disposable installed checkout, without a private test hook.

## First actual capture and append

Reviewed source A is `566433a4d9c62c4746fd2e7b82d9f7342af2bd7c`, following main `a720637`. Its actual installed focused check passes all 81 cases and strict declarations. Before capture, all 26 committed source files and the unchanged prior inventory passed source qualification. The full Git-history gate correctly refused the transitional code-only state because a new explicitly captured method edition was still required; that refusal was retained.

The explicit capture completed once with four actual HTTPS responses in order: 200, 302, 200 and 200. Both 166,979-byte metadata bodies are byte-identical, SHA-256 `22d14076944929e6658354590d70b6abf74fae5ae0061eb28aa1174158058a6e`. The CSV is 1,031,653 bytes, SHA-256 `7d4332b7c9412fb57550309bb603cde0bf6265282d56a8b6337983744b0ef0f0`. All request/response/socket completion and owned stage cleanup checks succeeded. Client completion timestamps around `2026-11-08T22:58Z` and the servers' HTTP Date around `19:58Z` remain separate recorded clock claims; neither is silently corrected or promoted to a trusted external timestamp.

The retained request assigns local assembly time `2026-11-08T22:59:30.687Z`. Offline review and writing reuse those exact request bytes and proposal hash `05fe00a73770ded64155e9696897211511b4c4d2ef3c0fbca8567ee8619deae1`. The reviewed writer completed once with cleanup successful. This is filesystem activation, not a claim that Git, deployment or browser checks have completed.

The appended draft edition is `observations-2026-11-08-education-plan`, sequence 2, hash `4d30064c6faadee5a258c489a92be8847c7d2b92e5a01d8d9eccc7c8bcb6119a`. All 1,560 earlier immutable non-registry files and every one of the 1,540 prior selected record pins remain exact, along with the country projection and financial comparison. There are now 1,572 retained files and 1,548 records across two editions.

The fixed CSV row is record 29, byte range 3,952–4,087 (end exclusive), SHA-256 `8bd4d88b7fc68066ed69ef40e77a49eb7b5ed2d8bc206d88063ed66230b2ef10`. It reports requirements of USD 140,022,000, funding of USD 79,460,644 and the original percentage `57`. The separately computed exact ratio is `19865161/35005500`, displayed as 56.75%; requirements minus funding is USD 60,561,356. These are historical plan values, not current national education need or an assessment of a named charity.

The selected JSON export is 40,922 bytes, SHA-256 `4635c810ccb555fb7a1273d46a810c51f3c01bf52f8bc164de93da266a1dea33`; the selected CSV is 2,180 bytes, SHA-256 `8231589d47936f0bc7a4df4db407fc3319422f053804789b21d064919f4e4eb4`. New records remain draft; no independent human method or rights review is claimed.

## Committed data and first build

Data B is `5a6587e3bad3ef865ade6184858aaac17220ec47`, immediately after source A. The actual committed append-only check from main `a720637` to B passes, including all 1,560 previous immutable non-registry files and both editions' genuine source baselines. No CI environment or commit identity was substituted for that local check.

The normal build on B passes all 611 pages. Both selected download bodies match their reviewed hashes and byte counts above. The 209,552-byte country API and 180,335-byte humanitarian financial-reference API remain byte-identical to the earlier local build: hashes `25eab195fb4bb595696bdda5e74a1f5206a365f34244936d5d8c4130ad42ee0e` and `300edddf002844fb810a6c924f82115a42bcd1c86f40e95b859c492138c39884`. The new plan-cluster API is a separate 43,641-byte response.

The first full repository check stopped in an existing private-form test helper. It injected the same `../../lib/site` import into three differently located components; the new Depth Census reference link exposed that component's shallower path. The helper now compiles each isolated fragment with its actual frontmatter `url` import. All 47 actual-SSR/compiled-script private-form groups pass after the test-only correction. The first failure is retained; no business logic, source vector or captured input changed. A complete repository check, actual browser downloads, CI and publication remain pending.

## Later local verification and retained limits

A separate Python standard-library audit reads the actual retained CSV and metadata, rather than using the Education helpers as its parser or arithmetic oracle. It confirms the original twelve strings in the single selected row, its byte span and hash, the exact ratio and difference, the resource/license fields and eleven quoted JSON paths. It also compares committed history: all 1,560 previous immutable files, 1,540 selected record pins, country projection and legacy comparison remain exact. Both built selected exports match their recorded bodies. This is an AI-assisted saved-byte comparison, not independent certification of the earlier authored method, financial completeness, external clock truth or human rights review.

Later test-only corrections preserve earlier failed runs. API discovery now checks all forty source declarations and the optional Education envelope. The observation build check retains October 27 for the unchanged country API while the full observations and coverage APIs retain November 8. JSON licensing excerpts have their own private-wrapper and clock-limit wording; other external financial documents retain their audit disclaimer. The Disaster fixture adds only existing fictional predecessor observations so its real availability callback can read the mandatory registry. Its old endpoint comparison permits exactly two declared property changes: the country capture selector and the coverage description. All other fields and response content remain exact. The old 39-versus-40 declaration-count failure, the first narrow comparison's coverage-description failure and the later wrapper-description failure are retained, followed by corrected focused results.

Local focused checks pass: 47 private-form groups, seven publication-build groups, five existing funding-build groups, six Education-build groups and nine observation-build groups. The latter traverse 217 country routes, 26 source-version pages and 1,589 exact artifacts. The corrected Disaster checks pass eight public/API groups, fourteen UI groups and twelve built-output groups. Program-record recovery, remaining-record recovery and directory checks also pass. Eight remaining stages complete successfully: model bundles, fundraising, charity start, website pilot, existing humanitarian funding, Education plan-cluster, output-cost planner and gift estimate. These are staged local runs across the preserved test-only corrections; they are not a claim that one final whole `npm run check` or final CI run has passed. The interpreting source A, actual captured inputs and data B remain unchanged.

The actual local in-app browser reading used a 390 × 844 viewport with no page overflow. It showed the amounts, separate source percentage, scope and clock labels, and moved keyboard focus from Selected JSON to Selected CSV with visible focus. This is browser reading and focus evidence. Two in-app download mechanisms each timed out after fifteen seconds without returning a completed file path; a native Save was not established. Native Chrome access was initially blocked by the locked Mac; a later attempted new-tab action aborted before dispatch. The task-created in-app and blank fallback tabs were closed, the temporary viewport reset and the owned preview stopped. No existing user tab was navigated or closed. Print/PDF work was not repeated.

Final whole-source CI, hosting/publication and native saved-file verification remain open at this checkpoint. No source capture or append was repeated to repair the test harness. The original broader Social Weather scope and operating gates remain open; this single plan-cluster snapshot does not complete them.

## Finite public release

[PR #57](https://github.com/theguysaccount/charitology/pull/57) merged normally as main `372994196cab200f14604cb869b52f7378fe6d25`, retaining the complete tested `0a2dc057f59d6ec2eb2da448dac06618ebdb6b1c` tree `2fd04ca858b8e50cd8df957a88292ed25dab4666`. All eight final-source push/PR CI jobs pass on attempt 1. All five [main deployment jobs](https://github.com/theguysaccount/charitology/actions/runs/42525818511) also pass on attempt 1. These later results leave each earlier failed check and staged local result above as its own historical checkpoint.

The actual Pages artifact is `13634769432`: its 86,465,188-byte ZIP has SHA-256 `a0234726bff07604cfc9db1b14219f03fec1344c958a94adee784558f6533960`. Its inspected inventory contains 3,827 regular files, including 611 HTML pages, totaling 233,088,333 bytes. One bounded, unsigned public comparison passes all 23 selected GETs on the first pass: 24,911,465 complete response-body bytes match the actual artifact. The selection includes the Gap Map, Cause Atlas and Depth Census; the API index and five selected APIs; the observation register, complete history JSON and selected edition view; the selected JSON/CSV exports; and the retained edition, coverage, source and evidence files. This compares the selected responses, not all 3,827 artifact files or the complete runtime dependency graph.

The country and existing financial-reference API bodies retain the exact hashes recorded above. Both new selected exports retain their reviewed byte counts and hashes. The public comparison retains each selected body and allowed response-header record; it uses no cookies, app session, redirects or automatic retry. A separate AI-assisted offline audit streams the ZIP and TAR, checks all 3,827 artifact file hashes and rehashes the 23 saved body/header pairs and both actual Downloads files against the four old/new anchors. That audit makes no new HTTP or browser action and provides no independent visual or human-review claim. Source A's 26 files, the original capture, data B and the original immutable history remain unchanged. No capture or append was repeated for publication.

Later actual native Chrome actions followed both public selected-export links and displayed both Save panels. The resulting Downloads files are 40,922 bytes for JSON and 2,180 bytes for CSV, with the exact SHA-256 hashes above. Cosmetic filename corrections preserved only the verified task-owned inodes and file bytes. Concurrent focus interruptions prevent attribution of an exact native Save click; the verified result is completed saved files with matching bytes. The earlier in-app timeouts, locked-browser and focus failures, and filename-entry errors remain retained. The task-created native tab was subsequently confirmed closed, the earlier task tabs and preview remain closed, and existing user tabs were preserved. Print/PDF work was not repeated.

These results complete the finite publication and saved-export checks for this one historical plan-cluster observation. They do not provide independent human method or rights review, external clock proof, complete reported-funding coverage, national education need, a causal-impact or named-charity rating, or a depth allocation. The records and cause association remain draft. The original 66-item brief, twenty-two software IDs, eight conditional decisions and broader Social Weather/OS acceptance remain open as applicable.
