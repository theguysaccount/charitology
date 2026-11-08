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

Actual source A, capture, edition B, complete new-source build, immutable Git-history check, browser and publication evidence will be recorded below when completed. No new factual edition or release is claimed by this source-only checkpoint.
