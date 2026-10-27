# Public research ledger plan

Frozen R4 software contract · October 27, 2026 · AI-assisted planning · No runtime implementation or human research review is claimed by this document.

Build one source-controlled public ledger in the existing static Astro site. GitHub remains the contribution and review channel. The same validated, deterministic projection will supply readable timelines, public JSON, downloads and dated progress. No account, OS table, provider, browser storage migration, write API or automatic GitHub polling is needed.

The first release will record a genuine editorial correction and the current covered drafts. It will contain **zero qualifying research results, completed independent reviews, peer-reviewed manuscripts, challenge dispositions or problem resolutions** unless actual qualifying public evidence is separately supplied and inspected. Synthetic success paths belong only in excluded test fixtures. Counts, hashes, merged PRs and local records cannot manufacture scientific work or reviewers.

## Current baseline and real seed

Source inspection used `0bcb41ed5275bcc429ec2ba73d1b6289a484390b`, the R3 runtime commit. At the read on `2026-10-27T07:49:37.000Z`, [PR #14](https://github.com/theguysaccount/charitology/pull/14) was merged as `975bbbbbd198d4b3c4e1777013d0410588a838b3`; [PR #15](https://github.com/theguysaccount/charitology/pull/15) was an open draft with that R3 runtime head. This is a dated source inspection, not a frozen R4 edition or a claim that R3 had completed publication. Implementation must capture its own final public baseline after R3 release.

| Actual source | Initial ledger scope |
| --- | --- |
| `src/content/problems/` | 23 explicitly open problems; all review states default to draft. Capture their definitions and progress criteria, with no invented earlier status history. |
| `src/content/journal/` | Three Volume 0 drafts. The founding poem is an editorial work; the other pieces remain proposed methods. No peer-review records are supplied. |
| `src/content/cases/` | 13 source-derived draft case summaries. Their success/failure/mixed labels do not establish Charitology fieldwork, participation or a charity rating. |
| `src/content/record/methodology.md` | One draft account of project rules, not a validated rating method. |
| Two bounded claim subjects | The Depth Census knowledge-scope paragraph and the founding poem's summary/context. Preserve exact historical before/after wording and its source location. |
| One editorial artifact | The scope/framing correction in [PR #3](https://github.com/theguysaccount/charitology/pull/3), with both changed claim subjects, no fictional challenge and no scientific-result status. |

This proposes **43 stable record IDs**, not 43 studies or 43 events. The 40 current content files total 99,558 raw bytes at the inspected baseline. Versions, archived bytes, events and review records have separate computed counts; the seed's final encoded size must be measured rather than inferred from that raw total.

Read-only GitHub checks confirmed PR #3's merge at `2026-10-26T05:24:43Z`, base `905bdd27bb5f16027c3b3ad3c0f5ee3fc18e3e45`, source head `510320528e89f45caa9c42eb5a6eda3d6ad1bede` and merge commit `3a57d24acc6efd4eb3ae60c59da36ea17c023fb9`. Its review-submission list was empty. [Issue #1](https://github.com/theguysaccount/charitology/issues/1) remained an open invitation with zero comments. These observations cover those objects at that time; they do not establish the absence of every review elsewhere. A PR merge time is factual editorial metadata, never a research finding or independent review date.

| Archived repository file | Before SHA-256 at the PR base | After SHA-256 at its source head |
| --- | --- | --- |
| `src/content/problems/the-depth-census.md` | `722a15f583ff361c70c6758503d12a7464746bd013d8276b9f1b896cf42654c0` | `ebd0d4239ba1e1fabc871238a4436d82e1eacc0401bd61a78cdb2952cd8b7a9e` |
| `src/content/journal/ten-dollars.md` | `1f407ef28ac61ca314088257f038e88df97e2f9910e2edfc1d077a0013c7ab91` | `6fe57d6f550cf879a73c6fd0ba51f4e9e2b75fb3edbc2ee33d124ed335ac5aae` |

The present poem declares October 25 rather than the historical file's October 26; its current hash is `51c37101479c8357fd2d69e9e14483fa31dbd7d8661aa3f4e1fde2b32d0130df`. Preserve the historical correction and a separate current entry version. Do not assert that the current whole manuscript equals the PR's historical bytes. The claim-level wording can remain unchanged while the whole-entry subject changes.

## Relationship to the existing software

- R2 now imports references, screens, retrieves and extracts in a private study register. R3 now binds private local protocols, artifact descriptors and reported results. Neither supplies public review, independent registration or scientific-result authority. This ledger must not read those keys, import their private work automatically or seed their synthetic acceptance records.
- The new ledger is a supporting route, not a 67th original mega-list item. Keep the 26/19/21 catalog and current paths intact. Profiles, nominations, traditions and wider method claims can later be registered through additive adapters; they are outside the initial 40-entry coverage and must be labeled accordingly.
- `progress-report.astro` currently counts mutable problem frontmatter. Its prose describes a review policy but does not enforce a result/review relationship. Replace that factual calculation with the ledger projection for covered problems; preserve current links and explicit coverage limits.
- `ReviewNote.astro` currently turns a generic enum into a checked-by-a-second-person claim. Covered entries must match current-hash qualification. For **uncovered** entries, a `reviewed` frontmatter value must fail a clear build invariant until registered; do not silently present it as ledger-qualified. Uncovered drafts remain ordinary drafts with no ledger verification claim. This additive guard prevents bypass through another collection.
- The manifesto uses its own layout, while ordinary journal/case/problem entries use shared templates. Both manifesto URLs and the generic journal route must resolve to one record, without duplicate counts.

## Authority and exact source capture

Keep three different hashes: raw archived UTF-8 bytes, the substantive subject and the enclosing version/event. Store inert repository Markdown snapshots with pinned commit/path and SHA-256 so shallow/offline CI never needs old Git objects or a network request. Never execute or render a historical snapshot as application code.

Use schema-aware parsed frontmatter and the exact Markdown body for subject capture. The pure capture helper is shared by historical validation and the Astro adapter; it parses bounded YAML rather than trusting a hand-entered subject projection. The repo already locks js-yaml 4.3.2 transitively. Make that exact version a direct dependency before implementation; use its JSON schema with duplicate-key refusal, bounded depth/merges and no custom types, then enforce the documented collection field types. This parser choice needs no provider or new service. Exclude **only** `review` from covered entry frontmatter and `status` from problem frontmatter. All other fields, source references, evidence labels, authors, declared dates and progress criteria remain substantive. Do not remove matching strings from the body, strip arbitrary keys or use regular-expression replacement of source text. Current source bytes are separately pinned even when a compatibility-only review/status edit leaves the subject unchanged. Claim subjects bind exact selected wording/context and source references; a claim review never qualifies its entire parent manuscript.

Reviews bind exact record/version/subject hashes. Problem dispositions have their own reviewed subject: definition/version, proposed status, exact result versions and reason. Review IDs and event envelopes sit outside that subject hash, avoiding a checksum cycle. Derived problem/review compatibility fields must equal the current edition's projection; new substantive versions require new qualification.

Ordinary content needs a second actual human contributor's whole-entry source/framing review. Journal peer-review wording additionally needs two distinct independent human peer-review statements of the exact manuscript, neither its author. A problem disposition needs independently reviewed qualifying research evidence and an exact reviewed decision, with at least two distinct eligible human identities across those reviews and each independent of all relevant authors. The method permits explicitly labeled theoretical results, since some open problems are conceptual; an editorial/software/proposed-method artifact alone cannot change a problem status. See the precise checks below.

CI can check subject hashes, public references, declared scope, identity distinctions, conflict records and a maintainer's recorded inspection. It cannot establish human identity, real independence, truth or source reading from a JSON flag, a GitHub account type, AI output or green checks. Maintainers must inspect the actual public statements before merging such records. Unknown declarations remain unknown. A ledger event never enables named-charity ratings or replaces their separate public red-team gate.

## Progress, editions and corrections

Events append dated evidence and retained dissent. Issue closure alone has no disposition effect. The genuine seed shows the real correction with `challengeIds: []`; no person is invented to demonstrate the challenge UI. Synthetic challenge → response → correction and research result → reviewed decision → status/reopening chains are tested outside public loaders.

Each small ledger edition pins an exact closed set of versions, events, reviews, actors, sources and public observations. Rebuilding it under a new clock, time zone or later backfill must produce identical factual output. New evidence or a correction creates a new edition; it does not alter an older edition. This is bounded R4 research-progress reproducibility, not R5's wider annual publication or email-edition service.

Progress takes an explicit UTC half-open interval `[from,to)` ending no later than the chosen capture. The first view is a dated 2026-to-capture record, not a completed year or a known January baseline. Starting problem states remain **unknown where no baseline was recorded**. Show present open/draft counts separately from dated changes. Count one editorial artifact with two changed claim subjects as one correction artifact, not two scientific results. Undated records, late backfills, proposed methods and software checks remain separate. Result/review withdrawal or ineligibility immediately removes current qualification and changes a dependent problem to the explicit fourth status **under-review**, with a matching current frontmatter downgrade. It needs no replacement result and makes no new scientific conclusion. Retain the last recorded disposition historically; a later scientific disposition needs fresh evidence/reviews. Old editions stay byte-identical and visibly as-of. Dated progress separates decisions qualified when recorded from currently supported resolutions and later support withdrawals.

## Implementation ownership and exact files

| Boundary | New files | Narrow integrations |
| --- | --- | --- |
| Pure model and fixtures | `src/lib/research-ledger-model.mjs`; pure `src/lib/research-ledger-capture.mjs`; optional shared `src/lib/research-ledger-canonical.mjs`; `scripts/check-research-ledger.mjs`; excluded `test-fixtures/research-ledger/` | Explicit plain input only; Node crypto for deterministic hashing; no I/O, Astro, clocks or network inside the reducer. |
| Seed/capture and adapter | `src/data/research-ledger/{manifest.json,records/,versions/,events/,reviews/,actors/,observations/,editions/,sources/}`; `src/lib/research-ledger.ts`; optional explicit `scripts/capture-research-ledger.mjs` | Astro collections, current raw sources and local inert snapshots. A maintainer capture may read exact Git objects deliberately; public builds never fetch them. |
| Readable views and export | `src/components/ResearchLedger.astro`; `src/pages/research-ledger/index.astro`; `src/pages/research-ledger/[id].astro`; edition HTML/JSON and inert source-text static routes; optional filter-only client helper and scoped CSS | Shared content templates, manifesto, `ReviewNote`, journal listing, review queue, Progress Report, `src/lib/content.ts` title/route map. |
| Public API and contribution | Same projection, no second reducer | `src/lib/api.ts`, API index, `CONTRIBUTING.md`, existing issue/PR templates and prefilled links. Add ID/version/hash; never open or submit a real issue automatically. |

The API adds `research-ledger` and `research-progress` datasets plus pinned edition downloads. Its existing wall-clock `generated` wrapper needs a narrowly scoped pinned capture override for these datasets; other endpoints retain compatibility. Exact JSON/CSV, bound URLs, routes and function signatures are in [the interfaces](RESEARCH_LEDGER_INTERFACES.md). Full JSON is lossless; CSV cells are formula-neutralized before quoting. The existing general CSV helper only quotes, so it is insufficient on its own.

## Bounds and acceptance

Frozen first-release bounds: 1,000 records, 3,000 versions, 5,000 events, 2,000 reviews, 500 public actors, 500 observations, 250 source snapshots, ten editions and 5 MiB exact combined canonical input JSON including snapshot text/escaping once; full JSON exports are separately capped at 8 MiB. Per-object arrays/text are bounded in the interfaces. Refuse excess; no truncation, silent pruning or lost dissent. The genuine seed must pass the actual complete-byte measurement before it is committed as the public edition; refuse excess without pruning source facts.

Acceptance requires:

1. Real seed: all 40 covered source subjects validate against their exact current projection; the PR #3 before/correction/after/current trail works in HTML, canonical JSON and raw source downloads. Counts distinguish stable records, versions, one editorial artifact and zero qualifying research/review/disposition records.
2. Pure checks: tampered bytes/hash/edition pins fail; exact source/review/status boundaries, chain forks, duplicate IDs, wrong-version/self/conflicted/retracted reviews, decision cycles and malformed or credential-bearing URLs fail before output. Synthetic qualified journal/disposition/reopening and support-withdrawal paths never enter production output. Later withdrawal, ineligibility or alias evidence must remove current qualification immediately while preserving old editions and the historically recorded decision.
3. Compatibility: body/source/declared-date/evidence edits invalidate subject qualification; review-only and problem-status-only edits preserve that subject but need valid derived proof. Any uncovered `reviewed` entry fails. The manifesto is covered once. R2/R3, manuscript, OS and all prior keys remain untouched.
4. Determinism: two clocks/time zones yield identical edition JSON/hash/progress, including full UTC instants. Later backfills leave old edition bytes unchanged. Missing January coverage remains unknown. CSV leading formulas/whitespace, quotes/newlines and HTML-like text are safely exported/rendered without lossy JSON.
5. Actual browser/build proof: shallow/offline build, all routes and base paths, no-JavaScript reading, source/version/challenge links, period/coverage labels, filtering, real JSON/CSV byte validation, keyboard controls and a 390-pixel view. No actual human review, scientific result, public submission or research adoption is claimed by that acceptance run.

## Frozen routine decisions and remaining implementation checks

The coordinator selected theoretical-result as a separately labeled qualifying research type; two distinct eligible human identities across result research and decision disposition reviews; and immediate effective **under-review** plus draft review fallback on withdrawn/ineligible support, without replacement research. Journal retains two eligible peer reviewers. Global uncovered reviewed entries fail until registered. The interfaces encode these choices.

Still required before committing the public seed and claiming release: select the final public baseline/capture instant after R3 publication, measure the encoded real seed, inspect any actual candidate review statements that appear, and approve the final edition pins. The historical metadata observation above cannot substitute for those actions. No real seed exercises a qualifying research/review path.

Until implementation acceptance passes, this is a concrete plan, not an implemented public research institution or completion of every R4 operating gate.
