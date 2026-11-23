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

### Donor-reported gifts

The [Canadian gift trace](https://charitology.com/record/funding-flows/canada-qualified-donees/) uses 535,482 distinct T1236 worksheet records from 2023 and 2024. A row links a filer and named recipient during the filer's fiscal period. Both full charity accounts must match the edition's identification extract. The filer also matches a dated T3010 by full account, exact period end and form version. The projection removes unresolved endpoints, self-links, repeated pairs within the same filer period, unusable sequences and inconsistent amounts. Every published gift has a positive total in CAD. Reported gifts in kind are an optional component of that total. [CRA T1236 worksheet](https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t1236.html).

Both query directions use the same worksheet record, with each view partitioned for bounded browser requests. Use edition and one-based worksheet record number to identify a unique row if you combine exports. Financial links provide independent source coordinates for the matching filer return. Both views describe what the donor reported. The recipient's settlement or expenditure requires separate evidence.

The coverage page compares each complete original worksheet sum with its matching donor's line 5050. The comparison includes worksheet rows outside the gift lookup. Of 52,248 matched filer periods with both figures available, 41,734 have exact equality. The rest are shown as lower or higher on the worksheet. An equal sum compares two amounts the same filer reported. The page links both versions of the regulator's guidance on scope.

Rebuild from all six source captures listed in the [gift manifest](../public/data/funding-flows/ca-qualified-donees/manifest.json). The captured names and amounts were independently checked against both original CSVs and their source coordinates. The manifest gives exact source and shard fingerprints plus year-specific exclusions. Contains information from the Canada Revenue Agency under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).

