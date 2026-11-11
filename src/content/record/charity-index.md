---
title: "Global Charity Index"
group: "Flagship references"
order: 2
summary: "Search dated organization identities, Australian financial filings and an editorial collection of draft depth hypotheses, sources and research dossiers."
status: live
statusNote: "1,975,975 IRS identities from the 2026-10-13 extract, searchable locally by name prefix or EIN, plus 16 editorial draft classifications. US registry coverage is not a worldwide census or a charity rating."
conditions: ["overhead-myth", "symptom-trap"]
firstMilestone: "Five hundred organizations classified by depth, each classification checked by two contributors."
help:
  - "Add an organization with a pull request to src/content/charities/, citing its own description of its work."
  - "Challenge a depth classification in an issue labeled red-team."
  - "Help review the IRS snapshot’s source date, coverage and refresh process without treating registration as evidence of impact."
related: ["/tools/charity-lookup/", "/record/interventions/", "/method/"]
sources:
  - {"title": "Exempt Organizations Business Master File Extract", "publisher": "Internal Revenue Service", "url": "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf"}
  - {"title": "EO BMF information sheet", "publisher": "Internal Revenue Service", "url": "https://www.irs.gov/pub/foia/ig/tege/eo-info.pdf"}
---

The Index brings together distinct sources. A dated IRS identity snapshot supports local name-prefix or exact-EIN searches and source-preserving JSON/CSV exports. [Search Australian financial filings](/record/charity-financials/) by name or Australian Business Number to read two years of available revenue, expenses and grant-making figures. [Search England and Wales annual returns](/record/charity-financials/england-wales/) by registered name or number to read available gross income and expenditure for periods ending in 2023–2025. [Search U.S. financial extracts](/record/charity-financials/united-states/) by EIN across separate Form 990, Form 990-EZ and Form 990-PF editions. A small editorial collection describes *where the work sits on the chain from symptom to source*, with draft hypotheses that anyone can challenge. Coverage varies by source and jurisdiction.

[Trace reported U.S. grants by filer or recipient EIN](/record/funding-flows/us-schedule-i/). Each included row points to the original Form 990 filing and distinguishes cash from noncash assistance.

[Compare Kenya’s reporting coverage and finances](/record/charity-financials/kenya/). Read three years of regulator-reported filing counts and receipts, plus a breakdown of where reporting organizations spent funds.

[Search Canadian charity filings](/record/charity-financials/canada/) by name or full account number. Read reported revenue, expenditure, gifts and grants for periods ending in 2023 or 2024.

## IRS snapshot coverage

The four IRS EO BMF regional CSVs posted on **2026-10-13** contain **1,975,975 unique EINs**. The local search retains source spelling, city/state fields, subsection, status and deductibility codes. Missing fields remain unknown. Contact/street and financial fields are omitted. Each result links its original region file; exports retain its source hash, retrieval time and snapshot date. Data downloads only after an explicit search.

This is US federal registry coverage, including some non-domestic filing addresses. A filing address is not the organization’s service geography. Some self-declared organizations and churches that did not apply for recognition are absent; a missing match establishes neither revocation nor ineligibility. The dated codes do not replace a current IRS check. Registration supplies no conclusion about financial health or impact, and does not assign a depth hypothesis.

## What it is not

The Index is not a rating. Depth describes where work acts, not how good it is. Every level is needed, and a relief charity at depth 0 may be the best use of a given dollar. Each classification is labeled as a hypothesis, cites the organization’s own description of its work, and can be challenged in public.

## How it’s built

Each editorial entry is a small file in `src/content/charities/` with the organization’s name, website, a one-line description of what it does, a depth hypothesis, cause areas and linked interventions. The 16 profiles remain drafts awaiting human review. Financial snapshots identify the regulator and original filings that supply the figures.

The IRS snapshot is generated separately by `scripts/update-irs-registry.mjs`. Its downloadable manifest records the four original URLs, source hashes, retrieval times, counts and compressed-shard hashes. Ordinary builds use the committed snapshot; they do not fetch new IRS data or imply that the posting date changed.

## Use this reference base

Filter by cause area, depth hypothesis or review status. Inspect the cited description of an organization’s work, follow its website or public-registry links, and keep a source-linked reading dossier for your own research. Registry searches may return several organizations with similar names; check the identity before interpreting a filing.

## Coverage and review

The editorial reading-list collection is small and the IRS snapshot covers one federal registry. Selecting an editorial profile adds it to a research reading list. Neither action recommends a donation, compares an organization’s worth with another or validates a depth hypothesis. ProPublica and other filing tools remain deliberate external handoffs; no third-party API is silently proxied.

[Search Brazilian federal transfers](/record/funding-flows/brazil-transferegov/) by organization name, CNPJ registration number or agreement number. Follow the source links from a proposal to its agreement and bank orders.

[Trace solidarity kitchen funding and household food insecurity in Brazil](/record/funding-flows/brazil-solidarity-kitchens/). Follow an official call from selection to bank orders and compare the documented plans with household survey estimates.
