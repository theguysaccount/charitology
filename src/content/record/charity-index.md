---
title: "Global Charity Index"
group: "Flagship references"
order: 2
summary: "A searchable working index with descriptive depth hypotheses, cause filters, public-registry links, source lists and research dossiers."
status: live
statusNote: "16 transparent classification records with multi-filter browsing, registry links and research dossiers. Classifications remain draft hypotheses, not charity ratings."
conditions: ["overhead-myth", "symptom-trap"]
firstMilestone: "Five hundred organizations classified by depth, each classification checked by two contributors."
help:
  - "Add an organization with a pull request to src/content/charities/, citing its own description of its work."
  - "Challenge a depth classification in an issue labeled red-team."
  - "Help connect the Index to the open registries listed below."
related: ["/tools/charity-lookup/", "/record/interventions/", "/method/"]
sources:
  - {"title": "Exempt Organizations Business Master File Extract", "publisher": "Internal Revenue Service", "url": "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf"}
---

The IRS publishes a master file of U.S. tax-exempt organizations. The Index links to existing public registries for filings and adds an editorial hypothesis about *where the work sits on the chain from symptom to source*. It starts with a small set of organizations; it is not a worldwide census.

## What it is not

The Index is not a rating. Depth describes where work acts, not how good it is. Every level is needed, and a relief charity at depth 0 may be the best use of a given dollar. Each classification is labeled as a hypothesis, cites the organization’s own description of its work, and can be challenged in public.

## How it’s built

Each entry is a small file in `src/content/charities/` with the organization’s name, website, a one-line description of what it does, a depth classification, its cause areas and the interventions it delivers. Finances, filings and funders stay in the registries that already publish them, linked from every entry.

## Use this reference base

Filter by cause area, depth hypothesis or review status. Inspect the cited description of an organization’s work, follow its website or public-registry links, and keep a source-linked reading dossier for your own research. Registry searches may return several organizations with similar names; check the identity before interpreting a filing.

## Coverage and review

This is a small working index, not a worldwide census. Selecting an organization adds it to a research reading list. It does not recommend a donation, compare its worth with another organization or validate a depth hypothesis.
