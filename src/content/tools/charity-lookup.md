---
title: Charity Lookup
group: For donors
order: 3
summary: Search a dated IRS snapshot by primary name or EIN, read the editorial Charity Index’s draft depth hypotheses, and deliberately open external filing registries.
status: live
statusNote: "Local search of 1,975,975 IRS EO BMF identities posted 2026-10-13, plus 16 editorial draft profiles. No charity ratings, live tax-status guarantee or worldwide coverage."
conditions: [overhead-myth, missing-feedback-loop]
help:
  - Add a charity to the Charity Index with a pull request to src/content/charities/ that cites the sources for its depth hypothesis.
  - Challenge a depth hypothesis in an issue tagged red-team, with the evidence that points to a different level.
  - Suggest another open registry for the lookup in src/data/ecosystem.json.
related: [/tools/due-diligence-checklist/, /diagnosis/overhead-myth/, /record/myths/low-overhead-means-a-good-charity/]
sources:
  - title: Exempt Organizations Business Master File Extract
    publisher: Internal Revenue Service
    year: 2026
    url: https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf
    note: Four regional CSVs posted 2026-10-13; source hashes, retrieval times and row counts are in the downloadable provenance manifest.
  - title: EO BMF information sheet
    publisher: Internal Revenue Service
    year: 2026
    url: https://www.irs.gov/pub/foia/ig/tege/eo-info.pdf
    note: Field definitions, status and deductibility codes, filing-address geography and coverage limitations.
  - title: Search for tax exempt organizations
    publisher: Internal Revenue Service
    year: 2026
    url: https://www.irs.gov/charities-non-profits/search-for-tax-exempt-organizations
    note: What Tax Exempt Organization Search covers, including Pub. 78 data and the automatic revocation list.
  - title: Nonprofit Explorer
    publisher: ProPublica
    year: 2026
    url: https://projects.propublica.org/nonprofits/
    note: A living database, accessed October 2026.
  - title: WHOFUNDS open grant graph
    publisher: WHOFUNDS
    year: 2026
    url: https://theguysaccount.github.io/whofunds-open-grant-graph/
    note: Form 990-PF grants for tax year 2023, accessed October 2026.
  - title: Charity Impact Media
    publisher: Charity Impact Media
    year: 2026
    url: https://theguysaccount.github.io/charity-impact-media/
    note: Accessed October 2026.
  - title: Systemic Altruism charity tracker
    publisher: Systemic Altruism
    year: 2026
    url: https://charities.systemicaltruism.com/
    note: A beta directory, accessed October 2026.
  - title: 3 Major Charity Groups Ask Donors to Stop Focusing on Overhead Costs
    publisher: The Chronicle of Philanthropy
    year: 2013
    url: https://www.philanthropy.com/news/3-major-charity-groups-ask-donors-to-stop-focusing-on-overhead-costs/
---

## How it works

Type a charity’s name, or arrive from the Charitology browser extension, which opens this page with the name already filled in. The lookup searches the [Charity Index](/record/charity-index/) in your browser and shows each match with its depth hypothesis.

## Search public IRS identities

The separate **Search public registry** button searches a local copy of the four IRS EO BMF regional files: **1,975,975 organization identities posted on 2026-10-13**. Enter the beginning of the IRS primary name or all nine EIN digits, including leading zeros. An optional filter uses the filing state or territory. Search does not match aliases or words in the middle of a name.

Only the needed compressed shards download when you press the button. The host receives a name-initial or EIN-prefix request, rather than your full query. Results include source codes and date; JSON/CSV exports retain raw-file source URLs, hashes and retrieval times. Keep EIN columns as text when opening CSV in a spreadsheet.

This is US federal registry coverage, including some non-domestic addresses, not a worldwide census. Filing addresses do not show service geography. The extract omits some self-declared organizations and churches that did not apply for recognition; absence establishes neither revocation nor ineligibility. Check current IRS records before relying on a dated code. No financial health, impact or depth conclusion is inferred from these identities.

## Open external records deliberately

Five external registries remain available:

- **ProPublica Nonprofit Explorer** has millions of annual returns filed by U.S. tax-exempt organizations.
- **WHOFUNDS** records what U.S. private foundations reported paying on Form 990-PF, with an estimate of which registered organization each payee is.
- **Charity Impact Media** shows where the money goes, from Form 990, for U.S. public charities with $10 million or more in revenue. It has no ratings.
- **The Systemic Altruism tracker** is a beta directory of charities working on structural change, with a searchable registry of IRS-listed charities.
- **IRS Tax Exempt Organization Search** is the official record of whether an organization can receive tax-deductible gifts and whether its exemption was automatically revoked.

ProPublica and WHOFUNDS open with the editorial lookup name in their address. The other three open their home pages, where you can search. IRS result cards also offer an explicit ProPublica filing link by EIN. Clicking an external link sends its address to that service; the IRS snapshot search itself does not call their APIs.

## Depth is a hypothesis, not a grade

Each Charity Index entry carries a depth hypothesis: Charitology’s working description of where the charity’s work acts on the [depth scale](/method/#depth), from relief to source. It describes. It never grades, and every level is needed: a food bank and a policy campaign can both be doing exactly what the world needs from them. The hypothesis is labeled as one, its sources are in the entry, and anyone can challenge it with the link on each match.

The lookup deliberately shows no overhead ratio. In 2013 the leaders of GuideStar, Charity Navigator and the BBB Wise Giving Alliance told donors that overhead is a poor measure of a charity’s performance. That is [the Overhead Myth](/diagnosis/overhead-myth/). What a charity achieves rarely reaches its donors at all, which is [the Missing Feedback Loop](/diagnosis/missing-feedback-loop/). The lookup can’t close that loop. It can send you to the evidence that exists and to the questions in the [Giver’s Checklist](/method/#checklist).

## What it isn’t

It isn’t a rating, a ranking or a recommendation. The 16 editorial profiles remain drafts awaiting human review, separate from the public IRS identities. A charity missing from that small editorial collection tells you nothing about it. External registries are run by other organizations; Charitology doesn’t control or vouch for their results. For a fuller check of one organization, use the [Due Diligence Checklist](/tools/due-diligence-checklist/).