```sh
python3 scripts/build-ca-qualified-donees.py /path/to/captured-inputs /path/to/new-rebuild
node scripts/check-ca-qualified-donees.mjs
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

Extend the verified UK cross-register examples when an original filing or public institutional record explicitly supplies both registration numbers. Preserve the filing scope, period, receipt date and unresolved amount differences. For a new jurisdiction, check the [Irish Charities Regulator catalogue](https://data.gov.ie/dataset/register-of-charities-in-ireland) for accessible, licensed versions of its register and reports. The regulator download links checked for this cycle returned HTTP 403. The [Tainan fundraising disclosures](https://data.gov.tw/dataset/148500) are a candidate for campaign-level tracing. Compare approvals and reported amounts only after establishing the campaign stage and how the source uses blank and zero fields.

For the Taiwan Fund, the [grant disclosure filed with the Legislative Yuan](https://ppg.ly.gov.tw/ppg/download/agenda1/02/agendaAnnex/11/03/09/1103091551.pdf) identifies recipient jurisdictions for the six paired projects. The direct file returned HTTP 403 during this cycle. Pin a permitted copy before adding those fields to the reproducible edition. Distinguish recipient registration from service sites, then check geographic and program coverage before comparing independently measured need.

## England and Wales annual returns

The [England and Wales financial filings page](https://charitology.com/record/charity-financials/england-wales/) uses a separate Commission edition under the Open Government Licence v3.0. It covers 157,367 of 171,945 main registered charities in the November 10, 2026 register extract, with 452,394 received returns for financial periods ending in 2023, 2024 or 2025. The date of receipt is distinct from the period end. Data record coordinates refer to one-based tab-delimited source records after the header. All money figures remain in GBP.

The two [original public Commission extracts](https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download) join on the Commission's organization number with an exact cross-check against the charity registration number. Exclusions are applied in this order: suppressed or unknown suppression status, linked or out-of-scope organizations, other period ends and records without a received return. No name matching or imputation takes place. The names reflect the dated register, which can differ from names at the time of a historical filing. The [manifest](../public/data/charity-financials/ew/manifest.json) records original hashes, coverage and one fingerprint per published shard. It excludes all contact, address, trustee and free-text narrative fields. The lookup uses a two-digit directory for exact numbers and the first normalized letter or digit for name-prefix queries. All queries run in the browser.

Rebuild offline from the exact `charity-register.zip` and `annual-return-history.zip` source captures. The official download page replaces its current files over time. A mismatched input hash requires a new edition.

```sh
python3 scripts/build-ew-charity-financials.py /path/to/captured-inputs /path/to/new-rebuild
node scripts/check-ew-charity-financials.mjs
```

## Scottish charity registrations and annual returns

The [Scottish financial filings page](https://charitology.com/record/charity-financials/scotland/) covers 24,994 exact Scottish charity numbers in the November 12, 2026 register export. Of those, 22,532 have at least one included return and 21,496 have multiple returns. The 100,514 retained returns show year-ends from March 31, 2010 through October 31, 2026. The OSCR five-year download contains some older records. It supplies no period start. Retained gross income and expenditure stay in GBP. The broad registered location and spread fields describe the organization. Matching that location to a service area or allocating spending geographically requires separate evidence. [OSCR data and reuse terms](https://www.oscr.org.uk/about-charities/search-the-register/download-the-scottish-charity-register/)

The [manifest](../public/data/charity-financials/scotland/manifest.json) records both ZIP hashes, member names, field order and every shard fingerprint. It accounts for 107,905 input return records. 7,380 lacked a receipt date, seven had a receipt date before the year-end and four were competing records for two registration and year-end pairs. The two contested pairs are held out of the published history. Registration lookup retains all identities, including those with no usable return. Breakdown fields use Standard returns with at least one nonzero amount in the corresponding exported field group. In an available group, individual zeroes are preserved. This rule leaves entirely zero groups unavailable. Only the allowlisted institutional identity, geography and financial fields are published.

The [cross-register comparison](https://charitology.com/record/charity-financials/scotland/#cross-register) follows three publicly confirmed registration pairs over nine year-ends. Eight pairs of returns agree on both headline amounts and three agree on the date of receipt. Oxfam GB’s two 2024–25 gross income figures differ by £30,000. Both exports remain in the [comparison download](../public/data/charity-financials/scotland/cross-register.json), with source record numbers, exact values, dates and the verified England and Wales edition fingerprint. The consolidated accounts give income to £0.1 million precision. The reason for the exact difference remains unknown. The sample tests duplicate handling and disclosure differences. It provides no estimate of cross-register coverage. [Oxfam GB annual report and accounts](https://www.oxfam.org.uk/documents/1077/Oxfam__GB_Annual_Report_2024-2025.pdf)

Rebuild offline from the November 12 regulator captures named `scotland-register.zip` and `scotland-returns.zip`. The current download URLs can serve newer bytes. The command uses the checked-in England and Wales edition for the paired rows and requires a new output directory.

```sh
python3 scripts/build-scotland-charity-financials.py /path/to/captured-inputs public/data/charity-financials/ew /path/to/new-rebuild
diff -r public/data/charity-financials/scotland /path/to/new-rebuild
npm run build
node scripts/check-scotland-charity-financials.mjs
```

## Taiwan institutional registrations and grant execution

The [Taiwan institutional lookup](https://charitology.com/record/charity-index/taiwan/) uses a Ministry of Finance withholding-unit snapshot covering education, culture, public benefit and charity institutions. The November 12, 2026 file has 99,914 data records. One lacks an identifier. The remaining 99,913 have distinct eight-digit identifiers. Eleven last-change tokens have unknown Gregorian normalization and 80 records have no registered city or county. The lookup preserves the original date tokens, change codes and published place labels, including historical labels. The current legal status and the areas where an institution provides services require separate records. [Official register catalogue](https://data.gov.tw/dataset/34147)

Exact lookups load a two-digit identifier shard and the corresponding name shard. Chinese name searches load one shard keyed by the first normalized letter or number’s Unicode code point modulo 64. The [manifest](../public/data/charity-registry/taiwan/manifest.json) pins the original bytes, the field order and the compressed and decoded fingerprints. The projection publishes selected institutional fields and a one-based data record coordinate. The free-text reason field is excluded. Results and CSV or JSON exports use the displayed selection.

The [New Resident Development Fund lookup](https://charitology.com/record/funding-flows/taiwan-new-resident-fund/) covers all 117 populated institutional rows in the 2024 and 2025 Fund execution CSVs, grouped under 111 distinct project IDs. The later CSV has 451 entirely blank records and extra empty columns. The offline builder checks the padding before leaving it out. The [Fund catalogue](https://data.gov.tw/dataset/86169) supplies additional issuer files outside this selection.

The six IDs recurring in both reports link to six checked rows in the 2024 official approval PDF. Their approved amounts agree across all three sources. Execution figures differ between the two reports. Project 1132D350 moves from the earlier issuer status of payment pending to a reported date of June 6, 2025. The report years, source positions, execution figures, reported disbursement fields and returned-balance fields remain distinct. A project ID counts an approval once. Provider expenses, individual transfer amounts and outcomes require other records. For registry links, name equality after width normalization and trimming supplies a candidate. The issuer files provide no tax identifiers for recipients. No city is inferred from a name or routing agency. [Official approval archive](https://www.immigration.gov.tw/5382/5385/7445/7451/7508/7523/?Page=1&PageSize=50&alias=&type=)

The [original source pins](../src/data/taiwan-index-sources.tsv) list the four required input filenames, URLs, sizes and SHA-256 fingerprints. Rebuild offline with the exact captures and a new output directory. The Taiwan open data projections identify the original publishers and the [Open Government Data License 1.0](https://data.gov.tw/license).

```sh
python3 scripts/build-taiwan-charity-index.py /path/to/captures /path/to/new-rebuild
diff -r public/data/charity-registry/taiwan /path/to/new-rebuild
npm run build
node scripts/check-taiwan-charity-index.mjs
```

### Municipal assistance and reported access barriers

The [municipal assistance case](https://charitology.com/record/funding-flows/taiwan-municipal-assistance/) follows 87 special-circumstances grant rows published for municipal recipients from 2020 through the second quarter of 2026. The source selection checks the municipal grant titles for both pre-registration and special-circumstances wording. It leaves separately titled general social assistance, emergency medical transport and personal safety projects outside this edition. The project year follows the disclosure period, with the approval date preserved separately. Records without a published ID retain the original filename and row. The later disclosures can report cumulative grant figures. Use one cumulative file per year, rather than adding successive quarters. For 2020 the original four quarterly files are distinct. [Grant catalogue and license](https://data.gov.tw/dataset/86171)

Every numeric municipality-year approval in the audit reconciles to the corresponding disclosure rows. The first-quarter 2020 grants total NT$2,864,104. The fourth quarter discloses an additional NT$157,913 for Yunlin, bringing the selected disclosure total to NT$3,022,017. The earlier audited execution stays scoped to its own table. The 2021 Nantou approval links two project IDs. Blank execution fields stay blank. The draft national report's subsidy total agrees with the disclosures for 2020–24. In 2025 the two sources both count 13 records and show totals of NT$3,286,067 and NT$2,411,383 respectively. Project-level adjustments in the draft are unknown. None of these tables identifies household payments. [National Audit Office table 1](https://auditreport.audit.gov.tw/ServerFile/Get/638573190397480977e28dae24a83a4309b820c26a9b5af944) [Government draft appendix 9-5](https://crc.sfaa.gov.tw/Uploadfile/Document/34_20260421151924_1572129.pdf#page=186)

The 2023 survey gives weighted estimates of difficulties respondents attributed to lacking a national ID. New Taipei, Taoyuan and Kaohsiung share city and year labels with the grant files. Survey respondents and the program’s eligible population use different definitions. There is no coverage ratio or outcome estimate. A separate administrative audit identified 16 people who received family assistance in later records and did not appear in the earlier Fund list. Follow-up requires comparable recent execution records, a program eligibility denominator and aggregate service or outcome data. [Survey table 5-10](https://www.immigration.gov.tw/media/107730/112%E5%B9%B4%E6%96%B0%E4%BD%8F%E6%B0%91%E7%94%9F%E6%B4%BB%E9%9C%80%E6%B1%82%E8%AA%BF%E6%9F%A5%E5%A0%B1%E5%91%8A.pdf#page=158) [Audit finding](https://auditreport.audit.gov.tw/ServerFile/Get/638573194013968900e647369a31824f6da45db49a671b041a)

The [CSV pins](../src/data/taiwan-assistance-inputs.tsv) give original URLs, sizes, SHA-256, encodings and selection counts. The [editorial transcription](../src/data/taiwan-assistance-evidence.json) records the audit, survey and government draft table coordinates and the two captured PDF fingerprints. The official audit is directly inspectable in a browser. Its separate direct binary request returned a challenge page, so no binary fingerprint is supplied for the audit. Download the ten CSVs and the two pinned PDFs under the recorded filenames before rebuilding.

```sh
python3 scripts/build-taiwan-assistance.py --input-dir /path/to/captures --out-dir /path/to/new-rebuild
diff -r public/data/funding-flows/taiwan-municipal-assistance /path/to/new-rebuild
npm run build
node scripts/check-taiwan-assistance.mjs
```

## Brazil federal transfers to civil society

The [Brazil federal transfer edition](https://charitology.com/record/funding-flows/brazil-transferegov/) joins proposal, agreement and disbursement files in the [Transferegov public downloads](https://api-publica.transferegov.gestao.gov.br/downloads). It uses exact proposal IDs and agreement numbers and requires a valid CNPJ on a proposal that Transferegov classifies as a civil society organization. The two calendar years include 12,058 bank-order rows in 7,900 agreements for 3,811 organization identifiers. The published [manifest](../public/data/funding-flows/brazil-transferegov/manifest.json) records the three archive fingerprints, field definitions, coverage and the dataset's ODbL 1.0 license.

The detail amount is federal money made available to the agreement account. The date comes from the bank order. The agreement amount is the federal contribution as listed at capture and appears once per agreement in JSON. The bank-order CSV excludes the agreement amount. The projection leaves out personal, address, contact, banking and narrative fields. The proponent state requires independent service-location evidence before any comparison with local need.

Rebuild from the exact three archive captures and the field model saved as `modelo-dados-real.zip`. The manifest links the original files. Live publisher downloads can change, so retain each dated capture used for an edition.

```sh
python3 scripts/build-brazil-transferegov.py /path/to/captures /path/to/new-brazil-output
node scripts/check-brazil-transferegov.mjs
```

### Planned locations in Brazil

The [planned-location lookup](https://charitology.com/record/funding-flows/brazil-planned-geography/) joins 20,219 goals to all 7,900 agreements in the pinned 2024–2025 bank-order edition. Both the proposal ID and agreement number must match. Each goal has a distinct Transferegov ID and one-based source record coordinate. A reported state and exact code or unique normalized municipality name must match the [2025 IBGE territorial division](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/divisao-regional/23701-divisao-territorial-brasileira.html?edicao=43194&t=acesso-ao-produto). Each retained municipality has its workbook XML row coordinate. The [edition manifest](../public/data/funding-flows/brazil-planned-geography/manifest.json) records the exact source bytes, date, field order, record counts and fingerprints.

11,329 goals match 953 municipality codes. 8,871 have a missing state or municipality field and 19 have both fields but no unique match. At the agreement level, 4,491 have complete goal-level location coverage, 693 have partial coverage and 2,716 have none. 86 agreements have goals in multiple matched municipalities. 150 have at least one matched goal in a different state from the proponent. The exact intersection for each year requires a bank order in that year and a goal with at least one planned day in that year. Those intersections retain their own denominators and can overlap across years. Neither a plan nor overlapping dates allocate a bank order to a goal or prove work took place.

The [Cisternas case](https://charitology.com/record/funding-flows/brazil-cisterns/#planned) demonstrates why separate location evidence matters. The work-plan archive lists Santarém on six goals for agreement 945310 and leaves five without a linked municipality. The 2025 tender names its two lots in Óbidos and Oriximiná. Keep the tender locations, plans, census denominators and operator report at their respective scopes. [Work-plan archive](https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov/siconv_meta_crono_fisico.zip) · [2025 tender](https://www.gov.br/mds/pt-br/acoes-e-programas/acesso-a-alimentos-e-a-agua/programa-cisternas/editais-de-chamada-publica/2025/01-2025_ceaps_edital.pdf).

The site searches by municipality or IBGE code, exact agreement or CNPJ, reported state and bank-order-year overlap. CSV and JSON export all matched goals, including unresolved goals in agreement searches. Goal exports leave out payment amounts, free text, addresses and personal fields. The separately pinned financial edition retains its own bank-order exports and currency. Rebuild using `siconv_meta_crono_fisico.zip`, `DTB_2025.zip` and `modelo-dados-real.zip` with the exact pinned bytes. The two available official work-plan captures produced the same selected goal rows. The builder uses the earlier retained capture named in the manifest.

\`\`\`sh
python3 scripts/build-brazil-planned-geography.py /path/to/captures /path/to/new-output
npm run build
node scripts/check-brazil-planned-geography.mjs
\`\`\`

The next Brazil geography work is ordered by what it would resolve.

1. Qualify work-plan adjustment records by exact agreement and revision date. Test whether the source supplies historical locations, and leave version history unknown where it does not. [Transferegov announcement](https://www.gov.br/transferegov/pt-br/noticias/noticias/2024/outubro/transferegov-br-disponibiliza-novas-informacoes).
2. Look for inspection or acceptance records with a distinct worksite and an exact agreement or lot identifier. Retain report dates and unresolved joins before comparing planned and observed locations.
3. Add local need denominators only where the population, geography, date and intervention in the selected case support a comparison. Prioritize places with missing delivery evidence and keep outputs distinct from outcomes.

### Civil society registration links

The [Brazil registry comparison](https://charitology.com/record/charity-index/brazil/) checks all 3,811 full CNPJs in the transfer edition against the August 2026 Mapa das OSCs CSV. It finds one exact record for 3,645 identifiers, covering 7,598 agreements and 11,651 bank orders. The remaining 166 identifiers cover 302 agreements and 407 orders. The full establishment number is the sole match key. The UI links each result to the separate agreements and orders and shows the amount reported made available by bank-order year in BRL. Registry dates, proposal locations and where services took place describe different observations.

The [registry manifest](../public/data/charity-registry/brazil-osc/manifest.json) pins the original CSV, the variable dictionary and the separate Transferegov asset. The publication retains the full identifier, data-record number, administrative status, office type and state code. Addresses, people, contact details and coordinates are excluded. The registry projection and registry-only downloads retain the terms of Ipea’s Base de Dados das Organizações da Sociedade Civil, accessed November 11, 2026. [Ipea catalog](https://mapaosc.ipea.gov.br/base-dados) · [Ipea terms](https://mapaosc.ipea.gov.br/termosuso).

Rebuild from the exact archived CSV without network access, or stream it from the official URL with `--fetch`. The builder verifies the entire raw file and retains only the projected fields. The checker independently re-totals the bank orders by year, counts each agreement once and checks the two-way site links.

```sh
python3 scripts/build-brazil-osc-registry.py --csv /path/to/20260806_MOSC_baseDivulgacao.csv /path/to/new-output
npm run build
node scripts/check-brazil-osc-registry.mjs
```

### Solidarity kitchens account movements

The [agreement-account payment trace](https://charitology.com/record/funding-flows/brazil-solidarity-kitchens/account-payments/) matches the signed terms in the solidarity kitchens case to 5,398 reported movements. The exact join uses the public agreement number. Internal transfers to the agreement holder have a separate onward-record file linked by the unique financial movement ID. The source leaves some onward amounts missing. Each stage keeps its own totals. The files carry no federal bank-order identifier linking a particular disbursement to a particular payment. Partner contributions and tax records use separate archives. The latest calendar year is partial. The public projection contains aggregates and source references.

Rebuild from the four Transferegov archives named in `src/data/brazil-solidarity-kitchen-payments.json`. Use the exact captured bytes. The builder checks their hashes and the solidarity kitchens case hash before reading the rows. Ordinary site builds use the committed projection.

```sh
python3 scripts/build-brazil-kitchen-account-payments.py /path/to/captures /path/to/brazil-solidarity-kitchen-payments.json
npm run build
node scripts/check-brazil-kitchen-account-payments.mjs
```

## Brazil infrastructure projects and physical progress

The [project directory](https://charitology.com/record/funding-flows/brazil-project-execution/) links 88 of the 7,900 agreements in the 2024–2025 bank-order edition to 88 Obrasgov projects. The pair of issuing unit and commitment number must identify one agreement in the full SICONV archive and one project in the full CIPI archive. The selected scope contains 216 pairs, each with one row from each archive, and 234 orders from the pinned transfer edition. Keep the two versions of each commitment and the agreement bank orders in separate stages. A bank order makes funds available to the agreement. Project-level expenditure requires its own source.

Obrasgov returned 95 registered location records for the 88 projects. Comparing distinct IBGE codes with the pinned work plans yields 72 exact municipality sets, three partial overlaps, seven different sets and six without a linked planned municipality. Current physical records cover 64 projects. The separate bulk archive contributes 63 rows across 61 projects. The archive preserves its raw status codes and duplicate-valued rows with different coordinates. Five projects report 100% physical progress in the current API while their project status reads in progress. The record distinguishes that status, the dated physical report and site acceptance.

The two health renovation cases use official notices tied to agreements 895978 and 953157. The 2022 IBGE Census preliminary sample provides separate municipal population and disability estimates for São José dos Campos and Joaçaba. The municipal population, clinic users and project effects require distinct evidence. The next research step is a signed site acceptance record or a published facility activity series with matching identifiers and dates. [Transferegov downloads](https://api-publica.transferegov.gestao.gov.br/downloads) · [Obrasgov API](https://api-publica.obrasgov.gestao.gov.br/obras/docs) · [IBGE table 10125](https://apisidra.ibge.gov.br/values/t/10125/n6/4209003,3549904/v/all/p/2022).

The edition JSON pins three bulk archives, the two linked Charitology projections, the Obrasgov version and each API response, and the exact IBGE query. Save the exact source ZIPs as `siconv_empenho.zip`, `siconv_empenho_cipi.zip` and `siconv_execucao_fisica_cipi.zip`. Save the project, geography and physical responses under `obrasgov/<project>-<endpoint>.json`, the publisher version at `obrasgov/version.json`, and the census response as `ibge-10125.json`. Use the request URLs in the edition JSON. Fetching after the pinned publisher version changes requires a new edition. The build emits JSON and five CSVs with source coordinates, coverage and period or date fields where available. The Obrasgov/Transferegov data carry the Open Database License. The selected census values retain IBGE attribution. Published fields exclude addresses, precise coordinates and records about individuals.

```sh
python3 scripts/build-brazil-project-execution.py --inputs /path/to/captures /path/to/rebuilt-execution.json
npm run build
node scripts/check-brazil-project-execution.mjs
```

### Contract records and conflicting portal references

The [infrastructure contract lookup](https://charitology.com/record/funding-flows/brazil-project-contracts/) pairs 84 CIPI rows to 65 SICONV contract and procurement references across 63 of the 88 infrastructure agreements. First join the exact CIPI project ID. Then match contract number, signing date, global amount and a checksum-valid institutional CNPJ inside the same agreement. The procurement archive maps its original ID to one agreement in the complete file. Require a unique SICONV pair of procurement ID and contract ID in the complete contract archive. Those two fields stay together because the contract ID can repeat across procurements. Source dates keep their original signing, publication and term meanings.

Seventeen matched references have repeated CIPI source rows. Five of the 77 distinct portal references appear under more than one contract. The affected rows preserve their source coordinates and reference numbers. In the two health cases the archived deep links loaded a page that asked for a proposal instead of displaying a contract. The numbers stay visible as archive references. Use the paired CSV for one row per match. The separate CIPI CSV keeps every original row and omits amounts to avoid duplicating the paired figures. A reported global contract amount describes contract scope. The accumulated amount field is blank on all selected CIPI rows. Payments, changes to contract value, signed acceptance and service results require separate sources.

The builder pins the full prior project edition and the three official ZIPs. Save the captured files as `siconv_contrato_cipi.zip`, `siconv_contrato.zip` and `siconv_licitacao.zip`. The edition JSON gives original file hashes and row coordinates. The projection publishes institutional contract references, dates and amounts. It excludes supplier names, taxpayer IDs and free-text fields. [CIPI works manual](https://www.gov.br/transferegov/pt-br/manuais/obras/1-manual-do-usuario-cipi.pdf) · [Transferegov works guidance](https://www.gov.br/transferegov/pt-br/manuais/transferegov/obras).

```sh
python3 scripts/build-brazil-project-contracts.py --inputs /path/to/captures /path/to/rebuilt-contracts.json
npm run build
node scripts/check-brazil-project-contracts.mjs
```

### Proposal-level works monitoring and accumulated amounts

The [works monitoring lookup](https://charitology.com/record/funding-flows/brazil-works-measurements/) joins the complete Transferegov monitoring archive to the pinned infrastructure proposals by the original proposal ID. It finds 60 monitoring rows for 58 of 88 proposals. Fifty-eight distinct measurements have complete reported periods across 56 proposals. Two additional monitoring records leave measurement ID, status and period blank. The source labels 21 measurements accepted and 26 attested. The status applies to the measurement. Signed acceptance of the work site and actual expenditure require distinct records.

The separate accumulated amounts archive yields 19 work-item rows on 18 monitoring contract IDs. Each ID identifies one proposal in the full monitoring archive. The publisher's data model assigns the work-item ID to its measurement subgoal table. The procurement subgoal uses a different source table. The lookup therefore connects accumulated amounts to proposals and keeps the original work-item reference. It assigns no procurement contract, named work item or location to those amounts.

All 19 rows report a total, eight report a grantor figure and 18 each report recipient and company figures. These are reported accumulated work values in reais. The item archive gives no measurement period. In one São José dos Campos row the four fields repeat BRL 341,200.00. Adding the columns would count the same reported figure more than once. The Joaçaba proposal has two accepted measurement records and no accumulated item row in this capture. The CSVs preserve nulls and keep the amounts out of the dated measurement table. Each published item carries the source row and its original monitoring and work-item IDs.

Rebuild with the two pinned `siconv_acomp_obras_*.zip` sources named in the edition JSON. The builder also checks the exact upstream project edition hash. It excludes supplier IDs, names and free-text fields from the projection. [Transferegov data model](https://www.gov.br/transferegov/pt-br/ferramentas-gestao/paineis-gerenciais/arquivos/modelo-dados-csvs-discricionarias-e-legais.zip/@@display-file/file) · [Works monitoring and grantor review](https://www.gov.br/transferegov/pt-br/manuais/transferegov/obras/obras/8-tutorial_acompanhamento-de-obra-concedente.pdf).

```sh
python3 scripts/build-brazil-works-measurements.py --inputs /path/to/captures /path/to/rebuilt-works.json
npm run build
node scripts/check-brazil-works-measurements.mjs
```

### Agreement-account movements and onward reconciliation

The [infrastructure account lookup](https://charitology.com/record/funding-flows/brazil-infrastructure-account-movements/) links 2,504 movement rows across 84 of the 88 infrastructure agreements by the original agreement number. The 205 agreement-year aggregates span 2018–2026. The 2026 capture is partial. The annual figures come from the payment archive. When a displayed account year falls in 2024 or 2025, the separate bank-order column uses only the original project edition. Each bank order records funds made available to the agreement account. The account file ends at payment documents and agreement references. Linking a specific bank order to a payment, or a payment to a procurement contract or work site, requires another source.

The payment totals cover 1,420 invoice or CNPJ receipt rows with checksum-valid institutional identifiers. The counts preserve 444 other outward rows whose amounts stay outside the projection. The 640 holder-transfer amounts require an exact match to the original agreement holder CNPJ. The build retains no payee identifiers, names, payment dates or individual amounts. Published amounts stay in integer BRL cents. Observed zero amounts stay zero. Cells with no qualified source rows have a null amount.

The onward file shares the financial movement ID. Each selected holder transfer has a unique parent in the complete payment archive. The 1,114 onward rows match the amount for 188 parent transfers and leave at least one amount unknown for 452. Count the parent transfer once. Onward reconciliation is a separate count table and adds no amount to the payment view. In Joaçaba, nine invoice-labeled institutional payments fall in 2025 and five in the captured part of 2026. São José dos Campos has four institutional payments in 2023 and three holder transfers across 2023 and 2024 with equal recorded onward amounts.

Rebuild with `siconv_pagamento.zip` and `siconv_obtv_convenente.zip` at the exact fingerprints in the JSON. The builder checks the full upstream project edition as well as the complete source row counts. The invoice-item edition below follows the document ID to gross item amounts. A joint expense and work-site or procurement reference remains a separate source requirement. [Transferegov data catalogue](https://www.gov.br/transferegov/pt-br/ferramentas-gestao/dados-abertos/download-dados) · [Official transfer guide](https://www.gov.br/transferegov/pt-br/manuais/transferegov/discricionarias/execucao/11-tutorial_obtv-convenente_convenios_convenente.pdf).

```sh
python3 scripts/build-brazil-infrastructure-account-movements.py --inputs /path/to/captures /path/to/rebuilt-account-movements.json
npm run build
node scripts/check-brazil-infrastructure-account-movements.mjs
```

### Institutional payments and invoice items

The [infrastructure invoice item lookup](https://charitology.com/record/funding-flows/brazil-infrastructure-invoice-items/) matches the published expense document ID, `ID_DL`, between `siconv_pagamento` and `siconv_itens_dl`. The builder reproduces the earlier account edition's institutional payment counts and cents for every agreement and payment year. It then checks all references to each matched document across the full payment archive. Payments sharing a document must belong to one agreement and agree on institutional recipient, document type and issue day. These checks leave 1,420 payment rows on 1,382 documents in 80 of the 88 infrastructure agreements.

The item archive contains 1,675 linked source rows. It repeats 38 rows across 32 documents. An item ID counts once when its full parsed row repeats exactly. A conflicting item ID or an unknown item amount leaves the document unresolved. The 1,637 distinct items and all captured payments compare at document scope. Gross item amounts equal the payments for 877 documents and exceed them for 505. The [official document guide](https://www.gov.br/transferegov/pt-br/manuais/transferegov/discricionarias/execucao/8-tutorial_documento-de-liquidacao_convenios_convenente.pdf) describes gross item totals, taxes, deductions and net payment as separate fields. The [public tax archive](https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov/siconv_pagamento_tributo.zip) has agreement, date and amount fields. Resolving a specific difference requires a document-level source.

The 175 comparison rows group documents by original issue year. The payment date range shows when the captured money moved. Six documents have payment records spanning more than one year. The 2026 issue-year group is partial. For Joaçaba, 11 documents issued in 2025 have BRL 958,415.40 in gross item amounts and BRL 926,975.87 in captured payments across 2025 and 2026. The account and invoice views repeat the same payments on different calendar bases. Keep the document, payment, bank order, contract and works scopes separate.

The projection publishes agreement-year counts and amounts in exact BRL cents. Individual dates, document and item IDs, supplier fields and free text stay outside the exports. The edition pins the two source ZIPs and both upstream Charitology editions. The [official release history](https://repositorio.dados.gov.br/seges/detru/historico_de_versoes.pdf) identifies the expense document and procurement item archives as separate source tables. The procurement item header uses a distinct item ID, and the invoice item header carries no contract or work-site ID. The document headers in the next section link the payments to procurement and the subset with verified contracts. A primary record linking a payment to a procurement line item or named work site remains the next gap. [Transferegov open data and license](https://api-publica.transferegov.gestao.gov.br/).

```sh
python3 scripts/build-brazil-infrastructure-invoice-items.py --inputs /path/to/captures /path/to/rebuilt-invoice-items.json
npm run build
node scripts/check-brazil-infrastructure-invoice-items.mjs
```

### Procurement and verified contract payments

The [procurement payment lookup](https://charitology.com/record/funding-flows/brazil-infrastructure-procurement-payments/) follows the same 1,420 institutional payments through 1,382 expense documents to 334 procurement records in 80 agreements. The public `siconv_dl` document header links the original proposal and procurement ID. The build requires one header for the document, the same proposal, normalized issue date and document type, and one official procurement record for the original agreement. It checks the payment scope against the full payment archive and reproduces the exact invoice cohort counts and cents.

In the contract subset, 211 documents name a procurement and contract pair that appears once in the complete SICONV contract archive. The supplier's institutional identifier matches the payment recipient. Those documents cover 58 contracts in 12 agreements. The other coverage states are 1,157 documents with no supplied contract ID and 14 with a pair absent from the captured contract archive. The procurement reference remains supported in all these cases. The verified pairs differ from those in the separate CIPI-linked works contract edition.

Each procurement row gives captured payment dates as calendar-year bounds. The contract rows repeat a subset of the procurement payments. The invoice and account editions repeat those movements on different grouping bases. The projection publishes source coordinates for procurement and contract records, with aggregate exact BRL cents. Contract amounts, expense-document amounts, tax deductions, work-site allocation and verified delivery belong to separate records. [Official public catalogue](https://api-publica.transferegov.gestao.gov.br/downloads) · [Official document guide](https://www.gov.br/transferegov/pt-br/manuais/transferegov/discricionarias/execucao/8-tutorial_documento-de-liquidacao_convenios_convenente.pdf).

```sh
python3 scripts/build-brazil-infrastructure-procurement-payments.py --inputs /path/to/captures /path/to/rebuilt-procurement-payments.json
npm run build
node scripts/check-brazil-infrastructure-procurement-payments.mjs
```

### Works contract lots and start authorizations

The [works lot lookup](https://charitology.com/record/funding-flows/brazil-infrastructure-work-lots/) links 55 of 65 CIPI-backed contracts to 57 lots in 53 agreements. It requires the same proposal, a checksum-valid institutional supplier identifier, the printed contract number and signing day. It checks the signature across the full contract archive before linking the unique works contract and its lots. The 58 contracts verified in the payment cohort have no exact works match in this capture.

The works files link 73 planned subgoals by instrument and lot. Each published row retains its tendered amount, planned start, budget reference date and locality code. A budget locality code describes the budget record. Assigning work to a site requires a location reference at the lot or subgoal level. The authorization archive has 53 instrument records, including 51 with a recorded issue date. A recorded authorization, the actual start, the amount paid and the work measured are separate observations. [Official download catalogue](https://api-publica.transferegov.gestao.gov.br/downloads) · [Official works process](https://www.gov.br/transferegov/pt-br/manuais/transferegov/obras).

```sh
python3 scripts/build-brazil-infrastructure-work-lots.py --inputs /path/to/captures /path/to/rebuilt-work-lots.json
npm run build
node scripts/check-brazil-infrastructure-work-lots.mjs
```

### Paid procurements and works-lot references

The [procurement and works-lot comparison](https://charitology.com/record/funding-flows/brazil-infrastructure-procurement-lots/) joins the exact agreement, proposal, project and procurement IDs in the two pinned editions. It finds 53 of 334 paid procurements with 55 observed works-lot references. The 53 procurements record 340 payment rows and BRL 73,704,844.41. Their 332 expense documents supply no payment-side contract IDs. Count the payment amount once per procurement, including the two procurements with multiple works-lot references. Use the lot-reference CSV to inspect work identifiers.

The Joaçaba case uses the two signed documents to identify the clinic and work packages. It retains the signed and CIPI amounts separately, including the BRL 23.24 difference on lot 2. The independent referral comparison uses PDF pages 234 and 249 of the state plan and the published CNES designation. The exact query in the case JSON covers both census variables for all 53 municipalities. The work acceptance record, allocation of procurement payments by lot and measured service changes remain open. [State plan](https://www.saude.sc.gov.br/index.php/pt/legislacao/legislacao-geral/deliberacoes/deliberacoes-2025/017-06-02-par-atualizacao-da-rede-de-cuidados-a-saude-da-pessoa-com-deficiencia/download) · [IBGE table 10125](https://sidra.ibge.gov.br/tabela/10125).

```sh
node scripts/build-brazil-infrastructure-procurement-lots.mjs /path/to/rebuilt-procurement-lots.json
npm run build
node scripts/check-brazil-infrastructure-procurement-lots.mjs
```

The [clinic operating funds](https://charitology.com/record/funding-flows/brazil-infrastructure-procurement-lots/#operations) trace FNS bank order 029513 to the Joaçaba municipal health fund by fund CNPJ, program and ordinance code `05402`. The `case.json` projection keeps the order within the wider 2024 outpatient and hospital funding category. The 2025 detail exceeds its summary by BRL 11,373.03. Two orders of that amount have distinct numbers and dates. The 2026 capture runs through November.

The signed municipal contract records the conditional funding commitment to the clinic operator. The state hearing allocation, related municipal award, later state expansion and shared service targets have separate source coordinates. Next, seek municipal ledger entries and invoices tied to contract 23/2024/FMS and award 12/2025. Work acceptance and observed outcomes require their own records. [FNS public payment portal](https://consultafns.saude.gov.br/#/detalhada) · [Unoesc legal publication](https://www.unoesc.edu.br/blog/publicacoes-legais/contrato-23-2024-fundo-municipal-de-saude-de-joacaba/).

To replay the transfer projection, save the exact responses in `operations.fundTransfers` under the file names listed below. Replace `YY` with `24`, `25` or `26`. The builder checks captured bytes before projecting only institutional and transaction fields. The live source may change after the capture date.

| Source receipt | Capture filename |
| --- | --- |
| `yearly[].sources.entity` | `fns-entity-YY.json` |
| `yearly[].sources.summary` | `fns-actions-YY.json` |
| `yearly[].sources.detail` | `fns-MAC-YY.json` |
| `exactOrdinanceOrder.filteredSource` | `fns-05402-24.json` |

```sh
node scripts/build-brazil-joacaba-fund-transfers.mjs /path/to/captures /path/to/new-projection.json
```

### Joaçaba outpatient and hearing-care reporting

The [outpatient case](https://charitology.com/record/funding-flows/brazil-infrastructure-procurement-lots/joacaba-outpatient/) joins CNES 2964511 to two aggregate reporting sources. The official ElastiCNES approved-unit field yields 31 observed months and an unknown count for August 2026. A second query to the same dashboard groups by year and agrees with the summed months. The field labeled submitted quantity repeats the approved monetary value in all 31 observed months and is excluded from quantity comparisons. [ElastiCNES documentation](https://wiki.datasus.gov.br/cnes/index.php/Pain%C3%A9is_ElastiCNES).

The hearing-care data adapt Henrique Saraiva’s CC BY 4.0 edition. The replay reads 951 aggregate rows for the facility and reconciles eight groups to its publisher’s facility summary. It verifies positive codes against the printed annex by exact identifier. There are nine positive codes, eight printed in the annex. The published projection omits residential geography. The hearing-care series groups by processing month. It overlaps the wider outpatient system, so keep the two series separate when counting approved units. Two follow-up codes printed in the annex are outside the hearing extraction. Assessing target attainment would require service-date counts for the same activities and eligible population. [Research edition](https://data.mendeley.com/datasets/3frvgfn47t/1) · [Signed annex](https://www.unoesc.edu.br/wp-content/uploads/2024/10/Anexo-I-_-Termo-TCGA-assinado.pdf#page=2).

Save the four research files under the names in `hearing.captures` and the signed annex as `annex.pdf`. The dashboard capture sends only aggregate queries for the selected facility and date range. The builder checks the exact fingerprints, so a changed live response needs a new review. For an offline replay, reconstruct `outpatient-elasticnes.json` from the published JSON's `outpatient` object, removing `capturedOn` and `snapshot` and writing the remainder with two-space indentation and a terminal newline. The checker verifies that reconstruction. [Committed projection](../src/data/funding-flows/brazil-joacaba-outpatient.json).

```sh
node scripts/capture-brazil-joacaba-outpatient.mjs /path/to/captures/outpatient-elasticnes.json
python3 scripts/build-brazil-joacaba-outpatient.py /path/to/captures /path/to/new-projection.json
npm run build
node scripts/check-brazil-joacaba-outpatient.mjs
```

## Brazil Cisternas agreement and water access

The [Cisternas case](https://charitology.com/record/funding-flows/brazil-cisterns/) follows agreement 945310 and its exact proposal and organization IDs. Its eleven bank orders show BRL 31,499,882.76 made available in 2023–2026. The six pinned Transferegov archives identify the original agreement, amendment and reported movements from the agreement account. The 2026 records cover the November 11 capture. The current federal contribution, reported bank orders, account payments and internal transfers belong to different stages. The named-payee subset uses the full CNPJ and exact agreement number. It stays inside the other-payment total. All 190 selected internal transfers have an onward record with a missing amount.

The three public calls identify planned water systems and selected organizations. The 2025 call ties the first amendment to planned lots in Óbidos and Oriximiná. It allows a comparison with IBGE 2022 Census table 10103 for quilombola residents in rural areas within quilombola territories in those municipalities. Table 6909 supplies a separate all-resident piped-water measure. The denominators describe residents and the tender counts installations. The single operator report from Pinhel links by implementing organizations and a planned site. Its publication supplies no agreement or lot ID. The separate water-quality study concerns other sites. The case contains no verified expenditure by lot, complete installation audit or water-quality result for the funded work.

The [case data](../src/data/funding-flows/brazil-cisterns.json) names the six archives and two official census responses with exact file sizes, hashes, columns, coordinates and links. Save those exact files in one capture directory under their listed names. Download URLs can serve a later edition. The source check refuses substituted bytes. It only uses the two published institutional identifiers and never emits individual payee data. Documentary sources are checked against the linked tender pages and notices. Routine builds and checks use the committed case.

```sh
python3 scripts/check-brazil-cisterns-sources.py /path/to/captures
npm run build
node scripts/check-brazil-cisterns.mjs
```

The JSON carries the full case and citations. Four CSV exports keep bank orders, account payment aggregates, named-payee subsets and census measures distinct. A blank amount for an internal-transfer year with no rows preserves absence. Reported zero values stay present. Use the [coverage page](https://charitology.com/record/charity-index/coverage/) and its correction route for this edition.

## Mexico financial reports and authorization directories

The [Mexico financial edition](https://charitology.com/record/charity-financials/mexico/) includes 11,916 institutional RFCs across three SAT financial reports and two directory workbooks. 11,881 institutions have at least one financial record and 9,601 have all three. The 32,368 periods cover fiscal years 2023, 2024 and 2025. Each file contains at most one record per complete institutional RFC for its fiscal year. The financial report’s legal name, location and authorization category stay with the period. The directory has one row per authorized activity. The projection groups those activities by exact RFC and directory edition, preserving a worksheet row number with each activity. Both workbooks reference the January 9, 2026 Gazette publication.

The selected financial columns keep Mexican pesos as exact cents, with blank and reported zero distinct. The four donation categories describe cash and in-kind amounts from domestic and foreign sources. Income and expenditure lines keep their source definitions. They cannot identify a particular payment, a municipality where a program operated or a program outcome. The projections exclude addresses, representative and contact data, and role-level compensation. [SAT open data and reuse](https://www.sat.gob.mx/minisitio/DatosAbiertos/index.html) · [Financial reports](https://www.sat.gob.mx/minisitio/DatosAbiertos/informes.html) · [Directories](https://www.sat.gob.mx/minisitio/DonatariasAutorizadas/padron_directorio.html).

The [manifest](../public/data/charity-financials/mx/manifest.json) pins three CSVs, two XLSX workbooks and the field dictionary. It also lists the HTTPS finance ministry PDFs used to cross-check all 32,368 institution-year identifiers and each year’s national totals for the four donation fields. The 2023 and 2024 CSVs use the publisher’s listed HTTP addresses. Each source’s exact archived bytes are required. The original source file’s coordinate is a one-based CSV data record after the header, or the printed worksheet row for directory entries.

```sh
python3 scripts/build-mx-charity-financials.py /path/to/captures /path/to/organizations.json.gz
npm run build
node scripts/check-mx-charity-financials.mjs
```

Search works in the browser by institutional RFC or name from any selected year. The two CSV exports preserve separate financial periods and directory activity rows. The JSON includes the manifest and displayed records. For a current authorization decision, consult SAT’s directory and notices. The Index does not infer current eligibility from a historic financial or directory observation.

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

The regulator’s organization directory lists 15,292 rows in the November 11, 2026 capture, with 15,292 distinct printed references. Two official responses with different HTML fingerprints yield the same directory counts. The reference formats describe displayed strings. Of the normalized names, 69 appear with more than one reference. The regulator’s advisory says updated certificates carry the original date and number alongside the new number. Use an authoritative crosswalk or those certificates for historical joins and a qualified filing source for organization-level finances. The [directory export](https://charitology.com/record/charity-financials/kenya/directory.json) retains only counts and source receipts. [Public directory](https://pbora.go.ke/pbos) · [Transition advisory](https://pbora.go.ke/authority-rolls-out-transition-process-ngos-under-pbo-act).

Rebuild from the three exact report PDFs named in `src/data/kenya-pbo-coverage.json`, using `pypdfium2==5.14.0`. Normal builds read the committed projection without fetching any report. The check compares the built JSON and CSV exports to the projection, including every amount and its source coordinates.

```sh
python3 scripts/build-kenya-pbo-coverage.py /path/to/captures /path/to/kenya-pbo-coverage.json
npm run build
python3 scripts/check-kenya-pbo-coverage.py
```

To reproduce the directory measurements, save the two official responses from the links in the directory JSON and run the command below. The script requires equal measurements across both responses. Live responses can change. Compare the export’s fingerprints for a replay of the original capture.

```sh
python3 scripts/build-kenya-pbo-directory-coverage.py 2026-11-11 /path/to/pbora.html /path/to/pbora-www.html /path/to/new-directory.json
```

### Cross-border nutrition project in western Kenya

The [western Kenya nutrition case](https://charitology.com/record/funding-flows/kenya-nutrition/) follows project `GB-CHC-299717-KY0002` from the grant manager to the UK charity and the Kenyan activity. An exact recipient organization and activity selects 12 manager rows from UK Aid Match II. Their original GBP amounts pair one to one with incoming funds in the UK file. One pair also shares a transaction date. The two charity files share the project period and participating organization references. The full Kenyan NGO number printed in Note 15 of the UK charity’s 2024 accounts gives the digits in the IATI organization reference. A link to a shortened PBORA directory number still needs a registry crosswalk. Their onward records align by reported quarter and date. Twelve amounts agree and one differs by GBP 0.11. Preserve the Kenyan record for Q10 under its literal code 3 despite the income wording in its reference.

The project’s reported original committed budget, the two payment stages and each publisher’s expenditure are separate series. The 2015/16 food poverty estimates for Busia and Bungoma predate the project. They come from KNBS Annex Table B1 and supply geographic context for the project description. The files supply neither a county spending allocation nor a causal estimate. To extend the trace, seek payment settlement references, a county cost breakdown or a documented independent evaluation. The related annual accounting case preserves the broader time and reporting scope separately.

Rebuild the fixed edition from the published fingerprints and exact URLs in the [data export](https://charitology.com/record/funding-flows/kenya-nutrition/data.json). Name the captures `manager.xml`, `uk.xml`, `kenya.xml`, `survey.pdf`, `FY24.pdf` and `project-page.html`. The manager capture is IATI’s D-Portal XML export of the publisher’s activity. The two charity XML files come directly from the publishers. The rebuild pins all six inputs and preserves activity-relative transaction positions. The three survey rates and standard errors are a visual transcription from PDF page 87 (printed page 85). The original files remain subject to their publisher terms. The projection excludes narrative, contact and personal fields.

```sh
python3 scripts/build-kenya-nutrition-trace.py /path/to/captures /path/to/rebuilt.json
cmp /path/to/rebuilt.json src/data/kenya-nutrition-trace.json
npm run build
node scripts/check-kenya-nutrition-trace.mjs
```

### Annual parent and subsidiary disclosures

The [Ripple Effect Kenya accounts trace](https://charitology.com/record/funding-flows/ripple-effect-kenya-accounts/) transcribes related-party and subsidiary notes from six publisher PDFs for the UK parent, charity 299717. The locally registered Kenya affiliate has one three-month period in 2019 and six full years through June 2025. The separate Africa Hub has two full selected years. The parent’s grant, the subsidiary’s receivable, reimbursements outside project delivery, year-end balances, income and expenditure retain separate fields. They use GBP as printed in the UK report. The Kenya entities prepare accounts in Kenyan shillings. Preserve expense signs as printed and keep these entity values apart from consolidated group totals.

The FY2021 grant values differ by GBP 40,045, with both amounts repeated in the FY2022 comparison. The balance and investment-income comparative also differ from the earlier report. The published notes leave the explanation open. The full Kenyan registration on the accounts supports the IATI identity link. The shortened PBORA references require a separate crosswalk. The notes cannot assign annual expenditure to the 2018–2021 project, a county or a participant. Project-level grants and expenditures remain in the separately bounded nutrition case.

The [JSON export](https://charitology.com/record/funding-flows/ripple-effect-kenya-accounts/data.json) lists the exact publisher PDF, file hash, printed page and PDF page for each of the two notes. Recheck the transcription against those pages, then run the build and optional capture check with the six `FY20.pdf` through `FY25.pdf` files and `kenya-directory.html` using the pinned fingerprints. Source documents retain publisher terms. The projection contains only selected institutional facts.

```sh
npm run build
node scripts/check-ripple-effect-kenya-accounts.mjs /path/to/captures
```

### Heal Nepal funding and two currencies

The [Heal Nepal case](https://charitology.com/record/funding-flows/heal-nepal/) selects 13 grant manager disbursements by the exact UK activity and organization. Twelve amounts pair one to one with UK receipts. The first pair refers to the same reported quarter and differs by GBP 0.01. The UK file names the Nepal organization and uses a shorter activity identifier. The publishers use the same project title and actual start date. Preserve the published strings in the exports.

The onward comparison groups seven UK disbursements and eight Nepal receipts by the dates and periods the publishers describe. One proposed counterpart is unresolved. Two additional Nepal receipts are recorded as test transfers. The UK reports pounds, and Nepal reports rupees. Exchange rates, settlement and project costs require underlying transfer or accounting records. Both publishers separately report revised committed budgets and expenditure. The public health roadmap supplies a national baseline of new detections from before the project. It has no project-level denominators or outcome comparisons.

The [JSON export](https://charitology.com/record/funding-flows/heal-nepal/data.json) records the source and fingerprint of each input. Use the original publisher file cached by IATI for the fund manager and the two original charity files. The manager endpoint’s TLS certificate was expired at capture. The [official IATI dataset index](https://bulk-data.iatistandard.org/datasets-minimal) identified the original URL and the validated cache. The 13 selected manager rows match the D-Portal version on reference, date, currency and amount. The data projection keeps only institutional financial fields. The national detections and rate are a visual transcription from PDF page 4. The publisher URLs can move to newer snapshots.

```sh
python3 scripts/build-heal-nepal-trace.py /path/to/captures /path/to/rebuilt.json
cmp /path/to/rebuilt.json src/data/heal-nepal-trace.json
npm run build
node scripts/check-heal-nepal-trace.mjs
```

### Western Cape nonprofit transfers and reported spending

The [Western Cape case](https://charitology.com/record/funding-flows/western-cape-transfers/) reconciles the 2024/25 and 2025/26 Annexure A tables from the provincial Department of Social Development. It preserves separate transfer and reported-spending amounts and excludes each annex’s separate table of budgeted but partially unpaid transfers. The earlier table has 1,092 detail rows and the later one has 1,104. Two independent parsers recover the same page, program, transfer and spending sequence. Grid coordinates locate the selected rows, including ones whose labels and explanations wrap.

The 2024/25 Disabilities and Child and Youth Care program subtotals account for both grand-total differences. All twelve 2025/26 program subtotals reconcile. The annual statement presents nonprofit transfers in thousands of rand. The annex presents amounts in whole rand. The same department publishes both series. Keep program subtotals, grand totals and detail rows from being summed together.

The Umelwane example links two project-labeled transfer rows to the trust name and institutional number in a historical official directory and current financial statements. The recipient’s February year-end grant aggregate has a different period and wider scope than the provincial March year-end project rows. Statistics South Africa’s 2022 provincial population is contextual. Project-wide costs and the eligible population require additional records.

The [JSON](https://charitology.com/record/funding-flows/western-cape-transfers/data.json) records exact URLs, digests and page coordinates for the two annexes, two full reports and the selected recipient statements. The program export covers 25 fiscal-year rows. The projection publishes summaries and one named project comparison. The other transferee labels and explanations stay in the original PDFs. Observe the [Western Cape Government copyright and reuse terms](https://www.westerncape.gov.za/terms-of-use) for the originals.

```sh
python3 -m pip install pypdf==6.21.4 pdfplumber==0.11.9
python3 scripts/build-western-cape-transfers.py /path/to/captures /path/to/rebuilt.json
cmp /path/to/rebuilt.json src/data/western-cape-transfers.json
npm run build
node scripts/check-western-cape-transfers.mjs
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

