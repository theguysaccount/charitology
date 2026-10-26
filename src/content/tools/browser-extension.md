---
title: Browser Extension
group: For donors
order: 4
summary: Puts the Giver’s Checklist on donation pages and one click away everywhere else, with a lookup in the open charity registries. Collects nothing.
status: live
statusNote: Live as a developer install for Chrome, Edge and Firefox. Store listings are designed but not yet submitted.
conditions: [story-bias, overhead-myth, missing-feedback-loop]
help:
  - Test it on donation sites and report problems in an issue labeled extension.
  - Help prepare the Chrome Web Store and Firefox Add-ons listings.
  - Propose a donation site to support, with its fundraiser URL pattern.
related: [/method/#checklist, /tools/charity-lookup/]
---

## Why an extension

Most giving decisions take seconds and happen on a donation page, at the moment [the Story Bias](/diagnosis/story-bias/) is strongest. The extension brings three questions to that moment: symptom or source, what would happen anyway, and how anyone would know if it worked. It doesn’t tell you not to give. It asks you to give with your eyes open.

## Privacy by construction

The extension reads the page title only to pre-fill a lookup, and the lookup opens only when you click. It makes no network requests of its own, has no analytics and stores one thing: the list of sites where you chose to hide the card. Its permissions are `activeTab`, which lets it see the current tab only when you click the icon, and `storage`. The code is short and lives in the [repository](https://github.com/theguysaccount/charitology/tree/main/extension).

## What it isn’t

It doesn’t rate charities or fundraisers, and it never blocks or changes a donation page.
