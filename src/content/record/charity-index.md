---
title: "Global Charity Index"
group: "Flagship references"
order: 2
summary: "A depth layer on top of the open registries: what an organization does, where its work sits from relief to source, and where to check its filings."
status: seeded
statusNote: "A first set of organizations is classified. The Index grows by contribution."
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

The IRS lists more than a million 501(c)(3) organizations in the United States alone, and the open registries already publish their identities, finances and funders. What no registry records is *where the work sits on the chain from symptom to source*. The Index adds that layer and nothing else.

## What it is not

The Index is not a rating. Depth describes where work acts, not how good it is. Every level is needed, and a relief charity at depth 0 may be the best use of a given dollar. Each classification is labeled as a hypothesis, cites the organization’s own description of its work, and can be challenged in public.

## How it’s built

Each entry is a small file in `src/content/charities/` with the organization’s name, website, a one-line description of what it does, a depth classification, its cause areas and the interventions it delivers. Finances, filings and funders stay in the registries that already publish them, linked from every entry.
