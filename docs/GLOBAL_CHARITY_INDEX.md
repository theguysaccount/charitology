# Global Charity Index release plan

Charitology connects organization identity, reported finances, funding flows, service geography, independently measured need and intervention evidence. Every join needs its own evidence. The Index makes coverage and uncertainty visible and follows the [Charitology Standard](../STYLE.md).

## First international financial slice

The [charity financial filings page](https://charitology.org/record/charity-financials/) gives the Index a searchable Australian financial snapshot alongside the existing [U.S. registry](https://charitology.org/record/charity-index/) and [historical consolidated panels](https://charitology.org/observations/). It covers 46,622 ABNs with at least one dated reporting record, including 43,298 with dated records in both AIS years. The edition uses the ACNC's [2023](https://data.gov.au/data/dataset/ff6905d6-9d5d-4ef1-8478-72b833864fb7) and [2024](https://data.gov.au/data/dataset/276ec1bc-4971-461c-88bc-be9f3c99a0f8) data retrieved on November 10, 2026. The original download URLs, field notes, SHA-256 hashes, counts and output fingerprint are in the [manifest](../public/data/charity-financials/manifest.json). Attribution is to the Australian Charities and Not-for-profits Commission under [CC BY 3.0 Australia](https://creativecommons.org/licenses/by/3.0/au/).

The importer keeps exact 11-digit ABNs, the name in the 2024 extract, period dates, the reported consolidation and accounting basis fields and five financial amounts. It discards contact, address and free-text fields. It includes an older statement only for an ABN present in the newer extract. It excludes periods without both dates, collapses one identical selected-field projection and refuses conflicting duplicates. Source record numbers are one-based CSV data records after the header, not physical text lines. The selected fields and organization coverage are deliberately narrower than the originals.

Financial amounts stay in AUD. The search keeps incoming government revenue separate from total expenses and outward grants and donations. Outward categories identify where funds are for use at the level disclosed, not recipients or service locations. Consolidation may make statements overlap. Zero is a value in the regulator extract and blanks remain unavailable. Some records can be withheld or corrected after capture, so use the live ACNC register for current information. If a withholding or correction is confirmed, remove or amend the affected observation in a superseding edition and document the effect on coverage.

Rebuild offline from the exact captured files. Use the names `acnc-ais-2023.csv` and `acnc-ais-2024.csv` in the input directory. The live provider files change over time. A changed hash requires a new reviewed capture rather than rewriting this edition silently.

```sh
node scripts/build-au-charity-financials.mjs /path/to/captured-inputs /path/to/rebuild
node scripts/build-au-charity-financials.mjs --check /path/to/rebuild
npm run check:references
```

## Choose the next improvement

GlobalGiving already offers international registry lookup. Candid and ProPublica already offer financial histories or original filings. IATI supplies activity-linked funding flows from its publishers. The opportunity to test is whether primary-source joins, accounting boundaries and coverage disclosures make questions about need and spending easier to answer across sources. [GlobalGiving Atlas](https://icl.globalgiving.org/atlas/) · [Candid Financials](https://candid.org/candid-search/features/financials/) · [ProPublica](https://projects.propublica.org/nonprofits/api) · [IATI d-portal](https://d-portal.iatistandard.org/spa/faq.html)

| Priority | Gap | Verification before release |
| --- | --- | --- |
| 1 | Verify additional stages of money movement. | Start with published awards and add payments or recipient spending only when the same funding can be linked by exact transaction or agreement references. Use the [360Giving API](https://www.360giving.org/api-docs/use/) or [IATI](https://iatistandard.org/en/iati-standard/203/codelists/transactiontype/) where coverage supports the join. Keep intermediaries, currencies, reporting dates and unmatched amounts visible. |
| 2 | Grow U.S. financial coverage beyond the historical panels. | Qualify the [IRS financial extracts](https://www.irs.gov/statistics/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data) against the dated identity snapshot. Retain the form type and tax period. Distinguish filing calendar year from fiscal year and processed extract amounts from copies of returns. Do not turn missing or unmatched filings into zeroes. |
| 3 | Repeat funding and need comparisons in another place or cause. | Use the [Gap Map](https://charitology.org/record/gap-map/) where geography, periods and definitions align. State the independent denominator, its missingness and who is included. Keep output counts, unique people and evidence of effectiveness separate. |
| 4 | Expand geography and language coverage and reduce the search payload. | Qualify primary sources and a coverage denominator before making completeness claims. Prioritize places missing from existing bulk datasets. Reuse exact-ID matching, corrections and browser-local search. |

Each improvement should be independently verifiable. Publish the source versions, included and excluded populations, and what a reader can infer before adding another source or geography.

## England and Wales annual returns

The [England and Wales financial filings page](https://charitology.org/record/charity-financials/england-wales/) uses a separate Commission edition under the Open Government Licence v3.0. It covers 157,367 of 171,945 main registered charities in the November 10, 2026 register extract, with 452,394 received returns for financial periods ending in 2023, 2024 or 2025. The date of receipt is distinct from the period end. Data record coordinates refer to one-based tab-delimited source records after the header. All money figures remain in GBP.

The two [original public Commission extracts](https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download) join on the Commission's organization number with an exact cross-check against the charity registration number. Exclusions are applied in this order: suppressed or unknown suppression status, linked or out-of-scope organizations, other period ends and records without a received return. No name matching or imputation takes place. The names reflect the dated register, which can differ from names at the time of a historical filing. The [manifest](../public/data/charity-financials/ew/manifest.json) records original hashes, coverage and one fingerprint per published shard. It excludes all contact, address, trustee and free-text narrative fields. The lookup uses a two-digit directory for exact numbers and the first normalized letter or digit for name-prefix queries. All queries run in the browser.

Rebuild offline from the exact `charity-register.zip` and `annual-return-history.zip` source captures. The official download page replaces its current files over time. A mismatched input hash requires a new edition.

```sh
python3 scripts/build-ew-charity-financials.py /path/to/captured-inputs /path/to/new-rebuild
node scripts/check-ew-charity-financials.mjs
```
