---
title: Browser Extension
group: For donors
order: 4
summary: Puts the Giver’s Checklist on donation pages and one click away everywhere else, with a lookup in the open charity registries. Collects nothing.
status: live
statusNote: Live as a developer install for Chrome, Edge and Firefox. Store packages, listing copy and privacy documentation are prepared; store submission and approval are pending.
conditions: [story-bias, overhead-myth, missing-feedback-loop]
help:
  - Test it on donation sites and report problems in an issue labeled extension.
  - Help prepare the Chrome Web Store and Firefox Add-ons listings.
  - Propose a donation site to support, with its fundraiser URL pattern.
related: [/method/#checklist, /tools/charity-lookup/]
---

## Why an extension

The extension brings three questions to selected fundraising-site URLs: symptom or source, what would happen anyway, and how anyone would know if it worked. It offers a pause to think about the system behind a gift, including the debated effects described in [the Story Bias](/diagnosis/story-bias/).

## Privacy by construction

The extension reads the page title to suggest a lookup, and the lookup opens only when you click. The name travels after `#q=` in the address, which stays in your browser instead of entering the page request. It makes no background network requests, has no analytics and stores one thing: the sites where you chose to hide the card. Its permissions are `activeTab`, which lets the popup read the active tab when you click the icon, and `storage`. Read the [privacy notice](/tools/browser-extension/privacy/) or inspect the [source](https://github.com/theguysaccount/charitology/tree/main/extension).

## What it isn’t

It doesn’t rate charities or fundraisers. The card can be dismissed, and it does not alter the donation form or handle money.

## Exact scope and exit

The [compatibility page](/tools/browser-extension/compatibility/) lists the exact URL patterns, version, source and package checksums, tested boundaries and unverified browsers. Version 0.1.2 retains local-only title suggestions and hide settings. The toolbar limits queries to 120 characters, preserves manual text during delayed title access, and explains a failed tab opening or preference save. Developer installation is available; store acceptance is still pending.
