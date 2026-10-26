---
title: Public API
group: For everyone
order: 2
summary: Every Charitology dataset as static JSON, free to use with attribution. Build the Diagnosis, the interventions or the open problems into your own app or donation platform.
status: live
conditions: [fragmentation, missing-feedback-loop]
help:
  - Build something with the data and share it in an issue labeled built-with.
  - Propose a new endpoint in src/lib/api.ts.
related: [/record/open-datasets/, /tools/charity-lookup/]
---

## How it works

The API is a set of JSON files generated every time the site is built, so it is always in step with the site. There are no keys, no accounts and no rate limits, and nothing is logged beyond what the static host keeps.

## License

Data is published under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Cite it as “Charitology (charitology.org)”. Figures sourced from other publishers keep their sources in the data so you can cite them too.

## Why an API

Most giving decisions happen somewhere else: on donation platforms, in workplace giving portals and in advisors’ spreadsheets. An open API lets the method travel to where decisions are made, which helps the system coordinate instead of fragmenting further. See [the Fragmentation Problem](/diagnosis/fragmentation/).
