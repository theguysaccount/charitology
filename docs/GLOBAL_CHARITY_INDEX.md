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

## Canada T3010 financial filings

The [Canadian financial filings edition](https://charitology.com/record/charity-financials/canada/) joins 167,920 financial periods ending in 2023 or 2024 to the Canada Revenue Agency's dated identification extracts. There are 85,951 included charity accounts, 81,636 with returns in both years. The full nine-digit business number and RR account suffix form the identity key. The precise fiscal period end distinguishes separate periods for the same account, even within a year. Names come from the most recent included identification extract. Check the regulator for current status. [2023 catalogue](https://open.canada.ca/data/dataset/05b3abd0-e70f-4b3b-a9c5-acc436bd15b6) · [2024 catalogue](https://open.canada.ca/data/dataset/80c00cdb-1358-415c-bb8b-0de7f12675b8).

Every financial observation retains the Section D or Schedule 6 marker, form version, accounting basis and one-based data records in the financial and identification CSVs. It keeps six original lines in CAD, with blank, zero and negative values distinct. Revenue and expenditure totals, gifts received and gifts or grants made have different meanings. The figure on line 5000 covers charitable program expenditures. The annual aggregate amounts do not identify a particular grant transaction or its service location. The projection omits addresses, contact information, personal records and free-text fields. Contains information from the Canada Revenue Agency under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).

The [manifest](../public/data/charity-financials/ca/manifest.json) pins four source files and lists coverage, field order and compressed and decoded fingerprints for each search shard. Rebuild offline with the manifest's exact filenames in the input directory. The independent comparison used every source period and both data-record coordinates. A change to a source fingerprint requires a new reviewed edition.

```sh
python3 scripts/build-ca-charity-financials.py /path/to/captured-inputs /path/to/new-rebuild
node scripts/check-ca-charity-financials.mjs
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

### Solidarity kitchens account movements

The [agreement-account payment trace](https://charitology.com/record/funding-flows/brazil-solidarity-kitchens/account-payments/) matches the signed terms in the solidarity kitchens case to 5,398 reported movements. The exact join uses the public agreement number. Internal transfers to the agreement holder have a separate onward-record file linked by the unique financial movement ID. The source leaves some onward amounts missing. Each stage keeps its own totals. The files carry no federal bank-order identifier linking a particular disbursement to a particular payment. Partner contributions and tax records use separate archives. The latest calendar year is partial. The public projection contains aggregates and source references.

Rebuild from the four Transferegov archives named in `src/data/brazil-solidarity-kitchen-payments.json`. Use the exact captured bytes. The builder checks their hashes and the solidarity kitchens case hash before reading the rows. Ordinary site builds use the committed projection.

```sh
python3 scripts/build-brazil-kitchen-account-payments.py /path/to/captures /path/to/brazil-solidarity-kitchen-payments.json
npm run build
node scripts/check-brazil-kitchen-account-payments.mjs
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

