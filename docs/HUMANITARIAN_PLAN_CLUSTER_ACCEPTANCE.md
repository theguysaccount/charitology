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