## Canada grant activities by country

The [Canadian grant geography lookup](https://charitology.com/record/funding-flows/canada-grant-geography/) summarizes T1441 disbursements for 27,312 worksheet rows linked to annual filings ending in 2023 or 2024. Exact joins require the charity account, fiscal period end and form version. Repeated worksheet sequences within the same filing cannot contribute twice. The form reports the geography of grant activities as given by the filer. A separate source would be needed for a recipient's receipt, final spending or the outcomes of the grant. [T1441 form and instructions](https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t1441.html).

The build recognizes complete country codes or labels in the CRA's English and French guides. It retains separate counts for unknown, unresolved, regional and multi-place rows. The two English tables match exactly in the current and 2023 guides. Blank geography stays unknown. Cash and noncash have separate reported totals, missing-amount counts and publication decisions. A country amount requires nonzero reported values from five or more distinct filer accounts in the same year and amount type. All remaining amounts stay together in an unallocated group. The data contain no grantee or filer identities, row-level grants or free-text purposes. [Current filing guide](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4033/t4033-completing-registered-charity-information-return.html) · [French guide](https://www.canada.ca/fr/agence-revenu/services/formulaires-publications/publications/t4033/t4033-comment-remplir-declaration-renseignements-organismes-bienfaisance-enregistres.html).

Rebuild from the four source CSVs and three guide files named in `src/data/ca-grant-geography.json`. The command verifies exact CSV bytes and the normalized country-code tables. The JSON export preserves source URLs and fingerprints, exclusions, coverage and the separate geographic and amount totals. A country row and the unallocated row are part of the corresponding reported total. Do not add the reported-total row again. Contains information from the Canada Revenue Agency under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).

