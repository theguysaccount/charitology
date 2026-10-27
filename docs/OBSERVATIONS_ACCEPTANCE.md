# Factual observations acceptance

October 27, 2026 · AI-assisted engineering and source checks · prepared, not yet published. Read the pre-implementation [plan](OBSERVATIONS_PLAN.md), [interfaces](OBSERVATIONS_INTERFACES.md) and [writing standard](../STYLE.md).

## Covered result

One admitted, versioned projection supplies country pages, the country desk, factual organization comparison, the observation desk and the public API. Its initial scope is 217 countries/economies × five World Bank indicators: 1,050 present observations and 35 explicitly missing cells. A separate scope contains eight financial observations from the Wikimedia Foundation and GiveWell consolidated reports. Those reports cover different entities and periods. No ranking, ratio, pooled total, inferred impact or global funding map is produced.

The Cause Census, Cause Atlas, Gap Map and Index link this evidence and explain its coverage. Country statistics are national context, not locally authored needs assessments. The Gap Map still has no measured global depth allocation. Uncovered organizations remain uncovered. Original intervention comparison stays available beside factual organization comparison.

## Source boundary

The retained World Bank responses were fetched on October 27, 2026; their source metadata reports October 8, 2026 as the dataset update. The five indicators retain exact response number tokens, periods, units, definitions, statuses, footnotes and unknowns. Aggregate rows remain raw source context but do not become country observations. No missing value is zero-filled. The historical `countries.json` remains unchanged (SHA-256 `8f4a71e525a8b7765691f211b7d94a6d4fed02746a19060b88f196d137f74543`). Its generated date is not the new source's freshness claim.

[Wikimedia's audited report](https://upload.wikimedia.org/wikipedia/foundation/f/f6/Wikimedia_Foundation_2024_Audited_Financial_Statements.pdf), June 30, 2024 consolidated statement, reports USD 286,759,938 assets, USD 15,204,548 liabilities and USD 271,555,390 net assets. Its July 1, 2023–June 30, 2024 statement reports USD 178,471,109 total operating expenses. [GiveWell's audited report](https://files.givewell.org/files/ClearFund/Clear%20Fund%202024%20audited%20financial%20statements%20%28PDF%29.pdf), December 31, 2024 consolidated statement, reports USD 289,426,000 assets, USD 21,895,000 liabilities and USD 267,531,000 net assets. Its year-ended statement reports USD 183,889,000 total expenses; the source's literal start date remains unknown. GiveWell's printed amounts are in thousands; reporting quantum is USD 1,000, without an invented uncertainty interval.

Financial source records preserve auditor/report dates, printed page/column locations, consolidated scope and private original PDF hashes. Public numeric evidence packets are bounded; the original PDFs stay outside the public repository. These are AI-assisted transcriptions with separate AI source checks, not independent human review, a latest-filing assertion or proof of effective work. Source-specific rights metadata distinguishes explicit terms, inferred publisher defaults and unresolved review. Public API wrappers do not relicense third-party source material under the project's editorial license.

## Refresh and reproducibility

Preparation and capture are explicit maintainer commands. Ordinary builds perform no network fetch and never rewrite sources. The fourteen interpretation inputs must first exist at a real source commit A; the subsequent data commit B records that exact A, source hashes and capture instant. Append-only checks require an exact available local base/head and ancestry. No missing Git object is fetched and no unavailable history proof is replaced by a current working file. Earlier immutable files and edition pins must survive refresh. Definition/adapter changes require an explicit new method capture.

Preview owns detached prepared bytes and computes a proposal hash. Installation requires that exact reviewed hash, unchanged interpretation inputs and unchanged predecessor data. New files are staged first; registry activation is last. A failed install rolls back only its own additions. Source media/disposition must agree with its payload representation before any public assembly.

The public edition page links complete JSON, normalized CSV, exact admitted source files and historical editions. Country/group selections retain their complete factual source closure, which may contain wider raw context than the visible filtered rows; this is disclosed. The normalized CSV includes fact/missing/source/rights rows so source metadata is not multiplied across every cell. Private originals and private local notes are excluded.

## Capacity and checks

The frozen contract bounds 1,000 entities, 1,000 scopes, 100 measures, 200 sources, 10,000 observation versions, 100 coverage records and 20 editions. Selected factual closure is at most 8 MiB; the complete stored history including registry is at most 20 MiB. Selected JSON/CSV is at most 12 MiB; complete history JSON is at most 32 MiB. Raw public text/JSON is at most 1 MiB per file; private originals at most 4 MiB, and prepared input at most 32 MiB. The whole bound wins; nothing is silently truncated.

The private production-model proof admits all 24 real prepared inputs and a complete fictional changed vintage, preserving all 1,560 earlier immutable files. That changed fixture is capacity/append-only evidence, not a second real-world observation edition. Focused tests exercise exact decimals, missing/reappeared values, ownership, source dispositions, malformed/oversized inputs, failed installation/retry, real local Git history, unavailable promisor blobs and actual Astro-rendered/controller behavior. Final build, committed-seed proof, native browser acceptance, exact-head CI and public-byte checks must be recorded below before publication is claimed.

Browser downloads and response bytes do not establish that an operating system saved a file. Native Save remains a separate pending capability check. Actual research, local coauthorship, human rights/source review, qualified financial interpretation and public method red-team review remain human work.

## Release evidence

The complete interpretation inventory is committed at source A `cd5e392f023d271d82065c7050fd69ff640c4cb8`. The actual capture instant is `2026-10-27T15:24:56.777Z`; data B is `3c55e6e1f1b661bc521ddd2ee9f05210f4470327`. The exact reviewed proposal hash is `9d901e3e23ac48c22b8fa8b3b57ad1f718204a9127252a4def9a5847be5a9145`. The registry hash is `e71b832f4a6b403c7d5c087df301949681dd7b7424fce4a78301448c896ecb4b`; current edition semantic hash is `88067164fcf50b280f1c762af035597e3df04a3df3c68ad599a1caeb8f9b1a19`. The committed bootstrap proof against available main `e1a036aa7830dab4ec86bf73d4d1773577946dfe` passed without fetching. No public seed existed at A.

The actual initial inventory contains 1,561 files including registry: 7,070,768 bytes total; selected factual closure 6,520,988; selected JSON 7,875,040; normalized CSV 7,283,760; complete history JSON 8,323,864. The final built-output check covers 1,570 exact downloadable artifacts, all 217 country pages, 24 source-version pages and nine acceptance groups. Focused model/capture/Git/offline/UI/build checks total 110 groups, with strict TypeScript zero in the model and UI checks. The corrected HTML runtime is `a78ade32e37d7d2deb1b467b5c6bb18c33ccbec8`; its build has 546 HTML pages and 36 API datasets. All 46,600 internal links/assets pass after correcting comparison selection URLs and HTML character-reference decoding in the link checker.

The complete `npm run check` passed against this build, including all earlier tool/research/publication suites and the new 110 observation groups. Pending: controlled Chrome, exact-head CI, Pages and public-byte proof. The retained private real-source and complete fictional changed-vintage replay is separate capacity evidence; it is not an extra public edition.
