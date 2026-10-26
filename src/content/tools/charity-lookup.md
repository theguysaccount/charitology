---
title: Charity Lookup
group: For donors
order: 3
summary: Search the Charitology Charity Index by name, see where on the chain from symptom to source a charity’s work is thought to act, and open the public registries in one click.
status: live
conditions: [overhead-myth, missing-feedback-loop]
help:
  - Add a charity to the Charity Index with a pull request to src/content/charities/ that cites the sources for its depth hypothesis.
  - Challenge a depth hypothesis in an issue tagged red-team, with the evidence that points to a different level.
  - Suggest another open registry for the lookup in src/data/ecosystem.json.
related: [/tools/due-diligence-checklist/, /diagnosis/overhead-myth/, /record/myths/low-overhead-means-a-good-charity/]
sources:
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

Below the matches are five open registries, always shown, because the Charity Index is young and the public record is large:

- **ProPublica Nonprofit Explorer** has millions of annual returns filed by U.S. tax-exempt organizations.
- **WHOFUNDS** records what U.S. private foundations reported paying on Form 990-PF, with an estimate of which registered organization each payee is.
- **Charity Impact Media** shows where the money goes, from Form 990, for U.S. public charities with $10 million or more in revenue. It has no ratings.
- **The Systemic Altruism tracker** is a beta directory of charities working on structural change, with a searchable registry of IRS-listed charities.
- **IRS Tax Exempt Organization Search** is the official record of whether an organization can receive tax-deductible gifts and whether its exemption was automatically revoked.

ProPublica and WHOFUNDS open with your search already run. The other three open their home pages, where you can search. The name you type stays in your browser until you click one of them.

## Depth is a hypothesis, not a grade

Each Charity Index entry carries a depth hypothesis: Charitology’s working description of where the charity’s work acts on the [depth scale](/method/#depth), from relief to source. It describes. It never grades, and every level is needed: a food bank and a policy campaign can both be doing exactly what the world needs from them. The hypothesis is labeled as one, its sources are in the entry, and anyone can challenge it with the link on each match.

The lookup deliberately shows no overhead ratio. In 2013 the leaders of GuideStar, Charity Navigator and the BBB Wise Giving Alliance told donors that overhead is a poor measure of a charity’s performance. That is [the Overhead Myth](/diagnosis/overhead-myth/). What a charity achieves rarely reaches its donors at all, which is [the Missing Feedback Loop](/diagnosis/missing-feedback-loop/). The lookup can’t close that loop. It can send you to the evidence that exists and to the questions in the [Giver’s Checklist](/method/#checklist).

## What it isn’t

It isn’t a rating, a ranking or a recommendation, and a charity missing from the Charity Index tells you nothing about it. The registries are run by other organizations, and Charitology doesn’t control or vouch for what they show. For a fuller check of one organization, use the [Due Diligence Checklist](/tools/due-diligence-checklist/).