```sh
python3 scripts/build-ca-grant-geography.py /path/to/captures /path/to/new-ca-grant-geography.json
npm run build
node scripts/check-ca-grant-geography.mjs
```

## New Zealand register and Tier 3 filings

The [New Zealand lookup](https://charitology.com/record/charity-index/new-zealand/) uses the dated public register to show 46,174 organization entries. It keeps the source organization ID, five-digit CC number, name, registry status and dates, and optional group ID. The regulator's source snapshot included 46,189 organizations across statuses. The projection excludes 15 rows outside the five-digit format. These counts describe the snapshot. [Charities Services open data](https://www.charities.govt.nz/charities-in-new-zealand/the-charities-register/open-data).

The return selection links 20,068 Tier 3 records ending in 2024 and 2025 to the exact organization ID. It preserves each annual return ID and complete period-end date. It selects source status 10, the code observed in sampled register-matched submitted returns. Group returns and other status codes remain outside the selection. The two published amount fields are gross income and total expenditure. An organization can have an individual return and a separately reported group association. The lookup gives no combined sector total.

The earlier and current Tier 3 standards both require presentation in New Zealand dollars. The projection preserves the source currency field and labels the basis for interpreting a blank field as NZD. It keeps explicit currency codes where present and the original signed whole amounts. Two sampled public register profiles matched both years by period and amounts. [Current standard, A24](https://standards.xrb.govt.nz/standards-navigator/tier-3-nfp-standard/) · [Earlier standard, A21](https://www.xrb.govt.nz/dmsdocument/658/) · [Register example CC48103](https://register.charities.govt.nz/Charity/CC48103) · [Register example CC48813](https://register.charities.govt.nz/Charity/CC48813).

Rebuild from the five allowlisted OData captures identified by exact URL and SHA-256 in the [manifest](../public/data/charity-registry/new-zealand/manifest.json). Use the five filenames `organisations.json`, `tier3-2024.json`, `tier3-2025.json`, `tiers.json` and `currencies.json`. The source URLs are live queries and may return different bytes over time. The output keeps organization and annual return IDs and excludes officer records and contact details. Source data adapted under [CC BY 3.0 New Zealand](https://creativecommons.org/licenses/by/3.0/nz/).

```sh
python3 scripts/build-nz-tier3.py /path/to/captures /path/to/new-output-directory
npm run build
node scripts/check-nz-tier3.mjs
```

## Iberia health center grants and audit schedules

The [Iberia case](https://charitology.com/record/funding-flows/iberia-hrsa/) connects four federal grant numbers and one exact federal recipient ID across HRSA and the Federal Audit Clearinghouse. The case includes 15 agency award-year records and all eight grant lines in three annual audit schedules ending in May 2023, 2024 and 2025. The IRS edition links the same EIN to organization-wide filings ending May 2022 and May 2023. Use those filings for a separate view of the whole organization. [HRSA’s data catalog](https://catalog.data.gov/dataset/grants) · [Federal Audit Clearinghouse data](https://www.fac.gov/data/)

The agency’s financial-assistance field is aggregated by grant and federal issue year in the Awarded Grants file. The audit PDFs show the center’s accrual-basis program receipts and expenses. The exports preserve each stage’s period and source coordinates. For H8GCS48002, the expenses reported in the two selected audit years total USD 323,046, which equals the federal FY 2023 award amount. Use the identifiers to connect the records. Transaction-level disbursements, bank receipts and outcomes remain unobserved here. A repeated H80 award amount in multiple federal years cannot identify an individual payment.

The capture scanned all 75,859 HRSA CSV records and three FAC general files. The FAC URLs labeled 2024, 2025 and 2026 each contained one qualifying public annual nonprofit record for the organization, ending in May 2023, 2024 and 2025 respectively. Use the dates and report IDs in the rows. The public JSON retains exact file fingerprints and PDF page locations. HRSA’s map query agrees with the 15 award-year amounts and project periods. The released projections exclude addresses and contact fields.

Each audit also identifies Iberia Parish as the location of most of the center’s patients. Three independent Census estimates describe insurance coverage among parish residents under age 65 in calendar years 2022–2024. The parish table preserves the denominator, uninsured counts and rates, and 90% margins of error. These periods overlap the audits. Parish-level spending and grant participant counts remain unknown. [Census source and methodology](https://www.census.gov/data/datasets/time-series/demo/sahie/estimates-acs.html)

```sh
npm run build
node scripts/check-iberia-hrsa.mjs
python3 scripts/check-iberia-hrsa-sources.py --fetch
```

The Python verifier streams the official CSV files and checks the award projection, public report selection, control totals and original PDF fingerprints. To verify retained source files offline, use `--source-dir DIRECTORY` with the original CSV and Excel file names, the three audit PDFs named by report ID, the original Census ZIP file names and `hrsa-award-map.json` for the recorded map response. The source sites may refresh the files. Reproducing this edition requires their exact fingerprints. The per-grant receipts and expenses can be read at the PDF pages in the export.

The next expansion should sample a second grantee with multiple linked audits, then test whether Treasury account-level disbursements can be matched with exact dates and award identifiers. Look for dated service-site records and grant-specific allocations. The parish location in these audits gives no share of each award attributable to that parish.

## Chile donation and residential care case

The [Chile case](https://charitology.com/record/funding-flows/chile-residential-care/) connects Fundación Rostros Nuevos to a public donee entry and transfer register by the same tax identifier. The 2025 residence awards carry that identifier. The 2024 resolution lists the foundation and five named residences, and three residence names correspond to the 2025 awards. The coverage figures come from the observed Law 21.440 donee register and four annual receipt workbooks. The broader Civil Registry catalog links to a dashboard, so this edition makes no claim to cover Chile's whole legal-person register.

The edition keeps five recipient-reported disclosures, three municipal register records, eight awards and three periods of consolidated accounts. The public awards and municipal entries describe different stages, and the annual accounts consolidate a subsidiary. The case presents the Casen 2024 national household result beside the 2024 awards as context. The survey populations and service geographies differ. It does not establish utilization at individual residences. The government program monitoring and management sources publish different 2024 counts, which remain separately sourced.

Rebuild the five data files from the exact original workbooks, three scoped transfer CSVs, public register HTML and evidence captures named in the edition. The capture source links may serve newer bytes. The generator checks the inputs and computes counts, values and row locators from the workbook and register originals. The case's award, financial statement and survey rows are editorial transcriptions with source page locators. Public downloads contain selected institutional fields and no donor, beneficiary or representative records.

```sh
python3 scripts/build-chile-residential-care.py /path/to/captures /path/to/rebuilt
diff -r public/data/funding-flows/chile-residential-care /path/to/rebuilt
npm run build
node scripts/check-chile-residential-care.mjs
```

## Chile award and payment ledger comparison

The [residential care payment lookup](https://charitology.com/record/funding-flows/chile-residential-payments/) transcribes all 37 award rows in SENADIS resolution 763/2025. They total CLP 15,762,384,000 for 19 institutional RUTs. Each amount and folio retains its PDF page and source row. The award directs payments to assignment 24.03.004. Use the RUT, issuer and assignment to compare with Presupuesto Abierto. Confirming a particular residence payment requires a document that links the ledger number to the award folio.

The source returns 169 ledger rows booked in 2025 on this assignment. The 19 exact award recipients account for 156 of those rows, and records for the other five RUTs appear in aggregate. The two captured views have 119 program rows and 100 award-recipient rows booked in 2026 through September. This is year-to-date ledger coverage. The 2026 view does not establish renewals of individual awards.

For Fundación Rostros Nuevos, the 2024 records with document numbers 1245, 12452 and 12452024 sum to CLP 650,260,000, matching its five published award amounts. The 2025 documents 19992025, 199920252 and 199920253 sum to CLP 409,596,000, matching its three published awards. Those groups have the same 40%, 30%, and 30% arithmetic split as the 2024 program rules. An additional 2025 accrual has a recorded paid value of zero and no payment date. The third matched 2025 document carries a payment date of January 2, 2026. Keep the booked year, original document number and last payment date visible. A documented payment date may represent the last installment for a ledger row, and a dated row can show a recorded paid value of zero. The exact allocation of these records to individual residences remains unknown. The portal's scoped grouped summaries independently agree with the underlying accrual totals, which differ from the sum of the raw paid-amount fields.

The 2025 program monitoring report gives CLP 19,111,340 thousand in component spending and CLP 2,229,346 thousand in separate administration. After converting from thousands to pesos, the reported component spending is CLP 890 below the 2025 ledger accrual for the assignment. The ledger's paid amount is CLP 18,205,689,296. The 16 named regions compare by official territorial code and keep central component spending and ledger code 00 separately labeled. The monitoring report counts 1,189 people served. ENDIDE 2022 provides independent regional estimates of dependence among adults in households, with reported absolute and relative error. The region comparison does not calculate a coverage or unmet-demand rate across those different populations and years. [Monitoring report](https://bips.ministeriodesarrollosocial.gob.cl/docs/informes/2026/70148%20-%20Modelos%20residenciales%20para%20adultos%20en%20situaci%C3%B3n%20de%20discapacidad.html) · [ENDIDE table 13](https://observatorio.ministeriodesarrollosocial.gob.cl/storage/docs/endide/Documento_Metodologico_ENDIDE_Diseno_Muestral_y_Medicion_Discapacidad.pdf#page=26).

The report counts 1,117 of 1,189 people as receiving individualized care, using reports from 38 residences. It reports an improved quality-of-life score in 153 of 267 assessments with prior scores. This is a within-person comparison for the assessed sample. The report supplies neither a comparison group for causal attribution nor a link to an individual award. The cited systematic review concerns moves from institutions to community settings and provides separate intervention context. [Systematic review](https://doi.org/10.1136/bmjopen-2018-025735).

The five exports use a one-based JSON source position as the ledger row key. Document labels can repeat. The source carries CLP amounts without a currency conversion for these selected records. The projection retains institutional fields and removes personal fields and source rows outside the award recipients from the detailed downloads. The Presupuesto Abierto data and adaptation use CC BY-SA 4.0 with the publisher's attribution. [Reuse terms](https://api.presupuestoabierto.gob.cl/about-data).

Rebuild with the six pinned ledger responses, four grouped comparison responses, award resolution PDF, BIPS monitoring HTML and guide and ENDIDE methodology PDF named in the edition. The award table and ENDIDE table 13 are editorial transcriptions. The generator checks the exact predecessor case and parses the region tables directly from the pinned monitoring report. The regional export records one-based data row positions for both BIPS tables and ENDIDE table 13, excluding column headings.

```sh
python3 scripts/build-chile-residential-payments.py /path/to/captured-inputs /path/to/new-rebuild
diff -r public/data/funding-flows/chile-residential-payments /path/to/new-rebuild
npm run build
node scripts/check-chile-residential-payments.mjs
```

To extend the trace, prioritize a stable link from ledger document numbers to signed agreement folios and actual residence locations. Use original payment-event records before allocating a ledger document’s amount across payment dates. A defensible program coverage rate also needs a current count of eligible people, beyond the broader household prevalence measure. For more Chile institutions, qualify the award source’s official RUTs before exposing transaction detail.

### COANIL agreement reconciliation

The [COANIL case](https://charitology.com/record/funding-flows/chile-coanil-agreements/) matches public donee registration 812 and RUT 70.267.000-4 to ten named awards. Resolution 1996-2025 and the later adaptation amendment match CLP 4,350,192,000 and CLP 182,850,000. The separate Glosa 7 agreement matches CLP 1,089,000,000. The three stages explain the CLP 5,622,042,000 of reported paid amounts across all 45 COANIL ledger rows booked in 2025. The seven budget commune subtotals match the original agreement’s installment allocations. The signed agreements establish approved sites and capacity.

The 2026 renewal and separate Glosa grant have 31 ledger rows through September. The signed annex amounts correspond to the 636 document group. The approving resolution for that group remains a source gap. The third installment’s paid field differs across the recipient summary and government ledger. The case retains both clocks and does not claim a particular bank transaction. The recipient also publishes separate audited 2024–25 accounts. The donation workbook values cover one reporting regime and remain separate from audited donation income. [Agreement archive](https://coanil.cl/transparencia/transparencia-fundacion-coanil/otros-documentos/).

The four downloads use the exact predecessor payment edition, the pinned agreement and financial captures, and the same pinned disclosure workbooks as the first Chile case. Signed agreement figures, statutory grants, receipt reports and account figures are editorial transcriptions with original source locations. The builder verifies source fingerprints, the ten award matches, three commune-level installment reconciliations and one-time use of each ledger row. It derives institutional donation totals from the original workbooks. Public records exclude individual details and street addresses.

```sh
python3 scripts/build-chile-coanil-agreements.py /path/to/coanil-captures /path/to/chile-workbooks /path/to/rebuilt
diff -r public/data/funding-flows/chile-coanil-agreements /path/to/rebuilt
npm run build
node scripts/check-chile-coanil-agreements.mjs
```

Next, verify the signed 2026 approval and the original payment-event record that could resolve the date and paid-amount differences. Repeat agreement-backed joins for other recipients whose ledger totals differ from awards. Keep crosswalks and unallocated amounts reviewable.

## France filing and regional grant trace

The [Emmaüs Solidarité case](https://charitology.com/record/funding-flows/france-emmaus-solidarite/) connects SIREN 317236248, headquarters SIRET 31723624800017 and RNA W751033362. It retains the 2022–25 annual filings, including each filing date, revision and exact PDF page. The 2025 filing changed the presentation of investment grants. Two printed values for a 2024 pretax subtotal are shown separately. This is one institutional trace, with no national coverage claim.

The case includes every payment row for this SIREN in the retained regional edition. Five decision-and-dossier matches cover EUR 182,750.00 in approved maximums and EUR 72,732.48 in reported payments in the 2024 and 2025 budget years. The paid total is limited to the captured rows. Each decision supplies planned geography. Separate APUR counts cover individual winter nights in Paris and different sets of participating metropolitan municipalities. Those figures do not measure delivery or an effect of a grant. Two activity figures come from the association’s annual reports and are labeled separately.

The [edition](../public/data/funding-flows/france-emmaus/edition.json) lists exact source fingerprints and publisher URLs. The accounts, decisions and reports use editorial transcriptions from their original pages. The five payment rows are selected from the pinned regional snapshot by legal unit, decision, dossier token and original record position. The verifier checks the source captures and independently matches the registry and filing API identifiers. It does not OCR the PDFs. Keep the originals outside the repository and verify the rendered tables before changing a transcription.

```sh
node scripts/build-france-emmaus.mjs --verify-captures /path/to/captured-inputs
node scripts/build-france-emmaus.mjs --write /path/to/rebuild
diff -r public/data/funding-flows/france-emmaus /path/to/rebuild
npm run build
node scripts/build-france-emmaus.mjs --check
```

Next qualify a dated DILA filing index with revision coverage and a matching SIREN population from the official register. Measure which institutions and fiscal periods can be joined, and preserve missing or ambiguous RNA identifiers. For money movement, prioritize a second exact grant trace and signed expenditure or disbursement records that carry a dossier ID. Keep approval, payments, accounting recognition, delivery and independently measured need distinct.

### Search original French filing notices

The [French filing lookup](https://charitology.com/record/charity-financials/france/) selects 55,968 DILA account notices for 2022–25 fiscal closings, including corrections. It derives 19,079 distinct candidate SIRENs and 14,692 with more than one closing date from the actual exported rows. The lookup retains 1,355 notices outside the candidate rule and 16 notices whose revision field and filename suffix differ. Those records remain searchable. The capture date and source-specific publication rules bound these figures. Missing notices do not measure inactivity or accountability.

The [manifest](../public/data/charity-financials/fr-dila/manifest.json) pins the four exact API exports and the regional snapshot. The lookup links the same number across 860 candidate SIRENs and the retained Île-de-France payments. It does not infer which payments are recognized in annual accounts. SIREN candidates use a check digit and exclude the 999 series from joins. The RNA label appears only where DILA gives the standard W-plus-nine-digit format. There are no addresses, contacts or extracted document contents in the public payload.

```sh
node scripts/build-france-dila.mjs --write /path/to/captured-inputs /path/to/rebuild
diff -r public/data/charity-financials/fr-dila /path/to/rebuild
npm run build
node scripts/build-france-dila.mjs --check
```

To extend the edition, check the [DILA dataset discussion](https://www.data.gouv.fr/datasets/comptes-associations) for publisher correction notices. Qualify an official registry join where needed, preserve distinct filing periods and revisions, and prioritize disbursement references and amount-level transcription for independently reproducible cases. The original Île-de-France 2019–23 payment annex lacks an organization or dossier ID, so its names are insufficient to extend an exact transaction match.

## Norway voluntary organizations and VAT compensation grants

The [Norwegian registry lookup](https://charitology.com/record/charity-index/norway/) indexes all **72,968 voluntary organizations** in Brønnøysundregistrene’s Frivillighetsregisteret out of 1,181,933 legal entities in the bulk Enhetsregisteret export dated November 21, 2026 (captured November 22, 2026 under [NLOD 2.0](https://data.norge.no/nlod/en/2.0)). Every retained nine-digit organisasjonsnummer passes Norway’s Modulus-11 check digit. The edition records legal form (`71,153 FLI`, `1,327 STI`, `488 AS`), institutional sector, NACE code, municipality, foundation-register overlap (`1,327`), VAT-register membership (`2,884`), active liquidation (`7`) and bankruptcy (`22`), while omitting contact emails, phone numbers, street addresses and personal fields.

The paired [VAT compensation grants edition](https://charitology.com/record/funding-flows/norway-momskompensasjon/) joins Lotteri- og stiftelsestilsynet’s published Momskompensasjon workbooks for **2023, 2024 and 2025** (**73,550** organization-year rows totaling **NOK 8,028,365,241** across **28,011** distinct valid nine-digit organization numbers, including **20,782** present in all three years) by exact organisasjonsnummer. Of the 28,011 recipients, **27,439** match the November 21, 2026 Frivillighetsregisteret snapshot, **96** appear in Enhetsregisteret outside Frivillighetsregisteret and **476** are absent from the current export. In 2025, **264 central umbrella organizations** (`Sentralledd`) applied on behalf of **22,427 local chapters** (`Underledd`). Across the two sheets of the 2025 workbook, **2,962 of 2,963** non-empty applications reconcile to the exact krone between *Alle søknader* (approved) and *Alle organisasjoner* (tranche 1 + supplementary payout = total disbursed); one applicant (`985514607`, NORDLIA SKISENTER, row 1149 vs. row 7659) differs by NOK 9,921 (`120,577` approved vs. `110,656` disbursed with `0` supplementary payout), with the reason unknown from the workbook alone.

When Brønnøysundregistrene’s public financial-accounts API (`data.brreg.no/regnskapsregisteret/regnskap/864139442`) was queried on November 22, 2026, it returned HTTP 500 with an unsupported nonprofit chart-of-accounts error (`IDEELL`). Audited annual accounts therefore remain separate from this grant-flow edition.

Rebuild offline from the four exact NLOD 2.0 captures pinned in [`src/data/norway-index-sources.tsv`](../src/data/norway-index-sources.tsv):

```sh
python3 scripts/build-norway-charity-index.py /path/to/captured-inputs /path/to/rebuild
diff -r public/data/charity-registry/norway /path/to/rebuild/charity-registry/norway
diff -r public/data/funding-flows/norway-momskompensasjon /path/to/rebuild/funding-flows/norway-momskompensasjon
npm run build
node scripts/check-norway-charity-index.mjs
```

Next, monitor Brønnøysundregistrene’s Regnskapsregisteret API for `IDEELL` nonprofit chart-of-accounts support, qualify Lottstift’s Norsk Tipping gaming-surplus disbursements (`Utbetaling-speleoverskotet`) for cross-scheme comparison by organisasjonsnummer, and trace onward distributions from selected central umbrellas (`Sentralledd`) where public annual reports disclose chapter-level transfers.

## Netherlands ANBI public benefit register and central-government subsidies

The [Netherlands ANBI lookup](https://charitology.com/record/charity-index/netherlands/) indexes all **54,361 distinct nine-digit RSIN organizations** from **54,487 official decrees** in the Dutch Tax and Customs Administration (Belastingdienst) `anbi.xml` bulk archive dated November 16, 2026 (version `26320`, captured November 22, 2026 under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)). Every retained RSIN passes the Dutch 11-proef check digit. The edition distinguishes **45,723 active ANBI organizations** (including **8,275 active Cultural ANBIs**) from **8,638 revoked or ended organizations**, surfaces **121 multi-decree RSINs** and **8,709 retroactive revocations** where `eindDatum` precedes `intrekkingsDatum`, retains **54,002 validated HTTP(S) statutory disclosure URLs**, and preserves the **5 statutory public-body umbrella decrees** without an RSIN in `manifest.json`. Because Dutch ANBI law decentralizes annual financial reporting to each charity’s own website, no centralized balance-sheet table is claimed.

The paired [Netherlands central-government nonprofit subsidies edition](https://charitology.com/record/funding-flows/netherlands-rijksfinancien/) extracts **52,256 executed `Subsidies (regelingen)` rows** from the Ministry of Finance’s *Financiële Instrumenten 2017–2024* open-data CSV (CC0 1.0) across **2020–2024**—the five fiscal years in which recipient `Rechtsvorm` and `KVKnummer` are published—for Dutch nonprofit legal forms (`Stichting`, `Vereniging`, `Vereniging met volledige rechtsbevoegdheid` and `Kerkgenootschap`, excluding 14 `Vereniging van Eigenaars` condo-association rows and keeping statutory `Bekostiging` school/university/hospital block funding of EUR 70,881,359k strictly separate). Total executed subsidies reach **EUR 15,540,383k net** (+EUR 15,558,167k positive outlays and -EUR 17,784k across 118 negative adjustments/recoveries), reconciling exactly between **17,868 KvK-identified recipients** (EUR 15,515,722k net) and **58 blank-KvK rows** (EUR 24,661k net, including 30 GDPR-anonymized rows). Grouping by canonical `Begrotingshoofdstuk` consolidates cabinet renamings (such as Chapter `XVII` international development across three source spellings totaling EUR 2,904,265k).

Because Belastingdienst publishes ANBIs by nine-digit **RSIN** and Rijksfinanciën publishes subsidies by eight-digit **KvK-nummer** with no free bulk `KvK ↔ RSIN` crosswalk from KVK, cross-register matches are strictly labeled by conservative normalized-name basis (`46` unique name+city candidates and `3,207` unique name-only candidates totaling EUR 8,057,505k, `63` ambiguous multi-RSIN collisions totaling EUR 70,943k, and `14,552` unmatched recipients totaling EUR 7,387,274k—including *Het Nederlandse Rode Kruis*, KvK `40409352`, which is never guessed).

Rebuild offline from the two exact CC0 captures pinned in [`src/data/netherlands-index-sources.tsv`](../src/data/netherlands-index-sources.tsv):

```sh
python3 scripts/build-netherlands-charity-index.py --source-dir /path/to/captured-inputs --out-root /path/to/rebuild
diff -r public/data/charity-registry/netherlands /path/to/rebuild/charity-registry/netherlands
diff -r public/data/funding-flows/netherlands-rijksfinancien /path/to/rebuild/funding-flows/netherlands-rijksfinancien
npm run build
node scripts/check-netherlands-charity-index.mjs
```

Next, qualify a public Dutch municipal subsidy register that exposes both awarded (`verleend`) and final settled (`vastgesteld`) amounts (such as Amsterdam or Utrecht) to trace post-audit adjustments, and link Dutch Ministry of Foreign Affairs (Chapter `XVII`) IATI activities to ANBI annual financial disclosures published on statutory `webSite` URLs.

## Israel registered associations, Proper Management and foreign-state donations

The [Israel nonprofit registry lookup](https://charitology.com/record/charity-index/israel/) merges four official CKAN API resources published by Israel’s Ministry of Justice (Registrar of Associations / *Rasham HaAmutot*) via [`data.gov.il`](https://data.gov.il/dataset/moj-amutot) (captured November 22, 2026 under the [Israel Government Open Data License](https://data.gov.il/terms)): **76,150 Registered Associations (*Amutot*)** and **1,500 Public Benefit Companies (*Chalotz* / חל״צ)** (`1,447` overlap by exact ID; `53` exist only in the PBC table), producing **76,203 distinct organizations** (**40,343** active/registered, **35,186** dissolved/struck off, **546** in liquidation/receivership, **128** pending registration). An accompanying **7,619-entry English-name index** (`en.json.gz`, 145 KB) supports fast English lookup alongside 22 Hebrew-letter shards and ID lookup shards. Across latest filing years through FY 2025, **31,375 organizations** report annual revenue totaling **ILS 167,507,337,883** (cross-sectional snapshot across differing filing periods); only **7,634** report nonzero expenses (`0` defaults in the source export stay shown as not reported). Exact ID joins across **340,410 Proper Management (*Nihul Takin*) records** show **32,144** organizations ever approved and **23,296** holding signed 2026–2027 approval. Street addresses and apartment numbers are omitted (city only); **123** legacy non-Luhn IDs (including **110** 10-digit legacy IDs) and MoJ’s legacy `~` punctuation encoding are preserved transparently.

The paired [Israel foreign state entity donations edition](https://charitology.com/record/funding-flows/israel-foreign-state-donations/) covers **13,436 quarterly disclosures across 2012–2026** totaling **ILS 7,525,406,162 net** (`516` distinct recipient IDs across `18` raw currency labels; **3,021** majority-foreign-funded rows; **512** matched by exact nine-digit ID to the merged registry). Four notable anomalies inside the live government dataset are documented verbatim in `anomalies.json` without silent deletion: **two leaked production software test IDs** (`580666667`, `טסט עליה לאויר חדשה`, ILS 385,652 across 12 rows; and `580666683`, `עמותה טסט צרוף קבלה 1`, ILS 1,501 across 5 rows), a **2022 self-donor filing entry** (`_id=3495`, `580185700`, ILS 195,438,888 naming the recipient foundation itself as donor), **2 negative adjustment rows** (`-ILS 58,241`) plus `209` zero-ILS rows, and unnormalized donor/currency spellings (`פאונד אנגלי` vs. `לירה שטרלינג`; `USAID` / `USA STATE DEPARTMENT` / `AMERICAN EMBBASY` / `שגרירות ארה~ב`).

Rebuild offline from the four exact CKAN snapshots pinned in [`src/data/israel-index-sources.tsv`](../src/data/israel-index-sources.tsv):

```sh
python3 scripts/build-israel-charity-index.py --source-dir /path/to/captured-inputs --out-root /path/to/rebuild
diff -r public/data/charity-registry/israel /path/to/rebuild/charity-registry/israel
diff -r public/data/funding-flows/israel-foreign-state-donations /path/to/rebuild/funding-flows/israel-foreign-state-donations
npm run build
node scripts/check-israel-charity-index.mjs
```

Next, qualify Israel Ministry of Finance domestic government-support grants (*Tmichot*, `budgetkey` / `data.gov.il`) and Israel Tax Authority Section 46 tax-deductible charity lists by exact nine-digit ID so domestic state grants, foreign-state donations and tax-deductible status can be compared without double counting.

## Poland public benefit organizations (OPP) and 1.5% PIT designations

The [Poland OPP registry lookup](https://charitology.com/record/charity-index/poland/) combines three consecutive statutory eligibility registers published by the National Freedom Institute (NIW-CRSO) for tax years **2023, 2024 and 2025** (latest list updated November 16, 2026, captured November 22, 2026 via [`dane.gov.pl`](https://dane.gov.pl/pl/dataset/20137) under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)) with four years of Ministry of Finance 1.5% personal income tax (PIT) disbursements (**tax years 2022–2025**, paid **2023–2026**, [`dane.gov.pl/pl/dataset/171`](https://dane.gov.pl/pl/dataset/171)). Across all 11 official CC0 workbooks, **10,484 distinct 10-digit KRS organizations** appear: **9,591** eligible in the latest 2025/2026 NIW list (**8,339** eligible in all three years; **379** newly added for 2025), **10,020** with weighted mod-11 validated 10-digit NIP tax identifiers (`0` invalid checksums), and **893** appearing only in earlier 2022–2024 lists or disbursements. NIW’s unpadded integer KRS codes are canonicalized to 10 digits with leading zeros to match Ministry of Finance and KRS court identifiers; one voivodeship spelling typo (`MAŁOPOLSKA` -> `MAŁOPOLSKIE` in 2024 and 2025) is normalized and logged. Street addresses and postal codes are excluded (voivodeship and city only).

The paired [Poland 1.5% PIT tax-designation edition](https://charitology.com/record/funding-flows/poland-pit-1-5-percent/) covers the complete first four years of the 1.5% rate (**PLN 8,316,801,006.68** across **10,395** distinct funded OPPs, including **7,645** funded in all four years). Annual transfers grew **+70.4%** nominally from **PLN 1,530,430,295.58** (`9,009` OPPs) for 2022 to **PLN 2,607,398,866.61** (`9,450` OPPs) for 2025 (paid in 2026). Cross-register exact-KRS reconciliation shows **167** eligible OPPs received **PLN 0** in 2025 (`143` in 2024; `149` in 2023), while **26** OPPs received 2025 disbursements totaling **PLN 307,417.10** despite absence from the final November 16, 2026 NIW list (all 26 appeared on the 2023 or 2024 NIW eligibility registers; `40` in 2024 totaling PLN 514,854.10; `39` in 2023 totaling PLN 503,581.00; all preserved in `reconciliation.json`). The Ministry of Finance taxpayer-count workbooks report counts rounded to `0.1k` (100 taxpayers) and therefore omit **3,689** smaller funded OPPs in 2025 below that threshold (`5,761` disclosed OPPs sum to **17,180.0k** designations; zero KRS appear in any taxpayer sheet without appearing in the amounts sheet). Top-10 concentration (**45.69%** in 2025; top-100 **73.03%**) reflects Poland’s statutory sub-account (*cel szczegółowy*) intermediary foundations—such as *Fundacja Dzieciom “Zdążyć z Pomocą”* (`0000037904`, PLN 406.58M across 2.51M taxpayers) and *Fundacja Siepomaga* (`0000396361`, PLN 254.65M)—whose KRS totals aggregate individual patient/disability sub-accounts.

Rebuild offline from the 11 exact CC0 captures pinned in [`src/data/poland-index-sources.tsv`](../src/data/poland-index-sources.tsv):

```sh
python3 scripts/build-poland-charity-index.py --source-dir /path/to/captured-inputs --out-root /path/to/rebuild
diff -r public/data/charity-registry/poland /path/to/rebuild/charity-registry/poland
diff -r public/data/funding-flows/poland-pit-1-5-percent /path/to/rebuild/funding-flows/poland-pit-1-5-percent
npm run build
node scripts/check-poland-charity-index.mjs
```

Next, qualify NIW-CRSO’s OPP annual financial & substantive reports repository (`sprawozdaniaopp.niw.gov.pl`) by exact 10-digit KRS so administrative overhead, sub-account onward distributions and non-PIT grant revenue can be compared alongside 1.5% PIT inflows.

## Latvia nonprofits, Public Benefit Organizations (SLO) and EU Cohesion/Recovery funds

The [Latvia nonprofit registry lookup](https://charitology.com/record/charity-index/latvia/) unites three official [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) tables published via [`data.gov.lv`](https://data.gov.lv/dati/lv/dataset/uz) (captured November 22, 2026) by exact 11-digit registration code (`regcode`): all **34,056** associations, foundations, trade unions and religious organizations extracted from the **490,599-entity Enterprise Register (UR)** (`30,322` `BDR`, `1,983` `NOD`, `375` trade unions, `1,376` religious organizations), **22,728** organizations classified in UR’s statutory areas-of-activity table (exposing **4,897 housing-management associations**, *Mājokļu apsaimniekošana*, as the largest single association category), and **4,173 distinct organizations** across 12,227 decision rows in the State Revenue Service (VID) **Public Benefit Organization (SLO)** register (**1,689** active SLOs, **2,403** revoked SLOs, **81** liquidated SLOs—including 1 historic parish `90002493065` absent from the current UR export, yielding **34,057** total indexed entities). Street addresses, postal codes and emails are omitted.

The paired [Latvia EU Cohesion & Recovery Fund edition](https://charitology.com/record/funding-flows/latvia-eu-funds/) scans all **5,491** projects published by Latvia’s Central Finance and Contracting Agency (CFLA, CC0 1.0) across **EU Funds 2014–2020**, **EU Funds 2021–2027** and the **Recovery & Resilience Facility (RRF)** and joins by exact 11-digit `regcode` to identify **292 nonprofit-led projects** across **146 lead organizations** totaling **EUR 233,473,700.90** (**EUR 180,087,469.50** EU co-financing, `EUR 21,918,368.34` national public, `EUR 30,188,958.78` private, plus `EUR 1,278,904.28` in ineligible/auxiliary costs), alongside **260 nonprofit cooperation-partner roles** across 191 partner organizations kept strictly separate from lead project budgets to prevent double counting. Separating Active SLO charities (`74` orgs, `153` projects, **EUR 70.12M** / `30.0%`) from non-SLO industry/IT/employers’ associations (`61` orgs, `117` projects, **EUR 154.63M** / `66.2%`) and revoked/liquidated SLOs (`11` orgs, `22` projects, **EUR 8.72M** / `3.7%`) shows how different organizational populations share Latvia’s `Biedrība` legal wrapper. Separate CFLA implementation-location tables distinguish operational regions (`Rīga`, `Visa Latvija`, `Kurzeme`, `Vidzeme`, `Latgale`, `Zemgale`, `Pierīga`) from registration headquarters.

Rebuild offline from the 12 exact CC0 captures pinned in [`src/data/latvia-index-sources.tsv`](../src/data/latvia-index-sources.tsv):

```sh
python3 scripts/build-latvia-charity-index.py --source-dir /path/to/captured-inputs --out-root /path/to/rebuild
diff -r public/data/charity-registry/latvia /path/to/rebuild/charity-registry/latvia
diff -r public/data/funding-flows/latvia-eu-funds /path/to/rebuild/funding-flows/latvia-eu-funds
npm run build
node scripts/check-latvia-charity-index.mjs
```

Next, qualify Latvia’s Ministry of Finance *de minimis* public-aid export (`deminimis.fm.gov.lv`) and Health Inspectorate nonprofit support disclosures (`pazinojumi-par-sniegto-atbalstu`) by exact 11-digit `regcode` to compare domestic state aid, EU cohesion grants and private healthcare support without double counting.

## Estonia nonprofits, TMNSN tax-incentive charities, 2023–2025 XBRL filings and EU/EEA grants (Jurisdiction #18)

The [Estonia nonprofit registry edition](https://charitology.com/record/charity-index/estonia/) joins three official Estonian open-data sources captured on November 22, 2026 by exact 8-digit registry code (`registrikood`): RIK e-Business Register (`lihtandmed`, extracting **24,142** `Mittetulundusühing`, `Sihtasutus` and `Ametiühing` entities while excluding **25,709** statutory `Korteriühistu` apartment associations), RIK’s 2023–2025 annual financial report XBRL tables (**19,238** nonprofits with structured EUR Revenue, Business Income, Surplus/Deficit, Assets, Net Assets, Cash, Labor Expense, FTE and Audit fields), and EMTA’s CC0 1.0 November 1, 2026 income-tax-incentive charity list (`TMNSN`, **2,974** active charities including **13** absent from the Nov 22 active RIK export plus **4** removed in 2025), totaling **24,155** searchable organizations.

The paired [Estonia EU/EEA funds edition](https://charitology.com/record/funding-flows/estonia-eu-funds/) joins RTK’s August 31, 2026 Structural Assistance Register across `2014–2020`, `2020–2026` (RRF) and `2021–2027` (`ERDF`, `ESF`, `JTF`, `CF`, `REACT-EU`, `RRF`, `NORRA/EMP`), identifying **1,566** nonprofit-form projects across **697** distinct organizations totaling **EUR 2,622,261,929.19** in project budgets (**EUR 1,805,847,759.83** EU/EEA grants, **EUR 1,477,497,655.39** disbursed net of clawbacks). Joining EMTA TMNSN status shows that non-TMNSN state development agencies and public hospitals structured as `Sihtasutus` foundations absorb **80.3%** (`EUR 2.11B`), compared with **1.3%** (`EUR 34.30M`) led by active tax-incentive `MTÜ` charities.

Rebuild offline from the eight SHA-256-pinned inputs listed in `src/data/estonia-index-sources.tsv`:

```sh
python3 scripts/build-estonia-charity-index.py /path/to/captured-inputs public/data
node scripts/check-estonia-charity-index.mjs
npm run check:references
```

## Czechia nonprofit public registers, foundation endowments and EU Cohesion Policy 2021–2027 grants (Jurisdiction #19)

The [Czechia nonprofit registry edition](https://charitology.com/record/charity-index/czechia/) combines all **42 regional-court 2026 open-data XML dumps** published by the Czech Ministry of Justice (`dataor.justice.cz`) across Czechia’s six civil-society legal forms: **101,988** associations (`Spolek`), **25,054** branch associations (`Pobočný spolek`), **3,445** endowment funds (`Nadační fond`), **2,390** public benefit companies (`Obecně prospěšná společnost` / `o.p.s.`), **2,024** institutes (`Ústav`) and **631** foundations (`Nadace`) — **135,532** unique 8-digit `IČO` identifiers (`126,730` active, `5,935` in liquidation, `50` in insolvency, `2,817` erased entries retained in the 2026 dumps), while excluding unit-owners housing associations (`SVJ`), commercial companies, trade unions and Ministry of Culture church entities at the register level. Across the statutory registers, **3,982** nonprofits declare CZK registered capital totaling **CZK 17,325,924,140.39** (`CZK 16.74B` held by `611` endowed foundations). All personal board-member names, birthdates and street-level addresses are stripped at build time.

The paired [Czechia EU Cohesion Policy 2021–2027 edition](https://charitology.com/record/funding-flows/czechia-eu-funds/) deduplicates **50,195** raw rows in the Ministry for Regional Development’s November 1, 2026 *Seznam operací 2021–2027* (`dotaceeu.cz`) by unique registration number (collapsing **8,194** repeated public-procurement sub-rows into **42,001** unique operations) and joins by exact 8-digit `IČO`, identifying **3,906** nonprofit operations across **1,669** Czech nonprofits totaling **CZK 23,827,667,932.19** in project costs (**CZK 17,850,508,862.14** EU Union support / **CZK 11,885,456,116.25** charged in payment claims). While endowed foundations hold **98.4%** of declared statutory capital, they account for just **0.6%** of EU Cohesion funding; legacy `o.p.s.` entities (`1.8%` of nonprofits) deliver **26.1%** (`CZK 6.23B`) and associations deliver **56.9%** (`CZK 13.55B`), led by ESF+ (`69.6%`).

Rebuild offline from the 43 SHA-256-pinned inputs listed in `src/data/czechia-index-sources.tsv`:

```sh
python3 scripts/build-czechia-charity-index.py /path/to/captured-inputs public/data
node scripts/check-czechia-charity-index.mjs
npm run check:references
```

## Slovakia 2%/3% income-tax assignment recipients and 10-year disbursements (Jurisdiction #20)

The [Slovakia 2%/3% recipient index](https://charitology.com/record/charity-index/slovakia/) and paired [Slovakia 2%/3% tax-assignment funding flow](https://charitology.com/record/funding-flows/slovakia-pit-2-percent/) combine ten consecutive official annual disbursement CSVs published by the Financial Directorate of the Slovak Republic (*Finančné riaditeľstvo SR* / `financnasprava.sk`, `2016`–`2025`, under §50 Act No. 595/2003 Coll., all 10 files SHA-256 pinned in `src/data/slovakia-index-sources.tsv`). Decoding 2022 explicitly as DOS Central European `cp852` (while the other nine years use `cp1250`) recovers all **148,996 annual rows** across **26,357 distinct 8-digit `IČO` organizations** (**17,457** active in 2025; **5,338** funded every year across the decade), totaling **EUR 782,063,657.20** cumulatively and **EUR 107,043,910.00** in 2025 (+82.5% since 2016). Because Slovakia uniquely permits corporate income-tax assignment (1%–2%) alongside individual assignment (2%–3%), **416** entities named *Nadácia* (dominated by corporate foundations) account for **30.87%** (`EUR 33.05M`) of 2025 disbursements. Street addresses and postcodes are omitted; 60 same-year duplicate `IČO` rows are aggregated cleanly and documented in `anomalies.json`.

Rebuild offline from the ten SHA-256-pinned inputs listed in `src/data/slovakia-index-sources.tsv`:

```sh
python3 scripts/build-slovakia-charity-index.py /path/to/captured-inputs public/data
node scripts/check-slovakia-charity-index.mjs
npm run check:references
```

## Global humanitarian funding gaps by country and cluster (OCHA FTS 2019–2026)

The [Global humanitarian funding gaps explorer](https://charitology.com/record/funding-flows/ocha-fts-global-clusters/) (linked directly from `/record/gap-map/`) indexes **3,958** UN OCHA Financial Tracking Service (FTS) plan-cluster records across **313** humanitarian response plans and **58** country codes (`2019`–`2026`, CC BY 3.0 IGO via HDX, SHA-256 pinned in `src/data/ocha-fts-clusters-sources.tsv`), totaling **\$269.49 billion** in requirements vs. **\$147.20 billion** reported funded (`54.62%` overall; dropping from `64.6%` in 2022 to `41.0%` in 2025 and `44.4%` in 2026 YTD). Every row retains its exact original OCHA cluster string alongside a transparent normalized sector grouping while keeping unearmarked/shared plan funding strictly separate from named-sector denominators.

```sh
python3 scripts/build-ocha-fts-clusters.py /path/to/captured-inputs public/data
node scripts/check-ocha-fts-clusters.mjs
npm run check:references
```

## Denmark tax-approved charities (Skattestyrelsen § 8 A, § 12 stk. 3 & BAL — Jurisdiction #21)

The [Denmark approved charity index](https://charitology.com/record/charity-index/denmark/) indexes the official Skattestyrelsen list published in *Den juridiske vejledning 2026-2*, section `C.A.4.3.5.9 Liste over godkendte foreninger` (`pubDate 2026-07-31`, captured November 23, 2026, SHA-256 pinned in `src/data/denmark-index-sources.tsv`). Every one of the **1,471** organizations carries a unique 8-digit Danish *CVR* number: **1,078** approved for tax-deductible gifts under `LL § 8 A` (`1,052` full year, `26` partial-year `*`), **502** approved for ongoing gift commitments under `LL § 12, stk. 3` (`494` full year, `8` partial-year `*`), and **410** explicitly listed for inheritance/estate-tax exemption under `BAL § 3, stk. 2`, with **2** ceased entries (`OPHØRT:`) preserved verbatim.

```sh
python3 scripts/build-denmark-charity-index.py --input-dir /path/to/captured-inputs --out-dir public/data/charity-registry/denmark
node scripts/check-denmark-charity-index.mjs
```

## Sweden 90-konto fundraising charities & 2025 audited giving (Jurisdiction #22)

The [Sweden 90-konto registry](https://charitology.com/record/charity-index/sweden/) and paired [Sweden audited 90-konto giving explorer](https://charitology.com/record/funding-flows/sweden-90-konto/) account for 100% of the **741** organizations published by *Svensk Insamlingskontroll* (`487` active 90-konto holders with 100% verified Swedish *organisationsnummer*, `36` revoked/*Indragna*, and `218` voluntarily closed/*Avslutade*, captured November 23, 2026 and SHA-256 pinned in `src/data/sweden-index-sources.tsv`). Among active holders, **456** publish multi-year audited SEK accounts totaling **SEK 29.28B** in 2025 revenue (**99.31%** of the official SEK 29.48B yearbook aggregate across 481 audited charities) and **SEK 36.42B** in equity (**99.38%** of yearbook equity). The paired funding-flows explorer parses official `2023–2025` audited sector totals (`SEK 23,090M` in 2025 gifts and grants) and joins **110/110** Top-110 charities (`SEK 21,040M` = `91.1%` of sector collections) against Sweden’s Top-100 private individual donor list (`SEK 10,400M`). All telephone numbers, emails and street addresses are stripped at build time; 17 cards carrying repeated year header columns are reconciled to the rightmost complete value and logged in `anomalies.json`.

```sh
python3 scripts/build-sweden-charity-index.py --input-dir /path/to/captured-inputs --reg-out-dir public/data/charity-registry/sweden --flow-out-dir public/data/funding-flows/sweden-90-konto
node scripts/check-sweden-charity-index.mjs
npm run check:references
```

## Hungary 1%+1% SZJA personal income tax recipients (2024–2026 — Jurisdiction #23)

The [Hungary 1% SZJA charity index](https://charitology.com/record/charity-index/hungary/) and paired [Hungary 1%+1% SZJA funding-flows explorer](https://charitology.com/record/funding-flows/hungary-szja-1-percent/) join four official XLSX disbursement announcements published by Hungary’s National Tax and Customs Administration (*Nemzeti Adó- és Vámhivatal* / NAV, `nav.gov.hu`, captured November 23, 2026 and SHA-256 pinned in `src/data/hungary-index-sources.tsv`). Across 2024–2026, **34,109 distinct 8-digit tax IDs** received civil 1% personal income tax designations (**31,299** in 2026; **27,050** funded in all three years), totaling **HUF 58,968,699,914** across **5,400,131** taxpayer designations (**HUF 21.40B** from **1,802,747** taxpayers in 2026, averaging `HUF 11,872` per donor). Unlike Poland’s 1.5% PIT (which omits taxpayer counts below 100 donors), NAV discloses exact taxpayer counts down to single-donor organizations; top 2026 recipients are led by independent journalism foundations (*Partizán* `19286031`, HUF 576.94M / 42,854 donors; *Telex* `19347215`, HUF 543.32M / 35,319 donors) alongside national ambulance and pediatric hospital foundations. Separately, all **186** second-1% technical-number recipients in 2026 totaled **HUF 23,947,458,210** from **2,500,923** taxpayers (led by the Hungarian Catholic Church, Reformed Church and National Talent Program). Street addresses are stripped at build time (municipality only).

```sh
python3 scripts/build-hungary-charity-index.py --input-dir /path/to/captured-inputs --reg-out-dir public/data/charity-registry/hungary --flow-out-dir public/data/funding-flows/hungary-szja-1-percent
node scripts/check-hungary-charity-index.mjs
npm run check:references
```

## Hong Kong Section 88 tax-exempt charities (Inland Revenue Department — Jurisdiction #24)

The [Hong Kong Section 88 charity index](https://charitology.com/record/charity-index/hong-kong/) parses the official bilingual CSV published by the Hong Kong Special Administrative Region Inland Revenue Department (`https://www.ird.gov.hk/charity/csv/s88list.csv`, as at `2026-10-31`, captured November 23, 2026 and SHA-256 pinned in `src/data/hong-kong-index-sources.tsv`). Collapsing **17,614** raw IRD rows by exact `(English name, Traditional Chinese name)` cleanly separates **11,138 distinct parent charitable institutions and trusts** (**9,754** bilingual EN+ZH, **1,345** English-only, **39** Chinese-only; effective dates from `1949-03-11` to `2026-10-07`) from **6,475** separately listed subsidiary schools, kindergartens and clinics operated across **955** parent networks (led by *Tung Wah Group of Hospitals* with 388 subsidiary rows, *Po Leung Kuk* with 315, and *Caritas - Hong Kong* with 247). Subsidiary counts remain searchable inside parent cards without double-counting them as independent charities; the IRD CSV publishes tax-exemption status and effective dates without centralized annual financial filings.

```sh
python3 scripts/build-hong-kong-charity-index.py --input-dir /path/to/captured-inputs --out-dir public/data/charity-registry/hong-kong
node scripts/check-hong-kong-charity-index.mjs
npm run check:references
```
