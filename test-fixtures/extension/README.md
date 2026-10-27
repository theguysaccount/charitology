# Extension runtime fixtures

These fixtures execute the actual `extension/popup.js` and `extension/content.js` inside Node VM contexts. They are synthetic DOM/API checks, not installed Chrome, Edge, Firefox, mobile, frame or incognito proof, nor store acceptance. No real donor page, form, payment control, identity or outbound provider is accessed.

The URL matrix is derived from the manifest’s four current exact HTTPS match patterns. It models their documented scheme, exact-host and wildcard-path behavior, with narrowly implemented Chromium source details for the current ASCII literal prefixes. The path includes the query string; the fragment is excluded. A missing explicit port follows the documented Chrome wildcard-port behavior. It does not classify a page as a fundraiser. Every path on the exact `www.justgiving.com` and `www.every.org` hosts currently matches, including account or informational paths. Browser restrictions and user permissions still govern actual injection.

Primary matching references read October 27, 2026:

- [Chrome match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns): scheme/host/path structure, exact host vs wildcard, omitted-port behavior.
- [Chromium URLPattern implementation](https://raw.githubusercontent.com/chromium/chromium/main/extensions/common/url_pattern.cc): `MatchesPath` normal percent-unescaping, raw fallback and the terminal `/*` prefix shortcut. For example, `/f` with no query and `/%66/fictional` match the current GoFundMe pattern in this Chromium source model. These cases are explicitly marked; they are not installed Firefox compatibility evidence.
- [MDN WebExtensions match patterns](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns): exact host matching, path plus query, fragments excluded and browser differences.

`url-cases.json` is a readable fixture matrix, while the checker’s matcher reads the actual manifest. Protected document/form/body/tab-URL getters throw; markup sinks and unexpected network APIs throw. Only the popup’s bundled `checklist.json` fetch is allowed. In-memory checkbox counts and host-scoped extension storage are deliberately separate from page storage.