Cash grants and reported noncash valuations remain separate. Each row is an organization pair and reporting period. A filer-period with competing returns or a recipient repeated in one return can overlap. The archive projection omits those candidates within its source ZIP and reports their counts. The filing version context below covers other IRS ZIPs. Links to financial filings match the EIN to a separate aggregate extract. Establishing receipt or expenditure of a particular grant requires additional sources. [Schedule I instructions](https://www.irs.gov/instructions/i990si).

### Schedule I filing versions

The initial January 2024 archive stays downloadable. Default search excludes rows from any initial filing for which the 2022–2026 IRS indexes and original XML show another full Form 990 with the same EIN and exact tax-period dates. An explicit search option exposes those original rows and links the other filing objects. The option keeps the other objects as source references and does not include their amounts in the lookup. JSON exports report omitted rows and any linked versions. CSV records identify how many other objects were found for the filing. The data do not designate an authoritative version.

For the version context, capture the 2022 through 2026 `index_YEAR.csv` files from the [IRS downloads page](https://www.irs.gov/charities-non-profits/form-990-series-downloads). The first command checks each initial filing against the index's EIN and tax-period month. The second reads the candidate XML from the official ZIPs using HTTP range requests and compares the exact tax-period dates and recorded Part II amounts and recipient identifiers. The third builds the public metadata without copying names, addresses or narrative fields. `filing-context.json` retains the index fingerprints, checked archives and the XML fingerprints of linked returns. Ordinary site builds are offline.

```sh
python3 scripts/qualify-us-schedule-i-indexes.py /path/to/indexes public/data/funding-flows/us-schedule-i/filings.json.gz > index-evidence.json
python3 scripts/qualify-us-schedule-i-xml.py index-evidence.json /path/to/2024_TEOS_XML_01A.zip > xml-evidence.json
python3 scripts/build-us-schedule-i-filing-context.py index-evidence.json xml-evidence.json public/data/funding-flows/us-schedule-i/filings.json.gz /path/to/filing-context.json
```

### Initial Schedule I archive reproduction

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

## Japan NPO Portal and reported finances

The [Japan NPO edition](https://charitology.com/record/charity-index/japan/) projects 60,062 records across 67 supervising authorities from the Cabinet Office's November 10, 2026 national NPO Portal files. Each record retains its exact portal ID and administrative CSV data record. The search accepts the Japanese name or reading, portal ID or corporate number. Administrative location describes the supervising authority. The portal includes records at different stages of registration and dissolution. Use the Cabinet Office's separately dated counts for the certified population. [National bulk download](https://www.npo-homepage.go.jp/npoportal/download/all) · [Coverage and reuse FAQ](https://www.npo-homepage.go.jp/npoportal/faq/common) · [Official certification statistics](https://www.npo-homepage.go.jp/about/toukei-info/ninshou-zyuri).

The corporate number keeps its original digits when it passes the National Tax Agency's published checksum. Repeated valid numbers retain every portal entry. The organization-entered CSV has the same sequence of names as the administrative CSV but supplies no corporate number. A financial summary requires a unique name in both extracts, an explicit year label and at least one valid selected amount. The 1,221 linked summaries preserve the original financial data record and four original JPY amounts. These summaries are entered by the organizations and do not establish where services took place or how grants were spent. The projection excludes names of representatives, contact information, addresses, narrative text and personal records. [Corporate-number formula](https://www.houjin-bangou.nta.go.jp/documents/houjinbangounokousei.pdf) · [Organization-entered field definitions](https://www.npo-homepage.go.jp/about/houjin-info/npohoujin-touroku) · [Activity statement in yen](https://www.npo-homepage.go.jp/uploads/report28_11_shiryo_1.pdf).

Source data from the Cabinet Office NPO Portal, adapted by Charitology under [Japan's Public Data License 1.0](https://www.cao.go.jp/notice/rule.html). The [manifest](../public/data/charity-registry/japan-npo/manifest.json) pins both raw ZIPs and the projected data. Use `gyousei_000.zip` and `houjin_000.zip` with the exact recorded fingerprints. The service updates the same download URLs. The offline checker verifies the committed projection, identifier uniqueness, the selected financial scope and the artifact fingerprints.

```sh
python3 scripts/build-japan-npo.py /path/to/captures /path/to/new-rebuild
node scripts/check-japan-npo.mjs
```

### Child-support awards and food hardship in Hokkaido

The [Hokkaido case](https://charitology.com/record/funding-flows/hokkaido-child-support/) follows 16 rows in two years of the Children's Future Support Fund. The report footnotes define the amounts as the values at selection, in thousands of yen. Six of seven fiscal 2022 award rows and all nine fiscal 2023 rows match the original selection names. Five of the 2023 rows link by exact corporate number to a unique NPO Portal entry. The funder's listed prefecture and the documented location of a specific project are separate observations. [Fund archive](https://kodomonomiraiouen.cfa.go.jp/support/network/archive) · [Noboribetsu activity profile](https://www.pref.hokkaido.lg.jp/hf/kms/st/182714.html).

The Hokkaido survey asked sampled single-parent allowance households outside Sapporo about food they could not afford during the preceding year. It ran in August 2022, during the first award period. Four household groups keep their exact sample sizes and published percentages. A municipal prevalence estimate, bank payment confirmation and participant outcomes each require separate sources. [Survey report](https://www.pref.hokkaido.lg.jp/fs/8/8/6/7/3/5/5/_/2022_hitorioya_houkokusyo.pdf).

The case exports exact source references and dates. Its builder checks the five original PDF digests, the award footnotes and the survey scope. Rebuild from the filenames listed in the committed projection with `pypdfium2==5.14.0`.

```sh
python3 scripts/build-hokkaido-child-support.py /path/to/captures /path/to/new-case.json
npm run build
node scripts/check-hokkaido-child-support.mjs
```
