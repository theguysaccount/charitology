---
title: Public API
group: For everyone
order: 2
summary: Charitology datasets as static JSON with source dates, attribution and reuse terms. Build the Diagnosis, the interventions or the open problems into your own app or donation platform.
status: live
conditions: [fragmentation, missing-feedback-loop]
help:
  - Build something with the data and share it in an issue labeled built-with.
  - Propose a new endpoint in src/lib/api.ts.
related: [/record/open-datasets/, /tools/charity-lookup/]
---

## How it works

The API is a set of JSON files generated with the site. There are no application keys or accounts. The static host's request limits and logging policies still apply. Source dates and fixed edition identities describe the data; a build date does not establish its freshness.

## License

Charitology's schema and editorial material use [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Cite them as “Charitology (charitology.org)”. External data and documents retain their own source-specific terms, attribution and exceptions. Each response states its scope; the observations endpoints also retain individual source rights. This notice does not grant new rights in a publisher's data or financial document.

## Why an API

Most giving decisions happen somewhere else: on donation platforms, in workplace giving portals and in advisors’ spreadsheets. An open API lets the method travel to where decisions are made, which helps the system coordinate instead of fragmenting further. See [the Fragmentation Problem](/diagnosis/fragmentation/).
