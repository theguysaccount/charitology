# Extension 0.1.2: compatibility and release evidence

October 27, 2026 · draft · AI-assisted

The [public compatibility page](https://charitology.org/tools/browser-extension/compatibility/) is generated from the actual release manifest. The [contract](EXTENSION_COMPATIBILITY_PLAN.md) was committed as `e2cfdb5` before runtime changes. This release preserves `activeTab` and `storage`, four exact HTTPS match patterns, title-only explicit lookup and local host hide preferences. It adds no rating, donation handling, account, analytics or background worker.

## Behavior repaired

- A delayed title response cannot replace a manually edited query. Title cleanup is consistent; the 120-unit bound retains complete Unicode pairs and replaces lone title surrogates. Invalid manual Unicode and oversized manual input fail visibly.
- Failed tab creation preserves input and offers a direct local lookup link. An input change invalidates that old link; a late failure cannot offer the earlier query under newer text. Duplicate pending submissions are ignored.
- A failed hide save leaves a notice and Close control. Concurrent initialization rechecks the host after the asynchronous storage read, preventing duplicate cards.
- The popup retains a preferred width of 360 pixels and fits a 320-pixel document. This repaired overflow found in the actual HTML preview.

## Exact package contract

The release builder accepts only the two approved HTTPS origins (`charitology.org` and `theguysaccount.github.io`) plus a bounded ordinary base path. It rejects credentials, query/fragment, HTTP, unknown origins, code-bearing text, ambiguous path segments, symlinks, unexpected files and missing/duplicate settings before replacing generated artifacts. The setting is emitted as a serialized JavaScript string literal.

Ten allowlisted entries use a deterministic stored ZIP format. Validation checks every entry, UTF-8 path, CRC32, local/central fields, size, offset, directory and exact end record. An entry is capped at one MiB and an archive at two MiB. Packages contain no remote executable code or unbaked setting. Chrome omits Firefox-only fields; the Firefox and generic developer packages retain the declared engine/data-collection fields.

`public/downloads/extension-release.json` is generated with the version, site, source-file paths/bytes/hashes, a digest of that ordered list, three package bytes/hashes, declared patterns/engines and empty store listings. It contains no wall-clock release claim. `scripts/lib/extension-release-baselines.json` retains the observed 0.1.1 baseline and the candidate 0.1.2 baseline. The builder rejects source drift under a registered version before output writes. Canonical production packages also match pinned byte hashes; an approved alternate base path has different baked package hashes and is checked against its own reproducible output. The baseline is repository review policy and an integrity check, not a signed or independently reviewed release.

Run `npm run extension:zip`, then `npm run check:extension`. The check invokes the original package/privacy check, actual-entry-point matrix, independent package acceptance and exact metadata/version check. Python 3 standard-library `zipfile` and `binascii` supply the independent archive oracle; no PyPI package is required.

## Evidence and remaining acceptance

- Actual popup/content scripts: 32 modeled URL cases and 25 synthetic privacy/recovery groups passed. Fixtures are in `test-fixtures/extension/`; protected page-body/form/tab-URL and markup/network sinks throw if inspected or called.
- Independent package checks cover actual ZIPs, CRC/header/directory mutations, exact byte limits, malformed paths, failed-build sentinel preservation, alternate base path and two isolated reproducible builds. Final aggregate counts and exact CI remain pending.
- Actual developer HTML preview, current screenshot, final 320/390 layout and ordinary local fragment handoff are in progress. It is not an installed content script or browser extension test.
- Installed Chrome/Edge/Firefox, mobile, private mode, frame injection and store approval remain unverified. The declared Firefox minimums are not new device evidence. Store identity, submission and acceptance remain owner-controlled.

The matrix derives patterns from the manifest. Chromium implementation details for `/f` without a final slash and normal percent-decoding are explicitly modeled; they are not assumed Firefox evidence. Every path on the exact JustGiving/Every.org hosts matches, including informational/account pages. No fundraiser classifier or SPA reinjection listener exists. See [fixture references and limits](../test-fixtures/extension/README.md).

No live donation page, payment control, personal record or external registry submission is used by these checks. Earlier 0.1.1 screenshot/lint evidence remains historical; it cannot establish 0.1.2 installed-browser or store acceptance.
