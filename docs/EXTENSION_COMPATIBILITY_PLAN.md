# Extension compatibility and release plan

E1 implementation contract · October 27, 2026 · review: draft · AI-assisted

This plan extends the existing browser extension with a tested supported-URL/privacy matrix, strict reproducible packaging and an exact release manifest. It does not add charity ratings, donation handling, background page scanning or store acceptance. The original 0.1.1 source and package hashes below are the inspected baseline. Runtime or packaging behavior changes require a new version and new hashes.

The existing package checker passed against all three current downloads. That is code/package evidence; installed-browser and store acceptance remain separate. Read `HANDOFF.md` and `STYLE.md`. Preserve `activeTab` and `storage` as the only declared permissions. Provider, publisher-account and store submission setup is outside this software slice.

## E1: actual files and supported boundary

| Existing source | Contract |
| --- | --- |
| `extension/manifest.json` | Manifest V3, version 0.1.1, permissions exactly `activeTab` and `storage`; no background worker. Firefox desktop minimum 140, Android minimum 142 are declarations, not newly verified browser runs. Chrome/Edge have no explicit minimum in this manifest. |
| `extension/content.js` | One dismissible three-question card in a closed shadow root, initial `document_idle` injection; no duplicate host ID. Reads title only on the lookup click. Hide preference is extension-local key `hidden:${location.hostname}`. Failure to save hides for the present document only. |
| `extension/popup.html`, `popup.js`, `popup.css` | Ten bundled checklist questions, transient checked count, active-tab title read only when popup opens, editable query, explicit new-tab lookup. No checklist/search persistence. |
| `scripts/zip-extension.mjs` | Refreshes bundled checklist from `src/data/checklist.json`, bakes `SITE_URL`+`BASE_PATH`, writes deterministic stored ZIPs with fixed DOS timestamp. Chrome omits Firefox fields; generic and Firefox packages retain them. |
| `scripts/check-extension.mjs` | Checks manifest/version/permissions/file presence, syntax and popup Unicode fragment behavior. It does not yet verify every content-card branch, installed-browser behavior or full ZIP CRC/central-directory integrity. |
| `docs/extension-store-listing.md`, `public/extension-store/*` | Prepared listing/privacy/permission copy, promo PNG/SVG and an actual locally rendered popup screenshot in a labeled preview frame. This is not evidence of an installed/store-approved extension. |
| `src/pages/tools/browser-extension/privacy.astro`, tool content | Privacy applies to 0.1.1, distinguishes local fragment from HTTP navigation and notes older 0.1.0 used a query. Preserve that history. |
| `src/components/tools/charity-lookup.astro`, `src/components/RegistrySearch.astro` | Fragment prefill is local. Editorial lookup accepts 160 characters; IRS widget accepts 120 and fetches public static shards only after explicit submission. External registry handoffs are separately chosen. Neither a title nor registry match is verified legal identity or an impact rating. |

### Exact pattern matrix

Derive the machine-readable matrix from the manifest and test its browser match semantics rather than maintaining a second permissive host list.

| URL class | Initial content-card expectation |
| --- | --- |
| `https://www.gofundme.com/f/*`, `https://gofundme.com/f/*` | Matches those exact host/path patterns; query/fragment fixtures must not create a broader host/path rule. |
| `https://www.justgiving.com/*` | Every path on this exact host matches, including informational/account pages. It is not a donation-page classifier. |
| `https://www.every.org/*` | Every path on this exact host matches. It is not a donation-page classifier. |
| HTTP, other hosts/subdomains, `every.org`, `justgiving.com`, unrelated GoFundMe paths, suffix lookalikes | No content-script match. Toolbar checklist may still work when the browser permits popup access. |
| Browser-internal/restricted pages, file URLs, denied `activeTab`, missing title | No injection promise; popup must remain useful with manual input or show a bounded error. |
| Single-page navigation without document reload | Current code has no route listener or reinjection contract. Document this limitation and test both directions; do not call it automatic fundraiser detection. New SPA support is deferred unless a concrete defect makes it necessary. |
| Frames, private/incognito mode, mobile Firefox | No added coverage claim without an exact installed-browser test/configuration record. Default manifest behavior and user permission still govern. |

Do not fetch or inspect a donation form to decide eligibility. No amounts, payment controls, credentials, beneficiary text, cookies, page body or tab URL may become lookup data. A page can remove/collide with the card host; a closed shadow root isolates presentation, not a security boundary against the host page.

### Concrete E1 implementation

Add a small side-effect-free URL/title/site-setting helper only if it reduces duplicated popup/content behavior without a bundler or broader permissions. Proposed `extension/shared.js` loaded before each entry point, with a narrow global namespace; preserve the 0.1.1 baseline separately and bump package version if runtime behavior changes. Alternatively keep entry points and test them directly if a new shared file is unnecessary.

