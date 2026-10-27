# Before You Give: store publication kit

Updated October 27, 2026 for candidate 0.1.2 with AI assistance. This is submission material, not a claim that either store has accepted or listed the extension.

## Packages

Run `npm ci`, then `npm run extension:zip` and `npm run check:extension`.

- Chrome Web Store: `public/downloads/charitology-chrome.zip`. The Chrome manifest omits Firefox-specific settings.
- Firefox Add-ons: `public/downloads/charitology-firefox.zip`. Firefox 140 or later; the manifest declares no data collection.
- Developer install: `public/downloads/charitology-extension.zip`.

The [0.1.2 compatibility record](EXTENSION_COMPATIBILITY.md) and generated `public/downloads/extension-release.json` contain exact current source/package hashes and test limits. Python 3 standard-library ZIP checks are included.

The source is plain JavaScript, HTML, CSS and JSON. There is no bundling, minification, remote executable code or separate source build to reproduce. The package script copies the checklist, bakes the site address into the scripts and creates reproducible ZIP archives. `npm run check:extension` validates all three archives and tests that the popup passes the suggested name in a URL fragment, outside the HTTP request.

## Listing copy

Name: **Charitology: Before You Give**

Short description: **A checklist on donation pages and a private, local charity lookup. No ratings, tracking or donation handling.**

Category: Productivity (confirm the closest category in the live store form).

Language: English.

Detailed description:

> Bring ten practical questions to your next giving decision.
>
> Before You Give puts a small, dismissible checklist on supported GoFundMe, JustGiving and Every.org pages. Three questions help you think about where a gift acts, what would happen without it and how anyone would know whether it worked.
>
> Click the toolbar icon anywhere to open the full Giver’s Checklist. The active page’s title suggests a search you can edit. Open Charitology’s local Charity Index, then choose whether to continue to a public registry.
>
> No charity ratings, donation processing, accounts or analytics. The extension remembers only the sites where you chose to hide the card. The suggested name travels in the URL fragment and is not sent to the Charitology host. If you choose an external registry search, that registry receives the name as explained on the lookup page.
>
> Charitology studies charity as a system. Depth describes where work acts; it never grades the good being done.

Homepage: https://charitology.org/tools/browser-extension/

Privacy: https://charitology.org/tools/browser-extension/privacy/

Support: https://github.com/theguysaccount/charitology/issues/new?labels=extension

Source: https://github.com/theguysaccount/charitology/tree/main/extension

## Permission explanations

- `activeTab`: suggests a lookup from the active tab’s title when the user opens the popup.
- `storage`: remembers, locally, the sites where the user hides the card.
- Content-script URL matches: displays the card on the fundraiser pages named in the manifest. It does not change the donation form or read payment data.
- No background requests, remote code, analytics, cookies, account sign-in or paid functionality.

Opening the lookup still makes an ordinary page request to GitHub Pages. The hosting provider receives ordinary request information; do not describe web navigation as producing no network traffic at all. The query itself stays in the browser because it follows `#q=`. The lookup is explicit about onward registry requests.

## Reviewer test steps

1. Load the package in a clean browser profile.
2. Open the toolbar popup. The ten questions appear; checking a box updates the count.
3. Edit the suggested name and choose Look up. Confirm the destination uses `#q=` and has no `?q=` query.
4. Confirm that the local Charity Index shows a match or an explicit no-match result, with hypotheses rather than ratings. External registries open only when chosen.
5. Open a matching supported donation page. Confirm the card appears and its close button works. It must not alter the donation form.
6. Hide the card for that site, reload and confirm it stays hidden. Check another supported site to confirm the preference is per-site.
7. Check the browser network inspector for unexpected extension background transmission.

## Publication boundary

No store URL or approval badge should be added until the store returns an actual listing. Publisher registration, verified contact information, a possible registration payment, developer agreements and store review are external steps. Do not invent identity details or accept terms on the owner’s behalf.

Opening the Chrome developer console through the available Chrome automation was denied in this session. No package was uploaded, no publisher agreement was accepted and no registration payment was made. The prepared packages can be submitted from the owner’s publisher account once access is available.

## Official publication references

- [Chrome developer registration](https://developer.chrome.com/docs/webstore/register/)
- [Chrome publication steps](https://developer.chrome.com/docs/webstore/publish)
- [Chrome image requirements](https://developer.chrome.com/docs/webstore/images)
- [Firefox submission steps](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)

## Image assets

- `public/extension-store/small-promo-440x280.png`: promotional artwork.
- `public/extension-store/marquee-1400x560.png`: promotional artwork.
- `public/extension-store/popup-screenshot-1280x800.png`: a historical 0.1.1 capture of the popup HTML/JS rendered locally, placed in a labeled presentation frame. It is a developer preview, not evidence of an installed or store-approved extension. The checklist interaction was verified in the browser.
- `public/extension-store/popup-0.1.2-developer-preview.jpg`: actual current Chrome HTML developer preview, visibly labeled as missing extension APIs and not an installed/store test. It demonstrates current appearance and recovery, not a store-approved screenshot or installed extension.
- `extension/icons/icon-128.png`: package icon.

The promo SVGs are editable and `scripts/make-extension-store-images.mjs` rebuilds the promotional PNGs. The popup screenshot is a browser capture; refresh it after UI changes. Historical 0.1.1 Firefox lint after adding the desktop/Android declarations reported **0 errors, 0 warnings, 0 notices**. That result is not a 0.1.2 lint or installed-browser check. Refresh the submission screenshot from the current installed package before store submission.
