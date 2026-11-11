# Global Charity Index release plan

Charitology connects organization identity, reported finances, funding flows, service geography, independently measured need and intervention evidence. Every join needs its own evidence. The Index makes coverage and uncertainty visible and follows the [Charitology Standard](../STYLE.md).

## First international financial slice

The [charity financial filings page](https://charitology.com/record/charity-financials/) gives the Index a searchable Australian financial snapshot alongside the existing [U.S. registry](https://charitology.com/record/charity-index/) and [historical consolidated panels](https://charitology.com/observations/). It covers 46,622 ABNs with at least one dated reporting record, including 43,298 with dated records in both AIS years. The edition uses the ACNC's [2023](https://data.gov.au/data/dataset/ff6905d6-9d5d-4ef1-8478-72b833864fb7) and [2024](https://data.gov.au/data/dataset/276ec1bc-4971-461c-88bc-be9f3c99a0f8) data retrieved on November 10, 2026. The original download URLs, field notes, SHA-256 hashes, counts and output fingerprint are in the [manifest](../public/data/charity-financials/manifest.json). Attribution is to the Australian Charities and Not-for-profits Commission under [CC BY 3.0 Australia](https://creativecommons.org/licenses/by/3.0/au/).

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
| 2 | Extend source-linked U.S. grants beyond one archive. | Qualify more [Form 990 Schedule I](https://www.irs.gov/instructions/i990si) filing batches and resolve repeated and amended filer periods across batches. [Form 990-PF Part XIV](https://www.irs.gov/pub/irs-tege/2024form990pfwithfieldnames.pdf) lists names and addresses without a required recipient EIN. Leave uncertain identities unresolved and exclude personal recipient records. |
| 3 | Repeat funding and need comparisons in another place or cause. | Use the [Gap Map](https://charitology.com/record/gap-map/) where geography, periods and definitions align. State the independent denominator, its missingness and who is included. Keep output counts, unique people and evidence of effectiveness separate. |
| 4 | Expand geography and language coverage and reduce the search payload. | Qualify primary sources and a coverage denominator before making completeness claims. Prioritize places missing from existing bulk datasets. Reuse exact-ID matching, corrections and browser-local search. |

Each improvement should be independently verifiable. Publish the source versions, included and excluded populations, and what a reader can infer before adding another source or geography.

## England and Wales annual returns

The [England and Wales financial filings page](https://charitology.com/record/charity-financials/england-wales/) uses a separate Commission edition under the Open Government Licence v3.0. It covers 157,367 of 171,945 main registered charities in the November 10, 2026 register extract, with 452,394 received returns for financial periods ending in 2023, 2024 or 2025. The date of receipt is distinct from the period end. Data record coordinates refer to one-based tab-delimited source records after the header. All money figures remain in GBP.

The two [original public Commission extracts](https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download) join on the Commission's organization number with an exact cross-check against the charity registration number. Exclusions are applied in this order: suppressed or unknown suppression status, linked or out-of-scope organizations, other period ends and records without a received return. No name matching or imputation takes place. The names reflect the dated register, which can differ from names at the time of a historical filing. The [manifest](../public/data/charity-financials/ew/manifest.json) records original hashes, coverage and one fingerprint per published shard. It excludes all contact, address, trustee and free-text narrative fields. The lookup uses a two-digit directory for exact numbers and the first normalized letter or digit for name-prefix queries. All queries run in the browser.

Rebuild offline from the exact `charity-register.zip` and `annual-return-history.zip` source captures. The official download page replaces its current files over time. A mismatched input hash requires a new edition.

```sh
python3 scripts/build-ew-charity-financials.py /path/to/captured-inputs /path/to/new-rebuild
node scripts/check-ew-charity-financials.mjs
```

## Brazil federal transfers to civil society

The [Brazil federal transfer edition](https://charitology.com/record/funding-flows/brazil-transferegov/) joins proposal, agreement and disbursement files in the [Transferegov public downloads](https://api-publica.transferegov.gestao.gov.br/downloads). It uses exact proposal IDs and agreement numbers and requires a valid CNPJ on a proposal that Transferegov classifies as a civil society organization. The two calendar years include 12,058 bank-order rows in 7,900 agreements for 3,811 organization identifiers. The published [manifest](../public/data/funding-flows/brazil-transferegov/manifest.json) records the three archive fingerprints, field definitions, coverage and the dataset's ODbL 1.0 license.

The detail amount is federal money made available to the agreement account. The date comes from the bank order. The agreement amount is the federal contribution as listed at capture and appears once per agreement in JSON. The bank-order CSV excludes the agreement amount. The projection leaves out personal, address, contact, banking and narrative fields. The proponent state requires independent service-location evidence before any comparison with local need.

Rebuild from the exact three archive captures and the field model saved as `modelo-dados-real.zip`. The manifest links the original files. Live publisher downloads can change, so retain each dated capture used for an edition.

```sh
python3 scripts/build-brazil-transferegov.py /path/to/captures /path/to/new-brazil-output
node scripts/check-brazil-transferegov.mjs
```

## United States Form 990 financial extracts

The [U.S. financial filings page](https://charitology.com/record/charity-financials/united-states/) uses the IRS's processed extracts for the 2023 and 2024 filing calendar years. It includes 516,109 periods for 277,047 EINs with subsection code 03 on full Form 990. The periods end in 2022–2024. The source supplies the tax-period end month rather than a start date or day. The projected fields are revenue, functional expenses, program service revenue, grants to U.S. governments and organizations, and grants to organizations and individuals outside the U.S. Source record numbers count CSV records after the header.

The name lookup and the finances remain separate editions. A match means the exact EIN appears in the October 13, 2026 EO BMF identity snapshot. The data retain historical EINs without a registry match. The extract is selected and processed by the IRS, so compare the original filed return before attributing a difference to the organization. The [full-form manifest](../public/data/charity-financials/us/manifest.json) describes selection counts, file checksums and published shards. The browser loads only the two-digit EIN partition after an explicit search.

Rebuild using the two IRS ZIPs and their XLSX documentation files, together with the pinned EO BMF snapshot from this source edition. The generated directory must be new.

```sh
python3 scripts/build-us-charity-financials.py /path/to/captures public/data/irs-registry /path/to/new-rebuild
node scripts/check-us-charity-financials.mjs
```

The separate [Form 990-EZ](https://charitology.com/record/charity-financials/united-states/990-ez/) and [Form 990-PF](https://charitology.com/record/charity-financials/united-states/990-pf/) editions project the same filing years, period range and subsection as the full form. The original short-form extracts use `3` in 2023 and `03` in 2024. The foundation extracts also include another subsection code outside this edition. See the [short-form manifest](../public/data/charity-financials/us-990-ez/manifest.json) and [foundation manifest](../public/data/charity-financials/us-990-pf/manifest.json) for counts, names and SHA-256 fingerprints. EINs may recur across editions. Form 990-N remains outside the financial data.

The short form includes total revenue, total expenses, program service revenue and year-end assets. The foundation extract keeps total revenue and expenses per books, expenses for exempt purposes and the year-end fair market value of assets. It also keeps the combined book amount for contributions, gifts and grants paid and the separate amount approved for future payment. [IRS instructions for Part I, line 25](https://www.irs.gov/pub/irs-prior/i990pf--2024.pdf) allow the book amount to include accruals. The figures are aggregate. Rebuild each edition from its exact ZIPs and the corresponding IRS XLSX documentation.

```sh
python3 scripts/build-us-charity-financials.py /path/to/captures public/data/irs-registry /path/to/new-ez-output 990-ez
python3 scripts/build-us-charity-financials.py /path/to/captures public/data/irs-registry /path/to/new-pf-output 990-pf
node scripts/check-us-charity-financials.mjs
```

## United States Schedule I grant records

The [Schedule I lookup](https://charitology.com/record/funding-flows/us-schedule-i/) uses one official IRS monthly ZIP. It covers 5,916 selected recipient rows in 755 original filing objects and tax periods ending in 2022 or 2023. The [manifest](../public/data/funding-flows/us-schedule-i/manifest.json) retains source coordinates, fingerprints and the complete count of exclusions. The snapshot omits the filing's names, addresses and narrative fields. Each endpoint EIN must match the pinned IRS identity directory.

Cash grants and reported noncash valuations remain separate. Each row is an organization pair and reporting period. A filer-period with competing returns or a recipient repeated in one return can overlap. The edition omits those candidates from search and reports their counts. It cannot resolve competing returns outside the capture. Links to financial filings match the EIN to a separate aggregate extract, which adds organization context without establishing receipt or expenditure of a particular grant. [Schedule I instructions](https://www.irs.gov/instructions/i990si).

```sh
python3 scripts/build-us-schedule-i.py /path/to/2024_TEOS_XML_01A.zip public/data/irs-registry /path/to/new-output
node scripts/check-us-schedule-i.mjs
```

## Kenya sector reporting and finances

The [Kenya coverage edition](https://charitology.com/record/charity-financials/kenya/) traces three report years of registration and filing counts, reported receipts and source regions to exact pages in the regulator's reports. It includes the 2024/25 expenditure breakdown for Kenya and other countries. Each edition retains published totals and source precision. The 2023/24 region breakdown differs from the published receipts total by KES 0.01. The 2024/25 sector and expenditure tables give different totals for projects in Kenya. Each figure keeps its own source location. Do not aggregate receipts with expenditures or treat the regulator's reported totals as a complete national measure.

The regulator's live organization lookup supplies names and references. An authoritative old-to-new reference crosswalk and a qualified organization-level financial source are needed before adding a historical Kenya organization join. The public dataset is an aggregate projection of reported facts. Source report content retains its original terms.

Rebuild from the three exact report PDFs named in `src/data/kenya-pbo-coverage.json`, using `pypdfium2==5.14.0`. Normal builds read the committed projection without fetching any report. The check compares the built JSON and CSV exports to the projection, including every amount and its source coordinates.

```sh
python3 scripts/build-kenya-pbo-coverage.py /path/to/captures /path/to/kenya-pbo-coverage.json
npm run build
python3 scripts/check-kenya-pbo-coverage.py
```