1. Add `test-fixtures/extension/*` and extend `scripts/check-extension.mjs` (or a new `scripts/check-extension-matrix.mjs`) to execute actual popup and content scripts in bounded synthetic DOM/API fixtures. Read-only sentinels throw if protected form/body/tab-URL fields are inspected. Assert no outbound `fetch`, XHR, beacon, socket or remote script; popup's sole fetch is bundled `checklist.json`.
2. Validate packaging inputs: release site must be an approved HTTPS origin plus bounded normalized base path, with no credentials/query/fragment/control characters or code-bearing quotes. Local HTTP is explicit development-only. Bake a parsed literal using proper JS string serialization, not raw environment text substitution. Reject bad inputs before any output file changes. Tests cover the current raw-placeholder injection surface without shipping an exploit or treating arbitrary environment strings as trusted code.
3. Bound manual query consistently with the 120-character title/IRS handoff or explicitly document a 160-character editorial cap; recommended 120 for both extension paths. Do not silently send a partial query to an external registry. Trim/encode as fragment, leave HTTP query empty, preserve Unicode, quotes, ampersands, percent, slash, `#`, `?`, emoji and explicit empty input. HTML-looking titles render as text, never `innerHTML`. Title cleanup differences (`Fundraiser by` currently only in content) need explicit expected cases before choosing an alignment.
4. Recover predictably from denied tab access, missing API, failed bundled checklist read, rejected new-tab opening and failed storage read/write. Do not claim a hide setting persisted after failure. No automatic lookup/retry/network fallback; checklist usability and editable input remain available.
5. Strengthen ZIP validation: exact allowlisted files, entry count, source/package manifest versions, CRC32, local/central header consistency, offsets/sizes, EOCD, UTF-8 names, no duplicate/path traversal/absolute/hidden/unexpected source file, no remote code or unbaked placeholder. Reproduce twice with identical inputs; hash all bytes. A same-version artifact drift fails the baseline check until an explicitly reviewed version update.
6. Add `docs/EXTENSION_COMPATIBILITY.md` and a release manifest such as `public/downloads/extension-release.json`: extension version, per-package bytes/SHA-256, checklist hash, supported patterns, declared engine minimums and separate executed test rows. Each installed-browser row must name exact browser/version/OS/package hash, scenario/date/result; unexecuted rows say unverified. ZIP creation or Firefox lint success is not installed-browser proof.

No store upload, publisher identity, agreement acceptance, payment or approval claim occurs in E1 code. Actual store publication remains an owner-controlled external step using the existing kit; add a listing URL only after actual acceptance. Update screenshots only from the actual new popup, labeled as developer preview until an installed build is captured. Do not draw fake third-party fundraiser screenshots or approvals.

### Observed 0.1.1 hashes

These are read-only working-tree/package observations, not a signed release or proof of store delivery. Re-evaluate on the implementation branch; do not regenerate merely to make the baseline match.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `extension/manifest.json` | 1,279 | `4ea688a32038c214560db50b5694f01d30c02603f467a9fc1a4fe26df2921701` |
| `extension/content.js` | 5,439 | `479088feab7c948c203ccca4f1e503b9186eb0eeb3488d36741d88e819d69da7` |
| `extension/popup.js` | 2,311 | `e6bb7b2bb6315a2269f83ca57da2079effce2a4fb937ddd8d69a12ce9b34011b` |
| `extension/checklist.json` | 1,667 | `de21172fd6584645c8171fc7bfa267f11331b624bc7778d329e71cc10f084713` |
| `charitology-extension.zip` | 28,283 | `32491b8823e335f6886b961f74ad8d37d52b7709c5548b40fb6a9124351c54b1` |
| `charitology-chrome.zip` | 28,026 | `08c16ff2a095480c59c5551e7ecf2e5826bd956c6c9fdebd09354105ceff904f` |
| `charitology-firefox.zip` | 28,283 | `32491b8823e335f6886b961f74ad8d37d52b7709c5548b40fb6a9124351c54b1` |

### E1 meaningful acceptance

- Exact positive/negative URL cases, Unicode/escaping/empty/oversized query, title cleanup, no pre-click lookup and no HTTP query title; return links preserve configured base path without an open redirect.
- Content card appears once, three questions, keyboard close/hide, per-host hide isolation; failed hide is visibly/nonpersistently handled; protected donor-form sentinels unchanged/unread. Repeated initialization and late async storage read cannot create duplicate cards.
- Popup ten questions/count correct and transient; denied activeTab/file/restricted pages permit manual input; failed tab creation leaves an actionable message rather than pretending navigation succeeded.
- Corrupt/malicious ZIP, CRC/offset mismatch, unexpected file, bad environment/base path and same-version drift fail before replacing release artifacts. Reproducible packages/manifest/source hashes match exact tested bytes.
- Controlled installed-browser checks on synthetic/nontransactional fixtures, network observation, narrow popup/keyboard and actual lookup fragment/prefill. Record each exact browser version; do not replace absent Firefox/Edge/mobile evidence with a Chrome run. Stores remain unlisted until actual owner submission/acceptance.

## Commit and acceptance sequence

1. Publish this contract before changing extension runtime or package generation. Retain the inspected 0.1.1 hashes as historical evidence.
2. Implement actual-entry-point fixtures, strict package destination validation and full ZIP validation. Any concrete runtime or packaging fix ships as 0.1.2 with updated privacy/listing copy; do not silently replace 0.1.1 artifacts with different behavior.
3. Add the release manifest and compatibility guide, integrate the matrix into `npm run check`, and verify two identical independent package builds. CI rejects stale release metadata.
4. Complete controlled Chrome/developer-preview checks and record exact limitations for Firefox, Edge, mobile and installed/store environments. Neither synthetic DOM nor a rendered popup fixture establishes installed extension behavior.

No public store URL is invented. Owner submission and actual review remain visible operating gates.
